import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{30,100}$/;
const ACCOUNT_ID_PATTERN = /^[a-f0-9]{32}$/i;
const WORKER_NAME_PATTERN = /^[a-z0-9][a-z0-9-_]{0,62}$/i;

const FORBIDDEN_TOKEN_PATTERNS = [
  /^your[_-]?api[_-]?token/i,
  /^placeholder/i,
  /^test[_-]?token/i,
  /^example/i,
  /^bearer\s/i,
  /^12345/,
  /^xxx+/i,
  /^my[_-]?secret/i,
];

const FORBIDDEN_VAR_KEYS = new Set([
  "BETTER_AUTH_SECRET",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "RESEND_API_KEY",
  "RESEND_WEBHOOK_SECRET",
  "POLAR_ACCESS_TOKEN",
  "POLAR_WEBHOOK_SECRET",
  "LEMON_SQUEEZY_API_KEY",
  "LEMON_SQUEEZY_WEBHOOK_SECRET",
  "SENTRY_AUTH_TOKEN",
  "CONVEX_DEPLOY_KEY",
]);

/**
 * Validates a Cloudflare API token.
 * Rejects empty values, invalid lengths, and plaintext placeholders.
 */
export function validateCloudflareToken(token) {
  if (typeof token !== "string" || token.trim().length === 0) {
    return { valid: false, error: "Cloudflare API token must be a non-empty string" };
  }
  const clean = token.trim();
  for (const pattern of FORBIDDEN_TOKEN_PATTERNS) {
    if (pattern.test(clean)) {
      return { valid: false, error: "Cloudflare API token appears to be an unencrypted plaintext placeholder" };
    }
  }
  if (clean.includes(" ") || clean.includes("\n") || clean.includes("\r") || clean.includes("\t")) {
    return { valid: false, error: "Cloudflare API token must not contain whitespace" };
  }
  if (!TOKEN_PATTERN.test(clean)) {
    return { valid: false, error: "Cloudflare API token format is invalid (expected 30-100 alphanumeric/hyphen/underscore characters)" };
  }
  return { valid: true };
}

/**
 * Validates a Cloudflare Account ID (32-character hex).
 */
export function validateCloudflareAccountId(accountId) {
  if (typeof accountId !== "string" || accountId.trim().length === 0) {
    return { valid: false, error: "Cloudflare account ID must be a non-empty string" };
  }
  const clean = accountId.trim();
  if (!ACCOUNT_ID_PATTERN.test(clean)) {
    return { valid: false, error: "Cloudflare account ID format is invalid (expected 32-character hexadecimal string)" };
  }
  return { valid: true };
}

/**
 * Validates a Cloudflare Worker/project name.
 */
export function validateCloudflareProjectName(name) {
  if (typeof name !== "string" || name.trim().length === 0) {
    return { valid: false, error: "Cloudflare project name must be a non-empty string" };
  }
  const clean = name.trim();
  if (!WORKER_NAME_PATTERN.test(clean)) {
    return { valid: false, error: "Cloudflare project name must be 1-63 alphanumeric characters, hyphens, or underscores" };
  }
  return { valid: true };
}

/**
 * Parses `wrangler whoami` stdout into account details.
 */
