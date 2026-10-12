# Provider video asset acceptance

An actual current-input run verified one owned video asset creation in the [genuine Provider group](provider-asset-group-acceptance.md). An official read returned Active for the exact created asset. At this snapshot, Niu's refresh still returned 502 and its saved state remained `processing`; successful Gateway Active persistence is not yet claimed.

The retained Gateway was `49bfe8766cc4d7d5cb7df3ec881693d929d5b13a`, binary SHA-256 `7693d305e4b99d9df93ca24b6f2b73cff738777c1ea8ca74d7d5db3647b2d57d`. The executed SDK was `4d889d51612edd1ce31f5d148bbc3871433a9ecf`. A new isolated copy of the stopped actual group database used schema 292. The original group proof, original database, credential and model configuration were preserved.

## Actual creation and read boundary

The input was the previously [generated and independently decoded personal video](fastrouter-documented-video-acceptance.md). Its saved result URL returned 403 to HEAD. An authorized GET for the exact saved upstream task returned a current result URL. A bounded download verified the same 5,935,149-byte file and SHA-256 `1adf1824c9b44796537509018ac497c93aea27cbe57a4b5162d503b9a581dcb6`. The file was not transcoded, replaced or regenerated, and no expiry timestamp was invented.

The actual SDK `client.media.assets.create` used the owned Niu group reference, model, video kind, current URL, name and a new canonical UUID idempotency identity. Exactly one upstream `CreateAsset` mutation was dispatched. No other asset mutation, video generation or face operation was performed.

| Check | Actual result |
| --- | --- |
| SDK create | HTTP 202; operation `acknowledged`, saved video asset `processing` |
| Identical replay | Same response and operation; no additional creation |
| Changed input under the same identity | HTTP 409 |
| SDK asset retrieve | Saved scoped metadata returned |
| Missing model grant, foreign organization and sibling workspace | Asset detail 404; sibling list excludes asset |
| Gateway restart | Saved asset and operation responses preserved |
| First SDK refresh | HTTP 502; saved state unchanged; no polling from stale local state |
| Exact official `GetAsset` read | HTTP 200, `Active`, `Video`; returned asset identifier matches the saved reference |

The official read was separate from Niu refresh and made no mutation. Its bounded raw response remained private. It returned an empty `GroupId`, so it did not establish a Provider-reported parent-group identity. Existing strict parsing rejected that field, explaining the Gateway 502. A genuine Active response was not written directly into the database to bypass the handler.

## Independent final verification and fix scope

An independent verifier reopened the stopped final database and confirmed one existing ready group, one processing video asset and two operations: the preserved acknowledged group creation and the new acknowledged asset creation. It checked the exact canonical request digest, idempotency binding, current principal/model/credential revisions, scoped parent binding, replay, restart, error responses and safe serialization. Original financial, Supplier, all model, group, task, query, result, timing and captured-payload records were unchanged. All temporary keys were revoked and copied processes were stopped. Provider references, source URLs and credentials were absent from customer metadata responses.

The narrowly implemented `decode_owned_asset_read` helper requires `GetAsset` and the exact expected asset identifier. Missing or empty-string `GroupId` can use the caller's saved parent context; it does not claim that the Provider reported that parent. A nonempty mismatched group, null or malformed group value remains invalid. Generic and list decoders remain strict. The caller must independently verify an acknowledged create operation and immutable scoped asset, parent and route bindings before using this helper.

Direct parsing of the same saved actual response verified that the original strict decoder rejects the empty field and the helper decodes Active with the exact asset and saved parent context. Compilation and Clippy are static evidence only. This helper result is not a post-fix Gateway acceptance run; the Gateway callsite and durable acknowledgement guard require integration and actual verification.

This evidence does not qualify additional asset types, asset update/delete, face verification, after-send unknown recovery, customer billing, or video generation using a Niu asset reference. No local inspection or fabricated processing approval was substituted for the actual Provider response.
