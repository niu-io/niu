import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { requestExamples } from './request-examples.mjs';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const generator = fileURLToPath(new URL('./generate-api-docs.mjs',import.meta.url));
test('source generation preserves exact declarations, resolves OpenAPI refs, and rejects stale output',()=>{
 const directory=mkdtempSync(join(tmpdir(),'niu-api-docs-'));
 const run=(...args)=>execFileSync(process.execPath,[generator,'--output-dir',directory,...args],{encoding:'utf8',stdio:'pipe'});
 try {
   assert.match(run(),/REST operations and \d+ public SDK exports generated/);
   const spec=JSON.parse(readFileSync(join(directory,'contracts/generated/public-openapi.json'),'utf8'));
   assert.ok(spec.paths['/v1/chat/completions'].post.requestBody);
   for (const route of ['/v1/chat/completions','/v1/responses','/v1/messages']) {
     for (const name of ['x-niu-attempt-id','x-niu-operation-id']) {
       const header = spec.paths[route].post.responses['200'].headers[name];
       assert.equal(header.schema.format, 'uuid');
       assert.match(header.description, /distinct/i);
     }
   }
   const resolve = value => value?.$ref
     ? value.$ref.slice(2).split('/').reduce((v, key) => v[key.replaceAll('~1','/').replaceAll('~0','~')],spec)
     : value;
   const keyOperation = spec.paths['/api/v1/workspaces/{workspace}/keys'].get;
   const page = resolve(keyOperation.responses['200'].content['application/json'].schema);
   const detail = resolve(page.properties.data.items);
   const detailFields = detail.allOf.flatMap(part => Object.keys(resolve(part).properties));
   assert.ok(detailFields.includes('name'));
   assert.ok(detailFields.includes('spending_limits'));
   assert.ok(detailFields.includes('token_usage_window'));
   assert.ok(!detailFields.includes('token'));
   for (const status of ['400','401','403','404','503']) assert.ok(keyOperation.responses[status]);
   const creation = resolve(spec.paths['/api/v1/workspaces/{workspace}/keys'].post.responses['201'].content['application/json'].schema);
   assert.match(creation.properties.token.description, /one-time/i);
   assert.ok(creation.properties.key.anyOf.some(part => part.type === 'null'));
   for (const definition of Object.values(spec.components.securitySchemes)) assert.ok(definition.description);
   for (const [route, item] of Object.entries(spec.paths)) for (const [method, operation] of Object.entries(item)) {
     if (!['get','post','put','patch','delete','head','options','trace'].includes(method)) continue;
     const slug = (operation.operationId || method + '-' + route).replace(/[^a-zA-Z0-9_-]/g,'-').toLowerCase();
     const doc = readFileSync(join(directory,`apps/docs/src/content/docs/api/rest/${slug}.md`),'utf8');
     const commands = [...doc.matchAll(/```sh\n([\s\S]*?)\n```/g)].map(match => match[1]);
     assert.ok(commands.length);
     const parameters = new Map();
     for (const raw of [...(item.parameters ?? []),...(operation.parameters ?? [])]) {
       const parameter = resolve(raw);
       parameters.set(`${parameter.in}:${parameter.name}`,parameter);
     }
     for (const parameter of parameters.values()) if (parameter.required && parameter.in === 'query') {
       for (const command of commands) assert.ok(command.includes(`--url-query '${encodeURIComponent(parameter.name)}=`),`${operation.operationId}: ${parameter.name}`);
     }
   }
   const logout=readFileSync(join(directory,'apps/docs/src/content/docs/api/rest/revokebrowsermembersession.md'),'utf8');
   assert.match(logout,/--cookie/);
   assert.doesNotMatch(logout,/-H "Authorization:/);
   assert.equal(spec.paths['/v1/chat/completions'].post.tags[0], 'Chat completions');
   assert.equal(spec.paths['/api/v1/admin/customers'], undefined);
   assert.equal(spec.paths['/api/v1/admin/providers/connections'], undefined);
   assert.equal(spec.paths['/api/v1/organizations/{organization}/projects/{project}/accounts'], undefined);
   assert.equal(spec.paths['/api/v1/organizations/{organization}/projects/{project}/budget'], undefined);
   assert.equal(spec.paths['/api/v1/organizations/{organization}/projects/{project}/costs'], undefined);
   assert.equal(spec.paths['/api/v1/organizations/{organization}/billing/units/charges/{attempt}/refunds'], undefined);
   assert.equal(spec.paths['/api/v1/organizations/{organization}/billing/entries/{entry}/reversal'], undefined);
   assert.equal(spec.paths['/api/v1/organizations/{organization}/projects/{project}/billing/invoices']?.post, undefined);
   assert.equal(spec.paths['/api/v1/organizations/{organization}/projects/{project}/billing'], undefined);
   assert.equal(spec.paths['/api/v1/organizations/{organization}/projects/{project}/keys'], undefined);
   assert(!JSON.stringify(spec.info).includes('/help/'), 'public OpenAPI info must not link to retired /help/ paths');
   for (const category of Object.keys(spec.components ?? {})) {
     for (const name of Object.keys(spec.components[category] ?? {})) {
       assert(!/^(?:handler_operations_json_|[a-z0-9_]+_openapi_yaml_)/.test(name), `Unexpected bundled prefix in ${category}/${name}`);
       assert(!/^(?:Vendor|Supplier|Platform)/.test(name), `Internal schema leaked into public spec: ${category}/${name}`);
     }
   }
   const platformView = JSON.parse(readFileSync(join(directory, 'contracts/generated/views/platform-provider-openapi.json'), 'utf8'));
   assert.equal(platformView.paths['/api/v1/admin/customers'].get.tags[0], 'Customer balances');
   const tags = new Set(spec.tags.map(tag => tag.name));
   for (const item of Object.values(spec.paths)) for (const [method, operation] of Object.entries(item)) {
     if (!['get','post','put','patch','delete','head','options'].includes(method)) continue;
     assert.equal(operation.tags.length, 1);
     assert.ok(tags.has(operation.tags[0]));
     assert.ok(operation['x-niu-authority']?.audience);
     assert.ok(Array.isArray(operation['x-niu-authority']?.principals) && operation['x-niu-authority'].principals.length > 0);
     assert.ok(operation['x-niu-authority']?.required_capability);
     assert.ok(operation['x-niu-authority']?.scope);
   }
   for (const view of ['model-openapi.json', 'customer-management-openapi.json', 'console-openapi.json', 'platform-provider-openapi.json']) {
     const parsedView = JSON.parse(readFileSync(join(directory, 'contracts/generated/views', view), 'utf8'));
     assert.ok(Object.keys(parsedView.paths).length > 0, view);
   }
   assert.deepEqual(new Set(spec['x-tagGroups'].flatMap(group => group.tags)), tags);
   assert.match(spec.info.description, /Authentication and scope/);
   assert.equal(spec.paths['/v1/models'].get.operationId,'listModels');
   const client=readFileSync(join(directory,'apps/docs/src/content/docs/api/sdk/niuclient.md'),'utf8');
   assert.ok(client.indexOf('### constructor')<client.indexOf('### chat'));
   assert.match(client,/ChatCompletionRequest/);
   assert.doesNotMatch(client,/private send/);
   const upload=Object.values(spec.paths).flatMap(item=>Object.values(item)).find(op=>op.requestBody?.content?.['image/png']);
   assert.ok(upload,'binary body contracts remain available');
   assert.match(run('--check'),/and verified/);
   const output=join(directory,'apps/docs/src/content/docs/api/sdk/niuclientoptions.md');
   writeFileSync(output,readFileSync(output,'utf8')+'\nSTALE\n');
   assert.throws(()=>run('--check'),error=>String(error.stderr).includes('Generated API documentation is stale'));
 } finally {rmSync(directory,{recursive:true,force:true});}
});

test('request examples honor OR alternatives, AND schemes and public access without URL guessing', () => {
  const schemes = {
    bearer: { type: 'http', scheme: 'bearer' },
    key: { type: 'apiKey', in: 'header', name: 'X-API-Key' },
    cookie: { type: 'apiKey', in: 'cookie', name: '__Host-session' },
  };
  const base = { route: '/api/v1/example', method: 'get', parameters: [], schemes, resolve: value => value };
  const examples = requestExamples({ ...base, security: [{ bearer: [], key: [] }, { cookie: [] }, {}] });
  assert.equal(examples.length,3);
  assert.match(examples[0].command,/Authorization: Bearer/);
  assert.match(examples[0].command,/X-API-Key:/);
  assert.match(examples[1].command,/--cookie/);
  assert.doesNotMatch(examples[1].command,/Authorization:/);
  assert.doesNotMatch(examples[2].command,/Authorization:|--cookie|X-API-Key:/);
});

test('curl query examples encode alias values without changing a POST body or method', async () => {
  const server = createServer((request,response) => {
    let body = '';
    request.on('data',chunk => {body += chunk;});
    request.on('end',() => {
      response.setHeader('content-type','application/json');
      response.end(JSON.stringify({url:request.url,method:request.method,body}));
    });
  });
  const directory=mkdtempSync(join(tmpdir(),'niu-query-example-'));
  try {
    await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
    writeFileSync(join(directory,'request.json'),'{"enabled":true}');
    const [{command}] = requestExamples({
      route:'/example',method:'post',security:[],schemes:{},
      parameters:[{name:'alias',in:'query',required:true}],
      mediaType:'application/json',resolve:value=>value,
    });
    const alias = 'provider/model with spaces&other=1';
    const {stdout} = await promisify(execFile)('sh',['-c',command.replace('<ALIAS>',alias)],{
      cwd:directory,env:{...process.env,NIU_ORIGIN:`http://127.0.0.1:${server.address().port}`},
    });
    const received = JSON.parse(stdout);
    const url = new URL(received.url,'http://example.test');
    assert.equal(url.searchParams.get('alias'),alias);
    assert.equal(url.searchParams.size,1);
    assert.equal(received.method,'POST');
    assert.equal(received.body,'{"enabled":true}');
  } finally {
    await new Promise(resolve=>server.close(resolve));
    rmSync(directory,{recursive:true,force:true});
  }
});

test('workspace routes have no legacy /projects paths and require qualified session identities', () => {
  const spec = JSON.parse(readFileSync(fileURLToPath(new URL('../../../contracts/generated/handler-operations.json', import.meta.url)), 'utf8'));
  for (const [route, item] of Object.entries(spec.paths)) {
    assert.ok(!route.includes('/projects'), `legacy /projects route remained: ${route}`);
    for (const [method, operation] of Object.entries(item)) {
      if (route.startsWith('/api/v1/workspaces/{workspace}/')) {
        assert.ok(operation.parameters.some(p => p.in === 'path' && p.name === 'workspace'), `${method} ${route} missing workspace param`);
        assert.ok(!operation.parameters.some(p => p.name === 'organization' || p.name === 'project'), `${method} ${route} still has organization/project param`);
      }
      if (route.includes('/workspaces/{workspace}/sessions')) {
        const category = operation.parameters.find(p => p.name === 'category');
        assert.ok(category, `${method} ${route} missing category param`);
        assert.equal(category.required, true);
        assert.deepEqual(category.schema.enum, method === 'get' ? ['video', 'chat'] : ['video']);
      }
    }
  }
});

test('workspace routing documentation distinguishes delegated read, preview and mutation authority', async () => {
  const { deriveOperationAuthority } = await import('./openapi-navigation.mjs');
  for (const [path, method, grant] of [
    ['/v1/routing', 'get', 'pools:read'],
    ['/v1/routing/preview', 'post', 'pools:read'],
    ['/v1/routing/{slug}', 'put', 'pools:write'],
    ['/v1/routing/{slug}/selections', 'get', 'pools:read'],
  ]) assert.deepEqual(deriveOperationAuthority(path, method, { security: [{ bearerAuth: [] }] }), {
    audience: 'model', principals: ['workspace_api_key'], required_capability: grant, scope: 'workspace',
  });
});
test('event documentation keeps subscription writes and targeted tests separate from reads/inference', async () => {
  const { deriveOperationAuthority } = await import('./openapi-navigation.mjs');
  for (const [path, method, capability] of [
    ['/v1/events', 'get', 'events:read'], ['/v1/events/log', 'get', 'events:read'],
    ['/v1/events/{slug}', 'put', 'events:write'], ['/v1/events/{slug}/test', 'post', 'events:write'],
  ]) assert.equal(deriveOperationAuthority(path, method, { security: [{ bearerAuth: [] }] }).required_capability, capability);
});
test('evaluation docs separate non-dispatching fingerprints from evidence writes', async () => {
  const { deriveOperationAuthority } = await import('./openapi-navigation.mjs');
  for (const [path,method,capability] of [
    ['/v1/evaluations','get','evaluations:read'],
    ['/v1/evaluations/fingerprint','post','evaluations:read'],
    ['/v1/evaluations/{slug}','put','evaluations:write'],
    ['/v1/evaluations/{slug}/runs','post','evaluations:write'],
    ['/v1/evaluations/{slug}/attempts','get','evaluations:read'],
  ]) assert.equal(deriveOperationAuthority(path,method,{security:[{bearerAuth:[]}]}).required_capability,capability);
});
test('human management review requires member Read rather than delegated inference authority', async () => {
  const { deriveOperationAuthority } = await import('./openapi-navigation.mjs');
  for (const resource of ['routing','events','evaluations']) {
    const authority=deriveOperationAuthority(`/api/v1/workspaces/{workspace}/${resource}`,'get',{security:[{bearerAuth:[]}]});
    assert.deepEqual(authority.principals,['operator_session','installation_admin']);
    assert.equal(authority.required_capability,'read');
    assert.equal(authority.scope,'workspace');
  }
});

test('docs API explorer stays native inside the unified Starlight shell with zero Scalar CSS pollution', () => {
  const docsRoot = fileURLToPath(new URL('..', import.meta.url));
  const pkg = JSON.parse(readFileSync(join(docsRoot, 'package.json'), 'utf8'));
  const allDeps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  for (const dep of Object.keys(allDeps)) {
    assert.ok(!dep.startsWith('@scalar/'), `Unexpected Scalar dependency in apps/docs/package.json: ${dep}`);
  }
  const styles = readFileSync(join(docsRoot, 'src/styles.css'), 'utf8');
  assert.doesNotMatch(styles, /\.sidebar-pane\s*\{\s*display:\s*none/, 'Docs CSS must never hide .sidebar-pane on subroutes');
  assert.doesNotMatch(styles, /docs-api-explorer/, 'Legacy Scalar docs-api-explorer shell override must remain removed');
  assert.doesNotMatch(styles, /:root\[data-has-sidebar\]\s+\.header\b/, 'Sidebar header offset must target header.header so Expressive Code figcaption.header is never shifted');
  const explorerMdx = readFileSync(join(docsRoot, 'src/content/docs/api/explorer.mdx'), 'utf8');
  assert.match(explorerMdx, /ApiExplorer/, 'explorer.mdx must mount native ApiExplorer');
  assert.doesNotMatch(explorerMdx, /scalar|ApiReference/i, 'explorer.mdx must not mount Scalar ApiReference');
  const markdownContent = readFileSync(join(docsRoot, 'src/components/MarkdownContent.astro'), 'utf8');
  assert.match(markdownContent, /OperationTryIt/, 'REST operation pages must mount native OperationTryIt');
});
