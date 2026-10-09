# Guardrails synthetic preview measurements

Measured 2026-10-03 against the local debug gateway, directly over loopback HTTP. This is a diagnostic baseline, not production inference or full F09/F10 performance qualification.

Run `python3 scripts/benchmark-guardrails.py` with `NIU_ADMIN_BASE_URL` (ending in `/admin/v1`), `NIU_ADMIN_TOKEN`, `NIU_ORGANIZATION_ID`, and `NIU_WORKSPACE_ID` in the environment. The script uses synthetic Chat input/output previews only, follows no redirects, changes no policy and makes no model calls. It prints aggregate measurements without credentials, identifiers, payloads or endpoint URLs.

The current script performs three unmeasured warm-up calls per case by default; use `--warmup 0` to reproduce the historical cold-run procedure below. Warm-up counts and valid results are reported separately, excluded from measured elapsed time, throughput and percentiles. Failed warm-up calls fail the run even when all measured samples succeed. Warm-up here is sample-count based, not a sustained production stabilization interval.

The run covered 36 cases: input/output, 4 KiB/64 KiB/512 KiB ASCII text, 1/32 nonmatching local regex rules, concurrency 1/4/8, and 12 calls per case. Rules are compiled per preview. Latency includes transport, authorization, JSON processing, compilation and inspection; it cannot isolate live enforcement overhead. Percentiles use nearest rank among valid synthetic results. Failure counts remain explicit.

| Stage | Concurrency | Valid / calls | Worst case successful p95 |
| --- | ---: | ---: | ---: |
| Input | 1 | 72 / 72 | 93.674 ms |
| Input | 4 | 72 / 72 | 109.751 ms |
| Input | 8 | 52 / 72 | 122.920 ms |
| Output | 1 | 72 / 72 | 127.449 ms |
| Output | 4 | 72 / 72 | 140.295 ms |
| Output | 8 | 40 / 72 | 147.341 ms |

Overall, 380 of 432 calls produced valid synthetic results; 52 received HTTP 503. Shared inspection workers are bounded and do not queue excess work. These results establish observed overload rejection, not an availability pass: successful-only latency excludes rejected work and must not be advertised as end-user performance.

[Full case measurements](guardrails-preview-performance.json) include payload sizes, statuses, elapsed time, throughput and p50/p95/p99. The script exits nonzero if any case lacks all valid results, so overload cannot silently pass a qualification run.

Before release, measure an optimized build with declared hardware, fixed-duration warm-up, more samples and repeated runs; pair live requests with and without enforcement; include redaction, matching blocks, Unicode, maximum buffers, detector/network failures, streaming/cancellation and full customer response latency. Set rollout thresholds from those results and capacity requirements. Current preview measurements do not close those requirements.

Three executable script tests verify redirect refusal, rejection of HTTP-200 results with invalid synthetic/enforcement flags, and valid result reporting without credential/identifier leakage.

## Malformed response handling — 2026-10-04

The benchmark now bounds each preview response to 64 KiB and accepts only a JSON object carrying the expected synthetic, non-enforcing, allowed verdict. Non-object JSON and oversized HTTP-200 responses remain failed samples with their observed status; they contribute no latency percentile and cause the run to fail. This prevents a malformed reply from crashing the report or producing a successful measurement.

All five executable benchmark tests passed, including array/string/number/boolean replies and an oversized response with otherwise valid verdict fields. These are local HTTP fixtures, not new live enforcement or performance measurements. The production performance and full F09/F10 gates remain open.

Seven tests subsequently passed after adding configurable warm-up. They verify twelve calls for four cases with two warm-ups and one measured sample each, measurement counts that exclude warm-ups, and failed warm-ups returning failure despite successful measured samples. No historical performance values were replaced and no new live benchmark was run.

## Explicit output modes — 2026-10-06

Use `--output-modes buffered_full observe_only` to measure both supported complete-output previews. The default remains buffered mode for compatibility. Each output case records its selected mode and requires matching mode/coverage metadata. Clear observation results are distinct from allowed buffered results; redacted responses are invalid for these deliberately nonmatching fixtures. Ten executable harness tests passed, including separate observation measurement and rejection of wrong-mode/redacted results.

A fresh loopback development run used 4 KiB/64 KiB ASCII text, 1/32 nonmatching rules, concurrency 1/4/8, three unmeasured warm-ups and 60 measured calls per case. There were 36 cases, 108 valid warm-ups and 2,160 measured calls. No inference or policy mutation occurred, and the review workspace's attempt count was unchanged.

| Stage/mode | Concurrency | Valid / measured calls | Worst case successful p95 |
| --- | ---: | ---: | ---: |
| Local input | 1 | 240 / 240 | 12.993 ms |
| Local input | 4 | 240 / 240 | 17.100 ms |
| Local input | 8 | 185 / 240 | 24.426 ms |
| Buffered output | 1 | 240 / 240 | 16.580 ms |
| Buffered output | 4 | 240 / 240 | 21.026 ms |
| Buffered output | 8 | 147 / 240 | 31.547 ms |
| Output observation | 1 | 240 / 240 | 15.929 ms |
| Output observation | 4 | 240 / 240 | 21.104 ms |
| Output observation | 8 | 149 / 240 | 30.071 ms |

All 239 invalid measured results were HTTP 503 at concurrency eight; the other 1,921 calls returned validated metadata. The four-worker, no-queue inspector reported overload, and the harness exited nonzero. Successful-only percentiles exclude rejected calls; this is not an availability pass or an inference-overhead comparison. [Full mode-separated measurements](guardrails-output-mode-preview-performance-2026-10-06.json) retain all case counts and p50/p95/p99. These single-run development results do not establish production thresholds, CPU/RSS, detector costs, TTFT, streaming throughput or full F09/F10 qualification.
