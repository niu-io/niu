# Customer media rate dashboard checkpoint

Reviewed 2026-10-07. Partial F03/F05/F10 evidence; no release gate is closed.

## Delivered workflow

Installation administration reaches **Settings → Billing & payments → Media selling rates**. Ordinary company users retain their balance/payment view and cannot reach platform selling configuration. Installation readers can inspect history, with publication, replacement and retirement disabled.

The dashboard reuses Niu's media-rate history and dialog composition with separate selling endpoints. Qualified named model choices pin the credential, model, offer and schema. Publication includes specification, exact price/quantity, currency, precision, rounding, effective period, optional specification/customer-scoped discounts and explicit maximum billable quantity with a reviewed-liability reference. It does not derive a maximum from an estimate. Replacement retains dimensions and meter; retirement and replacement use the immutable backend lifecycle. Uncertain-save retry retains the same request receipt and terms. Existing jobs retain their original prices.

History shows model/specification, customer price and effective status, with a visible pinned details action on narrow screens. Details omit internal identifiers and confidential purchase values. There is no fallback to Supplier procurement prices. No eligible route produces an actionable unavailable state instead of invented choices.

## Rendered review and tests

The actual development product on port 2566 was inspected at desktop and 390-pixel width: global settings navigation, the selling tab, empty history and the unavailable-model publication dialog. Actual phone document width was 390 pixels; dialogs spanned x=16–374 with 356-pixel internal scroll width and no horizontal page overflow.

Populated history, detail/retirement/replacement dialogs and open model, resolution, precision, rounding and discount-stacking menus were inspected at both widths using the same product components in a temporary isolated UI fixture. The fixture made no real Supplier or financial changes and was removed afterward. This establishes layout and interaction evidence, not live commercial qualification or saved production pricing. The review followed the supplied Manus settings pattern, inspected New API's documented configuration dialog, and retained Niu's shared surface tokens.

The complete dashboard suite passed 405 tests across 67 files; TypeScript checks passed. Focused customer tests exercise scoped publication with exact amounts, reviewed maximum quantity, customer discount eligibility, zero-bound rejection, read-only history and hidden identifiers. Existing Supplier publication/history and ordinary account-settings tests remain covered. Backend/API/SDK and financial concurrency evidence is tracked in the [rate lifecycle checkpoint](customer-media-rate-lifecycle-verification.md).

## Remaining acceptance

Effective output specification and meter configuration, complete discount-policy administration, real qualified Supplier configuration, a customer-funded live video and the entire Logs/Usage/Billing reconciliation journey remain open. The demo Supplier's personal OpenRouter key does not supply commercial video qualification. This dashboard checkpoint does not claim every F03/F05/F10 requirement is complete.
