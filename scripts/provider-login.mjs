#!/usr/bin/env node
/**
 * pnpm provider:login <stripe|netlify|vercel|cloudflare|github|21st>
 *
 * One journey per provider: install the official CLI if it is missing, then run its
 * browser OAuth login and wait for consent. The terminal never carries a credential —
 * the browser approval IS the authentication, and the CLI stores what it receives in
 * its own machine-local config, outside this repository.
 *
 * Install sources are the vendors' documented package managers only. When no installer
 * is known for this platform the script stops with the docs URL instead of guessing.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { cloudflareCommandExecution } from "./lib/connections/cloudflare.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// On Windows the vendor CLIs are batch shims (npm.cmd, netlify.cmd, vercel.cmd, scoop, winget, gh)
// that spawnSync cannot exec without a shell — without this every provider login is dead
// on win32. Every command and argument spawned below is a static literal from the
// PROVIDERS catalog; no user input is ever interpolated into a shell string, so shell
// use here is safe (same pattern as scripts/probe-mcp.mjs). Never add shell:true to a
// call whose args carry caller-supplied text.
const WIN = process.platform === "win32";
const cloudflareExecution = cloudflareCommandExecution();

const PROVIDERS = {
  stripe: {
    binary: "stripe",
    docs: "https://docs.stripe.com/stripe-cli",
    pairedFile: join(".config", "stripe", "config.toml"),
    install: {
      darwin: [["brew", "install", "stripe/stripe-cli/stripe"]],
      linux: null,
      win32: [
        ["scoop", "bucket", "add", "stripe", "https://github.com/stripe/scoop-stripe-cli.git"],
        ["scoop", "install", "stripe"],
      ],
    },
    // Without a TTY `stripe login` does not poll: it emits JSON carrying the browser
    // confirmation URL, a human-readable verification code, and a single-use completion
    // URL. This script always runs it piped, so that split flow is the one deterministic
    // path — the JSON is parsed, never printed, because the completion URL is a secret.
    login: ["stripe", "login"],
    captureAndComplete: true,
    verify: ["stripe", "products", "list", "--limit", "1"],
  },
  netlify: {
    binary: "netlify",
    docs: "https://docs.netlify.com/cli/get-started/",
    // Only a fallback; `verify` below is what actually decides, because a config file
    // on disk has never once proven a credential works (heal-ledger.md, three times).
    pairedFile: join(".netlify", "config.json"),
    install: {
      darwin: [["brew", "install", "netlify-cli"]],
      linux: [["brew", "install", "netlify-cli"]],
      win32: null,
    },
    login: ["netlify", "login"],
    // Read-only and account-scoped: it needs the credential and touches no site.
    verify: ["netlify", "api", "getCurrentUser", "--data", "{}"],
  },
  vercel: {
    binary: "vercel",
    docs: "https://vercel.com/docs/cli",
    install: {
      darwin: [["pnpm", "add", "--global", "vercel"]],
      linux: [["pnpm", "add", "--global", "vercel"]],
      win32: [["pnpm", "add", "--global", "vercel"]],
    },
    login: ["vercel", "login"],
    verify: ["vercel", "whoami"],
  },
  cloudflare: {
    binary: "wrangler",
    docs: "https://developers.cloudflare.com/workers/wrangler/",
    install: {
      darwin: [["pnpm", "add", "--global", "wrangler"]],
      linux: [["pnpm", "add", "--global", "wrangler"]],
      win32: [["pnpm", "add", "--global", "wrangler"]],
    },
    login: cloudflareExecution.login,
    environment: cloudflareExecution.environment,
    shell: cloudflareExecution.shell,
    verify: [process.execPath, join(projectRoot, "scripts", "check-cloudflare-auth.mjs")],
  },
  github: {
    binary: "gh",
    docs: "https://cli.github.com/",
    pairedFile: join(".config", "gh", "hosts.yml"),
    install: {
      darwin: [["brew", "install", "gh"]],
      linux: null,
      win32: [["winget", "install", "--id", "GitHub.cli"]],
    },
    login: ["gh", "auth", "login", "--web", "--git-protocol", "https", "--hostname", "github.com"],
    feedEnter: true,
    verify: ["gh", "auth", "status"],
  },
  // 21st.dev's CLI pairs the component catalog (search free, code retrieval metered).
  // Its `whoami` exits 0 even when signed out, so `usage` — which exits 1 signed out
  // and prints tier + quota signed in — is the read-only verification call.
  "21st": {
    binary: "21st",
    docs: "https://help.21st.dev/cli",
    pairedFile: join(".config", "21st"),
    install: {
      darwin: [["npm", "i", "-g", "@21st-dev/cli"]],
      linux: [["npm", "i", "-g", "@21st-dev/cli"]],
      win32: [["npm", "i", "-g", "@21st-dev/cli"]],
    },
    login: ["21st", "login"],
    feedEnter: true,
    verify: ["21st", "usage"],
  },
};

function pause(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function verified(provider) {
  if (!provider.verify) return existsSync(join(homedir(), provider.pairedFile));
  const result = spawnSync(provider.verify[0], provider.verify.slice(1), {
    stdio: "ignore",
    shell: provider.shell ?? WIN,
    env: { ...process.env, ...(provider.environment ?? {}) },
  });
  return result.status === 0;
}


function completeHeadlessPairing(loginOutput) {
  const start = loginOutput.indexOf("{");
  const end = loginOutput.lastIndexOf("}");
  if (start < 0 || end <= start) return false;
  let payload;
  try {
    payload = JSON.parse(loginOutput.slice(start, end + 1));
  } catch {
    return false;
  }
  if (!payload.browser_url || !payload.next_step) return false;
  const completeUrl = payload.next_step.replace(/^stripe login --complete '/, "").replace(/'$/, "");
  console.log(`A browser page is opening. Approve it only if it shows this code: ${payload.verification_code}`);
  spawnSync(process.execPath, [join(projectRoot, "scripts", "open-url.mjs"), payload.browser_url], {
    stdio: ["ignore", "ignore", "inherit"],
  });
  const deadline = Date.now() + 5 * 60_000;
  while (Date.now() < deadline) {
    const done = spawnSync("stripe", ["login", "--complete", completeUrl], { stdio: "ignore", shell: WIN });
    if (done.status === 0) return true;
    pause(5000);
  }
  return false;
}

function run(argv, { input, environment, shell = WIN } = {}) {
  const [command, ...args] = argv;
  return spawnSync(command, args, {
    stdio: [input === undefined ? "inherit" : "pipe", "inherit", "inherit"],
    input,
    encoding: "utf8",
    shell,
    env: { ...process.env, ...(environment ?? {}) },
  });
}

function binaryExists(binary) {
  const probe = spawnSync(binary, ["--version"], { stdio: "ignore", shell: WIN });
  return probe.error === undefined || probe.error === null;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

const providerId = process.argv[2];
const provider = PROVIDERS[providerId];
if (!provider) {
  fail(`Usage: pnpm provider:login <${Object.keys(PROVIDERS).join("|")}>`);
}

if (!binaryExists(provider.binary)) {
  const steps = provider.install[process.platform];
  if (!steps) {
    fail(`The ${providerId} CLI is not installed and no installer is scripted for ${process.platform}.\nInstall it from ${provider.docs} and rerun.`);
  }
  const installerBinary = steps[0][0];
  if (!binaryExists(installerBinary)) {
    fail(`Installing the ${providerId} CLI needs ${installerBinary}, which is missing.\nInstall the CLI from ${provider.docs} and rerun.`);
  }
  console.log(`Installing the ${providerId} CLI (${steps.map((step) => step.join(" ")).join(" && ")})...`);
  for (const step of steps) {
    const result = run(step);
    if (result.status !== 0) fail(`Install failed (exit ${result.status}). Install manually from ${provider.docs} and rerun.`);
  }
  if (!binaryExists(provider.binary)) fail(`The ${providerId} CLI still is not on PATH. Open a new terminal or install from ${provider.docs}.`);
}

if (verified(provider)) {
  console.log(`${providerId}: already authenticated (verified with a read-only call). Nothing to do.`);
  console.log(`To re-authenticate, log out with the provider CLI first.`);
  process.exit(0);
}

console.log(`${providerId}: starting browser login. Approve the request in the browser; the command waits here.`);
if (provider.captureAndComplete) {
  const login = spawnSync(provider.login[0], provider.login.slice(1), { input: "\n", encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], shell: WIN });
  if (!completeHeadlessPairing(`${login.stdout}\n${login.stderr}`)) {
    fail(`${providerId} pairing was not approved in time. Rerun when ready, or follow ${provider.docs}.`);
  }
} else {
  // Some CLIs gate the browser open behind a "Press Enter" prompt; a fed newline accepts
  // that prompt and nothing else — the actual consent always happens in the browser.
  const login = run(provider.login, {
    ...(provider.feedEnter ? { input: "\n" } : {}),
    environment: provider.environment,
    shell: provider.shell,
  });
  if (login.status !== 0) {
    fail(`${providerId} login did not complete (exit ${login.status}). Rerun when ready, or follow ${provider.docs}.`);
  }
}
// Some providers need one more machine-local step before the credential is usable at
// all. It runs before verification, because verification is what it exists to satisfy.
if (provider.afterLogin) provider.afterLogin();

if (!verified(provider)) {
  fail(`${providerId} login finished but a read-only verification call still fails. Rerun, or follow ${provider.docs}.`);
}
console.log(`${providerId}: authenticated and verified with a read-only call. The credential lives in the CLI's own config, outside this repository.`);
