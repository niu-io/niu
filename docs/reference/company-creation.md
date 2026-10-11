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
Company-list pagination is separate: the existing list remains capped at 1,000
installation-visible companies and has no continuation cursor.

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
