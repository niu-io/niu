import assert from 'node:assert/strict';
import test from 'node:test';
import { NiuAdminClient, NiuAPIError } from '../dist/index.js';

const id = '12345678-1234-1234-1234-123456789abc';
const scope = { organizationId: id, projectId: id };

test('detector disclosure and decision reads remain scoped, cancellable and bodyless', async () => {
  const calls = [];
  const abort = new AbortController();
  const disclosure = {data: [{detector: 'review', content_sent: 'request_text_after_local_redaction', cost_mode: 'unknown', policy_activation: false}]};
  const decisions = {data: [{detector: 'review', outcome: 'indeterminate', reason: 'timeout'}], coverage: 'latest_100_input_detector_decisions'};
  const client = new NiuAdminClient({adminToken: 'test', fetch: async (url, init) => {
    calls.push({url, init});
    return Response.json(url.endsWith('/detectors') ? disclosure : decisions);
  }});
  assert.deepEqual(await client.listWorkspaceDetectors(scope, {signal: abort.signal}), disclosure);
  assert.deepEqual(await client.listInputDetectorDecisions(scope, {signal: abort.signal}), decisions);
  assert.ok(calls[0].url.endsWith(`/organizations/${id}/projects/${id}/guardrails/detectors`));
  assert.ok(calls[1].url.endsWith(`/organizations/${id}/projects/${id}/guardrails/detector-decisions`));
  for (const {init} of calls) {
    assert.equal(init.method, 'GET');
    assert.equal(init.body, undefined);
    assert.equal(init.signal, abort.signal);
  }
  for (const method of ['listWorkspaceDetectors', 'listInputDetectorDecisions']) {
    assert.throws(() => client[method]({...scope, projectId: '../foreign'}), /UUID/);
    assert.throws(() => client[method]({...scope, organizationId: '../foreign'}), /UUID/);
  }
  assert.equal(calls.length, 2);
});

test('Supplier qualification preserves reviewed digests, rate revision and explicit lifecycle operations', async () => {
  const calls = []; const digest = 'a'.repeat(64); const expiry = Date.now()+60000;
  const client = new NiuAdminClient({adminToken:'test',fetch:async(url,init)=>{calls.push({url,init});return Response.json({data:{}});}});
  const business = {supply_rights_sha256:digest,supply_capability_sha256:digest,data_handling_sha256:digest,valid_until_ms:expiry};
  const offer = {rate_revision:id,model_identity_sha256:digest,protocol_matrix_sha256:digest,protocol_matrix_version:'review-v1',data_handling_sha256:digest,availability_sha256:digest,agreed_rates_sha256:digest,valid_until_ms:expiry};
  const abort = new AbortController();
  await client.qualifySupplier(id,{...business,secret:'must-not-send'}, {signal:abort.signal});
  await client.qualifySupplierOffer(id,id,{...offer,agreement:'must-not-send'});
  await client.revokeSupplierQualification(id,digest);
  await client.revokeSupplierOfferQualification(id,id,digest);
  await client.setSupplierOfferActive(id,id,false);
  assert.deepEqual(calls.map(call=>call.init.method),['PUT','PUT','POST','POST','PATCH']);
  assert.deepEqual(JSON.parse(calls[0].init.body),business);
  assert.deepEqual(JSON.parse(calls[1].init.body),offer);
  assert.equal(calls[0].init.signal,abort.signal);
  assert.ok(calls[0].url.endsWith(`/providers/${id}/qualification`));
  assert.ok(calls[1].url.endsWith(`/providers/${id}/offers/${id}/qualification`));
  assert.ok(calls[2].url.endsWith(`/providers/${id}/qualification/revoke`));
  assert.ok(calls[3].url.endsWith(`/providers/${id}/offers/${id}/qualification/revoke`));
  assert.deepEqual(JSON.parse(calls[4].init.body),{active:false});
});
test('Supplier qualification rejects malformed evidence locally and never retries uncertain writes', async () => {
  const digest='b'.repeat(64); const input={supply_rights_sha256:digest,supply_capability_sha256:digest,data_handling_sha256:digest,valid_until_ms:Date.now()+60000};
  let calls=0; const client=new NiuAdminClient({adminToken:'test',fetch:async()=>{calls++;throw new Error('uncertain');}});
  for(const value of ['',digest.toUpperCase(),'g'.repeat(64),'a'.repeat(63),null]) assert.throws(()=>client.qualifySupplier(id,{...input,supply_rights_sha256:value}),/SHA-256/);
  for(const value of [0,Date.now()-1,Infinity,253402300800000,1.5]) assert.throws(()=>client.qualifySupplier(id,{...input,valid_until_ms:value}),/expiry/);
  assert.throws(()=>client.setSupplierOfferActive(id,id,'yes'),/boolean/);
  assert.equal(calls,0);
  await assert.rejects(client.qualifySupplier(id,input),/uncertain/);
  assert.equal(calls,1);
});

test('Chat export reads one durable scoped conversation without mutation', async () => {
  const calls = []; const abort = new AbortController();
  const exported = {format:'niu-chat',version:1,title:'Conversation',turns:[{prompt:'Hello',results:[{model:'fast',content:'Hi',phase:'complete'}]}]};
  const client = new NiuAdminClient({adminToken:'test',fetch:async(url,init)=>{calls.push({url,init});return Response.json(exported);}});
  assert.deepEqual(await client.exportChatSession(scope,id,{signal:abort.signal}),exported);
  assert.ok(calls[0].url.endsWith(`/organizations/${id}/projects/${id}/chat-sessions/${id}/export`));
  assert.equal(calls[0].init.method,'GET'); assert.equal(calls[0].init.body,undefined);
  assert.equal(calls[0].init.signal,abort.signal);
  assert.throws(()=>client.exportChatSession(scope,'../foreign'),/UUID/);
  assert.equal(calls.length,1);
});

test('saved top-up history uses scoped bodyless cursor reads and preserves backend records', async () => {
  const calls = [];
  const abort = new AbortController();
  const result = {data:[{id,currency:'CNY',amount_nanos:'1000000000',payment_method:'wxpaynative',status:'closed',checkout_url:null,created_at:'2026-10-06T00:00:00Z'}],next_cursor:null};
  const client = new NiuAdminClient({adminToken:'test',fetch:async(url,init)=>{calls.push({url,init});return Response.json(result);}});
  assert.deepEqual(await client.listCustomerTopups(id,{before:id,signal:abort.signal}),result);
  assert.ok(calls[0].url.endsWith(`/admin/v1/organizations/${id}/billing/topups?before=${id}`));
  assert.equal(calls[0].init.method,'GET');assert.equal(calls[0].init.body,undefined);assert.equal(calls[0].init.signal,abort.signal);
  assert.throws(()=>client.listCustomerTopups(id,{before:'../foreign'}),/UUID/);
  assert.equal(calls.length,1);
});

test('payment method discovery preserves company scope, unavailable states and cancellation without mutation', async () => {
  const abort = new AbortController();
  const calls = [];
  const data = {currency:'CNY', payment_gateway:null, available:false, payment_methods:[], unavailable_reason:'integration_unavailable'};
  const client = new NiuAdminClient({adminToken:'test', fetch:async(url,init)=>{calls.push({url,init});return Response.json({data});}});
  assert.deepEqual(await client.getCustomerPaymentMethods(id,{signal:abort.signal}),{data});
  assert.ok(calls[0].url.endsWith(`/admin/v1/organizations/${id}/billing/payment-methods`));
  assert.equal(calls[0].init.method,'GET');
  assert.equal(calls[0].init.body,undefined);
  assert.equal(calls[0].init.signal,abort.signal);
  assert.throws(()=>client.getCustomerPaymentMethods('../foreign'),/UUID/);
  assert.throws(()=>client.getCustomerPaymentMethods(id,{currency:'usd'}),/currency/);
  assert.equal(calls.length,1);
  await client.getCustomerPaymentMethods(id,{currency:'USD',payment_gateway:'stripe',signal:abort.signal});
  assert.ok(calls[1].url.endsWith('/payment-methods?currency=USD&payment_gateway=stripe'));
  assert.throws(()=>client.getCustomerPaymentMethods(id,{payment_gateway:'unknown'}),/gateway/);
  assert.equal(calls[1].init.signal,abort.signal);
});

test('top-ups preserve exact amounts, idempotency and durable recovery without forwarding funding flags', async () => {
  const calls = [];
  const abort = new AbortController();
  const data = { id, currency: 'CNY', amount_nanos: '9007199260000000', payment_method: 'wxpaynative', status: 'pending', checkout_url: 'https://checkout.example/pay' };
  const client = new NiuAdminClient({ adminToken: 'test', fetch: async (url, init) => { calls.push({url, init}); return Response.json({data}); } });
  const input = {amount_nanos: data.amount_nanos, payment_method: data.payment_method, idempotency_key: id, paid: true, actual_amount: '999', credit_limit_nanos: '999'};
  assert.deepEqual(await client.createCustomerTopup(id, input, {signal: abort.signal}), {data});
  assert.equal(calls[0].init.method, 'POST');
  assert.ok(calls[0].url.endsWith(`/organizations/${id}/billing/topups`));
  assert.deepEqual(JSON.parse(calls[0].init.body), {amount_nanos: data.amount_nanos, payment_method: data.payment_method, idempotency_key: id});
  assert.equal(calls[0].init.signal, abort.signal);
  assert.deepEqual(await client.getCustomerTopup(id, id, {signal: abort.signal}), {data});
  assert.ok(calls[1].url.endsWith(`/billing/topups/${id}`));
  assert.equal(calls[1].init.method, 'GET');
  assert.equal(calls[1].init.body, undefined);
  assert.equal(calls[1].init.signal, abort.signal);
  await client.createCustomerTopup(id, {...input,currency:'USD',payment_gateway:'stripe'});
  assert.equal(JSON.parse(calls[2].init.body).currency,'USD');
  assert.equal(JSON.parse(calls[2].init.body).payment_gateway,'stripe');
  assert.throws(()=>client.createCustomerTopup(id,{...input,payment_gateway:'unknown'}),/gateway/);
  assert.throws(()=>client.createCustomerTopup(id,{...input,currency:'usd'}),/currency/);
  assert.equal(calls.length,3);
});

test('top-ups reject rounded, coercible, overprecise and overflowing amounts before transport', () => {
  let calls = 0;
  const client = new NiuAdminClient({adminToken:'test', fetch: async()=>{calls++; return Response.json({});}});
  const valid = {amount_nanos:'1000000000', payment_method:'wxpaynative', idempotency_key:id};
  for (const amount_nanos of [0, 1000000000, null, undefined, '0', '-1', '+1000000000', '1e9', '1.00', '1', '1000000001', '9223372036860000000', '9'.repeat(100)]) {
    assert.throws(()=>client.createCustomerTopup(id,{...valid,amount_nanos}),/exact positive amount/);
  }
  for (const payment_method of ['', '../foreign', 'x'.repeat(65), null, 1]) {
    assert.throws(()=>client.createCustomerTopup(id,{...valid,payment_method}),/payment method/);
  }
  assert.throws(()=>client.createCustomerTopup(id,{...valid,idempotency_key:'../foreign'}),/UUID/);
  assert.throws(()=>client.getCustomerTopup(id,'../foreign'),/UUID/);
  assert.equal(calls,0);
});

test('uncertain top-up creation is never retried automatically', async () => {
  let calls=0;
  const client=new NiuAdminClient({adminToken:'test',fetch:async()=>{calls++;throw new Error('connection lost');}});
  await assert.rejects(client.createCustomerTopup(id,{amount_nanos:'1000000000',payment_method:'wxpaynative',idempotency_key:id}),/connection lost/);
  assert.equal(calls,1);
});
const observation = { window_key: 'monthly', unit: 'tokens', remaining: '9223372036854775807', maximum: null, observed_at_ms: 1, valid_until_ms: 2, resets_at_ms: 3, source: 'fixture' };

test('collector requests preserve exact quantities, scope, cancellation and explicit auth', async () => {
  const calls = [];
  const abort = new AbortController();
  const client = new NiuAdminClient({ adminToken: 'test-admin', fetch: async (url, init) => {
    calls.push({ url, init }); return Response.json({ id });
  }});
  assert.deepEqual(await client.observeQuota(scope, id, observation, { signal: abort.signal }), { id });
  await client.quota(scope, id);
  await client.listAccounts(scope);
  await client.createAccount(scope, { provider: 'fixture', plan: 'monthly', authentication_mode: 'api_key', billing_mode: 'subscription', credential_reference: 'env:FIXTURE', concurrency_limit: 1 });
  assert.equal(calls[0].url, `http://localhost:2555/admin/v1/organizations/${id}/projects/${id}/accounts/${id}/quota`);
  assert.equal(calls[0].init.headers.authorization, 'Bearer test-admin');
  assert.equal(calls[0].init.signal, abort.signal);
  assert.equal(calls[0].init.redirect, 'error');
  assert.deepEqual(JSON.parse(calls[0].init.body), observation);
  assert.deepEqual(calls.map(x => x.init.method), ['POST', 'GET', 'GET', 'POST']);
});

test('invalid quantities and scope injection are rejected before transport', () => {
  const client = new NiuAdminClient({ adminToken: 'test', fetch: () => { throw new Error('transport reached'); } });
  for (const remaining of [1, '-1', '9223372036854775808', '', '1.5']) {
    assert.throws(() => client.observeQuota(scope, id, { ...observation, remaining }), /decimal strings/);
  }
  assert.throws(() => client.observeQuota(scope, id, { ...observation, observed_at_ms: Number.MAX_SAFE_INTEGER + 1 }), /safe-integer/);
  assert.throws(() => client.quota({ ...scope, projectId: '../other' }, id), /UUID/);
});

