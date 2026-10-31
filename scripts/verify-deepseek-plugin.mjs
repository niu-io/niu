#!/usr/bin/env node
// Explicit opt-in native-host qualification. No model inference or publication.
import {mkdtemp, writeFile, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';

const dsh = process.env.DSH_BIN;
if (!dsh) throw new Error('Set DSH_BIN to the installed DeepSeek Harness 0.2.1-rc.5 executable.');
const root = fileURLToPath(new URL('../', import.meta.url));
const dir = await mkdtemp(join(tmpdir(), 'niu-dsh-check-'));
const bundle = join(dir, 'bundle');
const credential = join(dir, 'credential.json');
const proof = join(dir, 'proof.json');
const env = {...process.env, DSH_HOME: join(dir, 'host'), NIU_CREDENTIAL_FILE: credential};
async function run(command, args, options = {}) {
  const child = spawn(command, args, {cwd: root, env, ...options});
  let output = '';
  child.stdout?.on('data', bytes => output += bytes);
  child.stderr?.on('data', bytes => output += bytes);
  const code = await new Promise((resolve, reject) => {child.once('error', reject); child.once('exit', resolve);});
  assert.equal(code, 0, output);
  return output;
}
let host;
try {
  await run('python3', ['scripts/build-deepseek-plugin.py', '--output', bundle]);
  await run(resolve(dsh), ['plugin', '--profile', 'niu-check', 'add', bundle]);
  const probe = join(dir, 'probe.mjs');
  await writeFile(probe, `
import assert from 'node:assert/strict';
import {writeFile,rm} from 'node:fs/promises';
import {createServer} from 'node:http';
export const name='niu-qualification';
export const inject=['tools','skills'];
export async function apply(ctx) {
 const pause=()=>new Promise(resolve=>setTimeout(resolve,50));
 for(let i=0;i<200;i++) {
  const names=ctx.tools.schemas().map(t=>t.name);
  if(names.filter(n=>n.startsWith('mcp__niu__')).length===50 && names.filter(n=>n.startsWith('mcp__unrelated__')).length===50)break;
  await pause();
 }
 const before=ctx.tools.schemas().map(t=>t.name).sort();
 assert.equal(before.filter(n=>n.startsWith('mcp__niu__')).length,50);
 assert.equal(before.filter(n=>n.startsWith('mcp__unrelated__')).length,50);
 assert.deepEqual((await ctx.skills.list()).filter(s=>s.provider==='niu-bundled').map(s=>s.name).sort(),['niu','niu-connect']);
 const invoke=()=>ctx.tools.execute({callId:crypto.randomUUID(),name:'mcp__niu__inspect_key',arguments:{},signal:AbortSignal.timeout(5000)});
 assert.equal((await invoke()).isError,true);
 let revoked=false,requests=0;
 const token='niu_'+'b'.repeat(64);
 const server=createServer((req,res)=>{
  requests++;
  res.setHeader('content-type','application/json');
  if(revoked || req.headers.authorization!=='Bearer '+token){res.writeHead(401);res.end(JSON.stringify({error:{message:'Fixture revoked'}}));return;}
  res.end(JSON.stringify({data:{name:'Native host fixture key'}}));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try {
  await writeFile(${JSON.stringify(credential)},JSON.stringify({version:1,origin:'http://127.0.0.1:'+server.address().port,token}),{mode:0o600});
  const connected=await invoke();
  assert(!connected.isError);assert.match(JSON.stringify(connected),/Native host fixture key/);
  revoked=true;
  assert.equal((await invoke()).isError,true);
  await rm(${JSON.stringify(credential)});
  assert.equal((await invoke()).isError,true);
  assert.equal(requests,2,'missing credentials must not contact gateway');
 }finally {await new Promise(resolve=>server.close(resolve));}
 const runtime=[...ctx.registry.values()].find(r=>r.name==='niu');assert(runtime);
 for(const fiber of [...runtime.fibers])await fiber.dispose();
 assert.deepEqual(ctx.tools.schemas().map(t=>t.name).sort(),before.filter(n=>!n.startsWith('mcp__niu__')));
 assert.equal((await ctx.skills.list()).filter(s=>s.provider==='niu-bundled').length,0);
 await writeFile(${JSON.stringify(proof)},JSON.stringify({host:'DeepSeek Harness',version:'0.2.1-rc.5',tools:50,skills:2,credentialReload:true,revocationRejected:true,unloadIsolation:true,inferencePerformed:false}));
}
`);
  const patch = join(dir, 'probe.patch.yml');
  await writeFile(patch, `- insert:\n    - id: unrelated-fixture\n      name: '@deepseek-ai/dsh-mcp-client'\n      config:\n        serverName: unrelated\n        transport: stdio\n        command: ${JSON.stringify(process.execPath)}\n        args: [${JSON.stringify(join(bundle, 'runtime/mcp/bin/niu-mcp.mjs'))}]\n        env:\n          NIU_CREDENTIAL_FILE: ${JSON.stringify(credential)}\n          NIU_API_KEY: ''\n          NIU_BASE_URL: ''\n        failOnStartupError: true\n    - id: niu-check-probe\n      name: ${JSON.stringify(probe)}\n`);
  host = spawn(resolve(dsh), ['--profile', 'niu-check', '--patch', patch], {cwd: root, env, stdio: ['ignore','pipe','pipe']});
  let log='', terminal=false;
  host.stdout.on('data', bytes=>log+=bytes);host.stderr.on('data', bytes=>log+=bytes);
  const exited = new Promise(resolve=>{host.once('error',error=>{log+=error;terminal=true;resolve();});host.once('exit',()=>{terminal=true;resolve();});});
  let result;
  for(let i=0;i<600;i++) {
    try {result=JSON.parse(await readFile(proof,'utf8'));break;}catch {}
    if(terminal)break;
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  host.kill('SIGINT');await exited;host=undefined;
  assert(result, 'Native qualification failed or timed out: '+log);
  await run(resolve(dsh), ['plugin','--profile','niu-check','remove','@niu-io/dsh-plugin']);
  const config=await run(resolve(dsh), ['--profile','niu-check','--dump-config']);
  assert(!config.includes('niu-native'));
  assert(config.includes('@deepseek-ai/dsh'));
  console.log(JSON.stringify({...result,packageRemoval:true},null,2));
} finally {
  host?.kill('SIGINT');
  await rm(dir,{recursive:true,force:true});
}
