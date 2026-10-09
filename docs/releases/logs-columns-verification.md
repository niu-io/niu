# Logs column-control verification

Verified 2026-10-03 for the F06 table-visibility subset. Full F06 remains incomplete.

The inspected OpenRouter Logs reference puts table settings at the right edge of the header and offers column visibility and reset. Niu uses the same location and visibility/reset behavior, composed directly from the installed shadcn DropdownMenu and CheckboxItem primitives, as required by its choice-control rules. Model remains visible so each row can open request details. No unsupported Provider, caching or commercial columns were added.

Desktop defaults include the existing request columns. Mobile defaults prioritize Model, Status and Customer charge. At 390 pixels, model names and failure labels wrap while exact customer-charge text remains visible. Extra columns selected by the user remain horizontally scrollable within the table, with the settings control anchored to its right edge.

Column choices are URL view state, preserved through reload without browser storage or a saved-settings claim. Unknown column names are ignored. Reset removes the explicit choice and restores defaults for the current viewport. Filters and other URL parameters are preserved; column changes do not alter request filtering, pagination or CSV export.

Acceptance:

- All 24 Logs/content tests passed, including mobile defaults, explicit URL columns, invalid-column handling, filter preservation, no refetch on visibility changes, reset and retained-content regressions. Type checking and the dashboard build passed.
- Inspected the live desktop and 390-pixel menus, selected/unchecked states and alignment. Changed columns, reloaded, restored defaults and verified complete customer amounts plus the recorded HTTP 502 failure in the mobile default view.
- No inference calls or saved product data changes were needed. Supplier procurement data remains excluded.

Full-range sorting has [separate verification](logs-sorting-verification.md). Column reordering/pinning, saved account-wide table preferences and density controls are not implemented by this visibility subset. Complete investigation qualification remains open. An old link-navigation test expected focus to remain outside an opened modal; it now verifies the highlighted row and focus inside request details, matching the existing modal accessibility behavior.
