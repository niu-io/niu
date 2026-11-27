# Can the user make the decision and take the next action?

Staging task walkthrough, 26 November 2026. The operator used the staging demo sign-in, entered administration through the visible mode switch, inspected saved records and returned to workspace surfaces. The pricing revision exercise used an unsaved draft. This was an expert walkthrough. No usability success rates, account balances, customer records or private captures are published here.

The [product principles](../product/agent-oriented-principles.md) assign commercial policy and authorization to people. Agents can manage models within those limits. This review asks what the person must see to authorize spending, choose a price, investigate an exception or correct a configuration.

## Observations and acceptance

“Live” means the relevant content or transition was observed in this staging session. “Source” identifies a conditional path whose triggering records were unavailable. Proposed changes below are acceptance criteria, not implemented behavior.

| User's question or action | What happened and what would let the user finish | Evidence and tracking |
| --- | --- | --- |
| Did we make money this month? | The top of the P&L gave a signed contribution. Every active model in the model view had pending contribution. Show whether the headline is final, partial or calculated on a different basis, and reconcile the two views. | Live, finance report, niu-z2dq |
| Why is profit pending? | Model rows counted unresolved items. Their links led to the Provider, with no link on the count to the records responsible. Open a model- and period-scoped reconciliation list. | Live, model profit view, niu-z2dq |
| What is the actual purchase rate? | Distinct small input and output prices can both display below the same precision threshold. The displayed upper bound cannot be used to reproduce a comparison. Make exact units and amounts available at the point of inspection. | Live, agreed quote column, niu-z2dq and niu-h96m |
| What does the large profit number include? | Source falls back from recognized revenue to a known subtotal, then subtracts cohort payables. A missing payable is skipped during summation. Verify completeness and align recognition basis before presenting a final margin. Impact on any individual settled transaction remains unverified. | Source, commercial-position/page.tsx, niu-z2dq |
| Why is a sale below cost? | Warning details omit both operands, and the history warning describes request-level loss from a unit-rate comparison. Expose selling price, procurement price, currency, unit, supplier, band and difference together. | Source, pricing-health.tsx, retail-pricing/page.tsx and pricing_health.rs, niu-h96m |
| How much room do I have to change a price? | The primary detail entry opened a centered selling-price history. Even after it loaded, the current selling schedule had no matching purchase rate. Open a right-side current comparison with history secondary. | Live, pricing directory to history, niu-h96m |
| What changed in the last publication? | History repeated full schedules including unchanged optional dimensions, request fee and minimum charge. Show the changed dimensions and old/new values first, with the full revision available. | Live, pricing history, niu-x6qe |
| Which rate applies at the threshold? | Adding a threshold to a draft showed another group of inputs, separated from the base rates by request-level charges. Show inclusive input-token bands and their effective rates together. | Live, new unsaved band, niu-x6qe |
| Can I recover an edit after dismissing it? | Entered a threshold, pressed Escape, reopened the same price, and the draft was gone without a discard decision. Preserve the draft or offer a discard choice for dirty forms. | Live, exact dismissal and revisit, niu-x6qe |
| Which list prices need attention? | A row repeated inactive supply in two columns. The introductory paragraph directed the reader to customer discounts and billing settings. Keep the scope filter and show each exception once near the amount it affects. | Live, standard prices, niu-a7xl |
| Find a model's price anywhere in the directory | The text filter and the count labeled “All models” use loaded rows. A later-page match requires loading additional pages manually. Search across the directory and make totals authoritative. | Source, retail-pricing/page.tsx, niu-0u4d |
| Will this model trial debit my balance? | The catalog showed an upstream free-plan description promising no balance deduction alongside a positive workspace selling rate. Show applicable workspace terms at the trial action and qualify any external plan details. Actual debit untested. | Live, workspace model card, niu-rhsa |
| Which developer am I filtering for? | A developer filter admits that its identities are inferred from model IDs. A Provider prefix may identify a distributor. Use verified attribution or offer a clearly named source filter with unknown values. | Live, workspace models, niu-7xhb |
| Where would my Provider key go? | A branded Provider configuration displayed unconfigured rows for another brand's endpoint alongside its own active endpoint. Both offered credential setup. Make effective destination and ownership unambiguous before any secret entry. | Live inspection only, niu-4yad |
| How do I finish connecting a new Provider? | An unconfigured detail showed Add key, Configure key and enable, Edit key, and a cooldown action around the missing credential. Give a first-time operator a single applicable setup action and move post-setup controls to configured rows. | Live, pending Provider, niu-7xhb |
| What is blocking payments? | The overview said callback verification was pending. The payments page marked notifications verified and merchant account review outstanding. Name the actual missing check and lead directly to it. | Live, overview to payment setup, niu-5k47 |
| How many requests actually incurred charges? | The workspace summary foregrounded “No Niu charge” while the breakdown distinguished settled zero-price requests from an upstream-funded request. Show the settled amount and counts by charge state without forcing a second-page reconciliation. | Live, overview, usage and logs, niu-7xhb |
| How do I recover from a failed model trial? | In a Chinese session, a failed response showed a generic English upstream HTTP error and a second message about missing output. The request log knew the HTTP status. Surface the available reason and keep the direct request link. | Live, historical response and corresponding log, niu-7xhb |
| Find an old administrative change | Audit search filters only fetched events but the empty state claims no events match. A user can stop before searching the page containing the event. Return server-filtered matches or explicitly offer a search of remaining history. | Source, audit-logs/page.tsx, niu-0u4d |
| Understand what was removed | The Chinese audit log rendered an English retirement event with a numeric target. Show the affected resource type, display name when recorded, and identifier as backup. | Live, audit log, niu-7xhb |
| Identify all affected models during an incident | The workspace notice displays up to three models per group followed by an ellipsis. Give users a way to inspect the complete affected set and their own related failures. | Source, WorkspaceIncidentNotice.tsx, niu-7xhb |
| Save my first asset | The empty library told the user to save a generation result, while its visible primary action added an image. Offer a clearly labeled path for each supported source. | Live, empty asset library, related historical finding niu-a92e |
| Add workspace members | Workspace settings sends the user to account and organization settings. Preserve the workspace as the destination context and show the resulting scope before assignment. The actual invitation flow was not submitted. | Live entry point only, niu-7xhb |

