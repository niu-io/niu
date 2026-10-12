# Saved-material video reference boundaries

Actual native HTTP verification on digest-pinned Gateway `ab33ee172fbff52357bdd5375dcc3d5e80676244` used a stopped database copy retaining a genuine personal OpenRouter video route and real saved image, video and audio materials. No new generation, fabricated approval or commercial qualification was submitted.

The input part is `type: workspace_asset` with nested `asset_id` and explicit `consent_to_process: true`; an optional role retains normal video-schema rules. Saving a material does not grant processing consent or fresh inspection approval.

| Current-input case | Actual result and stage |
| --- | --- |
| Missing reference/asset/consent; false or string consent; malformed UUID; unknown nested/top-level fields; null role | Nine JSON 400 refusals during strict reference parsing. |
| Mixed saved-material and ingested-image references | 501 during preliminary input preparation. |
| Image reference with a new video idempotency key | 501: current image submission does not support idempotent replay. |
| Personal OpenRouter request using own image, foreign image, own video/audio or unknown asset identity | 501: this video channel does not support workspace image references. The asset resolver has **not** executed. |
| Estimate with saved image; same request after restart | Same explicit unsupported-channel 501. |

An actual run on earlier `f6967dad` returned 400 for a syntactically valid saved image because the text-only OpenRouter schema examined an admission placeholder before the unsupported-channel check. The new channel gate fixes that diagnostic classification: the same genuine route/input now returns 501 before resolution or transport. Malformed inputs continue to return 400.

Independent final PostgreSQL reopening matched all eighteen saved response digests and the executable SHA-256. Attempt/financial, policy, credential configuration/model and existing image-binding fingerprints remained unchanged. No saved-material video binding was inserted; temporary inference key and member operator were revoked. Responses disclosed neither plaintext/private Provider URI nor ciphertext.

Migration 0286 was separately checked against the actual PostgreSQL column types. The committed trigger's internal SELECT was prepared with typed UUID/integer/text/bigint parameters in native PostgreSQL, both during the producer run and independent verification. This is schema/type validation only: no trigger insertion, approved request or successful dispatch was executed.

These refusals prove strict parsing and safe unsupported-channel behavior. Foreign/unknown/non-image references receiving the same early 501 do not prove scoped lookup, kind rejection, decryption, fresh policy inspection, deletion races or atomic dispatch. Those deeper paths require their own actual current-input evidence; no positive Ark/Provider claim is inferred here. See the [material library contract](workspace-material-library.md) and [local format verification](workspace-material-format-acceptance.md) for their separate scopes.
