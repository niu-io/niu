import assert from 'node:assert/strict';
import test from 'node:test';
import {
  aiderConnector,
  claudeCodeConnector,
  connectorManifests,
  createAiderInvocation,
} from '../dist/index.js';
import { claudeTelemetryEnvironment } from '../bin/claude-telemetry-env.mjs';

const aiderControls = {
  config: '/tmp/niu/aider.yml',
  envFile: '/tmp/niu/empty.env',
  modelSettings: '/tmp/niu/model-settings.yml',
  inputHistory: '/private/niu/aider.input.history',
  chatHistory: '/private/niu/aider.chat.history.md',
};

test('Aider route pins main, weak, and editor requests to the scoped Niu alias', () => {
  const invocation = createAiderInvocation({
    gatewayBaseURL: 'https://gateway.example.test/niu/v1/',
    modelAlias: 'team/fast',
    apiKey: 'niu_project_secret',
    controlFiles: aiderControls,
    args: ['--message', 'hello'],
    baseEnv: {
      PATH: '/usr/bin', EXISTING: 'kept', NIU_API_KEY: 'niu_project_secret',
      NIU_COLLECTOR_KEY: 'niu_collector_secret',
      OPENAI_API_BASE: 'https://other.example/v1', OPENAI_API_KEY: 'other-key',
      AIDER_OPENAI_API_BASE: 'https://other.example/v1', AIDER_OPENAI_API_KEY: 'other-key',
      AIDER_OPENAI_API_TYPE: 'azure', AIDER_MODEL: 'other/model',
      AIDER_WEAK_MODEL: 'other/weak', AIDER_EDITOR_MODEL: 'other/editor',
      AIDER_SHOW_MODEL_WARNINGS: 'true',
      AIDER_SET_ENV: 'OPENAI_API_BASE=https://other.example/v1',
      AIDER_API_KEY: 'openai=other-key', AIDER_ALIAS: 'team/fast:other/model',
      AIDER_ENV_FILE: '/repo/.env', AIDER_MODEL_SETTINGS_FILE: '/repo/models.yml',
      AIDER_INPUT_HISTORY_FILE: '/repo/history', AIDER_CHAT_HISTORY_FILE: '/repo/chat-history',
    },
  });
  assert.equal(invocation.command, 'aider');
  assert.deepEqual(invocation.args, [
    '--config', aiderControls.config,
    '--env-file', aiderControls.envFile,
    '--model-settings-file', aiderControls.modelSettings,
    '--input-history-file', aiderControls.inputHistory,
    '--chat-history-file', aiderControls.chatHistory,
    '--openai-api-base', 'https://gateway.example.test/niu/v1',
    '--no-show-release-notes',
    '--no-show-model-warnings',
    '--model', 'openai/team/fast',
    '--weak-model', 'openai/team/fast',
    '--editor-model', 'openai/team/fast',
    '--message', 'hello',
  ]);
  assert.equal(invocation.env.OPENAI_API_BASE, 'https://gateway.example.test/niu/v1');
  assert.equal(invocation.env.OPENAI_API_KEY, 'niu_project_secret');
  assert.equal(invocation.env.AIDER_OPENAI_API_BASE, 'https://gateway.example.test/niu/v1');
  assert.equal(invocation.env.AIDER_OPENAI_API_KEY, 'niu_project_secret');
  assert.equal(invocation.env.AIDER_MODEL, 'openai/team/fast');
  assert.equal(invocation.env.AIDER_WEAK_MODEL, 'openai/team/fast');
  assert.equal(invocation.env.AIDER_EDITOR_MODEL, 'openai/team/fast');
  assert.equal(invocation.env.AIDER_SHOW_MODEL_WARNINGS, 'false');
  assert.equal(invocation.env.AIDER_ENV_FILE, aiderControls.envFile);
  assert.equal(invocation.env.AIDER_MODEL_SETTINGS_FILE, aiderControls.modelSettings);
  assert.equal(invocation.env.AIDER_INPUT_HISTORY_FILE, aiderControls.inputHistory);
  assert.equal(invocation.env.AIDER_CHAT_HISTORY_FILE, aiderControls.chatHistory);
  assert.equal(invocation.env.AIDER_GITIGNORE, 'false');
  assert.equal(invocation.env.AIDER_CHECK_UPDATE, 'false');
  assert.equal(invocation.env.AIDER_SHOW_RELEASE_NOTES, 'false');
  assert.equal(invocation.env.NIU_API_KEY, undefined);
  assert.equal(invocation.env.NIU_COLLECTOR_KEY, undefined);
  assert.equal(invocation.env.AIDER_SET_ENV, undefined);
  assert.equal(invocation.env.AIDER_API_KEY, undefined);
  assert.equal(invocation.env.AIDER_ALIAS, undefined);
  assert.equal(invocation.env.PATH, '/usr/bin');
  assert.equal(invocation.env.EXISTING, 'kept');
  assert.equal(JSON.stringify(invocation.args).includes('niu_project_secret'), false);
});

