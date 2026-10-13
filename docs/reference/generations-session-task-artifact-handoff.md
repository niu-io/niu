# Video integration handoff

Updated 2026-10-13. Implementation checkpoint: `69fc00f8` on `main`.
**Continue the work below; this is not release acceptance. Do not submit new generations.**

## Already implemented

- Durable Video sessions, turn/task associations, and workspace task/output inventories. Reuse these APIs; do not build another task store.
- Dashboard session access to workspace-scoped material groups, materials and verification operations. Credentials remain server-side; reads require Read and mutations require Write.
- Materials group menu and create/edit dialogs, URL material registration, and explicit human-verification actions.
- Explicit fresh-result retrieval: queries the original task and delivers its current output without generating again. Cached expiry/deletion records are not rewritten.

Dashboard and gateway static checks were executed at the checkpoint. Fixture outcomes are disregarded. Full release and browser acceptance remain incomplete. Actual local group/session reads returned empty inventories; upstream material mutations and completed human verification were not tested.

## Remaining work, in order

| Priority | Deliverable | Completion condition |
| --- | --- | --- |
| 1 | Saved task execution context | Task detail and SDK expose safe submitted-model and dispatched-model/Provider/channel information derived from saved execution records. Retain validated parameters/references under the existing retention policy. Never infer historic configuration from the current composer or current Supplier settings; missing information stays unknown. |
| 2 | Common SDK operations | Typed status, refresh and result retrieval resolve the original binding from the authorized task reference. Add dashboard media access and fresh-result retrieval methods, replacing custom frontend fetch senders. Update OpenAPI and API docs. Preserve existing APIs. |
| 3 | Model-specific tools | Return authorized native-module capabilities. Replace the unconditional Volcengine dialog in `VideoView.tsx` and first-supported-model probing in `useMaterials.ts`. OpenRouter Grok must not show Seedance material/verification tools. Preserve explicit account/channel scope when selecting a context. |
| 4 | Existing FastRouter result recovery | Find the already-generated Seedance task, verify its saved channel, query status and retrieve its existing output. Record evidence separately from OpenRouter. No regeneration or automatic creation retry. |
| 5 | Shared Tasks/Assets integration | Consume the existing inventory with source-task context and honest availability. Define any remaining durable output capture/promotion contract separately; a saved URL is not durable byte storage. Complete browser reload and second-browser verification. |

## Current backend increment

- Priorities 1–3 backend contracts are implemented: immutable saved execution context, typed task-reference recovery/fresh delivery, dashboard media SDK and exact model-specific native capability discovery. Current-input reads and independent SQL verification completed for the saved FastRouter context, scoped native discovery and SDK reads; implementation alone is not complete business acceptance.
- Frontend must consume returned native contexts, replace its custom senders with `admin.dashboardMedia` and task actions, and retain explicit workspace/key/model context. OpenRouter must not display Volcengine tools.
- Priority 4 genuine existing FastRouter Seedance recovery is verified in an isolated copy: saved-channel query HTTP 200/succeeded, fresh video HTTP 200, independent full decode, unchanged generation-submission and financial records. Changing the live model mapping through the management API did not change saved context or reroute the original query. OpenRouter evidence remains separate.
- Priority 3 frontend consumption and Priority 5 multi-browser acceptance remain open. Durable capture/promotion is implemented as an explicit bounded copy into the existing encrypted workspace library; current-input cached/fresh saving and source dedup have been exercised. Current-input restart, actor identity, Read/Write isolation, independent encrypted-byte verification, deletion and non-resurrection checks are complete for this increment. Actual interrupted-lease recovery is verified below; frontend acceptance remains separate. A result URL alone is not retained storage.

## Inventory capture projection increment

Task artifact summaries and artifact list/detail now include the safe nullable `capture` DTO. The original saved-reference availability remains separate from the retained library copy; validated captured MIME type is known, otherwise null. Pagination continues to use immutable source-output creation identity. Actual retained and deleted copies were checked through HTTP and the built SDK, including list/detail traversal and independent native database comparison. These reads made no upstream status queries or generation/financial changes.

