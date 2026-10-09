# Logs retained-content verification

Verified 2026-10-03 for the F06 payload-diagnosis subset. Full consumption investigation remains incomplete.

Request details show readable Request and Response messages first, with Raw data in a secondary tab. Chat JSON and streamed Chat deltas support text, refusals and indexed tool-call fragments. Responses JSON supports text messages and function-call output. Unsupported content points to Raw data; malformed, interrupted or truncated responses are identified as partial. Tool arguments use the shadcn Collapsible installed through its CLI. Text is escaped by React; displayed and copied UUIDs are masked, including raw payload views.

Reference: inspected OpenRouter Logs, Generation details and its secondary Raw JSON control. I/O logging was disabled in that reference session, so its retained-message layout could not be inspected. Niu preserves its existing request-detail shell and uses installed shadcn Tabs, Button, Textarea and Collapsible for the available content.

Acceptance evidence:

- All 22 request-content and Logs integration tests passed. Cases cover text protocols, multiple streamed choices, fragmented tools, partial/malformed streams, unsupported data, mixed non-text input, raw-tab access, copy behavior and UUID masking. Dashboard type checking and build passed.
- Two real OpenRouter demo requests completed: bounded text output and a forced function-call response. Both bodies were retained, complete and untruncated; Logs customer charges reconciled to the immutable customer tariff. No tool was executed.
- Inspected both real requests at desktop and 390-pixel widths, including Messages/Raw data, message copying and expanded/collapsed function arguments. No clipping was introduced in the inspected content.
- Both temporary workspace keys were revoked. Temporary tool capability settings were restored using revision checks; existing Supplier credentials and customer pricing were preserved.

The first immediate payload read raced durable completion; a subsequent read confirmed persistence without repeating inference. Retention remains the existing 24-hour backend policy. This evidence does not qualify every protocol, stream failure or deletion race. Responses streaming, embedding-vector visualization and multimodal rendering are not implemented in the readable view; raw retained data remains available. Sorting, column controls, full-range diagnosis and complete F06 qualification remain open.

## Retention fault isolation — 2026-10-08

Expired asset-request cleanup and Logs payload cleanup both run before the shared
maintenance method returns an error. A failed asset cleanup no longer skips Logs
erasure; its error remains visible so maintenance can retry. Each cleanup retains
its existing 500-record batch and locked-row behavior. This isolates an operation
that returns an error; it does not add a timeout or guarantee progress during a
stalled database call.

All four PostgreSQL request-payload tests passed against migrations through 0168
in a disposable cluster. The new fault fixture injects an asset-update failure,
verifies that expired payload content is physically removed despite the returned
error, preserves the attempt accounting record, and verifies successful cleanup
after fault removal. Existing tests cover workspace isolation, capture/deletion
races, retention and size limits, bounded batches and skipped locked records.
The changed source and test passed the public-boundary check. This is local
active-database retention evidence, not backup erasure or complete F06/F09/F10
acceptance. No UI, Supplier credential or demo database changed.
