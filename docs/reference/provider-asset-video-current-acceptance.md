# Saved Provider video-reference acceptance

This checkpoint verifies the Niu SDK and backend path for an existing workspace-owned, acknowledged, Active video asset. It does not establish successful Seedance generation: the one dispatched request received an upstream permission refusal.

## Pins and scope

The fixed native runtime was `8ddf1dc8851dad085930467067f580ae3ca5f177`, binary SHA-256 `954abb723d997646fb63c8f29ce70a8b8aa555ea0385e925f2cd326d3711d9a9`. The compiled JavaScript SDK was `6f6c48a3b892e35a7c14a05bc4a48ea4d5416028`. Runs used isolated copies of a stopped database containing genuinely created Provider assets; original services, databases, encryption identity and configuration were preserved.

The caller selected the saved personal FastRouter account and Seedance 2.5 model. The SDK supplied a Niu asset ID, `reference_video`, explicit `omni_reference_task_type=reference`, and requested five seconds, 1080p, 16:9. The genuine source video measured approximately 5.042 seconds at 24 fps and 1920×1080. The existing price configuration was preserved. No new asset or human verification mutation was performed.

The model's current input schema was changed through the actual administration API to allow two content items (text and video) and the documented reference control. Original capabilities were subsequently restored. These writes legitimately changed the model revision; saved assets remained accessible through their immutable account and upstream-model identity rather than their historical catalog revision.

## Actual local preflight and defect

At `ef29c2929ceba22bc590faa8787946dbb78b62b5`, actual SDK reads of the owned Active asset returned 200, including after restart. Reference estimation returned 501 with `No effective video output estimator is configured`: this configuration has no effective output estimator, so no quote was invented. Invalid roles and client-supplied raw asset URIs returned 400. A key without the selected model grant and a foreign workspace key returned 404.

The first creation request returned 409 before dispatch. Independent reopened records showed one retained `not_sent` attempt with an unassigned API key, a saved scoped creator inspection binding and pinned recovery/publication records, but no media job, upstream query or request payload. The Provider-asset dispatch predicate incorrectly required the attempt's API key before the existing atomic dispatch transition assigned it.

The fix binds the creator through the existing scoped inspection record, requires an unsent attempt, and permits an unassigned or matching attempt key. Existing key/policy, live route/schema, account, publication and asset revision checks remain in the transaction. The ordinary dispatch transition assigns the key atomically. The failed identity was preserved and was not retried.

## Fixed single-dispatch result

A fresh independent identity on the fixed runtime produced the following actual behavior:

| Operation | Result |
| --- | --- |
| SDK generation creation | 202, saved `submission_unknown` |
| Identical idempotent replay | 202, the same attempt and saved state |
| Changed request with the same identity | 409 |
| SDK wait | One saved-state GET; `submission_unknown`, no automatic refresh or generation retry |
| Billing read | 200 |
| Restarted job and owned asset reads | 200 |

Native diagnostics recorded one submission taking 85 ms, upstream HTTP 403 and safe error code `permission_denied`. No upstream request ID or generation receipt was obtained. This establishes a permission refusal for this saved configuration, not the specific missing entitlement, universal model incompatibility, or confirmed nonexecution. The attempt therefore remains `may_have_executed` with unresolved settlement. No additional generation was submitted.

There was no new media job, query, or result to download or decode. Successful reference generation, terminal metering and result retention remain unverified. The absence of a reported meter was not replaced with an estimated duration or charge.

## Independent final-artifact checks

Separate reopened final databases and fresh stopped-source copies confirmed one new attempt, one personal owner-funded declaration, one submission identity, one safe submission diagnostic/failure record and one captured request/response pair in the fixed case. The two replay requests created no additional dispatch record. Original Provider groups/assets/operations and all other financial fingerprints remained equal; no customer charge was recorded.

The retained request contains the original Niu asset ID and normalized request, not the private Provider asset URI. Source Provider references were independently checked against retained SDK responses and request payloads. Capabilities were restored, all three temporary keys were revoked, and copied services were stopped. These results come from actual HTTP and saved native records; static compilation is not acceptance evidence.

The [official task API](https://docs.volcengine.com/docs/ark/create-video-generation-task-api?lang=zh) documents video asset references and the explicit reference task control. Those capabilities must still be configured for the selected model and supported by the actual upstream account; this checkpoint does not broaden them to every Provider or model.
