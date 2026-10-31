// Private local webhook credentials, separate from artifacts and conversation.
import { constants } from 'node:fs';
import { mkdir, lstat, realpath, open, rename, unlink } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { homedir } from 'node:os';
import { createHash, randomUUID } from 'node:crypto';

export async function prepareSigningSecret(baseURL, credential, subscription, env = process.env) {
  if (process.platform === 'win32') throw new Error('Signing credential persistence on Windows requires an ACL-capable host adapter; no subscription mutation was started');
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(subscription) || subscription.length > 80) throw new Error('Invalid signing credential reference');
  const requested = resolve(env.NIU_EVENT_SECRET_DIR || join(homedir(), '.config', 'niu', 'events'));
  await mkdir(requested, { recursive: true, mode: 0o700 });
  const leaf = await lstat(requested);
  if (leaf.isSymbolicLink() || !leaf.isDirectory() || (process.platform !== 'win32' && (leaf.uid !== process.getuid() || (leaf.mode & 0o077)))) throw new Error('Private signing credential directory required');
  const directory = await realpath(requested);
  if (process.platform !== 'win32') {
    let parent = dirname(directory);
    while (true) {
      const stat = await lstat(parent);
      const trustedOwner = stat.uid === 0 || stat.uid === process.getuid();
      const protectedSticky = (stat.mode & 0o1000) && trustedOwner;
      if (!stat.isDirectory() || !trustedOwner || ((stat.mode & 0o022) && !protectedSticky)) throw new Error('Unsafe signing credential parent directory');
      const next = dirname(parent); if (next === parent) break; parent = next;
    }
  }
  const identity = createHash('sha256').update(`${baseURL}\0${credential}`).digest('hex').slice(0, 16);
  const destination = join(directory, `${subscription}-${identity}.json`);
  const check = async () => {
    try {
      const stat = await lstat(destination);
      if (!stat.isFile() || stat.isSymbolicLink() || (process.platform !== 'win32' && (stat.uid !== process.getuid() || (stat.mode & 0o077)))) throw new Error('Unsafe existing signing credential');
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  };
  await check();
  return async secret => {
    if (!/^niu_whsec_[A-Za-z0-9_-]{43}$/.test(secret)) throw new Error('Invalid signing credential response');
    await check();
    const temporary = join(directory, `.${randomUUID()}.tmp`);
    let file;
    try {
      file = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW || 0), 0o600);
      await file.writeFile(JSON.stringify({ version: 1, origin: new URL(baseURL).origin, subscription, signing_secret: secret }) + '\n');
      await file.sync(); await file.close(); file = undefined;
      await rename(temporary, destination);
      return destination;
    } finally { await file?.close(); await unlink(temporary).catch(() => {}); }
  };
}
