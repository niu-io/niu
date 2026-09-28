export type AgentMode = 'route' | 'collect';
export type ConnectorStatus = 'prototype' | 'verified' | 'unavailable';

export type ConnectorModeManifest = {
  mode: AgentMode;
  status: ConnectorStatus;
  endpoint?: string;
  testedVersion?: string;
  billing: string;
  subscriptionAuthentication: 'supported' | 'not_supported' | 'unverified';
  captured: string[];
  notCaptured: string[];
  optIns: string[];
  documentation: string[];
};

export type ConnectorManifestV1 = {
  schemaVersion: 1;
  id: string;
  name: string;
  agent: string;
  testedVersion: string | null;
  status: ConnectorStatus;
  modes: ConnectorModeManifest[];
};

/** Aider's documented OpenAI-compatible route. No agent subscription path is claimed. */
export const aiderConnector: ConnectorManifestV1 = {
  schemaVersion: 1,
  id: 'aider',
  name: 'Aider',
  agent: 'aider',
  testedVersion: '0.86.2',
  status: 'prototype',
  modes: [{
    mode: 'route',
    status: 'prototype',
    endpoint: 'openai-compatible',
    testedVersion: '0.86.2',
    billing: 'Niu configured provider account; API billing applies',
    subscriptionAuthentication: 'not_supported',
    captured: ['Niu gateway request and attempt activity', 'Provider-reported usage when available'],
    notCaptured: ['Aider tool calls', 'Aider retries as a task-level sequence', 'Validation or accepted outcomes'],
    optIns: ['The user chooses a workspace, project, model alias, and project-scoped Niu key'],
    documentation: ['https://aider.chat/docs/llms/openai-compat.html'],
  }],
};

/** Claude Code collection uses its documented, opt-in OpenTelemetry exporter. */
export const claudeCodeConnector: ConnectorManifestV1 = {
  schemaVersion: 1,
  id: 'claude-code',
  name: 'Claude Code',
  agent: 'claude',
  testedVersion: '2.1.211',
  status: 'prototype',
  modes: [{
    mode: 'collect',
    status: 'prototype',
    testedVersion: '2.1.211',
    billing: 'Reported by Claude Code; not a settled provider charge',
    subscriptionAuthentication: 'supported',
    captured: ['Opt-in API request and error events', 'Model and usage estimates when emitted', 'Tool timing and status metadata'],
    notCaptured: ['Gateway traffic', 'Prompt or response content', 'Tool arguments or output', 'Validator or human acceptance unless separately recorded'],
    optIns: ['The user explicitly enables OpenTelemetry and selects the Niu workspace/project'],
    documentation: ['https://code.claude.com/docs/en/monitoring-usage'],
  }],
};

export const connectorManifests: readonly ConnectorManifestV1[] = [
  aiderConnector,
  claudeCodeConnector,
];

export { ClaudeCodeOtelCollector } from './claude-code.js';
export type { ExternalExecutionRecordV1 } from './claude-code.js';

export type AiderInvocationInput = {
  gatewayBaseURL: string;
  modelAlias: string;
  apiKey: string;
  /** Private control files created by the launcher to isolate Aider routing config. */
  controlFiles: AiderControlFiles;
  args?: string[];
  baseEnv?: Record<string, string | undefined>;
};

export type AiderControlFiles = {
  config: string;
  envFile: string;
  modelSettings: string;
  inputHistory: string;
  chatHistory: string;
};

export type AiderInvocation = {
  command: 'aider';
  args: string[];
  env: Record<string, string | undefined>;
};

