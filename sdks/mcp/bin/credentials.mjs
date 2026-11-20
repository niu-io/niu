import {open,constants} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join} from 'node:path';

export async function credentialEnvironment(env) {
  if(env.NIU_API_KEY?.trim())return env;
  const path=env.NIU_CREDENTIAL_FILE || join(homedir(),'.config','niu','credential.json');
  let file;
  try {
    file=await open(path,constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
    const stat=await file.stat();
    if(!stat.isFile() || stat.size>16384 || (process.platform!=='win32' && ((stat.mode&0o077)!==0 || stat.uid!==process.getuid())))throw new Error('private file required');
    const saved=JSON.parse(await file.readFile('utf8'));
    const origin=new URL(saved.origin);
    if(saved.version!==1 || !/^niu_[0-9a-f]{64}$/.test(saved.token) || origin.origin!==saved.origin || (origin.protocol!=='https:' && !(origin.protocol==='http:' && ['localhost','127.0.0.1','[::1]'].includes(origin.hostname))))throw new Error('invalid credential');
    const mount=saved.base_path ?? '';
    if(typeof mount!=='string' || (mount!=='' && !/^\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/.test(mount)))throw new Error('invalid deployment path');
    const base=`${origin.origin}${mount}/v1`;
    if(env.NIU_BASE_URL && env.NIU_BASE_URL.replace(/\/$/,'')!==base)throw new Error('origin mismatch');
    return {...env,NIU_API_KEY:saved.token,NIU_BASE_URL:base,NIU_LOG_PAYLOADS:env.NIU_LOG_PAYLOADS || 'false'};
  }catch{
    throw new Error('Niu login is missing, invalid or does not match this gateway. Run niu-login for this Niu origin and retry.');
  }finally{await file?.close();}
}
