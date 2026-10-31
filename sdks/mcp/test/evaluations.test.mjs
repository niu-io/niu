import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {callTool,toolDefinitions} from '../dist/index.js';
const response=data=>({ok:true,status:200,text:async()=>JSON.stringify(data)});
test('evaluation schemas match handlers and discovery does not invoke inference',async()=>{
 const contract=JSON.parse(readFileSync(new URL('../../../contracts/generated/handler-operations.json',import.meta.url),'utf8'));
 assert.deepEqual(toolDefinitions.find(t=>t.name==='set_evaluation').inputSchema.properties.configuration,contract.components.schemas.EvaluationDefinition);
 assert.deepEqual(toolDefinitions.find(t=>t.name==='record_evaluation_run').inputSchema.properties.submission,contract.components.schemas.EvaluationRunSubmission);
 const calls=[];const client={baseURL:'https://niu.example/v1',apiKey:'fixture',fetch:async(url,init)=>{calls.push([url,init.method]);return response({data:[]});}};
 for(const [name,args,path,method]of[
 ['list_evaluations',{},'/evaluations','GET'],['get_evaluation',{slug:'notes',revision:1},'/evaluations/notes?revision=1','GET'],['list_evaluation_attempts',{slug:'notes',revision:1,sample:'one'},'/evaluations/notes/attempts?sample=one&revision=1','GET'],['list_evaluation_runs',{slug:'notes'},'/evaluations/notes/runs','GET'],['get_evaluation_run',{slug:'notes',run:'baseline'},'/evaluations/notes/runs/baseline','GET'],['compare_evaluation_runs',{slug:'notes',left:'baseline',right:'candidate'},'/evaluations/notes/compare?left=baseline&right=candidate','GET'],['fingerprint_evaluation_request',{protocol:'chat',request:{messages:[]}},'/evaluations/fingerprint','POST'],
 ]){const result=await callTool(client,name,args);assert.equal(result.isError,undefined,JSON.stringify(result));assert.deepEqual(calls.at(-1),['https://niu.example/v1'+path,method]);}
 for(const args of [{slug:'../admin',revision:1,sample:'one'},{slug:'notes',sample:'one'},{slug:'notes',revision:1,sample:'one',after:'bad'}])assert.equal((await callTool(client,'list_evaluation_attempts',args)).isError,true);
 assert.equal(calls.length,7);
});
test('evaluation binding is a header, never provider request content',async()=>{
 const client={baseURL:'https://niu.example/v1',apiKey:'fixture',fetch:async(url,init)=>{assert.equal(init.headers['x-niu-evaluation'],'notes@1/one');assert.equal(JSON.parse(init.body).evaluation,undefined);return response({choices:[]});}};
 const result=await callTool(client,'create_chat_completion',{model:'fast',messages:[{role:'user',content:'sample'}],evaluation:'notes@1/one'});
 assert.equal(result.isError,undefined,JSON.stringify(result));
});
