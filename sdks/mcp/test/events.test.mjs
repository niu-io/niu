import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp,readFile,stat,rm,chmod,symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { callTool,toolDefinitions } from '../dist/index.js';
import { prepareSigningSecret } from '../bin/signing-secrets.mjs';
const configuration={slug:'agent-events',name:'Agent events',endpoint:'https://receiver.example/events',event_types:['pool.changed'],enabled:true,revision:0};
const secret='niu_whsec_'+'a'.repeat(43);
const response=data=>({ok:true,status:200,text:async()=>JSON.stringify(data)});
test('event configuration schema matches its handler contract',()=>{
 const contract=JSON.parse(readFileSync(new URL('../../../contracts/generated/handler-operations.json',import.meta.url),'utf8'));
 assert.deepEqual(toolDefinitions.find(tool=>tool.name==='set_event_subscription').inputSchema.properties.configuration,contract.components.schemas.EventSubscription);
});
test('event mutation prepares private storage before dispatch and never returns its secret',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'niu-event-secret-'));
 try {
  let prepared=false,requests=0;
  const client={baseURL:'https://niu.example/v1',apiKey:'fixture-key',prepareSigningSecret:async(...args)=>{const save=await prepareSigningSecret(...args,{NIU_EVENT_SECRET_DIR:directory});prepared=true;return save;},fetch:async(url,init)=>{assert(prepared);requests++;assert.equal(url,'https://niu.example/v1/events/agent-events');assert.equal(init.method,'PUT');return response({data:{...configuration,revision:1},signing_secret:secret});}};
  const result=await callTool(client,'set_event_subscription',{configuration});
  assert.equal(result.isError,undefined);assert(!JSON.stringify(result).includes(secret));assert(!JSON.stringify(result).includes('fixture-key'));
  const saved=JSON.parse(result.content[0].text);const file=saved.signing_secret_file;
  assert.equal((await stat(file)).mode&0o777,0o600);assert.equal(JSON.parse(await readFile(file,'utf8')).signing_secret,secret);assert.equal(requests,1);
  await chmod(file,0o644);
  assert.equal((await callTool(client,'set_event_subscription',{configuration})).isError,true);assert.equal(requests,1,'unsafe private storage must stop before remote mutation');
  const alias=join(directory,'alias');await symlink(directory,alias);
  await assert.rejects(()=>prepareSigningSecret(client.baseURL,client.apiKey,configuration.slug,{NIU_EVENT_SECRET_DIR:alias}));
 }finally{await rm(directory,{recursive:true,force:true});}
});
test('event secret persistence errors and missing host support never disclose a one-time key or replay',async()=>{
 let requests=0;
 const client={baseURL:'https://niu.example/v1',apiKey:'fixture',fetch:async()=>{requests++;return response({data:{...configuration,revision:1},signing_secret:secret});}};
 assert.equal((await callTool(client,'set_event_subscription',{configuration})).isError,true);assert.equal(requests,0);
 const failure={...client,prepareSigningSecret:async()=>async()=>{throw new Error(secret);}};
 const result=await callTool(failure,'set_event_subscription',{configuration});assert.equal(result.isError,true);assert(!JSON.stringify(result).includes(secret));assert.match(result.content[0].text,/mutation completed/);assert.equal(requests,1);
});
test('event read and test tools use only scoped routes and preserve cursor/revision bounds',async()=>{
 const calls=[];const client={baseURL:'https://niu.example/v1',apiKey:'fixture',fetch:async(url,init)=>{calls.push([url,init.method]);return response({data:[]});}};
 for(const [name,args,suffix,method]of[
 ['list_event_subscriptions',{},'/events','GET'],['get_event_subscription',{slug:'agent-events'},'/events/agent-events','GET'],['list_workspace_events',{after:'12'},'/events/log?after=12','GET'],['get_event_subscription_history',{slug:'agent-events',before:2},'/events/agent-events/history?before=2','GET'],['get_event_deliveries',{slug:'agent-events'},'/events/agent-events/deliveries','GET'],['test_event_subscription',{slug:'agent-events',revision:1},'/events/agent-events/test','POST'],
 ]){assert.equal((await callTool(client,name,args)).isError,undefined);assert.deepEqual(calls.at(-1),[`https://niu.example/v1${suffix}`,method]);}
 for(const [name,args]of[['get_event_subscription',{slug:'../admin'}],['get_event_subscription',{slug:'log'}],['list_workspace_events',{after:'-1'}],['test_event_subscription',{slug:'agent-events',revision:0}],['set_event_subscription',{configuration,admin:true}]])assert.equal((await callTool(client,name,args)).isError,true);
 assert.equal(calls.length,6);
});
