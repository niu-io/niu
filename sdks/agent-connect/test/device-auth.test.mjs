import {test} from 'node:test';
import assert from 'node:assert/strict';
import {authorizeDevice} from '../src/auth/device.mjs';
const secret='a'.repeat(64),token='niu_'+'b'.repeat(64);
const start={device_secret:secret,user_code:'ABCDEF123456',verification_uri:'/connect',expires_in:600,interval:5};
const response=(status,body)=>({status,json:async()=>body});
test('browser sees only verification code; pending polling yields credential to caller',async()=>{
 const calls=[];let verified;
 const queue=[response(201,start),response(202,{}),response(200,{token,token_type:'Bearer'})];
 const result=await authorizeDevice({baseURL:'https://niu.example',clientName:'Codex',showVerification:async value=>{verified=value;},fetchImpl:async(url,options)=>{calls.push([String(url),JSON.parse(options.body)]);return queue.shift();},wait:async()=>{}});
 assert.equal(result.token,token);assert(!verified.url.includes(secret));assert(verified.url.includes(start.user_code));
 assert.equal(calls[1][1].device_secret,secret);assert.equal(calls[0][1].client_name,'Codex');
});
test('refuses cross-origin verification, denial and redirects without leaking server body',async()=>{
 await assert.rejects(authorizeDevice({baseURL:'http://evil.example',clientName:'Codex'}),/HTTPS/);
 await assert.rejects(authorizeDevice({baseURL:'https://niu.example',clientName:'Codex',showVerification:async()=>{},fetchImpl:async()=>response(201,{...start,verification_uri:'https://evil.example'})}),/invalid authorization/);
 let n=0;
 await assert.rejects(authorizeDevice({baseURL:'https://niu.example',clientName:'Claude Code',showVerification:async()=>{},fetchImpl:async()=>n++?response(401,{}):response(201,start)}),/denied/);
});

test('credential persistence is owner-only and refuses permissive directories and symlinks',async()=>{
 const {mkdtemp,mkdir,lstat,symlink,rm}=await import('node:fs/promises');
 const {tmpdir}=await import('node:os');const {join}=await import('node:path');
 const {saveCredential,readCredential}=await import('../src/auth/credentials.mjs');
 const root=await mkdtemp(join(tmpdir(),'niu-auth-test-'));
 try {
  const path=join(root,'private','credential.json');
  await saveCredential(path,{origin:'https://niu.example',token});
  assert.equal((await readCredential(path)).token,token);
  if(process.platform!=='win32')assert.equal((await lstat(path)).mode&0o777,0o600);
  const link=join(root,'credential-link');await symlink(path,link);
  await assert.rejects(readCredential(link),/private/);
  await mkdir(join(root,'public'),{mode:0o755});
  if(process.platform!=='win32')await assert.rejects(saveCredential(join(root,'public','credential.json'),{origin:'https://niu.example',token}),/private/);
 } finally {await rm(root,{recursive:true,force:true});}
});

test('additional management rights must be named explicitly and use the finite allowlist',async()=>{
 let requested;let count=0;
 await assert.rejects(authorizeDevice({baseURL:'https://niu.example',clientName:'Codex',capabilities:['pools:write'],showVerification:async()=>{},fetchImpl:async(url,options)=>{if(!count++){requested=JSON.parse(options.body);return response(201,start);}return response(401,{});}}),/denied/);
 assert.deepEqual(requested.capabilities,['pools:write']);
 await assert.rejects(authorizeDevice({baseURL:'https://niu.example',clientName:'Codex',capabilities:['platform:admin'],fetchImpl:async()=>{throw new Error('must not send');}}),/Unsupported/);
 await assert.rejects(authorizeDevice({baseURL:'https://niu.example',clientName:'Codex',capabilities:['pools:write','pools:write']}),/duplicate/);
});

 test('DeepSeek Harness uses the same bounded browser handoff and rejects invented hosts',async()=>{
  let n=0;let requested;
  const credential=await authorizeDevice({baseURL:'https://niu.example',clientName:'DeepSeek Harness',showVerification:async value=>assert.equal(value.clientName,'DeepSeek Harness'),fetchImpl:async(url,options)=>{if(!n++){requested=JSON.parse(options.body);return response(201,start);}return response(200,{token,token_type:'Bearer'});}});
  assert.equal(requested.client_name,'DeepSeek Harness');assert.equal(credential.token,token);
  await assert.rejects(authorizeDevice({baseURL:'https://niu.example',clientName:'Invented host'}),/Choose/);
 });


test('login rejects unsafe storage before requesting authorization and preserves existing credentials',async()=>{
 const {mkdtemp,mkdir,readFile,rm}=await import('node:fs/promises');
 const {tmpdir}=await import('node:os');const {join}=await import('node:path');
 const {spawnSync}=await import('node:child_process');
 const {prepareCredentialStorage,saveCredential}=await import('../src/auth/credentials.mjs');
 const root=await mkdtemp(join(tmpdir(),'niu-preflight-'));
 try {
  const path=join(root,'private','credential.json');
  await saveCredential(path,{origin:'https://niu.example',token});
  const before=await readFile(path,'utf8');
  await prepareCredentialStorage(path);
  assert.equal(await readFile(path,'utf8'),before);
  if(process.platform!=='win32') {
   const publicDirectory=join(root,'public');await mkdir(publicDirectory,{mode:0o755});
   const result=spawnSync(process.execPath,[new URL('../bin/niu-login.mjs',import.meta.url).pathname,'--origin','http://127.0.0.1:1','--credentials',join(publicDirectory,'credential.json'),'--no-open'],{encoding:'utf8',timeout:5000});
   assert.equal(result.status,1);assert.match(result.stderr,/directory must be private/);
   assert.equal(result.stdout,'');assert.doesNotMatch(result.stderr,/fetch failed/);
  }
 } finally {await rm(root,{recursive:true,force:true});}
});
