import {deploymentURL,validBasePath} from './deployment.mjs';
import {mkdir,open,rename,rm,lstat,readFile} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {randomUUID} from 'node:crypto';

/** Atomic owner-only persistence. Destination is supplied by the host adapter,
 * never by a remote authorization response. No credential is printed. */
export async function prepareCredentialStorage(destination) {
  const directory=dirname(destination);
  await mkdir(directory,{recursive:true,mode:0o700});
  const info=await lstat(directory);
  if (!info.isDirectory() || info.isSymbolicLink() || (process.platform!=='win32' && ((info.mode&0o077)!==0 || info.uid!==process.getuid()))) throw new Error('Niu credential directory must be private and owned by the current user');
  try {
    const target=await lstat(destination);
    if (!target.isFile() || target.isSymbolicLink() || (process.platform!=='win32' && ((target.mode&0o077)!==0 || target.uid!==process.getuid()))) throw new Error('Niu credential file must be private and owned by the current user');
  } catch(error) {if(error.code!=='ENOENT')throw error;}
  const probe=join(directory,`.credential-check-${randomUUID()}`);
  const file=await open(probe,'wx',0o600);
  try {await file.sync();} finally {await file.close();await rm(probe,{force:true});}
}

export async function saveCredential(destination,credential) {
  if (!/^niu_[0-9a-f]{64}$/.test(credential.token) || !validBasePath(credential.base_path ?? '') || deploymentURL(credential.origin).origin!==credential.origin) throw new Error('Invalid Niu credential');
  await prepareCredentialStorage(destination);
  const directory=dirname(destination);
  const temporary=join(directory,`.credential-${randomUUID()}`);
  let file;
  try {
    file=await open(temporary,'wx',0o600);
    await file.writeFile(JSON.stringify({version:1,origin:credential.origin,...(credential.base_path ? {base_path:credential.base_path} : {}),token:credential.token})+'\n');
    await file.sync();await file.close();file=undefined;
    await rename(temporary,destination);
  } finally {await file?.close();await rm(temporary,{force:true});}
}

export async function readCredential(destination) {
  const info=await lstat(destination);
  if (!info.isFile() || info.isSymbolicLink() || (process.platform!=='win32' && ((info.mode&0o077)!==0 || info.uid!==process.getuid()))) throw new Error('Niu credential file must be private and owned by the current user');
  const result=JSON.parse(await readFile(destination,'utf8'));
  if (result.version!==1 || !/^niu_[0-9a-f]{64}$/.test(result.token) || !validBasePath(result.base_path ?? '') || deploymentURL(result.origin).origin!==result.origin) throw new Error('Invalid saved Niu credential');
  return {origin:result.origin,base_path:result.base_path ?? '',token:result.token};
}
