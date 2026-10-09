import assert from 'node:assert/strict';
import test from 'node:test';
import { NiuAdminClient } from '../dist/index.js';
const id='a099bcd0-77db-4c75-81f8-84b21d45d861';
const input={revision:id,model_alias:'video/model',vendor_id:id,vendor_revision:4,model_revision:2,schema_revision:'schema-one',expected_revision:null};
test('draft offer choices use scoped bounded reads and preserve exact revisions',async()=>{
 const calls=[];const abort=new AbortController();
 const page={data:[{model_alias:'video/model',api_key_name:'Video credential',vendor_id:id,vendor_revision:'9007199254740993',model_revision:'2',schema_revision:'schema-one',channel:'ark-direct-v1',offer_revision:null}],has_more:false,next_after:null};
 const client=new NiuAdminClient({adminToken:'fixture',fetch:async(url,init)=>{calls.push({url,init});return Response.json(page);}});
 assert.deepEqual(await client.listSupplierMediaOfferModels(id,{after:'video/model',limit:1},{signal:abort.signal}),page);
 assert.ok(calls[0].url.endsWith(`/providers/${id}/media-offer-models?after=video%2Fmodel&limit=1`));
 assert.equal(calls[0].init.method,'GET');assert.equal(calls[0].init.body,undefined);assert.equal(calls[0].init.signal,abort.signal);
 for(const limit of [0,101,1.5])assert.throws(()=>client.listSupplierMediaOfferModels(id,{limit}));
 for(const after of [' bad','🦉'.repeat(65),'bad\u0000'])assert.throws(()=>client.listSupplierMediaOfferModels(id,{after}));
 assert.throws(()=>client.listSupplierMediaOfferModels('../foreign'));
 assert.equal(calls.length,1);
});
test('offer publication sends only pinned bindings and explicitly replays one receipt after uncertainty',async()=>{
 const calls=[];const abort=new AbortController();
 const client=new NiuAdminClient({adminToken:'fixture',fetch:async(url,init)=>{calls.push({url,init});if(calls.length===1)throw new Error('uncertain');return Response.json({data:{revision:id}});}});
 await assert.rejects(client.publishSupplierMediaOffer(id,{...input,customer_price:'must-not-send',prompt_rate:'must-not-send'},{signal:abort.signal}),/uncertain/);
 assert.equal(calls.length,1);
 assert.deepEqual(await client.publishSupplierMediaOffer(id,input),{data:{revision:id}});
 assert.equal(calls.length,2);assert.equal(calls[0].init.body,calls[1].init.body);
 assert.deepEqual(JSON.parse(calls[0].init.body),input);
 assert.ok(calls[0].url.endsWith(`/providers/${id}/media-offers`));assert.equal(calls[0].init.method,'POST');assert.equal(calls[0].init.signal,abort.signal);
});
test('invalid or lossy offer bindings never produce a request',()=>{
 let calls=0;const client=new NiuAdminClient({adminToken:'fixture',fetch:async()=>{calls++;return Response.json({});}});
 for(const vendor_revision of [0,1.5,Number.MAX_SAFE_INTEGER+1])assert.throws(()=>client.publishSupplierMediaOffer(id,{...input,vendor_revision}));
 for(const schema_revision of ['', ' bad','🦉'.repeat(65),'x\n'])assert.throws(()=>client.publishSupplierMediaOffer(id,{...input,schema_revision}));
 for(const field of ['revision','vendor_id','expected_revision'])assert.throws(()=>client.publishSupplierMediaOffer(id,{...input,[field]:'../foreign'}));
 assert.equal(calls,0);
});
test('offer writes preserve exact decimal revisions above the browser integer range',async()=>{
 const calls=[];const client=new NiuAdminClient({adminToken:'fixture',fetch:async(url,init)=>{calls.push({url,init});return Response.json({data:{revision:id}});}});
 const exact={...input,vendor_revision:'9007199254740993',model_revision:'9223372036854775807'};
 await client.publishSupplierMediaOffer(id,exact);
 assert.deepEqual(JSON.parse(calls[0].init.body),exact);
 for(const value of ['', '0','01','+1',' 1','1.0','9223372036854775808','-1']) {
  for(const field of ['vendor_revision','model_revision']) assert.throws(()=>client.publishSupplierMediaOffer(id,{...input,[field]:value}));
 }
 assert.equal(calls.length,1);
});
