# Video output configuration dashboard checkpoint

Status: partial F03/F04/F10 and V01/V04/M01/M02 evidence; no release gate is complete.

The existing Supplier API key → Manage models → model mapping → Video
configuration dialog now includes Output alongside General, Inputs, Controls and
Rules. Administrators can choose the estimation meter and map each configured
resolution/aspect-ratio pair to contracted pixel dimensions. Duration/FPS limits,
defaults and required fields remain in Controls. Output controls use the installed
shadcn primitives directly; estimator/schema revisions remain internal.

Apply rejects missing controls/defaults, nonpositive dimensions, duplicate pairs,
unconfigured choices and missing default mappings. Changed output configuration
gets a new estimator revision; unchanged mappings preserve it. Disabling output
estimation preserves the request constraints. Apply updates only the mapping
draft; the existing revision-checked mapping save persists configuration and
invalidates affected qualification. A seconds estimator does not enable the
current video-token-only direct generation adapter.

## Verification

- Dashboard TypeScript and public-boundary checks passed. Twelve focused dashboard tests passed across the editor and model-mapping suites;
  coverage includes existing constraint preservation, output changes, hidden
  estimator revisions, required output prerequisites and draft cancellation.
- Inspected New API's actual channel-management page and model-configuration
  image, then retained Niu's existing dialog and tab pattern.
- Reviewed the real development Supplier/mapping dialog at desktop and
  390 × 844 widths. Meter, resolution and aspect-ratio menus were inspected open
  at both widths. Phone review caught and fixed overlapping wrapped tabs; the
  final tab list is 78 px high, the dialog is 358 px wide with 356 px scroll width,
  and the document remains 390 px wide. Controls and actions remain accessible.
- Verified invalid-width rejection and Apply/reopen preservation in the browser.
  All review drafts were discarded; no OpenRouter mapping, key or rate changed.

## Remaining

Qualify exact live Supplier/model/channel contracts and additional reported
meters. Deliver the customer estimate/submission, recovery, results and charge
explanation screens, media safety and the full V01–V21/M01–M08 scope. This
configuration checkpoint does not claim that a video route is usable or qualified.
