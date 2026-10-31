import {mkdir,open,rename,rm,lstat,readFile} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {randomUUID} from 'node:crypto';

/** Atomic owner-only persistence. Destination is supplied by the host adapter,
 * never by a remote authorization response. No credential is printed. */
export async function saveCredential(destination,credential) {
  if (!/^niu_[0-9a-f]{64}$/.test(credential.token) || new URL(credential.origin).origin!==credential.origin) throw new Error('Invalid Niu credential');
  const directory=dirname(destination);
  await mkdir(directory,{recursive:true,mode:0o700});
  const info=await lstat(directory);
  if (!info.isDirectory() || info.isSymbolicLink() || (process.platform!=='win32' && ((info.mode&0o077)!==0 || info.uid!==process.getuid()))) throw new Error('Niu credential directory must be private and owned by the current user');
  const temporary=join(directory,`.credential-${randomUUID()}`);
  let file;
  try {
    file=await open(temporary,'wx',0o600);
    await file.writeFile(JSON.stringify({version:1,origin:credential.origin,token:credential.token})+'\n');
    await file.sync();await file.close();file=undefined;
    await rename(temporary,destination);
  } finally {await file?.close();await rm(temporary,{force:true});}
}

export async function readCredential(destination) {
  const info=await lstat(destination);
  if (!info.isFile() || info.isSymbolicLink() || (process.platform!=='win32' && ((info.mode&0o077)!==0 || info.uid!==process.getuid()))) throw new Error('Niu credential file must be private and owned by the current user');
  const result=JSON.parse(await readFile(destination,'utf8'));
  if (result.version!==1 || !/^niu_[0-9a-f]{64}$/.test(result.token) || new URL(result.origin).origin!==result.origin) throw new Error('Invalid saved Niu credential');
  return {origin:result.origin,token:result.token};
}
