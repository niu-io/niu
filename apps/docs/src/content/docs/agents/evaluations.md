---
title: "Task Evaluations"
---


Use Niu's evaluation workflow to bind inference attempts cryptographically to immutable prompt/rubric samples, record attributed evaluator judgments (`agent` or `check`), and compare verified runs on matched samples and complete customer-charge coverage.

Evaluations record task evidence and customer charges; they never promise optimal value or certify model quality across unseen tasks.

---

## Operations & Interface Parity

`evaluations:read` permits listing, reading definitions/runs, fingerprinting request bodies, listing admitted attempts, and comparing runs. `evaluations:write` permits creating/updating evaluation definitions and recording immutable run receipts. Neither scope authorizes model invocation (`invocation_allowed`) or creates a separate trial spending budget; only server-enforced key spending limits returned by `GET /v1/key` act as hard caps.

| Capability | HTTP Endpoint (`{ORIGIN}/v1/...`) | MCP Tool (`@niu-io/mcp`) | JS SDK (`NiuClient`) | Required Scope |
| --- | --- | --- | --- | --- |
| Compute v1 input fingerprint | `POST /v1/evaluations/fingerprint` | `fingerprint_evaluation_request` | `fingerprintEvaluationRequest(protocol, req)` | `evaluations:read` |
| List evaluation definitions | `GET /v1/evaluations` (`?after=<slug>`) | `list_evaluations` | `listEvaluations(after?)` | `evaluations:read` |
| Read current or pinned definition | `GET /v1/evaluations/{slug}` (`?revision=<int>`) | `get_evaluation` | `getEvaluation(slug, revision?)` | `evaluations:read` |
| Save definition & sample hashes | `PUT /v1/evaluations/{slug}` (top-level definition) | `set_evaluation` (`{ configuration }`) | `setEvaluation(configuration)` | `evaluations:write` |
| Discover admitted attempts | `GET /v1/evaluations/{slug}/attempts?revision=<int>&sample=<ref>` | `list_evaluation_attempts` | `listEvaluationAttempts(slug, rev, sample, after?)` | `evaluations:read` |
| List recorded runs | `GET /v1/evaluations/{slug}/runs` (`?after=<slug>`) | `list_evaluation_runs` | `listEvaluationRuns(slug, after?)` | `evaluations:read` |
| Record attributed run receipt | `POST /v1/evaluations/{slug}/runs` (top-level submission) | `record_evaluation_run` (`{ slug, submission }`) | `recordEvaluationRun(slug, submission)` | `evaluations:write` |
| Read immutable run receipt | `GET /v1/evaluations/{slug}/runs/{run}` | `get_evaluation_run` | `getEvaluationRun(slug, run)` | `evaluations:read` |
| Compare two runs | `GET /v1/evaluations/{slug}/compare?left=<a>&right=<b>` | `compare_evaluation_runs` | `compareEvaluationRuns(slug, left, right)` | `evaluations:read` |

Inspect schemas in `/docs/openapi/public.json` or `/docs/api/rest/`.

---

## 5-Step Verification Workflow

### 1. Fingerprint each effective protocol request (`evaluations:read`)

Call `POST /v1/evaluations/fingerprint` (`fingerprint_evaluation_request`) with `{ "protocol": "...", "request": { ... } }` where `protocol` is one of `"chat" | "responses" | "messages" | "embeddings" | "generate_content"`.

- Fingerprinting computes version-1 canonical JSON SHA-256 (`request_sha256`, 64 lowercase hex chars) without invoking any model or storing raw prompts on Niu.
- Fingerprint v1 excludes **only** top-level `model`, `stream`, `stream_options`, `metadata`, and `user`. System prompts, messages, tools, temperature, `max_tokens`, and structured schemas all remain part of the hash.
- Different protocols yield separate fingerprints.

### 2. Save the task definition (`evaluations:write`)

Call `PUT /v1/evaluations/{slug}` (`set_evaluation`) with:

```json
{
  "slug": "json-extraction-v1",
  "name": "Invoice JSON Extraction Benchmark",
  "task": "Extract invoice vendor, date, currency, and line items as valid JSON matching the schema.",
  "rubric": "accepted only if JSON parses cleanly, all required keys match ground truth, and no hallucinated line items exist.",
  "protocol": "chat",
  "revision": 0,
  "samples": [
    {
      "reference": "invoice-001",
      "request_sha256": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
    }
  ]
}
```