test('conflicts propagate without automatic resubmission', async () => {
  let calls = 0;
  const client = new NiuAdminClient({ adminToken: 'test', fetch: async () => {
    calls++; return Response.json({ error: { message: 'Conflicting evidence' } }, { status: 409 });
  }});
  await assert.rejects(client.observeQuota(scope, id, observation), error => error instanceof NiuAPIError && error.status === 409);
  assert.equal(calls, 1);
});

test('collector is bound to a copied project scope and exposes only ingestion', async () => {
  const { NiuCollectorClient } = await import('../dist/index.js');
  const mutableScope = { ...scope };
  let captured;
  const collector = new NiuCollectorClient({ collectorToken: 'test-collector', scope: mutableScope, fetch: async (url, init) => {
    captured = { url, init }; return Response.json({ id });
  }});
  mutableScope.projectId = '../other';
  await collector.observeQuota(id, observation);
  assert.equal(captured.url, `http://localhost:2555/admin/v1/organizations/${id}/projects/${id}/accounts/${id}/quota`);
  assert.equal(captured.init.headers.authorization, 'Bearer test-collector');
  assert.deepEqual(Object.getOwnPropertyNames(Object.getPrototypeOf(collector)), ['constructor', 'observeQuota']);
});

test('admin credential lifecycle sends explicit creation and deletion requests', async () => {
  const calls = [];
  const admin = new NiuAdminClient({ adminToken: 'test-admin', fetch: async (url, init) => {
    calls.push({ url, init });
    if (init.method === 'DELETE') return new Response(null, { status: 204 });
    if (init.method === 'GET') return Response.json({ data: [{ id, purpose: 'quota', revoked: false }] });
    return Response.json({ id, token: 'test-collector' });
  }});
  assert.equal((await admin.issueCollectorKey(scope, { name: 'collector', ttl_seconds: 3600 })).id, id);
  assert.equal((await admin.listCollectorKeys(scope, 'quota')).data[0].purpose, 'quota');
  assert.equal(await admin.revokeCollectorKey(scope, id), undefined);
  assert.equal(calls[1].init.method, 'GET');
  assert.ok(calls[1].url.endsWith('/collector-keys?purpose=quota'));
  assert.equal(calls[2].init.method, 'DELETE');
  assert.equal(calls[2].init.body, undefined);
  assert.ok(calls[2].url.endsWith(`/collector-keys/${id}`));
  assert.throws(() => admin.issueCollectorKey(scope, { name: 'collector', ttl_seconds: 0 }), /lifetime/);
  assert.equal(calls.length, 3);
});

test('activity filters and retained content stay scoped and preserve exact customer charges', async () => {
  const calls = [];
  const charge = '9007199254740993123';
  const client = new NiuAdminClient({ adminToken:'test-admin', fetch: async (url,init) => {
    calls.push({url,init});
    if (init.method === 'DELETE') return new Response(null,{status:204});
    if (url.endsWith('/payloads')) return Response.json({data:null});
    return Response.json({data:[{customer_charge_nanos:charge,timing:null,request_kind:'video'}],next_cursor:null,summary:{customer_charges:[{amount_nanos:charge}]}});
  }});
  const page = await client.listGatewayActivity(scope,{limit:100,fromMs:1,toMs:100,modelAlias:'openai/model?test',apiKeyId:id,status:'may_have_executed'});
  assert.equal(page.data[0].customer_charge_nanos,charge);
  assert.equal(page.data[0].request_kind,'video');
  assert.equal(page.summary.customer_charges[0].amount_nanos,charge);
  const params = new URL(calls[0].url).searchParams;
  assert.equal(params.get('model_alias'),'openai/model?test');
  assert.equal(params.get('key_id'),id);
  assert.equal(params.get('from_ms'),'1');
  assert.equal(params.get('status'),'may_have_executed');
  assert.deepEqual(await client.getRequestPayload(scope,id),{data:null});
  assert.equal(await client.deleteRequestPayload(scope,id),undefined);
  assert.equal(calls[2].init.method,'DELETE');
  assert.ok(calls[2].url.endsWith(`/organizations/${id}/projects/${id}/requests/${id}/payloads`));
  assert.throws(()=>client.listGatewayActivity(scope,{fromMs:100,toMs:1}),/range/);
  assert.throws(()=>client.listGatewayActivity(scope,{toMs:Number.MAX_SAFE_INTEGER+1}),/safe-integer/);
  assert.throws(()=>client.getRequestPayload(scope,'../other'),/UUID/);
  assert.throws(()=>client.listGatewayActivity(scope,{status:'invented'}),/execution status/);
  assert.equal(calls.length,3);
});

test('Supplier association preserves revision, cancellation and conflict without retries', async () => {
  const calls = [];
  const abort = new AbortController();
  const supplier = 'abcdefab-1234-1234-1234-123456789abc';
  const client = new NiuAdminClient({ adminToken: 'test-admin', fetch: async (url, init) => {
    calls.push({ url, init });
    if (init.method === 'GET') return Response.json({ data: { id: supplier, name: 'Example Supplier' } });
    if (calls.length === 2) return new Response(null, { status: 204 });
    return Response.json({ error: { message: 'Revision changed' } }, { status: 409 });
  }});
  assert.equal((await client.getSupplierAssociation(id)).data.name, 'Example Supplier');
  assert.equal(await client.associateSupplier(id, supplier, 2, { signal: abort.signal }), undefined);
  assert.ok(calls[1].url.endsWith(`/vendors/${id}/supplier`));
  assert.equal(calls[1].init.method, 'PUT');
  assert.equal(calls[1].init.signal, abort.signal);
  assert.deepEqual(JSON.parse(calls[1].init.body), { supplier_id: supplier, expected_revision: 2 });
  await assert.rejects(client.associateSupplier(id, supplier, 2), error => error instanceof NiuAPIError && error.status === 409);
  assert.equal(calls.length, 3);
  for (const revision of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => client.associateSupplier(id, supplier, revision), /positive safe integer/);
  }
  assert.throws(() => client.getSupplierAssociation('../other'), /UUID/);
  assert.throws(() => client.associateSupplier(id, '../other', 2), /UUID/);
  assert.equal(calls.length, 3);
});

test('Chat lifecycle uses scoped backend history and bodyless deletion', async () => {
  const calls = [];
  const abort = new AbortController();
  const client = new NiuAdminClient({ adminToken: 'test-admin', fetch: async (url, init) => {
    calls.push({ url, init });
    return init.method === 'DELETE' ? new Response(null, { status: 204 }) : Response.json({ data: [{ title: 'Saved conversation' }] });
  }});
  assert.equal((await client.listChatSessions(scope)).data[0].title, 'Saved conversation');
  assert.equal(await client.deleteChatSession(scope, id, { signal: abort.signal }), undefined);
  assert.ok(calls[0].url.endsWith(`/organizations/${id}/projects/${id}/chat-sessions`));
  assert.ok(calls[1].url.endsWith(`/chat-sessions/${id}`));
  assert.equal(calls[1].init.method, 'DELETE');
  assert.equal(calls[1].init.body, undefined);
  assert.equal(calls[1].init.signal, abort.signal);
  assert.throws(() => client.deleteChatSession(scope, '../other'), /UUID/);
  assert.equal(calls.length, 2);
});

test('Chat save sends ordered branch results to the scoped backend', async () => {
  let call;
  const client = new NiuAdminClient({ adminToken: 'test-admin', fetch: async (url, init) => {
    call = { url, init }; return Response.json({ saved: true });
  }});
  const session = { prompt: 'Follow-up', createdAt: 1, results: [], turns: [
    { prompt: 'First question', results: [{ model: 'first', content: 'First reply', elapsedMs: 10, phase: 'complete' }] },
    { prompt: 'Follow-up', results: [{ model: 'first', content: 'Second reply', elapsedMs: 20, phase: 'complete' }] },
  ] };
  assert.deepEqual(await client.saveChatSession(scope, id, session), { saved: true });
  assert.equal(call.init.method, 'PUT');
  assert.ok(call.url.endsWith(`/organizations/${id}/projects/${id}/chat-sessions/${id}`));
  assert.deepEqual(JSON.parse(call.init.body), session);
});

test('Chat branch context preserves completed exchanges without mixing model replies', async () => {
  const { chatBranchMessages } = await import('../dist/index.js');
  const reply = (model, content, phase = 'complete') => ({ model, content, phase, elapsedMs: 1 });
  const turns = [
    { prompt: 'Question one', results: [reply('first', 'First answer'), reply('second', 'Other answer')] },
    { prompt: 'Interrupted', results: [reply('first', 'Partial output', 'cancelled'), reply('second', 'Complete answer')] },
    { prompt: 'Question two', results: [reply('first', 'Follow-up answer')] },
  ];
  const original = JSON.stringify(turns);
  assert.deepEqual(chatBranchMessages(turns, 'first'), [
    { role: 'user', content: 'Question one' }, { role: 'assistant', content: 'First answer' },
    { role: 'user', content: 'Question two' }, { role: 'assistant', content: 'Follow-up answer' },
  ]);
  assert.deepEqual(chatBranchMessages(turns, 'new-model'), []);
  assert.equal(chatBranchMessages(turns, 'second')[3].content, 'Complete answer');
  assert.equal(JSON.stringify(turns), original);
  assert.throws(() => chatBranchMessages([{ prompt: 'x', results: [reply('first', 'a'), reply('first', 'b')] }], 'first'), /Duplicate/);
  assert.throws(() => chatBranchMessages(turns, ''), /model/);
});

test('Guardrail clients preserve explicit deny semantics and revision conflicts', async () => {
  const calls = [];
  const policy = { schema_version: 1, name: 'Restricted', models: { mode: 'allow_list', values: [] }, providers: { mode: 'inherit' } };
  const client = new NiuAdminClient({ adminToken: 'test-admin', fetch: async (url, init) => {
    calls.push({ url, init });
    if (init.method === 'GET') return Response.json({ data: null });
    if (url.endsWith('/preview')) return Response.json({ allowed: false, coverage: 'model_provider_access', route_availability_checked: false });
    if (calls.length === 3) return Response.json({ revision: 1 });
    return Response.json({ error: { message: 'Revision conflict' } }, { status: 409 });
  }});
  assert.deepEqual(await client.getWorkspaceGuardrail(scope), { data: null });
  assert.equal((await client.previewWorkspaceGuardrail(scope, policy, 'fast', 'openai')).allowed, false);
  assert.deepEqual(await client.activateWorkspaceGuardrail(scope, 0, policy), { revision: 1 });
  assert.equal(calls[2].init.method, 'PUT');
  assert.deepEqual(JSON.parse(calls[2].init.body), { expected_revision: 0, policy });
  assert.ok(calls[0].url.endsWith(`/organizations/${id}/projects/${id}/guardrails`));
  await assert.rejects(client.activateWorkspaceGuardrail(scope, 0, policy), e => e instanceof NiuAPIError && e.status === 409);
  assert.equal(calls.length, 4);
  assert.throws(() => client.activateWorkspaceGuardrail(scope, -1, policy), /revision|Revision/);
  assert.equal(calls.length, 4);
});


test('Supplier rates preserve exact units and never retry publication', async () => {
  const calls = [];
  const rates = { model_alias: 'test/model', currency: 'USD', prompt_rate: '400000000', completion_rate: '1600000000', expected_revision: null };
  const client = new NiuAdminClient({ adminToken: 'test-admin', fetch: async (url, init) => {
    calls.push({ url, init });
    return calls.length === 1 ? Response.json({ data: { revision: 'opaque-revision' } })
      : Response.json({ error: { message: 'Conflict' } }, { status: 409 });
  }});
  assert.deepEqual(await client.publishSupplierRates(id, rates), { data: { revision: 'opaque-revision' } });
  assert.equal(calls[0].init.method, 'POST');
  assert.ok(calls[0].url.endsWith(`/providers/${id}/offers`));
  assert.deepEqual(JSON.parse(calls[0].init.body), rates);
  await assert.rejects(client.publishSupplierRates(id, { ...rates, expected_revision: id }), e => e instanceof NiuAPIError && e.status === 409);
  assert.equal(JSON.parse(calls[1].init.body).expected_revision, id);
  assert.equal(calls.length, 2);
  for (const prompt_rate of ['-1', '0.5', '1e9', '1000000000000001']) {
    assert.throws(() => client.publishSupplierRates(id, { ...rates, prompt_rate }), /Rates/);
  }
  assert.throws(() => client.publishSupplierRates(id, { ...rates, currency: 'usd' }), /currency/);
  assert.throws(() => client.publishSupplierRates(id, { ...rates, expected_revision: 'invalid' }), /UUID/);
  assert.equal(calls.length, 2);
});


test('Supplier offer reads expose current rates without unrelated administration records', async () => {
  const signal = new AbortController().signal;
  const offers = [{ id, revision: id, model_alias: 'test/model', currency: 'USD',
    prompt_rate: '400000000', completion_rate: '1600000000', active: false, qualified: false, route_ready: false }];
  let call;
  const client = new NiuAdminClient({ adminToken: 'test-admin', fetch: async (url, init) => {
    call = { url, init }; return Response.json({ data: { offers, earnings: [{ private: true }], settlements: [] } });
  }});
  assert.deepEqual(await client.listSupplierOffers(id, { signal }), offers);
  assert.equal(call.init.method, 'GET');
  assert.equal(call.init.signal, signal);
  assert.ok(call.url.endsWith(`/providers/${id}/administration`));
  assert.equal(call.init.body, undefined);
  await assert.rejects(client.listSupplierOffers('invalid'), /UUID/);
});

