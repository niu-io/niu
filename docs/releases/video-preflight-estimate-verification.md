# Pre-submission video estimates

Status: local API/SDK checkpoint; full Video and financial acceptance remain open.

`POST /v1/video/estimate` and `client.video.estimate(request)` validate configured
text-input video requests without creating a job, reserving funds, querying the
Provider or submitting generation. Estimates and creates share model/workspace,
route, schema, effective customer tariff and supported Guardrail checks.

The response preserves effective output and explicitly estimated quantity. A
customer amount uses the applicable selling tariff and discounts; the separately
reviewed maximum charge uses the configured liability bound. Exact amounts are
decimal nanounit strings. Owner-funded quantities have null currency/amount,
maximum charge and customer tariff selection time. No procurement rates enter
the response. Missing estimators or unsupported contracts fail explicitly.

An estimate is not a binding quote, confirmed usage or admission guarantee. It
neither checks out nor reserves shared funds; submission rechecks authorization,
configuration, pricing and capacity before dispatch.

## Evidence

All four gateway video tests passed. Gateway fixtures cover customer and owner-funded estimates, separate estimated
and maximum amounts, invalid credentials, invalid duration, unmapped resolution,
model access and unsupported callbacks. Attempt/reservation counts remain
unchanged and recorded Supplier generation calls remain zero during estimation.
All 132 SDK tests passed, covering one authenticated estimate POST and exact amount strings beyond
JavaScript's safe integer range. Contracts and reference documentation specify
nullable, nonbinding estimate semantics. Unique OpenAPI keys and all 99 local references resolve; public-boundary and changed-file whitespace checks passed.

## Remaining acceptance

Finish Supplier output/meter configuration controls and the customer Video
estimate/submission workflow. Integrate historical explanations into Logs,
Usage and Billing; qualify live channels, media inputs, financial contracts and
packaged recovery independently. This checkpoint closes no F01–F10 gate.