export function parseWranglerWhoami(output) {
  if (typeof output !== "string" || !output.trim()) {
    return { authenticated: false, accounts: [] };
  }

  const accounts = [];
  const tokenAccountMatch = output.match(/associated with the account ['"]?([^'"]+)['"]?\s*\(([a-f0-9]{32})\)/i);
  if (tokenAccountMatch) {
    accounts.push({ name: tokenAccountMatch[1].trim(), id: tokenAccountMatch[2].trim() });
  }

  const tableLines = output.split(/\r?\n/);
  for (const line of tableLines) {
    const rowMatch = line.match(/[│|]\s*([^│|]+?)\s*[│|]\s*([a-f0-9]{32})\s*[│|]/i);
    if (rowMatch && !rowMatch[1].toLowerCase().includes("account name")) {
      const name = rowMatch[1].trim();
      const id = rowMatch[2].trim();
      if (!accounts.some((acc) => acc.id === id)) {
        accounts.push({ name, id });
      }
    }
  }

  const emailMatch =
    output.match(/(?:email|logged in (?:with|as)|associated with(?:\s+the)?\s+email)\s*[:=]?\s*['"]?([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})['"]?/i) ||
    output.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
  const email = emailMatch ? emailMatch[1] : null;

  const authenticated = accounts.length > 0 || /You are logged in/i.test(output) || /authenticated/i.test(output);
  return {
    authenticated,
    email,
    accounts,
    primaryAccount: accounts[0] ?? null,
  };
}

/**
 * Discovers Cloudflare credentials from environment variables, OS keychain, or Wrangler CLI.
 */
export function discoverCloudflareCredentials({ env = process.env, homeDirectory, commandRunner } = {}) {
  const token = env.CLOUDFLARE_API_TOKEN;
  const accountId = env.CLOUDFLARE_ACCOUNT_ID;

  if (token) {
    const tokenValidation = validateCloudflareToken(token);
    if (!tokenValidation.valid) {
      return {
        authenticated: false,
        method: "env_token",
        error: tokenValidation.error,
        accounts: [],
      };
    }
    if (accountId) {
      const accountValidation = validateCloudflareAccountId(accountId);
      if (!accountValidation.valid) {
        return {
          authenticated: false,
          method: "env_token",
          error: accountValidation.error,
          accounts: [],
        };
      }
    }
    return {
      authenticated: true,
      method: "env_token",
      apiToken: token,
      accountId: accountId ?? null,
      accounts: accountId ? [{ id: accountId, name: "Environment Account" }] : [],
    };
  }

  if (commandRunner) {
    try {
      const result = commandRunner("wrangler", ["whoami"]);
      if (result && result.status === 0) {
        const parsed = parseWranglerWhoami(result.stdout ?? "");
        return {
          authenticated: parsed.authenticated,
          method: "cli_login",
          email: parsed.email,
          accounts: parsed.accounts,
          primaryAccount: parsed.primaryAccount,
        };
      }
    } catch {
      // CLI not found or failed
    }
  }

  const home = resolve(homeDirectory ?? homedir());
  const configPath = join(home, ".wrangler", "config", "default.toml");
  if (existsSync(configPath)) {
    return {
      authenticated: true,
      method: "cli_login",
      accounts: [],
    };
  }

  return {
    authenticated: false,
    method: "none",
    accounts: [],
  };
}

/**
 * Resolves Better Auth trusted origins and callback URL for Cloudflare Workers / Pages.
 */
export function resolveBetterAuthCloudflareOrigins({
  workerName,
  accountSubdomain,
  customDomain,
  production = true,
} = {}) {
  const trustedOrigins = [];
  let primarySiteUrl = "";

  if (customDomain) {
    const cleanDomain = customDomain.replace(/^https?:\/\//, "").replace(/\/+$/, "");
    primarySiteUrl = `https://${cleanDomain}`;
    trustedOrigins.push(primarySiteUrl);
  }

  if (workerName && accountSubdomain) {
    const workerUrl = `https://${workerName}.${accountSubdomain}.workers.dev`;
    if (!primarySiteUrl) {
      primarySiteUrl = workerUrl;
    }
    if (!trustedOrigins.includes(workerUrl)) {
      trustedOrigins.push(workerUrl);
    }
  } else if (workerName && !primarySiteUrl) {
    primarySiteUrl = `https://${workerName}.workers.dev`;
    trustedOrigins.push(primarySiteUrl);
  }

  if (!production) {
    trustedOrigins.push("http://localhost:3000", "http://127.0.0.1:3000");
  }

  if (production && primarySiteUrl && !primarySiteUrl.startsWith("https://")) {
    throw new Error(`Production Better Auth site URL must use HTTPS: ${primarySiteUrl}`);
  }

  return {
    siteUrl: primarySiteUrl,
    trustedOrigins,
    callbackUrl: primarySiteUrl ? `${primarySiteUrl}/api/auth/callback` : "",
    authEndpoint: primarySiteUrl ? `${primarySiteUrl}/api/auth` : "",
  };
}

/**
 * Verifies Convex deployment credentials and URL for Cloudflare integration.
 */
export function verifyConvexCloudflareConnectivity({ convexUrl, deployKey } = {}) {
  if (!convexUrl || typeof convexUrl !== "string") {
    return { valid: false, error: "NEXT_PUBLIC_CONVEX_URL is required" };
  }
  if (!/^https:\/\/[a-z0-9-]+\.(?:convex\.cloud|convex\.site)$/i.test(convexUrl.trim())) {
    return { valid: false, error: "NEXT_PUBLIC_CONVEX_URL must be a valid https://<deployment>.convex.cloud URL" };
  }
  if (deployKey) {
    if (!/^(prod|preview|dev):/i.test(deployKey.trim())) {
      return { valid: false, error: "CONVEX_DEPLOY_KEY must start with 'prod:', 'preview:', or 'dev:'" };
    }
  }
  return { valid: true };
}

/**
 * Binds public environment variables vs secrets for Cloudflare deployment.
 * Enforces that backend secrets never get placed into client/worker public vars.
 */
export function bindCloudflareEnvironmentVariables({ publicVars = {}, secretKeys = [] } = {}) {
  const safeVars = {};
  for (const [key, value] of Object.entries(publicVars)) {
    if (FORBIDDEN_VAR_KEYS.has(key)) {
      throw new Error(`Forbidden backend secret "${key}" cannot be bound to Cloudflare Worker public variables`);
    }
    safeVars[key] = String(value);
  }

  const safeSecrets = [...new Set(secretKeys)];
  return {
    vars: safeVars,
    secrets: safeSecrets,
  };
}

/**
 * Generates a standard wrangler.json structure for Next.js on Cloudflare.
 */
export function generateWranglerConfig({
  projectName,
  main = ".open-next/worker.js",
  compatibilityDate = "2024-09-23",
  compatibilityFlags = ["nodejs_compat"],
  vars = {},
  assets = { directory: ".open-next/assets", binding: "ASSETS" },
} = {}) {
  const nameValidation = validateCloudflareProjectName(projectName);
  if (!nameValidation.valid) {
    throw new Error(nameValidation.error);
  }

  const bound = bindCloudflareEnvironmentVariables({ publicVars: vars });

  return {
    $schema: "node_modules/wrangler/config-schema.json",
    name: projectName,
    main,
    compatibility_date: compatibilityDate,
    compatibility_flags: compatibilityFlags,
    assets,
    vars: bound.vars,
  };
}

/**
 * Preflight check for Cloudflare production deployment environment.
 */
export function inspectProductionCloudflareEnvironment({
  env = {},
  wranglerConfigSource = "",
  packageJsonSource = "",
} = {}) {
  if (!wranglerConfigSource && !packageJsonSource) {
    return { status: "SKIP", detail: "no Cloudflare deployment configuration detected" };
  }

  const hasConvexDeploy =
    wranglerConfigSource.includes("convex deploy") ||
    packageJsonSource.includes("convex deploy") ||
    (typeof env.BUILD_COMMAND === "string" && env.BUILD_COMMAND.includes("convex deploy"));

  if (!hasConvexDeploy) {
    return {
      status: "FAIL",
      detail: "Cloudflare build command must deploy Convex before Next.js (npx convex deploy --cmd 'pnpm build')",
    };
  }

  for (const forbidden of FORBIDDEN_VAR_KEYS) {
    if (wranglerConfigSource.includes(`"${forbidden}"`) || wranglerConfigSource.includes(`${forbidden}=`)) {
      return {
        status: "FAIL",
        detail: `Backend secret "${forbidden}" must not be placed in Cloudflare Worker configuration; keep it in Convex environment`,
      };
    }
  }

  return {
    status: "PASS",
    detail: "Cloudflare deployment configuration is valid and atomic",
  };
}

/**
 * Simulates or performs Cloudflare credential revocation.
 */
export function revokeCloudflareCredentials({ commandRunner } = {}) {
  const steps = [];
  if (commandRunner) {
    try {
      commandRunner("wrangler", ["logout"]);
      steps.push("Ran `wrangler logout`");
    } catch {
      steps.push("Failed to execute `wrangler logout` automatically");
    }
  } else {
    steps.push("Run `wrangler logout` to remove local CLI credentials");
  }
  steps.push("Revoke any scoped API tokens in Cloudflare Dashboard under My Profile → API Tokens");
  steps.push("Delete or unbind the Worker project if it should no longer be deployed");
  return {
    revoked: true,
    steps,
  };
}