test('retail tariff publication is workspace scoped, exact, revision aware and never retried', async () => {
  const calls = [];
  const abort = new AbortController();
  const tariff = { model_alias: 'example/model', currency: 'USD', prompt_rate: '1234567891', completion_rate: '1000000000000000', expected_revision: id };
  const client = new NiuAdminClient({ adminToken: 'fixture', fetch: async (url, init) => {
    calls.push({ url, init });
    return Response.json({ error: { message: 'Stale revision' } }, { status: 409 });
  }});
  await assert.rejects(client.publishCustomerTariff(scope, tariff, { signal: abort.signal }), e => e instanceof NiuAPIError && e.status === 409);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `http://localhost:2555/admin/v1/organizations/${id}/projects/${id}/billing/tariffs`);
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.signal, abort.signal);
  assert.deepEqual(JSON.parse(calls[0].init.body), tariff);
  for (const prompt_rate of [1, 9007199254740993, '-1', '0.1', '1000000000000001']) assert.throws(() => client.publishCustomerTariff(scope, { ...tariff, prompt_rate }), /integer strings/);
  assert.throws(() => client.publishCustomerTariff({ ...scope, projectId: '../other' }, tariff), /UUID/);
  assert.equal(calls.length, 1);
});

test('customer billing reads retain exact amounts and unknown counts', async () => {
  const data = { balances: [{ currency: 'USD', charged_nanos: '9007199254740993', unbilled_nanos: '9007199254740993', due_nanos: '0', paid_nanos: '0' }], unresolved: '2', unpriced: '1', tariffs: [], invoices: [] };
  let request;
  const client = new NiuAdminClient({ adminToken: 'fixture', fetch: async (url, init) => { request = { url, init }; return Response.json({ data }); } });
  assert.deepEqual(await client.getCustomerBilling(scope), { data });
  assert.equal(request.init.method, 'GET');
  assert.equal(request.init.body, undefined);
  assert.equal(request.url, `http://localhost:2555/admin/v1/organizations/${id}/projects/${id}/billing`);
});


test('Supplier rate publication rejects numeric JavaScript inputs before transport', () => {
  let calls = 0;
  const client = new NiuAdminClient({ adminToken: 'fixture', fetch: async () => { calls++; return Response.json({}); } });
  const rates = { model_alias: 'example/model', currency: 'USD', prompt_rate: '1', completion_rate: '1', expected_revision: null };
  for (const field of ['prompt_rate', 'completion_rate']) {
    for (const number of [0, 1, Number.MAX_SAFE_INTEGER + 1]) {
      assert.throws(() => client.publishSupplierRates(id, { ...rates, [field]: number }), /integer strings/);
    }
  }
  assert.equal(calls, 0);
});


test('key Guardrail assignment is scoped, revision checked and not retried', async () => {
  const calls = [];
  const client = new NiuAdminClient({ adminToken: 'test-admin', fetch: async (url, init) => {
    calls.push({ url, init });
    if (init.method === 'GET') return Response.json({ data: null });
    if (calls.length === 2) return Response.json({ assignment_revision: 1 });
    return Response.json({ error: { message: 'Conflict' } }, { status: 409 });
  }});
  assert.deepEqual(await client.getKeyGuardrail(scope, id), { data: null });
  assert.deepEqual(await client.assignKeyGuardrail(scope, id, 3, 0), { assignment_revision: 1 });
  assert.ok(calls[1].url.endsWith(`/organizations/${id}/projects/${id}/keys/${id}/guardrail`));
  assert.equal(calls[1].init.method, 'PUT');
  assert.deepEqual(JSON.parse(calls[1].init.body), { policy_revision: 3, expected_assignment_revision: 0 });
  await assert.rejects(client.assignKeyGuardrail(scope, id, 3, 0), e => e instanceof NiuAPIError && e.status === 409);
  assert.equal(calls.length, 3);
  for (const [policy, assignment] of [[0, 0], [1, -1], [1, 1.5]]) assert.throws(() => client.assignKeyGuardrail(scope, id, policy, assignment), /revision/);
  assert.equal(calls.length, 3);
});


test('key Guardrail removal sends an explicit null and current revision', async () => {
  let call;
  const client = new NiuAdminClient({ adminToken: 'test-admin', fetch: async (url, init) => {
    call = { url, init }; return Response.json({ assignment_revision: 4 });
  }});
  assert.deepEqual(await client.clearKeyGuardrail(scope, id, 3), { assignment_revision: 4 });
  assert.deepEqual(JSON.parse(call.init.body), { policy_revision: null, expected_assignment_revision: 3 });
  assert.equal(call.init.method, 'PUT');
  for (const invalid of [0, -1, 1.5]) assert.throws(() => client.clearKeyGuardrail(scope, id, invalid), /revision/);
});


test('key Guardrail history preserves scope, cursor and readable attribution', async () => {
  let call;
  const events = { data: [{ assignment_revision: 3, policy_revision: null, policy_name: null, actor_name: 'Workspace administrator', created_at: '2026-10-02T00:00:00Z' }], next_cursor: null };
  const signal = new AbortController().signal;
  const client = new NiuAdminClient({ adminToken: 'test-admin', fetch: async (url, init) => { call = { url, init }; return Response.json(events); } });
  assert.deepEqual(await client.listKeyGuardrailHistory(scope, id, 4, { signal }), events);
  assert.ok(call.url.endsWith(`/organizations/${id}/projects/${id}/keys/${id}/guardrail/history?before_assignment_revision=4`));
  assert.equal(call.init.signal, signal);
  for (const invalid of [0, -1, 1.5]) assert.throws(() => client.listKeyGuardrailHistory(scope, id, invalid), /cursor/);
});

test('payload deletion preserves cancellation and authorization errors without retry', async () => {
  const signal = new AbortController().signal;
  const calls = [];
  const client = new NiuAdminClient({ adminToken: 'test-admin', fetch: async (url, init) => {
    calls.push({ url, init });
    return Response.json({ error: { message: 'Not found' } }, { status: 404 });
  } });
  await assert.rejects(client.deleteRequestPayload(scope, id, { signal }), error => error.status === 404);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].init.signal, signal);
  assert.equal(calls[0].init.method, 'DELETE');
  assert.throws(() => client.deleteRequestPayload(scope, '../another-workspace'), /UUID/);
  assert.equal(calls.length, 1);
});

test('synthetic input preview preserves scope, cancellation and explicit non-enforcement', async () => {
  const signal = new AbortController().signal;
  const calls = [];
  const verdict = {outcome:'indeterminate',reason:'unsupported_content',redacted:false,synthetic:true,enforcement:false};
  const client = new NiuAdminClient({adminToken:'test-admin',fetch:async(url,init)=>{
    calls.push({url,init});
    return Response.json(verdict);
  }});
  const input = {protocol:'embeddings',rules:[{pattern:'秘密',action:'block'}],request:{input:[1,2]}};
  assert.deepEqual(await client.previewGuardrailInput(scope,input,{signal}),verdict);
  assert.equal(calls[0].init.signal,signal);
  assert.deepEqual(JSON.parse(calls[0].init.body),input);
  assert.ok(calls[0].url.endsWith(`/organizations/${id}/projects/${id}/guardrails/input-preview`));
  for(const invalid of [
    {...input,protocol:'unknown'},
    {...input,rules:Array.from({length:33},()=>input.rules[0])},
    {...input,rules:[{pattern:'',action:'block'}]},
    {...input,rules:[{pattern:'秘密'.repeat(700),action:'block'}]},
    {...input,rules:[{pattern:'x',action:'ignore'}]},
  ]) assert.throws(()=>client.previewGuardrailInput(scope,invalid));
  assert.equal(calls.length,1);
});

test('request Guardrail attribution is scoped and keeps missing history unknown', async () => {
  const signal = new AbortController().signal;
  const calls = [];
  const decision = {stage:'dispatch',outcome:'allowed',coverage:'model_provider_access',enforcer_version:'access-v1',workspace_revision:2,workspace_policy_name:'Mandatory access',key_policy_revision:null,key_policy_name:null,key_assignment_revision:3,recorded_at:'2026-10-02T00:00:00Z'};
  const client = new NiuAdminClient({adminToken:'test-admin',fetch:async(url,init)=>{
    calls.push({url,init});
    return Response.json({data:calls.length===1 ? decision : null});
  }});
  assert.deepEqual(await client.getRequestGuardrailDecision(scope,id,{signal}),{data:decision});
  assert.equal(calls[0].init.signal,signal);
  assert.ok(calls[0].url.endsWith(`/organizations/${id}/projects/${id}/requests/${id}/guardrails`));
  assert.deepEqual(await client.getRequestGuardrailDecision(scope,id),{data:null});
  assert.throws(()=>client.getRequestGuardrailDecision(scope,'../other'),/UUID/);
  assert.equal(calls.length,2);
});

test('synthetic preset rules are explicit and cannot mix custom sources', async () => {
  let calls=0;
  const client=new NiuAdminClient({adminToken:'test-admin',fetch:async(_url,init)=>{
    calls++;
    assert.equal(JSON.parse(init.body).rules[0].preset,'email_v1');
    return Response.json({outcome:'allowed',reason:'inspected_text',redacted:true,synthetic:true,enforcement:false});
  }});
  const input={protocol:'chat',rules:[{preset:'email_v1',action:'redact'}],request:{messages:[{role:'user',content:'fixture@example.test'}]}};
  assert.equal((await client.previewGuardrailInput(scope,input)).redacted,true);
  for(const rule of [{preset:'unknown',action:'block'},{preset:'email_v1',pattern:'x',action:'block'},{action:'block'}]) {
    assert.throws(()=>client.previewGuardrailInput(scope,{...input,rules:[rule]}),/Invalid input rule/);
  }
  assert.equal(calls,1);
});

test('invoice closure keeps idempotency and conflicts without hidden replay', async () => {
  const calls = [];
  const signal = new AbortController().signal;
  const input = { from_ms: 0, to_ms: 1000, currency: 'USD', idempotency_key: id };
  const client = new NiuAdminClient({ adminToken: 'fixture', fetch: async (url, init) => {
    calls.push({url,init}); return Response.json({error:{message:'Unresolved usage'}},{status:409});
  }});
  await assert.rejects(client.issueCustomerInvoice(scope,input,{signal}), e => e instanceof NiuAPIError && e.status===409);
  assert.equal(calls.length,1);
  assert.ok(calls[0].url.endsWith(`/organizations/${id}/projects/${id}/billing/invoices`));
  assert.equal(calls[0].init.method,'POST');
  assert.equal(calls[0].init.signal,signal);
  assert.deepEqual(JSON.parse(calls[0].init.body),input);
  for (const patch of [{from_ms:-1},{to_ms:0},{to_ms:366*86400000+1},{from_ms:0.1},{to_ms:Number.MAX_SAFE_INTEGER+1},{currency:'usd'},{idempotency_key:'../other'}]) {
    assert.throws(()=>client.issueCustomerInvoice(scope,{...input,...patch}));
  }
  assert.equal(calls.length,1);
});

test('invoice line reads retain exact money and use workspace authorization', async () => {
  const lines=[{model_alias:'fixture/model',revision:id,currency:'USD',requests:'9007199254740993',prompt_tokens:'9007199254740993',completion_tokens:'1',prompt_rate:'300000000',completion_rate:'2500000000',amount_nanos:'9007199254740993'}];
  let call;
  const signal=new AbortController().signal;
  const client=new NiuAdminClient({adminToken:'fixture',fetch:async(url,init)=>{call={url,init};return Response.json({data:lines});}});
  assert.deepEqual(await client.getCustomerInvoiceLines(scope,id,{signal}),{data:lines});
  assert.ok(call.url.endsWith(`/organizations/${id}/projects/${id}/billing/invoices/${id}`));
  assert.equal(call.init.method,'GET');assert.equal(call.init.body,undefined);assert.equal(call.init.signal,signal);
  assert.throws(()=>client.getCustomerInvoiceLines(scope,'../other'),/UUID/);
});

test('external payment recording preserves references and authorization failures', async () => {
  const calls=[];
  const client=new NiuAdminClient({adminToken:'fixture',fetch:async(url,init)=>{calls.push({url,init});return Response.json({error:{message:'Forbidden'}},{status:403});}});
  await assert.rejects(client.recordCustomerInvoicePayment(scope,id,'  bank-reference  '),e=>e instanceof NiuAPIError&&e.status===403);
  assert.equal(calls.length,1);assert.ok(calls[0].url.endsWith(`/invoices/${id}/payment`));
  assert.deepEqual(JSON.parse(calls[0].init.body),{payment_reference:'bank-reference'});
  for(const reference of ['', 'x\nother', 'é'.repeat(101)])assert.throws(()=>client.recordCustomerInvoicePayment(scope,id,reference));
  assert.equal(calls.length,1);
});

test('preparation denial reads are scoped, cancellable, bounded and preserve missing policy metadata', async () => {
  const data=[{stage:'preparation',outcome:'blocked',coverage:'model_provider_access',enforcer_version:'access-v1',reason:'model_denied',key_name:'App key',workspace_policy_name:'Mandatory',key_policy_name:null,workspace_revision:1,key_policy_revision:null,key_assignment_revision:null,recorded_at:'2026-10-03T00:00:00Z'}];
  const signal=new AbortController().signal;const calls=[];
  const client=new NiuAdminClient({adminToken:'fixture',fetch:async(url,init)=>{calls.push({url,init});return Response.json({data,coverage:'latest_100_preparation_denials'});}});
  assert.deepEqual(await client.listGuardrailPreparationDenials(scope,{signal}),{data,coverage:'latest_100_preparation_denials'});
  assert.ok(calls[0].url.endsWith(`/organizations/${id}/projects/${id}/guardrails/denials`));
  assert.equal(calls[0].init.method,'GET');assert.equal(calls[0].init.body,undefined);assert.equal(calls[0].init.signal,signal);
  assert.throws(()=>client.listGuardrailPreparationDenials({...scope,projectId:'../other'}),/UUID/);
  assert.equal(calls.length,1);
});

