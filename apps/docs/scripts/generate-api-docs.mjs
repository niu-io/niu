import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import YAML from 'yaml';
import { isDeepStrictEqual } from 'node:util';
import { addOpenApiNavigation, pruneOpenApiDocument } from './openapi-navigation.mjs';
import { requestExamples } from './request-examples.mjs';
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
const BUNDLE_DOMAIN_PREFIXES = new Map([
  ['billing_openapi_yaml', 'Billing'],
  ['guardrails_openapi_yaml', 'Guardrail'],
  ['provider_business_openapi_yaml', 'Provider'],
  ['password_sessions_openapi_yaml', 'Auth'],
  ['request_observability_openapi_yaml', 'Observability'],
  ['handler_operations_json', 'Api'],
]);

function mapStrings(value, transform) {
  if (typeof value === 'string') return transform(value);
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(item => mapStrings(item, transform));
  const next = {};
  for (const [k, v] of Object.entries(value)) {
    next[k] = mapStrings(v, transform);
  }
  return next;
}

function rewriteRefs(document, refReplacements) {
  if (refReplacements.size === 0) return document;
  return mapStrings(document, value => refReplacements.get(value) ?? value);
}

function stripBundlePrefix(key) {
  const match = key.match(/^(handler_operations_json|[a-z0-9_]+_openapi_yaml)_(.+)$/);
  return match ? { prefix: match[1], bare: match[2] } : null;
}

