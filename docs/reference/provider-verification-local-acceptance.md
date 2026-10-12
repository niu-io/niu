# Provider verification: current local acceptance

This checkpoint verifies migration, local API authorization and safe pre-dispatch
refusals. It does not claim a successful upstream verification session, completed
human verification, a usable H5 link or a verified person group.

The actual native runtime was pinned to
`8a22ff830d748bb69c74236ce9379808192a88ff`, with binary SHA-256
`c4408e91da2d25cfb4105b78e2a0d67c41862179e61f7f67e45c64f89630f8f8`.
The retained binary remained fixed when the build pointer subsequently advanced.
An isolated PostgreSQL copy was made only after confirming its source was stopped.
That source already contained real saved Provider asset records and the configured
FastRouter channel. Its schema upgraded from 292 to 293 through normal startup.
The original database, service, configuration and encryption identity were not
changed. Video background polling was disabled in the copy.

## Actual HTTP behavior

There were 23 retained actual HTTP responses: 16 verification endpoint requests,
one scope-visible model discovery request, three temporary key issuances and
three key revocations. Each response was retained and independently checked by
its SHA-256 and parsed content.

| Current input | Actual response | Supported conclusion |
| --- | --- | --- |
| Authorized local list, before and after restart | 200, empty `data`, null cursor | The configured local list route executes and persists its empty state across restart; no upstream session is implied. |
| Missing API key, list and create | 401 | Authentication refuses these requests before dispatch. |
| Key granted a different actually scope-visible model, list and create | 404 | Current model grants refuse access to the selected verification model. The alternative was never called upstream. |
| Key from an existing foreign workspace | 404 | The selected personal route is unavailable in that foreign scope. This does not substitute for a cross-workspace read of a genuine saved verification session. |
| Unknown session: metadata, link and empty-body refresh | 404 | Missing owned identity produces no token or link. |
| Unknown creation field, malformed JSON, non-HTTPS return URL | 400 | These current requests fail before creating a dispatch claim. |
| Nonempty refresh body, unknown query field, zero page limit | 400 | Unsupported client inputs are refused. |

Ordinary verification responses contained no `BytedToken`, token field, H5 link
or `verification_url`. The explicit authenticated link endpoint returned 404 for
a missing session; its successful handoff remains unverified.

The initial producer setup attempted an empty model-grant list, which the existing
key API correctly refused with 400. That incomplete copy was stopped and retained
separately. The completed run used a valid model selected from the actual
workspace-visible `/v1/models` response; it did not invent a Provider route,
person identity, verification token or successful response.

## Independent native checks

A separate verifier reopened the final stopped database and a fresh clone of its
stopped source. It checked the final artifacts independently of the producer:

- Migration 293's stored checksum matched SHA-384 of the pinned committed SQL.
- The existing closed offline rotation whitelist contained all 12 tables,
  including `workspace_provider_verification_sessions`.
- The new table existed with no sessions, encrypted verification envelopes or
  verified group bindings. No synthetic rows were inserted to manufacture proof.
- Exact original row fingerprints matched for all 31 financial tables selected
  from the database's financial relation names, as well as Supplier credentials,
  model configuration, personal ownership, saved video jobs, recovery routes,
  query evidence, result references, transport timings, payloads and existing
  Provider asset groups, assets and operations.
- Original key rows matched exactly; the three added temporary keys were revoked.
- The final database dump was retained with its independent SHA-256. This
  checkpoint does not claim a restore exercise for that new dump.

The pinned runtime started successfully before and after restart. Its read-only
`--check-encryption` command exited successfully using the retained encryption
identity. The closed inventory includes the new verification domain, which was
empty in this actual run. This verifies startup and inventory integration over
these retained inputs; it does **not** verify authentication or rotation of a
nonempty verification envelope.

All verification copies and the independent source clone were stopped afterward.
No upstream face session creation, result query or video generation was performed.
Known expiry enforcement, an authenticated genuine H5 handoff, nonempty new-domain
crypto and actual verified-group binding require genuine upstream inputs and
remain explicitly unverified. External human completion is not replaced by a
local detector, fixture or approval registry.