Actual workspace byte quota was reached through authentic-video library uploads. Capture returned a durable `capacity_exceeded` failure with no partial asset/content; deleting one uploaded copy permitted an explicit same-claim retry. Download hash, full decode and independent native asset/content/audit records matched, with generation/financial records unchanged.

A real capture was interrupted after its durable preparing claim, while completion waited on the existing workspace quota lock. Restart restored preparing without partial asset/content/audit writes; retry during the active lease returned 409. After the actual lease elapsed, explicit same-claim retry retained matching bytes with a successful full decode and exactly one material/content/creation event. No generation or financial records changed.

Typed Niu material-reference drafts and immutable session-turn-to-intent binding are now implemented in the existing stores. Saving is metadata-only; original references, roles, consent and materialized controls are retained under the existing request policy. Session reads expose a safe intent reference and resolve any actual original submission attempt before explicit task attachment. Turn deletion clears bound request content; bound expiry is reflected immediately in intent reads/history. No route automatically submits or manufactures execution evidence.

Current-input genuine workspace-image draft saving/restoration/replay, session binding/replay, unrelated existing-task rejection, Read/Write/actor/workspace isolation, deletion and Gateway restart were exercised through HTTP and the built SDK. Independent native database verification matched canonical request digests and original references, found one immutable binding, and confirmed no submission or generation/financial changes. The private schema stand-in bug discovered by the actual image input was fixed without weakening image validation.

Provider-reference drafts and actual attempted-submission projection are implemented. Nonempty native video material qualification is recorded below; lost-attachment recovery from an actual submitted dashboard intent remains unverified. No new generation or synthetic submitted record was created for this increment. URL/inline/short-lived ingestion drafts remain outside this retained-intent contract. Frontend and human-verification acceptance remain separate.

## Frontend integration for the delivered SDK

- Video passes both its selected workspace key and exact model to `admin.dashboardMedia(scope, keyId).capabilities(model, { signal })`. An empty native-module result does not authorize fallback to another model/account. Hide native tools when the selected model has no supported module.
- The standalone workspace module may collect authorized contexts across active workspace keys, but must show an explicit choice rather than select the first successful group read. Display saved key names plus the server `context_label`; keep key/context identities internal. A failed discovery must remain an explicit failure or incomplete discovery, not an empty successful list.
- Once chosen, reuse that client's `groups`, `assets` and `verification` operations with the returned exact `model_alias`. Preserve mutation idempotency identities. Use `materials.kinds`, `human_verification` and `reference_inputs`; do not infer support from an alias or a UI family label.
- Shared saved history uses `admin.generations(scope).tasks.retrieve` and `artifacts.content`. Explicit task actions use `tasks.refresh` and `tasks.refreshResult`; key-scoped fresh compatibility uses `refreshDashboardVideoResult`. No recovery call accepts composer model/Provider overrides.
- Abort and discard stale results when token/workspace/key/model context changes. Preserve the originating draft when the module closes. Frontend implementation and browser acceptance remain separate from the verified backend/SDK increment.

## Contracts to preserve

- The backend already pins dispatch identity in `media_recovery_routes`. Use it for recovery; clients must not choose a replacement Provider/model when reading an existing task.
- Separate saved-state reads, explicit upstream status refresh, cached output retrieval and explicit fresh-result retrieval. A signed URL expiring does not establish that the upstream resource expired. Failed retrieval never triggers generation.
- Preserve historical-read permissions separately from current key grants needed for upstream actions. Enforce workspace membership, actor-private session access and account/channel binding on the server.
- Native materials, groups and human verification belong to the workspace-scoped Provider module. They are not shared generated outputs or a universal Person model. Shared tasks/artifacts remain platform capabilities used by the module.
- Verification requires an explicit private H5 action and backend confirmation; returning from H5 is not success. Verified identity and material approval are independent states. Do not create verification sessions or materials merely to test page loading.
- Retain existing intent/idempotency and optimistic revision behavior. Unknown submission/association outcomes must recover without duplicate dispatch. Persist drafts and associations on the backend.
- Keep credentials, private upstream URLs/IDs, internal account identifiers and procurement information out of customer responses and UI.

