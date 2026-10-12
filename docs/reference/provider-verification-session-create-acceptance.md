# Provider verification session creation acceptance

An actual current-input run verified a genuine upstream verification-session creation, encrypted persistence and deliberately authenticated link retrieval. It did not perform human verification or establish an identity, verified person group or commercial qualification.

The retained Gateway was `fd91291cf3e8c66dece9df159ad7f64b649c8d9a`, binary SHA-256 `82a75da7ce7b7c9093558006bd18b3da0f12216e681162bf1ca44bb9de149b6f`. The executed SDK was compiled from `8a22ff830d748bb69c74236ce9379808192a88ff`. A new isolated copy of the stopped actual personal-route database used schema 293. The original database, encrypted identity, credential, model configuration and earlier asset proofs were preserved.

## Actual creation and scope

Exactly one upstream `CreateVisualValidateSession` request was made through `client.media.verification.create`. Its optional subject name was the literal purpose label `NIU.IO API integration check`, mapped to the documented `ArtistName` field. This label was not a person's name, identity assertion or qualification. No return URL was supplied.

The Provider returned a genuine token and H5 link. Niu encrypted those values and returned ordinary session metadata with status `waiting_user`, a reported expiry and no person-group reference. Neither a token nor a link was fabricated or inserted directly into the database.

| Actual check | Result |
| --- | --- |
| SDK create and retrieve | Genuine saved `waiting_user` session |
| Identical canonical UUID replay | Same session; no additional upstream creation |
| Changed purpose label under the same identity | HTTP 409 |
| Ordinary create, retrieve and list metadata | No token, H5 URL, ciphertext, credential or private route identity |
| Explicit authenticated SDK link retrieval | Private URL returned; `Cache-Control: no-store`, `Referrer-Policy: no-referrer` |
| Missing model grant, foreign organization and sibling workspace | Session and link reads returned 404 |
| Gateway restart | Session metadata and private link preserved |
| Retained binary `--check-encryption` | Completed successfully with the genuine nonempty session envelope |

The H5 URL was retained privately and was never opened in a browser or requested externally. No camera, human step, `GetVisualValidateResult` query, video generation or asset mutation was performed. The session remained pending human action; created capability is distinct from completed human verification.

## Independent final artifacts

An independent verifier reopened the stopped final database and confirmed exactly one `waiting_user` session, its canonical request digest, immutable original key/model/credential binding, reported expiry and absence of a verified group. AES-GCM authentication and decryption used the actual row's organization, workspace, original key and session AAD. The decoded strict versioned envelope contained the genuine token and URL, and its URL matched the explicitly authorized SDK link response.

Ordinary metadata and Gateway/database logs contained neither the private token nor the H5 URL. Original financial fingerprints and all original Supplier, model, personal ownership, group, asset, operation, task, query, result, timing and captured-payload records were unchanged. All temporary keys were revoked after verification, and copied Gateway/database processes were stopped.

This closes the actual creation, scoped metadata, private link and encrypted persistence boundary for this configured personal channel. It does not qualify human completion, verified-group recovery, expiry after waiting, credential rotation with this session, other channels or customer billing. No pending session was promoted to a verified state to obtain evidence.
