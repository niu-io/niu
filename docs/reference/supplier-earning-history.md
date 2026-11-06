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

## SDK settlement recording

`previewProviderSettlement(providerId, {currency, cutoff_ms, from_ms?})`
returns the aggregate unpaid count, exact amount, and the count/amount that
would remain unpaid after that period. It is read-only and never returns
request, customer or workspace identities. `cutoff_ms` is inclusive;
`from_ms` is an optional inclusive lower bound.

`recordProviderSettlement(providerId, input)` accepts one of two mutually
exclusive forms:

- **Period settlement** — `idempotency_key`, `payment_reference`, `currency`,
  `cutoff_ms`, and optional `from_ms`. The server selects every unpaid earning
  in that currency through the cutoff, computes the exact total, and reports the
  amount, entry count and unpaid balance remaining in that currency. This mode
  never uses request-level identifiers.
- **Legacy attempt settlement** — `idempotency_key`, `payment_reference`, and
  1–1,000 unique `attempt_ids`. Existing callers keep the previous contract.

Both forms record an already confirmed external payment; they do not send money.
The server rejects mixed mode fields, mixed currencies, changed idempotent
replays, duplicate payment references, unavailable entries and periods with no
positive unpaid earnings. Preserve the same key, reference and period bounds
after an ambiguous response and retry with the original values. Every successful
write appends the existing `external_payment_recorded` Provider audit event.

The JavaScript SDK contract test covers period preview/write and the legacy
attempt form with a mocked transport; the storage integration test covers
period selection, partial cutoffs, currency isolation, idempotency and audit in
an isolated PostgreSQL database. Full live bank reconciliation, a successful
native HTTP settlement over real earnings, and concurrent real-payment
settlement remain unverified; no external payment was claimed for those
branches.
