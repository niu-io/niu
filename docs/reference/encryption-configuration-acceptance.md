# Encryption and configuration acceptance

This records current evidence toward the fixed S10-2 backend criterion for supported secret/configuration persistence, revisions, audit and offline encryption transition. It does not qualify every encrypted-content domain, a production maintenance window, or rendered settings screens.

## Current verification boundary

The current run uses Gateway `186662c5346ec911e2bc19e59bb6b8a51c32500c`, PostgreSQL schema 283 and a stopped copy of the retained native database. The original database, deployment configuration and encryption identity remain unchanged. There are no upstream inference or merchant requests.

Encryption inspection, transition, credential cipher and configuration persistence source remains unchanged between the exercised Gateway revision and the integration checkpoint `5591a02d`. Handler annotations and SDK additions do not change this behavior.

The historical checkpoint below covers the ten encrypted domains registered at its recorded pin. The current inventory additionally includes durable workspace-material content, with a separate authenticated-data domain, retained-content startup scan and offline rotation target. Its nonempty rotation acceptance is tracked with the [workspace material library](workspace-material-library.md); adding the domain does not retroactively verify it. Counts below describe actual retained envelopes, not fixture outcomes or a claim that an empty scan verifies a domain.

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

## Completion status

S10-2 remains active. The populated credential/configuration domains and historical interrupted-transition and asset/video cases have the evidence documented above. The remaining supported encrypted-content domains require actual data and artifact verification; empty inventory scans do not close them. Production maintenance orchestration, browser/UI acceptance and merchant activation are outside this fixed backend criterion.
