# Effective video output and estimator checkpoint

Reviewed 2026-10-07. Partial V01/V04/M01/M02 evidence; no release gate is closed.

## Implemented mechanism

The optional versioned `video_schema.output` maps resolution/aspect-ratio pairs to positive pixel dimensions and a named estimator/review revision. Duration and frame rate must resolve from positive configured defaults or required controls. Validation rejects duplicate mappings, unadvertised values, missing default mappings and unsupported combinations before dispatch. Supplier and customer pricing choices omit resolutions without an effective pixel mapping.

Validated requests expose their effective output dimensions, duration, FPS and schema/estimator identities. Exact estimates support the Seedance pixel formula and a separately named output-seconds formula. Reference duration is included once by the pixel formula; the seconds estimator rejects nonzero reference duration rather than assuming a conversion. Restored invalid specifications cannot produce an estimate. All estimates retain Estimate provenance; none constitutes actual usage, final charges or a qualified maximum liability.

Legacy schemas without output mappings retain their prior validation/serialization behavior. The dashboard request editor preserves separately configured output documents when editing other constraints. The management OpenAPI contract and exported SDK `VideoOutputSchema` type document the optional shape.

The current direct video adapter qualifies video-token metering only. A seconds-estimator configuration is rejected before generation, with no hidden unit conversion. Configuring an estimator does not qualify a channel or add a reported-usage adapter.

## Fresh verification

- The full media crate suite passed 20 tests, including six output tests for defaults, orientation, exact token/reference estimates, seconds estimates, serialization, invalid/missing mappings and legacy compatibility.
- Four isolated PostgreSQL gateway video tests passed. The owner-funded fixture verifies zero new upstream generation for an unsupported seconds meter and unmapped output combination. The prepaid fixture retains reservation-before-egress and exactly-once settlement, and verifies both pricing-choice APIs omit an unmapped resolution.
- Eight request-editor tests passed, including preservation during a versioned limit edit. Dashboard and SDK TypeScript checks passed.
- Media/storage/gateway all-target Clippy passed with warnings denied. The core OpenAPI document parses with unique keys and all 96 local references resolve. Public-boundary and changed-file whitespace checks passed.

These are local fixtures, not authorized live channel or commercial entitlement evidence. No real Supplier configuration, customer funds or OpenRouter credentials were changed.

## Remaining acceptance

Build the output/meter configuration interface; persist effective output and estimate snapshots with each job; expose customer estimates and historical charge explanations; qualify additional reported meters and supported media references. Complete live capability qualification and the customer Video journey remain mandatory. The reviewed maximum liability remains an independent requirement and cannot be inferred from this estimator.
