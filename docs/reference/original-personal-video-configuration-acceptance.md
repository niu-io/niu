# Personal video configuration and discovery acceptance

This checkpoint covers limited personal test configuration through the running administration API and actual scoped video-model discovery. It does not qualify commercial supply, customer pricing, or the complete Seedance control matrix.

The running native executable was `ef29c2929ceba22bc590faa8787946dbb78b62b5`, SHA-256 `8982dda8bd5c09ed7132fec199f772120ef8ca1391bee85f6afb37aeecd3f267`, with schema 293. Discovery used the compiled SDK at `6f6c48a3b892e35a7c14a05bc4a48ea4d5416028`. Runtime and SDK pins are recorded separately; the SDK metadata predates the saved discovery response.

## Configured scope

Only the existing FastRouter Seedance 2.5 mapping was enabled for the organization already owning the existing personal text-model credential. The saved Provider credential was retained, and the mapping remains personal, with no pricing and no public catalog publication. The other three FastRouter mappings remain disabled.

The finite text-to-video preset is five seconds, 1080p, 16:9, seed 42, and watermark disabled. Output metering remains unspecified. The catalog declares text input and explicitly describes personal self-funded use. The separately supported Provider asset adapter is declared as `fastrouter-actions-v1`; this configuration action did not create assets or verification sessions.

## Actual interface results

| Operation | Observed result |
| --- | --- |
| Administration configuration save using current revisions | Accepted and persisted |
| Reusing the prior model revision | HTTP 409; no overwrite |
| SDK video-model discovery with an authorized workspace key | Enabled model returned as owner-funded, with `output: null` and the exact configured controls |
| Discovery with a key lacking the model grant | Target model absent |
| Discovery in another organization | Target model absent |
| Temporary-key cleanup | All three keys revoked; DELETE returned HTTP 204 |

The configuration save and discovery were executed against the running service, rather than inferred from a build or an empty list. The configuration producer did not restart the service. Before the independent final read, the installation was separately refreshed to native `8ddf1dc8851dad085930467067f580ae3ca5f177`; the final verifier recorded this chronology rather than claiming an unchanged process or runtime pin.

## Independent final data verification

A separate read-only transaction against the current original database verified schema 293, the exact finite configuration, the existing personal-model owner, and all three temporary keys revoked. All 219 pre-existing key rows, other Supplier/Provider model and ownership rows, original credential ciphertext bytes, and eight financial fingerprints were retained. Only the explicitly authorized target configuration and personal ownership changed; the three other mappings remained disabled and the four new Provider domain tables remained empty. The verifier made no writes, upstream calls, or service restarts.

## Boundaries

There were zero video-generation calls, Provider asset mutations, or verification-session calls during this checkpoint. Prior successful generation and result recovery were exercised separately in copied databases; see [the documented video acceptance](fastrouter-documented-video-acceptance.md). `output: null` means no configured estimator, not free customer usage or a known price.

This preset is available for frontend integration, while the broader video control matrix and commercial eligibility remain outside this checkpoint. Enabling the asset adapter does not establish human verification, asset-reference video generation, or external qualification.
