# Supplier configuration and pricing completion

Supplier configuration and commercial pricing are release requirements. Administrators must be able to understand the initial setup within two minutes and identify the next required action without interpreting internal accounting or qualification machinery. A Supplier name or saved credential alone is not proof that customers can use its models.

## Required behavior

Supplier management must clearly connect these capabilities:

- Confidential purchase costs for supplied models, with versioned text and media rates.
- Customer standard selling prices, distinguished from purchase costs.
- Global customer discounts with explicit start and end times.
- Customer-specific discounts with explicit start and end times.
- Tracking from the published price and applied discount to the request, customer charge, and relevant historical records.

An eligible customer-specific discount overrides an eligible global discount. They do not stack. When the customer discount expires, future operations fall back to an eligible global discount or the standard price. Existing operations and historical charges retain their original price snapshot.

Purchase prices, upstream expenses and platform margins remain confidential administration data. Customer views and APIs expose only the customer's own prices, discounts and charges. Supplier representatives see only their own agreed business records.

## Current foundation

Supplier management includes API credentials, model mappings, purchase offers, qualification, operational usage, settlements and portal access. Portal membership is independent of configuring upstream API access. The directory distinguishes saved configurations from enabled mappings; configuration counts must not be advertised as upstream verification or complete customer availability.

Workspace-specific customer text tariffs have publication history and immutable operation/request bindings. Customer media schedules and the metered-cost engine support time-scoped discount rules and immutable pricing snapshots. These capabilities are not yet a complete, simple standard-price/global-discount/customer-discount workflow across all model types.

Configuration improvements include clearer status and next-step links, post-save model management, explicit API format labels, and clearing unsubmitted fields when changing Supplier scope. Continue from those changes rather than rebuilding a separate component system.

## Implementation sequence

1. Trace purchase and retail pricing through discovery, admission, reservations, retries, accrual and media settlement. Establish the authoritative standard-price source, discount scope and snapshot binding point. Preserve existing contracts and historical financial records.
2. Implement missing persistent standard-price and promotion management, including server-side validation, permissions, effective periods, expiry, publication history and the exclusive customer-over-global policy. Cover text and video rather than adding UI-only fields.
3. Organize Supplier setup around API access, model routes and commercial configuration. Keep advanced review and settlement tasks understandable and distinguish mandatory prerequisites from optional portal access.
4. Display the applicable price, scheduled and expired rules, and the rule actually applied to an operation. Make pricing history explainable without showing internal identifiers or exposing confidential procurement data.
5. Verify both the browser workflow and financial invariants, then complete the broader product release audit.

Relevant source areas are `apps/dashboard/src/features/vendors`, `provider-business`, `customer-pricing`, and `billing`; `crates/storage/src/providers.rs`, `billing.rs`, `priced_admission.rs`, `gateway_retry.rs`, `media_rates.rs`, and `media_pricing.rs`; and `crates/metered-cost/src/lib.rs`. Inspect the operation tariff binding migration and its later changes before altering retry pricing. HTTP handlers, JavaScript SDK types and generated REST/SDK references must stay synchronized.

## Acceptance checks

Test discount precedence, exact start/end boundaries, expiry fallback, revocation, concurrent publication, unknown usage, integer rounding and overflow. Price changes must not reprice completed requests or in-flight operations, including retries and asynchronous video jobs. Reservation and final charge calculations must use compatible pricing semantics. Test customer, Supplier and administrator authorization independently.

Inspect actual desktop and narrow browser layouts, including empty, loading, error, configured and incomplete states; choice menus; publication dialogs; history; and scope transitions. Do not infer availability from counts, or label unresolved charges as free. Use existing shadcn primitives, Niu theme tokens and inspected mature-product references. External design generation is not a prerequisite.

Builds and targeted Supplier checks have passed, but the complete dashboard suite is not green. A baseline run also has failures; classify each remaining failure instead of assuming it is unrelated. Browser rendering checks do not qualify paid inference, merchant activation or financial mutations. The whole product must not be marked release-ready until the remaining pricing workflow and relevant checks are complete.

See `docs/releases/public-docs-navigation-verification.md` for the recorded browser verification and its limits. Marketing remains in the independent website repository; public core and community builds must not depend on website or private source.
