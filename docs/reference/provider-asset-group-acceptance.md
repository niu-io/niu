# Provider asset group acceptance

An actual current-input run verified one personal FastRouter Provider asset-group creation through Niu's workspace API. It does not qualify asset creation, asset processing, Provider refresh, face verification or commercial supply.

The retained Gateway was `49bfe8766cc4d7d5cb7df3ec881693d929d5b13a`, binary SHA-256 `7693d305e4b99d9df93ca24b6f2b73cff738777c1ea8ca74d7d5db3647b2d57d`. The executed SDK was compiled from `4d889d51612edd1ce31f5d148bbc3871433a9ecf`. A new isolated copy of a stopped actual database migrated from schema 291 to 292. The original database and earlier proofs were preserved.

The existing enabled personal model and saved real credential were reused. The copy added `provider_assets: { channel: "fastrouter-actions-v1" }` through the management API, preserving the finite video schema and unknown pricing. It used a legitimate new workspace key and a fresh canonical UUID idempotency identity. No qualification, funding receipt, video generation or face operation was created.

| Actual check | Result |
| --- | --- |
| Management capability save | Accepted through HTTP; no database bypass |
| Local group and asset list | Scoped reads before creation; no global Provider list call |
| Executed `client.media.groups.create` | HTTP 202; durable operation `acknowledged`, group `ready` |
| Native final cardinality | One group, one operation, zero assets |
| Identical idempotent replay | Same saved response and operation; no additional dispatch |
| Changed input under the same identity | HTTP 409 |
| Missing model grant and foreign organization | HTTP 404 |
| Sibling workspace with model access | Group detail 404; local list excludes the group |
| Gateway restart | Saved group and operation responses preserved |

Exactly one actual upstream `CreateAssetGroup` mutation was dispatched. The acknowledgement required the finite Provider response envelope and a valid created reference. That opaque reference remained private; customer serialization returned Niu references and metadata, without Provider object references, credentials, endpoints or raw response bodies. Group `ready` means creation was acknowledged; it is not a claim about any asset being processed or active. The existing operation DTO does not project a successful upstream HTTP status, so its `http_status` remained null.

An independent verifier reopened the stopped final database and checked the canonical request digest, idempotency binding, actual principal/model/Supplier credential revisions, personal owner, scoped foreign keys, operation and group cardinality, replay, restart and safe response artifacts. Full original financial fingerprints remained unchanged. Other model rows were unchanged; the target model retained its original fields and capabilities apart from the explicitly added channel and revision increment. Original Supplier configuration, personal ownership, task, query, result and payload records were preserved. All temporary keys were revoked and copied processes were stopped.

## Predispatch fixes established by actual input

The earlier retained `4d889d51612edd1ce31f5d148bbc3871433a9ecf` run could not save the capability: the management API returned 400 because the strict capability parser lacked `provider_assets`. No group operation or upstream mutation was created. The parser was extended with a strict finite channel definition.

The subsequent `8efbef350b92eb0cbab1240cf4c51f461562660e` run saved the configuration but recorded one `not_sent` operation and failed group. The Action adapter had passed its query-bearing Action URL to a connection constructor that rejects configured URLs containing query parameters. Independent final verification confirmed that predispatch state. The adapter now authorizes its configured query-free endpoint and sends the internally constructed Action URL using that client. Shared endpoint validation was not weakened.

Both earlier artifacts were retained. Their operations were not automatically resent. The successful run used a separate explicit identity in a fresh copy; neither predispatch failure consumed an upstream mutation. Actual after-send unknown-state recovery, group refresh/update/delete and asset creation/processing remain unverified by this group-only evidence.
