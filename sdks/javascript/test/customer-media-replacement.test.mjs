import assert from 'node:assert/strict';
import test from 'node:test';
import { NiuAdminClient } from '../dist/index.js';
const id = 'a099bcd0-77db-4c75-81f8-84b21d45d861';
const quantity = { numerator: '1', denominator: '1' };
const card = {revision:'selling-next',vendor_id:id,vendor_revision:1,model_revision:2,schema_revision:'schema',offer_revision:id,
 tariff:{revision:'tariff-next',dimensions:{model:'video/model',channel:'ark-direct-v1',resolution:'720p',reference_video:false},meter:'video_tokens',currency:'CNY',decimal_places:9,amount_units:100,per_quantity:quantity,minimum_quantity:{numerator:'0',denominator:'1'},rounding:'Up',effective_from:50,effective_until:null},
 discounts:[],maximum_quantity:{numerator:'200000',denominator:'1'},liability_qualification_revision:'reviewed-bound'};
test('customer replacement scopes and allowlists one explicit atomic mutation', async()=>{
 const calls=[];const controller=new AbortController();
 const client=new NiuAdminClient({adminToken:'fixture',fetch:async(url,init)=>{calls.push({url,init});if(calls.length===1)throw new Error('uncertain');return Response.json({data:{revision:'selling-next',effective_from:'50'}});}});
 await assert.rejects(client.replaceCustomerMediaRate(id,'selling-old',{...card,purchase_price:'private'},{signal:controller.signal}),/uncertain/);
 assert.equal(calls.length,1);
 await client.replaceCustomerMediaRate(id,'selling-old',card);
 assert.equal(calls.length,2);
 assert.equal(calls[0].init.body,calls[1].init.body);
 assert.deepEqual(JSON.parse(calls[0].init.body),{previous_revision:'selling-old',rate:card});
 assert.ok(calls[0].url.endsWith(`/organizations/${id}/billing/media-rates/replace`));
 assert.equal(calls[0].init.method,'POST');assert.equal(calls[0].init.signal,controller.signal);
});
test('invalid replacement cursors and lossy monetary values never send',()=>{
 let calls=0;const client=new NiuAdminClient({adminToken:'fixture',fetch:async()=>{calls++;return Response.json({});}});
 for(const previous of ['', ' bad','🦉'.repeat(65),'bad\n'])assert.throws(()=>client.replaceCustomerMediaRate(id,previous,card));
 assert.throws(()=>client.replaceCustomerMediaRate('../foreign','selling-old',card));
 for(const amount_units of [0.5,Number.MAX_SAFE_INTEGER+1])assert.throws(()=>client.replaceCustomerMediaRate(id,'selling-old',{...card,tariff:{...card.tariff,amount_units}}));
 assert.equal(calls,0);
});
test('customer history preserves exact read values and bounded organization cursors',async()=>{
 const calls=[];const page={data:[{card:{...card,vendor_revision:'9007199254740993',model_revision:'2',tariff:{...card.tariff,amount_units:'9007199254740993',effective_from:'50',effective_until:null}},retirement_effective_until:null,created_at:null}],has_more:false,next_after:null};
 const client=new NiuAdminClient({adminToken:'fixture',fetch:async(url,init)=>{calls.push({url,init});return Response.json(page);}});
 assert.deepEqual(await client.listCustomerMediaRates(id,{after:'selling/old',limit:1}),page);
 assert.ok(calls[0].url.endsWith(`/organizations/${id}/billing/media-rates?after=selling%2Fold&limit=1`));
 assert.equal(calls[0].init.method,'GET');assert.equal(calls[0].init.body,undefined);
 for(const limit of [0,101,1.5])assert.throws(()=>client.listCustomerMediaRates(id,{limit}));
 for(const after of ['', ' bad','🦉'.repeat(65),'bad\n'])assert.throws(()=>client.listCustomerMediaRates(id,{after}));
 assert.equal(calls.length,1);
});
test('qualified customer model choices preserve hidden bindings and bound traversal',async()=>{
 const calls=[];const page={data:[{model_alias:'video/model',api_key_name:'Video credential',vendor_id:id,offer_revision:id,vendor_revision:'9007199254740993',model_revision:'2',schema_revision:'schema',channel:'ark-direct-v1',resolutions:['720p'],reference_video:false}],has_more:false,next_after:null};
 const client=new NiuAdminClient({adminToken:'fixture',fetch:async(url,init)=>{calls.push({url,init});return Response.json(page);}});
 assert.deepEqual(await client.listCustomerMediaRateModels(id,{after:'video/model',limit:1}),page);
 assert.ok(calls[0].url.endsWith(`/organizations/${id}/billing/media-rate-models?after=video%2Fmodel&limit=1`));
 assert.equal(calls[0].init.method,'GET');assert.equal(calls[0].init.body,undefined);
 for(const limit of [0,101,1.5])assert.throws(()=>client.listCustomerMediaRateModels(id,{limit}));
 for(const after of ['', ' bad','🦉'.repeat(65),'bad\n'])assert.throws(()=>client.listCustomerMediaRateModels(id,{after}));
 assert.equal(calls.length,1);
});
