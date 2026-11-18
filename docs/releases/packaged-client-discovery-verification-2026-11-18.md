# Packaged client discovery and revocation — 2026-11-18

Tracking: `niu-nrcn.9` (`CLIENT-03`). This record covers a current-input run with
development tarballs and the actual staging gateway. It does not qualify a
published release, native host integration, paid inference or the final release
candidate.

## Artifact identity

The JavaScript SDK and MCP packages were built from
`d264a3a656042132295970f72eca157b9e80d6d1`, packed, extracted outside the source
checkout, and executed from their extracted contents. Both declare version
`0.1.0`. The hosted gateway used core
`2a4dfb858fba5c94e8d3c466bf0e300ff5108313`.

| Artifact | SHA-256 |
| --- | --- |
| `niu-io-sdk-0.1.0.tgz` | `84d17615b0818d94f9f7bbc652ddb23dbc7dc13018d368525d09538f773a67e1` |
| `niu-io-mcp-0.1.0.tgz` | `de19e847b56a131a652e2953e14ba35941727cdb4a86737ad0c0c395105446bd` |

The completed run occurred at 2026-11-17 18:09:54–18:09:59 UTC
(2026-11-18 in Asia/Shanghai), using Node.js 22.23.2.

## Actual observations

- A temporary, 15-minute workspace credential was restricted to
  `babelark-video/wan3.0-video`. No inference was submitted.
- The packaged SDK's key introspection matched an independent HTTP read.
  Moving usage-window timestamps were checked for freshness separately;
  remaining fields matched. An initial harness comparison included this
  moving timestamp and was corrected; it did not establish a product defect.
- SDK model discovery matched the independent HTTP response and returned
  exactly the permitted model.
- The extracted MCP executable started as a real stdio subprocess, completed
  protocol initialization and tool discovery, and successfully executed
  `inspect_key` and `list_models` against the hosted gateway.
- Administrative revocation returned HTTP 204. An independent key read and
  the existing SDK instance then received HTTP 401. The same MCP process
  returned a tool error after revocation.
- Temporary credentials from both the initial comparison and completed run
  were revoked; local plaintext tokens were removed. No Provider request or
  new charge was generated.

These observations establish the scoped discovery and revocation behavior of
these development artifacts. They do not cover browser device approval,
native host loading, authorized management writes, live model results,
published artifact installation, or the final accepted candidate. Those
acceptance requirements remain tracked in Beads. Fixture outcomes supply no
evidence for this record.

## Packaged browser connection follow-up

The standalone dual-host plugin was built from
`653a77ed70f8219ce3067b5ab167a20d4ddbbf5d` and executed outside the checkout.
Its bundled login command requested a connection to staging using an isolated,
private credential directory. The actual browser approval selected the Default
workspace and a 15-minute lifetime, leaving model invocation disabled. The
command completed connection verification and saved the credential privately.

At 2026-11-17 18:15:32 UTC, the independent SDK introspection confirmed
`invocation_allowed: false`. The plugin's actual bundled MCP subprocess loaded
that credential file, initialized and executed key/model discovery. A current
video submission through the SDK received HTTP 403 with the explicit
invocation-approval error. Independent scoped request reads before and after
both contained zero requests. This verifies denial before upstream execution;
it is not a paid video result.

Administrative revocation returned HTTP 204, an independent key read returned
HTTP 401, and the same bundled MCP subprocess returned a tool error. The
temporary credential file was removed. The browser confirmation was visually
inspected at 390 pixels: it showed the selected workspace, lifetime and disabled
invocation, with document width equal to viewport width and no horizontal
overflow.

This follow-up covers the packaged connection command, actual browser approval,
private credential persistence, bundled MCP discovery, invocation denial and
revocation. It does not establish loading or operation inside Codex, Claude
Code or DeepSeek Harness, and does not close `CLIENT-03` or `SECURITY-03`.

## Actual native-host follow-up

These checks used installed hosts, actual generated packages and current hosted
API reads. They did not run a model-agent task or use a fixture HTTP service.
They remain development-artifact evidence, not final published qualification.

Claude Code 2.1.211 loaded the standalone artifact from `653a77ed` with its native
plugin-directory option in a task-created isolated configuration/workspace.
Its component inventory identified Niu 0.3.0, the `niu` and `niu-connect` skills,
and one MCP service. Its native MCP health command resolved the plugin-root path,
started the bundled stdio executable and reported Connected. The explicitly
selected credential path was absent; this checks host loading and transport,
not authenticated Claude Code tool execution or onboarding.

A marketplace built from `864790fb` was installed by Codex CLI 0.169.0 through
its native plugin command. A separate native inventory read reported the plugin
installed and enabled. All 33 installed files matched the generated artifact's
SHA-256 map byte-for-byte. Native uninstall removed the package cache, and parsed
user configuration afterward exactly matched the pre-install configuration.
An unrelated, preexisting invalid marketplace initially blocked host discovery;
a process-only source override selected the task-built marketplace. The original
marketplace configuration was not repaired or replaced. No model-agent turn or
Codex-authenticated MCP operation was performed.

