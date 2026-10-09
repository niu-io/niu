# Packaged JavaScript inference client — 2026-10-03

**Passed scope:** the development `@niu-io/sdk` 0.1.0 tarball against the running Niu API and its saved OpenRouter demo configuration, using `google/gemini-2.5-flash`. This is partial F03/F04/F05/F10 evidence, not release or commercial qualification.

- Built and packed the SDK, extracted it outside the source tree, and imported its packaged exports without source dependencies. Tarball SHA-256: `be35589a93ad7d27e49c894b6027c69e9103402098e0851433edcb9f24df05b2`.
- A temporary workspace key discovered the enabled model and completed one nonstreaming text call and one SSE text stream with a finish reason and terminal usage. Both requests used a 64-token output bound and payload opt-out.
- SDK token counts matched the persisted customer ledger. Each request had one attempt and a charge calculated from its pinned customer tariff with upward integer rounding. Both had complete timing records. Scoped content reads returned null with `Cache-Control: no-store`; metadata remained available.
- Revoking the temporary key caused packaged SDK discovery to fail with HTTP 401. Temporary keys were revoked after checks; saved Supplier credentials and demo keys were preserved.
- The exact packed `examples/verify-inference.mjs` independently completed its two live calls. Both persisted complete timing and customer charges without request payloads. Its sanitized result is in [the measured record](sdk-inference-client-verification.json).
- All 61 SDK tests passed. The example's fixture tests cover unavailable-model preflight, unauthorized discovery without retries, truncated streams and unknown usage. Public-boundary and whitespace checks passed.

Reproduce with the build/pack commands and client-setup instructions in the [SDK README](../../sdks/javascript/README.md). The example makes real inference calls; use a supported configured model and a scoped workspace key.

**Still open:** the 20–30-model protocol matrix, live tools/structured output/Responses/Embeddings, streaming cancellation and settlement, process restart for this exact client journey, a packaged gateway installation, and Supplier commercial qualification. The live endpoint used the development server; this check does not qualify the single-image distribution. Client elapsed times from the separate import check are single observations, not performance percentiles or TTFT.
