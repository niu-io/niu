# Video capability configuration checkpoint

Reviewed 2026-10-07. Partial evidence for F03/F04/F10 and V01/V04/M01; no release gate is complete.

## Delivered

- Suppliers → API key → Manage models → Add/Edit mapping has a Video configuration dialog. General, Inputs, Controls and Rules separate request limits, input roles/transports, generation controls and incompatible combinations.
- The editor covers the existing version-1 request schema: text/image/video/audio declarations, per-input limits, HTTPS/Base64 MIME types, required roles, integer/choice/boolean/URL controls, defaults and required/exclusive controls. Limits are entered from the model/channel contract; there are no assumed universal ranges.
- Alias/upstream bindings come from the mapping. Schema revisions stay internal. Changed constraints receive a new revision; unchanged constraints retain it. Mapping identity changes update the binding and revision.
- Apply changes only the draft. Save mapping uses the existing revision-checked backend write; cancel and unsaved removal do not mutate stored configuration. Pricing is preserved and managed separately. Existing backend validation and offer-invalidation triggers remain authoritative.
- The model directory identifies configured Video capability. Catalog connectivity does not claim video inference qualification. The Supplier catalog link now points to global `/models`.

## Verification

- Dashboard TypeScript check passed. The final full dashboard suite passed 389 tests across 64 files with two workers; the affected Supplier/layout/session/Chat subset passed 78 tests across seven files. The seven focused editor tests cover configured constraint round trips, new configuration without presets, revision changes, invalid defaults/exclusive controls/callback declarations, UTF-8 role bounds, parent-submit isolation, binding changes and draft cancellation/removal.
- Fresh PostgreSQL Supplier tests: six passed, including versioned schema validation/persistence, independent credentials and model subsets, ownership isolation and secret-safe configuration.
- Inspected New API's actual [channel configuration reference](https://doc.newapi.pro/en/guide/console/channel-management/) and its model-configuration screenshot before editing. Niu retains its shared theme and components; the tabs expose Niu's existing schema contract.
- Reviewed the real development Supplier → model management → mapping → video dialog at desktop and 390 × 844 widths. All three new choice menus were inspected open at both widths. Phone dialogs fit within 358 px, the document stays 390 px wide, and labels/fields stack without clipping. Review drafts were discarded; no video capability was saved onto the OpenRouter text test model.
- The management OpenAPI now describes the video schema and control types. All local contract references resolve. Public-boundary checks pass.

## Remaining

Configuration is not a live qualification or a complete video workflow. Modality-aware offer creation/classification, output dimension/meter/liability administration, independent customer selling-rate administration, real Supplier/model/channel reviews and complete multimodal transport remain open. Media inspection/results/assets/consent and the full V01–V21/M01–M08 acceptance scope remain required. A callback declaration does not implement callback authentication or delivery.
