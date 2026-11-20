# Competitive product audit: The Model Platform for Agents

Status: review record, 2026-11-07. This is not a release qualification or a claim that every described capability ships.

## Method and evidence

- Agreed direction: [product focus](product-focus.md) and
  [agent-oriented principles](agent-oriented-principles.md).
- Hosted staging: core `d887360f`, cloud `281a09e`, `https://staging.niu.io`.
- Direct UX observations: [staging UX review](../reviews/staging-ux-2026-11-07.md).
- Hosted capability evidence in this work: provider key-only discovery, a real
  Qiniu text request, a real BabelArk embedding request, and a platform-generated
  BabelArk `wan3.0-video` clip with saved result.
- Competitor references inspected for capability comparison:
  - OpenRouter routing and Auto Router documentation:
    <https://openrouter.ai/docs/guides/routing/routers/overview>,
    <https://openrouter.ai/docs/guides/routing/routers/auto-router>
  - Manus Projects/agent-workspace documentation:
    <https://manus.im/docs/features/projects>
  - LiteLLM adaptive/auto routing documentation:
    <https://docs.litellm.ai/docs/adaptive_router.md>,
    <https://docs.litellm.ai/docs/auto_router/index.md>

These references establish public competitor capabilities, not Niu parity or
superiority. No paid competitor benchmark was run.

## Story-led journeys

### Story A: an agent discovers and connects Niu

The landing page now leads with an agent-install prompt, then discovery links to
models and docs. This matches the agreed direction better than a human-first
benchmark hero. The remaining gap is structured capability discovery after
connection: the agent still needs a stable way to learn current grants,
routing revisions, budgets, prices and recovery behavior without a human
copying dashboard data.

### Story B: a person reviews a consequential change

The landing and docs explain that people approve access. The dashboard exposes
Providers, Routing, Customers, financial reports and audit logs. The review
path is credible for an administrator, but the approval handoff is still
manual: a proposal, its scope/consequences, and a readback after approval are
not one structured object. The 390 px provider-connect dialog and keyboard
ordering are usable; the missing piece is the review handoff, not the dialog.

### Story C: an agent builds and revises a routing policy

The public model catalog provides discovery. Routing pages exist at workspace
and admin scope. Competitors (OpenRouter Auto Router, LiteLLM adaptive router)
market automatic routing as a first-class outcome. Niu's differentiator should
not be a hidden universal "best model" policy: it should be an inspectable,
scenario-specific policy with revision history, route evidence and cost
boundaries. Current UI supports configuration, but agent-readable proposal,
validation and recovery contracts remain the gap.

### Story D: an operator supplies a model and sells it

Provider key-only discovery is now real. Commercial supply still requires
offers, rates, customer prices and accounting, and the staged admin experience
distinguishes configured supply from availability. BabelArk video/embeddings
and Qiniu text demonstrate both owner-funded and commercial-style paths. The
remaining friction is duplicate or ambiguous connection identity and the
amount of manual commercial configuration; it is a configuration/readback
problem, not a missing catalog.

### Story E: a person or agent investigates a request

Logs, request attempts, latency, usage and customer charges are visible, with
explicit unknown/unresolved states. This is stronger than a simple proxy. The
current weak spot is delayed first paint on cold Credits/evaluations/overview
requests and the absence of a saved-attachment lifecycle for Chat.

## Capability disposition

| Capability | Disposition | Reason |
| --- | --- | --- |
| Agent-led landing and install prompt | Keep and refine | Matches current direction; no rejected redesign reintroduced |
| Public model discovery and customer prices | Keep | Necessary decision evidence |
| Provider key-only connection | Keep | Verified with 89-model Qiniu discovery and real request |
| Personal owner-funded multimodal/video | Keep | BabelArk video/embedding verified |
| Commercial offers/prices | Keep, simplify | Required for resale; current configuration is heavy |
| Routing proposals and readback | Build next | Agent needs structured propose/validate/apply/verify |
| Chat attachments | Build before claiming multimodal Chat | No saved-attachment lifecycle yet |
| Billing cancellation/adjustment | Build/qualify | Charges exist; cancellation/adjustment evidence is incomplete |
| Automatic universal router | Reject as promise | Conflicts with agent-owned quality/cost judgment |
| Prompt rewriting/context trimming | Defer | Outside current release scope |
| External agent telemetry | Reject | Outside Niu ownership |

## Root causes and coverage gaps

1. **Information is present but not always structured for agents.** Dashboards
   and APIs expose evidence, but approval handoffs and routing proposals are not
   one object an agent can inspect and resume.
2. **Commercial configuration remains operator-heavy.** Offers, prices and
   routes require several independent revisions; duplicate connection names
   make supply identity harder to read.
3. **Recovery is strong for transport, weaker for content.** Unknown requests and
   charges are explicit, but saved Chat attachments and billing adjustment
   recovery are incomplete.
4. **Cold-start loading is visible.** Credits, evaluations and overview can show
   an empty or loading surface for several seconds; the state is eventually
   correct but not self-explanatory at first paint.
5. **Release evidence spans too few environments.** Router/rollback and
   in-flight stream qualification still need a second staging environment.

## Target design

- **Agent-first entry:** keep the install prompt and discovery links; make the
  next step a structured connection/capability handoff, not a manual API-key
  relay.
- **One reviewable policy object:** candidate set, scenario, budget, revision,
  proposal and readback, with human approval where authority requires it.
- **Evidence-first management:** every route, price and charge links to a
  stable request revision, with unknown values preserved.
- **Owner-funded by default; resale optional:** keep personal upstream keys
  separate from commercial qualification and customer funds.
- **Human surfaces for review:** model trials, request logs and saved results
  remain first-class; do not reduce the product to an agent-only API.
- **Recovery as a product surface:** every uncertain mutation exposes current
  state, a safe next action and an explicit no-blind-replay rule.

## Prioritized implementation requirements

1. Structured agent connection/capability handoff and routing proposal/readback.
2. Chat attachment save/reload/delete/recovery lifecycle.
3. Billing cancellation and authorized-adjustment qualification.
4. Commercial offer/price/route simplification with unambiguous connection
   identity.
5. Second staging environment, migration/rollback and in-flight stream
   qualification.
6. Cold-start loading states for Credits, evaluations and overview.
7. Provider adapter/price provenance coverage for the remaining supported
   providers.

## Human and agent recovery acceptance

- An agent can retrieve current scope, grants, prices, routing revision and
  budget without a dashboard.
- A proposed change names its resource, scope, consequences and approval need.
- The agent can read back the persisted revision after approval, or resume from
  an actionable conflict without replaying an uncertain mutation.
- A person can see the same change in the dashboard and reverse it safely.
- Missing/stale evidence remains labeled; no unknown price or charge becomes
  zero.
- Every uncertain charge, delivery or video job has an explicit reconciliation
  path.

## Limits

No competitor pricing benchmark, task-quality comparison or paid upstream
evaluation was run. The competitor references are public documentation only.
No claim is made that Niu is cheaper, faster or better for a workload without
the corresponding measured evidence.
