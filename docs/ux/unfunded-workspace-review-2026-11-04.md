# Unfunded workspace access review

2026-11-04. Tracking: `niu-17x`, related `niu-ya50.3`. Scope: an existing workspace in a resale-mode development installation with currency configured and no available merchant or funding. This is not hosted-candidate acceptance.

## Outcome and evidence

Before the change, an authenticated member opening the workspace overview saw the service-setup screen instead of the page. After removing the whole-page gate and permitting authorized reads of saved request and generation history, the same account could open the overview, API key list, Logs, Generations, and agent connection entry. The empty request and generation histories rendered their own empty states. A direct current-input HTTP check returned 200 for the member's history reads, 401 without credentials, 403 for another organization, and 503 for a draft write while payment setup was unavailable. Those observations do not establish the behavior of every history endpoint, funded account, or other role.

The OpenRouter keys reference redirected an unauthenticated visitor to sign-in, so its authenticated key-management behavior could not be compared. Its public Chat page was accessible without a setup wall. No new layout was introduced. Niu's existing desktop navigation and content hierarchy were retained. At 390 CSS pixels the overview had matching viewport and document widths; at 900 CSS pixels Logs had no page overflow with navigation toggled. Logs filtering opened and Escape dismissed the menu. These checks support bounded rendered integrity; they are not a complete accessibility or visual-system audit.

The [NN/g usability heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/) support keeping available work accessible and presenting errors at the affected operation. The [WAI-ARIA dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/) informs keyboard dismissal of the inspected menu, while [WCAG 2.2 reflow](https://www.w3.org/TR/WCAG22/#reflow) informs the narrow-width check. These sources are criteria, not proof of broad conformance.

## Remaining limits

Workspace creation still has its own payment-readiness requirement in the backend and UI, and paid execution remains separately gated. Assess creation policy and the remaining supported saved-data surfaces before treating `niu-17x` as complete. Verify real retained records, other authorized roles and organizations, unavailable readiness service, direct browser revisit and the deployed candidate. The independent final-artifact evidence required by the repository has not been collected for those branches.
