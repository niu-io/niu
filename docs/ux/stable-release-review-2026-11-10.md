# Stable release UX review

This is a source review of the current local candidate and a coverage map for rendered verification. Related work is tracked by niu-uys9 and GitHub #122. Workspace Routing is deferred under GitHub #123.

| Journey | Source finding or review question | Release evidence required |
| --- | --- | --- |
| Sign in, installation, invitation | Separate routes exist. The return to a scoped resource still needs verification. | New account, expired invite, denied access and return to the original destination after authentication. |
| Workspace and account switch | One shared sidebar is planned. Verify scope changes from a nested resource and a drawer. | Compare destination and selected workspace after switching, reload and browser back. Verify theme and identity in expanded, collapsed and narrow modes. |
| Agent setup | The dialog copies instructions. Copy success alone does not verify agent authorization. | Label the handoff accurately and verify one connection from the intended deployment with bounded permissions. |
| Overview and Models | Review empty and populated outcomes, filters, capability evidence and trial entry. | Confirm unsupported or unverified capabilities remain distinguishable. Open and dismiss right filters without shifting the primary navigation. |
| API keys and Logs | Review status selection, partial counts, grant detail and failed or uncertain request outcomes. | Test keyboard and narrow layouts. Verify users cannot infer settlement from HTTP status. |
| Generations and Assets | Assets remains a primary item in source although the reviewed design places it inside Generations. | Reconcile placement before adopting the mock. Verify chat and video history, durable output, expired preview and missing-key recovery. |
| Usage and Billing | Source still exposes Workspace Billing and hides Usage. The design assigns usage and attributable charges to workspace and funding and statements to organization. | Verify actual data ownership and permission boundaries before changing labels or links. Walk from usage to an authorized statement without losing scope. |
| Workspace Settings and Guardrails | Guardrails still appears as a workspace peer in the navigation. The approved direction places it in workspace settings. | Verify discoverability and inherited policy in a key detail. Establish actual enforcement coverage before describing default outbound secret protection as active. |
| Routing and Evaluations | Default workspace navigation hides them. The workspace warmup still preloads both page chunks and fetches Routing data. Authorized legacy routes remain. | Confirm the stable first visit does not depend on deferred features. Verify direct links still work. Treat future Labs access as a separate release decision. |
| Account, organization, Members and Credits | Settings tabs and account menu expose entry points with different permissions. | Verify each role and billing mode, funding recovery and membership changes with safe fixtures. |
| Provider and platform administration | Provider detail and administration are separate scopes. Platform Routing is distinct from the deferred workspace entry. | Verify administrator-only access, readiness versus verification, commercial confidentiality, pricing recovery and invalid mode-change previews. |
| Docs, website and fallbacks | Public docs still describe Routing and the website preview needs reconciliation with the release shell. | Preserve technical API documentation, distinguish deferred UI, verify links, and review missing or unauthorized destinations. |

Priority for review is workspace entry and authorization, the model-to-first-use journey, then usage and financial scope. Render actual candidate pages at desktop, split widths and mobile. Include open menus and drawers, keyboard focus, loading, empty, denied, and failure states. The source inventory and earlier mockups do not establish release acceptance.

## Local candidate verification

The revised scope is published on GitHub #122. Dashboard integration and Generations layout tests passed all 67 cases. Type checking and translation audit passed. The bilingual website check and production build passed.

At 1600px in the local packaged dashboard, the workspace header showed the Niu mark and workspace switcher on one row. Usage exposed the scoped statements link, Settings exposed Guardrails, and Generations exposed Assets. Opening history preserved one primary navigation and placed the history panel at x=1344–1600. At 390px the history opened as its own drawer, and the document and toolbar widths were both 390px. This browser pass used the existing local fixture account and did not submit a paid model call. Staging, full role coverage, and the rest of the release journeys remain separate acceptance steps.

The subsequent Generations review superseded the right-side session history placement. Session history is local navigation and now opens on the left of the conversation beside the workspace sidebar, with its own trigger and mobile drawer. Browser inspection confirmed the left-side configuration and keyboard expansion. The final desktop bounds and post-change mobile appearance still need inspection. All 1,296 Dashboard tests passed in the full run, and the three history tests passed in a focused run after the placement change. Dashboard lint passed.

Final local Generations recheck: the collapsed primary sidebar spans x=0–56, history x=56–312, and chat starts at x=312. Expanded bounds are x=0–256, x=256–512 and x=512. At 390px, selecting a saved session changed the heading, dismissed the drawer and left document width at 390px. All 67 affected tests passed after the alignment correction.
