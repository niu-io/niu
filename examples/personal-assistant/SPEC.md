# Meeting notes to useful work

This is the concrete reference outcome for the broader personal-assistant spec in the Niu tutorial.

The user pastes notes and a desired outcome, generates one action plan and follow-up draft through an explicitly configured Niu model, edits and saves the result, and reopens it later. Notes and saved results belong to the local application's backend. No message is sent and no calendar event is created.

The coding agent handles setup and model discovery through Niu MCP. The user enters credentials locally, agrees to a bounded live test, reviews the application and checks Niu Logs. No model is selected implicitly. This example uses buffered Chat Completions; adding streaming and measuring first-output latency is an extension for the coding agent, not an implemented claim.

Use `fixtures/meeting.txt` and `fixtures/acceptance.md` for the first live acceptance. Verify save/reopen after restart, a failed request, preserved unsaved output when switching work, keyboard actions and a narrow viewport. Inspect the matching Niu request and customer charge through Niu/MCP; unknown charges remain unknown. Persist any Niu attempt reference returned with the response in backend work records so the coding agent can retrieve diagnostics directly, including after restart. Never render internal IDs in the interface. Missing references and unknown outcomes must remain explicit. The app itself does not fetch generation diagnostics.

Keep the example independently installable with its own package lock, server-only credentials and SQLite persistence. Bind it to loopback. Public deployment and third-party services require their own implementation and review.
