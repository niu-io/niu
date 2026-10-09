import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import test from 'node:test';

async function run(t, status, body) {
  const calls = [];
  const server = createServer((req, res) => {
    calls.push({ path: req.url, method: req.method });
    assert.equal(req.headers.authorization, 'Bearer key-example-private');
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const child = spawn(process.execPath, [new URL('../examples/inspect-keys.mjs', import.meta.url).pathname], {
    env: { ...process.env, NIU_ADMIN_TOKEN: 'key-example-private',
      NIU_ADMIN_BASE_URL: `http://127.0.0.1:${server.address().port}/admin/v1`,
      NIU_ORGANIZATION_ID: '12345678-1234-1234-1234-123456789abc',
      NIU_WORKSPACE_ID: '22345678-1234-1234-1234-123456789abc' },
  });
  let stdout = '', stderr = '';
  child.stdout.on('data', chunk => { stdout += chunk; });
  child.stderr.on('data', chunk => { stderr += chunk; });
  const code = await new Promise((resolve, reject) => { child.on('error', reject); child.on('close', resolve); });
  return { code, stdout, stderr, calls };
}

test('key example prints scoped activity without credentials or internal identifiers', async t => {
  const key = { id: '33345678-1234-1234-1234-123456789abc', name: 'Application',
    allowed_models: ['fast'], expires_at_ms: 1_800_000_000_000, revoked: false, expired: false,
    token: 'unexpected-private-token', api_key_hash: 'unexpected-private-hash' };
  const result = await run(t, 200, { data: [
    { ...key, last_used_at_ms: 1_700_000_000_000 },
    { ...key, name: 'Unused', last_used_at_ms: null },
    { ...key, name: 'Unavailable', revoked: true, expired: true },
  ] });
  assert.equal(result.code, 0, result.stderr);
  const { keys } = JSON.parse(result.stdout);
  assert.equal(keys[0].lastDispatchAt, '2023-11-14T22:13:20.000Z');
  assert.equal(keys[1].lastDispatchAt, null);
  assert.equal(keys[1].activityAvailable, true);
  assert.equal(keys[2].activityAvailable, false);
  assert.equal(keys[2].status, 'Revoked');
  assert.deepEqual(result.calls, [{ method: 'GET', path: '/admin/v1/organizations/12345678-1234-1234-1234-123456789abc/projects/22345678-1234-1234-1234-123456789abc/keys' }]);
  for (const hidden of [key.id, key.token, key.api_key_hash, 'key-example-private']) {
    assert.ok(!(result.stdout + result.stderr).includes(hidden));
  }
});

test('key example does not present authorization failure as an empty workspace', async t => {
  const result = await run(t, 403, { error: { message: 'private upstream body with credential' } });
  assert.notEqual(result.code, 0);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /HTTP 403/);
  assert.ok(!result.stderr.includes('private upstream body'));
});

test('key example rejects malformed metadata without partial output', async t => {
  const result = await run(t, 200, { data: [{ name: 'Malformed', expires_at_ms: 'not a timestamp' }] });
  assert.notEqual(result.code, 0);
  assert.equal(result.stdout, '');
});
