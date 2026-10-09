# Independent API-key limit verification

On 2026-10-10, two temporary workspace keys made concurrent current-input Chat
requests through the existing personal OpenRouter route. Each request asked for
a short response with an explicit output bound of eight tokens. This was actual
upstream execution, not a fixture run.

One key had each limit set to zero in turn, with the previous policy reset to
unrestricted before the next round. The other key remained unrestricted.

| Restricted-key policy | Restricted request | Independent request |
| --- | --- | --- |
| RPM | HTTP 429, `key_request_rate_exceeded` | HTTP 200, nonempty completion |
| Concurrent requests | HTTP 429, `key_concurrency_exceeded` | HTTP 200, nonempty completion |
| Estimated TPM | HTTP 429, `key_token_rate_exceeded` | HTTP 200, nonempty completion |

Independent PostgreSQL verification found zero dispatched attempts for the
restricted key and exactly three for the independent key. All three had
`confirmed_completed` execution, provider-reported usage and completion
timestamps. Their combined 30 prompt and nine completion tokens matched the
three HTTP responses. Both temporary keys were revoked after the run; persisted
revocation was independently checked.

This establishes isolation between distinct keys for these three controls on the
personal route. It does not exercise the unpriced batch writer's rollback and
individual-retry path, paid reservations or customer settlement. The requests
were owner-funded upstream calls, not evidence of commercial supply. Mixed
protocol contention, nonzero boundary contention and sustained load remain
separate verification requirements.
