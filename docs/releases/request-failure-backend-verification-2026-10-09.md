# Durable failure diagnosis checkpoint — 2026-10-09

The running gateway was rebuilt with migration 0202 and restarted against the
existing PostgreSQL database. An additive migration retained previous requests
and the existing encryption identity. No fixture-test outcome is used as evidence.

## Current-input verification

A temporary workspace key explicitly granted two existing personal-route model
aliases. Payload capture was disabled on all requests.

- An actual nonstreaming request to the configured invalid upstream model returned
  HTTP 400 and a fixed `upstream_error` response.
- An actual streaming request to that model also returned HTTP 400 before SSE.
- A real `openai/gpt-4.1-mini` streaming request returned HTTP 200, provider-reported
  usage and `[DONE]`.

The scoped request API and independent PostgreSQL reads showed
`upstream_http_error` with upstream status 400 for both refusals. Their usage
remained unknown and execution remained `may_have_executed`. The successful
request had null failure metadata and confirmed, provider-reported usage. All
three remained owner-funded with no Niu customer charge.

No payload row existed for these requests. Explicit payload deletion did not
remove their diagnostic records. CSV exports contained the two classifications
and statuses, empty diagnostic cells for the successful request, and no attempt
identifiers. A normal workspace viewer could read its records; a foreign
workspace request returned 404. Directly attempting to change a saved diagnostic
inside a transaction was rejected by the database's immutability trigger.

After another gateway restart, all three complete request records and the CSV
rows compared equal to their pre-restart artifacts. Payloads remained absent.
The temporary API key and reader session/operator were revoked.

## Boundaries and tooling

This live run verifies HTTP rejection capture, success without a false failure,
payload-independent persistence, scoped access, export and process restart.
Other categories, midstream failures and non-Chat protocols remain unverified by
this run. No commercial billing, video or performance claim is made.

The gateway build, scoped gateway/storage Clippy with warnings denied, Rust
formatting and SDK TypeScript checking completed. They are tooling checks, not
substitutes for the actual requests and independent final-artifact inspection.
See the [failure contract](../reference/request-failure-diagnostics.md).
