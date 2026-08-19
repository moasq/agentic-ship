#!/usr/bin/env node
import readline from "node:readline";
import { createAgenticShipMcpServer } from "./lib/mcp-server.mjs";

const server = createAgenticShipMcpServer(process.cwd(), {
  allowMutations: process.argv.includes("--allow-mutations"),
});

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false,
});

rl.on("line", async (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;

  let request;
  try {
    request = JSON.parse(trimmed);
  } catch {
    process.stdout.write(
      JSON.stringify({
        jsonrpc: "2.0",
        id: null,
        error: { code: -32700, message: "Parse error" },
      }) + "\n",
    );
    return;
  }

  const response = await server.handleRequest(request);
  if (response) {
    process.stdout.write(JSON.stringify(response) + "\n");
  }
});