function normalizeSchemaForComparison(value, components) {
  return JSON.stringify(mapStrings(value, str => {
    const match = str.match(/^#\/components\/([^/]+)\/([^/]+)$/);
    if (!match) return str;
    const stripped = stripBundlePrefix(match[2]);
    if (stripped && components?.[match[1]]?.[stripped.bare]) {
      return `#/components/${match[1]}/${stripped.bare}`;
    }
    return str;
  }));
}

function cleanSpecComponentNames(document) {
  let current = document;
  let changed = true;
  while (changed) {
    changed = false;
    const replacements = new Map();
    for (const [category, entries] of Object.entries(current.components ?? {})) {
      if (!entries || typeof entries !== 'object') continue;
      for (const [name, definition] of Object.entries(entries)) {
        if (!definition || typeof definition !== 'object' || Array.isArray(definition)) continue;
        const keys = Object.keys(definition);
        if (keys.length === 1 && keys[0] === '$ref' && typeof definition.$ref === 'string') {
          const match = definition.$ref.match(/^#\/components\/([^/]+)\/([^/]+)$/);
          if (match && match[1] === category && match[2] !== name && entries[match[2]]) {
            const targetName = match[2];
            const targetStripped = stripBundlePrefix(targetName);
            const nameStripped = stripBundlePrefix(name);
            if (!nameStripped && targetStripped && targetStripped.bare === name) {
              entries[name] = entries[targetName];
              delete entries[targetName];
              replacements.set(`#/components/${category}/${targetName}`, `#/components/${category}/${name}`);
            } else {
              delete entries[name];
              replacements.set(`#/components/${category}/${name}`, `#/components/${category}/${targetName}`);
            }
            changed = true;
            break;
          }
        }
      }
      if (changed) break;
    }
    if (replacements.size > 0) {
      current = rewriteRefs(current, replacements);
    }
  }

  let unified = true;
  while (unified) {
    unified = false;
    const replacements = new Map();
    for (const [category, entries] of Object.entries(current.components ?? {})) {
      if (!entries || typeof entries !== 'object') continue;
      for (const name of Object.keys(entries)) {
        const stripped = stripBundlePrefix(name);
        if (!stripped || !entries[stripped.bare]) continue;
        const a = normalizeSchemaForComparison(entries[name], current.components);
        const b = normalizeSchemaForComparison(entries[stripped.bare], current.components);
        if (a === b) {
          delete entries[name];
          replacements.set(`#/components/${category}/${name}`, `#/components/${category}/${stripped.bare}`);
          unified = true;
        }
      }
    }
    if (replacements.size > 0) {
      current = rewriteRefs(current, replacements);
    }
  }

  const finalReplacements = new Map();
  for (const [category, entries] of Object.entries(current.components ?? {})) {
    if (!entries || typeof entries !== 'object') continue;
    const rebuilt = {};
    const pendingRenames = new Map();
    for (const name of Object.keys(entries)) {
      const stripped = stripBundlePrefix(name);
      if (!stripped) {
        rebuilt[name] = entries[name];
        continue;
      }
      let nextName = stripped.bare;
      if (entries[nextName] || rebuilt[nextName]) {
        const domain = BUNDLE_DOMAIN_PREFIXES.get(stripped.prefix) ?? 'Api';
        nextName = nextName.startsWith(domain) ? nextName : `${domain}${nextName}`;
        let suffix = 2;
        while (entries[nextName] || rebuilt[nextName]) {
          nextName = `${domain}${stripped.bare}${suffix++}`;
        }
      }
      rebuilt[nextName] = entries[name];
      pendingRenames.set(`#/components/${category}/${name}`, `#/components/${category}/${nextName}`);
    }
    current.components[category] = rebuilt;
    for (const [from, to] of pendingRenames) finalReplacements.set(from, to);
  }
  return rewriteRefs(current, finalReplacements);
}

function annotatePublicLegacyFields(value) {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(annotatePublicLegacyFields);
  if (value.name === 'project_id' && value.in && !value.description) {
    return { ...value, description: 'Workspace scope (legacy API identifier).' };
  }
  const next = {};
  for (const [k, v] of Object.entries(value)) {
    if (k === 'project_id' && v && typeof v === 'object' && !Array.isArray(v) && !v.description) {
      next[k] = { ...annotatePublicLegacyFields(v), description: 'Workspace scope (legacy API identifier).' };
    } else {
      next[k] = annotatePublicLegacyFields(v);
    }
  }
  return next;
}

const cleanSpec = cleanSpecComponentNames(spec);
for (const key of Object.keys(spec)) delete spec[key];
Object.assign(spec, cleanSpec);
addOpenApiNavigation(spec);

function buildAudienceView(title, audiences, { canonicalOnly = false, sanitizePublicDescription = false } = {}) {
  const allowed = new Set(audiences);
  const aliasedLegacyRoutes = new Set();
  if (canonicalOnly) {
    for (const item of Object.values(spec.paths)) {
      for (const [key, value] of Object.entries(item)) {
        if (methods.has(key) && allowed.has(value?.['x-niu-authority']?.audience) && value?.['x-niu-compatibility-route']) {
          aliasedLegacyRoutes.add(value['x-niu-compatibility-route']);
        }
      }
    }
  }
  const filteredPaths = {};
  for (const [route, item] of Object.entries(spec.paths)) {
    if (canonicalOnly && aliasedLegacyRoutes.has(route)) {
      continue;
    }
    const filteredItem = {};
    for (const [key, value] of Object.entries(item)) {
      if (!methods.has(key)) {
        filteredItem[key] = value;
      } else if (allowed.has(value?.['x-niu-authority']?.audience)) {
        filteredItem[key] = value;
      }
    }
    if (Object.keys(filteredItem).some(k => methods.has(k))) {
      filteredPaths[route] = filteredItem;
    }
  }
  let info = { ...spec.info, title };
  if (sanitizePublicDescription && typeof info.description === 'string') {
    info = {
      ...info,
      description: info.description
        .replace(
          'Management operations require the member session,\nplatform authority, explicit delegated workspace capability or Provider membership stated by that operation.',
          'Management operations require the member session or explicit delegated workspace capability stated by that operation.',
        )
        .replace(
          'Legacy `project` path segments refer to workspaces; legacy `provider` paths refer to Providers.',
          'Legacy `project` field names refer to workspaces.',
        )
        .replace(' Provider purchase rates and customer charges are separate.', ''),
    };
  }
  const view = pruneOpenApiDocument({
    openapi: spec.openapi,
    info,
    servers: spec.servers,
    tags: spec.tags,
    'x-tagGroups': spec['x-tagGroups'],
    paths: canonicalOnly ? annotatePublicLegacyFields(filteredPaths) : filteredPaths,
    components: spec.components,
  });
  return view;
}

const publicView = buildAudienceView(spec.info.title, ['public', 'model', 'console', 'customer-management'], { canonicalOnly: true, sanitizePublicDescription: true });
outputs.set('contracts/generated/public-openapi.json', JSON.stringify(publicView, null, 2) + '\n');
outputs.set('contracts/generated/public-openapi.yaml', YAML.stringify(publicView));
outputs.set('contracts/generated/views/model-openapi.json', JSON.stringify(buildAudienceView('Niu Model & Inference API', ['model', 'public']), null, 2) + '\n');
outputs.set('contracts/generated/views/customer-management-openapi.json', JSON.stringify(buildAudienceView('Niu Customer Workspace & Billing Management API', ['customer-management'], { canonicalOnly: true, sanitizePublicDescription: true }), null, 2) + '\n');
outputs.set('contracts/generated/views/console-openapi.json', JSON.stringify(buildAudienceView('Niu Console & Saved Session API', ['console']), null, 2) + '\n');
outputs.set('contracts/generated/views/platform-provider-openapi.json', JSON.stringify(buildAudienceView('Niu Platform & Provider Administration API', ['platform', 'provider']), null, 2) + '\n');
const generated = 'Generated from the checked-in source. Do not edit this reference by hand.';
function page(title, description, lines) { return ['---', `title: ${JSON.stringify(title)}`, `description: ${JSON.stringify(description)}`, '---', '', `<!-- ${generated} -->`, '', ...lines].join('\n') + '\n'; }
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
    : /^\/api\/v1\/admin\/(providers|routing|incidents)/.test(route) ? 'Providers and routing APIs'
    : /^\/api\/v1\/(auth\/|session$|members|setup$|public\/)/.test(route) ? 'Authentication and sessions'
    : /^\/api\/v1\/(organizations|workspaces|setup\/default-workspace|guardrails|credits|models|admin\/)/.test(route) ? 'Workspace and company APIs'
    : 'Service endpoints';
  if (!restGroups.has(group)) restGroups.set(group, []);
  restGroups.get(group).push({route, method, link:`- [\`${method.toUpperCase()} ${route}\` — ${operation.summary || operation.operationId}](/docs/api/rest/${slug}/)`});
  const lines = [`\`${method.toUpperCase()} ${route}\``, '', operation.description || '', '', `Operation: \`${operation.operationId || slug}\`.`, ''];

  const security = operation.security ?? spec.security ?? [];
  lines.push('## Authentication','', security.length ? 'Use the credential and permission scope described above. Each object below is an alternative; schemes within one object are required together.' : 'No OpenAPI security scheme is required. Other request validation still applies.', '', ...block('json', JSON.stringify(security,null,2)));
  const body = operation.requestBody?.$ref ? pointer(spec, operation.requestBody.$ref.slice(1)) : operation.requestBody;
  const mediaType = Object.keys(body?.content || {})[0];
  const parameters = new Map();
  for (const raw of [...(item.parameters || []), ...(operation.parameters || [])]) {
    const parameter = raw.$ref ? pointer(spec, raw.$ref.slice(1)) : raw;
    const name = parameter.in === 'header' ? parameter.name.toLowerCase() : parameter.name;
    parameters.set(parameter.in + ':' + name, parameter);
  }
  const params = [...(item.parameters || []), ...(operation.parameters || [])].map(p => p.$ref ? pointer(spec, p.$ref.slice(1)) : p);
  const examples = requestExamples({
    route, method, parameters: [...parameters.values()], security,
    schemes: spec.components.securitySchemes, mediaType,
    resolve: value => value?.$ref ? pointer(spec, value.$ref.slice(1)) : value,
  });
  lines.push('## HTTP request', '', 'Set `NIU_ORIGIN` to your installation origin (without `/v1`). Replace path, query and header placeholders with the required values. Query examples use curl 7.87 or newer to encode values with `--url-query`. Use the credential scope described above; a bearer token must have the authority required by this operation.', '');
  for (const example of examples) {
    if (examples.length > 1) lines.push('Authentication alternative: ' + (example.schemes.map(name => '`' + name + '`').join(' + ') || 'No credential') + '.', '');
    lines.push(...block('sh', example.command));
  }
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
const releaseLine = fs.readFileSync(path.join(root, 'VERSION'), 'utf8').trim().split('.').slice(0, 2).join('.');
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
 const sourceLink=`https://github.com/niu-io/niu/blob/release/${releaseLine}/`+path.relative(root,original.getSourceFile().fileName).split(path.sep).join('/');
 const slug=exported.name.toLowerCase();
 const lines=[`[SDK source](${sourceLink}). [All SDK types](/docs/api/sdk/).`, '', ...block('typescript',printer.printNode(ts.EmitHint.Unspecified,node,file))];
 if (ts.isTypeAliasDeclaration(node) && ts.isTypeReferenceNode(node.type)) {
   const target = node.type.typeName.getText(file);
   if (target !== exported.name && exports.some(entry => entry.name === target)) {
     lines.unshift(`See [${target}](/docs/api/sdk/${target.toLowerCase()}/) for the underlying declaration.`, '');
   }
 }
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
