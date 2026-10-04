import { createHash, randomUUID } from 'node:crypto';
import { mkdir, lstat, readFile, writeFile, unlink, readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const version = '0.1.0';
const hash = value => createHash('sha256').update(value).digest('hex');
const supported = new Set(['Bash', 'Read', 'Write', 'Edit', 'Glob', 'Grep', 'WebFetch', 'WebSearch', 'Agent', 'Task', 'NotebookEdit', 'TodoWrite']);
export function configuration(env = process.env) {
  const token = env.NIU_AGENT_TOKEN;
  if (!token?.trim()) throw new Error('Set NIU_AGENT_TOKEN to a personal ingestion key.');
  const endpoint = new URL(env.NIU_AGENT_ENDPOINT ?? 'https://niu.io/admin/v1/agent-observability');
  if (endpoint.username || endpoint.password || endpoint.search || endpoint.hash || !['https:', 'http:'].includes(endpoint.protocol)) throw new Error('Invalid telemetry endpoint.');
  if (endpoint.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname)) throw new Error('Telemetry requires HTTPS outside loopback.');
  const source = env.NIU_AGENT_SOURCE ?? 'coding-agent';
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(source)) throw new Error('Invalid source name.');
  return { token, endpoint: endpoint.toString().replace(/\/+$/, ''), source,
    directory: join(env.NIU_AGENT_STATE_DIR ?? join(homedir(), '.niu', 'agent-observability'), hash(`${endpoint}|${token}`).slice(0, 32)) };
}
function span(id, kind, status, start, end) {
  return { id, kind, status, started_at_ms: start, ended_at_ms: end, requested_model: null, reported_model: null, charge_ref: null };
}
export function trace(config, { name, start, end, status = 'unknown', tool, toolStatus = status, recordId = randomUUID() }) {
  if (typeof name !== 'string' || !name.trim() || name.length > 120 || /[\x00-\x1f\x7f]/.test(name)) throw new Error('Use a short metadata-only run name.');
  const root = randomUUID(), child = randomUUID();
  return { name, record: { schema_version: 1, source: config.source, record_id: recordId, task_id: root, coverage: 'partial',
    spans: [span(root, 'task', status, start, end), ...(tool ? [span(child, 'tool_invocation', toolStatus, start, end)] : [])],
    links: tool ? [{ from: root, to: child, kind: 'contains' }] : [], outcomes: [] },
    span_names: { [root]: name, ...(tool ? { [child]: tool } : {}) } };
}
export async function send(config, value, fetcher = fetch) {
  const response = await fetcher(`${config.endpoint}/traces`, { method: 'POST', redirect: 'error',
    headers: { authorization: `Bearer ${config.token}`, 'content-type': 'application/json' },
    body: JSON.stringify(value), signal: AbortSignal.timeout(2000) });
  if (!response.ok) throw new Error(`Telemetry rejected (${response.status}).`);
  const receipt = await response.json();
  if (typeof receipt.created !== 'boolean' || typeof receipt.id !== 'string') throw new Error('Invalid telemetry receipt.');
  return receipt;
}
export async function privateDirectory(config) {
  await mkdir(config.directory, { recursive: true, mode: 0o700 });
  const info = await lstat(config.directory);
  if (!info.isDirectory() || info.isSymbolicLink() || (info.mode & 0o077)) throw new Error('Telemetry state requires a private directory.');
}
export async function deliver(config, value, fetcher = fetch) {
  try { await send(config, value, fetcher); return true; }
  catch {
    await privateDirectory(config);
    const pending = (await readdir(config.directory)).filter(name => name.startsWith('pending-'));
    if (pending.length >= 100) throw new Error('Telemetry queue is full. Flush or remove pending metadata.');
    try { await writeFile(join(config.directory, `pending-${hash(JSON.stringify(value))}.json`), JSON.stringify(value), { mode: 0o600, flag: 'wx' }); }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
    return false;
  }
}
export async function flush(config, fetcher = fetch) {
  await privateDirectory(config);
  let sent = 0;
  for (const name of (await readdir(config.directory)).sort()) {
    if (!/^pending-[a-f0-9-]+\.json$/.test(name)) continue;
    const file = join(config.directory, name), info = await lstat(file);
    if (!info.isFile() || info.isSymbolicLink() || info.size > 1_048_576) continue;
    await send(config, JSON.parse(await readFile(file, 'utf8')), fetcher);
    await unlink(file); sent++;
  }
  return sent;
}
export function claudeSettings() {
  return { hooks: Object.fromEntries(['PreToolUse', 'PostToolUse', 'PostToolUseFailure'].map(event => [event,
    [{ matcher: '*', hooks: [{ type: 'command', command: 'niu-agent-observability claude-hook', timeout: 5 }] }]])) };
}
/** Whitelist only correlation keys and the built-in tool category. Never read transcript_path or tool payloads. */
export async function claudeHook(config, input, { now = Date.now, fetcher = fetch } = {}) {
  if (!['PreToolUse', 'PostToolUse', 'PostToolUseFailure'].includes(input.hook_event_name)) return;
  if (typeof input.session_id !== 'string' || typeof input.tool_use_id !== 'string' || input.session_id.length > 256 || input.tool_use_id.length > 256) return;
  await privateDirectory(config);
  const file = join(config.directory, `start-${hash(`${input.session_id}|${input.tool_use_id}`)}.json`);
  if (input.hook_event_name === 'PreToolUse') {
    try { await writeFile(file, JSON.stringify({ start: now() }), { flag: 'wx', mode: 0o600 }); }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
    // Bound abandoned starts; never consult the agent's transcript to fill gaps.
    for (const name of await readdir(config.directory)) {
      if (!/^(start|end)-[a-f0-9]{64}\.json$/.test(name)) continue;
      const candidate = join(config.directory, name), info = await lstat(candidate);
      if (info.isFile() && now() - info.mtimeMs > 86_400_000) await unlink(candidate);
    }
    return;
  }
  let start = null;
  try {
    const info = await lstat(file);
    if (info.isFile() && !info.isSymbolicLink() && info.size < 1024) {
      const value = JSON.parse(await readFile(file, 'utf8'));
      if (Number.isSafeInteger(value.start) && value.start >= 0 && value.start <= now()) start = value.start;
    }
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const tool = supported.has(input.tool_name) ? input.tool_name : 'Other tool';
  const status = input.hook_event_name === 'PostToolUseFailure' ? (input.is_interrupt === true ? 'cancelled' : 'failed') : 'completed';
  let value = trace(config, { name: `Claude Code tool: ${tool}`, tool, start, end: now(), status: 'unknown', toolStatus: status,
    recordId: hash(`${input.session_id}|${input.tool_use_id}|${input.hook_event_name}`) });
  const finalFile = join(config.directory, `end-${value.record.record_id}.json`);
  try { await writeFile(finalFile, JSON.stringify(value), { flag: 'wx', mode: 0o600 }); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const info = await lstat(finalFile);
    if (!info.isFile() || info.isSymbolicLink() || info.size > 1_048_576) throw new Error('Invalid hook metadata state.');
    value = JSON.parse(await readFile(finalFile, 'utf8'));
  }
  // Root outcome is unknown: a tool failure does not establish the agent turn's outcome.
  await deliver(config, value, fetcher);
  await unlink(file).catch(error => { if (error.code !== 'ENOENT') throw error; });
}
