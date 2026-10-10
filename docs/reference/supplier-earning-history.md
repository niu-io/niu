# Platform Supplier earning history

`GET /admin/v1/providers/{provider}/earnings` gives platform administration full
retained earning history for reconciliation and settlement selection. It extends
the administration overview's latest-100 preview without changing that response.
Supplier membership and company ownership do not grant access to this endpoint;
the Supplier-member dashboard continues to omit request-level earning rows.

Use `limit` (1–100, default 50), `before` from the previous `next_cursor`, and
optional `currency`, `from_ms` (inclusive) and `to_ms` (exclusive). Time bounds
refer to earning creation, in Unix milliseconds. Keep filters fixed across pages.
Ordering is creation time descending, then attempt ID ascending, matching the
existing Supplier-leading ledger index. No migration is required.

Each row contains `id`, `model_alias`, `currency`, exact decimal-string
`amount_nanos`, `billing_meter`, `created_at` and `status` (`accrued` or `paid`).
The internal `id` is an API selection value for the existing settlement POST;
frontends must not show it or require users to paste it. The endpoint returns no
customer identity, workspace, API key, credential or customer selling price.
Amounts are Supplier liabilities, never platform revenue or customer charges.

The response is `{data: [...], next_cursor: null | "..."}` with no-store caching.
A single statement snapshots each page and its settlement statuses. Newer inserts
do not shift a continuation, but pages are not a frozen export and status can
change between reads. Recording payment still independently checks that selected
entries are unpaid, belong to this Supplier and use one currency. Reading this
endpoint does not record external payment, create an earning or move funds.

Invalid filters return 400; absent/deleted Suppliers return 404; absent, foreign
or out-of-filter cursors return 409. Unauthorized Supplier/company readers return
403. The JavaScript SDK exposes `listSupplierEarnings` and `SupplierEarningPage`.

## Verification boundary

Current-input native HTTP and the built SDK exercised empty history for two
API-created Suppliers, invalid filters/cursors, no-store responses, restart,
operator revocation and rejection of a Supplier viewer even after an explicit
membership grant. Independent reopening confirmed the retained identities,
revoked access and valid existing index, with no earnings, payments or inference.

This checks the exercised integration and authorization branches only. Nonempty
pagination, concurrent settlement selection and full Supplier reconciliation
remain unverified; an empty page does not qualify those workflows. No Supplier
agreement, earning or external payment was fabricated. Fixture outcomes were not
used as evidence. An initial isolated startup exposed a proposed duplicate index;
the redundant uncommitted migration was removed in favor of the existing index
before revalidation. Original development data and encrypted identity were kept.
