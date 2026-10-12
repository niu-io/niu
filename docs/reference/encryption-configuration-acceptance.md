# Encryption and configuration acceptance

This records current evidence toward the fixed S10-2 backend criterion for supported secret/configuration persistence, revisions, audit and offline encryption transition. It does not qualify every encrypted-content domain, a production maintenance window, or rendered settings screens.

## Historical schema-283 verification boundary

The recorded schema-283 run uses Gateway `186662c5346ec911e2bc19e59bb6b8a51c32500c`, PostgreSQL schema 283 and a stopped copy of the retained native database. The original database, deployment configuration and encryption identity remain unchanged. There are no upstream inference or merchant requests.

Encryption inspection, transition, credential cipher and configuration persistence source remains unchanged between the exercised Gateway revision and the integration checkpoint `5591a02d`. Handler annotations and SDK additions do not change this behavior.

The historical checkpoint below covers the ten encrypted domains registered at its recorded pin. The current inventory additionally includes durable workspace-material content and Provider verification sessions, each with separate identity-bound content, startup scanning and offline rotation targets. Its nonempty rotation acceptance is tracked with the [workspace material library](workspace-material-library.md); adding the domain does not retroactively verify it. Counts below describe actual retained envelopes, not fixture outcomes or a claim that an empty scan verifies a domain.

| Domain | Retained envelopes in the current run | Evidence scope |
| --- | ---: | --- |
| Supplier credentials | 88 | Actual retained credentials, complete offline transition and independent authentication |
| EPay configuration | 1 | Actual saved configuration, complete transition and target-key startup/read/restart |
| Asset-management credentials | 0 | Current scan only; retained historical evidence is separately rechecked below |
| Legacy Codex credentials | 0 | Unqualified by this run |
| Media result references | 0 | No encrypted reference remains in this current copy; historical real-video evidence is separately rechecked below |
| Asset-listing results | 0 | Unqualified by this run |
| Asset-lookup results | 0 | Unqualified by this run |
| Asset-group read results | 0 | Unqualified by this run |
| Asset-group update patches | 0 | Unqualified by this run |
| Inspected-image source content | 0 | Unqualified by this run |

A domain with zero envelopes may still contain expired or erased metadata. Its presence in the inventory is not positive acceptance evidence.

## Actual transition and independent final-state checks

The source key first authenticates the retained inventory using the read-only `--check-encryption` command. Rotation without the explicit offline-maintenance setting and rotation with a wrong source key are refused. These refusals leave envelopes, business metadata and operation history unchanged.

With Gateway writers stopped, `--rotate-encryption-offline` replaces the 89 populated envelopes and completes one durable maintenance operation. Source-key inspection then fails. Destination-only inspection, Gateway startup, saved EPay configuration read and a subsequent Gateway restart succeed.

Independent Python AES-GCM verification reopens both stopped databases and authenticates all 88 credential envelopes and the payment envelope using their original domain/identity bindings. Every replacement decrypts to exactly the original plaintext, rejects the source key and rejects an incorrect authenticated binding. Plaintext comparisons occur in memory; credentials are not emitted into logs or this document.

For all ten inventory domains, row counts and complete non-ciphertext metadata fingerprints match before and after. Seven complete financial/request table fingerprints also match the source and final databases: attempts, customer charges, customer balance entries, funding receipts, customer balance reservations, cost reservations and Supplier earnings. There is one new completed rotation operation and no unfinished operation. Independently checked saved command and HTTP artifact hashes match, and command output contains neither key.

This proves the exercised offline transition. The command's session lease does not fence a concurrently running Gateway; stopping every writer remains an operational prerequisite.

## Configuration persistence, revisions and authority

The associated current HTTP and compiled-SDK runs verify:

