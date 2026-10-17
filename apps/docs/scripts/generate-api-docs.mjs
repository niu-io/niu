import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import YAML from 'yaml';
import { isDeepStrictEqual } from 'node:util';
import { addOpenApiNavigation } from './openapi-navigation.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const check = process.argv.includes('--check');
const outputFlag = process.argv.indexOf('--output-dir');
const outputRoot = outputFlag < 0 ? root : path.resolve(process.argv[outputFlag + 1]);
const outputs = new Map();
const files = new Map();
function read(file) {
  if (!files.has(file)) files.set(file, file.endsWith('.json') ? JSON.parse(fs.readFileSync(file, 'utf8')) : YAML.parse(fs.readFileSync(file, 'utf8')));
  return files.get(file);
}
function pointer(doc, fragment) {
  return fragment.split('/').slice(1).reduce((value, key) => {
    const decoded = key.replace(/~1/g, '/').replace(/~0/g, '~');
    if (value?.[decoded] === undefined) throw new Error(`Unresolved reference ${fragment}`);
    return value[decoded];
  }, doc);
}
const source = path.join(root, 'contracts/openapi.yaml');
const components = {};
const registered = new Map();
const methods = new Set(['get','post','put','patch','delete','head','options','trace']);
function bundle(value, file, location = [], inheritSecurity = true) {
  if (Array.isArray(value)) return value.map(v => bundle(v, file, location));
  if (!value || typeof value !== 'object') return value;
  if (value.$ref) {
    const [relative, rawFragment = ''] = value.$ref.split('#');
    const target = path.resolve(path.dirname(file), relative || path.basename(file));
    if (!target.startsWith(path.join(root, 'contracts') + path.sep)) throw new Error('Contract reference escapes public contracts');
    const fragment = decodeURIComponent(rawFragment);
    const object = pointer(read(target), fragment);
    const parts = fragment.split('/');
    if (parts[1] !== 'components') return { ...bundle(object, target, location), ...bundle(Object.fromEntries(Object.entries(value).filter(([k]) => k !== '$ref')), file, location, false) };
    const category = parts[2];
    const key = target + '#' + fragment;
    if (!registered.has(key)) {
      const name = target === source ? parts[3] : path.basename(target).replace(/[^a-zA-Z0-9]/g, '_') + '_' + parts[3];
      registered.set(key, `#/components/${category}/${name}`);
      components[category] ??= {};
      components[category][name] = null;
      components[category][name] = bundle(object, target);
    }
    return { $ref: registered.get(key), ...bundle(Object.fromEntries(Object.entries(value).filter(([k]) => k !== '$ref')), file) };
  }
  // Materialize the owning document's default at each operation. A referenced
  // operation must not inherit the importing document's unrelated default.
  // Explicit empty requirements stay public; Reference Object siblings override
  // the resolved target only when they actually declare security.
  if (inheritSecurity && location.length === 3 && location[0] === 'paths'
      && methods.has(location[2]) && !Object.hasOwn(value, 'security')) {
    value = { ...value, security: read(file).security ?? [] };
  }
  // Security requirements refer to components by name, rather than by $ref.
  // Preserve those names across contract boundaries and reject ambiguous merges.
  if (Array.isArray(value.security)) for (const requirement of value.security) {
    for (const name of Object.keys(requirement)) {
      const definition = read(file).components?.securitySchemes?.[name]
        ?? read(source).components?.securitySchemes?.[name];
      if (!definition) throw new Error(`Undefined security scheme ${name} in ${file}`);
      const scheme = bundle(definition, file);
      const rootDefinition = read(source).components?.securitySchemes?.[name];
      if (rootDefinition && !isDeepStrictEqual(bundle(rootDefinition, source), scheme)) {
        throw new Error(`Conflicting security scheme ${name} in ${file}`);
      }
      components.securitySchemes ??= {};
      const previous = components.securitySchemes[name];
      if (previous && !isDeepStrictEqual(previous, scheme)) throw new Error(`Conflicting security scheme ${name} in ${file}`);
      components.securitySchemes[name] = scheme;
    }
  }
  return Object.fromEntries(Object.entries(value).map(([k,v]) => [k, bundle(v, file, [...location, k])]));
}
const spec = bundle(read(source), source);
for (const [category, values] of Object.entries(components)) spec.components[category] = { ...spec.components[category], ...values };
function validateRefs(value) {
  if (!value || typeof value !== 'object') return;
  if (value.$ref) {
    if (!value.$ref.startsWith('#/')) throw new Error('External reference remains: ' + value.$ref);
    pointer(spec, value.$ref.slice(1));
  }
  Object.values(value).forEach(validateRefs);
}
validateRefs(spec);
for (const item of [spec, ...Object.values(spec.paths).flatMap(item => Object.values(item))]) {
  for (const requirement of item?.security ?? []) for (const name of Object.keys(requirement)) {
    if (!spec.components?.securitySchemes?.[name]) throw new Error(`Undefined bundled security scheme ${name}`);
  }
}
addOpenApiNavigation(spec);
outputs.set('contracts/generated/public-openapi.json', JSON.stringify(spec, null, 2) + '\n');
const generated = 'Generated from the checked-in source. Do not edit this reference by hand.';
function page(title, description, lines) { return ['---', `title: ${JSON.stringify(title)}`, `description: ${JSON.stringify(description)}`, 'tableOfContents: false', '---', '', generated, '', ...lines].join('\n') + '\n'; }
function block(language, value) { return ['```' + language, value, '```', '']; }
function resolveSchema(schema, seen = new Set()) {
  if (!schema || typeof schema !== 'object') return schema;
  if (schema.$ref) {
    if (seen.has(schema.$ref)) return schema;
    return resolveSchema(pointer(spec, schema.$ref.slice(1)), new Set([...seen, schema.$ref]));
  }
  if (Array.isArray(schema)) return schema.map(s=>resolveSchema(s, seen));
  return Object.fromEntries(Object.entries(schema).map(([k,v])=>[k, typeof v==='object' ? resolveSchema(v, seen) : v]));
}
const restIndex = ['[Download the full OpenAPI JSON](/docs/openapi/public.json). Authentication, parameters, request bodies and response schemas below come from that same contract.', '', 'The contract includes endpoints with explicit limitations or stub status. Read the scope on each operation.', ''];
const restGroups = new Map();
let operations = 0;
for (const [route,item] of Object.entries(spec.paths)) for (const [method,operation] of Object.entries(item)) {
  if (!methods.has(method)) continue;
  const slug = (operation.operationId || method + '-' + route).replace(/[^a-zA-Z0-9_-]/g,'-').toLowerCase();
  if (outputs.has(`apps/docs/src/content/docs/api/rest/${slug}.md`)) throw new Error('Duplicate operation slug '+slug);
  operations++;
  const group = /^\/v1\/(video|media|images)/.test(route) ? 'Video and media APIs'
    : /^\/v1(?:\/|$)|^\/v1beta\//.test(route) ? 'Model APIs'
    : /^\/api\/v1\/(providers|provider-memberships|vendors|routing-registry|model-route-pools)/.test(route) ? 'Providers and routing APIs'
    : /^\/api\/v1\/(auth\/|session$|operators)/.test(route) ? 'Authentication and sessions'
    : /^\/api\/v1\/(organizations|workspaces|setup\/default-workspace|guardrails|metrics|models|pricing|financial-summary|commercial-position)/.test(route) ? 'Workspace and company APIs'
    : 'Service endpoints';
  if (!restGroups.has(group)) restGroups.set(group, []);
  restGroups.get(group).push({route, method, link:`- [\`${method.toUpperCase()} ${route}\` — ${operation.summary || operation.operationId}](/docs/api/rest/${slug}/)`});
  const lines = [`\`${method.toUpperCase()} ${route}\``, '', operation.description || '', '', `Operation: \`${operation.operationId || slug}\`.`, ''];

  const security = operation.security ?? spec.security ?? [];
  lines.push('## Authentication','', security.length ? 'Use the credential and permission scope described above. Each object below is an alternative; schemes within one object are required together.' : 'No OpenAPI security scheme is required. Other request validation still applies.', '', ...block('json', JSON.stringify(security,null,2)));
  const body = operation.requestBody?.$ref ? pointer(spec, operation.requestBody.$ref.slice(1)) : operation.requestBody;
  const mediaType = Object.keys(body?.content || {})[0];
  const authName = route.startsWith('/api/') ? 'NIU_SESSION_TOKEN' : 'NIU_API_KEY';
  const parameters = new Map();
  for (const raw of [...(item.parameters || []), ...(operation.parameters || [])]) {
    const parameter = raw.$ref ? pointer(spec, raw.$ref.slice(1)) : raw;
    const name = parameter.in === 'header' ? parameter.name.toLowerCase() : parameter.name;
    parameters.set(parameter.in + ':' + name, parameter);
  }
  const params = [...(item.parameters || []), ...(operation.parameters || [])].map(p => p.$ref ? pointer(spec, p.$ref.slice(1)) : p);
  const command = ['curl --fail-with-body -X '+method.toUpperCase()+' \"$NIU_ORIGIN'+route+'\"'];
  if (security.length) command.push('  -H \"Authorization: Bearer $'+authName+'\"');
  const requiredHeaders = [...parameters.values()].filter(p => p.in === 'header' && p.required);
  for (const parameter of requiredHeaders) {
    const name = parameter.name.toLowerCase();
    if ((name === 'authorization' && security.length) || (name === 'content-type' && mediaType)) continue;
    if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(parameter.name)) throw new Error('Invalid header parameter name');
    // Never embed schema examples: required headers may carry credentials or private origins.
    const placeholder = parameter.name.toUpperCase().replace(/[^A-Z0-9]/g, '_');
    const header = parameter.name + ': <' + placeholder + '>';
    command.push("  -H '" + header.replaceAll("'", "'\"'\"'") + "'");
  }
  if (mediaType) command.push("  -H 'Content-Type: "+mediaType+"'", mediaType === 'application/json' ? '  --data @request.json' : '  --data-binary @request-body');
  lines.push('## HTTP request', '', 'Set `NIU_ORIGIN` to your installation origin (without `/v1`). ' + (requiredHeaders.length ? 'Replace path and required-header placeholders with the values required by this operation.' : 'Replace path placeholders with the references required by this operation.') + ' Use the credential scope described above.', '', ...block('sh', command.join(' \\\n')));
  lines.push('## Parameters', '');
  if (!params.length) lines.push('No path, query, or header parameters are declared.', '');
  for (const p of params) lines.push(`### ${p.name}`, '', `Location: **${p.in}**. ${p.required ? '**Required.**' : 'Optional.'} ${p.description || ''}`, '', ...block('json', JSON.stringify(resolveSchema(p.schema || {}),null,2)));
  lines.push('## Request body', '');
  if (!body) lines.push('No request body is declared.', '');
  else for (const [media,content] of Object.entries(body.content || {})) lines.push(`### ${media}`, '', body.required ? '**Required.**' : 'Optional.', '', body.description || '', '', ...block('json', JSON.stringify(resolveSchema(content.schema || {}),null,2)), ...(content.example ? ['Example:', '', ...block('json',JSON.stringify(content.example,null,2))] : []));
  lines.push('## Responses', '');
  for (const [status,raw] of Object.entries(operation.responses || {})) {
    const response = raw.$ref ? pointer(spec,raw.$ref.slice(1)) : raw;
    lines.push(`### HTTP ${status}`, '', response.description || '', '');
    if (response.headers) lines.push('Response headers:', '', ...block('json',JSON.stringify(response.headers,null,2)));
    for (const [media,content] of Object.entries(response.content || {})) lines.push(`Content type: \`${media}\`.`, '', ...block('json',JSON.stringify(resolveSchema(content.schema || {}),null,2)));
  }
  lines.push('## Behavior and supported scope', '', operation.description || '', '');
  for (const key of ['x-niu-implementation','x-niu-status']) if (operation[key]) lines.push('**Supported scope:** '+operation[key], '');
  outputs.set(`apps/docs/src/content/docs/api/rest/${slug}.md`,page(operation.summary || method.toUpperCase()+' '+route, method.toUpperCase()+' '+route, lines));
}
for (const group of ['Model APIs','Video and media APIs','Providers and routing APIs','Authentication and sessions','Workspace and company APIs','Service endpoints']) if (restGroups.has(group)) {
  restIndex.push('## '+group, '', ...restGroups.get(group).sort((a,b)=>a.route.localeCompare(b.route)||a.method.localeCompare(b.method)).map(row=>row.link), '');
}
outputs.set('apps/docs/src/content/docs/api/rest/index.md',page('REST API specification','Generated endpoint reference from the complete Niu OpenAPI contract.', restIndex));