- `slug`: `^[a-z0-9]+(-[a-z0-9]+)*$`, max 80 chars.
- `name`: `1..200` chars; `task`: `1..4000` chars; `rubric`: `1..8000` chars.
- `revision`: `0` creates; updates supply the current integer revision (optimistic lock).
- `samples`: `1..64` items, each `{ "reference": "^[A-Za-z0-9_.-]+$" (1..100), "request_sha256": "^[0-9a-f]{64}$" }`.
- Read back via `get_evaluation` after saving to confirm the persisted revision.

### 3. Bind authorized inference attempts (`invocation_allowed: true` + `evaluations:read`)

When authorized to call models (see `/docs/inference.md`), pass:
- **HTTP header**: `x-niu-evaluation: <slug>@<revision>/<sample_reference>`
- **MCP / JS SDK option**: `evaluation: "<slug>@<revision>/<sample_reference>"`

The gateway verifies the canonical v1 request fingerprint against the pinned sample revision before dispatch and strips `x-niu-evaluation` before forwarding upstream. A mismatched request is rejected pre-dispatch without incurring model charges. Untagged inference remains permitted for normal work, but cannot satisfy verified matched-sample comparisons.

### 4. Recover uncertain attempts without blind replay (`evaluations:read`)

Never blindly retry a timed-out or interrupted paid request. Preserve any returned `attempt_id` / `operation_id`, or query `GET /v1/evaluations/{slug}/attempts?revision=<rev>&sample=<ref>` (`list_evaluation_attempts`) with optional UUID cursor `after`.

- Attempts paginate in lexical UUID snapshot order; restart pagination from the first page (`after` omitted) to discover newly admitted attempts.
- Absence from an early snapshot never proves no execution occurred upstream.

### 5. Record attributed run receipts & compare (`evaluations:write` / `evaluations:read`)

Submit evaluator judgments via `POST /v1/evaluations/{slug}/runs` (`record_evaluation_run`):

```json
{
  "slug": "sonnet-4-6-baseline",
  "name": "Claude Sonnet 4.6 Baseline",
  "evaluation_revision": 1,
  "evaluator": {
    "kind": "agent",
    "name": "claude-code",
    "version": "v1-rubric-check"
  },
  "results": [
    {
      "sample": "invoice-001",
      "attempt_id": "550e8400-e29b-41d4-a716-446655440000",
      "verdict": "accepted",
      "reason": "Parsed schema cleanly with exact line-item totals."
    }
  ]
}
```

- `results`: `1..64` unique samples (`sample`, `attempt_id` UUID, `verdict`: `"accepted" | "rejected" | "unknown"`, optional `reason?: string | null` max 2000 chars); each submitted operation is capped at `32` attempts (missing attempt coverage fails capture rather than silently dropping retry costs).
- Include rejected and unknown outcomes alongside accepted ones; do not cherry-pick.
- **Idempotency**: re-submitting the identical `slug` + identical body returns the existing immutable receipt; differing payloads with the same `slug` fail with conflict. Re-running later requires a new run `slug`.

---

## Receipt & Comparison Semantics

- Run receipts (`get_evaluation_run`) lock the original definition revision, attempt durations (selected-attempt duration, not full retry wall clock), every retry attempt inside each submitted operation, routing policy selections, and customer-charge coverage. Snapshots are immutable.
- **Charge honesty**: total run cost includes failed/retry attempts in each submitted operation. Pending, owner-funded, or missing customer charges stay explicitly `unknown` — never coerced to `0` and never substituted with confidential Provider procurement costs. Workspace units and money currencies are separate dimensions.
- **`compare_evaluation_runs`**: intersects verified sample references having matching `request_sha256` **only** when `task`, `protocol`, and `rubric` agree. Reports evaluator changes (`kind`/`name`/`version`) and shared underlying `operation_id` values (re-judging the same operation is not an independent model run).
- `cost_per_accepted_sample` is computed only when customer charge coverage is complete across matched samples, at least one sample is accepted, and all matched charges share a single compatible dimension; otherwise it remains unavailable rather than emitting misleading numbers or declaring a universal winner.

Related contracts: [Install](/docs/install.md) · [Capabilities](/docs/agents.md) · [Model inference](/docs/inference.md) · [Workspace routing](/docs/pools.md) · [Events](/docs/events.md) · [OpenAPI](/docs/openapi/public.json)
