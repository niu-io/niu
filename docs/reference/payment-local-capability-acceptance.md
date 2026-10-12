# Historical local payment workflow and evidence boundary

This older checkpoint used retained Gateway/SDK revision
`4c3def6381e839d1206d5dd13b3b42632b0ef036` with an isolated copy of a
real uncertain Zhifux intent. Its unconfigured-merchant phase and its later
fixture EPay phase must not be treated as one genuine business qualification.

## Fixture exclusion

The local EPay workflow command was executed. Its saved merchant configuration
uses a reserved `.invalid` checkout endpoint. All fixture outcomes are discarded,
including checkout/signature, replay, callback, restart and persistence results.
They provide no diagnosis, prioritization, correctness or readiness evidence.
Aggregate mixed-workflow results likewise do not qualify the fixture portion.
No paid callback, received cash or terminal payment receipt was fabricated.

## Genuine retained scope

The original source contains an actual uncertain Zhifux checkout intent and its
durable remote-creation claim. In the merchant-unconfigured phase, actual scoped
reads expose that saved uncertain state; authorization refuses inappropriate
reconciliation and foreign access. Independent reopening retains the original
order and creation claim. This is historical saved-state evidence, not a positive
checkout, funding or paid/closed callback execution. Original deployment,
database, configuration and encryption identity were not changed.

The newer [genuine payment capability checkpoint](payment-backend-capability-acceptance.md)
uses the actual saved merchant configuration on a separately pinned current
Gateway/SDK, with independent whole-table verification, and includes an exact
refund of an actual posted customer debit. It is the current S06-3 evidence
boundary. The [finite integration matrix](payment-capability-matrix.md) describes
implemented checkout/notification/query limits; implementation findings remain
separate from observed positive settlement. External activation is not a
backend-readiness gate, and fixture results are never a substitute for it.
