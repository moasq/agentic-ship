import { parseConfigFileTextToJson } from "typescript";

export const CLOUDFLARE_ADAPTER = Object.freeze({
  framework: "vinext",
  frameworkVersion: "1.0.0-beta.8",
  deploymentPackage: "@vinext/cloudflare",
  deploymentVersion: "1.0.0-beta.6",
});

export const CLOUDFLARE_LOGIN_ARGS = Object.freeze(["login", "--use-keyring"]);
export const CLOUDFLARE_AUTH_ENV = Object.freeze({ CLOUDFLARE_AUTH_USE_KEYRING: "true" });

export function cloudflareCommandExecution(platform = process.platform) {
  return {
    login: ["wrangler", ...CLOUDFLARE_LOGIN_ARGS],
    environment: CLOUDFLARE_AUTH_ENV,
    shell: platform === "win32",
  };
}

// Cloudflare tokens are opaque. Validate only the safety properties we can know
// locally instead of rejecting future token formats that Cloudflare may issue.
const TOKEN_PATTERN = /^\S{20,512}$/;
const ACCOUNT_ID_PATTERN = /^[a-f0-9]{32}$/i;
const WORKER_NAME_PATTERN = /^[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const FORBIDDEN_TOKEN_PATTERNS = [/^your[_-]?api[_-]?token/i, /^placeholder/i, /^test[_-]?token/i, /^example/i, /^bearer\s/i];

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
  "CONVEX_PROD_DEPLOY_KEY",
  "CONVEX_PREVIEW_DEPLOY_KEY",
]);

function invalid(error) {
  return { valid: false, error };
}

export function validateCloudflareToken(token) {
  if (typeof token !== "string" || !token.trim()) return invalid("Cloudflare API token must be a non-empty string");
  const clean = token.trim();
  if (FORBIDDEN_TOKEN_PATTERNS.some((pattern) => pattern.test(clean))) {
    return invalid("Cloudflare API token appears to be a plaintext placeholder");
  }
  if (!TOKEN_PATTERN.test(clean)) return invalid("Cloudflare API token format is invalid");
  return { valid: true };
}

export function validateCloudflareAccountId(accountId) {
  if (typeof accountId !== "string" || !ACCOUNT_ID_PATTERN.test(accountId.trim())) {
    return invalid("Cloudflare account ID must be a 32-character hexadecimal string");
  }
  return { valid: true };
}

export function validateCloudflareProjectName(name) {
  if (typeof name !== "string" || !WORKER_NAME_PATTERN.test(name.trim())) {
    return invalid("Cloudflare Worker name must use lowercase letters, numbers, or internal hyphens and contain at most 63 characters");
  }
  return { valid: true };
}

export function parseWranglerWhoami(output) {
  if (typeof output !== "string" || !output.trim()) return { authenticated: false, encryptedStorage: false, accounts: [] };
  const accounts = [];
  const tokenAccount = output.match(/associated with the account ['"]?([^'"]+)['"]?\s*\(([a-f0-9]{32})\)/i);
  if (tokenAccount) accounts.push({ name: tokenAccount[1].trim(), id: tokenAccount[2] });
  for (const line of output.split(/\r?\n/)) {
    const row = line.match(/[│|]\s*([^│|]+?)\s*[│|]\s*([a-f0-9]{32})\s*[│|]/i);
    if (row && !row[1].toLowerCase().includes("account name") && !accounts.some((account) => account.id === row[2])) {
      accounts.push({ name: row[1].trim(), id: row[2] });
    }
  }
  const email = output.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/)?.[1] ?? null;
  const encryptedStorage = /Credentials are stored in:\s*Encrypted file/i.test(output);
  return {
    authenticated: /You are logged in/i.test(output) || accounts.length > 0,
    encryptedStorage,
    email,
    accounts,
    primaryAccount: accounts[0] ?? null,
  };
}