test('workspace Guardrail history preserves scope, cursor and cancellation', async () => {
  let call;
  const page = { data: [{ revision: 3, policy_name: 'Policy', active: true, actor_name: 'Administrator', activated_at: '2026-10-03T00:00:00Z', restored_from_revision: 1 }], next_cursor: null };
  const signal = new AbortController().signal;
  const client = new NiuAdminClient({ adminToken: 'test-admin', fetch: async (url, init) => { call = { url, init }; return Response.json(page); } });
  assert.deepEqual(await client.listWorkspaceGuardrailHistory(scope, 4, { signal }), page);
  assert.ok(call.url.endsWith(`/organizations/${id}/projects/${id}/guardrails/history?before_revision=4`));
  assert.equal(call.init.signal, signal);
  assert.equal(call.init.method, 'GET');
  for (const invalid of [0, -1, 1.5, NaN, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => client.listWorkspaceGuardrailHistory(scope, invalid), /cursor/);
});

test('workspace rollback sends explicit revisions and never retries conflicts', async () => {
  const calls = [];
  const signal = new AbortController().signal;
  const client = new NiuAdminClient({ adminToken: 'test-admin', fetch: async (url, init) => {
    calls.push({ url, init });
    return calls.length === 1 ? Response.json({ revision: 4, restored_from_revision: 1 }) : Response.json({ error: { message: 'Conflict' } }, { status: 409 });
  }});
  assert.deepEqual(await client.rollbackWorkspaceGuardrail(scope, 3, 1, { signal }), { revision: 4, restored_from_revision: 1 });
  assert.ok(calls[0].url.endsWith(`/organizations/${id}/projects/${id}/guardrails/rollback`));
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.signal, signal);
  assert.deepEqual(JSON.parse(calls[0].init.body), { expected_revision: 3, target_revision: 1 });
  await assert.rejects(client.rollbackWorkspaceGuardrail(scope, 3, 1), e => e instanceof NiuAPIError && e.status === 409);
  assert.equal(calls.length, 2);
  for (const [head, target] of [[0,1], [1,0], [1,2], [1.5,1], [NaN,1]]) assert.throws(() => client.rollbackWorkspaceGuardrail(scope, head, target), /revision/);
  assert.equal(calls.length, 2);
});

test('saved Guardrail revision reads stay scoped and preserve cancellation', async () => {
  let call;
  const signal = new AbortController().signal;
  const page = { data: { revision: 1, policy: { name: 'Saved policy' } } };
  const client = new NiuAdminClient({ adminToken: 'test-admin', fetch: async (url, init) => { call = { url, init }; return Response.json(page); } });
  assert.deepEqual(await client.getWorkspaceGuardrailRevision(scope, 1, { signal }), page);
  assert.ok(call.url.endsWith(`/organizations/${id}/projects/${id}/guardrails/revisions/1`));
  assert.equal(call.init.signal, signal);
  for (const revision of [0, -1, NaN, 1.5]) assert.throws(() => client.getWorkspaceGuardrailRevision(scope, revision), /revision/);
});

test('synthetic output preview is scoped, cancellable and never implicitly retried', async () => {
  const calls = [];
  const signal = new AbortController().signal;
  const input = { protocol: 'chat', rules: [{ preset: 'email_v1', action: 'redact' }], response: { choices: [{ message: { role: 'assistant', content: 'fixture@example.test' } }] } };
  const result = { outcome: 'allowed', reason: 'inspected_text', redacted: true, synthetic: true, enforcement: false, mode: 'buffered_full', coverage: 'local_text' };
  const client = new NiuAdminClient({ adminToken: 'test-admin', fetch: async (url, init) => {
    calls.push({ url, init });
    return calls.length === 1 ? Response.json(result) : Response.json({ error: { message: 'Capacity unavailable' } }, { status: 503 });
  }});
  assert.deepEqual(await client.previewGuardrailOutput(scope, input, { signal }), result);
  assert.ok(calls[0].url.endsWith(`/organizations/${id}/projects/${id}/guardrails/output-preview`));
  assert.equal(calls[0].init.signal, signal);
  assert.deepEqual(JSON.parse(calls[0].init.body), input);
  await assert.rejects(client.previewGuardrailOutput(scope, input), e => e instanceof NiuAPIError && e.status === 503);
  assert.equal(calls.length, 2);
  for (const invalid of [
    { ...input, protocol: 'embeddings' }, { ...input, rules: [] },
    { ...input, rules: Array(33).fill(input.rules[0]) },
    { ...input, rules: [{ pattern: 'x', preset: 'email_v1', action: 'block' }] },
    { ...input, rules: [{ pattern: 'x'.repeat(4097), action: 'block' }] },
    { ...input, rules: [{ preset: 'unknown', action: 'redact' }] },
  ]) assert.throws(() => client.previewGuardrailOutput(scope, invalid));
  assert.equal(calls.length, 2);
});

test('withheld-output activity filters preserve execution and customer charges', async () => {
  const calls=[];
  const entry={execution:'confirmed_completed',output_guardrail_outcome:'blocked',customer_charge_nanos:'8000'};
  const client=new NiuAdminClient({adminToken:'test-admin',fetch:async(url)=>{calls.push(url);return Response.json({data:[entry],next_cursor:null,summary:{request_count:1}});}});
  const result=await client.listGatewayActivity(scope,{status:'output_withheld'});
  assert.equal(new URL(calls[0]).searchParams.get('status'),'output_withheld');
  assert.deepEqual(result.data[0],entry);
});

test('dispatch denial reads preserve scope, cancellation and explicit limited coverage', async () => {
  const abort = new AbortController();
  const calls = [];
  const result = { data: [], coverage: 'latest_100_dispatch_policy_exceptions' };
  const client = new NiuAdminClient({ adminToken: 'test', fetch: async (url, init) => {
    calls.push({ url, init }); return Response.json(result);
  }});
  assert.deepEqual(await client.listGuardrailDispatchDenials(scope, { signal: abort.signal }), result);
  assert.ok(calls[0].url.endsWith(`/organizations/${id}/projects/${id}/guardrails/dispatch-denials`));
  assert.equal(calls[0].init.method, 'GET');
  assert.equal(calls[0].init.signal, abort.signal);
});

test('CSV exports preserve full-range filters, exact text, cancellation and redirect isolation', async () => {
  const content = 'Time (UTC),Customer charge nanounits\r\n2026-10-03,"9007199254740993"\r\n';
  const controller = new AbortController();
  let calls = 0;
  const client = new NiuAdminClient({ adminToken: 'workspace-reader', fetch: async (input, init) => {
    calls++;
    const url = new URL(input);
    assert.equal(url.pathname, `/admin/v1/organizations/${id}/projects/${id}/requests/export`);
    assert.deepEqual(Object.fromEntries(url.searchParams), { sort: 'input_desc', from_ms: '1', to_ms: '2', model_alias: 'google/model & variant', key_id: id, status: 'confirmed_completed' });
    assert.equal(init.headers.authorization, 'Bearer workspace-reader');
    assert.equal(init.headers.accept, 'text/csv');
    assert.equal(init.redirect, 'error');
    assert.equal(init.signal, controller.signal);
    assert.equal(init.method, 'GET');
    assert.equal(init.body, undefined);
    return new Response(content, { headers: { 'content-type': 'text/csv; charset=utf-8' } });
  }});
  const filters = { sort: 'input_desc', fromMs: 1, toMs: 2, modelAlias: 'google/model & variant', apiKeyId: id, status: 'confirmed_completed' };
  assert.equal(await client.exportGatewayActivity(scope, filters, { signal: controller.signal }), content);
  for (const query of [{sort: 'invalid'}, {limit: 1}, {after: id}, {fromMs: 2, toMs: 1}, {status: 'invalid'}, {apiKeyId: 'invalid'}]) {
    assert.throws(() => client.exportGatewayActivity(scope, query));
  }
  assert.equal(calls, 1);
});

test('CSV exports propagate rejection without retry and reject unexpected successful content', async () => {
  for (const status of [401, 403, 413]) {
    let calls = 0;
    const client = new NiuAdminClient({ adminToken: 'test', fetch: async () => {
      calls++;
      return Response.json({error: {message: 'Narrow the selected range'}}, {status});
    }});
    await assert.rejects(client.exportGatewayActivity(scope), error => error instanceof NiuAPIError && error.status === status);
    assert.equal(calls, 1);
  }
  const client = new NiuAdminClient({ adminToken: 'test', fetch: async () => new Response('<html>Sign in</html>', {headers: {'content-type': 'text/html'}}) });
  await assert.rejects(client.exportGatewayActivity(scope), /Expected a CSV/);
});

test('delivery-status filters preserve unknowns, scope and independent Provider execution filters', async () => {
  const calls=[];
  const client=new NiuAdminClient({adminToken:'workspace-reader',fetch:async(url)=>{calls.push(new URL(url));return Response.json({data:[],summary:{delivery_statuses:[{http_status:null,request_count:150}]}});}});
  await client.listGatewayActivity(scope,{httpStatus:502,status:'confirmed_completed'});
  await client.listGatewayActivity(scope,{httpStatus:'unknown'});
  await client.listGatewayActivity(scope,{status:'delivery_failed'});
  assert.equal(calls[0].searchParams.get('http_status'),'502');
  assert.equal(calls[0].searchParams.get('status'),'confirmed_completed');
  assert.equal(calls[1].searchParams.get('http_status'),'unknown');
  assert.equal(calls[2].searchParams.get('status'),'delivery_failed');
  for(const httpStatus of [99,600,200.5,'502','invalid'])assert.throws(()=>client.listGatewayActivity(scope,{httpStatus}));
  assert.equal(calls.length,3);
});

test('versioned Niu-key preset reaches input and output preview without changing its rule', async () => {
  const calls = [];
  const client = new NiuAdminClient({adminToken: 'test-admin', fetch: async (url, init) => {
    calls.push({url, body: JSON.parse(init.body)});
    return Response.json({outcome: 'blocked', reason: 'pattern_denial', synthetic: true, enforcement: false});
  }});
  const rules = [{preset: 'niu_api_key_v1', action: 'block'}];
  await client.previewGuardrailInput(scope, {protocol: 'chat', rules, request: {messages: [{role: 'user', content: 'synthetic test'}]}});
  await client.previewGuardrailOutput(scope, {protocol: 'chat', rules, response: {choices: [{message: {role: 'assistant', content: 'synthetic test'}}]}});
  assert.equal(calls.length, 2);
  assert.ok(calls[0].url.endsWith('/input-preview'));
  assert.ok(calls[1].url.endsWith('/output-preview'));
  for (const call of calls) assert.deepEqual(call.body.rules, rules);
});

test('workspace key metadata preserves nullable last use, scope and cancellation without returning credentials', async () => {
  const abort = new AbortController();
  const data = [{id, name: 'Workspace key', allowed_models: ['*'], expires_at_ms: 2000000000000, last_used_at_ms: null, revoked: false, expired: false}];
  let transport;
  const client = new NiuAdminClient({adminToken: 'test-admin', fetch: async (url, init) => {
    transport = {url, init}; return Response.json({data});
  }});
  assert.deepEqual(await client.listWorkspaceKeys(scope, {signal: abort.signal}), {data});
  assert.equal(transport.url, `http://localhost:2555/admin/v1/organizations/${id}/projects/${id}/keys`);
  assert.equal(transport.init.method, 'GET');
  assert.equal(transport.init.signal, abort.signal);
  assert.equal(transport.init.headers.authorization, 'Bearer test-admin');
  assert.throws(() => client.listWorkspaceKeys({...scope, projectId: '../foreign'}), /UUID/);
});

test('company balance read keeps exact amounts and organization scope', async () => {
  const data = [{currency: 'CNY', balance_nanos: '-9007199254740993', reserved_nanos: '10', available_nanos: '7', credit_limit_nanos: '9007199254741010', warning_threshold_nanos: null, policy_revision: '0', low_balance: false, posted_credit_exhausted: false}];
  let transport;
  const client = new NiuAdminClient({adminToken: 'test-admin', fetch: async (url, init) => {
    transport = {url, init}; return Response.json({data});
  }});
  assert.deepEqual(await client.getCustomerBalance(id), {data});
  assert.equal(transport.url, `http://localhost:2555/admin/v1/organizations/${id}/billing/balance`);
  assert.equal(transport.init.method, 'GET');
  assert.throws(() => client.getCustomerBalance('../foreign'), /UUID/);
});

test('company ledger read preserves signed exact amounts, reversal linkage and cancellation', async () => {
  const abort = new AbortController();
  const data = [{id, kind: 'funding_reversal', currency: 'CNY', amount_nanos: '-9007199254740993', created_at: '2026-10-04T10:00:00Z', reverses_entry_id: id}];
  let transport;
  const client = new NiuAdminClient({adminToken: 'test-admin', fetch: async (url, init) => {
    transport = {url, init}; return Response.json({data});
  }});
  assert.deepEqual(await client.getCustomerBalanceTransactions(id, {signal: abort.signal}), {data});
  assert.equal(transport.url, `http://localhost:2555/admin/v1/organizations/${id}/billing/transactions`);
  assert.equal(transport.init.method, 'GET');
  assert.equal(transport.init.signal, abort.signal);
  assert.throws(() => client.getCustomerBalanceTransactions('../foreign'), /UUID/);
});

test('company ledger pagination validates cursor and preserves organization and cancellation', async () => {
 const abort=new AbortController();let transport;
 const client=new NiuAdminClient({adminToken:'test-admin',fetch:async (url,init)=>{transport={url,init};return Response.json({data:[],next_cursor:null});}});
 assert.deepEqual(await client.getCustomerBalanceTransactions(id,{before:id,signal:abort.signal}),{data:[],next_cursor:null});
 assert.equal(transport.url,`http://localhost:2555/admin/v1/organizations/${id}/billing/transactions?before=${id}`);
 assert.equal(transport.init.signal,abort.signal);
 assert.throws(()=>client.getCustomerBalanceTransactions(id,{before:'../foreign'}),/UUID/);
});

