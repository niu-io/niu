#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import readline from "node:readline";
import { start } from "../dist/index.js";

const lines = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
const hostedSource = readFileSync(new URL("../hosted/niu.io.json", import.meta.url), "utf8");

start(process.argv.slice(2), process.env, {
  hostedSource,
  lines,
  write(line) {
    process.stdout.write(`${line}\n`);
  },
  // Never forward credentials through redirects or retry potentially billed calls.
  // The signal also bounds consumption of a response body after headers arrive.
  fetch: (url, init) => globalThis.fetch(url, {
    ...init,
    redirect: "error",
    signal: AbortSignal.timeout(180_000),
  }),
  async writeBinaryFile(targetPath, bytes) {
    const resolved = resolve(targetPath);
    await mkdir(dirname(resolved), { recursive: true });
    await writeFile(resolved, bytes);
    return resolved;
  },
}).catch((error) => {
  const message = error instanceof Error ? error.message : "niu-mcp failed";
  process.stderr.write(`niu-mcp: ${message}\n`);
  process.exit(1);
});
