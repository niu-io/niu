#!/usr/bin/env node
/**
 * Reproducible unused-CSS audit for the dashboard stylesheet.
 *
 * The check is deliberately conservative:
 * - a class counts as used when its token appears outside the stylesheet;
 * - class names composed by an interpolated template in app/ code are protected;
 * - selectors are only removable when every class they require is unreferenced;
 * - classes inside :not(...) are inverse conditions, so they are never enough
 *   on their own to prove that a selector cannot match.
 *
 * Usage:
 *   node scripts/check-css-usage.mjs            # fail on removable dead selectors
 *   node scripts/check-css-usage.mjs --report   # print the audit, exit 0
 *   node scripts/check-css-usage.mjs --write    # remove dead selectors in place
 *   node scripts/check-css-usage.mjs --json     # machine-readable report
 */

import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CSS_PATH = join(ROOT, 'app/styles.css');
const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  '.git',
  '.react-router',
  'target',
  '.beads',
  '.agents',
]);
const TEXT_FILE = /\.(ts|tsx|js|jsx|mjs|cjs|css|html|astro|md|mdx|json|ya?ml|txt)$/;
const APP_CODE = /\.(ts|tsx|js|jsx|mjs|cjs)$/;

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith('.')) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (!SKIP_DIRS.has(entry)) walk(full, files);
    } else if (TEXT_FILE.test(entry)) {
      files.push(full);
    }
  }
  return files;
}

function skipString(text, index) {
  const quote = text[index];
  index += 1;
  while (index < text.length) {
    if (text[index] === '\\') {
      index += 2;
      continue;
    }
    if (text[index] === quote) return index + 1;
    index += 1;
  }
  throw new Error('unterminated string');
}

function skipComment(text, index) {
  const end = text.indexOf('*/', index + 2);
  if (end < 0) throw new Error('unterminated comment');
  return end + 2;
}

function matchBrace(text, index) {
  let depth = 0;
  while (index < text.length) {
    const char = text[index];
    if (char === '"' || char === "'") {
      index = skipString(text, index);
      continue;
    }
    if (char === '/' && text[index + 1] === '*') {
      index = skipComment(text, index);
      continue;
    }
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return index;
    }
    index += 1;
  }
  throw new Error('unbalanced brace');
}

const GROUPING_AT_RULES = new Set([
  'media',
  'supports',
  'layer',
  'container',
  'scope',
  'starting-style',
]);

function parseStylesheet(text, start = 0, end = text.length) {
  const nodes = [];
  let index = start;
  while (index < end) {
    const leadStart = index;
    while (index < end && /\s/.test(text[index])) index += 1;
    if (index >= end) break;
    const lead = text.slice(leadStart, index);
    if (text[index] === '/' && text[index + 1] === '*') {
      const commentEnd = skipComment(text, index);
      nodes.push({
        type: 'comment',
        lead,
        raw: text.slice(index, commentEnd),
      });
      index = commentEnd;
      continue;
    }
    const preludeStart = index;
    while (index < end) {
      const char = text[index];
      if (char === '"' || char === "'") {
        index = skipString(text, index);
        continue;
      }
      if (char === '/' && text[index + 1] === '*') {
        index = skipComment(text, index);
        continue;
      }
      if (char === '{' || char === ';') break;
      index += 1;
    }
    const prelude = text.slice(preludeStart, index);
    if (index >= end) {
      nodes.push({ type: 'text', lead, raw: text.slice(preludeStart, end) });
      break;
    }
    if (text[index] === ';') {
      nodes.push({ type: 'statement', lead, raw: `${prelude};` });
      index += 1;
      continue;
    }
    const open = index;
    const close = matchBrace(text, index);
    const body = text.slice(open + 1, close);
    if (prelude.trimStart().startsWith('@')) {
      const name = (prelude.match(/^@([\w-]+)/) ?? [])[1] ?? '';
      const node = { type: 'at', lead, prelude, body };
      if (GROUPING_AT_RULES.has(name)) {
        node.children = parseStylesheet(text, open + 1, close);
      }
      nodes.push(node);
    } else {
      nodes.push({
        type: 'rule',
        lead,
        selector: prelude,
        body,
      });
    }
    index = close + 1;
  }
  return nodes;
}

