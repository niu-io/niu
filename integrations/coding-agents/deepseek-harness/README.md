# Niu for DeepSeek Harness

Native Cordis bundle for the Niu 0.3 development candidate. Publication is held.
The initial compatibility target is DeepSeek Harness 0.2.1-rc.5; the package does
not claim compatibility with every preview release or operating system.

The bundle adds a named Niu MCP connection and the shared `niu` and `niu-connect`
skills through the host's own lifecycle. It neither replaces other MCP entries
nor changes the host's inference model. Invoke `niu-connect` explicitly. Approve
the chosen workspace, rights and duration on the Niu page; no credentials belong
in the conversation. Read back grants and models before a paid request.

Credentials default to `~/.config/niu/deepseek-harness/credential.json`, separate
from the Claude Code/Codex connection. If the host explicitly supplies
`NIU_CREDENTIAL_FILE`, the login command must use that same path. The skill
passes `--client "DeepSeek Harness"` and `--credentials` to the bundled login
client. Never reuse its expiring management credential as a production app key.

Build from the Niu source with `scripts/build-deepseek-plugin.py --output` and a
new output directory. The output includes prebuilt JavaScript and needs no
install-time build script. Inspect the generated package and use Harness's
native `dsh plugin --profile <chosen-profile> add <local-package>` mechanism.
Use `--dump-config` to verify composition before starting the profile. Do not
replace a user's profile or advertise a nonexistent published package.

The host's tools use the `mcp__niu__` namespace. Discovery works before login;
operations requiring Niu authority fail until authorization. MCP reloads the
private credential per operation, allowing the same process to continue after
login. Host reconnect/disposal is distinct from Niu resource-event delivery.
Unloading removes the plugin's processes, tools and skill provider; server access
ends only when the issued Niu key is revoked. Preserve unrelated host state.

Host contracts were inspected in the [official packaging guide](https://deepseek-harness.github.io/deepseek-harness/en/develop/basic/publish),
[MCP bridge source](https://github.com/deepseek-ai/deepseek-harness/tree/b830ec950faba0a46dda564be3e2d854afed94f1/packages/mcp/mcp-client)
and [skill provider source](https://github.com/deepseek-ai/deepseek-harness/tree/b830ec950faba0a46dda564be3e2d854afed94f1/packages/skill/skill-filesystem).
The adapter is Niu-owned; it imports public host packages and copies no upstream implementation.

For an isolated native-host qualification, set `DSH_BIN` to an installed
0.2.1-rc.5 executable and run `node scripts/verify-deepseek-plugin.mjs` from
the Niu source root. It builds a temporary package/profile, checks tool/skill
discovery, credential reload and revoked-authority rejection using a local HTTP
fixture, verifies coexistence and unload, and removes the temporary profile.
It makes no model calls and does not validate real browser approval or every OS.

The pinned host has also passed a real local Niu browser-approval handoff on
macOS: same-process credential reload, six granted capabilities and pool,
evaluation and event-subscription reads. The disposable key was revoked and the
package removed afterward. This verifies connection/read behavior; live model
quality, paid execution and other operating systems remain outside that evidence.
See the dated 0.3.0 verification record in the source repository.
