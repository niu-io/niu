# Supplier availability verification

## Reproduce credential-isolation acceptance

Verified 2026-10-07: the real PostgreSQL-backed gateway fixture passed through the public runner. Two runner regression tests also passed for a nonexistent filter and failed-test cleanup without inherited runtime credentials.

With Rust and PostgreSQL CLI tools on PATH, run from the repository root:

```sh
python3 scripts/test-postgres.py supplier_keys_dispatch_independent_model_subsets_after_rotation_and_reload
```

The runner rejects a filter with no ignored tests, creates a private disposable PostgreSQL cluster, and excludes saved runtime credentials and existing database URLs from the test environment. It stops only its own cluster. The fixture covers separate credential/model subsets, stale rotation conflicts, saved-state reload, disable/reactivation isolation and customer-key rotation/revocation. Its controlled non-OpenRouter endpoints establish local behavior, not live supply rights, commercial rates or external protocol qualification.

## Responsive model-dialog correction — 2026-10-04

The saved OpenRouter model-management dialog was reviewed at 768 pixels. Long aliases overlapped neighboring columns because table cells inherited nowrap, while the table compressed upstream names into very narrow columns. The actual OpenRouter Keys page at the same width preserves a 1040-pixel table inside a 718-pixel scroll region without widening the document.

Niu now preserves a 960-pixel minimum model table above the phone breakpoint and explicitly allows alias wrapping. At 768 pixels the wider table scrolls inside the dialog, names no longer overlap, and the right-side Edit action remains accessible by scrolling. Filtering to a long alias, opening its edit dialog and cancelling were exercised without saving. At 390 pixels the existing compact alias/status/actions table still fits its container; the edit dialog stays within the viewport and scrolls vertically. At 1280 pixels all columns and row actions remain readable. Each reviewed document matched its viewport width.

All 11 Supplier-view integration tests passed, along with changed-file whitespace and public-boundary checks. Only scoped model-dialog CSS changed. No Supplier credential, mapping, offer, rate or capability declaration changed. The unrelated subscription pool and separately owned Agent Observability were not edited. This fixes one responsive failure; complete Supplier onboarding and release qualification remain open.

The Supplier model-mapping table now displays effective dispatch eligibility instead of equating an Enabled configuration with availability. The management read uses the shared Supplier route eligibility function plus model/service enabled state and credential presence. Configuration writes do not accept availability; saving refreshes it from the backend.

Verified:

- Seven PostgreSQL Supplier/registry tests passed, including paused and active offers and disabled API service availability.
- The gateway's independent customer/Supplier ledger inference regression passed.
- Eight Supplier dashboard interaction tests and TypeScript checks passed.
- The running dashboard on port 2566 showed one available legacy route and 25 unavailable offers. Available/unavailable searches, refresh and the mapping editor were checked at desktop width against the inspected OpenRouter endpoint status table pattern.
- Public-boundary checks passed for the changed implementation and architecture documentation.

The browser viewport override did not change the actual 1280-pixel viewport. Narrow-screen verification remains outstanding. These checks do not qualify the legacy route, activate the 25 offers, prove upstream protocol support, or complete F03/F04. Real Supplier qualification and the customer-price workflow remain required.

## Multiple credential configurations — 2026-10-03

The creation API accepts an existing `supplier_id` and commits the encrypted credential configuration, ownership and audit event together. Choosing both an existing Supplier and new-business creation is rejected. Legacy configuration-only creation remains supported.

Fresh PostgreSQL verification passed all five storage vendor tests and the focused Supplier creation HTTP test. Coverage includes one key with two model mappings, a second key with an independent mapping under the same business, reopened storage, rotation/disable isolation, missing-owner rollback, conflicting ownership choices and credential-free responses. These are fixture-based configuration checks, not live inference qualification. Each alias still resolves to one credential configuration; overlapping-key fallback for the same alias is unimplemented.

The dashboard add dialog now selects an existing Supplier and submits an independent key name without new-business creation. The scoped Supplier route preselects its owner. Fresh dashboard typechecking and all 202 dashboard tests passed, including the existing-owner creation contract and post-commit discovery-failure behavior. Both Supplier and adapter menus were inspected open at desktop and 390px widths; selecting OpenAI updates its default endpoint. No credential was saved and no inference request was sent during this visual review. Full onboarding and live inference qualification remain open. OpenRouter remains one demo Supplier; these checks do not establish discounted supply or supply rights.