const CLASS_TOKEN = /\.(-?[_a-zA-Z][_a-zA-Z0-9-]*)/g;

function classTokens(selector) {
  const classes = new Set();
  for (const match of selector.matchAll(CLASS_TOKEN)) classes.add(match[1]);
  return classes;
}

function splitSelectors(selector) {
  const parts = [];
  let depth = 0;
  let quote = null;
  let start = 0;
  for (let index = 0; index < selector.length; index += 1) {
    const char = selector[index];
    if (quote) {
      if (char === '\\') index += 1;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === '(' || char === '[') depth += 1;
    else if (char === ')' || char === ']') depth -= 1;
    else if (char === ',' && depth === 0) {
      parts.push(selector.slice(start, index).trim());
      start = index + 1;
    }
  }
  parts.push(selector.slice(start).trim());
  return parts.filter(Boolean);
}

const NON_REQUIRED_PSEUDOS = ['not', 'is', 'where'];

/**
 * Remove arguments of :not(), :is() and :where(). A class inside :not is an
 * inverse condition, and a class inside :is/:where is only one alternative, so
 * none of them proves that a selector requires that class to be present.
 */
function withoutOptionalClassArguments(selector) {
  let result = '';
  let index = 0;
  while (index < selector.length) {
    const lower = selector.slice(index).toLowerCase();
    const pseudo = NON_REQUIRED_PSEUDOS.find((name) => lower.startsWith(`:${name}(`));
    if (pseudo) {
      let depth = 0;
      let cursor = index + pseudo.length + 2;
      while (cursor < selector.length) {
        const char = selector[cursor];
        if (char === '(') depth += 1;
        else if (char === ')') {
          depth -= 1;
          if (depth === 0) break;
        }
        cursor += 1;
      }
      index = cursor + 1;
      continue;
    }
    result += selector[index];
    index += 1;
  }
  return result;
}

function requiredClasses(selector) {
  return classTokens(withoutOptionalClassArguments(selector));
}

