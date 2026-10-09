import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import test from 'node:test';

const id = '12345678-1234-1234-1234-123456789abc';
const example = new URL('../examples/inspect-guardrails.mjs', import.meta.url);

async function runExample(t, respond, withKey = true) {
  const calls = [];
  const server = createServer((req, res) => {
    calls.push({ method: req.method, url: req.url, authorization: req.headers.authorization });
    const result = respond(req.url);
    res.writeHead(result.status ?? 200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(result.body));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const child = spawn(process.execPath, [example.pathname], {
    env: {
      ...process.env,
      NIU_ADMIN_TOKEN: 'history-test-credential',
      NIU_ADMIN_BASE_URL: `http://127.0.0.1:${server.address().port}/admin/v1`,
      NIU_ORGANIZATION_ID: id,
      NIU_WORKSPACE_ID: id,
      NIU_KEY_ID: withKey ? id : '',
    },
  });
  let stdout = '', stderr = '';
  child.stdout.on('data', chunk => { stdout += chunk; });
  child.stderr.on('data', chunk => { stderr += chunk; });
  const code = await new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', resolve);
  });
  return { code, stdout, stderr, calls };
}

const revision = number => ({
  revision: number, policy_name: 'Saved policy', active: number === 3,
  actor_name: 'Workspace member', activated_at: '2026-10-03T00:00:00Z',
  restored_from_revision: null,
  internal_id: id, policy: { pattern: 'private-pattern' },
});
const assignment = (number, policyRevision) => ({
  assignment_revision: number, policy_revision: policyRevision,
  policy_name: policyRevision === null ? null : 'Saved policy',
  actor_name: 'Workspace member', created_at: '2026-10-03T00:00:00Z',
  internal_id: id,
});

test('packaged history example traverses exclusive policy and assignment cursors using only reads', async t => {
  const result = await runExample(t, url => {
    if (url.includes('/keys/')) return { body: url.includes('?')
      ? { data: [assignment(1, 1)], next_cursor: null }
      : { data: [assignment(3, null), assignment(2, 2)], next_cursor: 2 } };
    return { body: url.includes('?')
      ? { data: [revision(1)], next_cursor: null }
      : { data: [revision(3), revision(2)], next_cursor: 2 } };
  });
  assert.equal(result.code, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.deepEqual(output.workspacePolicyHistory.map(row => row.revision), [3, 2, 1]);
  assert.deepEqual(output.keyAssignmentHistory.map(row => row.revision), [3, 2, 1]);
  assert.equal(output.keyAssignmentHistory[0].policyRevision, null);
  assert.equal(result.calls.length, 4);
  assert.ok(result.calls.every(call => call.method === 'GET' && call.authorization === 'Bearer history-test-credential'));
  assert.ok(result.calls[1].url.endsWith('?before_revision=2'));
  assert.ok(result.calls[3].url.endsWith('?before_assignment_revision=2'));
  for (const secret of [id, 'history-test-credential', 'private-pattern', 'internal_id']) {
    assert.equal(result.stdout.includes(secret), false);
  }
});

test('history example leaves unrequested key history unknown and handles no recorded policy events', async t => {
  const result = await runExample(t, () => ({ body: { data: [], next_cursor: null } }), false);
  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), { workspacePolicyHistory: [], keyAssignmentHistory: null });
  assert.equal(result.calls.length, 1);
});

test('history example rejects looping cursors without reporting partial success', async t => {
  const result = await runExample(t, () => ({ body: { data: [revision(2)], next_cursor: 2 } }), false);
  assert.notEqual(result.code, 0);
  assert.equal(result.calls.length, 2);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /non-descending cursor/);
});

test('history example does not turn access rejection into empty history', async t => {
  const result = await runExample(t, () => ({ status: 403, body: { error: { message: 'Workspace access denied' } } }), false);
  assert.notEqual(result.code, 0);
  assert.equal(result.calls.length, 1);
  assert.equal(result.stdout, '');
});
