# Customer media charge recovery paging

Customer media settlement recovery now pages at most 100 saved customer price
bindings before evaluating completion, successful/failed media observations and
existing ledger posting. Every candidate advances the existing durable cursor;
only candidates needing settlement enter the per-row savepoint. The next tick
continues in attempt order and traversal wraps after the final page.

This uses the same candidate/eligibility separation as text customer charging and
Supplier earnings. Personal media history without customer pricing bindings does
not drive this settlement scan. It does not change prices, eligibility, settlement
arithmetic, transaction ownership or the other media-completion worker.

## Current-input verification — 2026-10-11

A native gateway exercised an isolated restored copy of current development data
containing retained real personal video history. The previous query scanned video
observations despite having no customer media price bindings. PostgreSQL execution
plans for the replacement showed its empty candidate page entering neither the
attempt nor media-observation scans. The actual financial worker advanced its
stage timestamp, retained its empty cursor, and created no customer media charge.
Gateway restart preserved the original customer-ledger fingerprint and authorized
workspace access.

An independent process reopened the stopped database, checked the saved query
hash and both execution plans, and matched attempts, empty price bindings/charges
and the customer ledger. This establishes the empty-binding path on retained
personal history. Nonempty customer-paid media settlement, pages spanning more
than 100 commercial bindings and production capacity remain unverified; no
commercial qualification, payment evidence or customer price was fabricated.
