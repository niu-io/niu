# Independent product journey review — 2026-11-06

This is a bounded independent review, not product or release acceptance. Initial handoff HEAD was `0db85dd3`; another worker advanced HEAD and changed routes during the walkthrough. The local Vite process served the changing working tree, so observations must be repeated on an identified immutable candidate. A fresh isolated resale-mode database and local gateway were used. No production credentials, paid upstream, real payment or external notification was used. Fixture outcomes are not evidence.

## Intent and task boundaries

The agreed direction in `docs/product/agent-oriented-principles.md` and proposed story design in `docs/product/story-led-platform-design.md` assigns task judgment to the agent, while Niu provides trustworthy information, scoped authority and operational recovery. A person should be able to understand and authorize consequences without knowing internal names or relaying model inventories. The intended first-value path is connect an agent, obtain available model access, safely execute an actual task and inspect the result; setup and saved configuration are not proof of execution.

Retain the separation between workspace configuration, model discovery, authorized agent operations and optional platform/commercial administration because their ownership and financial boundaries differ. Connect their entry points around the user's task: overview should guide setup or handoff to the responsible owner; a human-facing connect action should provide human orientation before machine-readable installation instructions; routing, evaluation and event pages should lead back to agent connection and task outcomes. Do not merge procurement into customer billing. The current no-supply walk does not establish that these surface boundaries are otherwise wrong.

## Findings

### P1 — Consequential management permissions are hidden at consent

The actual CLI requested `pools:write` in the isolated workspace. The approval screen's default state said one workspace management operation was requested and advised reviewing Advanced options, but identified neither the operation nor its write effect. The consent checkbox enabled Authorize without opening Advanced. I approved in that state: the CLI obtained a credential and actual `/v1/key` readback reported `pools:write` with model invocation disabled. This is an informed-consent defect, not evidence of a backend authorization bypass. Expanding Advanced reveals “Create and change workspace model routing.” The user should see named consequential operations and their scope before the consent control, with technical explanation optional; changed requests should invalidate consent. Tracks `niu-ya50.2`.

### P1 — New user cannot proceed from an empty workspace to first value

After actual isolated sign-in, Overview said an administrator must connect a Provider. Its first step, Browse models, led to an empty Models page repeating that instruction. Generations similarly showed no available text model and example tasks that could not be exercised. These states honestly avoid inventing supply, but they offer no specific owner handoff or role-appropriate setup and do not explain how the user gets their agent connected. A member needs an actionable route to the responsible operator; an authorized setup owner needs the real prerequisite flow. Confirm access, supply, funding and successful request separately. This is the observed zero-supply condition, not a claim that configured workspaces fail. Tracks `niu-ya50`.

### P1 — Human agent-connection action leads to agent instructions and unavailable release

Routing, Evaluations and Event subscriptions empty states offer Connect your agent. Following the Event subscriptions link opened `/docs/install.md`, raw long-form instructions addressed to coding agents. The document correctly requires checking release assets; the read-only GitHub API request for `niu-io/niu` release tag `v0.3.0` returned 404 at review time. This is a discovery/first-use gap, not a claim that the underlying APIs do not exist. Provide a human-oriented connection handoff that states actual artifact availability and a supported next step, then independently verify the real host installation and authorization. Existing issue `niu-epp` has this evidence.

### P1 — Team onboarding remains incomplete

`docs/product/member-invitation-flow.md` explicitly records that a new recipient without an existing account/password cannot accept, saved email is not verified mailbox ownership, link delivery is manual and the redemption secret is in the URL path. The first-access Bead `niu-287.5` was closed on login copy alone although its own criteria include invite, recovery and roles. Those limits are documented source evidence, not a freshly exercised invitation or a demonstrated exploit. Keep first-access and invitation work open until a supported recipient can complete and recover the actual journey; establish an identity-binding and link-handling policy before claiming verified email.

## Rendered and evidence limits

At desktop, the Overview has readable hierarchy, a clear no-model explanation and visible navigation; its central empty state makes the lack of a path to a real first result prominent. At 390 CSS pixels the same page measured document width 390 and displayed all three cards without horizontal overflow. Generations devotes substantial area to examples while explicitly reporting no model; visual prominence does not establish a usable action. The authorization page plainly distinguishes model calls and billing and defaults calls off, which should be retained, but hides the requested management operation. These observations apply [WCAG 2.2 labels and instructions](https://www.w3.org/TR/WCAG22/#labels-or-instructions) and [reflow](https://www.w3.org/TR/WCAG22/#reflow), and the Niu task/authority principle; they are not a complete accessibility audit. Existing guidance, populated models, paid approval, full invitation, configurable supply, fallback and supported-host installation were not independently exercised in this pass. No conclusion about the hosted candidate follows.
