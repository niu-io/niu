# Company creation and retry identity

`POST /admin/v1/organizations` creates a company and its initial zero-funded
balance account atomically. Installation administrator authorization is required;
company/workspace members cannot create companies. Currency defaults to USD and
must be three uppercase letters. Creation grants no funds or approved credit.

Pass one `Idempotency-Key` header containing 1–128 visible ASCII characters to
recover an uncertain response. The key has an installation-wide namespace,
separate from workspace creation. Niu stores hashes of the key and canonical
creation input in an immutable receipt; raw client keys are not stored.

- Same key, name and resolved currency: return the original identity and current
  name with HTTP 201. Omitted currency and explicit USD are equivalent.
- Same key with a different name or currency: HTTP 409.
- The original company was deleted: HTTP 404; never recreate it on replay.
- No key: each successful call creates a distinct company.
- Invalid/repeated key header: HTTP 400. Typed JSON errors use HTTP 422.

Keep the same input and key after a timeout or storage-unavailable response. A
failed response does not establish that no commit occurred. The creation receipt,
company and balance account commit together. Names are preserved without trimming
and must contain non-whitespace text within 200 UTF-8 bytes.

```ts
const company = await admin.createCompany(
  { name: 'Example company', currency: 'USD' },
  { idempotencyKey: savedCreationKey },
);
```

Persist `savedCreationKey` for the pending user action before submitting it. Do
not generate a different key for each transport retry. The SDK exposes
`CompanyCreationInput`, `CompanyCreateOptions` and `CreatedCompany` types.

The generated handler OpenAPI is the source of the request/response contract.
Company-directory traversal uses `GET /admin/v1/organizations?limit=1000&after=…`.
`limit` accepts 1–1000 and defaults to 1000. The response preserves `data` and adds
`next_cursor`; pass it as `after` until it is null. The SDK exposes
`listCompaniesPage({ limit, after })` and `listCompanies()` for complete traversal.
A missing, deleted or out-of-scope cursor returns 409; malformed parameters return
400. Member company scope is applied before pagination. Creation order is stable
through renaming, but pages are live observations rather than a frozen snapshot.

## Current-input verification — 2026-10-11

A native gateway and the built JavaScript SDK exercised an isolated copy of real
retained billing data. Eight concurrent creates with one key returned one company
identity. Explicit USD replay matched omitted currency. Changed name/currency
returned 409, a member returned 403, and an invalid key returned 400. Two calls
without a key created distinct companies.

The same client key successfully created and replayed a workspace under a
separate workspace receipt. A temporary company-receipt insertion fault returned
503 without retaining a company or account; retry after removing the fault
created both once. Gateway restart preserved replay identity. Deleting the empty
retry company and account directly in the isolated database left its receipt;
subsequent replay returned 404 without recreation. This does not introduce a
company-deletion API.

Independent reopening verified live and deleted-company receipts, their hash
lengths, the separate workspace receipt, the immutable-receipt trigger, zero
funding/credit and the unchanged original customer ledger. The temporary fault
trigger was absent. No original database or encryption identity was replaced.
Formatting, gateway Clippy, optimized compilation, SDK checks/build and generated
contract checks completed separately; no fixture result supports these claims.

Lost commit acknowledgements for this specific endpoint and a native upgrade of
the original development service to migration 0266 remain unverified.


## Directory traversal verification — 2026-10-11

A current native gateway and built SDK created zero-funded companies through the
actual API in an isolated database until the directory contained 1,002 entries.
The default page returned 1,000 followed by two; SDK complete traversal returned
all identities. A separate 37-entry traversal preserved the database's creation
order even when a company was renamed between pages. Restart preserved the full
SDK traversal order.

A company owner received only its own entry and no continuation. A foreign cursor
was rejected with 409; invalid limits/cursor syntax and unknown query fields
returned 400. Administrative deletion of an empty company in the isolated database
made its cursor return 409. Revoking the member made subsequent reads return 401.
No company deletion API is implied by this fault check.

Independent reopening compared every saved page identity and cursor with database
ordering, checked absence of duplicates/omissions, verified the new ordering index
and zero-credit accounts, and matched the original customer-ledger fingerprint.
The original running database was not changed. This verifies directory traversal;
it does not establish general write throughput or a snapshot-consistent export.
