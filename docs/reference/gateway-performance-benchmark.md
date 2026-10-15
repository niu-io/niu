# AI gateway performance benchmark: Niu vs New API vs LiteLLM Proxy

This document records the methodology, complete measurement dataset, and architectural analysis of our head-to-head AI gateway performance benchmark comparing **Niu** (`v0.2.4`, Rust / Axum / Tokio), **New API** (`QuantumNous/new-api` commit `45fbb14`, Go / Gin / GORM), and **LiteLLM Proxy** (`BerriAI/litellm` `v1.104.0`, Python / FastAPI / Uvicorn + `uvloop`).

The evaluation adapts the open-source [LiteLLM AI Gateway Benchmark](https://github.com/BerriAI/ai-gateway-bench) methodology ([published at litellm.ai/ai-gateway](https://www.litellm.ai/ai-gateway)) and extends it across concurrent load tiers (`c = 1, 4, 16, 64`), both OpenAI `/v1/chat/completions` and native Anthropic `/v1/messages` routes, Server-Sent Events (SSE) token streaming (`ITL` and `TTFT`), multi-turn coding-agent sessions (`claude_code` and `codex` profiles), memory footprint (`RSS`), and cloud infrastructure cost efficiency (`RPS/$`).

---

## 1. Executive summary

| Metric | Niu (`v0.2.4`, Rust) | New API (`45fbb14`, Go) | LiteLLM Proxy (`v1.104.0`, Python) | Niu Advantage |
| :--- | :--- | :--- | :--- | :--- |
| **Peak Throughput (`/v1/chat/completions`, `c=64`)** | **3,238.7 RPS** | 865.6 RPS (peak) / 352.0 RPS (sustained) | 302.2 RPS | **3.74x New API (peak)** / **10.72x LiteLLM** |
| **Tail Latency (`p99` at `c=64`, `/v1/chat/completions`)** | **31.54 ms** (`p50: 18.94 ms`) | 135.73 ms (peak) | 338.74 ms (`p50: 193.26 ms`) | **4.30x lower than New API** / **10.74x lower than LiteLLM** |
| **Throughput (`/v1/messages` Anthropic, `c=64`)** | **2,518.8 RPS** (`p99: 60.61 ms`) | 164.5 RPS (`c=16`, `p99: 473.92 ms`) | 232.2 RPS (`p99: 397.88 ms`) | **10.85x LiteLLM** / **15.31x New API** |
| **Concurrent SSE Streaming (`c=16`, 40 tokens/stream)** | **235.9 streams/s** (`9,436 tok/s`) | 100.9 streams/s (`4,036 tok/s`) | 83.0 streams/s (`3,320 tok/s`) | **2.34x New API** / **2.84x LiteLLM** |
| **Streaming Inter-Token Latency (`ITL p50`, `c=16`)** | **1.34 ms** (`43.0` chunks/stream) | 3.55 ms (`42.0` chunks/stream) | 4.62 ms (`43.0` chunks/stream) | **2.65x faster than New API** / **3.45x faster than LiteLLM** |
| **16-Session Coding Agent (`claude_code`, 30 turns)** | **1,746.0 ms** (`turn p50: 55.0 ms`) | 4,864.9 ms (`turn p50: 142.0 ms`) | 3,353.3 ms (`turn p50: 103.0 ms`) | **2.79x faster than New API** / **1.92x faster than LiteLLM** |
| **16-Session Coding Agent (`codex`, 30 turns)** | **1,686.6 ms** (`turn p50: 54.1 ms`) | 4,891.9 ms (`turn p50: 132.8 ms`) | 5,803.9 ms (`turn p50: 180.8 ms`) | **2.90x faster than New API** / **3.44x faster than LiteLLM** |
| **Idle / Peak Memory Footprint (`RSS`)** | **18.2 MB / 26.4 MB** | 37.4 MB / 98.5 MB | 158.0 MB / 194.6 MB | **5.98x less peak RAM than LiteLLM** / **3.73x less than New API** |
| **Gateway Cost per 1M Requests (`c7g.large`)** | **$0.014** (`71,599 RPS/$/hr`) | $0.052 (`19,136 RPS/$/hr`) | $0.150 (`6,681 RPS/$/hr`) | **10.7x lower proxy compute cost than LiteLLM** |

Crucially, **Niu achieves 3,238.7 RPS while executing full ACID PostgreSQL request admission and completion recording on every request**, whereas LiteLLM Proxy was benchmarked in its fastest stateless configuration (master key in memory, zero database writes).

---

## 2. Benchmark methodology

### 2.1 Reference design (`BerriAI/ai-gateway-bench`)

Following the [LiteLLM AI Gateway Benchmark](https://github.com/BerriAI/ai-gateway-bench) design:

1. **Zero-Delay Mock Upstream (`mock-upstream`)**:
   Real LLM Provider APIs exhibit hundreds of milliseconds of Time-To-First-Token (`TTFT`) and variable network jitter that mask gateway proxy overhead. To isolate the gateway's own request routing, authentication, protocol serialization, streaming chunk forwarding, and accounting overhead, all three gateways route traffic to the same deterministic Rust/Axum `mock-upstream` server running on loopback (`127.0.0.1:9000`).
   - For throughput and proxy-overhead tests, `mock-upstream` runs with `MOCK_TTFT_MS=0`, `MOCK_ITL_MS=0`, and `MOCK_OUTPUT_TOKENS=40`.
   - For multi-turn coding agent simulation, `mock-upstream` streams realistic 40-token OpenAI SSE (`/v1/chat/completions`) and Anthropic SSE (`/v1/messages`) responses with growing conversation histories across 30 turns.
2. **Closed-Loop Load Generation (`load-probe`)**:
   - The Rust `load-probe` binary (`reqwest` + `tokio` with persistent HTTP/1.1 connection pooling, `pool_max_idle_per_host = concurrency * 2`, `tcp_nodelay = true`) drives closed-loop requests across `c = 1, 4, 16, 64` concurrent workers.
   - Before each timed run, `--warmup 32` untimed requests warm up the gateway's HTTP keep-alive pool, TLS/socket state, and prepared SQL statements.
   - Every response body is fully consumed (`resp.bytes().await`) and verified for HTTP `200 OK` before recording per-request latency in microseconds.
3. **Why We Test Beyond `c = 1`**:
   LiteLLM's public benchmark page emphasizes sequential single-client (`c = 1`) latency on a stateless route. In production, AI gateways multiplex dozens of concurrent coding agents, background workers, and SSE streams while enforcing workspace authentication and persisting usage audit trails. Testing across `c = 1, 4, 16, 64` exposes connection-pool contention, event-loop saturation, garbage-collection pauses, and database write amplification that remain invisible at `c = 1`.

### 2.2 Hardware & software environment

All processes (mock upstream, gateway under test, PostgreSQL 17.11, and load generator) ran on the same isolated machine over loopback (`127.0.0.1`) with proxy environment variables (`HTTP_PROXY`, `HTTPS_PROXY`, `ALL_PROXY`) explicitly cleared:

- **Hardware**: Apple M4 (10-core CPU, 24 GB unified memory, `arm64`)
- **Operating System**: macOS Darwin 27.2.0 (`arm64`)
- **Database**: PostgreSQL 17.11 (`127.0.0.1:55439`, `max_connections = 300`, `shared_buffers = 512MB`, `synchronous_commit = off`, `work_mem = 16MB`)
- **Mock Upstream**: `ai-gateway-bench/mock-upstream` (`rustc 1.91.1 --release`, Axum 0.8 / Tokio 1.x)

### 2.3 Gateway configurations & durability matrix

To ensure a fair and transparent comparison, each gateway was built in release mode and configured according to its recommended high-throughput deployment pattern:

| Dimension | Niu (`v0.2.4`) | New API (`45fbb14`) | LiteLLM Proxy (`v1.104.0`) |
| :--- | :--- | :--- | :--- |
| **Runtime & Framework** | Rust (`--release`), Axum, Tokio | Go 1.24 (`-ldflags="-s -w"`), Gin (`GIN_MODE=release`), GORM | Python 3.12, FastAPI, Uvicorn, `uvloop`, `httptools` |
| **Authentication Mode** | Workspace API key (`SHA-256` hash + in-memory cache with 5s TTL) | User token (`MEMORY_CACHE_ENABLED=true`, `SelfUseModeEnabled=true`) | In-memory `master_key` (no DB lookup) |
| **Per-Request Database Work** | **Full ACID PostgreSQL**: pre-dispatch `operations` + `attempts` admission (`1` batched CTE) and micro-batched completion settlement (`up to 64 requests / 2ms flush`) | **PostgreSQL**: token lookup (`MEMORY_CACHE_ENABLED=true`), user quota checks, and `BATCH_UPDATE_ENABLED=true` usage logging | **None** (stateless proxy mode; database logging disabled to measure LiteLLM's fastest possible path) |
| **Log Level** | `RUST_LOG=warn` | `GIN_MODE=release` | `LITELLM_LOG=ERROR` (`disable_spend_logs: true`) |
| **Connection Pool** | `NIU_DB_MAX_CONNECTIONS=96`, `plan_cache_mode=force_generic_plan` | Standard `database/sql` PostgreSQL pool | `httpx` async connection pool |

> **Important fairness note:** Niu is the only gateway in this benchmark executing synchronous, ACID-compliant pre-dispatch admission (`operations` and `attempts` rows) plus durable post-dispatch completion settlement on every single request. Even with full database durability enabled, Niu outperforms stateless LiteLLM Proxy by **10.7x** and cached New API by **3.7x**.

---

## 3. Complete benchmark results

### 3.1 Non-streaming `/v1/chat/completions` (`0ms` mock upstream)

Each test ran with `--warmup 32` followed by `500` requests (`c = 1, 4`) or `2,000` requests (`c = 16, 64`) against `POST /v1/chat/completions` (`model: "gpt-4o"`, 40-token completion payload).

#### Direct `mock-upstream` baseline (no gateway)

| Concurrency | Throughput (RPS) | Mean (ms) | p50 (ms) | p95 (ms) | p99 (ms) | Error Rate |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `c = 1` | 744.6 | 1.33 | 1.33 | 1.44 | 1.55 | 0.0% |
| `c = 4` | 2,777.2 | 1.43 | 1.43 | 1.71 | 2.18 | 0.0% |
| `c = 16` | 11,237.4 | 1.42 | 1.44 | 1.57 | 1.66 | 0.0% |
| `c = 64` | 36,649.3 | 1.73 | 1.83 | 2.38 | 3.02 | 0.0% |

#### Gateway throughput & latency comparison (`/v1/chat/completions`)

| Concurrency | Gateway | Throughput (RPS) | Mean (ms) | p50 (ms) | p95 (ms) | p99 (ms) | Errors |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **`c = 1`** | **Niu (`v0.2.4`)** | **233.6** | **4.27** | **4.00** | **5.88** | **9.36** | **0** |
| `c = 1` | New API (`45fbb14`) | 187.9 | 5.31 | 4.36 | 9.11 | 13.43 | 0 |
| `c = 1` | LiteLLM Proxy (`v1.104.0`) | 136.5 | 7.31 | 6.41 | 12.17 | 15.20 | 0 |
| **`c = 4`** | **Niu (`v0.2.4`)** | **300.5** | **13.28** | **13.15** | **17.21** | **19.51** | **0** |
| `c = 4` | New API (`45fbb14`) | 352.0 | 11.30 | 9.42 | 17.11 | 57.27 | 0 |
| `c = 4` | LiteLLM Proxy (`v1.104.0`) | 296.9 | 13.42 | 13.22 | 16.64 | 18.28 | 0 |
| **`c = 16`** | **Niu (`v0.2.4`)** | **1,040.0** | **15.32** | **15.07** | **19.31** | **22.26** | **0** |
| `c = 16` | New API (`45fbb14`, peak / sustained) | 612.4 / 278.7 | 57.23 | 46.87 | 70.92 | 408.08 | 0 |
| `c = 16` | LiteLLM Proxy (`v1.104.0`) | 328.0 | 48.62 | 45.07 | 57.23 | 163.16 | 0 |
| **`c = 64`** | **Niu (`v0.2.4`)** | **3,238.7** | **19.50** | **18.94** | **26.11** | **31.54** | **0** |
| `c = 64` | New API (`45fbb14`, peak / sustained) | 865.6 / 148.9 | 73.93 | 71.15 | 111.82 | 135.73 | 0 |
| `c = 64` | LiteLLM Proxy (`v1.104.0`) | 302.2 | 209.62 | 193.26 | 318.24 | 338.74 | 0 |

### 3.2 Native Anthropic `/v1/messages` (`0ms` mock upstream)

Coding agents such as Claude Code communicate natively over Anthropic's `POST /v1/messages` endpoint. We benchmarked `1,000` requests at `c = 16` and `c = 64` using an Anthropic `claude-sonnet-4-20250514` request payload:

| Concurrency | Gateway | Throughput (RPS) | Mean (ms) | p50 (ms) | p95 (ms) | p99 (ms) | Errors |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **`c = 16`** | **Niu (`v0.2.4`)** | **911.2** | **17.46** | **16.60** | **23.38** | **26.31** | **0** |
| `c = 16` | LiteLLM Proxy (`v1.104.0`) | 237.5 | 66.96 | 63.76 | 77.67 | 175.96 | 0 |
| `c = 16` | New API (`45fbb14`) | 164.5 | 96.97 | 74.57 | 228.57 | 473.92 | 0 |
| **`c = 64`** | **Niu (`v0.2.4`)** | **2,518.8** | **25.15** | **21.10** | **52.97** | **60.61** | **0** |
| `c = 64` | LiteLLM Proxy (`v1.104.0`) | 232.2 | 272.18 | 260.97 | 380.42 | 397.88 | 0 |
| `c = 64` | New API (`45fbb14`) | 136.2 | 468.26 | 346.36 | 1,291.77 | 1,475.53 | 0 |

### 3.3 SSE streaming throughput, chunk preservation & ITL (`c = 1` and `c = 16`)

Each streaming request consumed a 40-token SSE stream (`43` total `data:` events including role delta, finish reason, usage chunk, and `[DONE]`). We measured completed streams per second, delivered tokens per second, chunk preservation (whether the gateway coalesces or drops SSE frames), Time-To-First-Token (`TTFT`), and Inter-Token Latency (`ITL`):

| Concurrency | Gateway | Streams/sec | Tokens/sec | Chunks/Stream | Stream p50 (ms) | Stream p95 (ms) | TTFT p50 (ms) | ITL p50 (ms) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| — | Direct `mock-upstream` (`c=1`) | 780.2 | 31,208 | 43.0 | 1.24 | 1.56 | 1.02 | 0.005 |
| **`c = 1`** | **Niu (`v0.2.4`)** | **138.6** | **5,544** | **43.0** | **6.82** | **9.48** | **6.40** | **0.008** |
| `c = 1` | New API (`45fbb14`) | 138.3 | 5,532 | 42.0 | 6.53 | 12.16 | 4.86 | 0.036 |
| `c = 1` | LiteLLM Proxy (`v1.104.0`) | 60.4 | 2,416 | 43.0 | 16.05 | 19.65 | 7.98 | 0.194 |
| — | Direct `mock-upstream` (`c=16`) | 4,033.3 | 161,332 | 43.0 | 3.74 | 4.91 | 2.13 | 0.038 |
| **`c = 16`** | **Niu (`v0.2.4`)** | **235.9** | **9,436** | **43.0** | **62.17** | **88.24** | **5.96** | **1.339** |
| `c = 16` | New API (`45fbb14`) | 100.9 | 4,036 | 42.0 | 150.33 | 228.59 | 8.21 | 3.553 |
| `c = 16` | LiteLLM Proxy (`v1.104.0`) | 83.0 | 3,320 | 43.0 | 192.65 | 207.26 | 7.64 | 4.618 |

Key observations:
- **Zero chunk loss**: Niu preserves all `43.0` SSE events per stream while forwarding `9,436 tokens/sec` at `c = 16`.
- **Sub-10 microsecond single-stream ITL**: At `c = 1`, Niu adds just `0.003 ms` (`3 µs`) to median inter-token latency (`0.008 ms` vs `0.005 ms` direct baseline), whereas LiteLLM Proxy adds `0.189 ms` (`194 µs` per token) due to per-chunk Python object instantiation and JSON re-serialization.
- **2.84x higher concurrent streaming capacity**: At `c = 16`, Niu sustains **235.9 streams/sec** (`ITL p50 = 1.34 ms`), outperforming New API (`100.9 streams/sec`, `ITL p50 = 3.55 ms`) by **2.34x** and LiteLLM Proxy (`83.0 streams/sec`, `ITL p50 = 4.62 ms`) by **2.84x**.

### 3.4 Multi-turn coding agent workload (`claude_code` and `codex`)

Inspired by `ai-gateway-bench`'s realistic agent harness (`bench_agent.py`), we simulated **8 and 16 concurrent coding agents** each executing a **30-turn iterative coding session** (`240` and `480` sequential-per-agent SSE streams with growing context windows from ~1.5 KB on turn 1 to ~25 KB on turn 30):
- **`claude_code` profile**: Native Anthropic `POST /v1/messages` SSE streaming (`claude-sonnet-4-20250514`).
- **`codex` profile**: OpenAI `POST /v1/chat/completions` SSE streaming (`gpt-4o`).

| Concurrent Agents | Profile | Gateway | Total Wall Time (ms) | Session p50 (ms) | Turn p50 (ms) | Turn p95 (ms) | Turn p99 (ms) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **8 Sessions (240 turns)** | `claude_code` | **Niu (`v0.2.4`)** | **1,781.6** | **1,754.8** | **54.14** | **71.84** | **147.19** |
| 8 Sessions (240 turns) | `claude_code` | LiteLLM Proxy (`v1.104.0`) | 2,005.3 | 1,984.3 | 62.17 | 90.01 | 145.17 |
| 8 Sessions (240 turns) | `claude_code` | New API (`45fbb14`) | 2,953.3 | 2,877.3 | 82.13 | 207.00 | 312.18 |
| **8 Sessions (240 turns)** | `codex` | **Niu (`v0.2.4`)** | **1,687.6** | **1,677.6** | **55.71** | **60.17** | **63.44** |
| 8 Sessions (240 turns) | `codex` | LiteLLM Proxy (`v1.104.0`) | 3,057.5 | 3,054.9 | 93.26 | 122.41 | 293.45 |
| 8 Sessions (240 turns) | `codex` | New API (`45fbb14`) | 3,126.2 | 3,051.6 | 83.10 | 250.54 | 324.78 |
| **16 Sessions (480 turns)** | `claude_code` | **Niu (`v0.2.4`)** | **1,746.0** | **1,693.4** | **55.02** | **68.09** | **82.73** |
| 16 Sessions (480 turns) | `claude_code` | LiteLLM Proxy (`v1.104.0`) | 3,353.3 | 3,318.5 | 103.01 | 141.10 | 245.68 |
| 16 Sessions (480 turns) | `claude_code` | New API (`45fbb14`) | 4,864.9 | 4,654.4 | 141.96 | 258.93 | 421.51 |
| **16 Sessions (480 turns)** | `codex` | **Niu (`v0.2.4`)** | **1,686.6** | **1,651.7** | **54.05** | **66.91** | **72.50** |
| 16 Sessions (480 turns) | `codex` | New API (`45fbb14`) | 4,891.9 | 4,752.8 | 132.79 | 469.25 | 510.17 |
| 16 Sessions (480 turns) | `codex` | LiteLLM Proxy (`v1.104.0`) | 5,803.9 | 5,795.7 | 180.75 | 314.31 | 328.23 |

Notice that when scaling from 8 to 16 concurrent coding agents (doubling total turns from 240 to 480), **Niu's session completion time remains flat at ~1.69–1.75 seconds** (`turn p50` stays at `54–55 ms`), whereas LiteLLM Proxy's session latency nearly doubles (`3.06s -> 5.80s` on `codex`) and New API's climbs to `4.89s`.

### 3.5 Memory footprint & cloud infrastructure cost efficiency

Following `ai-gateway-bench/cost_analysis.py`, we combined measured peak throughput (`c = 64`) and resident set size (`RSS`) with standard AWS `c7g.large` (`2 vCPU, 4 GB RAM`, `$0.0725/hr` on-demand, `60%` target CPU utilization factor) to quantify infrastructure cost per 1M proxied requests:

| Gateway | Idle RSS (MB) | Peak RSS under `c=64` (MB) | Sustained `c=64` RPS | Effective RPS @ 60% Util | RPS per $/hr | Proxy Compute Cost per 1M Requests |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Niu (`v0.2.4`, Rust)** | **18.16 MB** | **26.4 MB** | **3,238.7** | **1,943.2** | **71,599** | **$0.014** |
| New API (`45fbb14`, Go) | 37.42 MB | 98.5 MB | 865.6 (peak) | 519.4 | 19,136 | $0.052 |
| LiteLLM Proxy (`v1.104.0`, Python) | 158.00 MB | 194.6 MB | 302.2 | 181.3 | 6,681 | $0.150 |

---

## 4. Architectural interpretation: why Niu is faster

### 4.1 Niu (`3,238.7 RPS`, `31.54 ms` p99, `26.4 MB` peak RSS)

Niu's gateway data plane (`crates/gateway`) is engineered around three principles that balance financial safety with high concurrency:

1. **Zero-GC Rust / Tokio Async Data Plane**:
   Request parsing, header extraction, route pool candidate selection, and SSE chunk framing run on Tokio's work-stealing multi-threaded scheduler without garbage-collection pauses or interpreter locks. Memory footprint stays below `27 MB` even under 64 concurrent workers.
2. **In-Memory Authentication & Route Snapshot Cache**:
   Workspace API key verification (`SHA-256` digest verification + active key/company/workspace grant check) and static/dynamic model route resolution are served from lock-free in-memory caches with bounded TTLs (`5s`), avoiding redundant database round-trips on the hot admission path.
3. **Single-Roundtrip Pre-Dispatch Admission & Micro-Batched Completion Settlement**:
   - **Pre-dispatch**: Before an upstream request is sent, Niu records the `operations` and `attempts` rows in a single batched SQL CTE (`record_operation_and_attempt`).
   - **Post-dispatch**: When responses complete, Niu's `CompletionBatcher` coalesces up to `64` concurrent request completions (within a `2 ms` window) into a single `UNNEST(...)` batch transaction that updates `attempts`, `operations`, `requests`, and `usage_events` in one database round-trip (`complete_unpriced_attempt_batch`).
   - **PostgreSQL Generic Plan Stability**: Setting `plan_cache_mode = 'force_generic_plan'` on pooled connections and ensuring selective primary-key lookup (`attempts_pkey`) prevents PostgreSQL from falling into stale custom plans on transient `may_have_executed` partial indexes when `UNNEST` batch sizes vary dynamically between `1` and `64`.

### 4.2 New API (`865.6 RPS` peak / `148.9–352.0 RPS` sustained, `98.5 MB` peak RSS)

New API benefits from Go's compiled HTTP server (`net/http` + Gin) and in-memory token caching (`MEMORY_CACHE_ENABLED=true`), allowing it to reach `352.0 RPS` at `c = 4` and a fresh-start burst of `865.6 RPS` at `c = 64`. However, three architectural factors limit its sustained high-concurrency throughput and tail latency:

1. **Unbatched Per-Request SQL Queries on the Hot Path**:
   Even with `MEMORY_CACHE_ENABLED=true`, `BATCH_UPDATE_ENABLED=true`, and `SelfUseModeEnabled=true`, New API executes multiple synchronous GORM queries per request (querying `users` quota/group status, `tokens`, `user_subscriptions`, and inserting into `logs`) using `PreferSimpleProtocol: true`.
2. **Default 60-Second SQL Connection Lifetime Churn**:
   New API sets `sqlDB.SetConnMaxLifetime(60 * time.Second)` by default. Under sustained `c = 64` load across multi-minute test suites, PostgreSQL connections are continuously closed and re-established every 60 seconds, causing `p99` latency spikes (`135.7 ms` fresh -> `408–2,226 ms` during connection turnover).
3. **Synchronous Structured Logging Overhead**:
   Even in `GIN_MODE=release`, New API formats and writes ~1.5 KB of `[INFO]` and `[GIN]` request trace lines per completion, creating I/O and allocation pressure at high RPS.

### 4.3 LiteLLM Proxy (`302.2–328.0 RPS`, `338.74 ms` p99, `194.6 MB` peak RSS)

LiteLLM Proxy was benchmarked in its lightest possible configuration (`master_key` in memory, zero database connections, `disable_spend_logs: true`, `LITELLM_LOG=ERROR`). Despite having zero database work:

1. **Single-Process Python Event Loop & GIL Bottleneck**:
   A single Uvicorn worker running on CPython + `uvloop` saturates one CPU core at **~300–328 RPS**. Scaling beyond `c = 4` (`296.9 RPS`) to `c = 16` (`328.0 RPS`) and `c = 64` (`302.2 RPS`) yields zero additional throughput while queueing latency grows linearly (`p50` climbs from `13.22 ms` at `c = 4` to `45.07 ms` at `c = 16` and `193.26 ms` at `c = 64`).
2. **Pydantic Model Validation & Translation Overhead**:
   LiteLLM normalizes every request and response through internal Python dictionaries and Pydantic schemas (`ModelResponse`, `Choices`, `Usage`), adding ~6 ms of pure CPU time per non-streaming request and ~194 µs per streamed SSE chunk.
3. **High Base Memory Footprint**:
   Importing LiteLLM's provider SDKs, tokenizers, and FastAPI dependencies consumes `158–195 MB` of RSS per worker process—**6x to 7x more memory than Niu**.

---

## 5. Reproducing the benchmark

You can reproduce these measurements locally on any macOS or Linux host with Rust, Go, Python 3.12+, and PostgreSQL 17:

1. **Start `mock-upstream`** from [`BerriAI/ai-gateway-bench`](https://github.com/BerriAI/ai-gateway-bench):
   ```sh
   MOCK_HOST=127.0.0.1 MOCK_PORT=9000 MOCK_TTFT_MS=0 MOCK_ITL_MS=0 MOCK_OUTPUT_TOKENS=40 \
     cargo run --release --bin mock-upstream
   ```
2. **Start Niu Gateway (`v0.2.4`)**:
   ```sh
   cargo build --release -p niu-gateway
   NIU_BIND=127.0.0.1:8101 \
   NIU_DATABASE_URL="postgres://postgres@127.0.0.1:5432/niu_bench" \
   NIU_DB_MAX_CONNECTIONS=96 \
   NIU_CONFIG_FILE=./niu-bench.toml \
   RUST_LOG=warn \
     ./target/release/niu-gateway
   ```
3. **Run closed-loop load probe across `c = 1, 4, 16, 64`**:
   ```sh
   for c in 1 4 16 64; do
     ./target/release/load-probe \
       --url http://127.0.0.1:8101/v1/chat/completions \
       --concurrency "$c" \
       --requests 2000 \
       --warmup 32 \
       --api-key "<workspace-api-key>" \
       --out "niu-c${c}.json"
   done
   ```
