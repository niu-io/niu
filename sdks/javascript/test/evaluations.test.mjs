import assert from 'node:assert/strict';
import test from 'node:test';
import {NiuClient} from '../dist/index.js';
test('evaluation SDK scopes discovery and sends input binding outside the body',async()=>{
 const calls=[];const client=new NiuClient({apiKey:'fixture',baseURL:'https://niu.example/v1',fetch:async(url,init)=>{calls.push({url,...init});return Response.json({data:[]});}});
 await client.listEvaluations();await client.getEvaluation('notes',1);await client.listEvaluationAttempts('notes',1,'one');await client.listEvaluationRuns('notes');await client.getEvaluationRun('notes','baseline');await client.compareEvaluationRuns('notes','baseline','candidate');
 assert.deepEqual(calls.map(c=>new URL(c.url).pathname),['/v1/evaluations','/v1/evaluations/notes','/v1/evaluations/notes/attempts','/v1/evaluations/notes/runs','/v1/evaluations/notes/runs/baseline','/v1/evaluations/notes/compare']);
 await client.chat.completions({model:'fast',messages:[{role:'user',content:'sample'}]},{evaluation:'notes@1/one'});
 assert.equal(new Headers(calls.at(-1).headers).get('x-niu-evaluation'),'notes@1/one');
 assert.equal(JSON.parse(calls.at(-1).body).evaluation,undefined);
 assert.throws(()=>client.listEvaluationAttempts('notes',0,'one'));
 assert.throws(()=>client.getEvaluation('../admin'));
});