### Saved Supplier/key hierarchy

Configuration-list reads now include only the Supplier's identity alongside the existing credential-free metadata. The dashboard groups named API keys under one business, shows the number of keys, and switches model mappings per selected key. Legacy unowned configurations appear as unassigned API keys. Creation closes the form immediately after commit; a discovery failure reports the saved state, and Retry reads configuration rather than repeating creation.

Fresh PostgreSQL checks passed five storage tests, all 133 gateway tests, and the process-replacement test. The latter now verifies Supplier ownership as well as rotated credentials and disabled configuration across restart. All 204 dashboard tests passed with two workers, including two keys under one business, separate mappings and post-commit discovery failure. An earlier run alongside Rust tests encountered timeouts; the isolated rerun kept the original test timeouts. Browser review used the saved OpenRouter Supplier at desktop and 390px widths; the shared mobile header now grows with wrapped actions instead of overlapping content, also checked on workspace Overview. Edit-key dialogs were inspected at both widths without changing the saved credential. A second live Supplier credential and complete live multi-key inference qualification remain outstanding.

## Demo rate refresh — 2026-10-03

The saved OpenRouter configuration was refreshed from its live public catalog: zero new offers and one new rate revision across the 25 selected aliases. The changed offer retains both its previous revision and its current revision. A subsequent `--check` verified every selected mapping, saved offer, Supplier ownership and current public input/output rate without configuration writes or inference calls. All 25 offers remain inactive and unqualified; no customer tariffs were changed.

Eight script tests passed, including complete read-only checking, missing-offer rejection, explicit selection among multiple credentials, exact decimal conversion and revision-checked refresh. Supplier pricing was inspected in the running dashboard at desktop and 390px widths; opening the changed offer’s editor showed the exact saved input/output rates without publishing another revision. These checks establish test pricing only; discounted supply, additional billing categories and live protocol qualification remain open.

## Independent dispatch through multiple keys — 2026-10-03

A fresh PostgreSQL/gateway integration check creates one non-OpenRouter Supplier through the administration API, using the OpenAI-compatible adapter and two independent local upstream endpoints. One key maps two models; the other maps a third model. Every request reaches only its selected endpoint, with that key's credential and the configured upstream model. The customer response retains the public model alias.

The check rotates the first key, rebuilds gateway state from PostgreSQL, and repeats all three dispatches. Disabling the first key blocks both of its models without dispatch and leaves the second key usable. Customer model discovery then includes only the remaining eligible model. Both mapping subsets and the shared Supplier ownership remain saved. All eight gateway vendor tests passed, alongside the independent-key storage regression and gateway Clippy with warnings denied. Public-boundary and changed-file whitespace checks passed.

These are controlled dispatch and persistence fixtures with synthetic credentials, not external Supplier/model qualification or a full process restart. No saved demo credentials or offers were changed, and no paid inference was sent. The separate process-replacement checkpoint above covers its named configuration only. Live multi-key onboarding, actual upstream entitlement, rates and commercial qualification remain open; this does not close F03 or F04.

## Multiple models per key — 2026-10-03

The independent-credential PostgreSQL regression now gives both keys two model mappings under one Supplier. It passed with reopened storage, independent rotation and disablement, preserved mapping counts, credential-free configuration reads and one business record. Together with the gateway fixture above, this covers keys serving one or several models without an OpenRouter-specific assumption. External live qualification and overlapping-key fallback remain unverified.

### Supplier topology recheck

Both focused PostgreSQL regressions passed again: storage preserves two keys with multiple model mappings under one Supplier, and gateway dispatch verifies independent model subsets after credential rotation, state reload and disablement. The gateway fixture uses non-OpenRouter endpoints. OpenRouter remains a demo Supplier rather than a required Supplier type. These fixture checks do not qualify external live supply or implement overlapping-key fallback.

## Stale rotation and credential-preserving reactivation — 2026-10-03

The dispatch regression now attempts a stale revision update after rotating the first key. The API returns HTTP 409; dispatch still uses the rotated secret and original mappings, while the second key remains independent. After disabling the first key, re-enabling it without submitting a secret restores both of its models with the saved rotated credential. Rebuilt gateway state dispatches all three aliases to their correct endpoints, customer discovery contains the three eligible models, and both configurations still belong to the same Supplier.

