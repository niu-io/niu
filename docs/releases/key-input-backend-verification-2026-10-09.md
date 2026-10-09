# Workspace key input verification — 2026-10-09

## Observed defect and correction

An actual key-creation request containing `spend_limit_nanos: "0"` returned HTTP
201. Reading the saved key confirmed that no spending limit was stored. The
unsupported field had been silently ignored. That temporary key was revoked
without inference.

Key creation now rejects unknown fields with HTTP 400 and a fixed JSON error
describing the accepted fields. This includes unsupported limit fields and
misspelled model or expiration fields. Authorization is checked before returning
the validation error. The OpenAPI input schema declares `additionalProperties:
false`.

This correction does not implement per-key spending limits. Customer workspace
spending limits use the separate spending-limit API; personal owner-funded
calls are not evidence for prepaid customer spending enforcement.

## Current-input verification

Against the running gateway and its existing PostgreSQL database:

- Requests with `spend_limit_nanos`, `allowed_model` and `expires_in_seconds`
  returned HTTP 400. Independently reading the key list before and after these
  requests produced identical records; no key was created.
- A request using supported fields created a temporary model-scoped key. That
  key completed an actual OpenRouter streaming generation with a terminal
  `[DONE]` event. The persisted request recorded confirmed completion,
  provider-reported usage and owner-funded status without a customer charge.
- The temporary key was revoked. An independent PostgreSQL query confirmed its
  revoked state and exactly one dispatched attempt, matching the request record.

The private artifacts remain outside the public repository. Compilation and
lint checks were executed; fixture-test outcomes are not evidence. Per-key
monetary limits, customer prepaid enforcement and the full release remain
unverified.