## Backend milestone status

| Milestone | Implementation | Actual verification | Remaining acceptance |
| --- | --- | --- | --- |
| Saved execution context and original-route recovery | Implemented | Existing FastRouter task, changed live mapping, independent saved records and decoded output | Frontend consumption |
| Typed SDK, OpenAPI and model-specific native discovery | Implemented | Current scoped HTTP/SDK reads and static contract checks | Frontend exact-context selection and browser acceptance |
| Durable bounded output capture | Implemented | Cached/fresh bytes, encrypted storage, restart, quota recovery, interrupted lease, deletion and independent records | Frontend reload and second browser |
| Material-reference drafts and immutable turn binding | Implemented | Genuine workspace image and native Provider video; replay, roles, isolation, digest and retained association | Actual submitted-intent/lost-attachment branch remains unverified |
| Native groups and materials | Implemented | Genuine create/register/active refresh; exact group update and readback; replay and independent records | Other nonempty mutation response shapes and explicit uncertainty reconciliation remain unverified |
| Human verification | Implemented contract | No completed human verification claimed | Explicit user H5 action and backend confirmation |

## Verification still required

- Cross-workspace, ordinary-role, actor-private and revoked-key access tests for the new routes.
- Tests proving that changing the composer/model configuration cannot reroute an old task query.
- SDK contract tests for cached versus fresh output delivery, expiry, authorization and failure responses.
- FastRouter existing-task recovery has current-input evidence above. Preserve the separate **OpenRouter Grok** failure diagnosis; it must not be counted as FastRouter evidence.
- Material mutation uncertainty/recovery requires actual current-input evidence and independent saved artifacts; fixture outcomes have no acceptance signal. Actual human verification requires the user. No fabricated completion.
- Browser checks for capability-specific tools, saved history, preview/download, reload and a second browser. Re-run broader tests: an earlier full dashboard run had layout/activity failures outside the targeted passing set.

## Code and API entry points

| Area | Location |
| --- | --- |
| Task inventory and types | `crates/storage/src/generations_inventory.sql`, `sdks/javascript/src/generations-inventory.ts` |
| Video SDK | `sdks/javascript/src/admin.ts`, `sdks/javascript/src/index.ts` |
| Task recovery and delivery | `apps/gateway/src/web/inference/video.rs`, `video_results.rs`, `dashboard_video.rs` |
| Dashboard media authorization | `apps/gateway/src/web/media_authorization.rs`, `provider_assets.rs`, `provider_verification.rs`, `routes.rs` |
| Native module UI | `apps/dashboard/src/features/provider-modules/volcengine/` |
| Video UI and result delivery | `apps/dashboard/src/features/video/VideoView.tsx`, `VideoResult.tsx`, `result.ts` |

New dashboard media prefix:
`/admin/v1/organizations/{organization}/projects/{project}/keys/{key}/media/*`

New explicit result delivery endpoint:
`POST /admin/v1/organizations/{organization}/projects/{project}/keys/{key}/video/jobs/{job}/results/{kind}/refresh`

Return implemented API/SDK changes, test evidence and remaining limitations in this document. Keep it a current checklist; detailed contracts belong in the references below.

## References

- [Generations API and SDK](../../apps/docs/src/content/docs/reference/generations.mdx)
- [Video API and SDK](../../apps/docs/src/content/docs/reference/video.mdx)
- [FastRouter integration](fastrouter-video-integration.md)
- [Workspace material library](workspace-material-library.md)
- [Provider group acceptance](provider-asset-group-acceptance.md), [asset acceptance](provider-video-asset-acceptance.md)
- [Verification creation](provider-verification-session-create-acceptance.md), [expiry and rotation](provider-verification-encryption-rotation-acceptance.md)

## Actual native material qualification — 2026-10-13

