# Pricing integrity checks

Tracked in [issue #61](https://github.com/niu-io/niu/issues/61).

Shared text admission now requires an explicit cost bound regardless of prepaid
balance configuration and a customer selling revision bound inside its admission
transaction. Personal owner-funded routes retain their separate admission path.
Missing configuration returns the customer-safe `service_not_ready` response;
Provider costs and diagnostic details remain platform-only.

Platform standard prices, workspace tariffs and promotion pages include advisory
`pricing_health`. Comparisons use exact token amounts, category fallback rules
and the union of context thresholds, including each enabled managed pool
candidate. Matching effective media unit prices use checked rational arithmetic;
unsupported discount/minimum/rounding combinations remain incomparable. Unknown
routes, missing prices and incompatible currencies never imply a positive margin.
Checks do not activate supply, block intentional discounting or alter settlement.
Selling rows and subsequent current Provider comparisons are separate snapshots;
refresh after changes. These are configuration diagnostics, not transaction locks.

## Current-input verification

A local isolated copy of retained development data was used for actual management
HTTP requests and independent PostgreSQL inspection. No commercial qualification
was created, no original database was modified, and no merchant polling was run.

- Actual inference requests with removed route cost configuration and with an
  unpriced new workspace returned 503. Independent before/after reads retained
  identical attempt, customer charge, balance-entry and cost-reservation counts.
- Actual standard publications and reads exposed lower unit-rate warnings,
  withheld comparison for a currency mismatch, and reported no lower unit rates
  for the compatible higher-price schedule. A subsequent lower context tier
  identified its threshold. A published promotion retained its original zero
  schedule after standard replacement and showed its own warning.
- An ordinary customer owner received 403 from the platform comparison endpoint.
- Independent PostgreSQL reopening matched the saved standard schedules and
  distinct old/new workspace price revisions to the actual HTTP artifacts.
  Requests before and after publication retained different immutable tariff
  bindings. The actual upstream returned 403 for both new inference attempts;
  this does **not** verify successful settlement, a nonexecution outcome, or an
  in-flight successful old/new-price generation. Existing uncertain records were
  retained rather than released by assumption.
- The running dashboard was inspected at desktop and narrow widths for standard,
  workspace and promotion checks, details, keyboard dismissal and workspace-menu
  alignment. The public OpenRouter Provider pricing table/detail surface and
  existing Niu administration surfaces informed the table/status/detail pattern.
- Unit and integration checks verify text context-tier union boundaries,
  exact media unit-rate rational comparison, discount/minimum/rounding
  incomparability, and pre-dispatch tariff/offer binding invariants.
