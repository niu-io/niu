# Quota observation API

Authorized collectors can submit metadata to `POST /admin/v1/organizations/{organization}/projects/{project}/accounts/{account}/quota` using the installation administrator bearer token. Inference client keys cannot submit observations. Register the account first through the account API. There is no automatic provider polling in this endpoint.

Example request body (timestamps are illustrative historical evidence):

```json
{
  "window_key": "monthly",
  "unit": "tokens",
  "remaining": "150000",
  "maximum": "200000",
  "observed_at_ms": 1700000000000,
  "valid_until_ms": 1700000300000,
  "resets_at_ms": 1702592000000,
  "source": "authorized-provider-collector"
}
```

Quantities are nonnegative signed-64-bit decimal strings or null for unknown. Supported units are `tokens`, `requests` and `millionths_of_window`. The last unit requires a maximum of `"1000000"`; it is capacity fraction evidence, not a token conversion. Remaining cannot exceed maximum. Observation timestamps cannot be in the future; validity and reset timestamps must follow the observation. Unknown body fields are rejected. Do not include credentials or raw provider responses in labels.

Success returns HTTP 200 and `{"id":"<UUID>"}`. Repeating identical evidence for the same account, window and observation timestamp returns the original ID. Different evidence at that identity returns 409. Unavailable or out-of-scope accounts also return 409 without revealing ownership. Invalid values return 400 (malformed JSON shapes may return 422).

GET on the same path returns the latest observation per window, including source and freshness. Historical submissions remain immutable and do not replace later observations. A source label is supplied by the caller and is not independently verified provenance. Reports must preserve unknown and stale evidence and distinguish capacity from monetary costs. Submission does not activate an account, refresh credentials, reset provider capacity or make inference calls. Dedicated collector roles, native provider collectors and retention controls remain future work.