export function discoverCloudflareCredentials({ env = process.env, commandRunner } = {}) {
  if (env.CLOUDFLARE_API_TOKEN) {
    const token = validateCloudflareToken(env.CLOUDFLARE_API_TOKEN);
    const account = validateCloudflareAccountId(env.CLOUDFLARE_ACCOUNT_ID);
    if (!token.valid || !account.valid) {
      return { authenticated: false, method: "env_token", error: token.error ?? account.error, accounts: [] };
    }
    if (!commandRunner) return { authenticated: false, method: "env_token", error: "Cloudflare API token has not passed a remote probe", accounts: [] };
    try {
      const result = commandRunner("wrangler", ["whoami"], { env });
      if (result?.status !== 0) return { authenticated: false, method: "env_token", error: "Cloudflare API token failed the remote probe", accounts: [] };
      const parsed = parseWranglerWhoami(`${result.stdout ?? ""}\n${result.stderr ?? ""}`);
      const selected = parsed.accounts.find((candidate) => candidate.id.toLowerCase() === env.CLOUDFLARE_ACCOUNT_ID.toLowerCase());
      if (!parsed.authenticated || !selected) {
        return { authenticated: false, method: "env_token", error: "Cloudflare API token cannot access the selected account", accounts: parsed.accounts };
      }
      return {
        authenticated: true,
        method: "env_token",
        credentialRef: "CLOUDFLARE_API_TOKEN",
        accountId: selected.id,
        accounts: parsed.accounts,
      };
    } catch {
      return { authenticated: false, method: "env_token", error: "Cloudflare API token failed the remote probe", accounts: [] };
    }
  }
  if (!commandRunner) return { authenticated: false, method: "none", accounts: [] };
  try {
    const result = commandRunner("wrangler", ["whoami"], { env: { ...env, ...CLOUDFLARE_AUTH_ENV } });
    if (result?.status !== 0) return { authenticated: false, method: "cli_login", accounts: [] };
    const parsed = parseWranglerWhoami(`${result.stdout ?? ""}\n${result.stderr ?? ""}`);
    if (!parsed.authenticated || !parsed.encryptedStorage) {
      return {
        authenticated: false,
        method: "cli_login",
        error: parsed.authenticated ? "Wrangler OAuth credentials are not protected by the OS keychain" : "Wrangler is not authenticated",
        accounts: parsed.accounts,
      };
    }
    return { ...parsed, method: "cli_login" };
  } catch {
    return { authenticated: false, method: "none", accounts: [] };
  }
}

export function resolveBetterAuthCloudflareOrigins({ workerName, accountSubdomain, customDomain, production = true } = {}) {
  const trustedOrigins = [];
  let siteUrl = "";
  if (customDomain) {
    const candidate = customDomain.startsWith("http") ? customDomain : `https://${customDomain}`;
    const url = new URL(candidate);
    if (production && url.protocol !== "https:") throw new Error("Production Better Auth site URL must use HTTPS");
    siteUrl = url.origin;
    trustedOrigins.push(siteUrl);
  }
  if (workerName && accountSubdomain) {
    const workerUrl = `https://${workerName}.${accountSubdomain}.workers.dev`;
    if (!siteUrl) siteUrl = workerUrl;
    if (!trustedOrigins.includes(workerUrl)) trustedOrigins.push(workerUrl);
  }
  if (!production) trustedOrigins.push("http://localhost:3000", "http://127.0.0.1:3000");
  return {
    siteUrl,
    trustedOrigins,
    callbackUrl: siteUrl ? `${siteUrl}/api/auth/callback` : "",
    authEndpoint: siteUrl ? `${siteUrl}/api/auth` : "",
  };
}

export function verifyConvexCloudflareConnectivity({ convexUrl } = {}) {
  if (typeof convexUrl !== "string" || !/^https:\/\/[a-z0-9-]+\.convex\.cloud$/i.test(convexUrl.trim())) {
    return invalid("NEXT_PUBLIC_CONVEX_URL must be an HTTPS convex.cloud deployment URL");
  }
  return { valid: true };
}

export function bindCloudflareEnvironmentVariables({ publicVars = {}, secretKeys = [] } = {}) {
  const vars = {};
  for (const [key, value] of Object.entries(publicVars)) {
    if (FORBIDDEN_VAR_KEYS.has(key)) throw new Error(`Forbidden backend secret "${key}" cannot be a Worker runtime variable`);
    vars[key] = String(value);
  }
  return { vars, secrets: [...new Set(secretKeys)] };
}

export function generateWranglerConfig({ projectName, accountId, compatibilityDate = new Date().toISOString().slice(0, 10), vars = {} } = {}) {
  const name = validateCloudflareProjectName(projectName);
  const account = validateCloudflareAccountId(accountId);
  if (!name.valid) throw new Error(name.error);
  if (!account.valid) throw new Error(account.error);
  return {
    $schema: "node_modules/wrangler/config-schema.json",
    name: projectName,
    account_id: accountId,
    main: "dist/server/index.js",
    compatibility_date: compatibilityDate,
    compatibility_flags: ["nodejs_compat"],
    vars: bindCloudflareEnvironmentVariables({ publicVars: vars }).vars,
  };
}

export function parseWranglerConfig(source, fileName = "wrangler.jsonc") {
  const parsed = parseConfigFileTextToJson(fileName, source);
  if (parsed.error || !parsed.config || typeof parsed.config !== "object") throw new Error(`${fileName} is not valid JSON or JSONC`);
  return parsed.config;
}

function parsePackage(source) {
  try {
    const document = JSON.parse(source);
    if (!document || typeof document !== "object") throw new Error();
    return document;
  } catch {
    throw new Error("package.json is not valid JSON");
  }
}

