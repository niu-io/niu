# Request CSV export verification

Verified 2026-10-03. This covers the CSV API and dashboard export interaction for F06; it does not qualify the complete Logs workflow or release.

`GET /admin/v1/organizations/{organization}/projects/{project}/requests/export` uses workspace read authorization and the existing date, model, key and request-status filters. A single database statement reads the filtered range independently of the visible page. The response is an attachment with `Cache-Control: no-store`.

The export contains request time, model and API key names, delivery HTTP status, Provider execution status, usage confidence, input/output tokens, customer charge status/currency/exact nanounits, and observed duration/completeness. Unknown values remain blank. Internal IDs, credentials, payloads and Supplier procurement fields are excluded. Quoted CSV fields escape delimiters and quotes; formula-like names receive a leading apostrophe. More than 10,000 matching requests returns HTTP 413 with guidance to narrow the filters, rather than a partial file.

Validation:

- PostgreSQL-backed acceptance exported 151 requests, exceeding the request page limit; verified model/status filtering, workspace isolation, reader access and rejection of inference keys or invalid credentials.
- Verified exact charge digits above JavaScript's safe integer range, unknown token values, formula protection and exclusion of internal identifiers and confidential fields.
- Verified the 10,000-row bound and successful filtered export after an oversized-range rejection.
- Read-only live export returned 33 saved demo requests, matching the request metadata's models and token counts without internal identifiers. No inference calls, credential changes or saved-data mutations were needed.
- Gateway suite: 141 tests plus one process-replacement test passed. Clippy with warnings denied, docs build, OpenAPI parsing and scoped export security contract checks passed.
- Dashboard follows the inspected OpenRouter Logs toolbar overflow-menu pattern. Its Export CSV action uses the active date/model/key/status filters and excludes pagination. Changing filters, credentials or workspace cancels pending work. Oversized-range errors explain how to narrow the filters; errors never download a partial file.
- All 19 Logs integration tests and the dashboard build passed, including exact filter forwarding, successful download setup/object URL cleanup, HTTP 413 guidance and pending-export cancellation.
- Rendered the live menu and exercised Export CSV at desktop and 390-pixel widths, including model/status filter chips. The mobile Blocked requests action uses an accessible icon button to keep toolbar actions together. A separate read-only API check matched the filtered file to 20 saved completed Gemini requests. Browser clicks and API content checks are separate evidence; browser download-file contents were not inspected.
- JavaScript SDK `NiuAdminClient.exportGatewayActivity` returns CSV text unchanged, accepts scoped range/model/key/status filters and cancellation, rejects pagination and redirects, and propagates HTTP errors without retry. A successful response must identify itself as CSV. All 65 SDK tests passed.
- Packed SDK version 0.1.0, SHA-256 `eb2d723ed1fd9eb3304bff69b54f4f7d601ee11e3998b1b848d3f936cd9c9869`, read the same 20 filtered saved requests through the running service. Already-aborted calls and invalid credentials were rejected. This was read-only and made no model calls. The tarball was built locally, not published.

Remaining: sorting and full investigation workflow qualification. Oversized-range and mid-flight cancellation error paths have automated coverage; they were not forced against the live demo database. Multi-key Supplier behavior has separate fixture evidence; a second live Supplier credential and qualified supply remain outside this export check.