All eight PostgreSQL gateway Supplier-management regressions passed, covering these dispatch checks, atomic ownership, authorization, catalog inspection boundaries, private-destination rejection and exact stored-price preservation. Gateway Clippy passed with warnings denied, and changed-file whitespace checks passed. These controlled fixtures do not establish live upstream entitlement, commercial terms, real model qualification or full browser onboarding; F03/F04 remain open. No demo configuration or paid inference was changed.

### Workspace key rotation across Supplier dispatch

The same PostgreSQL dispatch fixture now rotates the customer workspace key through the management API. Its replacement inherits the name, exact model grants and original absolute expiry. Rebuilt gateway state rejects the old token for discovery and inference with HTTP 401, without creating an attempt or reaching either upstream endpoint. The replacement discovers the three granted models and rejects an ungranted model with HTTP 404 before dispatch, following the existing non-disclosure contract.

The replacement then performs the independent Supplier disable/reactivation dispatch checks above. Revoking it through the management API and rebuilding state leaves both the original and replacement tokens unusable for discovery and inference, again with no new attempts or upstream calls. The expanded PostgreSQL fixture passed; gateway Clippy and changed-file whitespace checks passed. This covers controlled API rotation, grants and revocation across independent Supplier routes, not the rendered key-management journey, external supply or all F02 requirements.

## Focused Supplier layout — 2026-10-03

The Supplier page now uses a grouped Supplier/API-key menu and compact identity, endpoint and actions instead of a large directory plus repeated credential facts. Model routes open through Manage models in a dialog; credential creation/editing and model creation/editing remain dialogs. This follows the compact identity-and-detail hierarchy inspected on OpenRouter's provider directory/detail pages, adapted to Niu's private credential-management scope without copying unrelated traffic charts or policy claims.

The running dashboard on port 2566 was inspected at 1280px desktop and 369/390px narrow widths. The key menu was inspected open and selected, credential editors opened without saving, and model management, filtering and nested model editing were exercised. Narrow model rows show alias, status and actions; full upstream mapping and capabilities remain in the editor. Long upstream names wrap, status and actions do not overlap, and the narrow document has no horizontal overflow. The desktop rail remains hidden at narrow widths. Eleven Supplier interaction tests and dashboard typechecking passed, including independent-key selection, stale response handling and rejected-save draft preservation. No saved credentials, routes or offers were changed. These checks qualify this layout and its named interactions, not complete onboarding or F03.

The accompanying full dashboard run passed 225 tests. The gateway default run passed 79 tests, with 71 PostgreSQL tests and the separate process-restart test skipped; the two focused PostgreSQL checks above were explicitly run rather than inferred from that default result.

## Current credential-dialog review — 2026-10-04

The running dashboard was reviewed at 1280px and 390px. Add Supplier API key opens a focused dialog; choosing the saved OpenRouter business changes Supplier name to API key name and submits through Add API key. Selecting the OpenAI-compatible adapter updates the default endpoint to its own service URL. The Supplier choice menu was inspected open at narrow width with its built-in selection gutter and aligned trigger width. The saved-key editor leaves replacement credentials empty, locks the existing adapter and keeps its controls within the narrow viewport. Dialogs were closed without saving; the existing 26 mappings and saved credential remain unchanged.

All 11 Supplier dashboard interaction tests passed. The current PostgreSQL gateway regression also passed for one non-OpenRouter Supplier with two independent credentials, one serving two models and one serving a third: rotation, stale-write rejection, state reload, disable/reactivation isolation, customer-key rotation and revocation. Upstreams in that test are controlled local fixtures, so it does not establish external entitlement, actual Supplier rates, commercial rights or complete rendered onboarding. Full F03/F04 qualification remains open.

## Credential isolation recheck — 2026-10-08

The disposable PostgreSQL runner again passed
`supplier_keys_dispatch_independent_model_subsets_after_rotation_and_reload`
against current source: one gateway test executed, with all unrelated tests
filtered out. Compilation completed before execution; the runner exited zero and
stopped its own cluster. This exercises independent credential/model subsets,
rotation conflicts, reload, disable/reactivation and customer-key revocation with
controlled non-OpenRouter upstreams. It does not qualify live Supplier rights,
video entitlement, external protocol behavior or production restart acceptance.
The current Supplier view/model-mapping dashboard suites also passed all 17 tests.
