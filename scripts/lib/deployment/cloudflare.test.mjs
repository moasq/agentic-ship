import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadConnectionCatalog } from "../connections/catalog.mjs";
import { resolveProviderSelection } from "../provider-selection.mjs";
import {
  bindCloudflareEnvironmentVariables,
  CLOUDFLARE_ADAPTER,
  CLOUDFLARE_AUTH_ENV,
  CLOUDFLARE_LOGIN_ARGS,
  discoverCloudflareCredentials,
  generateWranglerConfig,
  inspectCloudflareBlueprint,
  parseWranglerWhoami,
  resolveBetterAuthCloudflareOrigins,
  revokeCloudflareCredentials,
  validateCloudflareAccountId,
  validateCloudflareProjectName,
  verifyConvexCloudflareConnectivity,
} from "./cloudflare.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const accountId = "0123456789abcdef0123456789abcdef";

function fixturePackage(overrides = {}) {
  return JSON.stringify({
    dependencies: {
      vinext: CLOUDFLARE_ADAPTER.frameworkVersion,
      "@vinext/cloudflare": CLOUDFLARE_ADAPTER.deploymentVersion,
    },
    scripts: {
      "build:vinext": "vinext build",
      "build:cloudflare": "npx convex deploy --cmd 'pnpm build:vinext'",
      "deploy:cloudflare": "vinext-cloudflare deploy --skip-build --config dist/server/wrangler.json",
      "preview:cloudflare": "wrangler versions upload --config dist/server/wrangler.json",
    },
    ...overrides,
  });
}

function fixtureConfig(overrides = {}) {
  return JSON.stringify({
    name: "agentic-app",
    account_id: accountId,
    main: "dist/server/index.js",
    compatibility_date: "2026-08-29",
    compatibility_flags: ["nodejs_compat"],
    ...overrides,
  });
}

function inspect(config = fixtureConfig(), pkg = fixturePackage(), path = "wrangler.jsonc") {
  return inspectCloudflareBlueprint({ configSources: [{ path, source: config }], packageJsonSource: pkg });
}

describe("Cloudflare provider selection", () => {
  it("keeps Netlify as default and selects Cloudflare explicitly", () => {
    expect(resolveProviderSelection({}).deployment).toBe("netlify");
    expect(resolveProviderSelection({ deployment: "cloudflare" }).deployment).toBe("cloudflare");
  });

  it("registers protected auth, exact adapter pins, and account-aware decisions", () => {
    const cloudflare = loadConnectionCatalog({ projectRoot: repositoryRoot }).providers.cloudflare;
    expect(cloudflare.agentTool.configurationProbe).toEqual({
      id: "cloudflare-cli-paired",
      label: "Wrangler CLI is authenticated",
      type: "command_succeeds",
      command: "node",
      args: ["scripts/check-cloudflare-auth.mjs"],
      required: true,
    });
    for (const option of cloudflare.projectProvisioning.automation.decision.options) {
      expect(option.placeholders).toEqual(["account-id", "project-name"]);
      expect(option.run.some((step) => step.command.includes(`vinext@${CLOUDFLARE_ADAPTER.frameworkVersion} check`))).toBe(true);
      expect(option.run.some((step) => step.command.includes("pnpm setup:cloudflare --account-id {account-id}"))).toBe(true);
    }
  });
});

describe("Wrangler authentication", () => {
  it("forces keyring storage on every platform", () => {
    expect(CLOUDFLARE_LOGIN_ARGS).toEqual(["login", "--use-keyring"]);
    expect(CLOUDFLARE_AUTH_ENV).toEqual({ CLOUDFLARE_AUTH_USE_KEYRING: "true" });
    const source = readFileSync(resolve(repositoryRoot, "scripts/provider-login.mjs"), "utf8");
    expect(source).toContain("environment: CLOUDFLARE_AUTH_ENV");
    expect(source).toContain("env: { ...process.env, ...(provider.environment ?? {}) }");
  });

  it("accepts encrypted OAuth output and parses all accounts", () => {
    const output = `
      You are logged in with an OAuth Token, associated with the email user@example.com.
      Credentials are stored in: Encrypted file (~/.config/.wrangler/config/default.enc) with key in macOS Keychain
      │ Production │ ${accountId} │
      │ Staging │ fedcba9876543210fedcba9876543210 │
    `;
    const parsed = parseWranglerWhoami(output);
    expect(parsed.authenticated).toBe(true);
    expect(parsed.encryptedStorage).toBe(true);
    expect(parsed.accounts).toHaveLength(2);
  });

  it("rejects plaintext OAuth storage and an API token without an account", () => {
    const plaintext = discoverCloudflareCredentials({
      env: {},
      commandRunner: () => ({ status: 0, stdout: `You are logged in\n│ Team │ ${accountId} │` }),
    });
    expect(plaintext.authenticated).toBe(false);
    expect(plaintext.error).toMatch(/not protected/);

    const incompleteToken = discoverCloudflareCredentials({ env: { CLOUDFLARE_API_TOKEN: "A".repeat(40) } });
    expect(incompleteToken.authenticated).toBe(false);
    expect(incompleteToken.error).toMatch(/account ID/);
  });

  it("never returns the API token", () => {
    const token = "A".repeat(40);
    const result = discoverCloudflareCredentials({ env: { CLOUDFLARE_API_TOKEN: token, CLOUDFLARE_ACCOUNT_ID: accountId } });
    expect(result.authenticated).toBe(true);
    expect(JSON.stringify(result)).not.toContain(token);
  });

  it("reports a failed logout as not revoked", () => {
    expect(revokeCloudflareCredentials({ commandRunner: () => ({ status: 1 }) }).revoked).toBe(false);
    expect(revokeCloudflareCredentials({ commandRunner: () => ({ status: 0 }) }).revoked).toBe(true);
  });
});

