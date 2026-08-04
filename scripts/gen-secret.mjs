#!/usr/bin/env node
/**
 * Prints one cryptographically random 32-byte base64 secret.
 *
 * Replaces `openssl rand -base64 32`, which assumes an OpenSSL binary on PATH and
 * `$(...)` command substitution — neither exists in Windows cmd or PowerShell.
 * node:crypto is the same CSPRNG on every platform.
 *
 *   pnpm secret
 *   npx convex env set BETTER_AUTH_SECRET <paste>
 *
 * Printed, never written to a file: secrets belong in Convex env, not in the repo.
 */
import { randomBytes } from "node:crypto";

process.stdout.write(randomBytes(32).toString("base64") + "\n");
