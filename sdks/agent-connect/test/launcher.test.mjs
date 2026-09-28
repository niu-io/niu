import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import test from 'node:test';
import { delimiter, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const launcher = fileURLToPath(new URL('../bin/niu-agent-connect.mjs', import.meta.url));

test('Aider launcher pins the Niu route and isolates project provider config and history', async () => {
  const root = await mkdtemp(join(tmpdir(), 'niu-agent-launcher-'));
  const bin = join(root, 'bin');
  const home = join(root, 'home');
  const cwd = join(root, 'project');
  const capturePath = join(root, 'capture.json');
  await Promise.all([bin, home, cwd].map(path => mkdir(path, { recursive: true })));
  const fakeAider = join(bin, 'aider');
  await writeFile(fakeAider, `#!/usr/bin/env node
const { readFileSync, writeFileSync } = require('node:fs');
const args = process.argv.slice(2);
if (args[0] === '--version') {
  process.stdout.write(process.env.AIDER_TEST_VERSION || '0.86.2');
  process.exit(0);
}
const value = {
  args,
  environment: {
    openaiBase: process.env.AIDER_OPENAI_API_BASE,
    openaiKey: process.env.AIDER_OPENAI_API_KEY,
    standardBase: process.env.OPENAI_API_BASE,
    standardKey: process.env.OPENAI_API_KEY,
    collectorKey: process.env.NIU_COLLECTOR_KEY ?? null,
    routeOverrides: process.env.AIDER_SET_ENV ?? null,
    gitignore: process.env.AIDER_GITIGNORE,
    checkUpdate: process.env.AIDER_CHECK_UPDATE,
    inputHistory: process.env.AIDER_INPUT_HISTORY_FILE,
    chatHistory: process.env.AIDER_CHAT_HISTORY_FILE,
    modelWarnings: process.env.AIDER_SHOW_MODEL_WARNINGS,
    releaseNotes: process.env.AIDER_SHOW_RELEASE_NOTES,
  },
  config: readFileSync(args[args.indexOf('--config') + 1], 'utf8'),
  envFile: readFileSync(args[args.indexOf('--env-file') + 1], 'utf8'),
  modelSettings: readFileSync(args[args.indexOf('--model-settings-file') + 1], 'utf8'),
};
writeFileSync(process.env.NIU_TEST_CAPTURE, JSON.stringify(value));
`);
  await chmod(fakeAider, 0o700);

  try {
    const result = await runLauncher([
      launcher, 'aider', 'route', '--gateway', 'https://gateway.example.test/niu/v1', '--model', 'team/fast', '--', '--message', 'local prompt',
    ], {
      ...process.env,
      PATH: `${bin}${delimiter}${process.env.PATH ?? ''}`,
      HOME: home,
      LOCALAPPDATA: home,
      NIU_API_KEY: 'niu_project_test_secret',
      NIU_COLLECTOR_KEY: 'niu_collector_test_secret',
      NIU_TEST_CAPTURE: capturePath,
      AIDER_TEST_VERSION: '0.86.2',
      OPENAI_API_BASE: 'https://provider.example/v1',
      OPENAI_API_KEY: 'provider_key',
      AIDER_OPENAI_API_BASE: 'https://provider.example/v1',
      AIDER_OPENAI_API_KEY: 'provider_key',
      AIDER_SET_ENV: 'OPENAI_API_BASE=https://provider.example/v1',
      AIDER_API_KEY: 'openai=provider_key',
      AIDER_ENV_FILE: join(cwd, '.env'),
      AIDER_MODEL_SETTINGS_FILE: join(cwd, 'models.yml'),
      AIDER_INPUT_HISTORY_FILE: join(cwd, '.aider.input.history'),
      AIDER_CHAT_HISTORY_FILE: join(cwd, '.aider.chat.history.md'),
    }, { cwd });

    assert.equal(result.code, 0, result.stderr);
    const captured = JSON.parse(await readFile(capturePath, 'utf8'));
    assert.equal(captured.environment.openaiBase, 'https://gateway.example.test/niu/v1');
    assert.equal(captured.environment.openaiKey, 'niu_project_test_secret');
    assert.equal(captured.environment.standardBase, 'https://gateway.example.test/niu/v1');
    assert.equal(captured.environment.standardKey, 'niu_project_test_secret');
    assert.equal(captured.environment.collectorKey, null);
    assert.equal(captured.environment.routeOverrides, null);
    assert.equal(captured.environment.gitignore, 'false');
    assert.equal(captured.environment.checkUpdate, 'false');
    assert.equal(captured.environment.modelWarnings, 'false');
    assert.equal(captured.environment.releaseNotes, 'false');
    assert.deepEqual(captured.args.slice(-2), ['--message', 'local prompt']);
    assert.equal(captured.args.includes('niu_project_test_secret'), false);
    assert.equal(captured.args.includes('niu_collector_test_secret'), false);
    assert.equal(captured.args[captured.args.indexOf('--openai-api-base') + 1], 'https://gateway.example.test/niu/v1');
    assert.equal(captured.args[captured.args.indexOf('--model') + 1], 'openai/team/fast');
    assert.ok(captured.args.includes('--no-show-model-warnings'));
    assert.ok(captured.args.includes('--no-show-release-notes'));
    assert.equal(captured.config, '{}\n');
    assert.equal(captured.envFile, '');
    assert.equal(captured.modelSettings, '{}\n');
    assert.ok(captured.environment.inputHistory.startsWith(home));
    assert.ok(captured.environment.chatHistory.startsWith(home));
    assert.ok(!captured.environment.inputHistory.startsWith(cwd));
    assert.equal((await stat(captured.environment.inputHistory)).mode & 0o777, 0o600);
    assert.equal(existsSync(captured.args[captured.args.indexOf('--config') + 1]), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('Aider launcher refuses versions without end-to-end verification before reading a key', async () => {
  const root = await mkdtemp(join(tmpdir(), 'niu-agent-version-'));
  const bin = join(root, 'bin');
  await mkdir(bin, { recursive: true });
  const fakeAider = join(bin, 'aider');
  await writeFile(fakeAider, '#!/bin/sh\nprintf "0.90.0\\n"\n');
  await chmod(fakeAider, 0o700);
  try {
    const result = await runLauncher([
      launcher, 'aider', 'route', '--gateway', 'https://gateway.example.test/v1', '--model', 'fast',
    ], { ...process.env, PATH: `${bin}${delimiter}${process.env.PATH ?? ''}`, HOME: root, NIU_API_KEY: undefined });
    assert.equal(result.code, 2);
    assert.match(result.stderr, /Aider 0\.90\.0 is not verified/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('Claude collection refuses unverified versions before reading an activity key or starting the agent', async () => {
  const root = await mkdtemp(join(tmpdir(), 'niu-claude-version-'));
  const bin = join(root, 'bin');
  const startedPath = join(root, 'started');
  await mkdir(bin, { recursive: true });
  const fakeClaude = join(bin, 'claude');
  await writeFile(fakeClaude, `#!/bin/sh
if [ "$1" = "--version" ]; then
  printf "2.1.212\\n"
  exit 0
fi
touch "${startedPath}"
`);
  await chmod(fakeClaude, 0o700);
  try {
    const result = await runLauncher([
      launcher, 'claude', 'collect', '--gateway', 'https://gateway.example.test',
      '--organization', 'org-test', '--project', 'project-test',
    ], { ...process.env, PATH: `${bin}${delimiter}${process.env.PATH ?? ''}`, HOME: root, NIU_COLLECTOR_KEY: undefined });
    assert.equal(result.code, 2);
    assert.match(result.stderr, /Claude Code 2\.1\.212 is not verified/);
    assert.doesNotMatch(result.stderr, /Niu activity key/);
    assert.equal(existsSync(startedPath), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

function runLauncher(args, env, options = {}) {
  return new Promise(resolve => {
    const child = spawn(process.execPath, args, { ...options, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', chunk => { stdout += chunk; });
    child.stderr.setEncoding('utf8').on('data', chunk => { stderr += chunk; });
    child.once('error', error => resolve({ code: 127, stdout, stderr: `${stderr}${error.message}` }));
    child.once('close', code => resolve({ code, stdout, stderr }));
  });
}
