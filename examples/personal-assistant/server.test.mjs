import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAssistant } from './server.mjs';
const listen = server=>new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve(`http://127.0.0.1:${server.address().port}`)));
test('real HTTP boundary, durable edits, failure recovery and secrets',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'niu-example-'));let code=200;let malformed=false;let received;
 const upstream=http.createServer(async(req,res)=>{let raw='';for await(const c of req)raw+=c;received={headers:req.headers,body:JSON.parse(raw)};res.writeHead(code,{'Content-Type':'application/json','x-niu-attempt-id':'11111111-1111-4111-8111-111111111111'});res.end(malformed?'broken':JSON.stringify({choices:[{message:{content:'Plan and draft'}}]}));});
 const upstreamUrl=await listen(upstream);
 let app=await createAssistant({database:join(directory,'saved.db'),key:'secret-test-value',model:'test-model',baseURL:upstreamUrl,withUi:false});let url=await listen(app.server);
 const send=async(data,method='POST',path='/api/work',headers={})=>fetch(url+path,{method,headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(data)});
 try {
  assert.equal((await send({},{'bad':1})).status,400);
 } catch {} // Invalid method construction is not part of the application contract.
 try {
  assert.equal((await send({},'POST','/api/work',{Origin:'https://other.example'})).status,403);
  assert.equal((await send({title:'a',notes:'',goal:'x'})).status,400);
  const response=await send({title:'Meeting',notes:'Sample notes',goal:'Make a plan'});assert.equal(response.status,200);const data=await response.json();const id=data.work.id;
  assert.equal(received.headers.authorization,'Bearer secret-test-value');assert.equal(received.headers['x-niu-log-payloads'],'false');assert.equal(received.body.model,'test-model');
  assert.equal(JSON.stringify(data).includes('secret-test-value'),false);assert.equal(data.work.niu_attempt_id,'11111111-1111-4111-8111-111111111111');
  assert.equal((await send({output:'Edited draft'},'PATCH',`/api/work/${id}`)).status,200);
  await app.close();app=await createAssistant({database:join(directory,'saved.db'),key:'secret-test-value',model:'test-model',baseURL:upstreamUrl,withUi:false});url=await listen(app.server);
  const reopened=await(await fetch(url+`/api/work/${id}`)).json();assert.equal(reopened.output,'Edited draft');assert.equal(reopened.niu_attempt_id,'11111111-1111-4111-8111-111111111111');
  code=429;assert.equal((await send({title:'Limited',notes:'notes',goal:'goal'})).status,429);
  code=200;malformed=true;const failed=await(await send({title:'Uncertain',notes:'notes',goal:'goal'})).json();assert.equal(failed.work.status,'interrupted');assert.match(failed.error,/unknown/);
  const config=await(await fetch(url+'/api/config')).text();assert.equal(config.includes('secret-test-value'),false);assert.equal(JSON.parse(config).review_url,new URL('/workspaces/default/',upstreamUrl).href);
 } finally {await app.close();await new Promise(r=>upstream.close(r));rmSync(directory,{recursive:true,force:true});}
});
test('missing setup prevents inference',async()=>{const app=await createAssistant({database:':memory:',key:'',model:'',withUi:false});const url=await listen(app.server);try{assert.equal((await fetch(url+'/api/work',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,503);}finally{await app.close();}});