// Emit declarations in memory: inferred returns and nested client namespaces stay
// synchronized with TypeScript, and implementation bodies/private members stay out.
const configFile = path.join(root,'sdks/javascript/tsconfig.json');
const config = ts.readConfigFile(configFile, ts.sys.readFile);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, path.dirname(configFile));
const program = ts.createProgram(parsed.fileNames, {...parsed.options, declaration:true, emitDeclarationOnly:true, declarationMap:false});
const diagnostics = ts.getPreEmitDiagnostics(program);
if (diagnostics.length) throw new Error(ts.formatDiagnosticsWithColorAndContext(diagnostics,{getCurrentDirectory:()=>root,getCanonicalFileName:p=>p,getNewLine:()=> '\n'}));
// Compile the tutorial's TypeScript blocks against the current SDK as well.
const tutorial = fs.readFileSync(path.join(root, 'apps/docs/src/content/docs/guides/sdk-quickstart.mdx'), 'utf8');
const exampleSource = [...tutorial.matchAll(/```typescript\n([\s\S]*?)```/g)].map(m=>m[1]).join('\n').replaceAll("'@niu-io/sdk'", "'./index.js'");
const exampleFile = path.join(root, 'sdks/javascript/src/__documentation_example.ts');
const host = ts.createCompilerHost(parsed.options);
const getSourceFile = host.getSourceFile.bind(host);
host.getSourceFile = (name, languageVersion, onError, shouldCreate) => name === exampleFile
  ? ts.createSourceFile(name, 'declare const process: { env: Record<string, string | undefined> };\n'+exampleSource, languageVersion, true)
  : getSourceFile(name, languageVersion, onError, shouldCreate);