/** Build a session-only invocation. The Niu key is placed only in child env, never argv or a file. */
export function createAiderInvocation(input: AiderInvocationInput): AiderInvocation {
  if (!input.apiKey.trim()) throw new Error('A Niu project key is required');
  const gatewayBaseURL = validateGatewayBaseURL(input.gatewayBaseURL);
  const modelAlias = validateModelAlias(input.modelAlias);
  const model = `openai/${modelAlias}`;
  const args = input.args ?? [];
  assertNoRouteOverrides(args);
  const env = { ...(input.baseEnv ?? {}) };
  for (const name of [
    'NIU_API_KEY',
    'NIU_COLLECTOR_KEY',
    'OPENAI_API_BASE',
    'OPENAI_API_KEY',
    'OPENAI_API_TYPE',
    'OPENAI_API_VERSION',
    'OPENAI_API_DEPLOYMENT_ID',
    'OPENAI_ORGANIZATION',
    'AIDER_OPENAI_API_BASE',
    'AIDER_OPENAI_API_KEY',
    'AIDER_OPENAI_API_TYPE',
    'AIDER_OPENAI_API_VERSION',
    'AIDER_OPENAI_API_DEPLOYMENT_ID',
    'AIDER_OPENAI_ORGANIZATION_ID',
    'AIDER_MODEL',
    'AIDER_WEAK_MODEL',
    'AIDER_EDITOR_MODEL',
    'AIDER_SHOW_MODEL_WARNINGS',
    'AIDER_API_KEY',
    'AIDER_SET_ENV',
    'AIDER_ALIAS',
    'AIDER_ENV_FILE',
    'AIDER_MODEL_SETTINGS_FILE',
    'AIDER_INPUT_HISTORY_FILE',
    'AIDER_CHAT_HISTORY_FILE',
  ]) delete env[name];

  return {
    command: 'aider',
    args: [
      '--config', input.controlFiles.config,
      '--env-file', input.controlFiles.envFile,
      '--model-settings-file', input.controlFiles.modelSettings,
      '--input-history-file', input.controlFiles.inputHistory,
      '--chat-history-file', input.controlFiles.chatHistory,
      '--openai-api-base', gatewayBaseURL,
      '--no-show-release-notes',
      '--no-show-model-warnings',
      '--model', model,
      '--weak-model', model,
      '--editor-model', model,
      ...args,
    ],
    env: {
      ...env,
      OPENAI_API_BASE: gatewayBaseURL,
      OPENAI_API_KEY: input.apiKey,
      AIDER_OPENAI_API_BASE: gatewayBaseURL,
      AIDER_OPENAI_API_KEY: input.apiKey,
      AIDER_MODEL: model,
      AIDER_WEAK_MODEL: model,
      AIDER_EDITOR_MODEL: model,
      AIDER_SHOW_MODEL_WARNINGS: 'false',
      AIDER_ENV_FILE: input.controlFiles.envFile,
      AIDER_MODEL_SETTINGS_FILE: input.controlFiles.modelSettings,
      AIDER_INPUT_HISTORY_FILE: input.controlFiles.inputHistory,
      AIDER_CHAT_HISTORY_FILE: input.controlFiles.chatHistory,
      AIDER_GITIGNORE: 'false',
      AIDER_CHECK_UPDATE: 'false',
      AIDER_SHOW_RELEASE_NOTES: 'false',
    },
  };
}

function validateGatewayBaseURL(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Gateway URL must be an absolute HTTP(S) URL');
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (!['https:', ...(local ? ['http:'] : [])].includes(url.protocol)
      || url.username || url.password || url.search || url.hash
      || !url.pathname.replace(/\/+$/, '').endsWith('/v1')) {
    throw new Error('Gateway URL must use HTTPS (or loopback HTTP) and end in /v1 without credentials or query');
  }
  return url.toString().replace(/\/+$/, '');
}

function validateModelAlias(value: string): string {
  const alias = value.trim();
  if (!alias || alias.length > 200 || !/^[A-Za-z0-9._:/-]+$/.test(alias)) {
    throw new Error('Model alias must be 1 to 200 safe characters');
  }
  return alias;
}

function assertNoRouteOverrides(args: string[]): void {
  const protectedOptions = new Set([
    '--model', '--weak-model', '--editor-model', '--openai-api-base', '--openai-api-key',
    '--api-key', '--config', '-c', '--env-file', '--model-settings-file', '--set-env',
    '--openai-api-type', '--openai-api-version', '--openai-api-deployment-id',
    '--openai-organization-id', '--show-model-warnings', '--no-show-model-warnings',
    '--show-release-notes', '--no-show-release-notes',
  ]);
  for (const argument of args) {
    const option = argument.split('=', 1)[0];
    if (protectedOptions.has(option)) {
      throw new Error(`Aider option ${option} is controlled by the Niu route connector`);
    }
  }
}
