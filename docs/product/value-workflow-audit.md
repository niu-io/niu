# Product audit notes

The authoritative scope, ordering and acceptance criteria are in
[the first-release matrix](../releases/first-release.md). These notes do not add
release gates or replace that plan.

## Corrections to the initial audit

- R20 documents a completed simple-access path, including first-run workspace,
  project and client-key provisioning. An empty database is not evidence that
  onboarding is absent. The entry point is the API keys view.
- R17 is complete for its documented imported-observation scope. Automatic
  collection of arbitrary agents is not required to recognize that completed scope.
- Standalone observation must work without inference forwarding or experiments.
  A paid runner is not a prerequisite for its usefulness.
- Unpriced routes are intentional in the simple-access path. Pricing and strict
  budget enforcement must not become mandatory onboarding requirements.

## Observations to verify against open matrix rows

- R16: complete a supported collection/import and subscription-visibility workflow,
  including provenance, freshness, unattributed usage and deletion.
- R18: preserve distinct monetary and quota views, complete attribution where
  supported, and keep unavailable costs unknown.
- R19 and R11: retain the existing paired analyzer; complete the remaining real,
  authorized experiment and runner acceptance requirements without presenting
  synthetic fixtures as model-performance evidence.
- R09: expose supported first-run and investigation workflows coherently. Existing
  completed flows should be discoverable before adding new ones.
- R04/R06/R07: priced tool-call behavior needs its own conformance and accounting
  evidence. Do not remove strict validation merely to make a demonstration work.

The deterministic paired-experiment CLI fixture was executed successfully during
this audit. This verifies analyzer behavior, not live model quality or release
qualification. No paid inference was performed.
