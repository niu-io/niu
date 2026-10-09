import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import test from 'node:test';

async function run(t, mode, status, result) {
  const calls = [];
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      calls.push({method:req.method,path:req.url,body:JSON.parse(body)});
      res.writeHead(status, {'content-type':'application/json'});
      res.end(JSON.stringify(result));
    });
  });
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  t.after(()=>server.close());
  const identifier='12345678-1234-1234-1234-123456789abc';
  const child=spawn(process.execPath,[new URL('../examples/test-output-rules.mjs',import.meta.url).pathname],{env:{...process.env,NIU_ADMIN_TOKEN:'output-example-private',NIU_ADMIN_BASE_URL:`http://127.0.0.1:${server.address().port}/admin/v1`,NIU_ORGANIZATION_ID:identifier,NIU_WORKSPACE_ID:identifier,NIU_OUTPUT_MODE:mode}});
  let stdout='',stderr='';
  child.stdout.on('data',chunk=>{stdout+=chunk;});child.stderr.on('data',chunk=>{stderr+=chunk;});
  const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',resolve);});
  assert.ok(!(stdout+stderr).includes('output-example-private'));
  assert.ok(!(stdout+stderr).includes(identifier));
  assert.ok(!(stdout+stderr).includes('unexpected-private-content'));
  return {code,stdout,stderr,calls};
}
for(const mode of ['buffered_full','observe_only']) test(`output example preserves ${mode} and prints allowlisted metadata`,async t=>{
  const observed=mode==='observe_only';
  const result=await run(t,mode,200,{mode,outcome:observed?'matched':'allowed',reason:observed?'pattern_match':'inspected_text',redacted:!observed,synthetic:true,enforcement:false,coverage:'local_text',private_response:'unexpected-private-content'});
  assert.equal(result.code,0,result.stderr);
  assert.equal(result.calls.length,1);
  assert.equal(result.calls[0].method,'POST');
  assert.ok(result.calls[0].path.endsWith('/guardrails/output-preview'));
  assert.equal(result.calls[0].body.mode,mode);
  const output=JSON.parse(result.stdout);
  assert.equal(output.redacted,!observed);
  assert.deepEqual(Object.keys(output).sort(),['mode','outcome','reason','redacted','synthetic','enforcement','coverage'].sort());
});
test('output example rejects contradictory observation without printing partial results',async t=>{
  const result=await run(t,'observe_only',200,{mode:'observe_only',outcome:'matched',reason:'pattern_match',redacted:true,synthetic:true,enforcement:false,coverage:'local_text'});
  assert.notEqual(result.code,0);assert.equal(result.stdout,'');
});
test('output example rejects unknown modes before any network request',async t=>{
  const result=await run(t,'unknown',200,{});assert.notEqual(result.code,0);assert.equal(result.calls.length,0);
});
test('output example sanitizes access errors and never retries',async t=>{
  const result=await run(t,'observe_only',403,{error:{message:'unexpected-private-content'}});
  assert.notEqual(result.code,0);assert.equal(result.stdout,'');assert.equal(result.calls.length,1);assert.match(result.stderr,/HTTP 403/);
});
