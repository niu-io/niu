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
- Priority 3 frontend consumption and Priority 5 durable capture/promotion and multi-browser acceptance remain open. A result URL is not retained storage.

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

## Verification still required

- Cross-workspace, ordinary-role, actor-private and revoked-key access tests for the new routes.
- Tests proving that changing the composer/model configuration cannot reroute an old task query.
- SDK contract tests for cached versus fresh output delivery, expiry, authorization and failure responses.
- FastRouter existing-task recovery has current-input evidence above. Preserve the separate **OpenRouter Grok** failure diagnosis; it must not be counted as FastRouter evidence.
- Material mutation uncertainty/recovery tests using fixtures; actual human verification requires the user. No fabricated completion.
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
