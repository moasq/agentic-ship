import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadConnectionCatalog } from "../connections/catalog.mjs";
import { resolveProviderSelection } from "../provider-selection.mjs";
import { resolveCloudflareConvexBuild, runCloudflareConvexBuild } from "../../build-cloudflare.mjs";
import { verifyCloudflareLiveEnvironment } from "../connections/cloudflare-live.mjs";
import {
  bindCloudflareEnvironmentVariables,
  CLOUDFLARE_ADAPTER,
  CLOUDFLARE_AUTH_ENV,
  CLOUDFLARE_LOGIN_ARGS,
  cloudflareCommandExecution,
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
      "build:cloudflare": "node scripts/build-cloudflare.mjs",
      "check:cloudflare-build": "node scripts/build-cloudflare.mjs --dry-run",
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
    expect(cloudflare.projectProvisioning.verification.probes).toEqual([
      {
        id: "cloudflare-blueprint",
        label: "Cloudflare deployment blueprint is valid",
        type: "cloudflare_blueprint",
        required: true,
      },
    ]);
  });
});

describe("Wrangler authentication", () => {
  it("forces keyring storage on every platform", () => {
    expect(CLOUDFLARE_LOGIN_ARGS).toEqual(["login", "--use-keyring"]);
    expect(CLOUDFLARE_AUTH_ENV).toEqual({ CLOUDFLARE_AUTH_USE_KEYRING: "true" });
    const source = readFileSync(resolve(repositoryRoot, "scripts/provider-login.mjs"), "utf8");
    expect(source).toContain("environment: cloudflareExecution.environment");
    expect(source).toContain("env: { ...process.env, ...(provider.environment ?? {}) }");
    expect(["darwin", "linux", "win32"].map((platform) => cloudflareCommandExecution(platform))).toEqual([
      { login: ["wrangler", "login", "--use-keyring"], environment: CLOUDFLARE_AUTH_ENV, shell: false },
      { login: ["wrangler", "login", "--use-keyring"], environment: CLOUDFLARE_AUTH_ENV, shell: false },
      { login: ["wrangler", "login", "--use-keyring"], environment: CLOUDFLARE_AUTH_ENV, shell: true },
    ]);
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

  it("remotely verifies API tokens against the explicitly selected account without returning the token", () => {
    const token = "A".repeat(40);
    const calls = [];
    const result = discoverCloudflareCredentials({
      env: { CLOUDFLARE_API_TOKEN: token, CLOUDFLARE_ACCOUNT_ID: accountId },
      commandRunner(command, args, options) {
        calls.push([command, args, options.env.CLOUDFLARE_ACCOUNT_ID]);
        return { status: 0, stdout: `You are logged in with an API Token\n│ Selected │ ${accountId} │` };
      },
    });
    expect(result.authenticated).toBe(true);
    expect(calls).toEqual([["wrangler", ["whoami"], accountId]]);
    expect(JSON.stringify(result)).not.toContain(token);
  });

  it("rejects invalid, revoked, and wrong-account API tokens", () => {
    const env = { CLOUDFLARE_API_TOKEN: "A".repeat(40), CLOUDFLARE_ACCOUNT_ID: accountId };
    expect(discoverCloudflareCredentials({ env }).authenticated).toBe(false);
    expect(discoverCloudflareCredentials({ env, commandRunner: () => ({ status: 1 }) }).authenticated).toBe(false);
    const wrongAccount = discoverCloudflareCredentials({
      env,
      commandRunner: () => ({ status: 0, stdout: "You are logged in\n│ Other │ fedcba9876543210fedcba9876543210 │" }),
    });
    expect(wrongAccount.authenticated).toBe(false);
    expect(wrongAccount.error).toMatch(/selected account/);
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
    expect(pkg.scripts["build:cloudflare"]).toBe("node scripts/build-cloudflare.mjs");
    expect(pkg.scripts["check:cloudflare-build"]).toBe("node scripts/build-cloudflare.mjs --dry-run");
  });
});

describe("Cloudflare Convex build selection", () => {
  it("uses separate production and preview deploy keys", () => {
    const production = resolveCloudflareConvexBuild({
      WORKERS_CI_BRANCH: "main",
      CLOUDFLARE_PRODUCTION_BRANCH: "main",
      CONVEX_PROD_DEPLOY_KEY: "prod-key",
      CONVEX_PREVIEW_DEPLOY_KEY: "preview-key",
    });
    expect(production.preview).toBe(false);
    expect(production.args).not.toContain("--preview-name");
    expect(production.env.CONVEX_DEPLOY_KEY).toBe("prod-key");

    const preview = resolveCloudflareConvexBuild({
      WORKERS_CI_BRANCH: "Feature/Cloudflare Preview",
      CLOUDFLARE_PRODUCTION_BRANCH: "main",
      CONVEX_PROD_DEPLOY_KEY: "prod-key",
      CONVEX_PREVIEW_DEPLOY_KEY: "preview-key",
    });
    expect(preview.preview).toBe(true);
    expect(preview.args).toContain("--preview-name");
    expect(preview.args).toContain("feature-cloudflare-preview");
    expect(preview.env.CONVEX_DEPLOY_KEY).toBe("preview-key");
    expect(resolveCloudflareConvexBuild({
      WORKERS_CI_BRANCH: "main",
      CLOUDFLARE_PRODUCTION_BRANCH: "main",
      CONVEX_PROD_DEPLOY_KEY: "prod-key",
    }, { dryRun: true }).args).toContain("--dry-run");
  });

  it("fails closed when branch identity or the selected deploy key is missing", () => {
    expect(() => resolveCloudflareConvexBuild({})).toThrow(/WORKERS_CI_BRANCH/);
    expect(() => resolveCloudflareConvexBuild({ WORKERS_CI_BRANCH: "main", CLOUDFLARE_PRODUCTION_BRANCH: "main" })).toThrow(/CONVEX_PROD_DEPLOY_KEY/);
    expect(() => resolveCloudflareConvexBuild({ WORKERS_CI_BRANCH: "feature", CLOUDFLARE_PRODUCTION_BRANCH: "main" })).toThrow(/CONVEX_PREVIEW_DEPLOY_KEY/);
  });

  it.each([
    ["darwin", "npx"],
    ["linux", "npx"],
    ["win32", "npx.cmd"],
  ])("executes the same dry-run contract on %s", (platform, executable) => {
    const calls = [];
    const result = runCloudflareConvexBuild({
      platform,
      dryRun: true,
      env: {
        WORKERS_CI_BRANCH: "feature",
        CLOUDFLARE_PRODUCTION_BRANCH: "main",
        CONVEX_PREVIEW_DEPLOY_KEY: "preview-key",
      },
      spawn(command, args, options) {
        calls.push({ command, args, deployKey: options.env.CONVEX_DEPLOY_KEY });
        return { status: 0 };
      },
    });
    expect(result.status).toBe(0);
    expect(calls).toEqual([{
      command: executable,
      args: ["convex", "deploy", "--dry-run", "--preview-name", "feature", "--cmd", "pnpm build:vinext"],
      deployKey: "preview-key",
    }]);
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

describe("Cloudflare live acceptance", () => {
  const deploymentJson = JSON.stringify([
    {
      id: "182bd5e5-6e1a-4fe4-a799-aa6d9a6ab26e",
      created_on: "2026-08-29T09:00:00.000Z",
      versions: [{ percentage: 100, version_id: "095f00a7-23a7-43b7-a227-e4c97cab5f22" }],
    },
  ]);
  const liveEnv = {
    CLOUDFLARE_PRODUCTION_URL: "https://product.example",
    CLOUDFLARE_PREVIEW_URL: "https://preview-agentic-app.team.workers.dev",
    CLOUDFLARE_AUTH_CALLBACK_URL: "https://product.example/api/auth/callback/google",
    NEXT_PUBLIC_CONVEX_URL: "https://happy-otter-123.convex.cloud",
    CLOUDFLARE_CONVEX_HEALTH_QUERY: "health:check",
    CLOUDFLARE_WEBHOOK_URLS: "https://happy-otter-123.convex.site/stripe/webhook,https://happy-otter-123.convex.site/resend-webhook",
  };

  it("verifies a current deployment, both origins, auth, Convex, and webhooks", async () => {
    const requests = [];
    const result = await verifyCloudflareLiveEnvironment({
      config: { name: "agentic-app" },
      configPath: "wrangler.json",
      env: liveEnv,
      commandRunner(command, args) {
        expect([command, args]).toEqual(["wrangler", ["deployments", "list", "--json", "--name", "agentic-app", "--config", "wrangler.json"]]);
        return { status: 0, stdout: deploymentJson };
      },
      async fetchImpl(url, init) {
        requests.push([String(url), init.method ?? "GET"]);
        if (String(url).endsWith("/api/query")) return { status: 200, json: async () => ({ status: "success", value: true }) };
        if (String(url).includes("/api/auth/callback/")) return { status: 302, json: async () => null };
        return { status: 200, json: async () => null };
      },
    });
    expect(result).toMatchObject({ productionOrigin: "https://product.example", webhookCount: 2 });
    expect(requests).toContainEqual(["https://product.example/api/auth/get-session", "GET"]);
    expect(requests).toContainEqual(["https://happy-otter-123.convex.cloud/api/query", "POST"]);
    expect(requests.filter(([, method]) => method === "OPTIONS")).toHaveLength(2);
  });

  it("rejects missing live evidence and false endpoint success", async () => {
    await expect(
      verifyCloudflareLiveEnvironment({
        config: { name: "agentic-app" },
        configPath: "wrangler.json",
        env: { ...liveEnv, CLOUDFLARE_PRODUCTION_URL: "https://agentic-app.workers.dev" },
        commandRunner: () => ({ status: 0, stdout: deploymentJson }),
        fetchImpl: async () => ({ status: 200, json: async () => ({ status: "success" }) }),
      }),
    ).rejects.toThrow(/custom domain/);

    await expect(
      verifyCloudflareLiveEnvironment({
        config: { name: "agentic-app" },
        configPath: "wrangler.json",
        env: liveEnv,
        commandRunner: () => ({ status: 0, stdout: "[]" }),
        fetchImpl: async () => ({ status: 200, json: async () => ({ status: "success" }) }),
      }),
    ).rejects.toThrow(/no readable production deployment/);
  });

  it.each(["[]", "{", "Wrangler warning only"])("rejects deployment output %s", async (stdout) => {
    await expect(
      verifyCloudflareLiveEnvironment({
        config: { name: "agentic-app" },
        configPath: "wrangler.json",
        env: liveEnv,
        commandRunner: () => ({ status: 0, stdout }),
        fetchImpl: async () => ({ status: 200, json: async () => ({ status: "success" }) }),
      }),
    ).rejects.toThrow(/no readable production deployment/);
  });

  it("rejects a preview URL for another Worker or the base Worker", async () => {
    for (const preview of ["https://preview-other-worker.team.workers.dev", "https://agentic-app.team.workers.dev"]) {
      await expect(
        verifyCloudflareLiveEnvironment({
          config: { name: "agentic-app" },
          configPath: "wrangler.json",
          env: { ...liveEnv, CLOUDFLARE_PREVIEW_URL: preview },
          commandRunner: () => ({ status: 0, stdout: deploymentJson }),
          fetchImpl: async () => ({ status: 200, json: async () => ({ status: "success" }) }),
        }),
      ).rejects.toThrow(/selected Worker/);
    }
  });
});