## Capture and visual review ledger

Desktop 1280 × 850 and phone 390 × 850. Both sizes use staging's current Chinese UI. The review inspected four contact sheets and the corresponding live page text. A rendered frame establishes layout only. It does not verify a submitted transaction. A separate split-width pass was not collected.

| Surface family | Desktop and phone captures, with paired entry counts | Limits |
| --- | --- | --- |
| Administration | 16 pairs including overview, two Provider details, pricing, customers, reports, audit, settings, incidents, payments, routing, registration queue and policy, branding and a repeat visit to reports | Initial report frame still loading; second visit and model-profit tab settled. Pricing history and draft threshold also inspected interactively. No payment, credential or pricing mutation. |
| Workspace and account | 19 pairs covering overview, catalog, keys, executions, usage, settings, generations, activity, directory, connection approval entry, routing, evaluations, guardrails, events, billing, assets and key creation entry including repeats | Key directory was revisited after loading. The authenticated public catalog redirected to workspace models, counted separately below. No paid invocation, access grant or secret issuance. |
| Public entry and reference | 4 pairs for home, signed-in public catalog entry, docs index and API explorer | Catalog redirected. Individual generated REST and SDK entries, anonymous catalog, marketing children and all error states were not swept. |

The 39 pairs include redirects and repeat visits. Major role-specific exclusions include a customer without owner rights, a newly approved applicant, a real external agent connection and a user recovering from a declined payment. The present evidence supports the named findings and leaves those outcomes open. Historical screenshots from earlier reviews were not treated as verification of current behavior.

## Implementation walkthrough, 27 November 2026

A production build of the candidate dashboard was served to a browser using the real staging API. An authenticated administrator opened a populated standard price at 1280 × 850 and 390 × 850, expanded its history, dismissed the sheet and returned to the directory. The viewport remained within its horizontal bounds. A new 128,000-token draft band displayed a base upper bound of 127,999. Escape followed by Keep editing retained the value. Discard changes closed the editor. No price was published. The actual-margin action opened the report for the selected model and showed one matching row in the reviewed period.

