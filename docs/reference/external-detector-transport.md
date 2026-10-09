# External detector transport (experimental)

The transport supports installation-administrator synthetic tests and explicitly authorized, required input inspection for declared unmetered services. It does not establish classifier quality or qualify F09. Paid and unknown-cost detectors remain synthetic-only. No detector is configured by default.

Deployment configuration may include a private `[detectors.example]` table with `endpoint`, `api_key_env`, `revision`, `recipient`, `region`, `retention`, `timeout_ms`, `concurrency`, and `max_text_bytes`. Keep credentials in the named environment variable, never in configuration source. Recipient, region and retention are declared configuration, not verified service guarantees. Deployment administrators must establish actual processing conditions before sending any data.

Bounds are 1–30,000 ms per complete operation, 1–16 concurrent calls per configured detector per gateway process, and 1–65,536 UTF-8 text bytes. This is a process-local capacity limit, not a cluster-wide service quota. Responses are limited to 4,096 bytes. Capacity exhaustion fails immediately; calls are not queued or retried. DNS resolution, HTTP delivery and complete response collection share the deadline. Cancelling the inspection future releases its local slot. It cannot retract text already delivered or guarantee that the recipient stops processing; recipient cancellation and retention guarantees require separate qualification. Niu's existing egress client pins validated addresses and disables redirects. Public HTTPS and intentional loopback development endpoints follow its existing restrictions.

`POST /admin/v1/guardrails/detectors/{detector}/preview` requires installation administration authentication. Ordinary workspace identities and inference keys cannot use it. The body is:

```json
{"text":"synthetic test text","consent_to_external_processing":true,"configuration_fingerprint":"fingerprint returned by the description endpoint"}
```

The configured service receives a Bearer credential and:

```json
{"schema_version":1,"detector_revision":"configured revision","text":"synthetic test text"}
```

It must return exactly these fields, with verdict `clear` or `matched`:

```json
{"schema_version":1,"detector_revision":"configured revision","verdict":"clear"}
```

Unknown fields, wrong versions/revisions, malformed verdicts, unsuccessful HTTP status, transport failure, timeouts and resource limits produce an indeterminate result. Niu returns only outcome, a fixed reason, `synthetic: true`, and `enforcement: false`, with `Cache-Control: no-store`. It does not return text, matches, credentials, endpoint URLs or upstream error bodies. This endpoint does not persist the supplied text, invoke an LLM or create inference usage. The external service may incur its own charges; no detector pricing or customer billing integration is implemented.

Remaining qualification includes ordinary-user recipient disclosure and dashboard management, detector quality and measured overhead, retention/deletion guarantees, paid detector accounting, observe-only/output detector modes and supported streaming output inspection. Required input binding and metadata-only audit have the separate scope below.

## Required input inspection

For a live input detector, deployment configuration must explicitly set `cost_mode = "declared_unmetered"` and list the workspace's API identifier in `authorized_workspaces`. The default is `unknown` with an empty allowlist. The declaration is an administrator attestation, not independently verified pricing or a financial guarantee. Paid detectors require accounting work that is not implemented.

Workspace policy `input_detectors` accepts at most four bindings, each containing `detector`, the current `configuration_fingerprint`, and `consent_to_external_processing: true`. Workspace and assigned-key bindings compose; a child does not remove a parent's detector. Activation, preview, rollback and key assignment validate the current workspace authorization and processing fingerprint. Old configuration fingerprints fail closed during inference after deployment changes. The fingerprint also binds Niu’s versioned extraction and transport processing contract. Maintainers must increment that processing revision when extraction, outbound payload shape or processing semantics change. Configuration-only fingerprints from earlier builds require fresh review and consent; migration does not automatically approve them.

Required detectors inspect the existing bounded textual Chat, self-contained Responses and text Embeddings subset. Niu applies mandatory local filters first, validates content, then joins content fields with newline boundaries. Model names, message names, credentials and other request metadata are not sent. Tool definitions/calls, images, files, encoded inputs, previous-response references and unsupported content cannot bypass required inspection. Supported textual Chat role messages, including tool-result text, follow the local input extractor; message names and tool-call identifiers are metadata and are not sent to the detector. Detector limits may be tighter than local filters. Input inspection precedes inference admission, including streamed inference; this does not inspect streamed output.

Only `clear` permits inference. Matches and indeterminate conditions are denied; there is no fallback, speculative inference or less restrictive retry. Audit persistence failure also prevents dispatch. Metadata-only immutable receipts contain the configuration fingerprint, policy revisions, outcome, fixed reason and elapsed time. Clear receipts are bound to attempts, and database dispatch checks require matching clear evidence for every current required detector. Existing dispatch revision locks prevent using a stale policy snapshot.

Workspace readers first review `GET /admin/v1/organizations/{organization}/projects/{project}/guardrails/detectors`, which lists only authorized processing declarations for an existing organization/workspace pair and covers request text after local redaction. The dashboard provides recipient review and current-fingerprint consent under External input checks.

Workspace readers can call `GET /admin/v1/organizations/{organization}/projects/{project}/guardrails/detector-decisions` for the latest 100 safe receipts, including pre-admission denials. Dispatched request guardrail details also include bound detector metadata. These APIs omit receipt/key identifiers, request text, matches, credentials, endpoint URLs and upstream response bodies. Dashboard management has a limited installation-role walkthrough; complete ordinary-user and richer audit presentation remain unqualified.
