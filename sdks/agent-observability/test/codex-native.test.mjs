import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';
import { startCodexReceiver } from '../src/codex.mjs';
test('installed Codex exports native completion tokens through the filtered receiver', { skip: process.env.NIU_TEST_CODEX !== '1', timeout: 45000 }, async () => {
const directory = await mkdtemp('/tmp/niu-codex-native-');
const saved = [];
const receiver = await startCodexReceiver({source:'codex'}, {deliverRecord: async (_,value)=>saved.push(value)});
const provider = createServer(async (req,res)=>{
 for await (const chunk of req) {} // Do not retain agent request contents or headers.
 if(req.url.includes('/responses')) {
  res.writeHead(200,{'content-type':'text/event-stream'});
  const response={id:'resp_niu_selftest',object:'response',status:'completed',model:'gpt-test',output:[{id:'msg_selftest',type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:'OK',annotations:[]}]}],usage:{input_tokens:12,output_tokens:3,total_tokens:15,input_tokens_details:{cached_tokens:4},output_tokens_details:{reasoning_tokens:1}}};
  for (const [type,extra] of [['response.created',{response:{...response,status:'in_progress',output:[]}}],['response.output_item.added',{output_index:0,item:{...response.output[0],status:'in_progress',content:[]}}],['response.content_part.added',{item_id:'msg_selftest',output_index:0,content_index:0,part:{type:'output_text',text:'',annotations:[]}}],['response.output_text.delta',{item_id:'msg_selftest',output_index:0,content_index:0,delta:'OK'}],['response.output_item.done',{output_index:0,item:response.output[0]}],['response.completed',{response}]]) res.write(`event: ${type}\ndata: ${JSON.stringify({type,...extra})}\n\n`);
  res.end();
 } else {res.writeHead(200,{'content-type':'application/json'});res.end('{"data":[]}');}
});
await new Promise(resolve=>provider.listen(0,'127.0.0.1',resolve));
const child=spawn('codex',['exec','--ignore-user-config','--ignore-rules','--ephemeral','--skip-git-repo-check','-C',directory,'-s','read-only','-c','model="gpt-test"','-c','model_provider="niu_mock"','-c',`model_providers.niu_mock={name="Niu self-test",base_url="http://127.0.0.1:${provider.address().port}/v1",wire_api="responses",requires_openai_auth=false}`,'-c','otel.log_user_prompt=false','-c',`otel.exporter={otlp-http={endpoint="${receiver.endpoint}",protocol="json",headers={Authorization="Bearer ${receiver.secret}"}}}`,'Reply OK without using any tools.'],{stdio:['ignore','pipe','pipe']});
let output='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);
const timeout=setTimeout(()=>child.kill('SIGTERM'),30000);
const code=await new Promise(resolve=>child.on('exit',resolve));clearTimeout(timeout);
await receiver.close();await new Promise(resolve=>provider.close(resolve));
await rm(directory, {recursive:true,force:true});
assert.equal(code,0,'Native Codex mock-provider run must succeed');
const usage=saved.filter(value=>value.record.external_usage);
assert.equal(usage.length,1,'Timing-only completion must not duplicate usage');
assert.equal(usage[0].record.external_usage.input_tokens,'12');
assert.equal(usage[0].record.external_usage.output_tokens,'3');
assert.equal(usage[0].record.external_usage.cache_read_tokens,'4');
assert.match(usage[0].record.external_usage.agent_version,/^\d+\.\d+\.\d+/);
assert.equal(usage[0].record.spans[1].requested_model,'gpt-test');
assert.equal(usage[0].record.spans[1].reported_model,null);
assert.equal(usage[0].record.spans[1].started_at_ms,null);
assert.doesNotMatch(JSON.stringify(saved), /Reply OK|user.email|user.account_id|transcript|sandbox_policy/);
});
