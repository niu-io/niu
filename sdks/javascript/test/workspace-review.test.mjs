import assert from 'node:assert/strict';
import test from 'node:test';
import {NiuAdminClient} from '../dist/admin.js';
const workspace='11111111-1111-4111-8111-111111111111';
test('member review uses scoped API routes without an inference key',async()=>{
 const calls=[];const client=new NiuAdminClient({adminToken:'member-fixture',baseURL:'https://niu.example/api/v1',fetch:async(url,init)=>{calls.push({url,...init});return Response.json({data:[]});}});
 await client.listWorkspaceReviewPools(workspace);await client.getWorkspaceReviewPool(workspace,'assistant');await client.getWorkspaceReviewPoolHistory(workspace,'assistant',2);await client.getWorkspaceReviewPoolSelections(workspace,'assistant');await client.listWorkspaceReviewSubscriptions(workspace);await client.getWorkspaceReviewSubscription(workspace,'agent-events');await client.getWorkspaceReviewDeliveries(workspace,'agent-events');await client.listWorkspaceReviewEvaluations(workspace);await client.getWorkspaceReviewEvaluation(workspace,'notes',1);await client.listWorkspaceReviewEvaluationRuns(workspace,'notes');await client.getWorkspaceReviewEvaluationRun(workspace,'notes','baseline');await client.compareWorkspaceReviewEvaluationRuns(workspace,'notes','baseline','candidate');
 assert.equal(calls.length,12);
 for(const call of calls){assert.equal(call.method,'GET');assert(new URL(call.url).pathname.startsWith(`/api/v1/workspaces/${workspace}/`));assert.equal(new Headers(call.headers).get('authorization'),'Bearer member-fixture');assert.equal(call.body,undefined);}
 assert.throws(()=>client.getWorkspaceReviewPool(workspace,'../admin'));
 assert.throws(()=>client.getWorkspaceReviewPoolHistory(workspace,'assistant',0));
 assert.throws(()=>client.getWorkspaceReviewEvaluation(workspace,'notes',0));
 await client.setWorkspaceReviewPool(workspace,'assistant',{slug:'assistant',name:'Assistant',description:'',enabled:true,revision:0,default_action:'candidates',candidates:[{alias:'gpt-4.1-mini',priority:100,weight:1,enabled:true}],rules:[]});
 assert.equal(calls.at(-1).method,'PUT');
 assert.equal(new URL(calls.at(-1).url).pathname,`/api/v1/workspaces/${workspace}/routing/assistant`);
 assert.throws(()=>client.setWorkspaceReviewPool(workspace,'assistant',{slug:'other',name:'Assistant',description:'',enabled:true,revision:0,default_action:'candidates',candidates:[],rules:[]}));
});
