# Credit funding copy verification — 2026-11-18

Tracked finding: `niu-x6rp`. Current native gateway identity:
`b8263c9975550ec37207d51882f72ee9215948eb`. The production dashboard build from
the combined Settings source was served by that gateway.

A new isolated PostgreSQL installation was configured through the actual platform
APIs. Two local model mappings received current standard customer prices: USD 1
per million input tokens and USD 2 per million output tokens for one, and zero
for both rates on the other. No staging price, customer balance or Provider
account was changed. The local connection was not qualified for inference, and
no inference was submitted.

Independent SQL inspection of the committed standard-price revisions returned
`1000000000`/`2000000000` nanounits per million tokens and `0`/`0`, respectively.
The public catalog API independently returned the same customer prices and
`billing_source: niu_credits`. Browser navigation from the actual catalog to each
model detail displayed USD 1.00/USD 2.00 and USD 0.00/USD 0.00, respectively.
Both retained the conditional statement that applicable Niu charges use workspace
credits, and the warning that published prices do not guarantee access or supply.
Neither claimed that every invocation consumes credits. Missing model capability
information remained explicit.

The final rendered details were inspected at 1440×900 and 390×844. At the narrow
width, document width was 390px for both cases; prices, explanation and actions
remained readable without horizontal overflow. Independent database inspection
found zero upstream attempts. The temporary gateway and PostgreSQL were stopped
after inspection. No fixture result was used.

This closes the missing nonzero-price display variation alongside the previously
recorded hosted zero-price inspection. Provider-supplied descriptions retain
their supplied language; this run does not fabricate a translation. These are
price-configuration and display findings, not evidence of paid inference,
merchant settlement, Provider entitlement or final release acceptance. The final
integrated staging candidate still requires its own acceptance records.
