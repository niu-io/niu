# API-key IP policies

Each key lineage has an optional IP allowlist. Secret rotation preserves the policy
and its revision history. The policy applies to personal and paid routes alike.
An absent policy or explicit `null` permits any source; `[]` denies every source.
Up to 64 IPv4/IPv6 addresses or CIDRs are accepted and normalized to network CIDRs.

## Management API

The machine-readable contract is [key-ip.openapi.yaml](../../contracts/key-ip.openapi.yaml).

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

Eight simultaneous HTTP policy updates using initial revision zero produced one
accepted update and seven revision conflicts. An independent database query
confirmed the winning CIDR, revision one and exactly one history row. The temporary
key was revoked after verification. This checks configuration write contention;
it does not check an update racing an in-flight inference request.

These runs do not qualify an actual deployed reverse proxy, IPv6 networking,
concurrent policy-update races, or cancellation of in-flight inference. They do
not establish paid billing behavior or rate/concurrency limits. No fixture-test
outcome is used as evidence.

## Scoped management verification (2026-10-10)

Actual owner, viewer and foreign-workspace operator credentials exercised this
policy endpoint and its history. Viewer writes returned 403; owner configuration
succeeded; repeating the old revision returned 409. The viewer could read the
configured policy and history. Foreign-workspace operator reads and writes
returned 404, including history, preserving resource-existence isolation. Even
installation access returned 404 when a real key was addressed under the wrong
workspace. Invalid history page size returned 400.

Independent SQL inspection confirmed one successful member-attributed history row
for this verification key, matching its HTTP history. Responses contained the
actor name and kind without an internal operator identifier. Temporary keys and
operators were revoked. This does not verify permission revocation racing a write.


## Bounded source-policy reads — 2026-10-12

Clean `a9de7c8` uses the shared bounded read-only snapshot for request-source
checking, policy reads and history reads: transaction-local lock timeout 250 ms,
statement timeout 2 s. Storage failure returns sanitized 503 and does not mean
unrestricted access, an absent policy or an empty history. Reads commit before
any upstream work; existing dispatch-time policy revalidation remains unchanged.

An actual isolated run copied the stopped 1,842-request database and created a
normal scoped key with a loopback allowlist. On the preceding `c1eee14` executable,
native locks kept authenticated model-list, owner policy and history reads pending
for at least 1.6 seconds; each returned 200 only after lock release. Those reads
created no request or financial record.

With the committed fix, an exclusive policy/history-table lock produced:

| Actual HTTP path | Status while lock held | Client elapsed |
| --- | --- | --- |
| Authenticated model list | 503 | 259.97 ms |
| Scoped owner policy read | 503 | 255.44 ms |
| Scoped owner history read | 503 | 255.51 ms |
| Chat admission with allowed source | 503 | 255.51 ms |

Native lock observations confirmed each wait and retained lock at failure.
No attempt was created by any of these unavailable reads/admissions. After
release, one actual strict-marker model response completed and reported tokens
produced 19,260 USD nanounits of customer charge and an equal debit under the
retained internal tariff. Setting the allowlist to `[]` then returned 403
`key_ip_not_allowed` without another attempt, including after restart. Restoring
the loopback allowlist recovered the identical model-list response; key revocation
returned 401.

Independent PostgreSQL reopening checked all saved error artifacts, native
allow/deny/allow revisions, retained revocations, response hash/content/usage and
exact charge/debit arithmetic. Final attempts/charges/ledger rows total 1,843;
charge/debit total is 34,693,955 USD nanounits. No funding or outstanding hold
appeared. Native replacement followed a fresh isolated backup restore and
preserved original configuration, encrypted credentials and durable counts.

This qualifies the exercised lock failures, allowed actual call, deny-all recovery
and revocation. It does not prove every concurrent policy change/admission race,
trusted-proxy configuration, pool-acquisition deadline, sustained admission
capacity, or execution of the separate 2-second statement limit. Personal upstream
testing does not establish commercial Supplier qualification. Fixture outcomes
provide no evidence.