- Installation-authorized branding/theme and payment configuration reads and saves, exact saved snapshots, revision conflicts and restart persistence.
- One native branding audit row and one native payment audit row for each accepted configuration revision; refused stale updates do not create another revision.
- Blank EPay secret input preserves the existing key; response projection exposes `has_key` rather than the key. Disabling checkout is configuration readiness, not merchant activation or payment settlement.
- Ordinary company/workspace owners, administrators and viewers receive 403 for platform configuration reads and writes. Company role alone does not confer platform administration.
- Member profile/preferences changes persist under the authenticated member, with profile revision conflicts and invalid input preserving the saved state. Installation credentials cannot use member-only profile/preferences endpoints.

The compiled SDK checkpoint is `4a459338`; the verification exercises its authentication discovery, public branding and EPay configuration methods against the actual Gateway. The independent reader verifies raw responses, native revision/audit records and unchanged financial data. Public projections and arbitrary executable-content refusal receive the separate fixed S10-3 matrix; this record does not silently broaden into that criterion.

## Retained evidence rechecked independently

Existing evidence is reused only after reopening its stopped native database and independently checking the retained final artifacts again. These are historical runs, not newly generated upstream media or a claim that all domains were populated in the current run.

| Retained scope | Independent recheck |
| --- | --- |
| Interrupted offline command | Original and replacement credential/asset envelopes decrypt identically; the already committed first envelope retains its recorded digest after resume; exactly two additional rewrap authorizations, no unfinished operation, removed interruption hook and unchanged empty financial/inference state. The saved resume output is also checked. |
| Two historical asset-management credential revisions | Destination AES-GCM authentication recovers the exact API-submitted access/secret pairs under original credential revision/project bindings; old key and altered binding fail; native non-ciphertext metadata is unchanged, with no model dispatch. This does not qualify an external asset service. |
| Retained real video result at `ab6f2ff1`, schema 278 | Original and rotated result envelopes authenticate the identical original reference and metadata. The retained downloaded artifact matches the original generation digest and fully decodes with FFmpeg. The independent reader verifies the pinned binary, maintenance state, revoked keys, native owner-funded billing and absence of extra generation, polling or financial activity. The saved billing/result receipts are rechecked. This historical download is not repeated after natural expiry. |

Encryption inspection, transition and cipher source at the historical real-video revision remains unchanged at the current integration checkpoint. Historical data schemas and exercised domains remain explicitly distinct from the current schema-283 run.

## Current twelve-domain coverage and executable prerequisites

The supported maintenance inventory now contains **twelve domains**: four credential/configuration domains and eight retained-content domains. Six domains have nonempty actual transition evidence; six remain unverified. The historical 89-envelope transition covered Supplier credentials and EPay configuration, not all domains. An empty scan cannot close any of the remaining six.

