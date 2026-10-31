# Install and configure Niu

This is Niu's entry point for coding agents. Install the supported host integration, guide the user through account authorization, verify the granted scope, and then work directly with Niu. The user sets goals and reviews consequential decisions; retrieve model information and request evidence yourself.

## Release and availability

The 0.3.0 installation experience is a development candidate. Native Claude Code/Codex manifests, a DeepSeek Harness Cordis bundle, the bundled MCP runtime, browser authorization client and scoped management operations exist in the 0.3 source; packages and hosted deployment are not yet released. Do not invent installation commands, device endpoints or successful authentication. Check the deployment's published capabilities before attempting setup. If the required native package or account authorization flow is unavailable, explain that concrete prerequisite and stop the automatic setup; do not substitute a request for credentials in conversation.

For an explicitly selected 0.3 source checkout and matching development deployment, the agent may build the candidate using `scripts/build-agent-plugin.py --output <new-directory>`. Read `integrations/coding-agents/README.md`, the generated manifests and both packaged skills first. The builder needs the checkout's dependencies installed and does not publish or install anything. Do not substitute a local checkout, development origin or unsigned artifact for the user's intended hosted deployment without their direction.

The existing [MCP reference](https://niu.io/docs/guides/mcp/) documents the older workspace-key integration for explicitly requested manual use. It does not establish the account-login handoff required by this installation flow.

## Installation contract

1. Identify whether the current host is Claude Code, Codex or DeepSeek Harness, its version and supported plugin mechanisms. Preserve unrelated plugins, MCP servers, provider configuration and credentials.
2. Obtain the published Niu package for that host and verify its version and integrity. Install using the host's supported mechanism. Keep credentials outside repositories and conversation.
3. Start Niu's documented account-authorization flow. Open the returned Niu verification page for the user. The user signs in and reviews the requested workspace, permissions, duration and spending consequences in Niu.
4. Wait through the documented bounded authorization channel. Handle pending, denial and expiry without widening scope or restarting approvals silently. Receive credentials only through that channel; never ask the user to copy a session cookie or key back into chat.
5. Store the granted credential using the supported secure local mechanism. Verify current grants and available models with read-only operations. Installation or browser login alone is not connection acceptance.
6. Report the connected workspace and actual granted capabilities. Ask what the user wants to accomplish, then use Niu directly within that scope. Paid tests require a bounded budget; missing authority requires an actionable review handoff.

## After connection

Use the [agent capability entry](https://niu.io/docs/agents.md) and operation contracts as needed. Judge model value using the user's task requirements and evidence. Do not promise optimal cost or quality. Preserve unknown charges and uncertain outcomes; never blindly replay a possibly charged request.

Account authorization does not grant platform administrator privileges, consent to external data processing, or permission to change the coding agent's own inference provider. Keep Niu platform events separate from host lifecycle hooks. Provide a supported revoke/disconnect path and preserve user data during uninstall.

## Candidate package contract

A built package contains `plugin.json` and `mcp.json` for Codex, `.claude-plugin/plugin.json` and `.mcp.json` for Claude Code, shared `skills/niu` and `skills/niu-connect`, and a standalone `runtime`. Use the host's currently installed native plugin/marketplace mechanism; inspect its help rather than inventing version-specific commands. Marketplace packaging is available through `scripts/build-agent-marketplace.py` in the source checkout. Preserve unrelated host configuration.

Invoke the packaged `niu-connect` skill explicitly after installation; do not rely on automatic onboarding execution. Its login client is `runtime/connect/bin/niu-login.mjs`. The host needs Node with built-in fetch. The skill selects `--client Codex`, `--client "Claude Code"` or `--client "DeepSeek Harness"`; hosted Niu is default and `--origin` is limited to the deployment the user selected. It prints/opens a verification URL and polls a separate bounded device channel. Credentials are saved in private local configuration, never in skill text or the conversation. MCP reloads them per operation, so the same process can continue after approval.

Request only task-relevant management grants: `pools:read/write`, `evaluations:read/write` and `events:read/write` are separate capabilities. Each additional grant must be visible in the browser approval; it does not grant a paid-test budget or platform authority. Connection verification uses `inspect_key` and discovery without inference. Continue through agents.md after verification.

Disconnect by revoking the issued credential in Niu API keys and removing the host plugin. Removing local files alone does not revoke server access. Keep application production credentials separate from the expiring agent-management credential.

DeepSeek Harness uses the separate `scripts/build-deepseek-plugin.py --output <new-directory>` builder. Its native bundle composes the host MCP bridge and bundled-skill provider. Local macOS connection and same-process management reads are qualified for `0.2.1-rc.5`; other versions, operating systems and live model-quality evaluation are not covered. Do not imply all Harness previews are supported. Its private connection file is separate from the other hosts, as documented by the packaged `niu-connect` skill.

### Custom private credential locations

Do not assume the coding-agent host forwards arbitrary parent environment
variables to a bundled MCP process. For a source-built Claude Code/Codex package
with a custom credential location, pass the absolute path through the builder's
`--credential-file` option and use the identical path with `niu-login --credentials`.
The builder declares only the non-secret path in both native MCP manifests.
Without an override, use the shared documented default. DeepSeek Harness declares
its separate path through its native adapter. Preserve the host's environment
filtering and never embed a token in plugin configuration.