DeepSeek Harness 0.2.1-rc.5 installed the current bundle in an isolated native
profile. Its actual tool/skill services discovered Niu. In the same running host,
`inspect_key` first returned a missing-credential error, then loaded a newly issued
15-minute staging credential and executed `inspect_key` and `list_models`.
Independent HTTP reads matched stable grant identity/permissions and model data.
The model response's `selected_at` represented separate read times 46 seconds
apart and was checked separately from content equality.

Administrative revocation returned HTTP 204; an independent request with the
original credential returned HTTP 401, and the same native host rejected the
revoked credential and its subsequent removal. The key-scoped administrative
attempt inventory was empty. Temporary credentials were removed and the native
package uninstalled.

The first unload assertion incorrectly expected host-shared MCP resource tools
to remain after removing the only MCP connection. This is excluded as a Niu
defect claim. A separate real two-connection host run retained a peer bundled MCP
process while unloading Niu. Every other tool remained registered, the peer
continued responding identically, and Niu's skill provider disappeared. Native
uninstall and a subsequent profile dump independently confirmed package removal.
Neither connection used a simulated gateway or dispatched inference.

These observations add native loading, install identity, authenticated reads,
credential reload/revocation and unload coexistence. Final-candidate artifacts,
native authorized inference/result inspection, complete onboarding and published
installation remain required under `CLIENT-03`.

## Current candidate native invocation and result inspection

A fresh DeepSeek Harness bundle was built from `4c78a70b`. Its complete source
inputs (SDKs, integrations, builders, bundled reference documents, branding,
version and license) were independently compared with deployed core
`3f949559156ff2499a900e6890b3e29ed6ed4dde`; there were no differences.
The output files were individually SHA-256 recorded. This is a development
candidate artifact, not a claim about a published package or release tag.

The actual installed DeepSeek Harness `0.2.1-rc.5` loaded this bundle in an
isolated profile. A deterministic native runtime probe called its registered Niu
tools; no coding-agent task or delegated model agent was started. With no
credential, key inspection failed. A fresh one-hour, single-model credential
with a zero-USD Niu cap was then written to the explicit private credential file.
The same process discovered the permitted DeepSeek model and independently
checked its zero customer rates, minimum charge and request fee before invocation.

The host's `create_chat_completion` tool returned exactly
`NATIVE_FINAL_20261118_0445`, with 45 input and 41 output tokens (including 29
reported reasoning tokens). Its `get_generation` tool returned
`confirmed_completed`, provider-reported usage and a zero customer charge.
A separate direct HTTP generation read matched the complete tool response.
Independent administrative request inventory contained exactly one record,
with the same attempt identity, token counts and customer charge.

The credential was revoked and direct HTTP returned 401. The same native host
process rejected it, then also rejected the removed credential file. The host
was stopped, its task plugin was uninstalled, and a native profile dump confirmed
that the Niu plugin was no longer configured. Active credential material was
removed. This verifies current native discovery, invocation, result inspection
and revocation recovery; it does not establish positive-price billing, published
artifact identity, or the remaining host-specific onboarding flows.

## Codex native authenticated read and recovery follow-up

At 2026-11-18 00:52 UTC, Codex CLI 0.169.0 loaded the standalone plugin
runtime built from `4a76b1c1` against hosted core `c2d3634e`. The 33 generated
files were individually SHA-256 recorded. This was a development artifact,
not a published candidate. Process-only configuration selected the bundled
MCP executable and a private credential path; no user configuration was edited.

The actual native app-server protocol created an ephemeral runtime and reported
one selected MCP service with 51 tools. Deterministic native tool calls started
no model-agent turn. `inspect_key` initially reported the missing credential.
After writing a fresh, 15-minute, single-model credential, the same native host
executed `inspect_key` and `list_models`. Independent direct HTTP reads matched
all fields except the key usage-window end, which reflected reads 1.1 seconds
apart. The independent key-scoped request inventory contained zero requests;
no inference or Provider charge was generated.

Administrative revocation returned HTTP 204 and an independent key read returned
401. The same native host rejected both the revoked credential and its subsequent
file removal. The temporary token was removed, the task-owned host stopped, and
the user configuration remained byte-for-byte unchanged. This qualifies native
authenticated discovery and credential recovery for these development inputs;
it does not qualify Codex inference, host-specific browser onboarding, or final
published installation. The existing `CLIENT-03` ownership and open acceptance
scope are preserved.

The subsequent Codex native invocation used the same built runtime and a fresh
15-minute credential restricted to `qiniu/deepseek-v4.1-flash`, with a zero-USD
Niu spending cap. A current model read independently confirmed zero prompt and
completion rates, minimum charge and request fee before submission. The native
`create_chat_completion` tool returned exactly `CODEX_NATIVE_20261118_0058` for
the current input. The native `get_generation` response exactly matched an
independent direct HTTP read. Administrative request inventory contained exactly
one matching `confirmed_completed` attempt, with 48 prompt tokens, 91 completion
tokens and zero customer charge. This is an actual model completion dispatched
through a deterministic native tool call, not a coding-agent task or fixture.

Revocation again returned 204, independent access returned 401, and the same host
rejected revoked and removed credentials. The task host stopped and user
configuration remained byte-identical. This adds Codex native invocation and
result inspection for the recorded development artifact. It does not establish
positive-price billing or replace final published-artifact and onboarding
acceptance.
