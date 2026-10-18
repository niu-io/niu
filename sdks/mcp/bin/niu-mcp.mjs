#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { mkdir, realpath, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";
import readline from "node:readline";
import { start } from "../dist/index.js";

const ALLOWED_OUTPUT_EXTENSIONS = /\.(?:mp4|webm|mov|png|jpg|jpeg|webp|gif)$/i;

async function findExistingAncestorRealpath(targetDir) {
  let current = resolve(targetDir);
  while (true) {
    try {
      return await realpath(current);
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
        const parent = dirname(current);
        if (parent === current) throw error;
        current = parent;
        continue;
      }
      throw error;
    }
  }
}

function isWithinRoot(rootPath, candidatePath) {
  const rel = relative(rootPath, candidatePath);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

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
    if (typeof targetPath !== "string" || targetPath.trim() === "" || targetPath.includes("\0")) {
      throw new Error("output_path must be a valid file path");
    }
    const segments = targetPath.split(/[\\/]+/);
    if (segments.includes("..")) {
      throw new Error("output_path must not contain '..' path traversal segments");
    }
    const filename = basename(targetPath);
    if (!filename || !ALLOWED_OUTPUT_EXTENSIONS.test(filename)) {
      throw new Error(
        "output_path must have a valid media extension (.mp4, .webm, .mov, .png, .jpg, .jpeg, .webp, .gif)",
      );
    }
    const configuredRoot = resolve(process.env.NIU_MCP_OUTPUT_DIR || process.cwd());
    await mkdir(configuredRoot, { recursive: true });
    const realRoot = await realpath(configuredRoot);
    const resolved = resolve(configuredRoot, targetPath);
    if (resolved === configuredRoot || resolved === realRoot) {
      throw new Error("output_path must point to a file inside the allowed output directory");
    }
    const parentDir = dirname(resolved);
    const existingAncestorReal = await findExistingAncestorRealpath(parentDir);
    if (!isWithinRoot(realRoot, existingAncestorReal)) {
      throw new Error("output_path must stay within the allowed output directory");
    }
    await mkdir(parentDir, { recursive: true });
    const realParent = await realpath(parentDir);
    if (!isWithinRoot(realRoot, realParent)) {
      throw new Error("output_path must stay within the allowed output directory");
    }
    const finalPath = resolve(realParent, basename(resolved));
    if (!isWithinRoot(realRoot, finalPath) || finalPath === realRoot) {
      throw new Error("output_path must stay within the allowed output directory");
    }
    await writeFile(finalPath, bytes, { flag: "wx" });
    return resolved;
  },
}).catch((error) => {
  const message = error instanceof Error ? error.message : "niu-mcp failed";
  process.stderr.write(`niu-mcp: ${message}\n`);
  process.exit(1);
});
