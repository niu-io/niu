# Provider video asset acceptance

An actual current-input run verified one owned video asset creation in the [genuine Provider group](provider-asset-group-acceptance.md). An official read returned Active for the exact created asset. A subsequent zero-mutation run verified Niu's Active persistence and restart for the same asset. The earlier 502 and saved `processing` snapshot are retained below.

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

Direct parsing of the same saved actual response verified that the original strict decoder rejects the empty field and the helper decodes Active with the exact asset and saved parent context. Compilation and Clippy are static evidence only. That saved-response helper result was not itself a post-fix Gateway acceptance run. The later current-input verification below covers the integrated callsite and durable acknowledgement guard for this actual owned asset.

This evidence does not qualify additional asset types, asset update/delete, face verification, after-send unknown recovery, customer billing, or video generation using a Niu asset reference. No local inspection or fabricated processing approval was substituted for the actual Provider response.


## Integrated owned-asset refresh acceptance

A subsequent isolated copy used retained Gateway `fd91291cf3e8c66dece9df159ad7f64b649c8d9a`, binary SHA-256 `82a75da7ce7b7c9093558006bd18b3da0f12216e681162bf1ca44bb9de149b6f`, and executed SDK `8a22ff830d748bb69c74236ce9379808192a88ff`. The actual source migrated from schema 292 to 293. The original processing/502 proof remained unchanged.

A legitimate new key in the same workspace with permission for the actual model refreshed the exact saved asset once. The SDK refresh returned HTTP 200 and `active`. Subsequent scoped reads and Gateway restart preserved that state and the same Niu asset and group references, name and video kind. No new asset creation, other mutation, video generation or face operation was made.

The integrated path checks a recorded acknowledged `create_asset` operation and immutable scoped asset, group, credential and model bindings before invoking the owned-read decoder. Its saved parent context resolves the actual empty `GroupId`; the response's exact asset identity remains mandatory. This establishes Niu's local ownership relationship, not a Provider-reported group identity or a processing-policy/commercial approval.

An independent verifier reopened the stopped source and final database. It confirmed that only the same asset's status (`processing` to `active`), revision (incremented once) and update timestamp changed. Provider asset and parent references, local group, name, kind and route bindings remained identical. The original ready group, two acknowledged operations, canonical mutation evidence, Supplier/model configuration and full original financial and media records were preserved. New verification-session tables in schema 293 remained empty.

All response projections retained safe fields. The temporary key was revoked after refresh, reads and restart verification, and copied processes were stopped. This closes the actual creation-to-Active persistence and restart path for this owned video asset. Asset update/delete, other media types, after-send unknown recovery, face verification, customer billing and video generation using a Niu asset reference remain outside this evidence.
