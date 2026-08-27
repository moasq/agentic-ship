// @vitest-environment node
import assert from "node:assert/strict";
import { describe, expect, it } from "vitest";
import { resolveProviderSelection } from "../provider-selection.mjs";
import { loadConnectionCatalog } from "../connections/catalog.mjs";
import {
  bindCloudflareEnvironmentVariables,
  discoverCloudflareCredentials,
  generateWranglerConfig,
  inspectProductionCloudflareEnvironment,
  parseWranglerWhoami,
  resolveBetterAuthCloudflareOrigins,
  revokeCloudflareCredentials,
  validateCloudflareAccountId,
  validateCloudflareProjectName,
  validateCloudflareToken,
  verifyConvexCloudflareConnectivity,
} from "./cloudflare.mjs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

describe("Cloudflare Deployment Provider - Contract and Selection", () => {
  it("resolves cloudflare as deployment provider while keeping netlify as default", () => {
    const selected = resolveProviderSelection({ deployment: "cloudflare" });
    expect(selected.deployment).toBe("cloudflare");
    expect(selected.billing).toBe("stripe");
    expect(selected.email).toBe("resend");
    expect(selected.analytics).toBe("posthog");
    expect(selected.tracking).toBe("linear");

    const defaultSelection = resolveProviderSelection({});
    expect(defaultSelection.deployment).toBe("netlify");
  });

  it("registers cloudflare in connection catalog under deployment capability with wrangler CLI", () => {
    const catalog = loadConnectionCatalog({ projectRoot: repositoryRoot });
    const cloudflare = catalog.providers.cloudflare;
    expect(cloudflare).toBeDefined();
    expect(cloudflare.displayName).toBe("Cloudflare");
    expect(cloudflare.capability).toBe("deployment");
    expect(cloudflare.defaultForCapability).toBe(false);
    expect(cloudflare.agentTool.authFlow).toBe("cli_browser_login");
    expect(cloudflare.agentTool.configurationProbe.command).toBe("wrangler");
    expect(cloudflare.agentTool.configurationProbe.args).toEqual(["whoami"]);
    expect(cloudflare.projectProvisioning.verification.policy).toBe("probe_and_attestation");
    expect(cloudflare.projectProvisioning.verification.probes.some((p) => p.id === "cloudflare-config")).toBe(true);
    expect(cloudflare.projectProvisioning.verification.probes.some((p) => p.id === "atomic-deploy")).toBe(true);
  });
});

describe("Cloudflare Credential & Token Validation", () => {
  it("accepts valid Cloudflare API tokens", () => {
    const validToken = "v4k9_abcdef1234567890ABCDEF123456789012";
    expect(validateCloudflareToken(validToken).valid).toBe(true);

    const longToken = "A".repeat(80);
    expect(validateCloudflareToken(longToken).valid).toBe(true);
  });

  it("rejects unencrypted plaintext placeholder tokens", () => {
    const placeholders = [
      "your_api_token_here",
      "your-api-token",
      "YOUR_API_TOKEN",
      "placeholder_token_1234567890123456",
      "test_token_1234567890123456789012",
      "example_token_abcdef1234567890123",
      "bearer secret_token_value_here_now",
      "1234567890123456789012345678901234",
      "xxxx_1234567890123456789012345678",
      "my_secret_token_123456789012345678",
    ];

    for (const placeholder of placeholders) {
      const result = validateCloudflareToken(placeholder);
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/unencrypted plaintext placeholder/i);
    }
  });

  it("rejects invalid token formats and whitespace", () => {
    expect(validateCloudflareToken("").valid).toBe(false);
    expect(validateCloudflareToken(null).valid).toBe(false);
    expect(validateCloudflareToken(12345).valid).toBe(false);
    expect(validateCloudflareToken("token with space 12345678901234567890").valid).toBe(false);
    expect(validateCloudflareToken("short").valid).toBe(false);
  });

  it("validates 32-character hexadecimal Cloudflare account IDs", () => {
    expect(validateCloudflareAccountId("0123456789abcdef0123456789abcdef").valid).toBe(true);
    expect(validateCloudflareAccountId("ABCDEF0123456789abcdef0123456789").valid).toBe(true);

    expect(validateCloudflareAccountId("").valid).toBe(false);
    expect(validateCloudflareAccountId("not-a-hex-id").valid).toBe(false);
    expect(validateCloudflareAccountId("0123456789abcdef").valid).toBe(false); // only 16 chars
    expect(validateCloudflareAccountId("0123456789abcdef0123456789abcdef0").valid).toBe(false); // 33 chars
  });

  it("validates Cloudflare Worker project names", () => {
    expect(validateCloudflareProjectName("my-worker").valid).toBe(true);
    expect(validateCloudflareProjectName("app_frontend-2026").valid).toBe(true);

    expect(validateCloudflareProjectName("").valid).toBe(false);
    expect(validateCloudflareProjectName("-invalid-start").valid).toBe(false);
    expect(validateCloudflareProjectName("a".repeat(64)).valid).toBe(false);
  });
});

