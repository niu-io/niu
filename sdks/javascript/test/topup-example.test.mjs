import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import test from 'node:test';
const id='12345678-1234-4234-8234-123456789abc';
const older='22345678-1234-4234-8234-123456789abc';
const availability={currency:'CNY',available:true,payment_methods:['wxpaynative'],unavailable_reason:null,secret:'private-response-extra'};
const order={id,currency:'CNY',amount_nanos:'9007199260000000',payment_method:'wxpaynative',status:'pending',checkout_url:'https://checkout.example/pay?order='+id,created_at:'2026-10-06T00:00:00Z',supplier_cost:'private-response-extra'};
async function run(t,pages,methods=availability,status=200){
 const calls=[];
 const server=createServer((req,res)=>{
  assert.equal(req.method,'GET');assert.equal(req.headers.authorization,'Bearer private-topup-example');calls.push(req.url);
  res.writeHead(status,{'content-type':'application/json'});
  res.end(JSON.stringify(status===200?(req.url.endsWith('/payment-methods')?{data:methods}:pages(req.url)):{error:{message:'private-response-extra'}}));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>server.close());
 const child=spawn(process.execPath,[new URL('../examples/inspect-topups.mjs',import.meta.url).pathname,'--all'],{env:{...process.env,NIU_ADMIN_TOKEN:'private-topup-example',NIU_ADMIN_BASE_URL:`http://127.0.0.1:${server.address().port}/admin/v1`,NIU_ORGANIZATION_ID:id}});
 let stdout='',stderr='';child.stdout.on('data',x=>stdout+=x);child.stderr.on('data',x=>stderr+=x);
 const code=await new Promise((resolve,reject)=>{child.on('close',resolve);child.on('error',reject);});return{code,stdout,stderr,calls};
}
test('top-up example recovers paged history without displaying references, checkout URLs or confidential data',async t=>{
 const result=await run(t,path=>path.includes('?before=')?{data:[{...order,id:older,status:'closed',checkout_url:null}],next_cursor:null}:{data:[order],next_cursor:id});
 assert.equal(result.code,0,result.stderr);const body=JSON.parse(result.stdout);assert.equal(body.topups.length,2);assert.equal(body.topups[0].amount_nanos,order.amount_nanos);assert.equal(body.topups[0].checkout_available,true);assert.equal(body.topups[1].checkout_available,false);
 assert.equal(body.history_coverage,'all_pages_live_view');assert.ok(result.calls[2].endsWith('?before='+id));
 for(const hidden of [id,older,'checkout.example','private-topup-example','private-response-extra','supplier_cost'])assert.ok(!(result.stdout+result.stderr).includes(hidden));
});
test('top-up example retains unavailable checkout state without inventing methods',async t=>{
 const result=await run(t,()=>({data:[],next_cursor:null}),{currency:'CNY',available:false,payment_methods:[],unavailable_reason:'integration_unavailable'});
 assert.equal(result.code,0,result.stderr);assert.equal(JSON.parse(result.stdout).checkout.available,false);
});
test('top-up example rejects malformed or contradictory saved responses without partial output',async t=>{
 for(const changed of [{created_at:null},{status:'paid'},{checkout_url:'http://checkout.example/pay'},{amount_nanos:'1.2'},{status:'invented'}]){
  const result=await run(t,()=>({data:[{...order,...changed}],next_cursor:null}));assert.notEqual(result.code,0);assert.equal(result.stdout,'');
 }
});
test('top-up example rejects missing and looping continuation instead of claiming complete recovery',async t=>{
 for(const pages of [()=>({data:[order]}),path=>path.includes('?before=')?{data:[],next_cursor:id}:{data:[order],next_cursor:id}]){
  const result=await run(t,pages);assert.notEqual(result.code,0);assert.equal(result.stdout,'');
 }
});
test('top-up example preserves authorization errors without publishing response bodies',async t=>{
 const result=await run(t,()=>({}),availability,403);assert.notEqual(result.code,0);assert.equal(result.stdout,'');assert.match(result.stderr,/HTTP 403/);assert.ok(!result.stderr.includes('private-response-extra'));
});
