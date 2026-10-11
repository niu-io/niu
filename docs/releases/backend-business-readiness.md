# Backend business readiness review

Reviewed: 2026-10-12. This is an incomplete acceptance review, not a release
approval or a claim of parity with another gateway. Review the committed `main`
contracts separately from uncommitted shared development changes. The native backend is now pinned to `cefd284`, including shared bounded invoice
issuance, invoice payment, Supplier settlement, balance refund and approved-credit
and warning-policy recording transactions, plus atomic Supplier profile/audit
updates, membership changes, business identity creation and guarded deletion. The broad buffered/streaming workload evidence remains pinned
to `e655a37`; do not relabel historical measurements as new-version results.

## Required business paths

| Priority | Implemented and observed | Still unverified or incomplete |
| --- | --- | --- |
| Supplier configuration | Explicit business ownership; multiple independent credentials; per-credential mappings; revisions, rotation, diagnostics and metadata refresh; actual scoped calls and authorization boundaries | Complete commercial offer-to-earning-to-settlement path; positive media purchase accounting; frontend workflow belongs to its separate workstream |
| Workspace API keys | Workspace inheritance/narrowing; isolation; rotation/revocation; spending, RPM, estimated TPM and unresolved-work concurrency; actual calls and several two-Gateway contention scenarios | Every mixed-protocol admission interleaving and media financial occupancy; do not infer these from one concurrency run |
| Customer funds and exact billing | Adapter inventory; durable EPay checkout; signed artifact and invalid callback rejection; separate approved credit; pinned text tariffs, exact charges/debits, refunds, invoice issuance and recovery | Actual externally evidenced cash funding remains deployment-specific; positive media debit/invoice and media-overrun recovery are unverified; historical media supplements to an already issued interval are not implemented |
| Logs and usage | Actual text and retained video reporting; ordinary-reader authorization; pagination, key filters, full-range totals and CSV matched independently to records | Every interrupted-stream interleaving, all concurrent pagination cases and unrestricted large-history capacity; browser acceptance is separate |
| Video durability | Actual personal generation, one-submission replay, encrypted result retention, interruption recovery, download/decode and deletion protection | Customer-paid measured usage, positive debit, overrun recovery and result-expiration cases remain unverified; personal OpenRouter cost does not provide the required billable quantity |
| Performance | Actual buffered and structured-stream workloads with exact accounting; single/two-Gateway subsets documented | No maximum-capacity, overload or long-soak qualification; video and nonempty commercial financial backlog workloads remain unmeasured |

## Next implementation and verification order

1. Review customer media invoice behavior when a priced charge arrives after its
   interval was already issued. The existing text-only historical invoice is
   immutable; retrospective media supplements are explicitly absent. Define a
   compatible accounting contract before adding a mutation or claiming complete
   historical media invoicing.
2. Inspect positive media settlement and overrun recovery implementation against
   exact measurement, original-price binding, capacity accounting and restart
   invariants. Without actual authoritative measured usage, retain this path as
   unverified; never substitute requested duration or Supplier expense.
3. Review Supplier earning and settlement selection for immutable attribution,
   full-ledger reconciliation, pagination and exact payment identity. Do not
   manufacture an agreement, qualification or payment to populate acceptance.
4. Extend matched performance measurement to relevant implemented failure and
   recovery paths after their business invariants are established. Define the
   deployment workload and thresholds before claiming production capacity.

These tasks preserve the original business scope. Guardrail and protocol release
requirements remain in the broader [first-release matrix](first-release.md);
this six-priority review does not silently remove them. Agent Observability,
frontend visual development and container acceptance remain separate assigned
workstreams. Advisory issue feedback does not override the user's priorities.

## Evidence and boundaries

- [Supplier configuration](../reference/supplier-key-isolation-live.md),
  [operational usage](../reference/supplier-configuration-usage.md),
  [profile recording](../reference/supplier-profile-recording.md),
  [earning history](../reference/supplier-earning-history.md) and
  [settlement history](../reference/supplier-settlement-history.md).
- [Key spending](../reference/api-key-spending-limits.md),
  [concurrency](../reference/api-key-concurrency-limits.md) and
  [layered company/workspace/key limits](../reference/layered-spending-limits.md).
- [Payment support](../reference/payment-aggregators.md),
  [usage reconciliation](../reference/token-category-reconciliation.md) and
  [media invoice integration](../reference/media-invoice-integration.md).
- [Interrupted stream reporting](../reference/interrupted-stream-reporting.md),
  including distinct failures and unresolved financial liabilities under an
  ordinary workspace reader.
- [Buffered text](../reference/mixed-key-sustained-text.md) and
  [structured streaming](../reference/published-route-stream-load.md), including
  customer reporting checked against retained real responses and reopened data.

The linked checkpoints describe their own actual inputs and independent final
artifact checks. Fixture outcomes have no evidentiary value. Compilation,
contract checks and successful CI are static consistency checks, not proof of
an integrated business path. Empty APIs do not qualify populated financial flows.

Supported payment adapters need not each complete merchant onboarding or a live
transaction for internal integration capability to be ready. Actual funding
claims still require genuine signed/server-side payment evidence. Personal
OpenRouter access remains personal testing; commercial Supplier qualification
is a separate deployment/business condition, never inferred from connectivity.
