# Niu Collector companion

An opt-in Node.js 22+ companion for personal Niu telemetry. It uses a dedicated
write-only ingestion key, independent of workspace inference credentials.

Install Niu Collector with Node.js 22+:

```sh
npm install --global @niu-io/collector
```

You can also pack and install it from the Niu source tree:

```sh
cd sdks/agent-observability
npm pack
npm install --global ./niu-io-collector-0.1.1.tgz
niu-collector --help
```

In Niu, open **Agent Observability → Connection settings → Connect agent**.
Use source `coding-agent` and companion version `0.1.1`. Consent to metadata
collection and copy the ingestion key once. Set these variables in a private
shell environment or secret manager; do not commit the key:

```sh
export NIU_AGENT_ENDPOINT=https://niu.io/admin/v1/agent-observability
export NIU_AGENT_SOURCE=coding-agent
# Set NIU_AGENT_TOKEN securely to the key shown by Niu.
niu-collector verify
```

Use the same origin as your installation. HTTP is allowed only on loopback for
development, for example `http://localhost:2566/admin/v1/agent-observability`.
The source must match the connection. Inspect **Traces** to confirm the
verification was accepted and persisted.

## Process observation

```sh
niu-collector run -- codex
niu-collector run -- claude
```

The wrapper records one partial trace with process start/end and exit status.
It inherits terminal input/output and preserves the command's exit status.
It does not record command arguments, terminal output, prompts, local paths,
transcripts, model calls, token usage or task acceptance. A successful exit
means the process exited successfully, not that the user's task was accepted.
No model provider, agent authentication or model selection is changed.

## Claude Code tool hooks

```sh
niu-collector claude-config
```

Merge the printed `hooks` entries into your local Claude Code settings, preserving
existing hooks. The companion does not edit settings automatically. Keep the
executable on PATH and provide the environment variables to Claude Code. Remove
only these Niu hook entries to uninstall the integration.

