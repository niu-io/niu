# Search and model filtering checkpoint

Reviewed 2026-10-09. This is a rendered interaction subset of F06/F10.

Model lists retain a visible filter in the first toolbar row. Supplier model
routes place the filter on the left and refresh/add actions on the right;
narrow layouts wrap without hiding controls. The public dashboard model catalog
and Supplier price list use model-filter terminology as well.

Session history, API keys and users expose a compact Search icon opening the
installed Popover/Input controls. Closing preserves the query, an active query
highlights the trigger, and clearing an empty-result filter restores focus to
the trigger. Logs keep their directly visible investigation controls. Search
inside an already opened choice menu remains available.

The five focused dashboard suites passed 40 tests after the final filter
placement change; type checking and changed-file public-boundary checks passed.
Browser review covered populated saved sessions, models, keys, users, Supplier
prices and Supplier routes with open panels. Supplier-route controls were
reviewed at 1280px and 390px; the phone search panel stayed within the viewport,
and the final inline model filter remained accessible above the table.

Saved credentials and Supplier configuration were not changed, and no inference
was submitted. Complete responsive release acceptance remains open.
