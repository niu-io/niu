# Generations session checkpoint

Reviewed 2026-10-09. This qualifies a navigation and saved-history subset, not the complete release or a live video channel.

Generations uses one entry point and shared saved-session history. Chat and Video entries use distinct icons and open their respective content pages. Video is a task category alongside Reasoning, Build and Writing in the new-generation content; there are no Chat / Video navigation tabs or workspace-first selection step. API-key selection retains the key's workspace authorization and billing scope.

## Verification

- Dashboard type checking passed.
- Four focused suites passed 54 tests: shared history, Video, Chat and workspace navigation. Two additional Chat regressions then passed with the complete 39-test Chat suite: an explicit older-session URL opens that session instead of the latest one, and an unavailable session reports an error even without a saved draft.
- Browser review on the development server covered the new-generation task choice, Video page and return action, shared saved Chat history, canonical legacy-route redirect, key-choice menus and session title restoration. The unavailable-session alert appears above the task content, where it is visible without scrolling.
- Shared history tests cover cross-workspace links, pagination under the original key and rejection of late responses after scope changes.

## Remaining qualification

The packaged server now explicitly serves `/generations`, including Video query
parameters, alongside the legacy `/chat` entry. Four native static-site tests
passed on 2026-10-09, covering single-origin route ownership, community operation
without marketing artifacts, catalog isolation and entry-document revalidation.
The package lifecycle harness now checks both Generations entry variants. Its
11 prepaid/recovery unit checks passed; this does not establish a completed
container run. A fresh frozen-source image is being qualified separately.

Follow-up checks cover partial workspace/key read failures: accessible sessions
and keys continue loading after other scopes fail, inactive keys are excluded,
and late responses cannot restore a previous scope. Session search is a compact
icon with a dismissible panel that preserves its query. Video is a task category,
not an individual example task. The complete isolated dashboard snapshot subsequently passed all 544 tests
and TypeScript checking; see the [snapshot record](dashboard-automated-verification.md#generations-and-filtering-snapshot--2026-10-09).

No upstream video generation was submitted in this checkpoint. Complete live submission, results, charge reconciliation, history management across ordinary roles, and responsive release acceptance remain open. Existing immutable package evidence predates these UI changes; a new package qualification is required before release.
