# Personal video discovery acceptance

An actual read-only API run verified discovery of a personal, owner-funded Ark video route whose output estimator and price are unknown. This is capability discovery, not a price estimate, commercial qualification or billing acceptance.

The retained Gateway and executed SDK shared commit `c2c7942b281fd1ba19eeefc5aa3d56b7961cc8ed`. The Gateway binary SHA-256 was `b345ced82e23b4e6e22d5a66bd8ad754dfe80a12c632fe5ec46e1e22f1b12aa9`, and the database schema was 291. The run copied a stopped database containing the [actual FastRouter task and finite model configuration](fastrouter-documented-video-acceptance.md). Original data and configuration were preserved.

| Actual check | Result |
| --- | --- |
| `GET /v1/video/models` with authorized owner-workspace key | Existing personal route appears with mode `owner_funded` and `output: null` |
| Executed SDK `video.models.list()` | Same model list as the HTTP response; one GET |
| Configured controls | Exact match to native schema: duration 5, resolution `1080p`, ratio `16:9`, seed 42, watermark false |
| Key granting another actually available model | Target video model excluded |
| Key in an existing foreign organization, granting all models in its scope | Personal target route excluded |
| Gateway restart | Owner-workspace listing byte-identical |

The finite schema's controls were retained without inventing a pixel mapping, estimator, price or output quantity. An absent output definition serializes as JSON null. Discovery does not weaken dispatch permissions, qualified-channel checks, explicit customer Guardrails, balance checks or pricing requirements.

An independent verifier reopened the stopped source and final copied database. It compared actual API and SDK artifacts with native model capabilities and confirmed all original attempts, failures, financial records, Supplier and model configuration, personal ownership, task records, query evidence, result references, transport timings and captured payloads remained unchanged. All temporary keys, including those from interrupted probe setup, were revoked. Saved Provider credentials were absent from discovery artifacts. Copied processes were stopped.

There were zero upstream generations, task queries or result downloads in this discovery run. The implementation permits unknown output only for personal owner-funded Ark routes; customer-priced routes and OpenRouter retain their existing output requirements. Those retained rejection branches were source-reviewed. No genuinely commercially eligible customer route without output was available for an independent positive-path comparison, so that combination is unverified rather than fabricated.
