# Provider timeout configuration acceptance

The typed deployment settings described in [Provider transport diagnostics](provider-transport-diagnostics.md) have actual current-input configuration, startup and read-only catalog acceptance below. This does not qualify generation, media transport budgets, DNS timing, an overall network SLA or every persisted failure-report projection.

## Pinned execution and configuration

The retained Gateway binary is committed revision `a25b0d41f10aef285c90172821d084818a2f86a2`; its SHA is independently checked. The stopped source PostgreSQL copy has maximum applied migration 286 and the final copy has maximum 287, independently read from `_sqlx_migrations` with successful migration flags. Original runtime, database, encryption identity and credentials remain unchanged.

An unchanged saved personal OpenRouter credential is used for read-only upstream `/models` requests through Niu's actual catalog and connection-check handlers. Both omitted settings and explicit settings use `request_timeout_seconds = 60`. The explicit settings are `provider_connect_timeout_seconds = 10` and `provider_dns_timeout_seconds = 5`. The live process's actual `NIU_CONFIG_FILE` environment value is checked against the intended TOML path, and the corresponding file digest and parsed values are retained with the process identity. The catalog/check caller has its existing five-second HTTP budget, so the actual configured component limits clamp to five seconds each; omitted defaults give three seconds each. No timing observation is used to infer those values.

| Actual path | Result |
| --- | --- |
| Omitted component settings | Catalog HTTP 200 and connection result `connected`, upstream HTTP 200. |
| Explicit connect 10 / DNS 5 | Catalog HTTP 200 and connection result `connected`, upstream HTTP 200. |
| Catalog comparison | Both return the same 458 model identities, including `openai/gpt-4.1-mini`. |
| Exact saved versioned mapping | The saved mapping is `openai/gpt-4.1-mini-2025-04-14`; both connection diagnostics accurately report `not_listed` because that exact identifier is absent from the current catalog. This is not used to infer generation availability. |
| Invalid startup values | Native startup rejects connection budget `0` and `3601`, and independently DNS budget `0` and `3601`, with the documented bounded-value configuration error. |
| One-second request budget | Native Gateway reaches readiness with omitted three-second component defaults, and separately with explicit connect 10 / DNS 5. These validate startup compatibility with component clamping; no inference request is made under this budget. |

Six genuine upstream model-list GETs occur in total, with zero generation requests. Two of the six were made under default settings because a private verifier's resumed configuration path was wrong; their original responses remain separately retained and do not count as explicit-setting proof. The verifier corrected the actual process environment, checked the file path/digest/parsed values and obtained explicit authorization for two additional read-only GETs. No hidden retry or extra generation substitutes for the missing evidence.

## Address boundaries

Actual configuration API requests targeting literal `10.0.0.1` and reserved fake-IP address `198.18.0.1` return HTTP 400, `Invalid vendor endpoint, model alias or capabilities`. Rejection occurs at configuration validation before credential storage or HTTP dispatch. Native final storage contains neither rejected endpoint. The probes use deliberately invalid credentials and have no mock server or listening Provider endpoint.

The existing explicit loopback exception is retained: a separate literal `127.0.0.1` probe returns `endpoint_unavailable`, not `private_endpoint_blocked`. Its response is kept independently and is not represented as a pre-egress private-address rejection. Neither literal negative verifies a hostname that actually resolves to a private address; current DNS-resolution rejection remains a separate mechanism rather than a fabricated observation in this run.

## Independent final checks

A separate verifier reopens source and final stopped PostgreSQL copies. Every pre-existing row in the thirteen exercised configuration, identity and scope tables remains present with identical values: administrator operators/sessions, API keys, branding configuration/events, payment configuration/events, organizations, workspaces, personal ownership, Supplier ownership, vendors and model mappings. The copied loopback probe is a separately classified new configuration, without changing an existing row. All seven complete financial-table fingerprints remain unchanged.

Saved raw responses match their recorded SHA-256 values. The catalogs, exact-model diagnostic states, configuration-stage negative responses, native startup logs, intended TOML digests and migration state agree. All verification processes are stopped. Catalog reachability does not establish inference compatibility, commercial Supplier qualification or payment activation; this evidence closes only the stated configuration/read-only paths and preserves those distinctions.
