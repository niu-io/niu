#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { aiderConnector, claudeCodeConnector, createAiderInvocation } from '../dist/index.js';
import { ClaudeCollectionReceiver } from './claude-collection.mjs';
import { claudeTelemetryEnvironment } from './claude-telemetry-env.mjs';

const [agent, mode, ...rawArgs] = process.argv.slice(2);

if (agent === 'list' || agent === '--help' || agent === '-h' || !agent) {
  process.stdout.write([
    'Niu Agent Connect (prototype)',
    '',
    'Supported connector work in this package:',
    '  aider route --gateway <https://niu.example/v1> --model <alias> [-- <aider arguments>]',
    '  claude collect --gateway <https://niu.example/v1> --organization <id> --project <id> [-- claude arguments]',
    '',
    'Route mode uses the selected project key and the provider account configured in Niu.',
    'It pins the Niu URL, key, and alias, and ignores Aider provider settings from project config and .env files.',
    'Aider chat and input history stay in private per-user state outside the project.',
    'Collection mode keeps Claude Code auth and request routing unchanged; it forwards metadata-only OTLP logs.',
    'Prompt and tool content are disabled for the wrapped process. Neither mode records accepted task outcomes.',
    '',
  ].join('\n'));
  process.exit(agent === 'list' || !agent || ['--help', '-h'].includes(agent) ? 0 : 2);
}

if (agent === 'claude' && mode === 'collect') {
  process.exitCode = await runClaudeCollection(rawArgs).catch(error => {
    process.stderr.write(`${error instanceof Error ? error.message : 'Claude collection failed'}\n`);
    return 2;
  });
} else if (agent !== 'aider' || mode !== 'route') {
  process.stderr.write('This connector version supports: aider route, claude collect\n');
  process.exit(2);
} else {
  const separator = rawArgs.indexOf('--');
  const connectorArgs = separator < 0 ? rawArgs : rawArgs.slice(0, separator);
  const aiderArgs = separator < 0 ? [] : rawArgs.slice(separator + 1);
  const options = parseOptions(connectorArgs, new Set(['--gateway', '--model']));
  const gatewayBaseURL = options.get('--gateway');
  const modelAlias = options.get('--model');
  if (!gatewayBaseURL || !modelAlias) {
    process.stderr.write('Usage: niu-agent-connect aider route --gateway <base-url> --model <alias> [-- <aider arguments>]\n');
    process.exit(2);
  }

  try {
    const version = detectAiderVersion();
    const testedVersion = aiderConnector.testedVersion;
    if (!testedVersion || version !== testedVersion) {
      throw new Error(`Aider ${version} is not verified by this connector; use Aider ${testedVersion ?? 'with a verified version'}.`);
    }
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : 'Could not verify Aider'}\n`);
    process.exit(2);
  }

  let apiKey = process.env.NIU_API_KEY;
  if (!apiKey) {
    try {
      apiKey = await readSecret('Niu project key: ', 'NIU_API_KEY');
    } catch (error) {
      process.stderr.write(`${error instanceof Error ? error.message : 'Could not read key'}\n`);
      process.exit(2);
    }
  }

  try {
    process.exitCode = await runAiderRoute({ gatewayBaseURL, modelAlias, apiKey, args: aiderArgs });
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : 'Could not run Aider through Niu'}\n`);
    process.exitCode = 2;
  }
}

async function runAiderRoute({ gatewayBaseURL, modelAlias, apiKey, args }) {
  const controls = await createAiderControlFiles();
  try {
    const invocation = createAiderInvocation({
      gatewayBaseURL,
      modelAlias,
      apiKey,
      args,
      baseEnv: process.env,
      controlFiles: controls.files,
    });
    return await new Promise((resolve, reject) => {
      const child = spawn(invocation.command, invocation.args, { env: invocation.env, stdio: 'inherit' });
      child.once('error', reject);
      child.once('exit', (code, signal) => resolve(signal ? 1 : (code ?? 1)));
    });
  } finally {
    await rm(controls.temporaryDirectory, { recursive: true, force: true });
  }
}

