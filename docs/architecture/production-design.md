# Production request and cost design

Status: proposed behavior. The request gateway and durable accounting are not implemented.

## Provider and model records

Separate a customer-facing model identity from a provider, endpoint, and provider offer. An offer revision records model mapping, protocol capabilities, region, data terms, credential scope, and provider pricing. Changes to these fields create a new revision and require revalidation before production routing.

Provider declarations, conformance tests, and observed behavior are separate evidence. Unknown capabilities do not satisfy a required capability. Performance history can qualify a provider for selection; it cannot guarantee the next request's latency.

## Eligibility and routing

Apply hard constraints before ranking candidates: tenant access, approval state, model capability, permitted region, privacy terms, credential ownership, and current health. Optimize only among candidates that pass every constraint. Routing may choose lower expected cost within an observed performance threshold, or lower latency within an explicit cost limit.

The route explanation records the selected offer and price revision, policy revision, constraints applied, excluded-candidate reason codes, and the measurements used. It must not capture prompt content by default.

## Request and attempt states

A request moves through authenticated, validated, planned, reserved, attempting, streaming, and a terminal state. Each provider attempt has its own provider and price revision. Failure to connect before sending can be treated differently from a timeout after the request may have reached the provider.

Do not send a successful response header before deciding whether an initial provider failure permits fallback. After response commitment, do not splice a second provider's response into the same stream. A client cancellation is not proof that the provider stopped work or that the attempt incurred no charge.

## Durable budgets and accounting

Use integer currency units in the durable ledger. Provider rate values and usage are converted with documented precision and rounding. A reservation must cover a defensible upper bound for applicable usage and provider pricing. If usage cannot be bounded, strict admission rejects the attempt or places it in an explicitly risk-limited mode.

Customer charge, provider liability, and cost absorbed by Niu are separate amounts with explicit links between them. A retry that Niu absorbs does not charge the customer a second time, but its provider liability still requires an attempt record and budget coverage.

Persist budget reservations, attempt intent, and outbox events in one PostgreSQL transaction. Settlement is idempotent by usage revision. Unknown usage remains held until evidence supports settlement or release. Expired execution leases do not automatically release financial holds.

The selected pricing engine returns decimal-valued estimates from floating-point source rates. The surrounding ledger must validate, quantize, and reserve integer currency units before any provider dispatch; the estimate alone does not enforce a spending limit.