- Using the existing generated Seedance video, actual FastRouter group creation and video material registration returned acknowledged operations. Explicit material refresh observed processing followed by active. Canonical create retries returned the original saved operations; no generation or human-verification session was submitted.
- A nonempty Provider-video-reference draft was saved, restored, replayed and bound to a session. Independent SQL verified the original Niu reference and canonical digest, one create operation per resource, unchanged execution and financial records, and no private source URL or upstream resource identifier in customer responses. An independently authorized sibling workspace could not use the material; a reader could read metadata but could not refresh it.
- Actual group editing exposed a nonempty successful UpdateAssetGroup result that the previous decoder conservatively classified as unknown. The decoder now acknowledges only the exact owned resource identity and every requested name/description field. Other unrecognized results retain unknown with the actual transport status; HTTP success alone is insufficient.
- A fresh actual group update was acknowledged, canonical replay returned the same operation, and an explicit Provider read confirmed the requested name. Independent SQL found exactly one acknowledged update and unchanged generation/financial fingerprints. Previous unknown operations and resource states were preserved without automatic replay or reclassification.
- The draft-to-submitted-task projection remains unverified: read-only inspection found no existing submitted dashboard-intent association. Direct-job evidence is not evidence for this branch. The prohibition on new generations remains in effect. Frontend and completed human-verification acceptance remain separate.

Actual deletion of the newly qualified empty native group returned an acknowledged operation. Canonical SDK replay retained that operation; saved group reads returned 404. Independent SQL found one delete operation, a durable deleted group and unchanged execution/financial fingerprints. This verifies acknowledgement and the Niu tombstone contract, not independent upstream resource absence. No existing material or generated task was deleted.

Actual material rename returned a validated successful UpdateAsset response containing only the matching owned resource identity. The current decoder retained unknown, and canonical replay returned the original operation without redispatch. The response does not echo the requested name; acknowledgement compatibility and explicit upstream name readback remain pending. No generation or human-verification session was submitted for this qualification.

## Actual native material rename increment

The UpdateAsset decoder now recognizes only the observed singleton owned-Id receipt and a valid requested name. It does not infer returned metadata or Active readiness. A fresh actual video material rename was acknowledged; explicit GetAsset readback matched the requested name and Active state. Canonical SDK replay returned the same operation. Independent SQL found exactly one acknowledged rename, preserved earlier unknown operations, excluded upstream resource identifiers from customer responses, and matched unchanged execution/financial fingerprints. No new generation or human verification was submitted.

Actual deletion of this newly registered test material remains unknown; canonical replay retained the same operation without redispatch. The material remains readable with unknown availability. This is not successful deletion evidence; the response shape requires separate qualification. Original generated tasks, their outputs and pre-existing native materials were not deleted.

## Actual native material deletion increment

The DeleteAsset decoder now recognizes only the observed singleton owned-Id receipt for the exact action and owned resource. Other nonempty shapes remain unknown. A fresh actual video material deletion was acknowledged; canonical SDK replay returned the same operation and subsequent saved reads returned 404. Independent SQL found one acknowledged delete, a durable deleted material, preserved earlier unknown operations and unchanged execution/financial fingerprints. Private upstream identifiers were absent from customer responses. This verifies the Provider receipt and local tombstone contract, not independently observed upstream absence. No generated task or original result was deleted, and no new generation or human verification was submitted.

## Explicit uncertainty recovery gap

Current-input refresh of an existing unknown native group still returned unknown with its original revision. A new mutation returned 409; independent SQL found only the original unknown operation, no additional mutation claim and unchanged generation/financial records. Inspection confirmed that valid GetAssetGroup/GetAsset metadata is intentionally discarded while the saved resource is unknown. This is a safe no-resend boundary, but not a completed reconciliation workflow.

Remaining implementation must distinguish a current authorized observation from an immutable uncertain mutation outcome. Known owned references may be queried explicitly; neither a matching latest name nor a missing-resource response proves the original write's exact outcome. Do not guess missing create receipts, turn arbitrary 404 responses into deleted records, rewrite old operations as acknowledged, or automatically repeat mutations. Persisting and exposing safe observations is a prerequisite for honest diagnostics; resolving write eligibility requires a separately defined explicit reconciliation rule.
