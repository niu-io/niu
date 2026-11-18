# Onboarding provisioning recovery — 2026-11-18

Related work: `niu-lsh6` and `niu-dh73`; release gate `niu-nrcn.2`.

## Scope and source

Hosted observations used core `18178194c24f1ea932165ee53a72cdc45f49207d`, website `8d3f49200f0d99d27dd39e17d71b904ee3b34108`, composition `a9880be3ddb19024ec26cbba0b71e25b63900d64`, and plugins `adc48be4698ebd184c3e3eab2c21f7df3fe93829`. The localized error copy and provisioning documentation were built from the `fix/onboarding-readiness-20261118` change on that core revision and inspected through a separate actual local gateway. Hosted recovery does not establish deployment of that copy change.

No fixture outcome is evidence in this record. Production builds establish artifact generation only; the observations below come from current requests, persisted records, browser interaction and independently parsed exports.

## Admission cause and authorized recovery

The workspace created during the earlier first-use browser run had no procurement budget: the administrator GET returned `data: null`. A fresh DeepSeek-only key with a zero customer spending cap returned `503 service_not_ready` for a bounded 96-token request. Independent workspace request inventory was empty.

An installation administrator then explicitly created a USD procurement budget with `limit_nanos: "0"`. The selected route had zero procurement rates. This authorized no positive procurement expenditure and did not create unlimited capacity. The same key and identical input then returned HTTP 200 and exactly `ONBOARD_PROVISION_031_20261118`. Usage was 46 input and 27 output tokens. Independent inventory contained exactly one `confirmed_completed` request with a zero customer charge. Readback preserved the zero procurement limit. The key was revoked; a direct request with its original secret returned 401.

This is causal evidence for missing procurement provisioning in this workspace. It is not evidence that all `service_not_ready` errors have that cause. The existing billing contract intentionally separates customer funding from platform procurement capacity; no admission rule or automatic budget creation was changed.

## Hosted browser recovery and final artifact

A new, workspace-scoped owner session and DeepSeek-only key were issued for the same workspace, with a zero customer cap. Through the actual dashboard, the reviewer selected Generations, set maximum output tokens to 96, and submitted `Reply with exactly ONBOARD_UI_RECOVERY_031_20261118.` once.

The saved conversation `chat-1073` displayed the exact requested output, completed status and 83 tokens. After a full page reload it still displayed that output, 3,427 ms and customer charge $0.00. Independent request inventory identified exactly one added request, `run-1160`, completed with 49 input and 34 output tokens and a zero customer charge. The initial transient unknown charge was not treated as the settled result.

The browser's Export action downloaded a 415-byte `niu-chat` JSON file. Independent parsing verified one turn, the exact output and `phase: "complete"`. SHA-256: `874dca6644ded5d5d883fefad728fac433a8d8fd66de552272300be5a4c87895`. A separate authenticated backend read also returned the saved conversation. Temporary owner and model credentials were revoked and checked for 401 responses.

The desktop and 390 CSS-pixel browser views showed the saved result and charge without horizontal page overflow. This verifies recovery and persistence in that browser; it is not separate-browser or published-client acceptance.

## Localized failure and documentation verification

An isolated actual native gateway served the newly built dashboard and docs. A real member signed in, selected a workspace and its restricted key, and submitted current inputs. Its deliberately unusable upstream credential was never dispatched; independent database inspection found zero dispatched attempts. This setup verifies pre-dispatch rejection only, not upstream success.

The first request used the default 4,096-token output setting against a configured 256-token route. Its actual rejection exposed an untranslated output-limit diagnostic. The repair adds a Chinese instruction to lower maximum output tokens in Chat settings. Reducing that setting to 96 advanced the next request to the actual missing-procurement rejection. Its Chinese message now asks the user to contact the platform administrator about the workspace service configuration, without exposing procurement details.

Both saved errors were reread after full reload. The changed text was inspected at desktop, 1,024 CSS pixels with collapsed primary navigation and open history, and 390 CSS pixels. At 390 pixels, page scroll width remained 390; the messages wrapped within their response blocks and remained readable after scrolling past the fixed composer. Status, prompt and unknown accounting remained distinct. No new layout or control pattern was introduced.

The new English and Chinese quickstart links were followed in the actual browser to the corresponding provisioning headings. The rendered deployment guidance explains missing-budget readback, explicit zero versus paid capacity, currency nanounits, administrator ownership, and why adding customer funds cannot repair platform readiness. Desktop and narrow English rendering and desktop Chinese rendering were inspected. Both local builds completed. The local browser session was logged out, its key revoked and checked for 401, and gateway/database processes stopped.

## Review criteria and limits

The local review applies the UX review skill's [NN/g error recovery and meaningful feedback guidance](https://www.nngroup.com/articles/ten-usability-heuristics/): the two errors now identify different remedies suitable to the user's authority. Visual inspection preserved the existing Niu response hierarchy and spacing. The 390-pixel observation supports this sampled narrow layout; it is not a complete [WCAG reflow](https://www.w3.org/TR/WCAG22/#reflow) or accessibility certification. The actual OpenRouter error documentation was inspected as a reference for distinguishing insufficient customer funds from unavailable service; Niu retains its own authorization and recovery contract.

This record establishes the diagnosed cause, safe configuration recovery, saved hosted output, independent export and local copy rendering. It does not establish staging acceptance of the new source change, all agent-led onboarding branches, real merchant settlement, paid video capability or overall release readiness. Those remain governed by the release gate and their own evidence.
