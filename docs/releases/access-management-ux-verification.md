# Access management UX review

October 7, 2026. The real populated workspace directory and Add operator dialog were inspected, alongside OpenRouter workspace settings as a reference for scoped settings. Existing Niu operator controls remain in place.

Creation no longer clears the entered name before the server succeeds. Failed creation retains the name and enables retry; pending creation disables the name field. Successful creation still closes and unmounts the form. Nine operator integration tests and dashboard type checking pass, including a 503 creation failure retaining the name.

Desktop and 390px embedded route review checked the form and accessible actions without creating, revoking or changing any operator. Failure behavior is integration-fixture-qualified rather than reproduced through a live backend outage. Full role/session and narrow dropdown-open acceptance remain open.
