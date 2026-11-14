# Workspace navigation and catalog revalidation — 2026-11-14

Findings: `niu-mm90.17`, `niu-mm90.35`; additional current-state evidence for `niu-mm90.1`. Initial staging product revision was `3fc68e14`; the later live pin `970e3e18` adds documentation/tracking only, with the same product implementation. This review changes no product code.

## Navigation task paths

As the current signed-in workspace owner in User mode, followed the actual primary links for Overview, Models, API keys, Logs, Usage and Settings. Each reached the named page with its matching active navigation item and no not-found state. Generations opens its selected resource, whose prompt/title legitimately replaces the feature name in the reading header. Workspace Settings exposes General, Billing and rates, and Guardrails; Billing correctly retains Settings as its primary parent and marks the selected secondary tab.

Followed Account menu → Settings → Organization → the workspace's Members action. After the asynchronous member page actually committed, its heading was Members and its URL retained the readable workspace query scope. An initial observation still showed the preceding Organization content while navigation was pending; that frame is not treated as member-page acceptance. Repeated the complete member path at 390 px through the Settings section menu. The document remained 390 px wide and Escape returned to the originating Billing page. No invitation or member mutation was invoked.

At 390 px, opening the primary navigation Sheet exposed the same seven feature links; choosing Settings and then Billing and rates reached a readable Billing heading and selected tab. Account menu → Activity reached Activity with an explicitly named all-workspace scope, distinct from workspace Usage. Existing role-specific administration behavior is covered by its separate verification record, not inferred from this owner-mode route census.

Followed Generations → its overflow menu → Assets and waited for the actual workspace library to finish loading. The panel was named Assets and remained attached to the generation task. New generation → the content-area Video mode reached the named Video generation surface. This preserves the user's required left history and content-area mode selection, rather than adding top-level navigation entries for every secondary capability.

Current route configuration and rendered links were inspected alongside these paths. No current workspace navigation or documentation link to the removed workspace Events page was found. Legacy aliases remain routing concerns; this is not a claim that arbitrary invented URLs or every role/data combination was exhaustively tested.

## Model catalog

Inspected the actual public OpenRouter Models page and its sort interaction as a mature reference. Its sort is a neutral list utility. Retain Niu's existing shared outline sort rather than introducing another primary-action treatment. In the current Niu light theme its background is a subtle neutral tone, not a filled primary CTA; catalog names remain the strongest repeated row anchor. The historical requirement to further restyle its emphasis relative to each small per-row link is rejected as an unsupported cosmetic follow-up under the user's instruction to avoid excessive layout work. No layout pattern is replaced.

At 820 × 900, model cards led with readable catalog names and secondary callable aliases. Unpublished capability status was separate from the Try in Chat link text. Filters opened the installed sidebar Sheet with input/output/capability groups. Selecting Video output produced an apparent filter chip, readable query scope and three real model records. An independent authenticated HTTP 200 directory read contained 97 models and three catalog records explicitly advertising video output, matching that filtered result. Clearing the filter restored the full directory. Escape returned focus to Filters.

The settled sort menu was separately inspected at desktop width: Default order, Name: A–Z and Context length used radio semantics and the shared right-side check; Escape restored focus to Sort models. No sort/filter selection was persisted as a model-management mutation. The upstream-description localization finding `niu-mm90.13` remains separate and unresolved by these observations.

Viewport budget: at 820 px, the catalog fills the content lane beneath its compact header. The first row keeps the visible filter field, Filters action and neutral sort; the data list starts immediately below its count. The open filter Sheet occupies roughly x532–820 with its own scrollable groups. The filtered three-row list uses the same lane and preserves visible model/price/capability grouping. Blank space after a short real list is not a requirement to invent additional content. Full-frame settled filter, filtered-list and sort screenshots were reviewed for hierarchy, grouping, density and clipping.

Criteria: the UX review skill's source-backed recognition, consistency, hierarchy and task-scope guidance; [NN/g usability heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/); the [WAI-ARIA dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/) for Sheet/menu dismissal; Niu's primary-sidebar/secondary-tab rule and explicit overflow-menu preference. Sources establish criteria; the actual current-input interactions supply acceptance evidence. Fixture outcomes were not used.

## Video evidence and limits

The current new Video workflow settled with an existing selected key, Seedance 2.5, a prompt field, model picker, Additional settings, Estimate and Generate controls. The actual settings popover exposed duration, aspect ratio and resolution; 390 px screenshots showed reachable controls, and Escape restored focus to Additional settings. No value was changed and no estimate or generation was dispatched.

A saved successful legacy run still explicitly reported an unavailable original prompt and expired preview, with a retained-copy/original-task explanation, View Assets, and an active-key remedy. Its history entry had a model name and timestamp. These data limitations are not repaired by inventing a prompt or asserting a current Provider result. The original entry/control failure is no longer a P0 in the observed current setup, but broader saved-input retention/recovery acceptance remains unverified, so the Video finding stays open at lower priority.