function detectAiderVersion() {
  const detected = spawnSync('aider', ['--version'], {
    encoding: 'utf8',
    timeout: 5_000,
    stdio: 'pipe',
    env: { ...process.env, AIDER_CHECK_UPDATE: 'false' },
  });
  if (detected.error || detected.status !== 0) {
    throw new Error('Could not detect Aider using aider --version');
  }
  const output = `${detected.stdout ?? ''}\n${detected.stderr ?? ''}`;
  const version = output.match(/\b(\d+\.\d+\.\d+)\b/)?.[1];
  if (!version) throw new Error('Aider did not report a semantic version');
  return version;
}

async function createAiderControlFiles() {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'niu-agent-connect-aider-'));
  try {
    if (process.platform !== 'win32') await chmod(temporaryDirectory, 0o700);
    const historyDirectory = aiderHistoryDirectory();
    await mkdir(historyDirectory, { recursive: true, mode: 0o700 });
    if (process.platform !== 'win32') await chmod(historyDirectory, 0o700);
    const projectKey = createHash('sha256').update(process.cwd()).digest('hex').slice(0, 20);
    const files = {
      config: join(temporaryDirectory, 'aider.yml'),
      envFile: join(temporaryDirectory, 'empty.env'),
      modelSettings: join(temporaryDirectory, 'model-settings.yml'),
      inputHistory: join(historyDirectory, `${projectKey}.input.history`),
      chatHistory: join(historyDirectory, `${projectKey}.chat.history.md`),
    };
    await writeFile(files.config, '{}\n', { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    await writeFile(files.envFile, '', { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    await writeFile(files.modelSettings, '{}\n', { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    for (const path of [files.inputHistory, files.chatHistory]) {
      try {
        await writeFile(path, '', { encoding: 'utf8', mode: 0o600, flag: 'wx' });
      } catch (error) {
        if (error?.code !== 'EEXIST') throw error;
        if (process.platform !== 'win32') await chmod(path, 0o600);
      }
    }
    return { temporaryDirectory, files };
  } catch (error) {
    await rm(temporaryDirectory, { recursive: true, force: true });
    throw error;
  }
}

function aiderHistoryDirectory() {
  if (process.platform === 'win32') return join(process.env.LOCALAPPDATA || homedir(), 'Niu', 'Agent Connect', 'aider');
  if (process.platform === 'darwin') return join(homedir(), 'Library', 'Application Support', 'Niu Agent Connect', 'aider');
  return join(process.env.XDG_STATE_HOME || join(homedir(), '.local', 'state'), 'niu-agent-connect', 'aider');
}

function optionValue(args, name) {
  const index = args.indexOf(name);
  if (index >= 0) return args[index + 1];
  const prefix = `${name}=`;
  return args.find(argument => argument.startsWith(prefix))?.slice(prefix.length);
}

function parseOptions(args, allowed) {
  const options = new Map();
  for (let index = 0; index < args.length; index += 1) {
    const [name, inlineValue] = args[index].split('=', 2);
    if (!allowed.has(name) || options.has(name)) throw new Error(`Unknown or repeated option: ${name}`);
    const value = inlineValue ?? args[++index];
    if (!value || value.startsWith('--')) throw new Error(`${name} requires a value`);
    options.set(name, value);
  }
  return options;
}

async function runClaudeCollection(rawArgs) {
  const separator = rawArgs.indexOf('--');
  const connectorArgs = separator < 0 ? rawArgs : rawArgs.slice(0, separator);
  const childSpec = separator < 0 ? [] : rawArgs.slice(separator + 1);
  const options = parseOptions(connectorArgs, new Set(['--gateway', '--organization', '--project']));
  const gatewayBaseURL = options.get('--gateway');
  const organizationId = options.get('--organization');
  const projectId = options.get('--project');
  if (!gatewayBaseURL || !organizationId || !projectId) {
    throw new Error('Usage: niu-agent-connect claude collect --gateway <base-url> --organization <id> --project <id> [-- claude arguments]');
  }
  const command = childSpec[0] || 'claude';
  const agentArgs = childSpec.length > 0 ? childSpec.slice(1) : [];
  const detected = spawnSync(command, ['--version'], { encoding: 'utf8', timeout: 5_000, stdio: 'pipe' });
  if (detected.error || detected.status !== 0) {
    throw new Error(`Could not detect Claude Code using ${command} --version`);
  }
  const output = `${detected.stdout ?? ''}\n${detected.stderr ?? ''}`;
  const version = output.match(/\b(\d+\.\d+\.\d+)\b/)?.[1];
  if (!version) throw new Error('Claude Code did not report a semantic version');
  const testedVersion = claudeCodeConnector.testedVersion;
  if (!testedVersion || version !== testedVersion) {
    throw new Error(`Claude Code ${version} is not verified by this connector; use Claude Code ${testedVersion ?? 'with a verified version'}.`);
  }
  const collectorKey = process.env.NIU_COLLECTOR_KEY ?? await readSecret('Niu activity key: ', 'NIU_COLLECTOR_KEY');

  const receiver = new ClaudeCollectionReceiver({
    gatewayBaseURL,
    organizationId,
    projectId,
    collectorKey,
    stateDirectory: collectionStateDirectory(),
    onStatus: status => {
      if (status.type === 'warning') process.stderr.write(`${status.message}\n`);
    },
  });
  const local = await receiver.listen();
  process.stderr.write(`Claude Code ${version}: collecting metadata for this process. Provider sign-in and routing are unchanged; prompt and tool content are off.\n`);
  const childEnvironment = claudeTelemetryEnvironment(process.env, local);
  const child = spawn(command, agentArgs, { env: childEnvironment, stdio: 'inherit' });
  const forwardInterrupt = signal => child.kill(signal);
  process.once('SIGINT', forwardInterrupt);
  process.once('SIGTERM', forwardInterrupt);
  let result;
  try {
    result = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', (code, signal) => resolve({ code, signal }));
    });
  } catch (error) {
    process.stderr.write(`Could not start Claude Code: ${error.message}\n`);
    result = { code: 127, signal: null };
  } finally {
    process.off('SIGINT', forwardInterrupt);
    process.off('SIGTERM', forwardInterrupt);
    const pending = await receiver.close();
    if (pending > 0) process.stderr.write(`${pending} sanitized activity record(s) remain queued locally for the next collection run.\n`);
  }
  return result.signal ? 1 : (result.code ?? 1);
}

function collectionStateDirectory() {
  if (process.platform === 'win32') return join(process.env.LOCALAPPDATA || homedir(), 'Niu', 'Agent Connect', 'queue');
  if (process.platform === 'darwin') return join(homedir(), 'Library', 'Application Support', 'Niu Agent Connect', 'queue');
  return join(process.env.XDG_STATE_HOME || join(homedir(), '.local', 'state'), 'niu-agent-connect', 'queue');
}

async function readSecret(prompt, variableName) {
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== 'function') {
    throw new Error(`Set ${variableName} in the current shell or run this command in a terminal to enter it securely.`);
  }
  process.stderr.write(prompt);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  return await new Promise((resolve, reject) => {
    let value = '';
    const cleanup = () => {
      process.stdin.off('data', onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stderr.write('\n');
    };
    const onData = chunk => {
      for (const character of String(chunk)) {
        if (character === '\u0003') {
          cleanup();
          reject(new Error('Cancelled.'));
          return;
        }
        if (character === '\r' || character === '\n') {
          cleanup();
          resolve(value);
          return;
        }
        if (character === '\u007f' || character === '\b') value = value.slice(0, -1);
        else if (character >= ' ' && character <= '~') value += character;
      }
    };
    process.stdin.on('data', onData);
  });
}