const exampleProgram = ts.createProgram([...parsed.fileNames, exampleFile], {...parsed.options, noEmit:true}, host);
const exampleDiagnostics = ts.getPreEmitDiagnostics(exampleProgram);
if (exampleDiagnostics.length) throw new Error(ts.formatDiagnosticsWithColorAndContext(exampleDiagnostics,{getCurrentDirectory:()=>root,getCanonicalFileName:p=>p,getNewLine:()=> '\n'}));
const declarations = new Map();
program.emit(undefined,(filename,text)=>{if(filename.endsWith('.d.ts')) declarations.set(path.basename(filename),ts.createSourceFile(filename,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS));},undefined,true);
const checker=program.getTypeChecker();
const entry=program.getSourceFile(path.join(root,'sdks/javascript/src/index.ts'));
const exports=checker.getExportsOfModule(checker.getSymbolAtLocation(entry));
const printer=ts.createPrinter({newLine:ts.NewLineKind.LineFeed});
const sdkIndex=['The reference is emitted from the TypeScript SDK source, including inferred return types. Import the public exports from `@niu-io/sdk`.', '', '## Clients and functions', ''];
const types=[];
let symbols=0;
for(const exported of exports.sort((a,b)=>a.name.localeCompare(b.name))) {
 const symbol=exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported;
 const original=symbol.declarations?.find(d=>ts.isClassDeclaration(d)||ts.isFunctionDeclaration(d)||ts.isTypeAliasDeclaration(d)||ts.isInterfaceDeclaration(d));
 if(!original) continue;
 const file=declarations.get(path.basename(original.getSourceFile().fileName).replace(/\.ts$/,'.d.ts'));
 const node=file?.statements.find(n=>n.name?.text===symbol.name);
 if(!node) throw new Error('Missing public declaration '+symbol.name);
 symbols++;
 const sourceLink='https://github.com/niu-io/niu/blob/main/'+path.relative(root,original.getSourceFile().fileName).split(path.sep).join('/');
 const slug=exported.name.toLowerCase();
 const lines=[`[SDK source](${sourceLink}). [All SDK types](/docs/api/sdk/).`, '', ...block('typescript',printer.printNode(ts.EmitHint.Unspecified,node,file))];
 if(ts.isClassDeclaration(node)) {
   lines.length=0;lines.push(`[SDK source](${sourceLink}). [All SDK types](/docs/api/sdk/).`, '', '## Constructor and members', '');
   for(const member of [...node.members].sort((a,b)=>Number(ts.isConstructorDeclaration(b))-Number(ts.isConstructorDeclaration(a)))) {
     if(member.modifiers?.some(m=>m.kind===ts.SyntaxKind.PrivateKeyword||m.kind===ts.SyntaxKind.ProtectedKeyword)) continue;
     const name=member.name?.getText(file) || 'constructor';
     let declaration = printer.printNode(ts.EmitHint.Unspecified,member,file);
     if (ts.isPropertyDeclaration(member) && member.type?.getText(file).startsWith('ReturnType<')) {
       const property = original.members.find(m=>m.name?.getText(original.getSourceFile())===name);
       const type = checker.getTypeAtLocation(property);
       const expanded = name+': '+checker.typeToString(type, property, ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.InTypeAlias)+';';
       const syntax = ts.createSourceFile('reference.ts', 'declare class Reference { '+expanded+' }', ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
       declaration = printer.printNode(ts.EmitHint.Unspecified, syntax.statements[0].members[0], syntax);
     }
     lines.push('### '+name, '', ...block('typescript',declaration));
   }
 }
 outputs.set(`apps/docs/src/content/docs/api/sdk/${slug}.md`,page(exported.name,'Generated TypeScript declaration for '+exported.name,lines));
 (ts.isClassDeclaration(node)||ts.isFunctionDeclaration(node) ? sdkIndex : types).push(`- [${exported.name}](/docs/api/sdk/${slug}/)`);
}
sdkIndex.push('', '## Request, response, and configuration types', '', ...types);
outputs.set('apps/docs/src/content/docs/api/sdk/index.md',page('JavaScript / TypeScript SDK','Generated public client methods, signatures and types.',sdkIndex));
outputs.set('apps/docs/src/content/docs/api/index.md',page('API reference','SDK declarations and REST OpenAPI specifications generated from source.',[
  '## SDK interfaces', '', '[JavaScript / TypeScript SDK](/docs/api/sdk/) — public constructors, methods, inputs and return types emitted by the TypeScript compiler.', '',
  '## REST specification', '', '[REST API specification](/docs/api/rest/) — '+operations+' operations, including authentication, parameters, request bodies and response schemas from the bundled OpenAPI contract.', '',
  '[Download OpenAPI JSON](/docs/openapi/public.json).', '',
  '## Start with a tutorial', '', '[API quickstart](/docs/guides/api-quickstart/) and [SDK quickstart](/docs/guides/sdk-quickstart/) are in the Docs guide directory.', '',
]));

// Delete only generator-owned obsolete pages. A rename must not leave stale APIs.
for(const directory of ['apps/docs/src/content/docs/api/rest','apps/docs/src/content/docs/api/sdk']) {
 const absolute=path.join(outputRoot,directory);
 if(!fs.existsSync(absolute)) continue;
 for(const name of fs.readdirSync(absolute)) if(name.endsWith('.md')&&!outputs.has(directory+'/'+name)) {
  const old=path.join(absolute,name);
  if(fs.readFileSync(old,'utf8').includes(generated)) {if(check) throw new Error('Stale generated page '+old);fs.unlinkSync(old);}
 }
}
for(const [relative,rawText] of outputs) {
 const text=rawText.replace(/[\t ]+$/gm,'').trimEnd()+'\n';
 const target=path.join(outputRoot,relative);
 if(check) {if(!fs.existsSync(target)||fs.readFileSync(target,'utf8')!==text) throw new Error('Generated API documentation is stale: '+relative);}
 else {fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,text);}
}
console.log(`${operations} REST operations and ${symbols} public SDK exports generated${check?' and verified':''}.`);
