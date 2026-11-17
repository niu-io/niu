# Onboarding and request inspection verification — 2026-11-17

This follow-up uses hosted core `2ec290daa4525a3277c3e49dae46395674a9ac96`
and website `8d3f49200f0d99d27dd39e17d71b904ee3b34108`. Deployment control-plane
readback matched the pinned composition. The local request-copy correction is
based on release tip `b0e3a0a12a21b984ce8b3cb3aeff29cb892c3817` and uses the actual
staging backend, without mocked responses. Tracking: `niu-mm90.15`,
`niu-mm90.20`, `niu-bgst`. This is scoped evidence, not release acceptance.

## Agent onboarding

Both landing and documentation Copy actions were operated. Native paste into a
blank scratch page independently recovered the exact clipboard text. Each prompt
used the current deployment origin for installation and authorization. The docs
prompt also included capability and model checks. Actual `/llms.txt` and
`/docs/install.md` reads returned 200 with text/plain and text/markdown content.
The earlier wrong-origin observation did not reproduce after hydration.

Documentation document width matched the viewport at 320, 390, 768, 1024 and
1440 CSS pixels. Inspected 390px and 1440px screenshots showed a readable setup
block and separate, complete following heading. The narrow navigation opened
within the viewport. The landing prompt and copy feedback also fit at 390px.
This addresses the original onboarding finding; it is not a full accessibility audit.

## Completed video request

Opened the actual paid-video request from the current readiness run. At 1440px and
390px the detail presented the catalog model, completed status, observed duration,
explicit owner-funded billing and an Open video result action. Missing
Provider-reported model identity was explained as Not reported, without substituting
the configured route. Request-body retention was separately reported unavailable.

Following Open video result resolved to the canonical saved session. Its original
prompt and retained video loaded despite revocation of the invocation key. Browser
media readback showed readyState 4, no media error and 1280×720 dimensions. The
independent file hash and decoder evidence are in the
[paid-video verification](repair-verification-0.3-2026-11-17.md).
This verifies the completed-video inspection journey, not every role combination.

## Remaining HTTP 429 wording repaired locally

The current-input upstream rejection recorded during the hosted key check retained
the factual raw error, but its Next steps paragraph still inferred a likely rate
limit. The correction states that the Provider returned HTTP 429 and asks the user
to inspect its response and routing before retrying. Both language variants retain
the explicit absence of automatic retries. Status, classification, usage uncertainty,
customer charge and original request/response content are unchanged.

Actual local UI reads used that saved staging request. English and Chinese text
were checked, and settled screenshots inspected at desktop and 390px; the narrow
dialog occupied 390px with no document overflow. Transition screenshots were
excluded from layout judgments. Type/lint checks and the dashboard build completed.
No fixture-test result contributes to this evidence. Hosted verification of the
new wording remains required after deployment.

## Review criteria

The unchanged information order keeps result access and billing above secondary
metadata; headings and spacing distinguish the setup task from references. Error
copy now separates observed status from recovery advice. These scoped judgments
apply [NN/g error recovery and consistency heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/)
and the reflow principle in [WCAG 2.2 SC 1.4.10](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html).
The inspected [OpenRouter error reference](https://openrouter.ai/docs/api_reference/errors-and-debugging)
separates error codes, metadata and retry handling; its service-specific semantics
are not evidence for the cause of an arbitrary Niu Provider rejection.
