import assert from 'node:assert/strict';
import test from 'node:test';
import { NiuClient } from '../dist/index.js';
const configuration={slug:'agent-events',name:'Agent events',endpoint:'https://receiver.example/events',event_types:['pool.changed'],enabled:true,revision:0};
test('event SDK preserves scoped routes, revisions and secret rotation intent without replay',async()=>{
 const calls=[];
 const client=new NiuClient({apiKey:'fixture',baseURL:'https://niu.example/v1',fetch:async(url,init)=>{calls.push({url,...init});return Response.json({data:configuration});}});
 await client.listEventSubscriptions();await client.getEventSubscription('agent-events');await client.setEventSubscription(configuration,true);await client.listWorkspaceEvents('12');await client.getEventSubscriptionHistory('agent-events',2);await client.getEventDeliveries('agent-events');await client.testEventSubscription('agent-events',1);
 assert.deepEqual(calls.map(call=>[new URL(call.url).pathname+new URL(call.url).search,call.method]),[
 ['/v1/events','GET'],['/v1/events/agent-events','GET'],['/v1/events/agent-events','PUT'],['/v1/events/log?after=12','GET'],['/v1/events/agent-events/history?before=2','GET'],['/v1/events/agent-events/deliveries','GET'],['/v1/events/agent-events/test','POST']]);
 assert.deepEqual(JSON.parse(calls[2].body),{configuration,rotate_secret:true});assert.deepEqual(JSON.parse(calls[6].body),{revision:1});
 let attempts=0;
 const conflict=new NiuClient({apiKey:'fixture',fetch:async()=>{attempts++;return Response.json({error:{message:'Revision conflict'}},{status:409});}});
 await assert.rejects(()=>conflict.setEventSubscription(configuration,true));assert.equal(attempts,1);
 assert.throws(()=>client.getEventSubscription('../admin'));
 assert.throws(()=>client.getEventSubscription('log'));
 assert.throws(()=>client.listWorkspaceEvents('-1'));
 assert.throws(()=>client.listWorkspaceEvents('9223372036854775808'));
 assert.throws(()=>client.testEventSubscription('agent-events',0));
 await assert.rejects(()=>client.setEventSubscription({...configuration,revision:-1}));
});
