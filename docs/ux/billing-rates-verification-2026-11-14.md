# Readable customer rates — 2026-11-14

Findings: `niu-mm90.22` and the adjacent Chat dialog focus correction `niu-mm90.44`. The earlier authorization to implement the staging review applies; this record preserves observed evidence rather than maintaining task status.

## Reference, observed problem and decision

Inspected the actual public [OpenRouter model pricing page](https://openrouter.ai/qwen/qwen3-coder), including its provider comparison and Pricing navigation. Its recognizable model identity and directly labeled input/output/category prices inform this refinement; Niu retains its own workspace shell, customer billing contracts and installed Table primitives. Private account billing equivalence is not claimed.

On staging core `2073027a`, the currency rate table showed eight columns for three actual tariffs, repeatedly displaying Not configured and zero fees. Independent authenticated reads confirmed that these records have exact zero input/output prices, null cache/reasoning categories, zero fixed/minimum fees and known empty context-tier lists. The 680 px minimum width hid prices offscreen even after columns were removed in the first local iteration. The phone header's Manage credits button also reduced its Billing title to a truncated initial.

Hide a category only when every base and known context tier explicitly reports it absent. Omitted category values or unavailable tier lists retain their columns and Unknown presentation. Hide a fee column only when every tariff explicitly reports exact zero for that fee. Preserve all prices, tier thresholds, currencies and unknown-versus-null semantics in the source data; no billing mutation or API change is involved. Use Free only for an explicitly zero input/output rate, without claiming that missing categories or unknown request fees are free. A shared TableCaption explicitly explains that categories without configured rates are omitted. Suppress irrelevant tier guidance when the tier list is known empty, and state that no per-request fees apply only when both fee columns are confirmed zero.

Remove the currency table's fixed minimum width and let model names wrap at narrow widths. Keep all configured/unknown columns available through the existing table scroll container when necessary. On phones put Manage credits into the installed DropdownMenu, preserving the direct desktop action and refresh control. This follows the user's explicit overflow-menu direction.

## Current-data local verification

Actual staging-backed currency records rendered three Model/Input/Output columns. The same known three records remained present. At 1440 × 900 the table used the full 1136 px content lane. At 1024 × 768 it measured 912 px with compact primary navigation and 736 px with expanded navigation. Full-frame screenshots were inspected for model/price grouping, aligned numeric columns, readable headers, spacing and action emphasis.

At 390 px the table measured 358 px between x16 and x374. At 320 px it measured 288 px between x16 and x304, with catalog names wrapping and both prices visible. Document widths matched their viewports. The 320 px header displayed Billing in full while its parent workspace name shortened; the lower-frequency credits action remained discoverable in the ellipsis menu. The settled open menu, Escape dismissal/focus return, credits-settings opening and return to the original Rates tab were exercised. Spending retained the real pending/unpriced state and Statements completed loading into its actual empty state without an alert. No statement, balance, tariff or credential was changed.

Viewport budget: at 320 × 700, header 56 px, workspace tabs and scope explanation occupy the next approximately 160 px, Billing tabs about 40 px, and the price rows span roughly y312–689, followed by the omission caption reachable through ordinary page scrolling. The table's three decision-relevant columns fit the 288 px lane; the actual model names use two lines rather than pushing the price out of view. At 1024 px expanded navigation, the rates table uses x264–1000 with no centered page-width cap. This is a bounded readability refinement, not a redesign of the empty space below a short list.

The UX review skill's source-backed recognition, consistency and hierarchy criteria apply; [WCAG Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html) informs the narrow inspection. These sources establish criteria rather than proving this implementation. Additional nonzero, unknown-category, unavailable-tier and populated-statement data variants were not created for this UI check and remain unverified end to end; conservative source guards preserve their information instead of inferring absence.

## Chat key dialog focus

Hosted core `41074c07` independently reproduced Escape returning focus to BODY after the selected key had settled. The candidate keeps a current action ref and restores focus from DialogContent only while that action remains connected. In actual saved Chat, local desktop Escape and 390 px Done both returned focus to the API key action without changing the selected key. This follows the [WAI-ARIA modal-dialog return-focus guidance](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/). Hosted verification remains required.

Final dashboard type/lint checks and production build completed after the settled caption and focus checks. Fixture outcomes were not used. Hosted acceptance remains pending for this candidate.
