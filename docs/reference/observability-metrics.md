# Observability metrics and request correlation

Niu exposes a JSON scrape endpoint for installation administrators. It is not a
Prometheus or OTLP exporter, and the gateway does not aggregate counters across
instances.

## Scrape contract

`GET /admin/v1/metrics` requires installation administrator read permission.
The response is a JSON object:

- `instance_id` — `NIU_INSTANCE_ID` when configured, otherwise a process-random
  UUID. Scrape each instance separately and use this field as the series label.
- `started_at_ms` — process start time in Unix milliseconds. A changed value
  identifies a restart.
- `requests_total`, `requests_failed` — process-local request counters.
- `prompt_tokens`, `completion_tokens`, `usage` — process-local token and usage
  counters.

Counters reset when the process restarts. Retention, cross-instance aggregation,
alerting and long-term storage belong to the external metrics system. Do not
treat one instance's counters as installation-wide totals.

## Request correlation

The gateway accepts a single `X-Request-Id` header of at most 128 ASCII letters,
digits, `-`, `_`, `.` or `:`; otherwise it generates a UUID at the edge. The
resolved ID is:

- echoed on the response, including error responses;
- recorded on the `http_request` tracing span as `request_id`;
- included in the access log emitted for each response.

Logs record the request path but never the query string, because OAuth callbacks
and other URLs can contain authorization codes.
