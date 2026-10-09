# Bounded actual streaming observation

Date: 2026-10-09. Native release gateway, source `32f49dd`, existing PostgreSQL
and personal OpenRouter text route. This complements the local
[request-history measurements](backend-read-performance-2026-10-09.md).

Eight actual requests used a temporary model-scoped workspace key, at most four
concurrent requests, the same short prompt asking for one word, a 16-token output
limit and streaming usage enabled. Each used a fresh loopback HTTP connection to
Niu. No retries or fallback calls were requested. Total wall time was 2.579 s.

| Client measurement | Minimum ms | Median ms | Maximum ms |
| --- | --- | --- | --- |
| First nonempty streamed content | 767.68 | 1212.39 | 1622.36 |
| Complete response body | 849.10 | 1285.43 | 1659.97 |

All eight responses were HTTP 200 with nonempty content, a `stop` finish reason,
reported usage and the final SSE completion marker. Each saved request record
reported confirmed completion, complete timings and provider-reported usage.
Prompt/completion token counts matched the streamed usage exactly, and saved
finish reasons matched. Independent PostgreSQL inspection found exactly eight
attempts for the temporary key. Saved failure fields were null. Customer charges
were null with `owner_funded` status, preserving the personal-route boundary.
The temporary key was revoked after the run; raw responses, identifiers and
credentials remain outside the repository.

This small bounded sample exercises real concurrent streaming and durable
attribution. It includes upstream/network latency, uses a tiny output and is
insufficient for tail-percentile, sustained throughput, upstream SLA or maximum
capacity claims. No customer commercial billing or discounted Supplier claim is
made. It does not replace independent internal payment and accounting acceptance.
No fixture outcome contributes to these observations.
