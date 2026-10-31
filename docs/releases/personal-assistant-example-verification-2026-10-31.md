# Personal assistant source example verification — 2026-10-31

Beads: `niu-3gf` (example), related tutorial `niu-9r5`.

The user requested runnable source as the tutorial outcome, with setup delegated to the coding agent. The example implements one complete task: meeting notes to an action plan and editable follow-up draft, with durable local saved work. It does not send messages. Source is independent of the main workspace installation.

## Functional evidence

- Copied the example source into a fresh temporary directory, excluding dependencies, generated output, environment and data. `npm ci --offline --ignore-scripts --no-audit --no-fund --workspaces=false` installed 114 packages using the registry cache; `npm run build` and `npm test` passed there. Its lock contains no machine paths, workspace links or local-file dependencies.
- Two HTTP integration tests passed, covering server-only secret use, cross-origin rejection, invalid input, generated output, edit persistence across server recreation, upstream HTTP 429, malformed/uncertain output and missing configuration. Tests use a local synthetic upstream and spend no Niu credits.
- Browser operated Load sample notes, Generate plan and draft, generating state, Edit your result, Save changes, reload, saved-work reopen, unsaved edit protection and keyboard Discard edits. Sample output was supplied by a separately launched synthetic local upstream for UI verification only. There is no simulated-response mode in the shipped example.
- Final clean server startup, sample loading and missing-configuration state were inspected with no browser error logs. Vite HMR was attached to the application's HTTP server after a concurrent-preview websocket conflict was found and corrected.
- Example frontend build passed. Docs API check passed for 465 REST operations and 419 SDK exports; docs build passed for 922 pages. Tutorial source link, optional manual setup expansion and 390px reading layout were inspected in the browser.

## Scoped UX review

Used the ux-review local component method. Inspected the actual OpenRouter chat reference: a saved-work lane, primary work area, understated solid surfaces and sample-start affordances. Reused Niu tokens and installed shadcn Button, Input, Textarea and Label primitives with upstream MIT attribution. The example narrows that established pattern to one editable notes-to-draft task.

Task completeness: observed pass for the bounded example under synthetic model transport. Users can load a concrete input, request a result, edit/save it and reopen it. Real model quality and billing remain unverified.

Visual composition: observed pass at 1280, 960 and 390 CSS pixels. Desktop separates saved work from the primary form; the work lane is approximately 936px at 1280 and 616px at 960 after outer padding, history lane and gutter. At 390px history becomes a stacked section and the work lane is 350px. No page-level horizontal overflow was measured. Labels group inputs; generation is the primary action; save/discard are contextual. Text areas have useful minimum heights and long output remains editable.

Interaction integrity: observed pass for loading, generation, save feedback, history selection and dirty-output protection. Keyboard Enter activated discard; focus restoration to output is implemented. Backend failure paths are verified by HTTP tests. This is not a complete accessibility audit. The source-backed checks from the skill are WAI content structure (labels/relationships), WCAG keyboard/focus and reflow; spacing and typography judgments are design observations, not assertions of WCAG conformance.

## Evidence and limits

[Setup](evidence/personal-assistant-example-2026-10-31/setup.png), [desktop synthetic test response](evidence/personal-assistant-example-2026-10-31/desktop-test-response.png), [narrow synthetic test response](evidence/personal-assistant-example-2026-10-31/narrow-test-response.png).

No real Niu credential or paid model workload was used. Live model compatibility, actual response quality, timings and customer charges require a separately configured accessible model and agreed test budget. The example is loopback-only development source, not an authenticated public deployment. It uses buffered responses; streaming is a documented extension. Source and tutorial links are not published until the corresponding source changes ship.

## Follow-up: actual local Niu path

Copied current source into a fresh standalone directory and ran cached npm ci
(114 packages), frontend build and both HTTP tests successfully. The example
used a newly issued ordinary workspace key restricted to one loopback fixture
model, with no management capabilities. A separately configured own-account
Provider supplied deterministic responses through the actual local Niu gateway.
Two explicitly bounded successful calls were observed, with max_tokens1200 and
no external upstream. The Niu operation records retain the harmless
personal-assistant-example task tag and confirmed completion. These responses
verify transport/flow, not real model quality, production prices or performance.

Browser generated from the included notes, edited/saved the result, restarted
the actual app process, reloaded and reopened the retained edit from SQLite.
The original seven-column database migrated without losing the prior result.
The backend now retains returned Niu attempt references in work records, including
failed responses where available, so an authorized agent can query generation
evidence without human identifier relay. Tests verify reference persistence and
server-only secrets. A second bounded request verified the real saved reference
against Niu's generation endpoint; unknown customer charges remained null.
Internal IDs were absent from visible browser text.

Fixed the Review in Niu destination to follow the configured Niu origin instead
of always opening hosted Niu; config responses expose no credential. Fixed
categorical paid-call wording to may incur charges. After revoking the test key,
a new explicit attempt showed the real401 recovery message, persisted failure
and made no further model call(the loopback count stayed2). The earlier edited
result remained reopenable. Ordinary key access to pool management returned403.

Inspected final desktop and390px rendering; page width/scroll width390px, no
visible internal IDs. Stopped owned app/upstream processes, revoked its issued
key, removed its private credential and disabled its fixture Provider. Saved
work remains only in the disposable test directory. No external model request
or publication was performed. Live Provider quality/billing remains a user-task
qualification, not evidence inferred from this deterministic transport check.
