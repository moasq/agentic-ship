#!/usr/bin/env node
/**
 * pnpm secret:set <NAME> [--prod]
 *
 * The one sanctioned way to move a human-held secret into the Convex deployment env.
 * The value is typed at a hidden prompt in the user's own terminal and piped to
 * `npx convex env set NAME` over stdin — the officially documented no-shell-history
 * path. It never appears in argv, chat, .env.local, or any file in this repository.
 *
 * Live Stripe keys are refused without --prod: live keys exist only in the prod
 * deployment's env (see AGENTS.md production rules).
 */
import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline";
import { Writable } from "node:stream";
import { pathToFileURL } from "node:url";

const KNOWN = {
  STRIPE_SECRET_KEY: { test: ["sk_test_", "rk_test_"], live: ["sk_live_", "rk_live_"] },
  STRIPE_WEBHOOK_SECRET: { test: ["whsec_"], live: ["whsec_"] },
  RESEND_API_KEY: { test: ["re_"], live: ["re_"] },
  RESEND_WEBHOOK_SECRET: { test: ["whsec_"], live: ["whsec_"] },
};

export function validateSecretShape(name, value, { prod = false } = {}) {
  if (typeof value !== "string" || value.trim().length === 0) return { ok: false, reason: "empty value" };
  if (/\s/.test(value.trim())) return { ok: false, reason: "value contains whitespace" };
  const rule = KNOWN[name];
  if (!rule) return { ok: true };
  const trimmed = value.trim();
  const isLive = rule.live.some((prefix) => trimmed.startsWith(prefix)) && !rule.test.some((prefix) => trimmed.startsWith(prefix));
  if (isLive && !prod) {
    return { ok: false, reason: `${name} looks like a LIVE credential. Live keys belong only in the prod deployment env: rerun with --prod, deliberately.` };
  }
  if (![...rule.test, ...rule.live].some((prefix) => trimmed.startsWith(prefix))) {
    return { ok: false, reason: `${name} should start with one of: ${[...new Set([...rule.test, ...rule.live])].join(", ")}` };
  }
  return { ok: true };
}

function promptHidden(question) {
  return new Promise((resolvePrompt) => {
    const muted = new Writable({
      write(_chunk, _encoding, callback) {
        callback();
      },
    });
    const rl = createInterface({ input: process.stdin, output: muted, terminal: true });
    process.stderr.write(question);
    rl.question("", (answer) => {
      rl.close();
      process.stderr.write("\n");
      resolvePrompt(answer);
    });
  });
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const args = process.argv.slice(2);
  const prod = args.includes("--prod");
  const name = args.filter((arg) => arg !== "--prod")[0];
  if (!name || !/^[A-Z][A-Z0-9_]*$/.test(name)) {
    console.error("Usage: pnpm secret:set <ENV_NAME> [--prod]\nThe value is prompted with hidden input — never passed as an argument.");
    process.exit(1);
  }
  if (!process.stdin.isTTY) {
    console.error("secret:set needs an interactive terminal so the value can be typed hidden. Run it yourself in a terminal — do not pipe or script it.");
    process.exit(1);
  }

  const value = (await promptHidden(`${name} (input hidden): `)).trim();
  const verdict = validateSecretShape(name, value, { prod });
  if (!verdict.ok) {
    console.error(`Refused: ${verdict.reason}`);
    process.exit(1);
  }

  const envArgs = ["convex", "env", "set", ...(prod ? ["--prod"] : []), name];
  const result = spawnSync(process.platform === "win32" ? "npx.cmd" : "npx", envArgs, {
    input: value,
    stdio: ["pipe", "inherit", "inherit"],
    encoding: "utf8",
  });
  if (result.status !== 0) {
    console.error(`Setting ${name} failed (exit ${result.status}). The value was not stored anywhere by this script.`);
    process.exit(result.status ?? 1);
  }
  console.log(`${name} set in the ${prod ? "prod" : "dev"} Convex deployment env. The value never touched disk or shell history here.`);
}
