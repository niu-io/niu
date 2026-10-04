import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';
import { connect, readConnection, enableCodex, disconnect } from '../src/connection.mjs';
import { join } from 'node:path';
test('installed Codex plugin emits hooks and native tokens across ordinary sessions', { skip: process.env.NIU_TEST_CODEX !== '1', timeout: 45000 }, async t => {
const directory = await mkdtemp('/tmp/niu-codex-native-');
const saved = [];
const ingestion = createServer(async (request, response) => {
 let body=''; for await (const chunk of request) body+=chunk;
 saved.push(JSON.parse(body)); response.writeHead(200,{'content-type':'application/json'});response.end(JSON.stringify({id:'receipt',created:true}));
});
await new Promise(resolve=>ingestion.listen(0,'127.0.0.1',resolve));
t.after(()=>{ingestion.closeAllConnections();return new Promise(resolve=>ingestion.close(resolve));});
const portProbe=createServer();await new Promise(resolve=>portProbe.listen(0,'127.0.0.1',resolve));
const port=portProbe.address().port;await new Promise(resolve=>portProbe.close(resolve));
const env={...process.env,NIU_COLLECTOR_HOME:join(directory,'collector'),NIU_COLLECTOR_CODEX_CONFIG_DIR:join(directory,'codex'),NIU_COLLECTOR_PORT:String(port),NIU_AGENT_TOKEN:'niu_agent_native_test',NIU_AGENT_ENDPOINT:`http://127.0.0.1:${ingestion.address().port}`,NIU_AGENT_SOURCE:'codex'};
await connect(env,{consent:true});
t.after(async()=>{await disconnect(env);await rm(directory,{recursive:true,force:true});});
await enableCodex(env,{consent:true});
const connection=await readConnection(env);
const endpoint=`http://127.0.0.1:${connection.port}/v1/logs`;
let calls=0;
const provider = createServer(async (req,res)=>{
 for await (const chunk of req) {} // Do not retain agent request contents or headers.
 if(req.url.includes('/responses')) {
  res.writeHead(200,{'content-type':'text/event-stream'});
  calls++;
  const response={id:'resp_niu_selftest',object:'response',status:'completed',model:'gpt-test',output:[{id:'msg_selftest',type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:'OK',annotations:[]}]}],usage:{input_tokens:12,output_tokens:3,total_tokens:15,input_tokens_details:{cached_tokens:4},output_tokens_details:{reasoning_tokens:1}}};
  if(calls===1)response.output=[{id:'fc_selftest',type:'function_call',call_id:'call_selftest',name:'exec_command',arguments:JSON.stringify({cmd:'printf collector-selftest'})}];
  for (const [type,extra] of [['response.created',{response:{...response,status:'in_progress',output:[]}}],['response.output_item.added',{output_index:0,item:{...response.output[0],status:'in_progress',content:[]}}],['response.output_item.done',{output_index:0,item:response.output[0]}],['response.completed',{response}]]) res.write(`event: ${type}\ndata: ${JSON.stringify({type,...extra})}\n\n`);
  res.end();
 } else {res.writeHead(200,{'content-type':'application/json'});res.end('{"data":[]}');}
});
await new Promise(resolve=>provider.listen(0,'127.0.0.1',resolve));
const child=spawn('codex',['exec','--ignore-user-config','--ignore-rules','--ephemeral','--skip-git-repo-check','-C',directory,'--dangerously-bypass-hook-trust','-s','read-only','-c','plugins.niu-collector@niu.enabled=true','-c','model="gpt-test"','-c','model_provider="niu_mock"','-c',`model_providers.niu_mock={name="Niu self-test",base_url="http://127.0.0.1:${provider.address().port}/v1",wire_api="responses",requires_openai_auth=false}`,'-c','otel.log_user_prompt=false','-c',`otel.exporter={otlp-http={endpoint="${endpoint}",protocol="json",headers={Authorization="Bearer ${connection.secret}"}}}`,'Reply OK without using any tools.'],{env,stdio:['ignore','pipe','pipe']});
let output='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);
const timeout=setTimeout(()=>child.kill('SIGKILL'),30000);
const code=await new Promise(resolve=>child.on('exit',resolve));clearTimeout(timeout);
const second=spawn('codex',child.spawnargs.slice(1),{env,stdio:'ignore'});
const secondTimeout=setTimeout(()=>second.kill('SIGKILL'),30000);
const secondCode=await new Promise(resolve=>second.once('exit',resolve));clearTimeout(secondTimeout);
assert.equal(secondCode,0);
provider.closeAllConnections();await new Promise(resolve=>provider.close(resolve));
assert.equal(code,0,'Native Codex mock-provider run must succeed');
const usage=saved.filter(value=>value.record.external_usage);
assert.ok(usage.length>=1);
assert.ok(saved.some(value=>value.name==='Codex tool: Bash' || value.name==='Codex tool: exec_command'), 'Plugin tool hook must execute');
assert.equal(saved.filter(value=>value.name==='Codex session').length,2,'Plugin must collect both ordinary sessions using one receiver');
assert.doesNotMatch(JSON.stringify(saved), /Reply OK|user.email|user.account_id|transcript|collector-selftest/);
});