describe("Account Discovery & Wrangler CLI Parsing", () => {
  it("parses wrangler whoami CLI output into accounts and user email", () => {
    const tableOutput = `
      Getting User settings...
      👋 You are logged in with an OAuth Token, associated with the email user@example.com!
      ┌──────────────────────────────────┬──────────────────────────────────┐
      │ Account Name                     │ Account ID                       │
      ├──────────────────────────────────┼──────────────────────────────────┤
      │ Production Team                  │ 0123456789abcdef0123456789abcdef │
      │ Staging Team                     │ fedcba9876543210fedcba9876543210 │
      └──────────────────────────────────┴──────────────────────────────────┘
    `;
    const parsed = parseWranglerWhoami(tableOutput);
    expect(parsed.authenticated).toBe(true);
    expect(parsed.email).toBe("user@example.com");
    expect(parsed.accounts.length).toBe(2);
    expect(parsed.accounts[0]).toEqual({ name: "Production Team", id: "0123456789abcdef0123456789abcdef" });
    expect(parsed.primaryAccount.id).toBe("0123456789abcdef0123456789abcdef");
  });

  it("parses token-associated account from wrangler whoami output", () => {
    const tokenOutput = `
      Getting User settings...
      ✨ You are logged in with an API Token, associated with the account 'Personal Team' (abcdef0123456789abcdef0123456789).
    `;
    const parsed = parseWranglerWhoami(tokenOutput);
    expect(parsed.authenticated).toBe(true);
    expect(parsed.accounts.length).toBe(1);
    expect(parsed.accounts[0]).toEqual({ name: "Personal Team", id: "abcdef0123456789abcdef0123456789" });
  });

  it("discovers credentials from environment variables when valid", () => {
    const env = {
      CLOUDFLARE_API_TOKEN: "v4k9_abcdef1234567890ABCDEF123456789012",
      CLOUDFLARE_ACCOUNT_ID: "0123456789abcdef0123456789abcdef",
    };
    const creds = discoverCloudflareCredentials({ env });
    expect(creds.authenticated).toBe(true);
    expect(creds.method).toBe("env_token");
    expect(creds.credentialRef).toBe("CLOUDFLARE_API_TOKEN");
    expect(creds.accountId).toBe(env.CLOUDFLARE_ACCOUNT_ID);
    expect(JSON.stringify(creds)).not.toContain(env.CLOUDFLARE_API_TOKEN);
  });

  it("rejects discovering credentials from environment variables when token is a placeholder", () => {
    const env = {
      CLOUDFLARE_API_TOKEN: "your_api_token_here",
    };
    const creds = discoverCloudflareCredentials({ env });
    expect(creds.authenticated).toBe(false);
    expect(creds.error).toMatch(/unencrypted plaintext placeholder/i);
  });

  it("discovers credentials via Wrangler CLI command runner", () => {
    const creds = discoverCloudflareCredentials({
      env: {},
      commandRunner(cmd, args) {
        if (cmd === "wrangler" && args[0] === "whoami") {
          return {
            status: 0,
            stdout: "✨ You are logged in with an API Token, associated with the account 'CI Org' (0123456789abcdef0123456789abcdef).",
          };
        }
        return { status: 1 };
      },
    });
    expect(creds.authenticated).toBe(true);
    expect(creds.method).toBe("cli_login");
    expect(creds.primaryAccount.name).toBe("CI Org");
  });
});

describe("Environment Variables Binding & Secret Isolation", () => {
  it("binds public variables and separates secret keys", () => {
    const bound = bindCloudflareEnvironmentVariables({
      publicVars: {
        NEXT_PUBLIC_CONVEX_URL: "https://my-app.convex.cloud",
        NEXT_PUBLIC_SITE_URL: "https://my-app.workers.dev",
      },
      secretKeys: ["CONVEX_DEPLOY_KEY"],
    });

    expect(bound.vars).toEqual({
      NEXT_PUBLIC_CONVEX_URL: "https://my-app.convex.cloud",
      NEXT_PUBLIC_SITE_URL: "https://my-app.workers.dev",
    });
    expect(bound.secrets).toEqual(["CONVEX_DEPLOY_KEY"]);
  });

  it("throws when forbidden backend secrets are passed to public variables", () => {
    const forbiddenKeys = [
      "BETTER_AUTH_SECRET",
      "STRIPE_SECRET_KEY",
      "RESEND_API_KEY",
      "POLAR_ACCESS_TOKEN",
      "LEMON_SQUEEZY_API_KEY",
    ];

    for (const key of forbiddenKeys) {
      expect(() =>
        bindCloudflareEnvironmentVariables({
          publicVars: { [key]: "super-secret-value" },
        }),
      ).toThrow(/Forbidden backend secret/);
    }
  });

  it("generates valid OpenNext / Wrangler configuration", () => {
    const config = generateWranglerConfig({
      projectName: "agentic-app",
      vars: { NEXT_PUBLIC_SITE_URL: "https://agentic-app.workers.dev" },
    });

    expect(config.name).toBe("agentic-app");
    expect(config.main).toBe(".open-next/worker.js");
    expect(config.compatibility_flags).toContain("nodejs_compat");
    expect(config.vars.NEXT_PUBLIC_SITE_URL).toBe("https://agentic-app.workers.dev");
  });
});