test('company warning writes exact amounts without accepting credit fields', async () => {
 let sent; const client=new NiuAdminClient({adminToken:'test',fetch:async(url,init)=>{sent={url,init};return Response.json({data:{revision:'2'}});}});
 const input={warning_threshold_nanos:'9007199254740993',expected_revision:'1',credit_limit_nanos:'999'};
 await client.setCustomerBalanceWarning(id,'CNY',input);
 assert.equal(sent.init.method,'PUT');assert.deepEqual(JSON.parse(sent.init.body),{warning_threshold_nanos:input.warning_threshold_nanos,expected_revision:'1'});
 assert.ok(sent.url.endsWith('/billing/accounts/CNY/warning-threshold'));
 assert.throws(()=>client.setCustomerBalanceWarning(id,'cny',input),/currency/);
 assert.throws(()=>client.setCustomerBalanceWarning(id,'CNY',{...input,warning_threshold_nanos:'-1'}),/nonnegative/);
});


test('warning preferences reject runtime coercion and exhausted revisions before transport', () => {
 let calls=0;
 const client=new NiuAdminClient({adminToken:'test',fetch:async()=>{calls++;return Response.json({});}});
 for (const input of [
  {warning_threshold_nanos:'1',expected_revision:null},
  {warning_threshold_nanos:'1',expected_revision:1},
  {warning_threshold_nanos:1,expected_revision:'1'},
  {warning_threshold_nanos:undefined,expected_revision:'1'},
  {warning_threshold_nanos:'1',expected_revision:'9223372036854775807'},
  {warning_threshold_nanos:'9223372036854775808',expected_revision:'1'},
 ]) assert.throws(()=>client.setCustomerBalanceWarning(id,'CNY',input),/exact nonnegative/);
 assert.equal(calls,0);
});

test('Personal credential assignment preserves ownership, revision and cancellation without retries', async () => {
  const calls = [];
  const abort = new AbortController();
  const organization = 'abcdefab-1234-1234-1234-123456789abc';
  const client = new NiuAdminClient({ adminToken: 'test-admin', fetch: async (url, init) => {
    calls.push({ url, init });
    if (calls.length === 1) return Response.json({ assigned: true });
    return Response.json({ error: { message: 'Ownership conflict' } }, { status: 409 });
  }});
  assert.deepEqual(await client.assignPersonalCredentialOwner(id, organization, 2, { signal: abort.signal }), { assigned: true });
  assert.ok(calls[0].url.endsWith(`/vendors/${id}/personal-owner`));
  assert.equal(calls[0].init.method, 'PUT');
  assert.equal(calls[0].init.signal, abort.signal);
  assert.deepEqual(JSON.parse(calls[0].init.body), { organization_id: organization, expected_revision: 2 });
  await assert.rejects(client.assignPersonalCredentialOwner(id, organization, 2), error => error instanceof NiuAPIError && error.status === 409);
  for (const revision of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => client.assignPersonalCredentialOwner(id, organization, revision), /positive safe integer/);
  assert.throws(() => client.assignPersonalCredentialOwner('../other', organization, 2), /UUID/);
  assert.throws(() => client.assignPersonalCredentialOwner(id, '../other', 2), /UUID/);
  assert.equal(calls.length, 2);
});

test('Chat archive and restore use explicit scoped state and cancellation without retries', async () => {
  const calls = []; const abort = new AbortController();
  const client = new NiuAdminClient({adminToken:'test-admin',fetch:async(url,init)=>{
    calls.push({url,init});
    return init.method === 'PUT' ? new Response(null,{status:204}) : Response.json({data:[]});
  }});
  assert.deepEqual(await client.listArchivedChatSessions(scope,{signal:abort.signal}),{data:[]});
  assert.ok(calls[0].url.endsWith(`/organizations/${id}/projects/${id}/chat-sessions?archived=true`));
  assert.equal(calls[0].init.body,undefined);
  for(const archived of [true,false]) {
    assert.equal(await client.setChatSessionArchived(scope,id,archived,{signal:abort.signal}),undefined);
    const call=calls.at(-1);
    assert.ok(call.url.endsWith(`/chat-sessions/${id}/archive`));
    assert.equal(call.init.method,'PUT');
    assert.deepEqual(JSON.parse(call.init.body),{archived});
    assert.equal(call.init.signal,abort.signal);
  }
  assert.throws(()=>client.setChatSessionArchived(scope,id,'true'),/boolean/);
  assert.throws(()=>client.setChatSessionArchived(scope,'../other',true),/UUID/);
  assert.equal(calls.length,3);
  let failures=0;
  const failing = new NiuAdminClient({adminToken:'test-admin',fetch:async()=>{failures++;return Response.json({error:{message:'denied'}},{status:403});}});
  await assert.rejects(failing.setChatSessionArchived(scope,id,true), error=>error instanceof NiuAPIError && error.status===403);
  assert.equal(failures,1);
});

test('output observation preview preserves its explicit mode and never implies redaction', async () => {
  const calls = [];
  const input = { mode: 'observe_only', protocol: 'chat', rules: [{ pattern: 'synthetic-match', action: 'redact' }], response: { choices: [{ message: { role: 'assistant', content: 'synthetic-match' } }] } };
  const result = { outcome: 'matched', reason: 'pattern_match', redacted: false, synthetic: true, enforcement: false, mode: 'observe_only', coverage: 'local_text' };
  const client = new NiuAdminClient({ adminToken: 'test-admin', fetch: async (url, init) => { calls.push({ url, init }); return Response.json(result); } });
  assert.deepEqual(await client.previewGuardrailOutput(scope, input), result);
  assert.deepEqual(JSON.parse(calls[0].init.body), input);
  assert.throws(() => client.previewGuardrailOutput(scope, { ...input, mode: 'unknown' }), /Unsupported output mode/);
  assert.equal(calls.length, 1);
});

test('video selling publication is exact, company scoped, cancellable and never retried', async () => {
  const calls=[];
  const abort=new AbortController();
  const client=new NiuAdminClient({adminToken:'test',fetch:async(url,init)=>{
    calls.push({url,init}); return Response.json({data:{revision:'selling-1'}});
  }});
  const q=n=>({numerator:String(n),denominator:'1'});
  const input={revision:'selling-1',vendor_id:id,vendor_revision:1,model_revision:1,schema_revision:'video-schema',offer_revision:'offer-1',
    tariff:{revision:'tariff-1',dimensions:{model:'fixture-video',channel:'ark-direct-v1',resolution:'720p',reference_video:false},meter:'video_tokens',currency:'CNY',decimal_places:9,amount_units:100,per_quantity:q(1000000),minimum_quantity:q(0),rounding:'Up',effective_from:10,effective_until:100},
    discounts:[],maximum_quantity:q(200000),liability_qualification_revision:'fixture-bound'};
  assert.deepEqual(await client.publishCustomerMediaRate(id,{...input,procurement:'must-not-send'},{signal:abort.signal}),{data:{revision:'selling-1'}});
  assert.ok(calls[0].url.endsWith(`/organizations/${id}/billing/media-rates`));
  assert.equal(calls[0].init.method,'POST');
  assert.equal(calls[0].init.signal,abort.signal);
  assert.deepEqual(JSON.parse(calls[0].init.body),input);
  assert.throws(()=>client.publishCustomerMediaRate('../foreign',input),/UUID/);
  assert.throws(()=>client.publishCustomerMediaRate(id,{...input,tariff:{...input.tariff,amount_units:Number.MAX_SAFE_INTEGER+1}}),/safe integers/);
  assert.equal(calls.length,1);
  let failed=0;
  const unavailable=new NiuAdminClient({adminToken:'test',fetch:async()=>{failed++;return Response.json({error:{message:'unavailable'}},{status:503});}});
  await assert.rejects(()=>unavailable.publishCustomerMediaRate(id,input),NiuAPIError);
  assert.equal(failed,1);
});


test('media selling retirement is exact, scoped and never retried', async () => {
  const calls = [];
  const abort = new AbortController();
  const client = new NiuAdminClient({adminToken:'test', fetch:async(url,init)=>{
    calls.push({url,init}); return Response.json({data:{revision:'selling 1',effective_until:'30'}});
  }});
  assert.deepEqual(await client.retireCustomerMediaRate(id,'selling 1',30,{signal:abort.signal}), {data:{revision:'selling 1',effective_until:'30'}});
  assert.ok(calls[0].url.endsWith(`/organizations/${id}/billing/media-rates/selling%201/retire`));
  assert.deepEqual(JSON.parse(calls[0].init.body), {effective_until:30});
  assert.equal(calls[0].init.method,'POST');
  assert.equal(calls[0].init.signal,abort.signal);
  assert.throws(()=>client.retireCustomerMediaRate(id,'../other',30),TypeError);
  assert.throws(()=>client.retireCustomerMediaRate(id,'selling',Number.MAX_SAFE_INTEGER+1),TypeError);
  assert.equal(calls.length,1);
  let failures=0;
  const failing = new NiuAdminClient({adminToken:'test',fetch:async()=>{failures++;return Response.json({error:{message:'unavailable'}},{status:503});}});
  await assert.rejects(failing.retireCustomerMediaRate(id,'selling',30),NiuAPIError);
  assert.equal(failures,1);
});


test('Supplier media purchase publication stays separate, exact and never retried', async () => {
  const calls=[];
  const abort=new AbortController();
  const client=new NiuAdminClient({adminToken:'test',fetch:async(url,init)=>{calls.push({url,init});return Response.json({data:{revision:'purchase-1'}});}});
  const q=n=>({numerator:String(n),denominator:'1'});
  const input={revision:'purchase-1',offer_revision:id,vendor_revision:1,model_revision:1,schema_revision:'video-schema',
    tariff:{revision:'purchase-tariff',dimensions:{model:'fixture-video',channel:'ark-direct-v1',resolution:'720p',reference_video:false},meter:'video_tokens',currency:'CNY',decimal_places:9,amount_units:40,per_quantity:q(1000000),minimum_quantity:q(0),rounding:'Up',effective_from:0,effective_until:null},discounts:[]};
  assert.deepEqual(await client.publishSupplierMediaRate(id,{...input,customer_charge:'must-not-send'},{signal:abort.signal}),{data:{revision:'purchase-1'}});
  assert.ok(calls[0].url.endsWith(`/providers/${id}/media-rates`));
  assert.deepEqual(JSON.parse(calls[0].init.body),input);
  assert.equal(calls[0].init.signal,abort.signal);
  assert.throws(()=>client.publishSupplierMediaRate(id,{...input,tariff:{...input.tariff,amount_units:Number.MAX_SAFE_INTEGER+1}}),TypeError);
  assert.equal(calls.length,1);
  let failures=0;
  const failing=new NiuAdminClient({adminToken:'test',fetch:async()=>{failures++;return Response.json({error:{message:'unavailable'}},{status:503});}});
  await assert.rejects(failing.publishSupplierMediaRate(id,input),NiuAPIError);
  assert.equal(failures,1);
});


test('Supplier rate history is paginated, exact and bodyless; retirement stays explicit', async () => {
  const calls=[];
  const abort=new AbortController();
  const page={data:[{card:{revision:'purchase 1',tariff:{amount_units:'9007199254740993'}},retirement_effective_until:null,created_at:null}],has_more:true,next_after:'purchase 1'};
  const client=new NiuAdminClient({adminToken:'test',fetch:async(url,init)=>{
    calls.push({url,init});return Response.json(init.method==='GET'?page:{data:{revision:'purchase 1',effective_until:'30'}});
  }});
  assert.deepEqual(await client.listSupplierMediaRates(id,{after:'purchase 0',limit:1},{signal:abort.signal}),page);
  assert.ok(calls[0].url.endsWith(`/providers/${id}/media-rates?after=purchase+0&limit=1`));
  assert.equal(calls[0].init.method,'GET');assert.equal(calls[0].init.body,undefined);assert.equal(calls[0].init.signal,abort.signal);
  assert.deepEqual(await client.retireSupplierMediaRate(id,'purchase 1',30),{data:{revision:'purchase 1',effective_until:'30'}});
  assert.ok(calls[1].url.endsWith(`/providers/${id}/media-rates/purchase%201/retire`));
  assert.deepEqual(JSON.parse(calls[1].init.body),{effective_until:30});
  assert.throws(()=>client.listSupplierMediaRates(id,{limit:101}),TypeError);
  assert.throws(()=>client.retireSupplierMediaRate(id,'../other',30),TypeError);
  assert.throws(()=>client.retireSupplierMediaRate(id,'purchase',Number.MAX_SAFE_INTEGER+1),TypeError);
  assert.equal(calls.length,2);
  let failures=0;
  const failing=new NiuAdminClient({adminToken:'test',fetch:async()=>{failures++;return Response.json({error:{message:'unavailable'}},{status:503});}});
  await assert.rejects(failing.retireSupplierMediaRate(id,'purchase',30),NiuAPIError);assert.equal(failures,1);
});

test('media pricing choices use exact bindings and a bounded bodyless request', async () => {
  const calls=[];
  const abort=new AbortController();
  const page={data:[{model_alias:'video/model',api_key_name:'Video key',offer_revision:id,vendor_revision:'9007199254740993',model_revision:'2',schema_revision:'schema',channel:'channel',resolutions:['720p'],reference_video:false}],has_more:true,next_after:'video/model'};
  const client=new NiuAdminClient({adminToken:'test',fetch:async(url,init)=>{calls.push({url,init});return Response.json(page);}});
  assert.deepEqual(await client.listSupplierMediaRateModels(id,{after:'previous/model',limit:1},{signal:abort.signal}),page);
  assert.ok(calls[0].url.endsWith(`/providers/${id}/media-rate-models?after=previous%2Fmodel&limit=1`));
  assert.equal(calls[0].init.method,'GET');assert.equal(calls[0].init.body,undefined);assert.equal(calls[0].init.signal,abort.signal);
  assert.throws(()=>client.listSupplierMediaRateModels(id,{limit:0}),TypeError);
  assert.throws(()=>client.listSupplierMediaRateModels(id,{after:' invalid '}),TypeError);
  assert.equal(calls.length,1);
});

