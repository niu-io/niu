# Logs delivery status verification

Development checkpoint, 2026-10-03. F06 remains incomplete.

Logs now labels recorded HTTP errors as failed delivery even when upstream execution is confirmed completed. The existing details overview shows recorded Delivery status separately from Provider status and customer charge. Guardrail output-withheld labels retain priority, and missing delivery status is not invented.

OpenRouter's actual Logs table and Generation details were inspected as the reference for retaining a compact table and overview inside the existing detail panel. Niu retains its shared components and navigation.

A real bounded invalid-parameter request through the saved OpenRouter demo Supplier returned HTTP 502. Its saved Log showed failed delivery, uncertain Provider execution, unknown tokens and unresolved charges. Payload retention was off, the temporary key was revoked, and Supplier credentials/configuration were unchanged. Desktop and 390px detail views, successful delivery status, previous/next navigation and closing the panel were inspected in the browser.

The original detail-label checkpoint passed 16 Logs integration tests and the dashboard build. The fixture verifies a failed HTTP delivery with completed upstream execution still displays its customer charge; this combined state was verified by the fixture, not by the live upstream rejection. No procurement data or internal identifiers were added to the UI.

## Full-range delivery investigation

Logs supports exact recorded HTTP status, Unknown status and Failed delivery (recorded HTTP 400–599) filters. The same scoped filters apply to CSV exports. Usage shows delivery-status counts across the full matching range, with links back to filtered Logs; counts are read within the summary's consistent database snapshot rather than inferred from the displayed page.

Read-only live checks reconciled all 35 saved requests: HTTP 200 for 29, HTTP 502 for one and missing status for five. Exact, failed and unknown filters returned matching full-range summary and export counts. The five Unknown rows include completed Provider executions; missing HTTP status therefore cannot be treated as success, failure or absence of a customer charge. A recorded HTTP 200 likewise does not establish complete streamed-body delivery.

The OpenRouter Activity Explore aggregate table was inspected as the reference. Desktop and 390px Usage tables, known/unknown drilldowns and HTTP filter menu alignment were inspected in Niu. The menu retains the shared component's item spacing and icon gutter.

Fresh checks passed 27 dashboard/content tests, the dashboard build, 66 JavaScript SDK tests and the documentation build. Backend fixtures exercise full-range unknown counts beyond pagination, HTTP 502 alongside completed Provider execution, exact large customer charges, scoped exports and invalid status rejection. Sorting has separate [verification](logs-sorting-verification.md); generation-parameter rejection has separate [qualification evidence](inference-parameter-validation-verification.json).

Remaining: broader failure classification, trends, customer-charge breakdowns, timing and protocol coverage, and the complete consumption investigation journey. This checkpoint does not close F04 or F06.
