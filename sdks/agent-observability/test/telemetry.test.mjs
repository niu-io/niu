import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { configuration, claudeHook, trace, deliver, flush, claudeSettings } from '../src/telemetry.mjs';

async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'niu-telemetry-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return configuration({ NIU_AGENT_TOKEN: 'test-only', NIU_AGENT_ENDPOINT: 'http://localhost:2566/admin/v1/agent-observability', NIU_AGENT_SOURCE: 'coding-agent', NIU_AGENT_STATE_DIR: dir });
}
test('endpoint requires HTTPS except loopback and isolates credential queues', () => {
  assert.throws(() => configuration({ NIU_AGENT_TOKEN: 'test', NIU_AGENT_ENDPOINT: 'http://example.com' }));
  assert.throws(() => configuration({ NIU_AGENT_TOKEN: 'test', NIU_AGENT_ENDPOINT: 'https://user:password@example.com' }));
  assert.notEqual(configuration({ NIU_AGENT_TOKEN: 'one' }).directory, configuration({ NIU_AGENT_TOKEN: 'two' }).directory);
  assert.equal(claudeSettings().hooks.PreToolUse[0].hooks[0].command, 'niu-agent-observability claude-hook');
});
test('hook pairing retains only metadata, failed step keeps run outcome unknown, and duplicates are stable', async t => {
  const config = await fixture(t), values = []; let time = 10;
  const fetcher = async (url, options) => { assert.equal(options.redirect, 'error'); values.push(JSON.parse(options.body)); return Response.json({ id: 'internal', created: true }); };
  const input = { session_id: 'session-private', tool_use_id: 'call-private', tool_name: 'Bash', transcript_path: '/private/not-opened', tool_input: { command: 'secret input' }, tool_response: 'secret output', error: 'secret error' };
  await claudeHook(config, { ...input, hook_event_name: 'PreToolUse' }, { now: () => time, fetcher }); time = 25;
  await claudeHook(config, { ...input, hook_event_name: 'PostToolUseFailure' }, { now: () => time, fetcher }); time = 35;
  await claudeHook(config, { ...input, hook_event_name: 'PostToolUseFailure' }, { now: () => time, fetcher });
  assert.deepEqual(values[0], values[1]);
  assert.equal(values[0].record.spans[0].status, 'unknown'); assert.equal(values[0].record.spans[1].status, 'failed');
  assert.equal(values[0].record.spans[1].started_at_ms, 10); assert.equal(values[0].record.spans[1].ended_at_ms, 25);
  const persisted = (await Promise.all((await readdir(config.directory)).map(name => readFile(join(config.directory, name), 'utf8')))).join('');
  for (const secret of ['secret input', 'secret output', 'secret error', 'session-private', 'call-private', '/private']) assert.ok(!JSON.stringify(values).includes(secret) && !persisted.includes(secret));
});
test('missing pre-event remains untimed and custom tool names are omitted', async t => {
  const config = await fixture(t); let value;
  await claudeHook(config, { hook_event_name: 'PostToolUse', session_id: 's', tool_use_id: 'c', tool_name: 'private-customer-tool' }, { fetcher: async (_, options) => { value = JSON.parse(options.body); return Response.json({ id: 'internal', created: true }); } });
  assert.equal(value.record.spans[1].started_at_ms, null); assert.equal(value.name, 'Claude Code tool: Other tool');
});
test('offline queue preserves identical payload, rejects redirects, and is deleted only after acceptance', async t => {
  const config = await fixture(t), value = trace(config, { name: 'Verification', start: 1, end: 2 });
  const offline = async () => { throw new Error('offline'); };
  assert.equal(await deliver(config, value, offline), false); await deliver(config, value, offline);
  assert.equal((await readdir(config.directory)).length, 1);
  await assert.rejects(flush(config, async () => new Response('', { status: 403 })));
  assert.equal((await readdir(config.directory)).length, 1);
  assert.equal(await flush(config, async (_, options) => { assert.deepEqual(JSON.parse(options.body), value); return Response.json({ id: 'internal', created: false }); }), 1);
  assert.equal((await readdir(config.directory)).length, 0);
});
test('hook failures are silent and do not change agent decisions', () => {
  const child = spawnSync(process.execPath, ['bin/niu-agent-observability.mjs', 'claude-hook'], { cwd: new URL('..', import.meta.url), input: 'invalid secret input', env: { PATH: process.env.PATH }, encoding: 'utf8' });
  assert.equal(child.status, 0); assert.equal(child.stdout, ''); assert.equal(child.stderr, '');
});
test('process wrapper preserves exit status and excludes command arguments from accepted telemetry', async t => {
  const config = await fixture(t), values = [];
  const server = createServer(async (request, response) => {
    let body = ''; for await (const chunk of request) body += chunk;
    values.push(JSON.parse(body)); response.setHeader('content-type', 'application/json'); response.end(JSON.stringify({ id: 'receipt', created: true }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); t.after(() => new Promise(resolve => server.close(resolve)));
  const child = spawn(process.execPath, ['bin/niu-agent-observability.mjs', 'run', '--', process.execPath, '-e', '/* private command argument */ process.exit(7)'], {
    cwd: new URL('..', import.meta.url), env: { ...process.env, NIU_AGENT_TOKEN: 'test-only', NIU_AGENT_ENDPOINT: `http://127.0.0.1:${server.address().port}/admin/v1/agent-observability`, NIU_AGENT_SOURCE: config.source, NIU_AGENT_STATE_DIR: config.directory }, stdio: 'ignore',
  });
  assert.equal(await new Promise(resolve => child.once('exit', resolve)), 7);
  assert.equal(values.length, 1); assert.equal(values[0].record.spans[0].status, 'failed');
  assert.equal(values[0].record.coverage, 'partial'); assert.ok(!JSON.stringify(values).includes('private command argument'));
});
