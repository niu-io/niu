#!/usr/bin/env node
/**
 * Dashboard lint gate.
 *
 * Biome runs over app/, scripts/ and test/ (TypeScript, TSX, JavaScript and
 * CSS). The current tree carries a recorded number of pre-existing diagnostics
 * so the gate can be adopted without a repository-wide rewrite. Any increase
 * over the recorded count fails; decreases are reported so the baseline can be
 * tightened.
 *
 * Usage:
 *   node scripts/lint.mjs                  # enforce the checked-in baseline
 *   node scripts/lint.mjs --update-baseline # rewrite the baseline (review the diff)
 *   node scripts/lint.mjs --report         # print counts without failing
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const BASELINE_PATH = join(ROOT, 'lint-baseline.json');
const BIOME_BIN = join(ROOT, 'node_modules/.bin/biome');
const MAX_DIAGNOSTICS = '20000';

function runBiome() {
  try {
    return execFileSync(
      BIOME_BIN,
      ['lint', '--reporter=json', `--max-diagnostics=${MAX_DIAGNOSTICS}`],
      {
        cwd: ROOT,
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'ignore'],
      },
    );
  } catch (error) {
    if (typeof error.stdout === 'string' && error.stdout.trim()) return error.stdout;
    throw new Error(`Biome could not run:\n${error.stderr || error.message}`);
  }
}

function parseReport(output) {
  let report;
  try {
    report = JSON.parse(output);
  } catch {
    throw new Error(`Biome did not return JSON:\n${output.slice(0, 2000)}`);
  }
  if (!Array.isArray(report.diagnostics)) {
    throw new Error('Biome report did not contain a diagnostics array.');
  }
  return report.diagnostics;
}

function summarise(diagnostics) {
  const counts = {};
  for (const diagnostic of diagnostics) {
    const category = diagnostic.category ?? 'unknown';
    counts[category] = (counts[category] ?? 0) + 1;
  }
  return counts;
}

function printTop(counts, limit = 12) {
  for (const [category, count] of Object.entries(counts)
    .sort((left, right) => right[1] - left[1])
    .slice(0, limit)) {
    console.log(`  ${String(count).padStart(5)}  ${category}`);
  }
}

const args = new Set(process.argv.slice(2));
const diagnostics = parseReport(runBiome());
const hardFailures = diagnostics.filter(
  (diagnostic) => !String(diagnostic.category ?? '').startsWith('lint/'),
);
const counts = summarise(
  diagnostics.filter((diagnostic) =>
    String(diagnostic.category ?? '').startsWith('lint/'),
  ),
);
const total = Object.values(counts).reduce((sum, count) => sum + count, 0);

console.log(`Biome diagnostics: ${total} across ${Object.keys(counts).length} rules.`);

if (hardFailures.length > 0) {
  console.error('\nNon-lint diagnostics (configuration or parser errors) must be fixed:');
  for (const failure of hardFailures.slice(0, 20)) {
    const location = failure.location;
    const where = location ? `${location.path}:${location.start.line}` : 'unknown file';
    console.error(`  ${where} ${failure.category}: ${failure.message}`);
  }
  if (hardFailures.length > 20) {
    console.error(`  ... and ${hardFailures.length - 20} more.`);
  }
  process.exit(1);
}

if (args.has('--update-baseline')) {
  const baseline = {
    generatedAt: new Date().toISOString().slice(0, 10),
    command: 'pnpm --filter @niu-io/dashboard lint',
    scope: 'apps/dashboard app/, scripts/ and test/: TS, TSX, JS, MJS and CSS',
    total,
    rules: Object.fromEntries(Object.entries(counts).sort()),
  };
  writeFileSync(BASELINE_PATH, `${JSON.stringify(baseline, null, 2)}\n`);
  console.log(`Baseline written to ${BASELINE_PATH} (${total} diagnostics).`);
  printTop(counts);
  process.exit(0);
}

if (!existsSync(BASELINE_PATH)) {
  console.error('Missing lint-baseline.json. Run node scripts/lint.mjs --update-baseline.');
  process.exit(1);
}

const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
const baselineRules = baseline.rules ?? {};
const regressions = [];
for (const [category, count] of Object.entries(counts)) {
  const recorded = baselineRules[category] ?? 0;
  if (count > recorded) regressions.push({ category, count, recorded });
}

if (args.has('--report')) {
  console.log(`Baseline: ${baseline.total} diagnostics.`);
  printTop(counts);
  process.exit(0);
}

if (regressions.length > 0) {
  console.error('\nNew lint violations exceed the checked-in baseline:');
  for (const regression of regressions) {
    console.error(
      `  ${regression.category}: ${regression.recorded} -> ${regression.count} (+${regression.count - regression.recorded})`,
    );
    for (const diagnostic of diagnostics
      .filter((item) => item.category === regression.category)
      .slice(0, 8)) {
      const location = diagnostic.location;
      const where = location
        ? `${location.path}:${location.start.line}:${location.start.column}`
        : 'unknown file';
      console.error(`    ${where} ${diagnostic.message.split('\n')[0]}`);
    }
  }
  console.error(
    '\nFix the new findings. If the tree intentionally carries more debt, update ' +
      'lint-baseline.json with node scripts/lint.mjs --update-baseline and explain the count change.',
  );
  process.exit(1);
}

const decrease = (baseline.total ?? 0) - total;
console.log(`Baseline: ${baseline.total} diagnostics.`);
if (decrease > 0) {
  console.log(
    `${decrease} fewer diagnostics than the baseline; rerun ` +
      'node scripts/lint.mjs --update-baseline to tighten it.',
  );
}
