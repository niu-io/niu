# Video metering calculation checkpoint

**Status: calculations and scoped pricing persistence verified; video release acceptance remains open.**
Reviewed 2026-10-06. Covers internal calculation, observation and reservation portions of M02/M03/M04/M05/M06/M08 only.

Current-tree storage recheck on 2026-10-07 through migration 0149: all sixteen
`media_pricing` PostgreSQL tests passed on a disposable database. They cover pinned
scope/model/offer pricing, post-egress rejection, concurrent reservations, unknown
and conflicting usage, preserved holds, exact idempotent settlement, zero usage,
bound overruns and shared text/media workspace capacity. Reopened storage preserves
the named price and observation records. This refreshes only storage acceptance;
it does not prove native process recovery, live metering, rendered diagnosis or
Supplier billing terms. Those checks remain separately required.

The Niu-owned `niu-metered-cost` crate implements rational quantities, explicit
meter units, exact dimension/effective-period tariff selection and checked integer
currency calculation. It preserves estimate versus reported provenance. Unknown
usage, mismatched units, ambiguous cards and arithmetic overflow fail explicitly.
No floating-point amount or implicit currency conversion is used.

Eighteen fresh calculation tests pass, covering the required 1280×720, 24 fps, five-second
Seedance fixture (108,000 estimated video tokens), reference-video duration,
fractional quantities, an independent seconds meter, minimum-quantity boundaries,
final Down/Up/HalfEven rounding, half-open effective intervals, all four matching
dimensions, historical calculation from a retained card and overflow. These are
deterministic calculation fixtures, not evidence of Provider prices or behavior.

Seven of those tests cover discount dimension/offer/customer eligibility, half-open
effective periods, independent input ordering, explicit exclusive/multiplicative
priority behavior, ambiguous/invalid configuration, pre-rounding multiplication,
explicit free rules and immutable owned snapshots after active card/rule edits.
Snapshots retain the full tariff and applied rules. Two further codec tests verify
versioned round trips beyond 64-bit quantities and reject unknown fields/versions,
invalid denominators, noncanonical quantities, overflow and out-of-period cards.

Migration 0109 adds immutable customer media pricing bindings to scoped attempts.
Four fresh PostgreSQL tests verify model/offer/company matching, cross-workspace
denial, identical retries, conflicting concurrent revisions, update/delete denial,
retrieval through a new Store instance and rejection after egress. Eight competing
text/media binding races each retain exactly one mode. This tests durable pricing
inputs; it does not qualify a server/database restart or a settled media charge.
All 13 existing billing tests also pass against fresh PostgreSQL with migration
0109, including prepaid concurrency, uncertain reservations and idempotent funding.
The subsequent full storage run passes 112 tests across 22 groups with all
PostgreSQL cases enabled. The locked gateway compilation passes with the new
storage dependency. No application image or live media Provider is qualified by
these results.

Migration 0110 adds scoped immutable reported-usage observations. Six current
PostgreSQL tests pass (the four pricing tests plus two observation tests). The
observation cases reject estimates, unresolved inputs, wrong units, unsent
attempts and foreign scopes; preserve repeated query/callback provenance; retain
conflicting quantities without replacing earlier evidence; and preserve usage
that overflows the price calculation. Concurrent duplicate delivery records one
receipt. At most 16 distinct receipts are retained per attempt; duplicates remain
accepted at the bound. Repeated matching quantities yield `Agreed`, missing usage
`Unknown`, discrepancies `Conflicting`, and arithmetic failures `Unpriceable`.
These are internal observation states, not settlement or terminal job statuses.
No debit follows from an agreed observation.

Current all-target storage Clippy and public-boundary checks pass. The full
112-test storage checkpoint above covers migration 0109; the subsequent focused
six-test PostgreSQL run covers migration 0110. This does not claim a full current
gateway, packaged or live Provider qualification run.

Migration 0111 pins a customer media liability bound to its shared balance
reservation and excludes personal owner-funded routes from customer media
pricing. Ten focused PostgreSQL tests pass with this migration. Added cases cover
16 concurrent reservations against capacity for ten jobs, immutable bound/revision
retries, rollback and pre-egress rejection when capacity is exhausted, retained
uncertain holds, exact conversion from six-place amounts to nanos, rejection of
finer ledger precision/zero-valued bounds, and both binding orders plus concurrent
personal/retail attempts. No paid dispatch was executed.

The internal method requires a trusted caller to supply a genuinely qualified
maximum quantity. A point estimate or revision string alone is not qualification.
Zero-cost media admission and precision beyond nanos remain unsupported in this
method. The video adapter and financial admission route are still absent.

The full migration-0111 storage run passes 118 tests across 22 groups with all
PostgreSQL cases enabled. Current all-target storage Clippy, formatting and locked
gateway compilation pass. These results replace the earlier storage checkpoints
for regression coverage; they still do not establish real Provider bounds,
packaged recovery, zero-cost media admission or a completed video workflow.

Migration 0113 adds customer media charges to the shared balance ledger, with
exact source validation and terminal reservation release. Thirteen focused
PostgreSQL tests pass against the current sequence, including forward integrity
migration 0112. Added cases verify success-only settlement, simultaneous retry,
new-Store replay, injected debit failure rollback, wrong-workspace denial,
immutable charge explanations, rejection of a forged ledger amount, unknown/
conflicting/overflow holds, zero reported usage and actual charges above the
reserved bound. Late contradictory usage stays recorded without a second debit.
These are internal settlement fixtures; no video was submitted to a Provider.

Migration 0114 enforces approved capacity at media debit and prevents release of
an unposted positive media liability. Fourteen focused tests pass. A bound breach
retains the actual immutable charge and its hold when funding/credit is insufficient;
it does not overdraw a zero-credit account. Funding or approved credit can resume
one debit without consuming other jobs' reserved capacity. This is not evidence
that an unqualified Provider can meet a strict spending guarantee. Correction/
refund policy, callback authenticity and route qualification remain open.

The current migration-0114 full storage run passes 122 tests across 22 groups,
with all PostgreSQL tests enabled. All 18 metering tests, all-target Clippy, Rust
formatting, locked gateway compilation and public-boundary checks pass. The
temporary PostgreSQL service was stopped. This is the current regression
checkpoint; it does not close the video or packaged release gates.

Commands:

```sh
cargo test -p niu-metered-cost
cargo clippy -p niu-metered-cost --all-targets -- -D warnings
cargo test -p niu-storage --test media_pricing -- --include-ignored --test-threads=1
```

These commands pass with fresh PostgreSQL for the storage tests. Clippy also
passes for all storage targets. Rust formatting and locked workspace metadata checks pass;
the selective-import verifier confirms all 22 imported crates and the unchanged
text-cost checksum. Public-boundary scanning passes.

The unmodified LiteLLM text-cost source and its attribution remain separate.
No UI, inference route or Supplier credential was changed. Customer debit behavior
was extended through an internal method, without publishing video endpoints.

Required next integration: versioned capability validation and meter adapters;
separately authorized Supplier/customer active rate and discount storage; customer
charge investigation; video-route integration of admission and settlement;
asynchronous create/query and uncertainty recovery; qualified state-based refunds
and discrepancy corrections.
There is no gateway video use of this crate yet. It does not close M02/M03/M04/M05/M06/M08,
V01–V21 or F03/F04/F05/F06, and no live video generation was performed.
