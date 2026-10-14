import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const generator = fileURLToPath(new URL('./generate-api-docs.mjs',import.meta.url));
test('source generation preserves exact declarations, resolves OpenAPI refs, and rejects stale output',()=>{
 const directory=mkdtempSync(join(tmpdir(),'niu-api-docs-'));
 const run=(...args)=>execFileSync(process.execPath,[generator,'--output-dir',directory,...args],{encoding:'utf8',stdio:'pipe'});
 try {
   assert.match(run(),/REST operations and \d+ public SDK exports generated/);
   const spec=JSON.parse(readFileSync(join(directory,'contracts/generated/public-openapi.json'),'utf8'));
   assert.ok(spec.paths['/v1/chat/completions'].post.requestBody);
   assert.equal(spec.paths['/v1/chat/completions'].post.tags[0], 'Chat completions');
   assert.equal(spec.paths['/admin/v1/platform/customer-accounts'].get.tags[0], 'Customer balances');
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
