#!/usr/bin/env node
import { existsSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const componentsRoot = join(root, "src", "components");
const query = process.argv.slice(2).join(" ").trim().toLowerCase();
const sourceFile = /\.[cm]?[jt]sx?$/;
const supportFile = /(?:\.fixture|\.stories|\.test|\.spec)\.[cm]?[jt]sx?$/;

function walk(directory, files = []) {
  if (!existsSync(directory)) return files;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) walk(absolute, files);
    else if (entry.isFile() && sourceFile.test(entry.name) && !supportFile.test(entry.name)) files.push(absolute);
  }
  return files;
}

const matches = walk(componentsRoot)
  .map((file) => relative(root, file).split(sep).join("/"))
  .filter((file) => !query || file.toLowerCase().includes(query))
  .sort((left, right) => left.localeCompare(right));

if (matches.length === 0) {
  console.log(`Component discovery: no local match${query ? ` for \`${query}\`` : ""}. Use the component-picker catalog path next.`);
  process.exit(0);
}

console.log(`Component discovery: ${matches.length} local candidate(s)${query ? ` for \`${query}\`` : ""}\n`);
for (const file of matches) console.log(`  ${file}`);
