# Provider price-source fixtures

Read-only public source evidence captured on **2026-11-06** (Asia/Shanghai) for
`niu-9ju.2`. No Provider credential, inference request or paid call was used.
The live documents were fetched once to establish the observed schema; the
checked-in fixtures are representative excerpts so parser tests stay small and
reviewable. All monetary and ratio values inside the excerpts are copied
verbatim from the observed public documents. No price was synthesized.

| Provider | Public source | HTTP | Full body | Full SHA-256 | Fixture |
| --- | --- | --- | --- | --- | --- |
| OpenRouter | `https://openrouter.ai/api/v1/models` | 200 `application/json` | 814090 B | `7be230a1b5a902ae45a0552bba72351155926243749ae0a3be8209dad0c35bce` | `openrouter.models.json` |
| FastRouter | `https://fastrouter.wecitytech.com/api/pricing` | 200 `application/json` | 669 B | `451e692f031483315ddbc836381112625be4cc03e5054f4f48baaa76c3b1b38a` | `fastrouter.pricing.json` |
| BabelArk | `https://api.babelark.ai/api/pricing` | 200 `application/json` | 119898 B | `65e21eb6291ee84520f6a43d6225d611ef9ef37974201777b928672b2457d887` | `babelark.pricing.json` |
| Qiniu | `https://www.qiniu.com/ai/models` | 200 `text/html` | 517328 B | `44da8a52049de5e253b331e470e5ce672f1309de166255e147348a0f819ce688` | `qiniu.models.html` |
| DeepSeek | `https://api-docs.deepseek.com/quick_start/pricing.md` | 200 `text/markdown` | 13663 B | `07e68850f45ff5afc35a10f03831673beb5667d9c31d2b386ddf6c465b9e7eaf` | `deepseek.pricing.md` |

`deepseek.pricing.md` and `fastrouter.pricing.json` are byte-identical to the
captured public source. The JSON/SSR excerpts retain the fields consumed by the
normalizers. The full-document digests above identify the source snapshot; they
are not digests of the trimmed excerpt files.

## Negative fixtures

| File | Purpose |
| --- | --- |
| `openrouter.empty.json` | Empty catalog envelope. |
| `openrouter.malformed.json` | Catalog envelope changed shape. |
| `fastrouter.empty.json` | Anonymous pricing feed with no inventory. |
| `fastrouter.malformed.json` | Pricing envelope changed shape. |
| `babelark.empty.json` | Empty native-ratio inventory. |
| `babelark.malformed.json` | Ratio envelope changed shape. |
| `qiniu.empty.html` | Official page with no public models. |
| `qiniu.malformed.html` | Page shell without the embedded SSR document. |
| `deepseek.malformed.md` | Official Markdown with changed units. |

Timeout, authentication, rate-limit, redirect, oversized-response and
connection failures are exercised through a loopback HTTP server in
`apps/gateway/src/providers/adapters/mod.rs`; they do not require a Provider
credential or any external request.

## Current transport boundary

The development machine resolves these public origins into the reserved
`198.18.0.0/15` range (local proxy/DNS interception). Niu's gateway correctly
rejects that destination before sending. The raw captures above were fetched
directly outside the gateway for schema evidence only. Gateway end-to-end
transport remains unverified until deployment DNS resolves the documented public
addresses; endpoint safety must not be weakened to make this pass.