test('Supplier media replacement carries one immutable document and no automatic retry', async () => {
  const calls=[];
  const abort=new AbortController();
  const q=n=>({numerator:String(n),denominator:'1'});
  const rate={revision:'next',offer_revision:id,vendor_revision:1,model_revision:2,schema_revision:'schema',tariff:{revision:'next-price',dimensions:{model:'video/model',channel:'channel',resolution:'720p',reference_video:false},meter:'video_tokens',currency:'CNY',decimal_places:9,amount_units:70,per_quantity:q(1000000),minimum_quantity:q(0),rounding:'Up',effective_from:210,effective_until:220},discounts:[]};
  const client=new NiuAdminClient({adminToken:'test',fetch:async(url,init)=>{calls.push({url,init});return Response.json({data:{revision:'next',effective_from:'210'}});}});
  assert.deepEqual(await client.replaceSupplierMediaRate(id,'previous',{...rate,customer_price:'must-not-send'},{signal:abort.signal}),{data:{revision:'next',effective_from:'210'}});
  assert.ok(calls[0].url.endsWith(`/providers/${id}/media-rates/replace`));
  assert.deepEqual(JSON.parse(calls[0].init.body),{previous_revision:'previous',rate});
  assert.equal(calls[0].init.signal,abort.signal);
  assert.throws(()=>client.replaceSupplierMediaRate(id,'',rate),TypeError);
  assert.throws(()=>client.replaceSupplierMediaRate(id,'previous',{...rate,vendor_revision:Number.MAX_SAFE_INTEGER+1}),TypeError);
  assert.equal(calls.length,1);
  let failures=0;
  const failing=new NiuAdminClient({adminToken:'test',fetch:async()=>{failures++;return Response.json({error:{message:'unavailable'}},{status:503});}});
  await assert.rejects(failing.replaceSupplierMediaRate(id,'previous',rate),NiuAPIError);assert.equal(failures,1);
});

test('workspace retail limits use exact scoped owner writes and revision history', async () => {
  const calls = [];
  const controller = new AbortController();
  const client = new NiuAdminClient({adminToken: 'test', fetch: async (url, init) => {
    calls.push({url, init}); return Response.json({data: null});
  }});
  await client.getWorkspaceSpendingLimit(scope, 'CNY', {signal: controller.signal});
  await client.setWorkspaceSpendingLimit(scope, 'CNY', {limit_nanos: '9223372036854775807', expected_revision: '0'}, {signal: controller.signal});
  await client.listWorkspaceSpendingLimitHistory(scope, 'CNY', {beforeRevision: '9223372036854775807', limit: 1}, {signal: controller.signal});
  assert.equal(calls[0].init.method, 'GET');
  assert.equal(calls[0].init.body, undefined);
  assert.equal(calls[1].init.method, 'PUT');
  assert.deepEqual(JSON.parse(calls[1].init.body), {limit_nanos: '9223372036854775807', expected_revision: '0'});
  assert.ok(calls[2].url.endsWith('/spending-limit/CNY/history?before_revision=9223372036854775807&limit=1'));
  for (const call of calls) {
    assert.ok(call.url.includes(`/organizations/${id}/projects/${id}/spending-limit/CNY`));
    assert.equal(call.init.signal, controller.signal);
  }
  for (const value of ['-1', '1.0', '1e3', ' 1', '', '9223372036854775808']) {
    assert.throws(() => client.setWorkspaceSpendingLimit(scope, 'CNY', {limit_nanos: value, expected_revision: '0'}));
  }
  assert.throws(() => client.setWorkspaceSpendingLimit(scope, 'CNY', {limit_nanos:'1', expected_revision:'9223372036854775807'}));
  assert.throws(() => client.getWorkspaceSpendingLimit(scope, 'cny'));
  assert.throws(() => client.listWorkspaceSpendingLimitHistory(scope, 'CNY', {beforeRevision:'0'}));
  assert.throws(() => client.listWorkspaceSpendingLimitHistory(scope, 'CNY', {limit:101}));
  assert.equal(calls.length, 3);
  await client.listWorkspaceSpendingLimits(scope, {signal: controller.signal});
  assert.ok(calls[3].url.endsWith(`/organizations/${id}/projects/${id}/spending-limit`));
  assert.equal(calls[3].init.signal, controller.signal);
  assert.equal(calls[3].init.method, 'GET');
  assert.equal(calls[3].init.body, undefined);
});

test('image detector disclosure stays scoped, bodyless and cancellable', async () => {
  const calls = [];
  const abort = new AbortController();
  const disclosure = {data: [{detector: 'image-review', schema_version: 2, content_sent: 'exact_encoded_image', policy_activation: false}]};
  const client = new NiuAdminClient({adminToken: 'test', fetch: async (url, init) => {
    calls.push({url, init}); return Response.json(disclosure);
  }});
  assert.deepEqual(await client.listWorkspaceImageDetectors(scope, {signal: abort.signal}), disclosure);
  assert.ok(calls[0].url.endsWith(`/organizations/${id}/projects/${id}/guardrails/image-detectors`));
  assert.equal(calls[0].init.method, 'GET');
  assert.equal(calls[0].init.body, undefined);
  assert.equal(calls[0].init.signal, abort.signal);
  for (const field of ['organizationId', 'projectId']) {
    assert.throws(() => client.listWorkspaceImageDetectors({...scope, [field]: '../foreign'}), /UUID/);
  }
  assert.equal(calls.length, 1);
});

test('image preview sends explicit scoped consent once and excludes extra fields', async () => {
  const calls=[]; const abort=new AbortController();
  const result={outcome:'clear',reason:'inspected_image',synthetic:true,enforcement:false,policy_activation:false};
  const client=new NiuAdminClient({adminToken:'test',fetch:async(url,init)=>{calls.push({url,init});return Response.json(result);}});
  const input={consent:{configuration_fingerprint:'a'.repeat(64),consent_to_image_processing:true,secret:'excluded'},image:'data:image/png;base64,fixture',activate:true};
  assert.deepEqual(await client.previewWorkspaceImageDetector(scope,'image_fixture',input,{signal:abort.signal}),result);
  assert.ok(calls[0].url.endsWith(`/organizations/${id}/projects/${id}/guardrails/image-detectors/image_fixture/preview`));
  assert.equal(calls[0].init.method,'POST'); assert.equal(calls[0].init.signal,abort.signal);
  assert.deepEqual(JSON.parse(calls[0].init.body),{consent:{configuration_fingerprint:'a'.repeat(64),consent_to_image_processing:true},image:input.image});
  for(const detector of ['../foreign','with space','']) assert.throws(()=>client.previewWorkspaceImageDetector(scope,detector,input),/detector/);
  for(const consent of [{configuration_fingerprint:'stale',consent_to_image_processing:true},{configuration_fingerprint:'a'.repeat(64),consent_to_image_processing:false}]) assert.throws(()=>client.previewWorkspaceImageDetector(scope,'image_fixture',{...input,consent}),/consent/);
  assert.throws(()=>client.previewWorkspaceImageDetector(scope,'image_fixture',{...input,image:'https://example.com/image.png'}),/inline/);
  assert.equal(calls.length,1);
});

test('asset management setup preserves revision and cancellation without retries or extra fields', async () => {
  const calls = [];
  const controller = new AbortController();
  const metadata = {revision:1,upstream_project:'bound-project',configured:true,dispatch_available:false};
  const client = new NiuAdminClient({adminToken:'test',fetch:async(url,init)=>{
    calls.push({url,init});
    if (calls.length===3) return Response.json({error:{message:'Conflict'}},{status:409});
    return Response.json({data:metadata});
  }});
  const input = {expected_revision:0,upstream_project:'bound-project',access_key:'AKEXAMPLE',secret_key:'fixture-management-secret'};
  assert.deepEqual(await client.getAssetManagementConfiguration(id,{signal:controller.signal}),{data:metadata});
  assert.equal(calls[0].init.method,'GET');
  assert.equal(calls[0].init.body,undefined);
  assert.deepEqual(await client.configureAssetManagement(id,{...input,ignored:'not-sent'},{signal:controller.signal}),{data:metadata});
  assert.deepEqual(JSON.parse(calls[1].init.body),input);
  assert.equal(calls[1].init.method,'PUT');
  assert.equal(calls[1].init.signal,controller.signal);
  assert.ok(calls[1].url.endsWith(`/vendors/${id}/asset-management`));
  await assert.rejects(client.configureAssetManagement(id,input),error=>error instanceof NiuAPIError && error.status===409);
  assert.equal(calls.length,3);
  for(const revision of [-1,1.5,null,Number.MAX_SAFE_INTEGER]) assert.throws(()=>client.configureAssetManagement(id,{...input,expected_revision:revision}),/nonnegative safe integer/);
  for(const project of ['', ' padded ', 'bad\nproject']) assert.throws(()=>client.configureAssetManagement(id,{...input,upstream_project:project}),/Invalid upstream project/);
  assert.throws(()=>client.configureAssetManagement(id,{...input,secret_key:''}),/Invalid asset management credentials/);
  assert.throws(()=>client.getAssetManagementConfiguration('../other'),/UUID/);
  assert.equal(calls.length,3);
});

test('asset management revocation requires explicit erasure confirmation and never retries', async () => {
  const calls=[];
  const abort=new AbortController();
  const result={data:{revision:2,configured:false,dispatch_available:false,erased_revisions:2}};
  const client=new NiuAdminClient({adminToken:'test',fetch:async(url,init)=>{
    calls.push({url,init});
    return calls.length===1 ? Response.json(result) : Response.json({error:{message:'Conflict'}},{status:409});
  }});
  const input={expected_revision:2,erase_history:true,confirm_erase:true};
  assert.deepEqual(await client.revokeAssetManagement(id,input,{signal:abort.signal}),result);
  assert.equal(calls[0].init.method,'DELETE');
  assert.equal(calls[0].init.signal,abort.signal);
  assert.deepEqual(JSON.parse(calls[0].init.body),input);
  await assert.rejects(client.revokeAssetManagement(id,input),error=>error instanceof NiuAPIError && error.status===409);
  assert.equal(calls.length,2);
  assert.throws(()=>client.revokeAssetManagement(id,{expected_revision:2,erase_history:true}),/Explicit confirmation/);
  assert.throws(()=>client.revokeAssetManagement(id,{expected_revision:2,erase_history:'yes',confirm_erase:true}),/booleans/);
  assert.throws(()=>client.revokeAssetManagement(id,{expected_revision:0}),/positive safe integer/);
  assert.throws(()=>client.revokeAssetManagement('../other',{expected_revision:2}),/UUID/);
  assert.equal(calls.length,2);
});

test('asset request deletion is scoped bodyless cancellable and does not retry',async()=>{
  const calls=[];
  const controller=new AbortController();
  const client=new NiuAdminClient({adminToken:'test',fetch:async(url,init)=>{
    calls.push({url,init});
    return calls.length===1 ? new Response(null,{status:204}) : Response.json({error:{message:'Forbidden'}},{status:403});
  }});
  await client.deleteAssetGroupRequest(scope,id,{signal:controller.signal});
  assert.ok(calls[0].url.endsWith(`/organizations/${id}/projects/${id}/asset-group-intents/${id}/request`));
  assert.equal(calls[0].init.method,'DELETE');
  assert.equal(calls[0].init.body,undefined);
  assert.equal(calls[0].init.signal,controller.signal);
  await assert.rejects(client.deleteAssetGroupRequest(scope,id),error=>error instanceof NiuAPIError && error.status===403);
  assert.equal(calls.length,2);
  assert.throws(()=>client.deleteAssetGroupRequest(scope,'../other'),/UUID/);
  assert.throws(()=>client.deleteAssetGroupRequest({...scope,projectId:'invalid'},id),/UUID/);
  assert.equal(calls.length,2);
});

test('asset request reads are scoped cancellable and do not expose management fields',async()=>{
  const calls=[];const controller=new AbortController();
  const result={data:{status:'prepared',created_at:'2026-10-07T00:00:00Z',request_content_status:'retained',request:{name:'Character',description:null}}};
  const client=new NiuAdminClient({adminToken:'test',fetch:async(url,init)=>{calls.push({url,init});return Response.json(result);}});
  assert.deepEqual(await client.getAssetGroupRequest(scope,id,{signal:controller.signal}),result);
  assert.ok(calls[0].url.endsWith(`/organizations/${id}/projects/${id}/asset-group-intents/${id}/request`));
  assert.equal(calls[0].init.method,'GET');assert.equal(calls[0].init.body,undefined);assert.equal(calls[0].init.signal,controller.signal);
  assert.throws(()=>client.getAssetGroupRequest(scope,'invalid'),/UUID/);assert.equal(calls.length,1);
});

test('asset request discovery validates bounded cursors before sending and preserves cancellation',async()=>{
  const calls=[];const controller=new AbortController();
  const result={data:[{id,name:null,status:'uncertain',created_at:'2026-10-07T00:00:00Z',request_content_status:'expired'}],next_cursor:id};
  const client=new NiuAdminClient({adminToken:'test',fetch:async(url,init)=>{calls.push({url,init});return Response.json(result);}});
  assert.deepEqual(await client.listAssetGroupRequests(scope,{after:id,limit:1},{signal:controller.signal}),result);
  const url=new URL(calls[0].url);
  assert.ok(url.pathname.endsWith(`/organizations/${id}/projects/${id}/asset-group-intents`));
  assert.equal(url.searchParams.get('after'),id);assert.equal(url.searchParams.get('limit'),'1');
  assert.equal(calls[0].init.method,'GET');assert.equal(calls[0].init.signal,controller.signal);
  for(const limit of [0,-1,101,1.5,NaN]) assert.throws(()=>client.listAssetGroupRequests(scope,{limit}),/limit/);
  assert.throws(()=>client.listAssetGroupRequests(scope,{after:'../foreign'}),/UUID/);
  assert.equal(calls.length,1);
});

