import assert from 'node:assert/strict';
import test from 'node:test';
import {NiuAdminClient} from '../dist/index.js';

test('standard price note is optional while promotion reasons remain required', async () => {
  const calls = [];
  const client = new NiuAdminClient({adminToken:'fixture',fetch:async (_url, init) => {calls.push(JSON.parse(init.body));return Response.json({data:{}});}});
  const id = '12345678-1234-1234-1234-123456789abc';
  const schedule = {kind:'media',dimensions:{model:'fixture',channel:'fixture',resolution:'720p',reference_video:false},meter:'seconds',decimal_places:9,amount_units:'10',per_quantity:{numerator:'1',denominator:'1'},minimum_quantity:{numerator:'0',denominator:'1'},rounding:'HalfEven'};
  const common = {model_alias:'fixture',currency:'USD',schedule,expected_version:'0',idempotency_key:id};
  await client.publishRetailStandard(common);
  await client.publishRetailStandard({...common,reason:''});
  assert.equal(Object.hasOwn(calls[0], 'reason'), false);
  assert.equal(calls[1].reason, '');
  assert.throws(() => client.publishRetailStandard({...common,reason:'bad\nreason'}), /justification/);
  assert.throws(() => client.publishRetailPromotion(id,{baseline_revision:id,customer_organization_id:null,schedule,effective_from:'1',effective_until:'2',expected_version:'1',idempotency_key:id,reason:''}), /justification/);
  assert.equal(calls.length,2);
});
