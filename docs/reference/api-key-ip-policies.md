# API-key IP policies

Each key lineage has an optional IP allowlist. Secret rotation preserves the policy
and its revision history. The policy applies to personal and paid routes alike.
An absent policy or explicit `null` permits any source; `[]` denies every source.
Up to 64 IPv4/IPv6 addresses or CIDRs are accepted and normalized to network CIDRs.

## Management API

Use `/admin/v1/organizations/{organization}/projects/{workspace}/keys/{key}/ip-policy`:

- `GET` returns `data.allowed_cidrs` and `data.revision`; a never-configured policy has null revision.
- `PUT` requires `allowed_cidrs` (array or explicit null) and `expected_revision`
  (decimal string, initially `"0"`). It returns the new revision string in `data`.
  Scoped owners or installation administrators can write; scoped readers can read.
- `GET .../history` returns descending immutable revisions with `allowed_cidrs`,
  `revision`, `recorded_at`, `actor_kind` and `actor_name`. Pagination accepts
  `before_revision` and `limit` (1–100, default 50).

Missing or out-of-scope keys return 404. Stale revisions return 409. Invalid
networks return 400; missing required JSON fields return 422. Management access
uses operator authorization, allowing an owner to repair a deny-all policy.
The JavaScript admin SDK exposes `getKeyIpPolicy`, `setKeyIpPolicy` and
`listKeyIpPolicyHistory`.

## Request source and enforcement

The gateway uses the TCP peer address by default and ignores forwarding headers.
`NIU_TRUSTED_PROXY_CIDRS` optionally configures up to 64 comma-separated proxy
CIDRs; invalid configuration prevents startup. Only when the peer is trusted does
it inspect `X-Forwarded-For`. Configure only controlled proxies that append or
replace that header with the actual peer address.

The gateway walks the chain from right to left and uses the closest untrusted
address, or the leftmost address when every hop is trusted. It accepts one header,
at most 4096 bytes and 32 literal addresses. Invalid chains return 400. A trusted
peer without this header leaves the source unknown; restricted keys then fail
closed. `Forwarded` and `X-Real-IP` are ignored. IPv4-mapped IPv6 peers normalize
to IPv4 before matching.

A restricted key with a missing or disallowed source receives 403
`key_ip_not_allowed` during HTTP authorization, before creating inference work.
This includes bearer keys, the alternate key header and dashboard-selected keys.
Saved video result retrieval also rechecks authorization after upstream fetching.
Policies do not cancel already admitted requests. Background recovery of saved
jobs has no client request and continues independently of this policy.

## Current-input verification (2026-10-09)

Actual HTTP requests against the running gateway and its PostgreSQL database
verified disallowed localhost access, forged forwarding headers, and a denied
chat request with independently confirmed zero attempt records for that key.
Allowing localhost permitted a real personal model response. Rotation preserved
the policy; the old secret failed. Deny-all, explicit unrestricted mode, owner
versus viewer writes, malformed input, normalized addresses, and four persisted
history revisions were checked. Temporary credentials were revoked afterward.

A separate temporary gateway listener with a trusted loopback proxy range verified
missing headers, allowed addresses, nearest-untrusted-hop rejection, trusted-hop
traversal and malformed headers. It was stopped after verification. Saved-video
dashboard access rejected a deny-all key, including a forged forwarding header,
and succeeded after permitting localhost.

These runs do not qualify an actual deployed reverse proxy, IPv6 networking,
concurrent policy-update races, or cancellation of in-flight inference. They do
not establish paid billing behavior or rate/concurrency limits. No fixture-test
outcome is used as evidence.
