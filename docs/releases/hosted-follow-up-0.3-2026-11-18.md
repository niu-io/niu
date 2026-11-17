# Hosted follow-up — 2026-11-18

Tracking: `niu-nrcn.4`, `niu-mvhk`. This dated evidence does not establish final
release acceptance. Fixture outcomes are not used.

## Current-input text request

After the deployment platform confirmed core
`9fd281e523cdbd521585a0a8f98d605d5d5a1073` live, an extracted development SDK
used a fresh 15-minute credential restricted to `qiniu/conatus-free`. An
independent key read confirmed a USD zero spending cap; current published
customer token rates, request fee and minimum charge were all zero.

The first nonstreaming request returned HTTP 429 with an upstream-error response.
No inference retry occurred, and the planned streaming, tool and cancellation
steps were not executed. Independent scoped request inspection found exactly one
record, `run-1089`: `may_have_executed`, upstream HTTP 429, unknown usage, null
customer charge and `not_charged`. This establishes a failed current attempt,
not successful inference or the cause of the Provider response. The temporary
credential was revoked with HTTP 204 and independently denied with HTTP 401;
its plaintext token was removed.

An earlier TCP connection timeout occurred during credential creation. Before
recovering, an independent administrative inventory found no matching new key.
That timeout is distinct from the subsequent acknowledged Provider rejection.

## Network-path evidence

Read-only workstation inspection confirmed a current automatic proxy policy
with a local HTTP/SOCKS proxy and direct fallback. Retained service logs showed
the actual browser taking the proxy path to staging. Historical application logs
near the original 502 incident contain generic parse errors without destination
correlation; retained service logs do not cover that incident. These observations
do not identify its failing hop.

A controlled comparison explicitly selected direct and proxy connections to
both the custom domain and deployment hostname, with three reads per combination.
All 12 current health requests returned HTTP 200 in 0.81–1.03 seconds. No proxy,
DNS or service configuration was changed during this investigation. Current
health does not prove a causal repair of the historical 502, so `niu-mvhk`
remains open.
