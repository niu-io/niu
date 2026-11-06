#!/usr/bin/env node
/**
 * Dashboard module-size gate.
 *
 * Large route/page modules are hard to review and hide unrelated coupling. A
 * new dashboard module must stay at or below the reviewability threshold, or
 * carry an explicit exception with a reason in `module-size-baseline.json`.
 *
 * The gate is intentionally about source file size, not feature importance.
 * Generated or data-only modules still need an exception so the reason is
 * visible in review.
 *
 * Usage:
 *   node scripts/check-module-size.mjs                  # enforce the threshold
 *   node scripts/check-module-size.mjs --report         # print sizes, never fail
 *   node scripts/check-module-size.mjs --update-baseline # record reviewed sizes
 */

import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const APP_ROOT = join(ROOT, 'app');
const BASELINE_PATH = join(ROOT, 'module-size-baseline.json');

/** One reviewable sitting for a route/page module. */
const THRESHOLD = 800;
const UNREVIEWED_REASON =
  'UNREVIEWED: split the module or record why this exception is acceptable before merging.';

const args = new Set(process.argv.slice(2));
const updateBaseline = args.has('--update-baseline');
const reportOnly = args.has('--report');

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist' || entry === '.react-router') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, files);
    } else if (/\.(ts|tsx)$/.test(entry)) {
      files.push(full);
    }
  }
  return files;
}

function lineCount(file) {
  const text = readFileSync(file, 'utf8');
  if (text.length === 0) return 0;
  return text.split('\n').length - (text.endsWith('\n') ? 1 : 0);
}

function loadBaseline() {
  if (!existsSync(BASELINE_PATH)) return {};
  const parsed = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
  if (!parsed || typeof parsed !== 'object' || typeof parsed.exceptions !== 'object') {
    throw new Error('module-size-baseline.json must contain an "exceptions" object.');
  }
  return parsed.exceptions;
}

const sizes = walk(APP_ROOT)
  .map(file => ({
    path: relative(ROOT, file),
    lines: lineCount(file),
  }))
  .filter(entry => entry.lines > 0)
  .sort((left, right) => right.lines - left.lines || left.path.localeCompare(right.path));

const baseline = loadBaseline();
const oversized = sizes.filter(entry => entry.lines > THRESHOLD);

if (reportOnly) {
  console.log(`Threshold: ${THRESHOLD} lines. ${oversized.length} module(s) above it.`);
  for (const entry of oversized) {
    const recorded = baseline[entry.path]?.lines;
    console.log(
      `  ${String(entry.lines).padStart(5)}${recorded ? ` (baseline ${recorded})` : ' (new)'}  ${entry.path}`,
    );
  }
  process.exit(0);
}

if (updateBaseline) {
  const exceptions = {};
  for (const entry of oversized) {
    const previous = baseline[entry.path];
    exceptions[entry.path] = {
      lines: entry.lines,
      reason: previous?.reason && previous.reason !== UNREVIEWED_REASON ? previous.reason : UNREVIEWED_REASON,
    };
  }
  writeFileSync(
    BASELINE_PATH,
    `${JSON.stringify(
      {
        note: `Modules above the ${THRESHOLD}-line reviewability threshold. Split by domain or record a reviewable reason. Regenerate with: pnpm --dir apps/dashboard exec node scripts/check-module-size.mjs --update-baseline`,
        exceptions,
      },
      null,
      2,
    )}\n`,
  );
  console.log(`Recorded ${Object.keys(exceptions).length} module-size exception(s) at ${THRESHOLD} lines.`);
  process.exit(0);
}

const errors = [];
const advisory = [];

for (const entry of oversized) {
  const exception = baseline[entry.path];
  if (!exception) {
    errors.push(
      `${entry.path}: ${entry.lines} lines exceeds the ${THRESHOLD}-line reviewability threshold and has no recorded exception. Split it by domain or add a reviewed entry to module-size-baseline.json.`,
    );
    continue;
  }
  if (!exception.reason || exception.reason.startsWith('UNREVIEWED')) {
    errors.push(`${entry.path}: module-size exception needs a reviewable reason.`);
  }
  if (entry.lines > exception.lines) {
    errors.push(
      `${entry.path}: grew from ${exception.lines} to ${entry.lines} lines. Split it or refresh the recorded size after review.`,
    );
  } else if (entry.lines < exception.lines) {
    advisory.push(`${entry.path}: ${exception.lines} -> ${entry.lines} lines; tighten the baseline.`);
  }
}

for (const path of Object.keys(baseline)) {
  if (!existsSync(join(ROOT, path))) {
    errors.push(`${path}: stale module-size exception; the module no longer exists.`);
    continue;
  }
  const current = sizes.find(entry => entry.path === path);
  if (current && current.lines <= THRESHOLD) {
    errors.push(`${path}: stale module-size exception; ${current.lines} lines is within the threshold. Remove it.`);
  } else if (!current) {
    errors.push(`${path}: stale module-size exception; the module is not part of app/.`);
  }
}

for (const note of advisory) console.log(`note: ${note}`);

if (errors.length > 0) {
  console.error(errors.join('\n'));
  process.exit(1);
}

console.log(
  `Module sizes OK: ${sizes.length} modules checked, ${oversized.length} recorded exception(s) above ${THRESHOLD} lines.`,
);
