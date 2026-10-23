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
   assert.equal(spec.paths['/api/v1/platform/customer-accounts'].get.tags[0], 'Customer balances');
   const tags = new Set(spec.tags.map(tag => tag.name));
   for (const item of Object.values(spec.paths)) for (const [method, operation] of Object.entries(item)) {
     if (!['get','post','put','patch','delete','head','options'].includes(method)) continue;
     assert.equal(operation.tags.length, 1);
     assert.ok(tags.has(operation.tags[0]));
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

test('workspace aliases preserve payload contracts and require qualified session identities', () => {
 const spec = JSON.parse(readFileSync(fileURLToPath(new URL('../../../contracts/generated/handler-operations.json', import.meta.url)), 'utf8'));
 const aliases = JSON.parse(readFileSync(fileURLToPath(new URL('../../../contracts/route-aliases.json', import.meta.url)), 'utf8'));
 for (const {source, target} of aliases) {
   for (const [method, original] of Object.entries(spec.paths[source])) {
     const operation = spec.paths[target][method];
     assert.ok(operation);
     assert.notEqual(operation.operationId, original.operationId);
     assert.equal(operation['x-niu-compatibility-route'], source);
     assert.deepEqual(operation.requestBody, original.requestBody);
     for (const [status, response] of Object.entries(original.responses)) {
       assert.deepEqual(operation.responses[status], response);
     }
     assert.ok(operation.parameters.some(p => p.in === 'path' && p.name === 'workspace'));
     assert.ok(!operation.parameters.some(p => p.name === 'organization' || p.name === 'project'));
     if (target.includes('/sessions')) {
       const category = operation.parameters.find(p => p.name === 'category');
       assert.equal(category.required, true);
       assert.deepEqual(category.schema.enum, method === 'get' ? ['video','chat'] : ['video']);
     }
   }
 }
});
