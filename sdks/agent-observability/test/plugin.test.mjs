import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, readdir, rm, lstat, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'node:http';
import { spawnSync } from 'node:child_process';
import { connect, readConnection, status, enableCodex, disableCodex, disconnect } from '../src/connection.mjs';
import { codexHook } from '../src/codex-hooks.mjs';

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'niu-collector-plugin-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const env = { NIU_COLLECTOR_HOME: join(directory, 'collector'), NIU_AGENT_TOKEN: 'niu_agent_test_only', NIU_AGENT_ENDPOINT: 'http://localhost:1/admin/v1/agent-observability', NIU_COLLECTOR_CODEX_CONFIG_DIR: join(directory, 'codex'), PATH: process.env.PATH };
  const fetcher = async () => Response.json({ id: 'receipt', created: true });
  return { directory, env, fetcher };
}
test('connection requires consent, verifies access, protects keys and disconnects locally', async t => {
  const { env, fetcher } = await fixture(t);
  await assert.rejects(connect(env, { fetcher }), /consent/);
  await assert.rejects(connect(env, { consent: true, fetcher: async () => new Response('', { status: 401 }) }));
  assert.equal(await readConnection(env), null);
  await connect(env, { consent: true, fetcher });
  assert.equal((await lstat(join(env.NIU_COLLECTOR_HOME, 'connection.json'))).mode & 0o077, 0);
  assert.equal((await readConnection(env)).config.source, 'codex');
  assert.doesNotMatch(JSON.stringify(await status(env)), /test_only|secret|token|endpoint/);
  await assert.rejects(connect(env, { consent: true, fetcher }), /Disconnect/);
  await disconnect(env);
  assert.equal(await readConnection(env), null);
});
test('Codex hooks pair duration, deduplicate, omit private content and retain unknown outcomes', async t => {
  const { env, fetcher } = await fixture(t); await connect(env, { consent: true, fetcher });
  const { config } = await readConnection(env), values = [];
  const sender = async (_, options) => { values.push(JSON.parse(options.body)); return Response.json({ id: 'receipt', created: true }); };
  const input = { session_id: 'private-session', tool_use_id: 'private-call', tool_name: 'Bash', transcript_path: '/private/never-open', cwd: '/private/work', tool_input: { command: 'PRIVATE COMMAND' }, tool_response: 'PRIVATE OUTPUT' };
  await codexHook(config, { ...input, hook_event_name: 'SessionStart' }, { now: () => 5, fetcher: sender });
  await codexHook(config, { ...input, hook_event_name: 'PreToolUse' }, { now: () => 10, fetcher: sender });
  await codexHook(config, { ...input, hook_event_name: 'PostToolUse' }, { now: () => 20, fetcher: sender });
  await codexHook(config, { ...input, hook_event_name: 'PostToolUse' }, { now: () => 30, fetcher: sender });
  await codexHook(config, { ...input, hook_event_name: 'SessionEnd' }, { now: () => 40, fetcher: sender });
  assert.deepEqual(values[0], values[1]);
  assert.equal(values[0].record.spans[1].started_at_ms, 10);
  assert.equal(values[0].record.spans[1].ended_at_ms, 20);
  assert.equal(values[0].record.spans[1].status, 'unknown');
  assert.equal(values[2].record.spans[0].started_at_ms, 5);
  assert.equal(values[2].record.spans[0].status, 'unknown');
  const disk = (await Promise.all((await readdir(config.directory)).map(file => readFile(join(config.directory, file), 'utf8')))).join('');
  assert.doesNotMatch(JSON.stringify(values) + disk, /private-session|private-call|PRIVATE|\/private/);
});
test('plugin hook fails open without consent or with malformed input', () => {
  const result = spawnSync(process.execPath, ['bin/niu-agent-observability.mjs', 'codex-hook'], { cwd: new URL('..', import.meta.url), input: 'invalid PRIVATE input', env: { PATH: process.env.PATH }, encoding: 'utf8' });
  assert.equal(result.status, 0); assert.equal(result.stdout, ''); assert.equal(result.stderr, '');
});
test('native setup preserves unrelated Codex configuration and rejects existing exporters', async t => {
  const { env, fetcher, directory } = await fixture(t); await connect(env, { consent: true, fetcher });
  // A loopback test receiver lets setup qualify state management without starting a daemon.
  const connection = await readConnection(env);
  const server = createServer((request, response) => { response.setHeader('content-type', 'application/json'); response.end(JSON.stringify({ collector: 'niu-collector' })); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const config = JSON.parse(await readFile(join(env.NIU_COLLECTOR_HOME, 'connection.json'), 'utf8'));
  config.port = server.address().port;
  await writeFile(join(env.NIU_COLLECTOR_HOME, 'connection.json'), JSON.stringify(config), { mode: 0o600 });
  const { mkdir } = await import('node:fs/promises'); await mkdir(env.NIU_COLLECTOR_CODEX_CONFIG_DIR);
  const file = join(env.NIU_COLLECTOR_CODEX_CONFIG_DIR, 'config.toml');
  const original = 'model = "original-model"\n[features]\nhooks = true';
  await writeFile(file, original);
  await assert.rejects(enableCodex(env), /consent/);
  assert.equal(await enableCodex(env, { consent: true }), true);
  const enabled = await readFile(file, 'utf8');
  assert.ok(enabled.startsWith(original)); assert.match(enabled, /log_user_prompt = false/);
  await writeFile(file, enabled + '\n# user change\n');
  await disableCodex(env);
  assert.equal(await readFile(file, 'utf8'), original + '\n# user change\n');
  await writeFile(file, '[otel]\nexporter = "none"\n');
  await assert.rejects(enableCodex(env, { consent: true }), /already has telemetry/);
  await rm(file); await symlink(join(directory, 'absent'), file);
  await assert.rejects(enableCodex(env, { consent: true }), /regular file/);
  assert.ok(connection.secret);
});
test('marketplace and both manifests include supported hooks and package resources', async () => {
  const root = new URL('..', import.meta.url);
  const manifest = JSON.parse(await readFile(new URL('plugin.json', root), 'utf8'));
  const legacy = JSON.parse(await readFile(new URL('.codex-plugin/plugin.json', root), 'utf8'));
  assert.equal(manifest.name, 'niu-collector'); assert.equal(legacy.name, manifest.name);
  const hooks = JSON.parse(await readFile(new URL('hooks/hooks.json', root), 'utf8'));
  assert.deepEqual(Object.keys(hooks.hooks), ['SessionStart', 'SessionEnd', 'PreToolUse', 'PostToolUse']);
  assert.equal(hooks.hooks.SessionEnd[0].hooks[0].timeout, 3);
  for (const items of Object.values(hooks.hooks)) assert.match(items[0].hooks[0].command, /\$\{PLUGIN_ROOT\}/);
});