test('asset qualification controls validate evidence, scope and expiry without implicit retries', async () => {
  const calls=[];
  const abort=new AbortController();
  const client=new NiuAdminClient({adminToken:'test',fetch:async(url,init)=>{
    calls.push({url,init});
    if(init.method==='DELETE') return new Response(null,{status:204});
    if(calls.length===4) return Response.json({error:{message:'Changed account'}},{status:409});
    return Response.json({data:{id,operation:'CreateAssetGroup',dispatch_available:false}});
  }});
  const input={organization_id:id,project_id:id,vendor_revision:1,credential_revision:2,rights_sha256:'11'.repeat(32),protocol_sha256:'22'.repeat(32),data_handling_sha256:'33'.repeat(32),free_operation_sha256:'44'.repeat(32),valid_for_seconds:3600};
  await client.createAssetOperationAuthorization(id,{...input,unexpected:'not sent'},{signal:abort.signal});
  assert.deepEqual(JSON.parse(calls[0].init.body),input);
  assert.equal(calls[0].init.signal,abort.signal);
  await client.listAssetOperationAuthorizations(id,{limit:1,after:id});
  assert.ok(calls[1].url.endsWith(`/asset-management/authorizations?after=${id}&limit=1`));
  await client.revokeAssetOperationAuthorization(id,id);
  assert.equal(calls[2].init.method,'DELETE');
  await assert.rejects(client.createAssetOperationAuthorization(id,input),/Changed account/);
  assert.equal(calls.length,4);
  for(const value of [0,-1,7_776_001,1.5,NaN]) assert.throws(()=>client.createAssetOperationAuthorization(id,{...input,valid_for_seconds:value}),/validity/);
  for(const hash of ['', '00'.repeat(32),'z'.repeat(64),'a'.repeat(63)]) assert.throws(()=>client.createAssetOperationAuthorization(id,{...input,free_operation_sha256:hash}),/SHA-256/);
  assert.throws(()=>client.createAssetOperationAuthorization(id,{...input,vendor_revision:0}),/revisions/);
  assert.throws(()=>client.createAssetOperationAuthorization(id,{...input,project_id:'foreign'}),/UUID/);
  assert.throws(()=>client.listAssetOperationAuthorizations(id,{limit:101}),/limit/);
  assert.throws(()=>client.revokeAssetOperationAuthorization(id,'foreign'),/UUID/);
  assert.equal(calls.length,4);
});

test('ordinary asset creation preserves one-shot identity, cancellation and Unicode limits', async () => {
  const calls=[];const abort=new AbortController();
  const client=new NiuAdminClient({adminToken:'test',fetch:async(url,init)=>{
    calls.push({url,init});
    return calls.length===2?Response.json({error:{message:'Qualification missing'}},{status:409}):Response.json({data:{id,status:'dispatching'}},{status:202});
  }});
  const input={organization_id:id,project_id:id,idempotency_key:id,vendor_revision:1,credential_revision:1,name:'牛'.repeat(64),description:'元'.repeat(300)};
  assert.deepEqual(await client.createOrdinaryAssetGroup(id,{...input,endpoint:'ignored'},{signal:abort.signal}),{data:{id,status:'dispatching'}});
  assert.deepEqual(JSON.parse(calls[0].init.body),input);
  assert.equal(calls[0].init.signal,abort.signal);
  assert.ok(calls[0].url.endsWith(`/vendors/${id}/asset-management/groups`));
  await assert.rejects(client.createOrdinaryAssetGroup(id,input),/Qualification missing/);
  for(const name of ['', '牛'.repeat(65),'bad\nname','bad\u0085name']) assert.throws(()=>client.createOrdinaryAssetGroup(id,{...input,name}),/name/);
  for(const description of ['元'.repeat(301),'bad\0description']) assert.throws(()=>client.createOrdinaryAssetGroup(id,{...input,description}),/description/);
  assert.throws(()=>client.createOrdinaryAssetGroup(id,{...input,credential_revision:0}),/revisions/);
  assert.throws(()=>client.createOrdinaryAssetGroup(id,{...input,idempotency_key:'invalid'}),/UUID/);
  assert.equal(calls.length,2);
});

test('asset read qualification is explicit and rejects unknown operations before sending', async () => {
  const calls=[];
  const abort=new AbortController();
  const client=new NiuAdminClient({adminToken:'test',fetch:async(url,init)=>{
    calls.push({url,init});
    return Response.json({data:{id,operation:'GetAssetGroup',dispatch_available:false}});
  }});
  const input={organization_id:id,project_id:id,vendor_revision:1,credential_revision:1,rights_sha256:'11'.repeat(32),protocol_sha256:'22'.repeat(32),data_handling_sha256:'33'.repeat(32),free_operation_sha256:'44'.repeat(32),valid_for_seconds:60,operation:'GetAssetGroup'};
  const result=await client.createAssetOperationAuthorization(id,input,{signal:abort.signal});
  assert.deepEqual(JSON.parse(calls[0].init.body),input);
  assert.equal(calls[0].init.signal,abort.signal);
  assert.equal(result.data.operation,'GetAssetGroup');
  for(const operation of ['CreateUnreviewedAsset','DeleteEverything','',null,7]) {
    assert.throws(()=>client.createAssetOperationAuthorization(id,{...input,operation}),/operation/);
  }
  assert.equal(calls.length,1);
});

test('ordinary group read sends saved identity only and never retries on uncertainty', async () => {
  const calls=[];const abort=new AbortController();
  const client=new NiuAdminClient({adminToken:'test',fetch:async(url,init)=>{
    calls.push({url,init});
    return calls.length===1?Response.json({data:{read_id:id,name:'Character',description:null,created_at:'2026-10-08T00:00:00Z',updated_at:'2026-10-08T00:00:01Z'}}):Response.json({error:{message:'Read already claimed'}},{status:409});
  }});
  const input={organization_id:id,project_id:id,intent_id:id,read_id:id};
  assert.equal((await client.readOrdinaryAssetGroup(id,{...input,upstream_id:'not sent'},{signal:abort.signal})).data.name,'Character');
  assert.deepEqual(JSON.parse(calls[0].init.body),input);
  assert.equal(calls[0].init.signal,abort.signal);
  assert.ok(calls[0].url.endsWith(`/vendors/${id}/asset-management/group-reads`));
  await assert.rejects(client.readOrdinaryAssetGroup(id,input),/Read already claimed/);
  for(const field of Object.keys(input)) assert.throws(()=>client.readOrdinaryAssetGroup(id,{...input,[field]:'invalid'}),/UUID/);
  assert.equal(calls.length,2);
});

test('saved ordinary group reads recover or erase scoped results without upstream retries', async () => {
  const calls=[];const abort=new AbortController();
  const client=new NiuAdminClient({adminToken:'test',fetch:async(url,init)=>{
    calls.push({url,init});
    if(init.method==='DELETE') return new Response(null,{status:204});
    if(calls.length===3) return Response.json({error:{message:'Result unavailable'}},{status:404});
    return Response.json({data:{read_id:id,name:'Saved character',description:null,created_at:'2026-10-08T00:00:00Z',updated_at:'2026-10-08T00:00:01Z'}});
  }});
  const scope={organizationId:id,projectId:id};
  assert.equal((await client.getOrdinaryAssetGroupRead(id,id,scope,{signal:abort.signal})).data.name,'Saved character');
  assert.equal(calls[0].init.method,'GET');
  assert.equal(calls[0].init.signal,abort.signal);
  assert.ok(calls[0].url.endsWith(`/group-reads/${id}?organization_id=${id}&project_id=${id}`));
  await client.deleteOrdinaryAssetGroupRead(id,id,scope);
  assert.equal(calls[1].init.method,'DELETE');
  await assert.rejects(client.getOrdinaryAssetGroupRead(id,id,scope),/Result unavailable/);
  assert.throws(()=>client.getOrdinaryAssetGroupRead(id,'invalid',scope),/UUID/);
  assert.equal(calls.length,3);
});

test('ordinary group read history preserves scope, cursor and cancellation without dispatch', async () => {
  const calls=[];const abort=new AbortController();
  const client=new NiuAdminClient({adminToken:'test',fetch:async(url,init)=>{
    calls.push({url,init});return Response.json({data:[{read_id:id,status:'unresolved',started_at:'2026-10-08T00:00:00Z',completed_at:null,duration_ms:null,reason:null}],next_cursor:null});
  }});
  const scope={organizationId:id,projectId:id};
  const result=await client.listOrdinaryAssetGroupReads(id,scope,{after:id,limit:1},{signal:abort.signal});
  assert.equal(result.data[0].status,'unresolved');
  assert.equal(result.data[0].duration_ms,null);
  assert.equal(calls[0].init.method,'GET');assert.equal(calls[0].init.signal,abort.signal);
  assert.ok(calls[0].url.endsWith(`/group-reads?organization_id=${id}&project_id=${id}&after=${id}&limit=1`));
  for(const limit of [0,101,NaN,1.5]) assert.throws(()=>client.listOrdinaryAssetGroupReads(id,scope,{limit}),/limit/);
  assert.throws(()=>client.listOrdinaryAssetGroupReads(id,scope,{after:'invalid'}),/UUID/);
  assert.equal(calls.length,1);
});


test('asset listing qualification sends a separate exact operation with cancellation', async () => {
  const calls=[]; const abort=new AbortController();
  const client=new NiuAdminClient({adminToken:'test',fetch:async(url,init)=>{
    calls.push({url,init}); return Response.json({data:{id,operation:'ListAssets',dispatch_available:false}});
  }});
  const input={organization_id:id,project_id:id,vendor_revision:1,credential_revision:1,rights_sha256:'11'.repeat(32),protocol_sha256:'22'.repeat(32),data_handling_sha256:'33'.repeat(32),free_operation_sha256:'44'.repeat(32),valid_for_seconds:60,operation:'ListAssets'};
  assert.equal((await client.createAssetOperationAuthorization(id,input,{signal:abort.signal})).data.operation,'ListAssets');
  assert.deepEqual(JSON.parse(calls[0].init.body),input);
  assert.equal(calls[0].init.signal,abort.signal);
  assert.equal(calls.length,1);
});

test('asset lookup qualification sends a separate exact operation with cancellation', async () => {
  const calls=[]; const abort=new AbortController();
  const client=new NiuAdminClient({adminToken:'test',fetch:async(url,init)=>{
    calls.push({url,init}); return Response.json({data:{id,operation:'GetAsset',dispatch_available:false}});
  }});
  const input={organization_id:id,project_id:id,vendor_revision:1,credential_revision:1,rights_sha256:'11'.repeat(32),protocol_sha256:'22'.repeat(32),data_handling_sha256:'33'.repeat(32),free_operation_sha256:'44'.repeat(32),valid_for_seconds:60,operation:'GetAsset'};
  assert.equal((await client.createAssetOperationAuthorization(id,input,{signal:abort.signal})).data.operation,'GetAsset');
  assert.deepEqual(JSON.parse(calls[0].init.body),input);
  assert.equal(calls[0].init.signal,abort.signal);
  assert.equal(calls.length,1);
});


test('ordinary asset listing is scoped, bounded, cancellable and never automatically retried', async () => {
  const calls=[]; const abort=new AbortController();
  const client=new NiuAdminClient({adminToken:'test',fetch:async(url,init)=>{
    calls.push({url,init});return calls.length===1?Response.json({data:{listing_id:id,items:[],has_more:false}}):Response.json({error:{message:'Already claimed'}},{status:409});
  }});
  const input={organization_id:id,project_id:id,intent_id:id,listing_id:id,maximum_items:2};
  assert.equal((await client.listOrdinaryAssets(id,{...input,NextToken:'not forwarded'},{signal:abort.signal})).data.has_more,false);
  assert.deepEqual(JSON.parse(calls[0].init.body),input);assert.equal(calls[0].init.signal,abort.signal);
  await assert.rejects(client.listOrdinaryAssets(id,input),/Already claimed/);assert.equal(calls.length,2);
  for(const maximum_items of [0,101,1.5,NaN,'2']) assert.throws(()=>client.listOrdinaryAssets(id,{...input,maximum_items}),/size/);
  assert.throws(()=>client.listOrdinaryAssets(id,{...input,listing_id:'invalid'}),/UUID/);
  assert.equal(calls.length,2);
});

test('ordinary asset listing recovery and erasure stay local and retain cancellation', async () => {
  const calls=[];const abort=new AbortController();
  const client=new NiuAdminClient({adminToken:'test',fetch:async(url,init)=>{
    calls.push({url,init});return init.method==='DELETE'?new Response(null,{status:204}):Response.json({data:{listing_id:id,items:[],has_more:false}});
  }});
  const scope={organizationId:id,projectId:id};
  await client.getOrdinaryAssetListing(id,id,scope,{signal:abort.signal});
  await client.deleteOrdinaryAssetListing(id,id,scope,{signal:abort.signal});
  for(const call of calls) {assert.ok(call.url.includes(`/listings/${id}?organization_id=${id}&project_id=${id}`));assert.equal(call.init.signal,abort.signal);assert.equal(call.init.body,undefined);}
  assert.equal(calls[0].init.method,'GET');assert.equal(calls[1].init.method,'DELETE');
});


test('asset continuation sends a validated retained parent identity instead of a cursor',async()=>{
  const calls=[];const client=new NiuAdminClient({adminToken:'test',fetch:async(url,init)=>{calls.push(JSON.parse(init.body));return Response.json({data:{listing_id:id,items:[],has_more:false}});}});
  const input={organization_id:id,project_id:id,intent_id:id,listing_id:id,maximum_items:2,previous_listing_id:id};
  await client.listOrdinaryAssets(id,{...input,NextToken:'never sent'});assert.deepEqual(calls,[input]);
  assert.throws(()=>client.listOrdinaryAssets(id,{...input,previous_listing_id:'invalid'}),/UUID/);assert.equal(calls.length,1);
});


