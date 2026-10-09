import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import test from 'node:test';
const id = '12345678-1234-4234-8234-123456789abc';
async function run(t, account, entry, status=200, pages=null) {
 const server=createServer((req,res)=>{
  assert.equal(req.headers.authorization,'Bearer private-balance-test');
  res.writeHead(status,{'content-type':'application/json'});
  const body = req.url.endsWith('/balance') ? {data:[account]} : pages ? pages(req.url) : {data:[entry]};
  res.end(JSON.stringify(status===200 ? body : {error:{message:'private-response-body'}}));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve)); t.after(()=>server.close());
 const child=spawn(process.execPath,[new URL('../examples/inspect-account-balance.mjs',import.meta.url).pathname,...(pages ? ['--all'] : [])],{env:{...process.env,NIU_ADMIN_TOKEN:'private-balance-test',NIU_ADMIN_BASE_URL:`http://127.0.0.1:${server.address().port}/admin/v1`,NIU_ORGANIZATION_ID:id}});
 let stdout='',stderr=''; child.stdout.on('data',x=>stdout+=x);child.stderr.on('data',x=>stderr+=x);
 const code=await new Promise((resolve,reject)=>{child.on('close',resolve);child.on('error',reject);});return {code,stdout,stderr};
}
const account={currency:'CNY',balance_nanos:'-9007199254740993',reserved_nanos:'0',credit_limit_nanos:'9007199254740993',available_nanos:'0',low_balance:true};
const entry={id,kind:'charge',currency:'CNY',amount_nanos:'-9007199254740993',created_at:'2026-10-04T10:00:00Z',supplier_cost:'confidential'};
test('account example preserves exact debt and omits internal/commercial fields',async t=>{
 const r=await run(t,account,entry);assert.equal(r.code,0,r.stderr);const data=JSON.parse(r.stdout);assert.equal(data.balances[0].balance_nanos,account.balance_nanos);assert.equal(data.balances[0].paidRequestsPaused,true);assert.equal(data.transactionHistoryCoverage,'latest_100');
 for(const hidden of [id,'confidential','private-balance-test']) assert.ok(!(r.stdout+r.stderr).includes(hidden));
});
test('account example rejects inconsistent balances without partial success',async t=>{
 const r=await run(t,{...account,available_nanos:'1'},entry);assert.notEqual(r.code,0);assert.equal(r.stdout,'');
});
test('account example reports authorization failure without response body',async t=>{
 const r=await run(t,account,entry,403);assert.notEqual(r.code,0);assert.equal(r.stdout,'');assert.match(r.stderr,/HTTP 403/);assert.ok(!r.stderr.includes('private-response-body'));
});

test('account example follows all pages while keeping exact quantities and hiding references',async t=>{
 const next='22345678-1234-4234-8234-123456789abc';
 const calls=[];
 const r=await run(t,account,entry,200,path=>{calls.push(path);return path.includes('?before=')?{data:[{...entry,id:next,kind:'refund',amount_nanos:'5'}],next_cursor:null}:{data:[entry],next_cursor:id};});
 assert.equal(r.code,0,r.stderr);const data=JSON.parse(r.stdout);assert.equal(data.transactions.length,2);assert.equal(data.transactionHistoryCoverage,'all_pages_live_view');assert.ok(calls[1].endsWith('?before='+id));assert.ok(!r.stdout.includes(id));assert.ok(!r.stdout.includes(next));
});
test('account example rejects looping pages without claiming a complete history',async t=>{
 const r=await run(t,account,entry,200,path=>path.includes('?before=')?{data:[],next_cursor:id}:{data:[entry],next_cursor:id});
 assert.notEqual(r.code,0);assert.equal(r.stdout,'');
});
test('account example cannot claim all history when continuation metadata is missing',async t=>{
 const r=await run(t,account,entry,200,()=>({data:[entry]}));
 assert.notEqual(r.code,0);assert.equal(r.stdout,'');
});
test('account example rejects absent dates instead of rendering epoch dates',async t=>{
 const r=await run(t,account,{...entry,created_at:null});
 assert.notEqual(r.code,0);assert.equal(r.stdout,'');
});
