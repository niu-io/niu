# Surface coverage reconciliation

Current route source: `apps/dashboard/src/app/routes.tsx`, working tree based on `241872d0`. This register reconciles the goal/journey ledger with implemented entry points. It does not promote an existing route into a required product capability, or earlier acceptance into current evidence. The [historical workflow audit](../product/page-workflow-audit.md) supplies discovery leads only.

| Surface family / canonical route | Blueprint relation | Current evidence | Remaining read-only selection or execution gate |
| --- | --- | --- | --- |
| Login and installation / `/login`, `/installation` | J3/J8 access | E42 actual signed-in Login redirect and Installation at 390px; source helper inspected | Anonymous Login remains uninspected. Do not sign out or replace credentials merely to get a screenshot; recovery contract and isolated session evidence pending |
| Workspace directory / `/workspaces` | J3/J8 scope | Existing directory and unsaved creation, E22 | Empty/error, independent role, collision and saved lifecycle gates |
| Workspace overview | J6 decision summary | E06/E28 chart and request reads | Unknown usage and ordinary-role scope |
| Workspace keys list/create/detail | J3/J7 access and controls | E16/E20/E31; unsaved edit/cancel and 320px detail | Creation secret, rotation/revocation, enforcement and conflict execution |
| Workspace Users | J3/J8 membership | E04/E23 populated narrow list and access details | Independent member sign-in, permission change and revocation execution |
| Organization and workspace Settings | J2/J3/J8 ownership | E03/E28 | Saved company/workspace lifecycle and independent ownership |
| Guardrails policy/access/input/output/detectors/history/denials | J7 control | E12/E18/E30/E35; populated denial/version reads | Actual denial recovery, committed policy, conflict and runtime enforcement |
| Logs and global/workspace Activity | J6 investigation | E06/E18/E28/E32 | Populated commercial reconciliation, exports, independent access |
| Workspace Billing | J2/J4/J6 | Read-only spending/rates, source media statement consumer | Populated category/media statements, funding recovery and independent roles |
| Models list/detail | J3/J5 choice | E07/E14/E26/E27 actual filtering and launch; E44 public deployment empty state and workspace handoff | Anonymous session, populated public catalog, incomplete capability and request execution |
| Generations Chat/Video/history | J5 durable output | E06/E21/E24/E26/E29/E38–39/E46; all nine visible histories read, cancellation and expired preview distinguished | Additional rich structures not present in visible records; actual retained asset versus source reference; mutations excluded |
| Native video materials/verification | J5 supporting capability | E08/E21 context/error; E45 selected usable context with expired verification history and empty material operations | Populated material operations unavailable in selected context; actual verification/remote actions excluded |
| Admin Providers directory/detail sections | J1/J2/J6 | E01/E15/E28/E33 source variants | Credential setup, populated offers and settlements; no publication or financial mutation |
| Admin pools | J1 delivery | E09 desktop/intermediate/narrow empty and create dialog | Populated routing decision, saved setup and runtime behavior |
| Admin pricing | J2 platform selling prices | E02/E03; UX-01 corrected after user clarification | Platform-price applicability, populated history and compatibility/migration analysis; no new enrollment UI requirement |
| Admin balances/reports/payments | J4/J6 operations | E05/E10/E11/E13 | Global payment-readiness gate, actual funded/charged records and merchant activation |
| Admin settings/branding/audit | J8 installation | E13/E23/E25/E27 | Saved configuration, themes/zoom and attribution across independent roles |
| Provider member portal / `/providers/:provider/:section?` | J1/J2/J6 counterpart | E33/E37 current account can read both available businesses; one populated offer list, no earnings | Populated earnings, independent Provider-only isolation and manager actions |
| Global Account/Appearance/Billing/Payments/About | J3/J4/J8 | E05/E23/E25/E28/E40; Account/password disclosure and Video return checked | Other direct-entry return paths; preference/credential/funding commits excluded |
| Served help/docs | Cross-journey support | E19/E26/E43, ordered content, 320px reflow and actual public access guide | Task-critical remaining guides and public deployment consistency |
| Legacy redirects, unavailable scope and not-found | Cross-journey recovery | E34 workspace not-found return and E36 non-default Activity alias/query/fragment verified; historical audit only for broad aliases | E41 unavailable-scope recovery checked; other aliases remain sampled rather than exhaustive; source presence is not a pass |

Use [coverage](coverage.md) for evidence strength and [findings](findings.md) for defects. Investigate feasible gaps before using execution limits to stop. This map is incomplete as a state/role matrix and is not an exhaustive UI certification.