| Domain | Nonempty actual transition evidence | Current coverage and genuine data path |
| --- | --- | --- |
| Supplier credentials | 88 retained credentials in the recorded transition | Real administrator credential saves, preserved configuration identity and independent plaintext equivalence. |
| EPay configuration | One actual saved configuration in the recorded transition | Real configuration save and revision/audit lifecycle; encryption does not require merchant activation or a successful payment. |
| Asset-management credentials | Two independently rechecked saved revisions | `PUT /admin/v1/vendors/{id}/asset-management` saves declared configuration inputs. This can produce nonempty encrypted data without dispatch or externally qualifying that credential. |
| Media result references | Retained reference from an actual generated video, independently rechecked | Use an existing real encrypted reference in a stopped copy; an erased reference must not be reconstructed or revived to fill the domain. New retention otherwise requires a real successful supported media result. |
| Workspace material content | 256 actual uploaded objects, independently reopened again | Actual image/audio/video uploads populate this domain without a Provider request. The new domain is separate from Provider assets and inspection approval. |
| Provider verification sessions | One genuine naturally expired session, rotated and independently authenticated | [Current schema-293 rotation](provider-verification-encryption-rotation-acceptance.md) preserves the actual token/H5 envelope, original AAD, expiry and authorized link refusal across restart. No human completion is inferred. |
| Asset-listing results | **Unverified** | `POST /admin/v1/vendors/{id}/asset-management/listings` requires an original successful ordinary Ark group, its exact credential/project binding and a current reviewed operation grant. Only a real successful parsed Provider listing is encrypted. |
| Asset-lookup results | **Unverified** | `POST /admin/v1/vendors/{id}/asset-management/lookups` requires a genuine saved listing and an authorized lookup of its original Provider asset. Only a real parsed result is encrypted. |
| Asset-group read results | **Unverified** | `POST /admin/v1/vendors/{id}/asset-management/group-reads` requires the successful original group and current GetAssetGroup authorization; the actual successful read supplies the saved encrypted result. |
| Asset-group update patches | **Unverified** | `POST /admin/v1/vendors/{id}/asset-management/group-updates` can save a user's real metadata patch without sending an update. It still requires a genuinely successful original group and current UpdateAssetGroup grant; a manufactured successful group is not acceptable. |
| Inspected-image source content | **Unverified** | `POST /v1/media/image-sources` requires an active workspace key, exact inline image, current processing consent and approval from every configured real image detector. Client verdicts, unconfigured inspection and an invented external detector response cannot create evidence. |
| Legacy Codex credentials | **Unverified; retained compatibility maintenance domain** | Existing supported sign-in saves a connection only after real OAuth exchange, required plan-use/renewable scopes, signed identity validation and actual model discovery. A generic API key or a local CLI credential cannot substitute for that authorization. |

A read-only check of the current installation confirms no successful ordinary Ark group, operation grant or asset-management credential available to execute the four remaining asset-result/patch paths. The running deployment has no configured image detector. These are concrete missing prerequisites; successful OpenRouter text requests and model-list checks do not supply them. The current retained inventory has no encrypted legacy Codex connection. No empty domain is relabeled successful, no external receipt is fabricated and no original encryption identity is changed.

The workspace-material evidence was independently reopened for this assessment at its actual `a8f9e68fb7e221f612a1e415db7a763bf9162720` binary and schema 285. All 256 live objects authenticate with the destination key, decrypt to their exact real input bytes and matching lengths/hashes, and reject the original key. Complete metadata fingerprints match the recorded pre-transition state; two tombstones retain no ciphertext. Original financial fingerprints remain unchanged, and the stopped source/final copies have no unfinished transition. Saved response hashes and downloaded media decoding were checked again. This is a reuse of real pinned nonempty evidence, not a new rotation of the original installation.

Current source comparison retains the previous domains' authenticated bindings and rotation branches; the added workspace-material branch enumerates its separate identity-bound content. Static continuity supports identifying which historical evidence is being reused, without turning missing domain data into current-input acceptance.

### Legacy product classification

The current [project assessment](../releases/project-assessment.md) classifies Codex-connection routes as deprecated compatibility work under S14, and the interface audit distinguishes three excluded Codex methods. The [first-release scope](../releases/first-release.md) retires task/subscription-routing obligations. Older private-Codex architecture material still describes implemented sign-in and storage; it is not evidence of a current qualified connection or authority to import personal tokens.

New legacy product activation is deferred, while any retained encrypted record remains inside the full maintenance inventory. This distinction neither deletes the domain nor closes its unverified nonempty transition criterion. Existing configuration operations cannot legitimately save an already available OpenRouter/API credential as a Codex identity: the OAuth callback requires original registered-client, nonce, subject and scope proofs before encryption. No credential extraction, fabricated OAuth grant or storage insertion is proposed.

## Completion status

S10-2 remains active. The populated credential/configuration domains and historical interrupted-transition and asset/video cases have the evidence documented above. Six of the current twelve domains still lack nonempty actual transition verification as listed above; empty inventory scans and deferred activation do not close them. Production maintenance orchestration, browser/UI acceptance and merchant activation are outside this fixed backend criterion.
