import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

test('saved credentials load before the first stdio initialization can be consumed',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'niu-mcp-startup-'));
 const path=join(dir,'credential.json');
 await writeFile(path,JSON.stringify({version:1,origin:'https://niu.example',token:'niu_'+'a'.repeat(64)}),{mode:0o600});
 const child=spawn(process.execPath,[fileURLToPath(new URL('../bin/niu-mcp.mjs',import.meta.url))],{cwd:dir,env:{...process.env,NIU_API_KEY:'',NIU_BASE_URL:'',NIU_CREDENTIAL_FILE:path},stdio:['pipe','pipe','pipe']});
 let output='',errors='';child.stderr.on('data',bytes=>errors+=bytes);child.stdout.on('data',bytes=>output+=bytes);
 const exited=new Promise(resolve=>child.once('exit',resolve));
 try {
  // Deliberately send before filesystem credential reads can complete.
  child.stdin.write(JSON.stringify({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2024-11-05',capabilities:{},clientInfo:{name:'test',version:'1'}}})+'\n');
  const deadline=Date.now()+10000;
  while(!output.includes('\n') && Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,20));
  const response=JSON.parse(output.trim().split('\n')[0] || '{}');
  assert.equal(response.id,1);assert(response.result);assert.equal(errors,'');
 }finally{child.kill();await exited;await rm(dir,{recursive:true,force:true});}
});

test('one running MCP process discovers tools before login and uses a newly saved credential',async()=>{
 const {createServer}=await import('node:http');
 const server=createServer((request,response)=>{
  assert.equal(request.headers.authorization,'Bearer niu_'+'b'.repeat(64));
  response.setHeader('content-type','application/json');response.end(JSON.stringify({data:{name:'Fixture key'}}));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin=`http://127.0.0.1:${server.address().port}`;
 const dir=await mkdtemp(join(tmpdir(),'niu-mcp-reload-'));const path=join(dir,'credential.json');
 const child=spawn(process.execPath,[fileURLToPath(new URL('../bin/niu-mcp.mjs',import.meta.url))],{cwd:dir,env:{...process.env,NIU_API_KEY:'',NIU_BASE_URL:'',NIU_CREDENTIAL_FILE:path},stdio:['pipe','pipe','pipe']});
 let output='';const replies=new Map();child.stdout.on('data',bytes=>{output+=bytes;let index;while((index=output.indexOf('\n'))>=0){const line=output.slice(0,index);output=output.slice(index+1);const message=JSON.parse(line);replies.set(message.id,message);}});
 const exited=new Promise(resolve=>child.once('exit',resolve));
 async function rpc(id,method,params){child.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');const deadline=Date.now()+10000;while(!replies.has(id)&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,20));assert(replies.has(id),'MCP response timeout');return replies.get(id);}
 try{
  assert((await rpc(1,'tools/list',{})).result.tools.length>0);
  assert.equal((await rpc(2,'tools/call',{name:'inspect_key',arguments:{}})).result.isError,true);
  await writeFile(path,JSON.stringify({version:1,origin,token:'niu_'+'b'.repeat(64)}),{mode:0o600});
  const response=await rpc(3,'tools/call',{name:'inspect_key',arguments:{}});
  assert(!response.error);assert(!response.result.isError);assert.match(JSON.stringify(response.result),/Fixture key/);
 }finally{child.kill();await exited;await new Promise(resolve=>server.close(resolve));await rm(dir,{recursive:true,force:true});}
});
