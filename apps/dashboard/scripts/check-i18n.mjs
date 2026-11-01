#!/usr/bin/env node
/** Audit application TSX copy without interpreting customer data or code samples. */
import ts from 'typescript';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const allowed = new Set(['Niu', 'Niu Docs', 'API', 'SDK', 'MCP', 'HTTP', 'HTTPS', 'JSON', 'Markdown', 'UTC', 'USD', 'CNY', 'ID', 'Token', 'Tokens', 'Provider', 'OpenAI', 'Anthropic', 'OpenRouter', 'Claude Code', 'Codex', 'DeepSeek Harness', 'GitHub', 'OAuth', 'URL', 'SSE', 'SQL', 'Chat', 'Video', 'English', 'Google', 'GitLab', 'Microsoft', 'SAML', 'OIDC', 'SCIM', 'MIT', '&lt;', '<slug>', 'deepseek/deepseek-chat', 'chat', 'responses', 'messages', 'embeddings', 'generate_content']);
const attributes = new Set(['aria-label', 'aria-description', 'title', 'placeholder', 'alt', 'label', 'description', 'emptyLabel', 'loadingLabel']);
const source = fs.readFileSync(path.join(root, 'app/shell/locale-messages.ts'), 'utf8');
const messages = ts.createSourceFile('messages.ts', source, ts.ScriptTarget.Latest, true);
const known = new Set();
function keys(node) { if (ts.isPropertyAssignment(node) && ts.isStringLiteral(node.name)) { if (known.has(node.name.text)) throw new Error('Duplicate translation: ' + node.name.text); if (ts.isStringLiteral(node.initializer) && node.initializer.text.trim()) known.add(node.name.text); } ts.forEachChild(node, keys); }
keys(messages);
function files(dir) { return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? (e.name === 'ui' ? [] : files(path.join(dir, e.name))) : e.name.endsWith('.tsx') ? [path.join(dir, e.name)] : []); }
function isCopy(text) { const value = text.trim().replace(/\s+/g, ' '); return !/^(?:https?:\/\/\S+|[^\s@]+@[^\s@]+\.[^\s@]+)$/.test(value) && /[A-Za-z]{2}/.test(value) && !allowed.has(value) && !/^[\d\s.,:;·%+×/()\-]*$/.test(value); }
function inCode(node) { for (let p = node.parent; p; p = p.parent) if (ts.isJsxElement(p) && ['pre', 'code', 'script', 'style'].includes(p.openingElement.tagName.getText())) return true; return false; }
export function auditSource(text, file = 'fixture.tsx', translations = known) {
 const findings = [];
 {
 const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
 const declarations = new Map();
 function collect(node) {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
   let scope = node.parent;
   while (scope && !ts.isBlock(scope) && !ts.isSourceFile(scope)) scope = scope.parent;
   if (!declarations.has(scope)) declarations.set(scope, new Map());
   declarations.get(scope).set(node.name.text, node.initializer);
  }
  ts.forEachChild(node, collect);
 }
 collect(sf);
 function resolve(node) {
  for (let scope = node.parent; scope; scope = scope.parent) {
   if (ts.isFunctionLike(scope) && scope.parameters?.some(p => p.name.getText(sf) === node.text)) return null;
   const found = declarations.get(scope)?.get(node.text);
   if (found) return found;
  }
  return null;
 }
 const reported = new Set();
 function report(node, kind, value) { const key = `${node.pos}:${kind}`; if (reported.has(key)) return; reported.add(key); const pos = sf.getLineAndCharacterOfPosition(node.getStart(sf)); findings.push({file:path.relative(root, file),line:pos.line+1,column:pos.character+1,kind,text:value.trim().replace(/\s+/g,' ')}); }
 function visit(n) {
  if (ts.isJsxText(n) && isCopy(n.text) && !inCode(n)) report(n,'untranslated-text',n.text);
  if (ts.isJsxAttribute(n) && attributes.has(n.name.getText(sf)) && n.initializer && ts.isStringLiteral(n.initializer) && isCopy(n.initializer.text)) report(n,'untranslated-attribute',n.initializer.text);
  if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && ['t', 'uiT'].includes(n.expression.text) && n.arguments.length === 1 && ts.isStringLiteral(n.arguments[0]) && !translations.has(n.arguments[0].text) && isCopy(n.arguments[0].text)) report(n,'missing-translation',n.arguments[0].text);
  if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && ['format', 'uiF'].includes(n.expression.text) && n.arguments.length === 2 && ts.isStringLiteral(n.arguments[0]) && !translations.has(n.arguments[0].text)) report(n, 'missing-translation', n.arguments[0].text);
  if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && ['t', 'uiT'].includes(n.expression.text) && n.arguments.length === 2 && ts.isStringLiteral(n.arguments[1]) && !n.arguments[1].text.trim()) report(n, 'missing-translation', n.arguments[0].getText(sf));
  if (ts.isJsxExpression(n) && n.expression && !inCode(n) && (!ts.isJsxAttribute(n.parent) || attributes.has(n.parent.name.getText(sf)))) {
    const seen = new Set();
    const check = value => {
      if (!value || seen.has(value)) return; seen.add(value);
      if (ts.isIdentifier(value)) { check(resolve(value)); return; }
      if (ts.isParenthesizedExpression(value)) { check(value.expression); return; }
      if ((ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value)) && isCopy(value.text)) report(value,'untranslated-expression',value.text);
      else if (ts.isConditionalExpression(value)) { check(value.whenTrue); check(value.whenFalse); }
      else if (ts.isBinaryExpression(value) && [ts.SyntaxKind.AmpersandAmpersandToken,ts.SyntaxKind.BarBarToken,ts.SyntaxKind.QuestionQuestionToken].includes(value.operatorToken.kind)) check(value.right);
      else if (ts.isTemplateExpression(value)) {
       if (isCopy(value.head.text + value.templateSpans.map(x=>x.literal.text).join(''))) report(value,'untranslated-template',value.getText(sf));
       else for (const span of value.templateSpans) check(span.expression);
      }
      else if (ts.isCallExpression(value) && ts.isIdentifier(value.expression) && ['uiF', 'format'].includes(value.expression.text) && value.arguments[1] && ts.isArrayLiteralExpression(value.arguments[1])) for (const item of value.arguments[1].elements) check(item);
    };
    check(n.expression);
  }
  ts.forEachChild(n, visit);
 }
 visit(sf);
}
 return findings;
}
/** Detect finite display-label unions, including imported choice arrays and API enums. */
export function auditTypedDisplay(program, dashboardRoot = root) {
 const checker = program.getTypeChecker();
 const results = [];
 const translatedCalls = new Set(['t', 'uiT', 'format', 'uiF', 'translateUI', 'formatLocalizedMessage']);
 function localized(node, seen = new Set()) {
  if (!node || seen.has(node)) return false;
  seen.add(node);
  if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && translatedCalls.has(node.expression.text)) return true;
  if (ts.isStringLiteral(node)) return !isCopy(node.text);
  if (ts.isConditionalExpression(node)) return localized(node.whenTrue, new Set(seen)) && localized(node.whenFalse, new Set(seen));
  if (ts.isIdentifier(node)) {
   const declaration = checker.getSymbolAtLocation(node)?.valueDeclaration;
   if (declaration && ts.isVariableDeclaration(declaration)) return localized(declaration.initializer, seen);
  }
  return false;
 }
 for (const sf of program.getSourceFiles()) {
  const relative = path.relative(dashboardRoot, sf.fileName).split(path.sep).join('/');
  if (!relative.startsWith('app/') || relative.includes('/ui/') || !relative.endsWith('.tsx')) continue;
  function visit(node) {
   if (ts.isJsxExpression(node) && node.expression && !inCode(node) && (!ts.isJsxAttribute(node.parent) || attributes.has(node.parent.name.getText(sf)))) {
    const expression = node.expression;
    if ((ts.isIdentifier(expression) || ts.isPropertyAccessExpression(expression) || ts.isElementAccessExpression(expression) || ts.isCallExpression(expression)) && !localized(expression)) {
     const type = checker.getTypeAtLocation(expression);
     const types = type.isUnion() ? type.types : [type];
     if (!types.some(t => t.flags & (ts.TypeFlags.String | ts.TypeFlags.Any | ts.TypeFlags.Unknown))) {
      const labels = [...new Set(types.filter(t => t.flags & ts.TypeFlags.StringLiteral).map(t => t.value).filter(isCopy))];
      if (labels.length) {
       const pos = sf.getLineAndCharacterOfPosition(expression.getStart(sf));
       results.push({file: relative, line: pos.line + 1, column: pos.character + 1, kind: 'untranslated-choice-label', text: labels.join(' | ')});
      }
     }
    }
   }
   ts.forEachChild(node, visit);
  }
  visit(sf);
 }
 return results;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
 const config = ts.readConfigFile(path.join(root, 'tsconfig.json'), ts.sys.readFile);
 if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'));
 const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
 const program = ts.createProgram(parsed.fileNames, parsed.options, ts.createCompilerHost(parsed.options, true));
 const findings = [...files(path.join(root, 'app')).flatMap(file => auditSource(fs.readFileSync(file, 'utf8'), file)), ...auditTypedDisplay(program)];
 if (process.argv.includes('--json')) process.stdout.write(JSON.stringify(findings, null, 2) + '\n');
 else {
  for (const x of findings) console.error(`${x.file}:${x.line}:${x.column} ${x.kind}: ${x.text}`);
  console.log(`i18n: ${findings.length} findings. Full dashboard TSX audit; no baseline waivers.`);
 }
 process.exitCode = findings.length ? 1 : 0;
}