function hasExactDependency(document, name, version) {
  return document.dependencies?.[name] === version || document.devDependencies?.[name] === version;
}

export function inspectCloudflareBlueprint({ configSources = [], packageJsonSource = "" } = {}) {
  const present = configSources.filter((entry) => entry?.source?.trim());
  if (present.length === 0) return { status: "SKIP", detail: "no Cloudflare deployment configuration detected" };
  if (present.length !== 1) return { status: "FAIL", detail: "keep exactly one Wrangler configuration file" };
  if (present[0].path.endsWith(".toml")) return { status: "FAIL", detail: "the pinned vinext adapter requires wrangler.json or wrangler.jsonc" };
  let config;
  let pkg;
  try {
    config = parseWranglerConfig(present[0].source, present[0].path);
    pkg = parsePackage(packageJsonSource);
  } catch (error) {
    return { status: "FAIL", detail: error.message };
  }
  if (!validateCloudflareProjectName(config.name).valid) return { status: "FAIL", detail: "Wrangler config needs a valid explicit Worker name" };
  if (!validateCloudflareAccountId(config.account_id).valid) return { status: "FAIL", detail: "Wrangler config needs an explicit account_id" };
  if (typeof config.main !== "string" || !config.main.trim()) return { status: "FAIL", detail: "Wrangler config needs a Worker entry point" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(config.compatibility_date ?? "")) return { status: "FAIL", detail: "Wrangler config needs a compatibility_date" };
  if (!config.compatibility_flags?.includes("nodejs_compat")) return { status: "FAIL", detail: "Wrangler config must enable nodejs_compat" };
  if (!hasExactDependency(pkg, CLOUDFLARE_ADAPTER.framework, CLOUDFLARE_ADAPTER.frameworkVersion)) {
    return { status: "FAIL", detail: `pin ${CLOUDFLARE_ADAPTER.framework}@${CLOUDFLARE_ADAPTER.frameworkVersion}` };
  }
  if (!hasExactDependency(pkg, CLOUDFLARE_ADAPTER.deploymentPackage, CLOUDFLARE_ADAPTER.deploymentVersion)) {
    return { status: "FAIL", detail: `pin ${CLOUDFLARE_ADAPTER.deploymentPackage}@${CLOUDFLARE_ADAPTER.deploymentVersion}` };
  }
  const scripts = pkg.scripts ?? {};
  if (scripts["build:vinext"] !== "vinext build") return { status: "FAIL", detail: "build:vinext must run vinext build" };
  if (scripts["build:cloudflare"] !== "node scripts/build-cloudflare.mjs") {
    return { status: "FAIL", detail: "build:cloudflare must select the production or preview Convex deployment through the portable build wrapper" };
  }
  if (scripts["check:cloudflare-build"] !== "node scripts/build-cloudflare.mjs --dry-run") {
    return { status: "FAIL", detail: "check:cloudflare-build must run the Convex deployment dry run through the portable build wrapper" };
  }
  const deploy = scripts["deploy:cloudflare"] ?? "";
  if (!/\bvinext-cloudflare deploy\b/.test(deploy) || !deploy.includes("--skip-build") || !deploy.includes("dist/server/wrangler.json")) {
    return { status: "FAIL", detail: "deploy:cloudflare must deploy the existing vinext build with --skip-build" };
  }
  const preview = scripts["preview:cloudflare"] ?? "";
  if (!/\bwrangler versions upload\b/.test(preview) || !preview.includes("dist/server/wrangler.json")) {
    return { status: "FAIL", detail: "preview:cloudflare must upload a preview version from the generated Wrangler config" };
  }
  for (const key of FORBIDDEN_VAR_KEYS) {
    if (Object.hasOwn(config.vars ?? {}, key)) return { status: "FAIL", detail: `${key} belongs in its provider-owned secret store, not Worker vars` };
  }
  return { status: "PASS", detail: "Cloudflare vinext blueprint is explicit and Convex-first" };
}

export function inspectProductionCloudflareEnvironment(options = {}) {
  return inspectCloudflareBlueprint(options);
}

export function revokeCloudflareCredentials({ commandRunner } = {}) {
  if (!commandRunner) return { revoked: false, steps: ["Run `wrangler logout` and verify that `wrangler whoami` fails"] };
  try {
    const result = commandRunner("wrangler", ["logout"]);
    const revoked = result?.status === 0;
    return {
      revoked,
      steps: revoked
        ? ["Wrangler logout completed", "Revoke any scoped API token in the Cloudflare dashboard"]
        : ["Wrangler logout failed; local authorization may still be active"],
    };
  } catch {
    return { revoked: false, steps: ["Wrangler logout failed; local authorization may still be active"] };
  }
}
