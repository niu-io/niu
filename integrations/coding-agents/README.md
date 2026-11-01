# Niu for coding agents

Connect Claude Code, Codex or DeepSeek Harness to your Niu account for model discovery, bounded model comparisons and request evidence. You choose the task and review access; the agent retrieves Niu information directly. Model and cost decisions remain with the agent and user.

The package includes native manifests, shared skills, a local MCP runtime and a browser login command. It needs Node with built-in fetch. Invoke `niu-connect` after installation: the agent opens Niu login, you match the code and approve a workspace, and the command stores the granted credential in private local configuration. It verifies key/model access without a paid model request. The bundled MCP server discovers capabilities before login and reloads the credential for each operation, allowing the same session to continue after authorization.

For Niu 0.3.0, use the immutable native archives and integrity checks described in [agent installation](https://niu.io/docs/install.md). Confirm release and deployment availability before setup. Source builds remain available for explicitly selected development deployments. Current authorization grants one hour of workspace model access, including paid inference within existing workspace limits, and request diagnostics. It does not grant platform administration. Workspace pool management, task-specific evaluations and resource-event subscriptions require their explicit read/write capabilities and current approver authority; do not infer them from plugin installation. See the packaged pool, evaluation and event references for evidence and recovery limits. Platform supply management remains separate.

Claude Code uses `.claude-plugin/plugin.json` and `.mcp.json`. Codex uses the portable `plugin.json` and `mcp.json`. These formats are based on the [Claude Code manifest reference](https://code.claude.com/docs/en/plugins-reference) and [OpenAI plugin packaging reference](https://developers.openai.com/plugins/build/plugins). Host compatibility must be tested for the installed version.

To disconnect, revoke the issued key in the Niu workspace API keys page, then remove this plugin through the host. Uninstalling a plugin alone does not revoke its credential. Retain unrelated plugins and settings. Do not publish credentials or copy them into chat.

Build from source with `python3 scripts/build-agent-plugin.py --output /absolute/new/output` from the Niu repository. The build compiles and bundles MCP; the resulting folder can run independently of this checkout. Build and local validation do not publish or install the package.

DeepSeek Harness is also in the first 0.3 integration batch. Its separate native Cordis bundle is built by `scripts/build-deepseek-plugin.py`; see [its contract and qualification boundary](deepseek-harness/README.md). It shares Niu skills/runtime but uses a distinct host credential file. Do not claim its full host workflow qualified from the Claude Code/Codex evidence.

Hosts can filter inherited environment variables. For a custom private credential
location, build with `--credential-file /absolute/private/credential.json` and
pass the same location to login with `--credentials`; the builder configures
the path in both host MCP manifests. The path is configuration, never a token.
Without this option, login and MCP use the shared documented default. Do not
change unrelated host environment or security policies to forward credentials.

## Qualified local connection boundary

The dated 0.3.0 verification record covers actual macOS browser approval and
same-process management reads for Codex 0.162.0, Claude Code 2.1.316 and
DeepSeek Harness 0.2.1-rc.5. These are development candidates, not published
packages or a claim covering every host version and OS. Claude Code tool calls
were driven by a local deterministic Messages fixture; no paid model inference
or real model-quality judgment was used. Its `--bare` test mode omitted plugin
MCP tools from the calling surface; the passing tool-orchestration check used
supported restricted mode and explicit read-only permissions without bypass.

Connection acceptance is distinct from live Provider/task-quality evaluation,
event receiver processing and background agent wake. Follow each workflow's
contract and current grants before acting.
