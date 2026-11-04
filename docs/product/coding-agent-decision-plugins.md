# Coding-agent decision plugins

Feature request, 2026-11-04. Tracking: `niu-rctv`. This describes proposed capabilities, not shipped behavior.

## Purpose and independent configuration

Provide host-native integrations for Claude Code, Codex and DeepSeek Harness using each host's supported extension mechanisms. Qualify capabilities separately for each host; do not promise hooks a host does not expose.

Keep three independent configuration surfaces:

- Management connection: discovery, login handoff, scoped authorization, configuration, verification and recovery through shared Niu contracts.
- Optional inference connection: explicitly configure a Niu model or routing endpoint as the host's inference source. Installing management access must not change the host's model, subscriptions or billing source.
- Optional decision hooks: use authorized decision models around the host's lifecycle. Each hook can be enabled, configured and disabled independently of inference routing.

## Optional lifecycle capabilities

| Capability | Behavior |
| --- | --- |
| Task triage | Classify task needs and ambiguity; provide a concise advisory brief without changing the user's goal. |
| Tool review | Assess supported tool calls for risk, secret exposure and task relevance; allow, request approval or deny within granted authority. |
| Tool-result screening | Identify suspected instruction injection; preserve the original host record under its access rules and make any filtering visible and recoverable. |
| Completion check | Check completion and verification evidence; request bounded follow-up work or identify a required human action. |
| Structured decision tool | Expose schema-defined classification or scoring for individual or batch inputs, with per-item errors and explicit output semantics. |
| Optional privacy masking | Mask configured sensitive categories before forwarding content to the generation model. Explain that remote classification itself may receive original content. |

Model assessments are advisory evidence, not a replacement for sandboxing, deterministic controls or human authority. Hook permissions cannot exceed host or Niu grants. An approval from a classifier must never bypass a required host approval.

## Configuration, evidence and recovery

Explain which inputs leave the host, which service receives them, retention behavior and expected charges before activation. Reuse secure host credential storage where available; provide revocation and removal without exposing credentials in prompts, traces or configuration output.

Expose each decision's role, model, latency, outcome and actionable reason within supported host UI or logs. Keep plugin evidence separate from model-visible instructions. Minimize and redact recorded data; do not collect unrelated host telemetry. Distinguish host hooks from server-side Niu platform events.

Define explicit timeout and failure behavior per hook. A failed decision service must not silently grant additional authority. Bound completion retries, total hook calls and spend; support cancellation and prevent self-triggering loops. Disabling or removing the integration must stop future hooks and restore only settings it owns, preserving subsequent user edits.

## Acceptance and relationship to Routing

Verify install, login, scoped operation, independent enablement, approval handling, unavailable services, cancellation, bounded retries, evidence presentation, revocation and removal on each qualified host. Record unsupported host capabilities explicitly. Demonstrate hooks with an independently selected inference provider as well as with Niu routing.

[Intelligent Routing](intelligent-routing.md) is a separate server capability. Plugins may configure or invoke it under explicit authorization, but neither feature requires the other. This request does not authorize implementation, automatic key creation, terms acceptance or a release.