describe("Cloudflare account and project configuration", () => {
  it("rejects ambiguous Worker names and invalid account IDs", () => {
    for (const name of ["app_frontend", "app-", "-app", "UPPERCASE", "a".repeat(64)]) {
      expect(validateCloudflareProjectName(name).valid).toBe(false);
    }
    expect(validateCloudflareProjectName("app-frontend").valid).toBe(true);
    expect(validateCloudflareAccountId(accountId).valid).toBe(true);
    expect(validateCloudflareAccountId("abc").valid).toBe(false);
  });

  it("generates a config with explicit account and project selection", () => {
    const config = generateWranglerConfig({ projectName: "agentic-app", accountId, compatibilityDate: "2026-08-29" });
    expect(config.name).toBe("agentic-app");
    expect(config.account_id).toBe(accountId);
    expect(config.compatibility_flags).toContain("nodejs_compat");
  });

  it("updates a downstream JSONC fixture without recursive scripts", () => {
    const root = mkdtempSync(join(tmpdir(), "agentic-ship-cloudflare-"));
    writeFileSync(join(root, "wrangler.jsonc"), '{\n// generated by vinext\n"name":"old","main":"dist/server/index.js","compatibility_date":"2026-08-29"\n}\n');
    writeFileSync(join(root, "package.json"), JSON.stringify({ dependencies: { next: "16.1.0" }, scripts: { "build:vinext": "vinext build" } }));
    const run = spawnSync(
      process.execPath,
      [resolve(repositoryRoot, "scripts/setup-cloudflare.mjs"), "--account-id", accountId, "--project-name", "agentic-app"],
      { cwd: root, encoding: "utf8" },
    );
    expect(run.status, run.stderr).toBe(0);
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    const config = JSON.parse(readFileSync(join(root, "wrangler.jsonc"), "utf8"));
    expect(config).toMatchObject({ name: "agentic-app", account_id: accountId });
    expect(pkg.dependencies.vinext).toBe(CLOUDFLARE_ADAPTER.frameworkVersion);
    expect(pkg.dependencies["@vinext/cloudflare"]).toBe(CLOUDFLARE_ADAPTER.deploymentVersion);
    expect(pkg.scripts["build:cloudflare"]).toBe("npx convex deploy --cmd 'pnpm build:vinext'");
    expect(pkg.scripts["build:cloudflare"]).not.toContain("pnpm build'");
  });
});

describe("Cloudflare preflight", () => {
  it("passes an explicit, pinned, Convex-first vinext fixture", () => {
    expect(inspect().status).toBe("PASS");
  });

  it("rejects comments, unrelated fields, recursive scripts, and malformed data", () => {
    expect(inspect("# convex deploy", fixturePackage(), "wrangler.toml").status).toBe("FAIL");
    expect(inspect(fixtureConfig(), JSON.stringify({ description: "convex deploy" })).status).toBe("FAIL");
    const recursive = JSON.parse(fixturePackage());
    recursive.scripts["build:cloudflare"] = "npx convex deploy --cmd 'pnpm build:cloudflare'";
    expect(inspect(fixtureConfig(), JSON.stringify(recursive)).status).toBe("FAIL");
    expect(inspect("{", fixturePackage()).status).toBe("FAIL");
    expect(inspect(fixtureConfig(), "{").status).toBe("FAIL");
  });

  it("rejects missing pins, account selection, and adapter drift", () => {
    expect(inspect(fixtureConfig({ account_id: undefined })).status).toBe("FAIL");
    const unpinned = JSON.parse(fixturePackage());
    unpinned.dependencies.vinext = "^1.0.0-beta.8";
    expect(inspect(fixtureConfig(), JSON.stringify(unpinned)).status).toBe("FAIL");
    const wrongDeploy = JSON.parse(fixturePackage());
    wrongDeploy.scripts["deploy:cloudflare"] = "wrangler deploy";
    expect(inspect(fixtureConfig(), JSON.stringify(wrongDeploy)).status).toBe("FAIL");
  });

  it("rejects duplicate Wrangler files and runtime backend secrets", () => {
    const duplicate = inspectCloudflareBlueprint({
      configSources: [
        { path: "wrangler.json", source: fixtureConfig() },
        { path: "wrangler.jsonc", source: fixtureConfig() },
      ],
      packageJsonSource: fixturePackage(),
    });
    expect(duplicate.status).toBe("FAIL");
    expect(inspect(fixtureConfig({ vars: { CONVEX_DEPLOY_KEY: "not-a-real-key" } })).status).toBe("FAIL");
  });
});

describe("Cloudflare runtime seams", () => {
  it("keeps backend secrets out of Worker vars", () => {
    expect(() => bindCloudflareEnvironmentVariables({ publicVars: { BETTER_AUTH_SECRET: "not-a-real-secret" } })).toThrow(/runtime variable/);
  });

  it("requires an account subdomain for workers.dev origins", () => {
    const incomplete = resolveBetterAuthCloudflareOrigins({ workerName: "agentic-app", production: true });
    expect(incomplete.siteUrl).toBe("");
    const complete = resolveBetterAuthCloudflareOrigins({ workerName: "agentic-app", accountSubdomain: "team", production: true });
    expect(complete.siteUrl).toBe("https://agentic-app.team.workers.dev");
  });

  it("accepts only HTTPS Convex deployment URLs", () => {
    expect(verifyConvexCloudflareConnectivity({ convexUrl: "https://happy-otter-123.convex.cloud" }).valid).toBe(true);
    expect(verifyConvexCloudflareConnectivity({ convexUrl: "http://happy-otter-123.convex.cloud" }).valid).toBe(false);
  });
});
