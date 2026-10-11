# Gemini API private response boundary

Implementation `69c161d` applies the existing private API cache policy to
`/v1beta` and all descendants. Unknown paths use the standard JSON API error
response. The committed GenerateContent route remains
`POST /v1beta/models/{model_action}`; this change does not migrate that contract.

## Current-input verification — 2026-10-12

An isolated native PostgreSQL/Gateway run against the preceding retained binary
observed a JSON 401 from an invalid credential at a GenerateContent route without
`Cache-Control`. Unknown `/v1beta` paths returned empty 404 responses without
that header. The immutable updated binary returned the same safe authentication
error with `Cache-Control: no-store`; unknown paths and the namespace root
returned JSON 404 errors with the same private cache directive.

An independent process hashed and parsed the saved HTTP bodies and reopened the
stopped database on schema 278. No attempt, balance entry or funding receipt was
created. This verifies these actual failure responses, not successful Gemini
inference, upstream protocol compatibility or complete release acceptance. No
fixture outcome is evidence.

The native installation was updated after a fresh backup was restored and
fingerprint-checked. Binary digests, readiness and persisted routing agreement
were checked; original configuration, encrypted identity and durable counts were
preserved. Other pending interface changes were excluded from this increment.
