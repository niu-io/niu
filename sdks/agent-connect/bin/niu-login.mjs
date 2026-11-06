#!/usr/bin/env node
import {homedir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {authorizeDevice} from '../src/auth/device.mjs';
import {prepareCredentialStorage,saveCredential} from '../src/auth/credentials.mjs';

const args=process.argv.slice(2);
const options={origin:'https://niu.io',client:'Codex',credentials:join(homedir(),'.config','niu','credential.json'),open:true,capabilities:[],task:undefined};
try {
 for(let i=0;i<args.length;i++) {
  const flag=args[i];
  if(flag==='--capability' && args[i+1]){options.capabilities.push(args[++i]);continue;}
  if(flag==='--no-open'){options.open=false;continue;}
  const key=({'--origin':'origin','--client':'client','--credentials':'credentials','--task':'task'})[flag];
  if(!key || !args[i+1] || args[i+1].startsWith('--')) throw new Error('Usage: niu-login [--origin URL] [--client NAME] [--credentials PATH] [--task TEXT] [--capability pools:read] [--no-open]');
  options[key]=args[++i];
 }
 await prepareCredentialStorage(options.credentials);
 const controller=new AbortController();
 process.once('SIGINT',()=>controller.abort());
 const credential=await authorizeDevice({baseURL:options.origin,clientName:options.client,capabilities:options.capabilities,task:options.task,signal:controller.signal,showVerification:async({url,code,task})=>{
  process.stdout.write(`Review this Niu connection in your browser:\n${url}\nVerification code: ${code}\n${task?`Requested task: ${task}\n`:''}Waiting for your decision…\n`);
  if(options.open){
   const command=process.platform==='darwin'?'open':process.platform==='win32'?null:'xdg-open';
   if(command){const child=spawn(command,[url],{stdio:'ignore',detached:true});child.on('error',()=>{});child.unref();}
  }
 }});
 await saveCredential(options.credentials,credential);
 let invocationAllowed;
 let invocationProtocols;
 for(const path of ['/v1/key','/v1/models']){
  const response=await fetch(new URL((credential.base_path || '')+path,credential.origin),{headers:{authorization:`Bearer ${credential.token}`},signal:controller.signal,redirect:'error'});
  if(!response.ok)throw new Error(`Authorization saved, but connection verification failed (HTTP ${response.status}). Recheck Niu access before proceeding.`);
  if(path==='/v1/key'){const key=(await response.json()).data;invocationAllowed=key?.invocation_allowed;invocationProtocols=Array.isArray(key?.invocation_protocols)?key.invocation_protocols:undefined;}
 }
 process.stdout.write(invocationAllowed===false
  ? 'Model invocation is not authorized. Discovery and approved management operations remain available; no paid call is permitted by this connection.\n'
  : invocationAllowed===true
   ? `Model invocation is authorized${invocationProtocols?.length?` for: ${invocationProtocols.join(', ')}`:'; the deployment did not report interface scope'}. Calls use the existing workspace and key spending limits. This connection does not add a separate trial budget or cap owner-funded Provider expense; inspect /v1/key spending_limits before paid trials.\n`
   : 'Model invocation authority was not reported. Inspect the connection permissions and server spending limits before paid trials; do not assume authority from a successful login.\n');
 process.stdout.write('Niu connection verified. Credential saved in your private local configuration. No paid model calls were made.\n');
} catch(error){
 process.stderr.write(`niu-login: ${error instanceof Error?error.message:'Authorization failed'}\n`);process.exitCode=1;
}
