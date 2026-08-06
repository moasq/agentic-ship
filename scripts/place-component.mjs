#!/usr/bin/env node
import { existsSync, mkdirSync, renameSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const name = argv.shift();

function option(flag, fallback) {
  const index = argv.indexOf(flag);
  if (index === -1) return fallback;
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${flag} needs a value`);
  return value;
}

try {
  if (!name || !/^[a-z0-9]+(?:-[a-z0-9]+)*(?:\.tsx?)?$/.test(name)) {
    throw new Error("component name must be a lowercase kebab-case file name");
  }
  const from = option("--from", "ui");
  const to = option("--to", "magicui");
  if (!/^[a-z0-9-]+$/.test(from) || !/^[a-z0-9-]+$/.test(to) || from === to) {
    throw new Error("source and destination must be different component directory names");
  }

  const file = extname(name) ? basename(name) : `${name}.tsx`;
  const source = join(root, "src", "components", from, file);
  const destination = join(root, "src", "components", to, file);
  if (!existsSync(source)) throw new Error(`source does not exist: src/components/${from}/${file}`);
  if (existsSync(destination)) throw new Error(`destination already exists: src/components/${to}/${file}`);

  mkdirSync(dirname(destination), { recursive: true });
  renameSync(source, destination);
  console.log(`placed ${file} in src/components/${to}/; review imports, then run pnpm check:ui`);
} catch (error) {
  console.error(`Component placement: ${error.message}`);
  process.exit(1);
}
