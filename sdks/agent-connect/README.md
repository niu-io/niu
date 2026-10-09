# @niu-io/agent-connect

Niu Agent Connect provides workspace-scoped connectors for coding agents. This
package contains an Aider route-mode prototype and a Claude Code OpenTelemetry
collection prototype. Neither connector is release qualified until its tested
version and end-to-end evidence are recorded. The package is not published yet;
use it from a Niu source checkout while these integrations remain in preview.

## Aider route prototype

Aider documents an OpenAI-compatible endpoint and API key configuration. The
connector launches Aider with the selected Niu gateway URL, a workspace-scoped
Niu key, and one selected model alias for the main, weak, and editor model. The
key is read from `NIU_API_KEY` or a hidden terminal prompt, then passed only in
the child process environment. It is not written to agent configuration or
command arguments. The launcher accepts only the end-to-end verified Aider
version 0.86.2.

The route pins the gateway URL and selected alias, ignores Aider configuration
and `.env` files for that run, and rejects command-line options that can change
the route, model, or key. Pass other desired Aider options after `--`. Chat
and input history remain on this device in the user's private Niu Agent
Connect data directory, outside the working repository; the connector does not upload it.

```sh
pnpm --filter @niu-io/agent-connect build
node sdks/agent-connect/bin/niu-agent-connect.mjs aider route \
  --gateway https://niu.example/v1 \
  --model <workspace-model-alias>
```

The command prompts for the one-time key without echoing it. Add optional Aider
arguments after `--`.

This mode uses the provider account configured in Niu. It does not preserve an
Aider or model-provider subscription. Agent tool calls, retries, validation,
and accepted outcomes are not captured by the route connector; Niu's gateway
request activity remains the source for routed model requests.

## Claude Code collection prototype

Claude Code documents opt-in OpenTelemetry logs for request and tool metadata.
The connector starts a loopback-only OTLP/HTTP JSON receiver for the wrapped
Claude Code process, sanitizes logs into immutable event records, and forwards
them with a workspace-scoped activity key. Failed delivery is queued
locally with private file permissions and retried on the next run. The Niu key
is not passed to Claude Code or written to disk.

The wrapper enables telemetry only for that process, sends logs to the local
receiver, disables traces and metrics, and explicitly keeps prompt, assistant,
tool, and raw API content logging off. Claude Code keeps its current provider
sign-in, route, and payer. Records are external partial evidence: usage and cost
are agent-reported estimates, and events are not joined to Niu Gateway attempts
or treated as accepted task outcomes. The dashboard can issue, list, and revoke
the scoped collector key. There is no automatic restore flow because the
wrapper does not modify Claude Code's saved configuration.

The connector accepts only Claude Code 2.1.211, the version verified for this
prototype. Other versions are rejected before the activity key is requested.
The package is currently available from a source checkout, not a public package
registry.

See the official [Claude Code Monitoring documentation](https://code.claude.com/docs/en/monitoring-usage)
for telemetry configuration, event attributes, content controls, and version
requirements.