test('Claude collection changes only telemetry settings and does not pass its Niu key to the agent', () => {
  const environment = claudeTelemetryEnvironment({
    ANTHROPIC_API_KEY: 'provider-session-secret',
    NIU_COLLECTOR_KEY: 'niu_collector_private',
    OTEL_EXPORTER_OTLP_ENDPOINT: 'https://other-collector.example/v1/logs',
    OTEL_EXPORTER_OTLP_HEADERS: 'Authorization=Bearer other-token',
    OTEL_LOG_USER_PROMPTS: '1',
  }, {
    url: 'http://127.0.0.1:43187/v1/logs',
    authorization: 'Bearer local-only-secret',
  });

  assert.equal(environment.ANTHROPIC_API_KEY, 'provider-session-secret');
  assert.equal(environment.NIU_COLLECTOR_KEY, undefined);
  assert.equal(environment.OTEL_EXPORTER_OTLP_ENDPOINT, undefined);
  assert.equal(environment.OTEL_EXPORTER_OTLP_HEADERS, undefined);
  assert.equal(environment.OTEL_EXPORTER_OTLP_LOGS_ENDPOINT, 'http://127.0.0.1:43187/v1/logs');
  assert.equal(environment.OTEL_EXPORTER_OTLP_LOGS_HEADERS, 'Authorization=Bearer local-only-secret');
  assert.equal(environment.OTEL_LOG_USER_PROMPTS, '0');
  assert.equal(environment.OTEL_METRICS_EXPORTER, 'none');
});

test('Aider route rejects insecure remote URLs and embedded credentials', () => {
  for (const gatewayBaseURL of [
    'http://gateway.example.test/v1',
    'https://user:pass@gateway.example.test/v1',
    'https://gateway.example.test/v1?token=value',
    'https://gateway.example.test/api',
  ]) {
    assert.throws(() => createAiderInvocation({ gatewayBaseURL, modelAlias: 'fast', apiKey: 'key' }));
  }
  assert.doesNotThrow(() => createAiderInvocation({
    gatewayBaseURL: 'http://127.0.0.1:2555/v1', modelAlias: 'fast', apiKey: 'key', controlFiles: aiderControls,
  }));
});

test('Aider cannot override the Niu endpoint, scoped key, or selected aliases', () => {
  for (const args of [
    ['--model', 'direct/openai'],
    ['--weak-model=direct/openai'],
    ['--openai-api-base', 'https://provider.example/v1'],
    ['--openai-api-key', 'provider-secret'],
    ['--api-key', 'provider=secret'],
    ['--config', '/tmp/other.yml'],
    ['-c', '/tmp/other.yml'],
    ['--env-file', '/tmp/.env'],
    ['--model-settings-file', '/tmp/models.yml'],
    ['--set-env', 'OPENAI_API_BASE=https://provider.example/v1'],
    ['--show-model-warnings'],
  ]) {
    assert.throws(() => createAiderInvocation({
      gatewayBaseURL: 'https://gateway.example.test/v1', modelAlias: 'fast', apiKey: 'niu-key', args, controlFiles: aiderControls,
    }), /controlled by the Niu route connector/);
  }
});

test('connector manifests keep subscription eligibility and activity coverage explicit', () => {
  assert.deepEqual(connectorManifests.map(item => item.id), ['aider', 'claude-code']);
  assert.equal(aiderConnector.modes[0].subscriptionAuthentication, 'not_supported');
  assert.match(aiderConnector.modes[0].notCaptured.join(' '), /accepted outcomes/);
  assert.equal(claudeCodeConnector.modes[0].mode, 'collect');
  assert.equal(aiderConnector.testedVersion, '0.86.2');
  assert.equal(claudeCodeConnector.testedVersion, '2.1.211');
  assert.equal(claudeCodeConnector.modes[0].testedVersion, '2.1.211');
  assert.match(claudeCodeConnector.modes[0].billing, /not a settled provider charge/);
});
