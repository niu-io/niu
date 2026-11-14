# Chat draft navigation verification — 2026-11-14

Finding: `niu-mm90.47`, related to workspace route finding `niu-mm90.45`. Starting release revision: `cb0e2790`. This correction uses only a dedicated review workspace's unsent drafts, with independently confirmed zero customer spending limit and a policy blocking all model requests. No model request was sent.

## Current-input trigger and correction

On actual staging, entered a baseline draft, independently confirmed it in the backend, then changed the text and immediately followed API keys. At 551 ms after the edit, an independent authenticated GET still contained the baseline rather than the latest text. The debounce and request were canceled when the composer unmounted.

SPA navigation now waits for the current backend draft to be confirmed. A failed or uncertain save retains the composer and offers Stay here or an explicit Leave without saving choice; a known retryable failure can offer Retry saving. A potentially accepted write or revision conflict still requires explicit reconciliation with the saved draft rather than a blind overwrite. A workspace switch changes its selected scope only when navigation commits, preserving the source composer during that save. Input controls wait for draft restoration, with a visible loading state, so an editable-looking cached prompt cannot race the backend load.

Inspected the actual Visual Studio Code web editor's unsaved untitled-file close interaction as the mature reference: save, cancel and explicit discard, with the consequence stated. Only a disposable untitled editor was changed, then discarded. GitHub's editor required sign-in and was not used as visual evidence. Niu retains its own installed Dialog/Button primitives, tokens and composer layout. The [React Router navigation blocker](https://reactrouter.com/api/hooks/useBlocker) supplies navigation control; the UI is composed directly at the existing view call site. The browser before-unload safeguard is separate from SPA navigation; its native prompt interaction has not been accepted by this record.

## Local actual-data verification

Using the candidate against the current staging backend, editing and immediately following API keys saved the latest text; an independent authenticated GET returned that text and a new revision. With 900 ms added request latency, editing and switching to Default preserved the latest source-workspace draft before the destination restored saved Chat 1008. Switching back restored that same latest draft.

Blocked only the review page's draft requests after restoration. Leaving the route exposed Draft not saved, retained the text and left the generation route mounted. At 390 px its settled dialog fitted the document width and clearly separated staying from discarding. After unblocking, Stay here → Load saved draft restored the confirmed backend version. A second interrupted edit left the backend unchanged in an independent GET; explicitly choosing Leave without saving reached API keys, and revisiting restored the existing saved version rather than the discarded edit. The 1024 px dialog was also inspected with navigation present; text and actions remained within the content lane.

The shared visual structure remains a reading surface with its fixed composer, left session history and secondary settings popover. No new permanent panel or decorative layout was introduced. Applicable criteria are the UX review skill's source-backed user control, status visibility, error recovery and responsive integrity guidance, [NN/g usability heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/), and the [WAI-ARIA dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/). Current-input interactions and independent final artifacts provide evidence; fixture outcomes provide none.

## Existing settings finding

Revalidated `niu-mm90.25` alongside the actual OpenRouter Chat Room settings open state. Niu's composer-anchored popover explains temperature and 24-hour payload retention/new-request scope. The settled Escape interaction closes it and returns focus to Chat settings. Reject the earlier proposal that a temporary settings overlay must never overlap example cards: the examples remain available on dismissal, and the user explicitly requested restraint on layout work. Existing 320/390/desktop verification and this current 390 px open-state inspection support retaining the established pattern. No settings value or model invocation was changed for that observation.

Hosted acceptance of the draft correction and final review-data cleanup remain pending its deployment. Saving after a known non-conflict server refusal, real cross-tab revision conflict, and the native before-unload dialog are not claimed as end-to-end verified here.