The adapter follows the official [Claude Code hook contract](https://code.claude.com/docs/en/hooks).
`PreToolUse` saves a local timestamp; `PostToolUse` or `PostToolUseFailure`
submits a trace with the corresponding tool event. Only known built-in tool
names are retained; other tools are labeled **Other tool**. Arguments, results,
error messages, working directories and transcript files are never copied or
opened. Session/call identifiers are hashed locally for correlation and never
used as display names. Duplicate completion events reuse identical metadata.

Coverage is partial. Each tool call is a separate investigation trace with a
nested tool event; it is not a reconstructed conversation or complete turn tree.
The root outcome remains unknown even when a tool fails. Missing pre-events
produce an unknown start/duration. Interrupted tool calls are labeled cancelled.
Hooks emit no output or decisions and exit successfully on telemetry failures.
They use a two-second network timeout; tool permission decisions remain Claude
Code's responsibility. Contract fixtures are tested; native Claude Code version
qualification still requires a real client run.

## Offline delivery and data controls

Failed deliveries save only metadata in a private, credential-bound directory
under `~/.niu/agent-observability`. Up to 100 pending records are retained.
Run `niu-collector flush` explicitly to retry them. Flush stops on
rejection without deleting the pending record. Accepted retries are idempotent.
Abandoned hook timestamps and completion metadata are cleaned after 24 hours
on subsequent pre-tool events. Set `NIU_AGENT_STATE_DIR` to relocate local state.

Pausing, disconnecting or expiring a Niu connection rejects future submissions;
it does not delete either local pending metadata or saved platform traces.
Remove the local state directory to discard pending data, and use Niu's trace
deletion controls to remove saved records. A rotated credential has a separate
queue and cannot silently submit an earlier account's pending data.

Native Codex CLI telemetry is available through the opt-in launch command below. Desktop telemetry and subscription attribution are not yet qualified. Custom
agents can use `NiuExecutionRecorder` and `NiuAgentObservabilityClient` from
`@niu-io/sdk` for explicitly instrumented nested traces.

## Native Codex CLI connection

Create a personal connection in Niu with source `codex`, then set the matching
`NIU_AGENT_TOKEN`, `NIU_AGENT_ENDPOINT` and `NIU_AGENT_SOURCE=codex` environment
variables. Launch Codex with:

```sh
niu-collector codex --
# Or pass ordinary Codex arguments:
niu-collector codex -- exec "Your task"
```

The companion starts an authenticated receiver on a random loopback port and
passes per-invocation OpenTelemetry settings to Codex. It does not edit
`~/.codex/config.toml`, change your provider or sign-in, or install an MCP server.
Close that Codex process to stop collection. Ordinary `run -- codex` remains
process-only observation. Existing user telemetry routing is overridden for this
invocation; do not use this command if you need a different exporter concurrently.

Only API request metadata, tool result timing/status and response-completion token
counts are forwarded. Prompts, outputs, endpoints, tool arguments, account details
and arbitrary attributes are discarded in memory before upload or queueing.
Streaming deltas and the separate timing-only completion event are excluded.
Filtered records use stable identities for repeated delivery. Failed delivery
uses the existing private queue; `flush` retries it explicitly.

Qualification: Codex CLI 0.154.0 emitted native OTLP JSON during an isolated,
ephemeral run against a local mock Responses service. The automated native test
confirmed one completion with 12 input, 3 output and 4 cached tokens. No live
OpenAI inference was used. Run it with `NIU_TEST_CODEX=1 npm test` in this package
when Codex is installed; normal tests do not require Codex.

Native events with a conversation key assemble into one chronological Codex
session trace. Correlation is hashed locally; raw session identifiers are excluded.
Event receipts remain immutable, retries do not add steps or usage, and long
sessions continue in numbered parts at 1,000 spans or the payload size limit.
Coverage remains partial: the overall task outcome is unknown, the root interval
is the observed activity window, and completion timing is not inference duration. Codex's configured
model tag is recorded as requested model, not confirmed response model. Native
counters appear as source-reported estimates in trace details; the separate
subscription Metrics report is not populated by this adapter yet. Reasoning-token
breakdowns and subscription/API attribution require further integration.
Desktop collection has been observed locally; comprehensive desktop qualification
remains separate from the CLI fixture.


## Codex plugin: collect across sessions

Node.js 22+ must be installed on the machine that runs Codex. The npm package and
the Codex plugin share the same self-contained files; the plugin does not require
an MCP server or a separate global collector installation to run its hooks.

For an npm installation, register the package’s bundled marketplace:

```sh
codex plugin marketplace add "$(npm root -g)/@niu-io/collector"
codex plugin add niu-collector@niu
```

For a source checkout, register its marketplace and install the plugin:

```sh
codex plugin marketplace add /absolute/path/to/niu
codex plugin add niu-collector@niu
```

Review and trust the plugin hooks in Codex. Installation or enablement does not
trust hooks automatically. Cloud orchestration does not run these local hooks.
Desktop hook coverage requires separate qualification.

After installing the npm archive, run the following in your terminal. Provide
`NIU_AGENT_TOKEN` privately through your environment or secret manager; never paste
it into a conversation or pass it as a command argument. The Niu connection's
source must match `NIU_AGENT_SOURCE` (use `codex` for this setup).

```sh
export NIU_AGENT_SOURCE=codex
# Set NIU_AGENT_ENDPOINT for a self-hosted Niu installation.
niu-collector connect --consent
niu-collector enable codex --consent
niu-collector status
```

`connect` verifies ingestion before saving credentials in a private local file.
`enable codex` starts an authenticated, loopback-only background receiver and adds
a marked telemetry block to the user-level Codex configuration. Restart existing
Codex sessions to apply it. The receiver remains available across sessions; the
plugin's SessionStart hook restarts it when needed. It is not a system login
service: recovery after restart depends on a new local Codex session with trusted
hooks. The default port is 43189; set `NIU_COLLECTOR_PORT` before connecting if it
is occupied. Use `NIU_COLLECTOR_HOME` to relocate private collector state.

Existing telemetry configuration is preserved: automatic setup refuses to replace
another exporter. Native configuration changes are explicit, never performed by a
hook. All hooks remain silent and return success even if collection is unavailable.
PreToolUse/PostToolUse pair tool timing without reading arguments or outputs;
SessionStart/SessionEnd pair session duration. Tool and session outcomes stay
unknown because those hook events do not establish success or task acceptance.
With native export enabled, tool hooks are omitted to avoid duplicate steps.
Native events and session-end hooks share the same hashed session root.
Source-reported token counters do not populate subscription
Metrics or establish billing attribution.

Disable native export while retaining hook collection, or disconnect completely:

```sh
niu-collector disable codex
niu-collector disconnect
```

Both remove only the exact marked settings block and stop the local receiver.
Unrelated user configuration is retained; edited collector settings require manual
resolution. Restart existing sessions after changing telemetry settings. Disconnect
removes the saved local key; revoke the connection in Niu to invalidate other copies.
Queued metadata and platform history remain until explicitly deleted. Run disconnect
before uninstalling the plugin so its background receiver and settings are removed.
The compatibility command `niu-agent-observability` remains available.


For native plugin qualification, install `niu-collector@niu` from this checkout
before running `NIU_TEST_CODEX=1 npm test`. The native fixture uses the hook-trust
bypass only for the reviewed fixture during that isolated invocation; normal setup
must use Codex's hook review. Tests route inference to a local mock service and do
not change your provider or persist Codex sessions. Collector connection state and
native settings are created in temporary test directories and removed afterwards.

## Publishing a collector release

Collector publishing uses the separate **Publish collector to npm** GitHub Actions
workflow (`.github/workflows/publish-collector.yml`). It runs only when manually
dispatched from `main`; ordinary pushes and pull requests never publish. Enter the
exact stable version from this package's `package.json`. Keep both plugin manifests
and the companion version in `src/telemetry.mjs` aligned with that version.

The first job checks the release version, runs syntax checks and the metadata
collection tests, and uploads the packed archive. The second job publishes that
exact archive with provenance and verifies its checksum against npm. The installed
Codex integration fixtures remain opt-in (`NIU_TEST_CODEX=1`) and require a reviewed
Codex/plugin installation; ordinary release tests do not invoke a live coding agent.

Configure the package's npm **Trusted Publisher** once:

- Publisher: GitHub Actions.
- Organization: `niu-io`; repository: `niu`.
- Workflow filename: `publish-collector.yml`.
- Environment: leave blank (the workflow does not use a GitHub environment).
- Allowed action: direct `npm publish`.

The publisher uses GitHub OIDC, so no `NPM_TOKEN` repository secret or interactive
npm login is required in Actions. npm's package administrator must approve the
initial trust configuration. See [npm's trusted publishing documentation](https://docs.npmjs.com/trusted-publishers/).
