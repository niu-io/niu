# Mounted agent connection review — 2026-11-04

Beads: `niu-287.8`; related: `niu-9g9u`, `niu-ya50.2`.

An actual invocation of the source login client with the selected development URL `https://lab.lyu.ai/niu/` stopped before authorization because the client rejected URL paths. The browser routing prompt also constructed its deployment and workspace URLs from the origin alone. A shared-origin mounted deployment therefore could not be carried through the documented agent handoff.

The revised source client accepts an HTTPS deployment URL (or loopback HTTP) with an optional plain-segment mount, carries that mount through browser authorization and verification, stores it as an optional field in version 1 credentials, and uses it when MCP resolves its gateway. Origin-only credentials continue to mean the root mount. The resolver rejects a conflicting explicit MCP base; the client rejects unsafe or encoded paths and redirects. The dashboard routing/evaluations/events agent prompt includes the configured dashboard base. The native plugin's README now describes the current default-disabled model invocation instead of claiming paid execution is granted by default.

## Current-source verification

A marketplace was built from the working tree, and its packaged login and MCP programs were run against an isolated loopback gateway, database, and dashboard mounted at `/niu/`. The real browser approved the Default workspace without allowing model calls. The saved version 1 credential had owner-only mode; its mounted key and models requests returned 200 and key readback reported `invocation_allowed: false`. Packaged MCP `inspect_key` returned the same authority. A root-only credential resolved to the root `/v1`; a mismatched configured gateway and selected unsafe path examples were rejected. The isolated issued key was revoked and its next request returned 401. No paid invocation was made.

The actual routing empty-state copy action produced the mounted deployment and workspace URLs in the browser; its narrow rendering was inspected. This is not a full host installation or hosted/staging verification. Other setup prompt surfaces, the preserved old browser session, release artifacts and production identity isolation require separate evidence. No conclusion about an older hosted candidate follows from this local run.