/** Source ranges that can produce a class list (className, cn(), classList). */
function classTemplateRanges(file, text) {
  if (!/\.(tsx?|jsx?)$/.test(file)) return [];
  const source = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const ranges = [];
  const mark = (node) => {
    if (node) ranges.push([node.getStart(source), node.getEnd()]);
  };
  const visit = (node) => {
    if (ts.isJsxAttribute(node) && /^(className|class)$/.test(node.name.getText())) {
      mark(node.initializer);
    } else if (ts.isCallExpression(node)) {
      const callee = node.expression.getText(source);
      if (/^(cn|clsx|cva|classNames|twMerge)$/.test(callee) || /^classList\./.test(callee)) {
        for (const argument of node.arguments) mark(argument);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return ranges;
}

function templateFragments() {
  const prefixes = new Set();
  const suffixes = new Set();
  for (const file of walk(join(ROOT, 'app'))) {
    if (!APP_CODE.test(file)) continue;
    const text = readFileSync(file, 'utf8');
    const classRanges = classTemplateRanges(file, text);
    const isClassRange = (index) =>
      classRanges.some(([start, end]) => index >= start && index <= end);
    for (let index = 0; index < text.length; index += 1) {
      if (text[index] !== '`') continue;
      let cursor = index + 1;
      const parts = [];
      let current = '';
      while (cursor < text.length) {
        if (text[cursor] === '\\') {
          current += text[cursor] + (text[cursor + 1] ?? '');
          cursor += 2;
          continue;
        }
        if (text[cursor] === '`') {
          parts.push(current);
          break;
        }
        if (text[cursor] === '$' && text[cursor + 1] === '{') {
          parts.push(current);
          current = '';
          let depth = 1;
          cursor += 2;
          while (cursor < text.length && depth > 0) {
            if (text[cursor] === '{') depth += 1;
            else if (text[cursor] === '}') depth -= 1;
            cursor += 1;
          }
          continue;
        }
        current += text[cursor];
        cursor += 1;
      }
      for (let partIndex = 0; partIndex < parts.length; partIndex += 1) {
        if (partIndex < parts.length - 1) {
          const match = parts[partIndex].match(/([A-Za-z][\w-]*-)$/);
          if (match && match[1].length >= 4) prefixes.add(match[1]);
        }
        if (partIndex > 0) {
          const match = parts[partIndex].match(/^(-[\w-]*[A-Za-z][\w-]*)/);
          if (match && match[1].length >= 4 && isClassRange(index)) {
            suffixes.add(match[1]);
          }
        }
      }
    }
    // String concatenation is the other composition form used in the app, e.g.
    // `'operator-session-state state-' + state`. The literal may hold several
    // classes, so inspect its boundary token rather than the whole string.
    for (const match of text.matchAll(/['"]([^'"]*)['"]\s*\+/g)) {
      const last = match[1].trim().split(/\s+/).at(-1) ?? '';
      if (/^[A-Za-z][\w-]*-$/.test(last) && last.length >= 4) prefixes.add(last);
    }
    for (const match of text.matchAll(/\+\s*['"]([^'"]*)['"]/g)) {
      const first = match[1].trim().split(/\s+/)[0] ?? '';
      if (/^-[A-Za-z][\w-]*$/.test(first) && first.length >= 4) suffixes.add(first);
    }
  }
  return { prefixes: [...prefixes], suffixes: [...suffixes] };
}

const CSS_DIR = join(ROOT, 'app/styles');

function cssFiles() {
  if (!existsSync(CSS_DIR)) return [CSS_PATH];
  const nested = readdirSync(CSS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.css'))
    .map((entry) => join(CSS_DIR, entry.name))
    .sort();
  return [CSS_PATH, ...nested];
}

function collectClasses(nodes, allClasses) {
  for (const node of nodes) {
    if (node.type === 'rule') {
      for (const selector of splitSelectors(node.selector)) {
        for (const className of classTokens(selector)) allClasses.add(className);
      }
    } else if (node.type === 'at' && node.children) {
      collectClasses(node.children, allClasses);
    }
  }
}

function buildReport() {
  const sheets = cssFiles().map((file) => {
    const css = readFileSync(file, 'utf8');
    return { path: file, css, stylesheet: parseStylesheet(css), removals: [] };
  });
  const allClasses = new Set();
  for (const sheet of sheets) collectClasses(sheet.stylesheet, allClasses);

  const files = walk(ROOT).filter((file) => !sheets.some((sheet) => sheet.path === file));
  const corpus = files.map((file) => readFileSync(file, 'utf8')).join('\n');
  const { prefixes, suffixes } = templateFragments();
  const used = new Set();
  const protectedClasses = new Set();
  const unused = new Set();
  for (const className of allClasses) {
    const escaped = className.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`(?<![\\w-])${escaped}(?![\\w-])`).test(corpus)) {
      used.add(className);
    } else if (prefixes.some((prefix) => className.startsWith(prefix))) {
      protectedClasses.add(className);
    } else if (suffixes.some((suffix) => className.endsWith(suffix))) {
      protectedClasses.add(className);
    } else {
      unused.add(className);
    }
  }

  for (const sheet of sheets) {
    const visit = (nodes) => {
      for (const node of nodes) {
        if (node.type === 'at' && node.children) {
          visit(node.children);
          continue;
        }
        if (node.type !== 'rule') continue;
        const selectors = splitSelectors(node.selector);
        const kept = [];
        const removed = [];
        for (const selector of selectors) {
          const required = requiredClasses(selector);
          const dead =
            required.size > 0 && [...required].some((className) => unused.has(className));
          if (dead) {
            removed.push(selector);
          } else {
            kept.push(selector);
          }
        }
        if (removed.length > 0) {
          sheet.removals.push({ kept, removed, node });
        }
      }
    };
    visit(sheet.stylesheet);
  }

  const remaining = new Set();
  for (const sheet of sheets) {
    const removalByNode = new Map(
      sheet.removals.map((removal) => [removal.node, removal]),
    );
    const collectRemaining = (nodes) => {
      for (const node of nodes) {
        if (node.type === 'at' && node.children) {
          collectRemaining(node.children);
          continue;
        }
        if (node.type !== 'rule') continue;
        const removal = removalByNode.get(node);
        const selectors = removal ? removal.kept : splitSelectors(node.selector);
        for (const selector of selectors) {
          for (const className of classTokens(selector)) remaining.add(className);
        }
      }
    };
    collectRemaining(sheet.stylesheet);
  }

  const removable = new Set([...unused].filter((className) => !remaining.has(className)));
  const retained = new Set([...unused].filter((className) => remaining.has(className)));

  const totalBytes = sheets.reduce((sum, sheet) => sum + Buffer.byteLength(sheet.css), 0);
  const removableBytes = sheets.reduce(
    (sum, sheet) =>
      sum +
      sheet.removals.reduce(
        (inner, removal) => inner + Buffer.byteLength(removal.removed.join(',')),
        0,
      ),
    0,
  );
  return {
    sheets,
    allClasses,
    used,
    protectedClasses,
    unused,
    removable,
    retained,
    totalBytes,
    removableBytes,
  };
}

function serialize(nodes) {
  let output = '';
  for (const node of nodes) {
    if (node.type === 'comment' || node.type === 'statement' || node.type === 'text') {
      output += node.lead + node.raw;
      continue;
    }
    if (node.type === 'rule') {
      if (node.keepSelectors) {
        if (node.keepSelectors.length === 0) continue;
        output += `${node.lead}${node.keepSelectors.join(',')} {${node.body}}`;
      } else {
        output += `${node.lead}${node.selector}{${node.body}}`;
      }
      continue;
    }
    const childText = node.children ? serialize(node.children) : node.body;
    if (node.children && !/[^\s]/.test(childText.replace(/\/\*[\s\S]*?\*\//g, ''))) {
      continue;
    }
    output += `${node.lead}${node.prelude}{${childText}}`;
  }
  return output;
}

function writeRemovals(report) {
  let before = 0;
  let after = 0;
  for (const sheet of report.sheets) {
    const byNode = new Map(sheet.removals.map((removal) => [removal.node, removal]));
    const annotate = (nodes) => {
      for (const node of nodes) {
        const removal = byNode.get(node);
        if (removal) {
          node.keepSelectors = removal.kept;
        } else if (node.type === 'at' && node.children) {
          annotate(node.children);
        }
      }
    };
    annotate(sheet.stylesheet);
    let output = serialize(sheet.stylesheet);
    output = output.replace(/\n{3,}/g, '\n\n');
    if (!output.endsWith('\n')) output += '\n';
    writeFileSync(sheet.path, output);
    before += Buffer.byteLength(sheet.css);
    after += Buffer.byteLength(output);
  }
  return { before, after };
}

const args = new Set(process.argv.slice(2));
const report = buildReport();
const summary = {
  stylesheetBytes: report.totalBytes,
  classes: report.allClasses.size,
  used: report.used.size,
  dynamicallyProtected: report.protectedClasses.size,
  unused: report.unused.size,
  removable: report.removable.size,
  retained: report.retained.size,
  removableBytes: report.removableBytes,
  removedClasses: [...report.removable].sort(),
  protectedClasses: [...report.protectedClasses].sort(),
  retainedClasses: [...report.retained].sort(),
};

if (args.has('--json')) {
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
} else if (args.has('--write')) {
  const { before, after } = writeRemovals(report);
  console.log(
    `Removed ${report.removable.size} unreferenced classes in ` +
      `${report.sheets.reduce((sum, sheet) => sum + sheet.removals.length, 0)} selectors.`,
  );
  console.log(`stylesheet: ${before} -> ${after} bytes`);
  console.log(`removed classes: ${[...report.removable].sort().join(', ')}`);
} else {
  console.log(`stylesheet: ${report.totalBytes} bytes, ${report.allClasses.size} classes`);
  console.log(
    `used ${report.used.size}, dynamically protected ${report.protectedClasses.size}, ` +
      `unreferenced ${report.unused.size}, removable ${report.removable.size}, ` +
      `retained ${report.retained.size}`,
  );
  if (args.has('--report')) process.exit(0);
  if (report.removable.size > 0) {
    console.error(
      `\n${report.removable.size} unreferenced classes remain in removable selectors:`,
    );
    console.error([...report.removable].sort().join(' '));
    process.exit(1);
  }
}
