import test from 'node:test';
import assert from 'node:assert/strict';
import { NiuAdminClient, NiuAPIError } from '../dist/index.js';
const id = '11111111-1111-4111-8111-111111111111';
const scope = { organizationId: id, projectId: id };
const chatCursor = id + ':' + 'a'.repeat(64);
const collect = async iterator => { const items = []; for await (const item of iterator) items.push(item); return items; };
const cases = [
  ['workspaces','next_cursor','after',id,c=>c.iterateWorkspaces({limit:5})],
  ['keys','next_cursor','after',id,c=>c.iterateWorkspaceKeys(id,{limit:5})],
  ['chat','next_cursor','after',chatCursor,c=>c.iterateChatSessions(scope,{limit:5,archived:true})],
  ['pools','next_after','after','provider/model',c=>c.iterateModelRoutePools({limit:5})],
  ['video sessions','next_before','before',id,c=>c.generations(scope).sessions.iterate({limit:5,archived:true})],
  ['chat inventory','next_before','before',id,c=>c.generations(scope).sessions.iterateChat({limit:5,archived:true})],
];
for (const [name,field,parameter,cursor,iterate] of cases) {
  test(`${name}: empty pages continue, cursor/filter are preserved, and exhaustion ends without another fetch`,async()=>{
    const calls=[];
    const client=new NiuAdminClient({adminToken:'fixture',fetch:async(url,init)=>{
      calls.push(new URL(url));
      assert.equal(init.method,'GET');
      return Response.json({data:calls.length===1?[]:[{name:'last'}],[field]:calls.length===1?cursor:null,...(field==='next_cursor'?{}:{has_more:calls.length===1})});
    }});
    assert.deepEqual(await collect(iterate(client)),[{name:'last'}]);
    assert.equal(calls.length,2);
    assert.equal(calls[1].searchParams.get(parameter),cursor);
    assert.equal(calls[1].searchParams.get('limit'),'5');
    if (name.includes('chat') || name.includes('sessions')) assert.equal(calls[1].searchParams.get('archived'),'true');
    if (name==='chat inventory') assert.equal(calls[1].searchParams.get('category'),'chat');
  });
  test(`${name}: repeated or missing continuation fails instead of looping or silently truncating`,async()=>{
    for (const missing of [false,true]) {
      let calls=0;
      const client=new NiuAdminClient({adminToken:'fixture',fetch:async()=>{
        calls++;
        return Response.json({data:[],...(missing?{}:{[field]:cursor}),...(field==='next_cursor'?{}:{has_more:true})});
      }});
      await assert.rejects(collect(iterate(client)),missing?/explicit continuation/:/Repeated pagination cursor/);
      assert.equal(calls,missing?1:2);
    }
  });
}
test('stale Chat cursor propagates its 409 without silently restarting or returning duplicates',async()=>{
  let calls=0;
  const client=new NiuAdminClient({adminToken:'fixture',fetch:async()=>{
    calls++;
    return calls===1?Response.json({data:[{id}],next_cursor:chatCursor})
      :Response.json({error:{message:'Cursor changed'}},{status:409});
  }});
  const iterator=client.iterateChatSessions(scope);
  assert.deepEqual((await iterator.next()).value,{id});
  await assert.rejects(iterator.next(),e=>e instanceof NiuAPIError && e.status===409);
  assert.equal(calls,2);
});
test('iterator abort and early return prevent continuation fetches',async()=>{
  for (const abort of [true,false]) {
    let calls=0;
    const controller=new AbortController();
    const client=new NiuAdminClient({adminToken:'fixture',fetch:async()=>{
      calls++;return Response.json({data:[{id},{id:'second'}],next_cursor:id});
    }});
    const iterator=client.iterateWorkspaces({}, {signal:controller.signal});
    await iterator.next();
    if (abort) {
      controller.abort();
      await assert.rejects(iterator.next(),e=>e.name==='AbortError');
    } else await iterator.return();
    assert.equal(calls,1);
  }
});
test('has_more cannot contradict a null continuation',async()=>{
  const client=new NiuAdminClient({adminToken:'fixture',fetch:async()=>Response.json({data:[],has_more:true,next_after:null})});
  await assert.rejects(collect(client.iterateModelRoutePools()),/has_more disagrees/);
});
