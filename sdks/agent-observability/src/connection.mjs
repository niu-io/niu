import { mkdir, lstat, readFile, writeFile, rename, unlink, readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { randomBytes, createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { configuration, send, trace } from './telemetry.mjs';
import { startCodexReceiver } from './codex.mjs';

const begin = '# Niu Collector telemetry begin';
const end = '# Niu Collector telemetry end';
export const collectorHome = (env = process.env) => env.NIU_COLLECTOR_HOME ?? join(homedir(), '.niu', 'collector');
async function privateHome(env) {
  const directory = collectorHome(env);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const info = await lstat(directory);
  if (!info.isDirectory() || info.isSymbolicLink() || (info.mode & 0o077)) throw new Error('Collector directory must be private.');
  return directory;
}
export async function privateJson(file, value) {
  try { const info = await lstat(file); if (!info.isFile() || info.isSymbolicLink() || (info.mode & 0o077)) throw new Error('Invalid private state.'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const temporary = `${file}.${randomBytes(8).toString('hex')}.tmp`;
  await writeFile(temporary, JSON.stringify(value), { mode: 0o600, flag: 'wx' });
  await rename(temporary, file);
}
export async function readConnection(env = process.env) {
  const directory = await privateHome(env), file = join(directory, 'connection.json');
  let value;
  try {
    const info = await lstat(file);
    if (!info.isFile() || info.isSymbolicLink() || (info.mode & 0o077) || info.size > 8192) throw new Error('Invalid connection state.');
    value = JSON.parse(await readFile(file, 'utf8'));
  } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  if (value.consent !== 'metadata-v1' || !/^[a-f0-9]{64}$/.test(value.secret) || !Number.isInteger(value.port) || value.port < 1024 || value.port > 65535) throw new Error('Invalid connection state.');
  return { ...value, config: configuration({ NIU_AGENT_TOKEN: value.token, NIU_AGENT_ENDPOINT: value.endpoint, NIU_AGENT_SOURCE: value.source, NIU_AGENT_STATE_DIR: join(directory, 'queue') }), directory };
}
export async function connect(env = process.env, { consent = false, fetcher = fetch } = {}) {
  if (!consent) throw new Error('Metadata collection requires --consent.');
  const config = configuration({ ...env, NIU_AGENT_SOURCE: env.NIU_AGENT_SOURCE ?? 'codex' });
  const directory = await privateHome(env);
  const previous = await readConnection(env);
  if (previous) throw new Error('Disconnect the existing collector before connecting another credential.');
  const port = Number(env.NIU_COLLECTOR_PORT ?? 43189);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid collector port.');
  const now = Date.now();
  await send(config, trace(config, { name: 'Collector connection verification', start: now, end: now, status: 'completed' }), fetcher);
  await privateJson(join(directory, 'connection.json'), { token: config.token, endpoint: config.endpoint, source: config.source, consent: 'metadata-v1', port, secret: randomBytes(32).toString('hex'), connected_at: now });
}
async function receiverRequest(connection, path, fetcher = fetch) {
  return fetcher(`http://127.0.0.1:${connection.port}${path}`, { method: path === '/shutdown' ? 'POST' : 'GET', headers: { authorization: `Bearer ${connection.secret}` }, redirect: 'error', signal: AbortSignal.timeout(500) });
}
export async function receiverHealth(connection) {
  try { const response = await receiverRequest(connection, '/health'); const value = response.ok ? await response.json() : null; return value?.collector === 'niu-collector' ? value : null; } catch { return null; }
}
export async function ensureReceiver(env = process.env) {
  const connection = await readConnection(env);
  if (!connection) return false;
  if (await receiverHealth(connection)) return true;
  const child = spawn(process.execPath, [fileURLToPath(new URL('../bin/niu-agent-observability.mjs', import.meta.url)), 'daemon'], { detached: true, stdio: 'ignore', env: { PATH: env.PATH ?? process.env.PATH, NIU_COLLECTOR_HOME: collectorHome(env) } });
  child.on('error', () => {}); child.unref();
  for (let attempt = 0; attempt < 10; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 50));
    if (await receiverHealth(connection)) return true;
  }
  return false;
}
function codexPath(env) { return join(env.NIU_COLLECTOR_CODEX_CONFIG_DIR ?? env.CODEX_HOME ?? join(homedir(), '.codex'), 'config.toml'); }
async function configText(file) {
  try { const info = await lstat(file); if (!info.isFile() || info.isSymbolicLink()) throw new Error('Codex configuration must be a regular file.'); return await readFile(file, 'utf8'); }
  catch (error) { if (error.code === 'ENOENT') return ''; throw error; }
}
async function replaceConfig(file, before, after) {
  if (await configText(file) !== before) throw new Error('Codex configuration changed; retry.');
  // No raw Codex configuration is included in telemetry or copied into collector state.
  const temporary = `${file}.niu-${randomBytes(8).toString('hex')}.tmp`;
  await writeFile(temporary, after, { mode: 0o600, flag: 'wx' });
  try {
    if (await configText(file) !== before) throw new Error('Codex configuration changed; retry.');
    await rename(temporary, file);
  } finally { await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
}
export async function enableCodex(env = process.env, { consent = false } = {}) {
  if (!consent) throw new Error('Native telemetry configuration requires --consent.');
  const connection = await readConnection(env);
  if (!connection) throw new Error('Connect the collector first.');
  const file = codexPath(env), text = await configText(file);
  if (text.includes(begin)) {
    const state = JSON.parse(await readFile(join(connection.directory, 'native.json'), 'utf8'));
    if (state.file !== file || !text.includes(state.block)) throw new Error('Collector telemetry settings were edited.');
    if (!await ensureReceiver(env)) throw new Error('Collector receiver could not start.');
    return true;
  }
  // Preserve existing exporters: refuse to merge unknown TOML rather than overwrite it.
  if (/^\s*(?:\[[^\]\n]*\botel\b|otel\s*[.=])/m.test(text)) throw new Error('Codex already has telemetry settings. Merge the collector settings manually instead.');
  const block = `${text.endsWith('\n') || !text ? '' : '\n'}${begin}\n[otel]\nlog_user_prompt = false\nexporter = { otlp-http = { endpoint = "http://127.0.0.1:${connection.port}/v1/logs", protocol = "json", headers = { Authorization = "Bearer ${connection.secret}" } } }\n${end}\n`;
  await mkdir(dirname(file), { recursive: true, mode: 0o700 });
  if (!await ensureReceiver(env)) throw new Error('Collector receiver could not start.');
  const stateFile = join(connection.directory, 'native.json');
  await privateJson(stateFile, { file, block, original_ended_with_newline: text.endsWith('\n') || !text });
  try { await replaceConfig(file, text, `${text}${block}`); }
  catch (error) { await unlink(stateFile); throw error; }
  return true;
}
export async function disableCodex(env = process.env) {
  const directory = await privateHome(env), stateFile = join(directory, 'native.json');
  let state;
  try { const info = await lstat(stateFile); if (!info.isFile() || info.isSymbolicLink() || (info.mode & 0o077) || info.size > 8192) throw new Error('Invalid native settings state.'); state = JSON.parse(await readFile(stateFile, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return; throw error; }
  const text = await configText(state.file);
  if (!text.includes(state.block)) throw new Error('Collector telemetry settings were edited. Remove the marked block manually before disconnecting.');
  const after = text.replace(state.block, '');
  await replaceConfig(state.file, text, after);
  await unlink(stateFile);
  const connection = await readConnection(env);
  if (connection) try { await receiverRequest(connection, '/shutdown'); } catch { /* already stopped */ }
}
export async function disconnect(env = process.env) {
  await disableCodex(env);
  const connection = await readConnection(env);
  if (!connection) return;
  try { await receiverRequest(connection, '/shutdown'); } catch { /* receiver may already be stopped */ }
  await unlink(join(connection.directory, 'connection.json'));
}
export async function status(env = process.env) {
  const connection = await readConnection(env);
  if (!connection) return { connected: false, native_receiver: false };
  let queued = 0;
  try { queued = (await readdir(connection.config.directory)).filter(name => name.startsWith('pending-')).length; } catch (error) { if (error.code !== 'ENOENT') throw error; }
  let nativeConfigured = false;
  try { const info = await lstat(join(connection.directory, 'native.json')); nativeConfigured = info.isFile() && !info.isSymbolicLink(); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  return { connected: true, source: connection.source, native_configured: nativeConfigured, native_receiver: Boolean(await receiverHealth(connection)), queued_traces: queued };
}
export async function daemon(env = process.env) {
  const connection = await readConnection(env);
  if (!connection) return;
  let receiver;
  const stop = async () => { await receiver.close(); process.exitCode = 0; };
  receiver = await startCodexReceiver(connection.config, { port: connection.port, secret: connection.secret, onShutdown: stop });
  process.once('SIGTERM', stop); process.once('SIGINT', stop);
}
export const correlationHash = value => createHash('sha256').update(value).digest('hex');