test('listing audit history is a scoped cancellable GET without page content dispatch', async()=>{
  const calls=[];const abort=new AbortController();
  const client=new NiuAdminClient({adminToken:'test',fetch:async(url,init)=>{calls.push({url,init});return Response.json({data:[],next_cursor:null});}});
  await client.listOrdinaryAssetListings(id,{organizationId:id,projectId:id},{after:id,limit:100},{signal:abort.signal});
  assert.equal(calls.length,1);assert.equal(calls[0].init.method,'GET');assert.equal(calls[0].init.body,undefined);assert.equal(calls[0].init.signal,abort.signal);
  assert.ok(calls[0].url.includes(`/listings?organization_id=${id}&project_id=${id}&after=${id}&limit=100`));
  for(const limit of [0,101,1.5,NaN]) assert.throws(()=>client.listOrdinaryAssetListings(id,{organizationId:id,projectId:id},{limit}),/limit/);
  assert.throws(()=>client.listOrdinaryAssetListings(id,{organizationId:id,projectId:id},{after:'invalid'}),/UUID/);
  assert.throws(()=>client.listOrdinaryAssetListings('invalid',{organizationId:id,projectId:id}),/UUID/);
  assert.equal(calls.length,1);
});


test('ordinary asset lookup is scoped, cancellable, bounded and not retried',async()=>{
  const calls=[];const abort=new AbortController();
  const client=new NiuAdminClient({adminToken:'test',fetch:async(url,init)=>{calls.push({url,init});return calls.length===1?Response.json({data:{lookup_id:id,status:'succeeded',asset_status:'Failed'}}):Response.json({error:{message:'Already claimed'}},{status:409});}});
  const input={organization_id:id,project_id:id,listing_id:id,lookup_id:id,item_index:0};
  assert.equal((await client.lookupOrdinaryAsset(id,{...input,upstream_id:'never forwarded'},{signal:abort.signal})).data.asset_status,'Failed');
  assert.deepEqual(JSON.parse(calls[0].init.body),input);assert.equal(calls[0].init.signal,abort.signal);
  assert.ok(calls[0].url.endsWith(`/vendors/${id}/asset-management/lookups`));
  await assert.rejects(client.lookupOrdinaryAsset(id,input),/Already claimed/);assert.equal(calls.length,2);
  for(const item_index of [-1,100,NaN,1.5,'0'])assert.throws(()=>client.lookupOrdinaryAsset(id,{...input,item_index}),/index/);
  assert.throws(()=>client.lookupOrdinaryAsset(id,{...input,listing_id:'invalid'}),/UUID/);assert.equal(calls.length,2);
});

test('ordinary asset lookup audit history is scoped, bounded and cancellable',async()=>{
  const calls=[];const abort=new AbortController();
  const client=new NiuAdminClient({adminToken:'test',fetch:async(url,init)=>{calls.push({url,init});return Response.json({data:[],next_cursor:null});}});
  await client.listOrdinaryAssetLookups(id,scope,{after:id,limit:1},{signal:abort.signal});
  assert.equal(calls[0].init.method,'GET');assert.equal(calls[0].init.signal,abort.signal);assert.equal(calls[0].init.body,undefined);
  assert.ok(calls[0].url.endsWith(`/lookups?organization_id=${id}&project_id=${id}&after=${id}&limit=1`));
  for(const limit of [0,101,NaN,1.5])assert.throws(()=>client.listOrdinaryAssetLookups(id,scope,{limit}),/limit/);
  assert.throws(()=>client.listOrdinaryAssetLookups(id,scope,{after:'invalid'}),/UUID/);assert.equal(calls.length,1);
});


test('saved asset lookup result recovery and erasure are scoped and cancellable',async()=>{
  const calls=[];const abort=new AbortController();
  const client=new NiuAdminClient({adminToken:'test',fetch:async(url,init)=>{calls.push({url,init});return init.method==='DELETE'?new Response(null,{status:204}):Response.json({data:{lookup_id:id,asset:{name:'Character',status:'Processing',asset_type:'Image',created_at:'2026-10-08T00:00:00Z',updated_at:'2026-10-08T00:00:01Z',last_inference_at:null}}});}});
  assert.equal((await client.getOrdinaryAssetLookupResult(id,scope,id,{signal:abort.signal})).data.asset.name,'Character');
  await client.deleteOrdinaryAssetLookupResult(id,scope,id,{signal:abort.signal});
  for(const call of calls){assert.ok(call.url.endsWith(`/lookups/${id}?organization_id=${id}&project_id=${id}`));assert.equal(call.init.signal,abort.signal);assert.equal(call.init.body,undefined);}
  assert.equal(calls[0].init.method,'GET');assert.equal(calls[1].init.method,'DELETE');
  assert.throws(()=>client.getOrdinaryAssetLookupResult(id,scope,'invalid'),/UUID/);
  assert.throws(()=>client.deleteOrdinaryAssetLookupResult(id,{...scope,projectId:'invalid'},id),/UUID/);assert.equal(calls.length,2);
});


test('metadata update, deletion and media ingestion qualification bind separate operations without dispatch', async () => {
  const calls=[]; const abort=new AbortController();
  const client=new NiuAdminClient({adminToken:'test',fetch:async(url,init)=>{
    calls.push({url,init}); const input=JSON.parse(init.body);
    return Response.json({data:{id,operation:input.operation,dispatch_available:false}});
  }});
  for (const operation of ['UpdateAssetGroup','DeleteAssetGroup','CreateAsset']) {
    const input={organization_id:id,project_id:id,vendor_revision:1,credential_revision:1,rights_sha256:'11'.repeat(32),protocol_sha256:'22'.repeat(32),data_handling_sha256:'33'.repeat(32),free_operation_sha256:'44'.repeat(32),valid_for_seconds:60,operation};
    const result=await client.createAssetOperationAuthorization(id,input,{signal:abort.signal});
    assert.equal(result.data.operation,operation); assert.equal(result.data.dispatch_available,false);
    assert.deepEqual(JSON.parse(calls.at(-1).init.body),input);
    assert.equal(calls.at(-1).init.signal,abort.signal);
  }
  assert.equal(calls.length,3);
});


test('ordinary metadata preparation preserves identity, omission, clear and cancellation without dispatch or retries', async () => {
  const calls=[];const abort=new AbortController();
  const result={data:{update_id:id,prepared:true,dispatch_available:false}};
  const client=new NiuAdminClient({adminToken:'test',fetch:async(url,init)=>{
    calls.push({url,init});
    if(calls.length===4) return Response.json({error:{message:'Changed patch conflicts'}},{status:409});
    return Response.json(result,{status:calls.length===1?201:200});
  }});
  const input={organization_id:id,project_id:id,intent_id:id,update_id:id,name:'元'.repeat(64)};
  assert.deepEqual(await client.prepareOrdinaryAssetGroupUpdate(id,{...input,upstream_group_id:'ignored'},{signal:abort.signal}),result);
  assert.ok(calls[0].url.endsWith(`/vendors/${id}/asset-management/group-updates`));
  assert.equal(calls[0].init.method,'POST');
  assert.equal(calls[0].init.signal,abort.signal);
  assert.deepEqual(JSON.parse(calls[0].init.body),input);
  const clear={organization_id:id,project_id:id,intent_id:id,update_id:id,description:''};
  await client.prepareOrdinaryAssetGroupUpdate(id,clear);
  assert.deepEqual(JSON.parse(calls[1].init.body),clear);
  await client.prepareOrdinaryAssetGroupUpdate(id,{...input,description:'line\nline\ttext'});
  assert.equal(JSON.parse(calls[2].init.body).description,'line\nline\ttext');
  await assert.rejects(client.prepareOrdinaryAssetGroupUpdate(id,{...input,name:'Changed'}),/Changed patch conflicts/);
  assert.equal(calls.length,4);
});

test('ordinary metadata preparation rejects invalid patches and references before network I/O', () => {
  let sent=0;
  const client=new NiuAdminClient({adminToken:'test',fetch:async()=>{sent++;return Response.json({});}});
  const input={organization_id:id,project_id:id,intent_id:id,update_id:id,name:'Valid'};
  for(const name of [null,42,'',' ','元'.repeat(65),'bad\nname','bad\u0085name']) assert.throws(()=>client.prepareOrdinaryAssetGroupUpdate(id,{...input,name}),/name/);
  for(const description of [null,42,'元'.repeat(301),'bad\0description']) assert.throws(()=>client.prepareOrdinaryAssetGroupUpdate(id,{...input,description}),/description/);
  assert.throws(()=>client.prepareOrdinaryAssetGroupUpdate(id,{...input,name:undefined}),/patch/);
  for(const field of ['organization_id','project_id','intent_id','update_id']) assert.throws(()=>client.prepareOrdinaryAssetGroupUpdate(id,{...input,[field]:'invalid'}),/UUID/);
  assert.throws(()=>client.prepareOrdinaryAssetGroupUpdate('invalid',input),/UUID/);
  assert.equal(sent,0);
});


test('explicit metadata dispatch preserves uncertainty, scope and abort without retry', async () => {
  const calls=[];const abort=new AbortController();
  const client=new NiuAdminClient({adminToken:'test',fetch:async(url,init)=>{
    calls.push({url,init});
    if(calls.length===3) return Response.json({error:{message:'Already claimed'}},{status:409});
    return Response.json({data:{update_id:id,status:calls.length===1?'acknowledged':'uncertain',reconciliation_required:true}});
  }});
  const scope={organizationId:id,projectId:id};
  assert.equal((await client.dispatchOrdinaryAssetGroupUpdate(id,id,scope,{signal:abort.signal})).data.status,'acknowledged');
  assert.ok(calls[0].url.endsWith(`/vendors/${id}/asset-management/group-updates/${id}/dispatch`));
  assert.equal(calls[0].init.method,'POST');
  assert.equal(calls[0].init.signal,abort.signal);
  assert.deepEqual(JSON.parse(calls[0].init.body),{organization_id:id,project_id:id});
  const uncertain=await client.dispatchOrdinaryAssetGroupUpdate(id,id,scope);
  assert.equal(uncertain.data.status,'uncertain');
  assert.equal(uncertain.data.reconciliation_required,true);
  await assert.rejects(client.dispatchOrdinaryAssetGroupUpdate(id,id,scope),/Already claimed/);
  assert.equal(calls.length,3);
  assert.throws(()=>client.dispatchOrdinaryAssetGroupUpdate('invalid',id,scope),/UUID/);
  assert.throws(()=>client.dispatchOrdinaryAssetGroupUpdate(id,'invalid',scope),/UUID/);
  assert.throws(()=>client.dispatchOrdinaryAssetGroupUpdate(id,id,{...scope,projectId:'invalid'}),/UUID/);
  assert.throws(()=>client.dispatchOrdinaryAssetGroupUpdate(id,id,{...scope,organizationId:'invalid'}),/UUID/);
  assert.equal(calls.length,3);
});


test('metadata reconciliation uses a fresh scoped read, forwards abort and never retries mismatch', async () => {
  const calls=[];const abort=new AbortController();
  const client=new NiuAdminClient({adminToken:'test',fetch:async(url,init)=>{
    calls.push({url,init});
    return calls.length===1?Response.json({data:{update_id:id,status:'reconciled',reconciliation_required:false}}):Response.json({error:{message:'Metadata mismatch'}},{status:400});
  }});
  const scope={organizationId:id,projectId:id};
  const result=await client.reconcileOrdinaryAssetGroupUpdate(id,id,id,scope,{signal:abort.signal});
  assert.equal(result.data.status,'reconciled');assert.equal(result.data.reconciliation_required,false);
  assert.ok(calls[0].url.endsWith(`/vendors/${id}/asset-management/group-updates/${id}/reconcile`));
  assert.equal(calls[0].init.method,'POST');assert.equal(calls[0].init.signal,abort.signal);
  assert.deepEqual(JSON.parse(calls[0].init.body),{organization_id:id,project_id:id,read_id:id});
  await assert.rejects(client.reconcileOrdinaryAssetGroupUpdate(id,id,id,scope),/Metadata mismatch/);
  for(const args of [['invalid',id,id,scope],[id,'invalid',id,scope],[id,id,'invalid',scope],[id,id,id,{...scope,projectId:'invalid'}],[id,id,id,{...scope,organizationId:'invalid'}]]) assert.throws(()=>client.reconcileOrdinaryAssetGroupUpdate(...args),/UUID/);
  assert.equal(calls.length,2);
});


test('update audit and erasure preserve scoped cursors, cancellation and safe statuses', async () => {
  const calls=[];const abort=new AbortController();
  const client=new NiuAdminClient({adminToken:'test',fetch:async(url,init)=>{
    calls.push({url,init});
    return init.method==='DELETE'?new Response(null,{status:204}):Response.json({data:[{update_id:id,status:'reconciled',patch_status:'erased',reconciliation_required:false}],next_cursor:id});
  }});
  const scope={organizationId:id,projectId:id};
  const result=await client.listOrdinaryAssetGroupUpdates(id,scope,{after:id,limit:1},{signal:abort.signal});
  assert.equal(result.data[0].status,'reconciled');assert.equal(result.data[0].patch_status,'erased');
  const url=new URL(calls[0].url);assert.equal(url.searchParams.get('after'),id);assert.equal(url.searchParams.get('limit'),'1');assert.equal(url.searchParams.get('project_id'),id);assert.equal(calls[0].init.signal,abort.signal);
  await client.deleteOrdinaryAssetGroupUpdatePatch(id,id,scope,{signal:abort.signal});
  assert.equal(calls[1].init.method,'DELETE');assert.equal(calls[1].init.signal,abort.signal);
  assert.ok(calls[1].url.includes(`/group-updates/${id}?`));
  for(const limit of [0,101,1.5,NaN]) assert.throws(()=>client.listOrdinaryAssetGroupUpdates(id,scope,{limit}),/limit/);
  assert.throws(()=>client.listOrdinaryAssetGroupUpdates(id,scope,{after:'invalid'}),/UUID/);
  assert.throws(()=>client.deleteOrdinaryAssetGroupUpdatePatch(id,'invalid',scope),/UUID/);
  assert.equal(calls.length,2);
});
