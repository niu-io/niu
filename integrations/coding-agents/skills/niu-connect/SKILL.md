---
name: niu-connect
description: Connect Claude Code, Codex or DeepSeek Harness to a Niu account through browser login and explicit workspace authorization, or recover an expired Niu connection.
---

Identify the current host as Claude Code, Codex or DeepSeek Harness. Resolve the bundled `runtime/connect/bin/niu-login.mjs` from this plugin's root (two levels above this skill directory). Run it with Node and `--client "Claude Code"` or `--client Codex`. For DeepSeek Harness use `--client "DeepSeek Harness"` and `--credentials` pointing to `~/.config/niu/deepseek-harness/credential.json` (or the exact `NIU_CREDENTIAL_FILE` path explicitly configured for this host); expand the home directory through the host shell. This separate connection must not overwrite the other hosts’ private credential. Hosted Niu is the default; use `--origin` only for the Niu deployment the user selected, including its mount path when present (for example, `https://example.com/niu/`). Node must support built-in fetch.

Request only the management rights needed for the user’s task. For workspace pool management, add `--capability pools:read` and, when mutation is authorized, `--capability pools:write`. The browser must show these rights before approval. Adding rights requires a new approval; do not interpret wildcard model access as management permission. For resource-event observation add `--capability events:read`; add `--capability events:write` only when configuring an authorized notification receiver. For evaluation reads and request input bindings add `--capability evaluations:read`; add `--capability evaluations:write` only when saving task definitions or attributed run receipts is authorized. Paid test budgets are separate from these grants. Grants alone do not establish available operations.

The command displays and opens a Niu verification page. Ask the person to sign in, match the displayed code, select their workspace and review the access. Do not ask them to paste passwords, session cookies or API keys into chat. Wait for the command to complete; do not start duplicate authorization requests while it is pending.

A successful command saves a private credential and verifies read-only key/model access. The bundled Niu MCP server reloads the credential for each operation, so continue in the same session after login. Preserve unrelated servers and the host's inference settings.

If authorization is denied or expires, report the result. If a response may have been lost, do not claim connection success; explain how to review/revoke the previously issued key before starting again. Missing currency/funding or grants requires a concrete Niu configuration action, not repeated login. No paid model call is needed for connection verification.

For local Claude Code/Codex packages, a custom credential path must also be
explicitly configured in the host's MCP server environment. Do not assume the
host forwards arbitrary parent-process environment variables. When building
a source package, `build-agent-plugin.py --credential-file /absolute/private/path`
sets the same non-secret path in both native manifests. Pass that exact path to
`niu-login --credentials`. Without a custom path, use the documented default.
Never place the token itself in a manifest or loosen the host environment policy.
