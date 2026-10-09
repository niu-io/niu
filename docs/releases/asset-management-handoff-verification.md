# Ordinary asset dispatch handoff

Verified 2026-10-08 for the internal ordinary-group request/credential handoff.
It does not enable asset creation, establish Supplier entitlement, qualify live
management transport, or pass V08–V12/V15/V18/V21.

Before returning a claimed credential, storage reconstructs the saved body as a
validated ordinary AIGC request and compares its complete re-emitted body with
the saved JSON. The upstream project must match the pinned account binding;
alternate group types, unknown controls, null descriptions, malformed names and
changed projects are rejected. The validated request is available through a
read-only accessor on the non-serializable handoff. Failed reconstruction rolls
back the state transition and returns no credentials.

Five media request-validation unit tests and all eleven PostgreSQL
asset-management tests passed against migrations through 0168. The new storage
fixture uses malformed legacy bodies with valid fingerprints, proving the
semantic check rejects them without consuming the prepared intent. The original
concurrent-claim/rotation fixture also verifies the reconstructed request matches
the saved original body. Existing tests cover revocation, erasure, retention,
replay, uncertainty, changed configuration, bounded reconciliation and historical
upgrade bindings. Media/storage library Clippy passed with warnings denied.
Changed-source public-boundary and whitespace checks passed.

No upstream was contacted. Runtime caller authorization, qualified account
rights/costs, durable one-shot dispatch, receipt verification and complete asset
lifecycle/recovery remain open. The prior packaged image predates this change
and does not qualify this handoff.


The subsequent [authorized handoff checkpoint](asset-operation-authorization-verification.md#authorized-handoff-checkpoint--2026-10-08)
adds an exact, expiring workspace/account qualification check and immutable receipt
under the same account lock as revocation. Its 0170 evidence supersedes the
unqualified credential-claim behavior of this original 0168 checkpoint; live
transport and lifecycle qualification remain open.
