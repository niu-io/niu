#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { connect, readConnection, enableCodex, disableCodex, ensureReceiver, status, disconnect, daemon } from '../src/connection.mjs';
import { codexHook } from '../src/codex-hooks.mjs';
import { access } from 'node:fs/promises';
import { join } from 'node:path';
import { startCodexReceiver } from '../src/codex.mjs';
import { configuration, trace, deliver, flush, claudeHook, claudeSettings, version } from '../src/telemetry.mjs';

const [command, ...args] = process.argv.slice(2);
const help = `Niu Collector ${version} (Node.js 22+)\n\nconnect --consent      Save a verified personal key from NIU_AGENT_TOKEN\nstatus                 Show connection and queue health (no secrets)\ndisconnect             Remove local credentials and native settings\nenable codex --consent Enable native export for future Codex sessions\ndisable codex          Restore configuration by removing our settings\nverify                 Send a metadata-only connection check\nrun -- <agent> [args]   Observe process duration and exit status\ncodex -- [args]         Run Codex with a private native telemetry receiver\nclaude-config          Print opt-in Claude Code hook settings\nclaude-hook            Handle a Claude Code event on stdin (silent)\nflush                  Retry queued metadata for this credential\n\nSet NIU_AGENT_TOKEN, NIU_AGENT_ENDPOINT and NIU_AGENT_SOURCE.\nNo prompts, arguments, outputs, transcripts or model credentials are collected.\nProcess exit status is not task acceptance; hooks report partial tool coverage.\n`;
async function main() {
  if (!command || command === '--help' || command === 'help') { console.log(help); return; }
  if (command === '--version') { console.log(version); return; }
  if (command === 'connect') { await connect(process.env, { consent: args.includes('--consent') }); console.log('Collector connected. Trust the plugin hooks in Codex to collect session/tool metadata.'); return; }
  if (command === 'status') { console.log(JSON.stringify(await status(), null, 2)); return; }
  if (command === 'disconnect') { await disconnect(); console.log('Collector disconnected locally. Queued metadata remains; revoke the key in Niu if needed.'); return; }
  if (command === 'enable' && args[0] === 'codex') { await enableCodex(process.env, { consent: args.includes('--consent') }); console.log('Native telemetry enabled. Restart Codex sessions to apply it.'); return; }
  if (command === 'disable' && args[0] === 'codex') { await disableCodex(); console.log('Collector telemetry settings removed. Restart Codex sessions to apply it.'); return; }
  if (command === 'daemon') { await daemon(); return; }
  if (command === 'codex-hook') {
    try {
      let input = '', size = 0;
      for await (const chunk of process.stdin) { size += chunk.length; if (size > 1_048_576) return; input += chunk; }
      const event = JSON.parse(input), connection = await readConnection();
      if (!connection) return;
      if (event.hook_event_name === 'SessionStart') {
        try { await access(join(connection.directory, 'native.json')); await ensureReceiver(); } catch { /* native collection not enabled */ }
      }
      await codexHook(connection.config, event);
    } catch { /* advisory: no model context, output or decisions */ }
    return;
  }
  if (command === 'claude-config') { console.log(JSON.stringify(claudeSettings(), null, 2)); return; }
  if (command === 'claude-hook') {
    // Do not alter agent permission decisions, context, or execution on telemetry failures.
    try {
      let input = '', size = 0;
      for await (const chunk of process.stdin) { size += chunk.length; if (size > 1_048_576) return; input += chunk; }
      await claudeHook(configuration(), JSON.parse(input));
    } catch { /* fail open, no content or secrets on either output stream */ }
    return;
  }
  const saved = await readConnection();
  const config = process.env.NIU_AGENT_TOKEN ? configuration() : saved?.config ?? configuration();
  if (command === 'flush') { console.log(`Delivered ${await flush(config)} queued traces.`); return; }
  if (command === 'verify') {
    const start = Date.now();
    const sent = await deliver(config, trace(config, { name: 'Connection verification', start, end: Date.now(), status: 'completed' }));
    console.log(sent ? 'Verification received. Open Niu Traces to inspect it.' : 'Verification queued. Run flush when the connection is available.');
    if (!sent) process.exitCode = 1;
    return;
  }
  if (!['run', 'codex'].includes(command) || args[0] !== '--' || (command === 'run' && !args[1])) throw new Error('Use run -- <agent> [args] or codex -- [args].');
  const receiver = command === 'codex' ? await startCodexReceiver(config) : null;
  const executableArgs = receiver ? ['codex', '-c', 'otel.log_user_prompt=false', '-c', `otel.exporter={ otlp-http={ endpoint="${receiver.endpoint}", protocol="json", headers={ Authorization="Bearer ${receiver.secret}" } } }`, ...args.slice(1)] : args.slice(1);
  const start = Date.now();
  const child = spawn(executableArgs[0], executableArgs.slice(1), { stdio: 'inherit', shell: false });
  const signals = ['SIGINT', 'SIGTERM'];
  const handlers = signals.map(signal => { const handler = () => child.kill(signal); process.on(signal, handler); return handler; });
  const result = await new Promise(resolve => {
    child.once('error', () => resolve({ code: 127, signal: null }));
    child.once('exit', (code, signal) => resolve({ code, signal }));
  });
  signals.forEach((signal, index) => process.off(signal, handlers[index]));
  if (receiver) await receiver.close();
  const executable = executableArgs[0].split(/[\\/]/).at(-1);
  const agent = ['codex', 'claude', 'aider', 'gemini'].includes(executable) ? executable : 'Coding agent';
  try {
    const sent = await deliver(config, trace(config, { name: `${agent} process`, start, end: Date.now(), status: result.signal ? 'cancelled' : result.code === 0 ? 'completed' : 'failed' }));
    if (!sent) console.error('Niu telemetry queued. Run flush to retry.');
  } catch { console.error('Niu telemetry could not be saved. Agent exit status is preserved.'); }
  process.exitCode = result.code ?? (result.signal === 'SIGINT' ? 130 : 143);
}
main().catch(() => { console.error('Niu telemetry command failed. Check configuration, connection access and command syntax.'); process.exitCode = 1; });
