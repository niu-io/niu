# Supplier settlement history

`GET /admin/v1/providers/{provider}/settlements` reads all retained payment
records through keyset pagination. The dashboard's latest 100 records remain a
preview. This endpoint does not move money, create an earning, record a new
payment or change a balance.

Platform administrators and active members of the selected Supplier can read
this endpoint. Company membership alone grants no Supplier access. Membership
and revocation are checked for each request; customer workspace APIs do not
expose this ledger.

## Contract

| Query | Meaning |
| --- | --- |
| `limit` | 1–100, default 50 |
| `before` | Prior `next_cursor`; omit on the first page |
| `currency` | Optional three-uppercase-letter currency; no conversion |
| `from_ms` | Inclusive record creation time in Unix milliseconds |
| `to_ms` | Exclusive record creation time in Unix milliseconds |

Time bounds must be nonnegative and at most 253402300799999. When both are
present, `from_ms` must precede `to_ms`. Unknown query fields and invalid filters
are rejected. Missing Suppliers return 404; a missing or foreign cursor, or one
outside the requested filters, returns 409. Keep filters fixed across pages.

The response has `data` and nullable `next_cursor`. Each record includes only
`id`, `currency`, exact decimal-string `amount_nanos`, `payment_reference` and
`created_at`. Internal IDs are API continuation/identity values, not UI labels.
No customer, workspace, API key, attempt, task or upstream credential detail is
included. Responses use `Cache-Control: no-store`.

Ordering is descending creation time, then descending ID. Migration 0235 adds
the matching Supplier-leading index. A single SQL statement validates the cursor
and reads one bounded page plus a lookahead record. There is no offset or total
history cap. Newer inserts do not shift subsequent pages; separate HTTP reads
are not a frozen database snapshot. Repeat from the first page to discover new
records. Amounts remain separated by currency, and page totals are not full-ledger
balances. Existing dashboard balances already aggregate the full ledger.

The JavaScript SDK exposes `listSupplierSettlements(supplierId, query)` with
`before`, `currency`, `fromMs`, `toMs` and `limit`. Follow `next_cursor` until null.
The existing POST endpoint remains platform-only and still requires already
confirmed external payment evidence and explicit unpaid earning selection.

## Verification boundary

A fresh native database stored two Suppliers and a scoped operator through
normal APIs. Platform reads returned the empty page for both Suppliers. Granting
an explicit viewer membership enabled only that Supplier's read; the other
returned 404. Deactivating the membership denied the next request and remained
denied after restart. Revoking the operator returned 401. HTTP and the built SDK
agreed on the empty-page contract and no-store response. Invalid page sizes,
currencies, time ranges, unknown parameters and an absent cursor were rejected.

Independent reopening confirmed the two Supplier identities, revoked access,
the valid history index and no settlement, earning, attempt or balance entry.
These observations qualify only authorization, query rejection, empty-history
integration and restart. Nonempty cursor traversal, insertion between page reads,
multi-currency totals and full-ledger reconciliation remain unverified. Do not infer successful payment recording,
complete statement reconciliation or nonempty pagination from an empty response,
compilation, a fixture result or the existence of this API. No external payment
or Supplier earning is fabricated to exercise the endpoint. Supplier accounting
and frontend acceptance under issue #3 remain open.