The live finance report withheld the profit headline for the incomplete period. An unconfigured legacy connection in a branded Provider opened a new scoped editor without prefilling the rival Provider endpoint. No secret was entered. The populated workspace catalog displayed trial prices separately from upstream descriptions. These observations cover the candidate client with the deployed API. The new gateway projections for exact cost operands and pending attempt evidence require matching gateway and dashboard artifacts for hosted acceptance.

## Hosted verification on 27 November 2026

An administrator exercised the deployed dashboard at 1366, 800 and 390 pixels wide. The financial statement and member checks used release commit `2f5a3974`. The purchase rate, unresolved request and credential checks used `b4a5334d`.

| Task | Observed result | Bead |
| --- | --- | --- |
| Inspect a selling price against procurement | Two active text schedules had an exact purchase rate of USD 0.000000001 per million input and output tokens. The original offer revisions and current standard schedules independently confirmed unit spreads of USD 0.009999999 and −0.000000001. Only the negative spread triggered the warning. The sheet kept each amount on one line at all three widths. A third, inactive schedule kept its saved selling rates and displayed the absence of an active purchase quote. | niu-h96m |
| Investigate incomplete contribution | The seven-day headline linked to model economics and moved keyboard focus to its heading. A separate API read using the exact displayed interval confirmed six unresolved requests. In the later release, the 30-day model sheets showed six requests for one model and two for another. Loading the sixth request preserved the first five. All eight identifiers and the two unverified revenue-source flags matched the API. | niu-z2dq |
| Read financial changes on a phone | The operating statement displayed nine rows and the cash statement eleven. Every final column fit inside the 318-pixel phone table area. | niu-z2dq |
| Inspect a legacy branded credential destination | Both existing mismatched connection rows opened the owning Provider's preset. Each editor showed the expected endpoint, an empty key field and a disabled submit action. Cancel restored focus to the selected row. No credential was submitted. | niu-4yad |
| Inspect workspace membership | Opening Members from workspace settings retained the workspace scope. Organization-wide membership remained reachable, and dismissing Settings returned to the original workspace. Member rows switched to a grid on the phone without horizontal overflow. | niu-7xhb |

The purchase comparison establishes quoted text-unit spread. Realized request contribution requires separate charge and payable evidence. These observations do not establish active media procurement, a credit-denominated tariff publication or end-to-end invitation acceptance.

## Hosted walkthrough of release commit 48908103, 27 November 2026

At 1366, 800 and 390 pixels wide, opening the empty workspace asset library showed one upload action. Selecting Videos opened the filtered empty state. Clearing the filter restored the upload action. Before the layout change, the title and action sat 190–194 pixels above the midpoint of the available canvas. In this release, the content was within 2, 14 and 18 pixels of that midpoint respectively in both views. Neither state introduced horizontal page scrolling. This exercise covered the standalone library. The embedded generation panel has a separate focus check recorded in Beads (`niu-a92e`).

At the same three widths, the workspace model catalog and detail pages agreed with the published standard schedules for both available text models. The model with “Free” in its name showed USD 0.01 per million input and output tokens. The zero-rate model showed a Free label in the directory and zero input and output prices in detail. Independent inspection of both schedules confirmed zero fixed fees, zero minimum charges and no context tiers. The walkthrough consumed no inference. Conditional prices and media tariffs require separate inputs (`niu-rhsa`).

## Hosted walkthrough of release commit 5731fbb6, 27 November 2026

Opening the text price publisher at 1366, 800 and 390 pixels showed the same 94 model aliases as an independent read of the full 98-model pricing inventory. The four video-only models were absent. With workspace credits unconfigured, the credit publisher was disabled and the settings entry remained available. The walkthrough left prices untouched (`niu-h96m`).

In Generations at each width, opening the asset panel, choosing Videos, clearing the filter and closing the panel returned keyboard focus to the entry used to open it. On desktop and tablet this was the asset panel toggle. On the phone it was the generation actions menu button. The route stayed on Generations and the page fit the viewport at each step checked. Together with the standalone library walkthrough above, this verifies the two library entry points (`niu-a92e`).
