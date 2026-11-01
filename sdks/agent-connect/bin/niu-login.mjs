#!/usr/bin/env node
import {homedir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {authorizeDevice} from '../src/auth/device.mjs';
import {prepareCredentialStorage,saveCredential} from '../src/auth/credentials.mjs';

const args=process.argv.slice(2);
const options={origin:'https://niu.io',client:'Codex',credentials:join(homedir(),'.config','niu','credential.json'),open:true,capabilities:[]};
try {
 for(let i=0;i<args.length;i++) {
  const flag=args[i];
  if(flag==='--capability' && args[i+1]){options.capabilities.push(args[++i]);continue;}
  if(flag==='--no-open'){options.open=false;continue;}
  const key=({'--origin':'origin','--client':'client','--credentials':'credentials'})[flag];
  if(!key || !args[i+1] || args[i+1].startsWith('--')) throw new Error('Usage: niu-login [--origin URL] [--client NAME] [--credentials PATH] [--no-open]');
  options[key]=args[++i];
 }
 await prepareCredentialStorage(options.credentials);
 const controller=new AbortController();
 process.once('SIGINT',()=>controller.abort());
 const credential=await authorizeDevice({baseURL:options.origin,clientName:options.client,capabilities:options.capabilities,signal:controller.signal,showVerification:async({url,code})=>{
  process.stdout.write(`Review this Niu connection in your browser:\n${url}\nVerification code: ${code}\nWaiting for your decision…\n`);
  if(options.open){
   const command=process.platform==='darwin'?'open':process.platform==='win32'?null:'xdg-open';
   if(command){const child=spawn(command,[url],{stdio:'ignore',detached:true});child.on('error',()=>{});child.unref();}
  }
 }});
 await saveCredential(options.credentials,credential);
 for(const path of ['/v1/key','/v1/models']){
  const response=await fetch(new URL(path,credential.origin),{headers:{authorization:`Bearer ${credential.token}`},signal:controller.signal,redirect:'error'});
  if(!response.ok)throw new Error(`Authorization saved, but connection verification failed (HTTP ${response.status}). Recheck Niu access before proceeding.`);
 }
 process.stdout.write('Niu connection verified. Credential saved in your private local configuration. No paid model calls were made.\n');
} catch(error){
 process.stderr.write(`niu-login: ${error instanceof Error?error.message:'Authorization failed'}\n`);process.exitCode=1;
}
