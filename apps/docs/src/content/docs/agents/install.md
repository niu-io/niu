---
title: "Install and configure Niu"
---


This is Niu's entry point for coding agents. Install the supported host integration, guide the user through account authorization, verify the granted scope, and then work directly with Niu. The user sets goals and reviews consequential decisions; retrieve model information and request evidence yourself.

## Release and availability

Use the Niu 0.3 release artifacts for the user's selected deployment. Before installation, retrieve the GitHub release metadata for `niu-io/niu` tag `v0.3.0` and confirm that it is published (not a draft), with the required assets present. The installer must check availability at execution time; this document is not evidence that a release or deployment is live.

- Claude Code and Codex: `niu-agent-marketplace.tar.gz`, containing the host manifests, `plugins/niu`, shared skills and the bundled runtime.
- DeepSeek Harness: `niu-deepseek-harness.tar.gz`, containing the native Cordis bundle and the same management contracts.
- Verify the downloaded bytes against the release's `SHA256SUMS` and check `SOURCE_COMMIT` against the selected release commit. Extract to a new directory outside the application repository. Do not execute an artifact whose integrity or source does not match.

Use the host's supported local marketplace or bundle installer after inspecting its installed version and help. Do not assume that the repository root is the management-plugin marketplace: the opt-in Collector has a separate contract. Check the selected Niu deployment's published capabilities before account authorization. If the required package, supported host mechanism or authorization capability is unavailable, explain that prerequisite and stop automatic setup; never ask for credentials in conversation.

For an explicitly selected source checkout and matching development deployment, the agent may build packages using `scripts/build-agent-marketplace.py` or `scripts/build-deepseek-plugin.py` with `--output <new-directory>`. Read `integrations/coding-agents/README.md`, generated manifests and packaged skills first. Builders need checkout dependencies and neither publish nor install anything. Never substitute a development origin for the user's intended hosted deployment without their direction.

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

## Native package contract

A built package contains `plugin.json` and `mcp.json` for Codex, `.claude-plugin/plugin.json` and `.mcp.json` for Claude Code, shared `skills/niu` and `skills/niu-connect`, and a standalone `runtime`. Use the host's currently installed native plugin/marketplace mechanism; inspect its help rather than inventing version-specific commands. Marketplace packaging is available through `scripts/build-agent-marketplace.py` in the source checkout. Preserve unrelated host configuration.

Invoke the packaged `niu-connect` skill explicitly after installation; do not rely on automatic onboarding execution. Its login client is `runtime/connect/bin/niu-login.mjs`. The host needs Node with built-in fetch. The skill selects `--client Codex`, `--client "Claude Code"` or `--client "DeepSeek Harness"`; hosted Niu is default and `--origin` is limited to the deployment the user selected. It prints/opens a verification URL and polls a separate bounded device channel. Credentials are saved in private local configuration, never in skill text or the conversation. MCP reloads them per operation, so the same process can continue after approval.

Request only task-relevant management grants: `pools:read/write`, `evaluations:read/write` and `events:read/write` are separate capabilities. Each additional grant must be visible in the browser approval; it does not grant a paid-test budget or platform authority. Connection verification uses `inspect_key` and discovery without inference. Continue through agents.md after verification.

Inspect `invocation_allowed` in the connected key response before model execution. The current approval form starts with model calls disabled. Discovery and separately approved management remain available. A person can explicitly allow calls to selected model names; this fixed scope does not include models added later. Inspect `allowed_models` as well as `invocation_allowed` after connecting. Older wildcard grants retain their existing meaning. Model-call approval does not establish a separate trial budget. Older deployments may omit the field, which requires checking their authorization contract before paid execution.

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
