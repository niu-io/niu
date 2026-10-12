# Media detector discovery acceptance

This verifies the inactive configuration-discovery interface, not detection-service qualification or media authorization. The actual Gateway and executed JavaScript SDK share pin `4c3def6381e839d1206d5dd13b3b42632b0ef036`; the retained binary SHA is independently checked. The stopped source database is at migration 284, and the final isolated copy is at migration 287 with successful migration flags.

Seven actual HTTP requests and an executed `NiuAdminClient.listWorkspaceMediaDetectors` call exercise `GET /admin/v1/organizations/{organization}/projects/{project}/guardrails/media-detectors`:

- Installation and workspace viewer reads return the same two scoped declarations, one audio and one video; the SDK response equals HTTP exactly.
- A foreign-only video declaration appears in its authorized workspace and is absent from the target workspace. The target viewer receives 403 for that foreign scope; an inference API key receives 401 for this administration endpoint.
- Successful responses use `Cache-Control: no-store`. Metadata remains identical after restart and after restoring valid configuration following rejected startups.

Each returned declaration contains exactly 17 public fields: `detector`, `schema_version`, `kind`, `detector_revision`, `configuration_fingerprint`, `recipient`, `region`, `retention`, `content_sent`, `processing_guarantees`, `timeout_ms`, `maximum_encoded_bytes`, `concurrency`, `declared_unmetered`, `policy_activation`, and `requires_supported_presentation_facts`. Responses contain no endpoint, credential environment name, authorized-workspace array or scope GUID.

The actual input explicitly declares `declared_unmetered: false`, missing credentials and unreviewed recipient, region and retention. Returned metadata preserves `processing_guarantees: declared_unverified` and `policy_activation: false`. Availability in this list is a declaration, not evidence of live detection, approved handling guarantees, rights, eligibility or dispatch authorization.

Eight actual startup attempts reject an invalid detector name, timeout values 0 and 30,001 ms, encoded-byte bounds 0 and 8,388,609, concurrency values 0 and 5, and `kind: image`. The current binary rejects image through its audio/video kind contract. Each rejected startup leaves financial fingerprints unchanged; restoring valid configuration restores the same metadata. These are actual current-input startup checks, not fixture outcomes.

An independent reader reopens the stopped source and final copies, checks raw response hashes, SDK equality, response fields, scope refusals, cache headers, invalid-startup artifacts and migration state. Complete fingerprints of all seven financial tables, Provider records and model records remain unchanged. The temporary viewer and inference key are revoked, and copied Gateway/PostgreSQL processes are stopped. Original database, configuration and encryption identity remain unchanged.

This run makes **zero external detection requests, zero model generations and zero approvals**. Detection success, presentation-fact acceptance, policy activation, consent enforcement and supported media execution require separate evidence. The whole S08 subsystem remains active.
