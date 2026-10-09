# Customer media rate lifecycle checkpoint

Reviewed 2026-10-07. This is a local backend/API/SDK checkpoint, not completion of F05 or the customer pricing administration workflow.

## Delivered behavior

Installation administration can read named qualified commercial media configuration choices and bounded, organization-scoped selling history and atomically replace a dimensional media selling schedule. Replacement publishes the immutable new card and appends the old card's eligibility cutoff in one transaction. Dimensions and meter must match. Invalid retirement, changed receipts, foreign revisions and competing effective replacements fail without partially publishing or retiring a schedule. Identical retries are accepted while the configured route bindings remain current.

Historical cards and job pricing snapshots are unchanged. History preserves monetary values, route revisions and effective timestamps as exact decimal strings. It reads only customer selling tables; Supplier purchase prices are neither substituted nor joined. Ordinary company members and inference keys cannot read or mutate platform price configuration.

Public contracts and the JavaScript client expose:

- `GET /admin/v1/organizations/{organization}/billing/media-rate-models` and `listCustomerMediaRateModels`, with active media-only offer bindings, schema-supported resolutions and hidden internal route references. Choices omit personal, paused and unqualified routes, credentials, upstream endpoints and all prices.
- `GET /admin/v1/organizations/{organization}/billing/media-rates` and `listCustomerMediaRates`, with bounded revision cursors.
- `POST /admin/v1/organizations/{organization}/billing/media-rates/replace` and `replaceCustomerMediaRate`, with explicit immutable receipts and no automatic mutation retry.

## Verification

Fresh isolated PostgreSQL execution of the media-rate suite passed 10 tests, including concurrent competing replacements, rollback, replay, scope, historical selection and values beyond JavaScript's safe integer range. Existing stale-route, personal-credential exclusion, discount, ambiguity and retirement checks remain covered.

Fresh executions of the four gateway video tests and ten PostgreSQL media-rate tests passed. Gateway coverage includes qualified choice bindings, denied company/inference-key access, paused-offer removal, privacy, history, identical replacement retries and existing prepaid dispatch/settlement. An enabled schema without qualification yields no choices. The JavaScript SDK suite passed 131 tests. New client checks cover organization paths, bounded pagination, exact history, request allowlisting, rejected lossy values and explicit retry after an uncertain transport outcome. The billing OpenAPI document parses with unique keys and all 72 local references resolve. Storage/gateway all-target Clippy passed with warnings denied; public-boundary and changed-file whitespace checks passed.

## Remaining work

Rendered customer selling-rate management, effective output/meter/liability configuration, complete financial explanations and authorized live video qualification remain open. Registration alone does not qualify a commercial route or enable paid dispatch. This checkpoint does not verify merchant payments, packaged recovery or a complete desktop/narrow customer workflow.
