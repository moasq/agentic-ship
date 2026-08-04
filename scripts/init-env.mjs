#!/usr/bin/env node
/**
 * Creates `.env.local` from `.env.example` if it does not exist.
 * Replaces `cp`, which does not exist on Windows cmd/PowerShell.
 * Never overwrites: an existing .env.local may hold real credentials.
 */
import { existsSync, copyFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const example = join(root, ".env.example");
const local = join(root, ".env.local");

if (!existsSync(example)) {
  console.error("FAIL  .env.example is missing.");
  process.exit(1);
}
if (existsSync(local)) {
  console.log(".env.local already exists — left untouched.");
  process.exit(0);
}
copyFileSync(example, local);
console.log("created .env.local from .env.example");
