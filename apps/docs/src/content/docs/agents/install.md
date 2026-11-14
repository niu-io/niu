---
title: "Install and Connect Coding Agents to Niu"
---


Niu supports two connection tracks against any deployment origin (`{ORIGIN}`, such as `https://niu.io` or a self-hosted Niu gateway):

1. **Track 1 (Universal)**: Any coding agent capable of HTTP requests (Cursor, Windsurf, Zed, OpenCode, Claude Code, Codex, DeepSeek Harness, or a custom harness) can connect directly via Niu's browser device-authorization flow, optionally paired with the standalone `@niu-io/mcp` (`niu-mcp`) stdio server.
2. **Track 2 (Native Host Bundles)**: Prepackaged host bundles (`niu-agent-marketplace.tar.gz` and `niu-deepseek-harness.tar.gz`) bundle local `niu-login` and `niu-mcp` runtime helpers with Niu skills.

Always check the active deployment origin selected by the user and confirm required assets exist before installation. Published `v0.3.0` release assets are distributed under `https://github.com/niu-io/niu/releases/tag/v0.3.0`:

- `niu-io-mcp-0.1.0.tgz` — standalone `@niu-io/mcp` stdio server (`0.1.0` package tarball inside release `v0.3.0`).
- `niu-agent-marketplace.tar.gz` — native marketplace bundle for Claude Code and Codex.
- `niu-deepseek-harness.tar.gz` — native Cordis bundle for DeepSeek Harness.

---

## Track 1: Universal Browser Device-Auth (Any Coding Agent)

Browser device authorization lets the human sign in to Niu and approve exact workspace, duration, model-call, protocol, and management-scope boundaries without ever exposing their password or admin cookie to the agent.

### Step 1 — Start authorization (`POST {ORIGIN}/api/v1/auth/agents`)

Request body (`application/json`):

```json
{
  "client_name": "Cursor",
  "capabilities": ["pools:read", "evaluations:read"],
  "task": "Inspect authorized models and preview workspace routing"
}
```

Field contract:

- `client_name` (required): Trimmed printable non-control string, `1..80` characters. Use your actual coding agent host name (for example `"Cursor"`, `"Windsurf"`, `"Claude Code"`, `"Codex"`, `"DeepSeek Harness"`, `"OpenCode"`, or `"Custom Agent"`).
- `capabilities` (optional, default `[]`): Up to 6 unique management scopes from:
  `pools:read`, `pools:write`, `evaluations:read`, `evaluations:write`, `events:read`, `events:write`.
- `task` (optional): `1..200` printable non-control characters describing the user's goal. Displayed on `/connect` for reviewer context only; it never becomes an authority grant.

Response `201 Created`:

```json
{
  "device_secret": "<64 lowercase hex characters>",
  "user_code": "<12 uppercase alphanumeric characters>",
  "verification_uri": "/connect",
  "expires_in": 600,
  "interval": 5
}
```

Never place `device_secret` in any URL, query parameter, git file, or conversation log.

### Step 2 — Direct the user to `/connect`

Construct the browser review URL from `{ORIGIN}` and `verification_uri`:

```text
{ORIGIN}/connect?code={user_code}&workspace={workspace_slug}
```

Include `&workspace={workspace_slug}` whenever you already know the target workspace slug so `/connect` preselects it. On `/connect`, the human can:

- Pick or confirm the **Workspace**
- Choose **Session duration** (`15 minutes`, `1 hour`, `8 hours`, or `24 hours`; `[60, 86400]` seconds API bound)
- Keep **Allow model calls** off (discovery/management only) or turn it on with explicit **Allowed models** and **Model interfaces**
- Uncheck any requested management permissions under **Advanced options**

### Step 3 — Poll for the token (`POST {ORIGIN}/api/v1/auth/agents/token`)

Poll at `interval` (`5` seconds) until `expires_in` (`600` seconds) elapses:

```json
{
  "device_secret": "<64-hex device_secret>"
}
```

- While waiting: server returns `202 Accepted` (keep waiting at `>= 5s` intervals; polling too fast returns rate-limit errors).
- Denied, unknown, or expired: `401` / `404` / `410` — stop polling and inform the user.
- Approved (`200 OK`):

```json
{
  "token": "niu_<64 hex characters>",
  "token_type": "Bearer"
}
```

Persist the credential in owner-only storage (`0700` directory, `0600` file, refusing symlinks and group/world permissions):

- Shared default path (respect `NIU_CREDENTIAL_FILE` when set): `~/.config/niu/credential.json`
- Isolated DeepSeek Harness path: `~/.config/niu/deepseek-harness/credential.json`

JSON credential shape compatible with `niu-mcp`:

```json
{
  "origin": "{ORIGIN}",
  "token": "niu_<...>"
}
```

Verify the new connection immediately with `GET {ORIGIN}/v1/key` and `GET {ORIGIN}/v1/models` (see [Agent capabilities](/docs/agents.md)).

### Optional: Standalone MCP server (`@niu-io/mcp`)

If your agent supports stdio MCP servers and does not already bundle Niu:

```sh
npm install --global https://github.com/niu-io/niu/releases/download/v0.3.0/niu-io-mcp-0.1.0.tgz
```

For hosted Niu (`https://niu.io/v1`): configure command `niu-mcp` with `args: ["--hosted"]`. For any self-hosted or local deployment: omit `--hosted` and pass `NIU_BASE_URL="{ORIGIN}/v1"`. Prefer `NIU_CREDENTIAL_FILE` or `~/.config/niu/credential.json` from `/connect`, or pass a workspace key via `NIU_API_KEY` env without hardcoding secrets in tracked files. See [MCP guide](/docs/guides/mcp/).

---

## Track 2: Native Host Bundles & `niu-login`

For Claude Code, Codex, and DeepSeek Harness:

1. Preserve unrelated plugins, MCP servers, provider settings, and credentials.
2. Download and inspect the matching `v0.3.0` tarball (`niu-agent-marketplace.tar.gz` or `niu-deepseek-harness.tar.gz`) or build from a checked-out repo (`python3 scripts/build-agent-plugin.py` / `python3 scripts/build-deepseek-plugin.py`).
3. Bundled `runtime/connect/bin/niu-login.mjs` automates Track 1 and reloads credentials per operation in `niu-mcp`:

```sh
node runtime/connect/bin/niu-login.mjs \
  --origin "{ORIGIN}" \
  --client "<Claude Code | Codex | DeepSeek Harness>" \
  [--workspace "<workspace-slug>"] \
  [--credentials "<path>"] \
  [--task "<short description>"] \
  [--capability pools:read] \
  [--no-open]
```

**Qualification boundary**: DeepSeek Harness (`niu-deepseek-harness.tar.gz`) targets `0.2.1-rc.5` on local macOS with isolated credential storage (`~/.config/niu/deepseek-harness/credential.json`); do not assume unsupported previews or remote OS equivalence without live verification.

---

## Manual workspace API key fallback

If browser device-auth cannot be opened (e.g. headless CI where an operator already provisioned a workspace key), instruct the user to create a scoped key in `/workspaces/{slug}/keys` and provide `NIU_API_KEY` via private environment configuration, never in chat or committed files.
