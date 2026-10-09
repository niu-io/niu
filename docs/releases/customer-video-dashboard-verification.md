# Customer Video dashboard checkpoint

The signed-in Video screen is available from Chat at `/chat?mode=video`. It uses the selected workspace's active API keys through the authenticated dashboard bridge; users do not paste key secrets.

Implemented scope:

- Scoped model discovery supplies configured text limits, controls and valid output pairs. Unsupported routes show an honest empty state.
- An estimate must match the current request before submission. Input changes invalidate it. The UI distinguishes an estimate from the maximum reservation and final customer charge.
- Paid submission is explicit, guarded against duplicate clicks and never automatically retried after an uncertain response. Read-only sessions can estimate but cannot submit or refresh upstream status.
- Saved job history, status, customer billing and measured submission/query timings use backend APIs. Logs links retain workspace scope. Internal identifiers are not displayed.
- Desktop uses Input/Result columns; phones use Input/Result tabs, following the inspected fal video playground. The history sidebar becomes a sheet with an explicit close action. Status reloads preserve prompt, controls and settings expansion.

Verification:

- 36 affected Video/Chat tests passed after the final changes, including changed-request quote invalidation, duplicate-click protection, uncertain submission, reader permissions, request validation and settings preservation across status reloads.
- TypeScript project checks passed.
- Browser inspection covered the actual signed-in route and isolated fixture states at desktop and 390px widths. The temporary visual fixture was removed; it did not configure a production Supplier, dispatch paid requests or prove backend durability. Mobile measured document width matched the 390px viewport.
- The broader dashboard suite previously passed 425 tests across 69 files before the final pane/settings changes; the affected 36 tests were rerun afterward.

This does not close V16 or any release gate. Safe preview/download, last-frame retrieval, media inspection/reference inputs, live channel qualification, complete lifecycle timing and packaged acceptance remain open. The personal OpenRouter text demo does not qualify video supply. A successful saved job currently states that preview/download is unavailable rather than fabricating a result.
