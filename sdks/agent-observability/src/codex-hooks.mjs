import { join } from 'node:path';
import { lstat, readFile, writeFile, unlink, readdir } from 'node:fs/promises';
import { trace, deliver, privateDirectory } from './telemetry.mjs';
import { correlationHash, privateJson } from './connection.mjs';
const tools = new Set(['Bash', 'apply_patch', 'exec_command', 'write_stdin', 'shell', 'Read', 'Edit', 'Write', 'Grep', 'Glob']);
async function metadata(file) {
  try {
    const info = await lstat(file);
    if (!info.isFile() || info.isSymbolicLink() || (info.mode & 0o077) || info.size > 65536) throw new Error('Invalid hook state.');
    return JSON.parse(await readFile(file, 'utf8'));
  } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
/** All input fields except event/category/correlation are discarded, including tool_response. */
export async function codexHook(config, input, { now = Date.now, fetcher = fetch } = {}) {
  const event = input.hook_event_name;
  if (!['SessionStart', 'SessionEnd', 'PreToolUse', 'PostToolUse'].includes(event) || typeof input.session_id !== 'string' || input.session_id.length > 256) return;
  if (['PreToolUse', 'PostToolUse'].includes(event) && (typeof input.tool_use_id !== 'string' || input.tool_use_id.length > 256)) return;
  await privateDirectory(config);
  const session = event === 'SessionStart' || event === 'SessionEnd';
  const key = correlationHash(JSON.stringify([input.session_id, session ? 'session' : input.tool_use_id]));
  const startFile = join(config.directory, `hook-start-${key}.json`);
  if (event === 'SessionStart' || event === 'PreToolUse') {
    try { await writeFile(startFile, JSON.stringify({ start: now() }), { flag: 'wx', mode: 0o600 }); }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
    for (const name of await readdir(config.directory)) {
      if (!/^hook-(?:start|end)-[a-f0-9]{64}\.json$/.test(name)) continue;
      const file = join(config.directory, name), info = await lstat(file);
      if (info.isFile() && !info.isSymbolicLink() && now() - info.mtimeMs > 86_400_000) await unlink(file);
    }
    return;
  }
  const endFile = join(config.directory, `hook-end-${key}.json`);
  let value = await metadata(endFile);
  if (!value) {
    const begin = await metadata(startFile), end = now();
    const start = Number.isSafeInteger(begin?.start) && begin.start >= 0 && begin.start <= end ? begin.start : null;
    const tool = tools.has(input.tool_name) ? input.tool_name : 'Other tool';
    value = trace(config, { name: session ? 'Codex session' : `Codex tool: ${tool}`, start, end, status: 'unknown',
      ...(session ? {} : { tool, toolStatus: 'unknown' }), recordId: key });
    // Unknown: PostToolUse also runs after failed commands; do not inspect output to infer success.
    await privateJson(endFile, value);
  }
  await deliver(config, value, fetcher);
  await unlink(startFile).catch(error => { if (error.code !== 'ENOENT') throw error; });
}
