# Mixed streaming and reporting after bounded authentication

Current-input checkpoint on clean backend `e704955`, reviewed 2026-10-12.
Fixture outcomes provide no evidence. This measures the specified local workload,
not production SLOs, maximum capacity or a New API benchmark comparison.

## Workload and observed behavior

A stopped copy retained 1,600 actual streamed requests and exact customer debits.
One Gateway used two configured admission connections. Eight inference worker
slots offered 240 fresh streams at 4/second; four report worker slots offered
1,200 ordinary-viewer reads at 20/second. Half the reads selected the complete
100-row report plus full-range summary, and half selected recorded failures.
The workload lasted 61.27 seconds including final response completion.

236 strict marker streams returned the fresh requested content and `[DONE]`.
Four deliberately short output limits on long tool arguments produced actual
invalid native tool turns. Each returned a safe `upstream_invalid_response` SSE
error with code 502 and no `[DONE]`; already committed HTTP headers remained 200.
No tool was executed and no request was retried. Terminal provider-reported usage
still produced the accurate customer charge and equal debit for each request.
The normal completions and errors are actual upstream behavior, not simulated
responses or an assumption based on test counts.

| Client observation | Count | p50 | p95 | Maximum |
| --- | --- | --- | --- | --- |
| Streams, including four terminal errors | 240 | 1,326.59 ms | 1,806.99 ms | 3,224.51 ms |
| All viewer reads | 1,200 | 17.68 ms | 26.00 ms | 53.66 ms |
| Complete reports | 600 | 23.48 ms | 26.82 ms | 53.66 ms |
| Recorded-failure reports | 600 | 11.91 ms | 14.39 ms | 19.79 ms |

Maximum observed scheduling lag was 10.85 ms for streams and 10.16 ms for reads.
All report reads returned 200 with no-store while calls were admitted and charged.
Worker slots do not imply continuous simultaneous active requests.

## Independent reconciliation

A separate process reopened the stopped PostgreSQL database, rehashed and parsed
all 1,840 original/new stream artifacts, and compared reported usage, key binding,
completion classification and exact original-rate charge/debit arithmetic to native
rows. It independently reconstructed the four invalid tool turns and matched safe
failure/timing records. New charges total 4,394,692 USD nanounits; four failed
output validations account for 106,668 of that amount. Final customer charges and
equal debits total 31,273,840 USD nanounits.

Every saved report digest and returned reference was checked against native
scope, key attribution, known usage/charge fields and failure membership. Final
complete/failed summaries and both full CSV exports matched native counts and
amounts. Restart returned identical final reports and export bytes. Temporary
key/viewer access was revoked. No funding or open customer/procurement hold
remained. Protocol stream fields and customer reports were also checked for the
specified confidential cost, price, endpoint and credential fields; none appeared.
Upstream service naming is independent of those confidential values.

Interim reports are statement snapshots during changing work. This verification
does not reconstruct every interim MVCC summary from a transaction replay. The
final independently reopened artifacts establish the completed reconciliation.

## Verification boundary

This adds current-version mixed inference/reporting evidence after authentication
reads became bounded. It does not qualify saturation, long-duration stability,
multiple tenants/Gateways, other protocols/media, every concurrent policy change,
resource consumption or a production latency guarantee. No new CPU/RSS profile
was collected. Original source and installation identities were preserved.

Earlier workloads retain their executable revisions and different request
contents. Fresh marker length and actual token usage differ here; the timings
and charge totals do not establish a causal comparison with those workloads.
Personal OpenRouter execution and explicit internal verification rates/approved
credit do not establish discounted commercial supply or received-cash funding.