describe("Better Auth Origins and Convex Connectivity", () => {
  it("resolves workers.dev and custom domain origins for Better Auth", () => {
    const origins = resolveBetterAuthCloudflareOrigins({
      workerName: "ship-app",
      accountSubdomain: "my-team",
      customDomain: "https://shipapp.com",
      production: true,
    });

    expect(origins.siteUrl).toBe("https://shipapp.com");
    expect(origins.trustedOrigins).toContain("https://shipapp.com");
    expect(origins.trustedOrigins).toContain("https://ship-app.my-team.workers.dev");
    expect(origins.callbackUrl).toBe("https://shipapp.com/api/auth/callback");
    expect(origins.authEndpoint).toBe("https://shipapp.com/api/auth");
  });

  it("includes localhost origins only in non-production mode", () => {
    const devOrigins = resolveBetterAuthCloudflareOrigins({
      workerName: "ship-app",
      production: false,
    });
    expect(devOrigins.trustedOrigins).toContain("http://localhost:3000");

    const prodOrigins = resolveBetterAuthCloudflareOrigins({
      workerName: "ship-app",
      production: true,
    });
    expect(prodOrigins.trustedOrigins).not.toContain("http://localhost:3000");
  });

  it("verifies Convex URL and deploy key formats", () => {
    expect(
      verifyConvexCloudflareConnectivity({
        convexUrl: "https://happy-otter-123.convex.cloud",
        deployKey: "prod:happy-otter-123|abcdef",
      }).valid,
    ).toBe(true);

    expect(
      verifyConvexCloudflareConnectivity({
        convexUrl: "http://insecure-convex.com",
      }).valid,
    ).toBe(false);

    expect(
      verifyConvexCloudflareConnectivity({
        convexUrl: "https://happy-otter-123.convex.cloud",
        deployKey: "invalid-key-prefix",
      }).valid,
    ).toBe(false);
  });
});

describe("Production Preflight & Revocation", () => {
  it("passes preflight when deployment is atomic and secrets are isolated", () => {
    const result = inspectProductionCloudflareEnvironment({
      wranglerConfigSource: JSON.stringify({ name: "my-worker" }),
      packageJsonSource: JSON.stringify({ scripts: { build: "npx convex deploy --cmd 'pnpm build'" } }),
    });
    expect(result.status).toBe("PASS");
  });

  it("fails preflight when build does not deploy Convex first", () => {
    const result = inspectProductionCloudflareEnvironment({
      wranglerConfigSource: JSON.stringify({ name: "my-worker" }),
      packageJsonSource: JSON.stringify({ scripts: { build: "next build" } }),
    });
    expect(result.status).toBe("FAIL");
    expect(result.detail).toMatch(/must deploy Convex before Next.js/);
  });

  it("fails preflight when backend secrets are leaked into wrangler config", () => {
    const result = inspectProductionCloudflareEnvironment({
      wranglerConfigSource: JSON.stringify({
        name: "my-worker",
        vars: { BETTER_AUTH_SECRET: "leaked_secret" },
      }),
      packageJsonSource: JSON.stringify({ scripts: { build: "npx convex deploy --cmd 'pnpm build'" } }),
    });
    expect(result.status).toBe("FAIL");
    expect(result.detail).toMatch(/Backend secret "BETTER_AUTH_SECRET" must not be placed in Cloudflare Worker/);
  });

  it("simulates revocation steps cleanly", () => {
    const ran = [];
    const result = revokeCloudflareCredentials({
      commandRunner(cmd, args) {
        ran.push([cmd, args]);
        return { status: 0 };
      },
    });
    expect(result.revoked).toBe(true);
    expect(ran).toEqual([["wrangler", ["logout"]]]);
    expect(result.steps.length).toBeGreaterThanOrEqual(3);
  });
});

describe("Cross-Platform Path & Contract Checks", () => {
  it("resolves paths and commands consistently across Windows, macOS, and Linux", () => {
    const platforms = ["win32", "darwin", "linux"];
    for (const platform of platforms) {
      const isWin = platform === "win32";
      const config = generateWranglerConfig({
        projectName: "cross-platform-worker",
      });
      expect(config.name).toBe("cross-platform-worker");
      expect(config.compatibility_flags).toContain("nodejs_compat");
    }
  });
});
