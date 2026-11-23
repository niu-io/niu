# Staging screenshot review, 23 November 2026

Review record for Beads epic `niu-p8dy`. Observations below describe the deployed interface on the review date. Beads holds current dispositions and acceptance criteria. Paired frame numbers refer to private screenshots at 1280 × 850 and 390 × 850. Authenticated screenshots contain account and commercial data and are retained outside the public repository.

| User task | Frames | Observation | Beads |
| --- | --- | --- | --- |
| Start a workspace | 00, 08, 47 | Overview repeats key creation, while the Keys placeholder promotes showing all keys and the empty log suggests opening chat. | niu-p8dy.5 |
| Read an empty management list | 08, 47 | The short empty region leaves most of the remaining list viewport below it. | niu-ua6 |
| Understand zero usage | 11, 12 | Four Usage placeholders repeat the absence of requests. Billing encloses a single empty message in a prominent solid panel. | niu-ox6q, niu-ua6 |
| Choose a model and try it | 06, 07 | Six full-width attribute rows push the trial action to the bottom of the narrow first viewport. Equivalent destinations use different trial labels. | niu-p8dy.9, niu-p8dy.7 |
| Review shared funds | 41 | The narrow view repeats the billing title and uses adjacent labels for the available balance. | niu-p8dy.3 |
| Configure routing, evaluations and events | 15–17 | Empty pages direct the reader to an agent. Events uses three different terms for that agent in succession. | niu-p8dy.7, niu-p8dy.10 |
| Inspect Provider operations | 63–66 | Usage, Members and Settlements sit outside the visible three-tab navigation. English instructions interrupt Chinese content. Profile settings include an inline error below valid details. | niu-p8dy.2, niu-p8dy.4, niu-p8dy.7 |
| Open an administration bookmark | 68–70 | Customer detail, registration approvals and registration policy render through in-app navigation. Direct entry to the latter two failed. | niu-p8dy.1 |
| Publish a price | 22, 72, keyboard-1 | Price units wrap into fragments at 390px. Escape dismisses the publication dialog and leaves focus on the document body. | niu-p8dy.10, niu-72f7 |
| Discover models and sign in | 80, 81, 83 | Models and Docs change sides in the desktop header. The anonymous login form has no visible password recovery or support action. | niu-p8dy.5, niu-p8dy.8 |
| Compare model platforms | 51 | The first comparison below the three-platform heading is a benchmark of a different group that excludes OpenRouter. | niu-la36 |

The reference model catalog at OpenRouter exposes model discovery, comparison and per-model attributes directly. Niu's workspace-specific authorization, customer charges and agent connection still require their own explicit states. A saved key, published model or available trial action alone cannot establish successful invocation.

Screen captures of loading (frame 24), authenticated redirects to Overview (44–46), and authentication redirects during anonymous setup and connection (82, 84) establish only those states. Frame 67 separately records the populated financial report. Keyboard-only opening and Escape dismissal returned focus to the original trigger for Add Provider and Create API key. These observations cover the tested trigger paths.

On a 390px anonymous viewport, the installation contract measured 941px across the body and the inference contract measured 931px. The REST index, SDK index and first-request guide measured 390px under the same conditions (frames 900–904, `niu-t4gb`). The workspace rename dialog restored focus on a repeat check after the workspace finished loading.

At 1100 × 850 with administrator navigation expanded, the Provider model table occupied 994px inside an 812px table container. Availability changes appeared at the clipped edge of the viewport. Enabling and disabling used the same prominent filled treatment across the list (frame medium-3-0, `niu-ypbl`).

The blocked-request empty view instructs administrators to choose a saved policy even when no policy exists (tab-0-2-390, `niu-vr1v`). The empty media library repeats Add image in the toolbar and placeholder while the accompanying instruction describes saving generation results (18-390, `niu-a92e`). Resizing Platform Settings after opening Billing mode leaves its active fifth tab clipped at the right edge (tab-6-3-390, `niu-p8dy.4`).

The generation picker reports 91 models but ends after 80, with only Done in the footer (overlay-8, `niu-2wwb`). The embedded asset panel repeats the same two upload actions as the standalone library (genpanel-2). Provider Members offers portal access to representatives while the deployed Provider administration guide says no Provider login or portal is available (64 and 113, `niu-l9j`). Actual representative permissions were not established by either screen.

In the anonymous API Explorer the initial mobile frame contained a heading over an otherwise empty viewport. Once loaded, separate site and explorer menu icons appeared while the introduction referred to a sidebar (134-390 and explorer-390, `niu-umeu`). Generated REST and SDK references repeatedly show repository editing instructions before the API information (130, 133, 135–139, `niu-2eyr`). Message compatibility and event-update requirements occupy long uninterrupted paragraphs in the mobile reference (151–152, 159–160, `niu-sphd`).

In the customer row menu, neighboring actions for issuing noncash credit and viewing grant history read as the same operation in Chinese (commerce-2, `niu-huyx`). Dismissing the price-history dialog lost focus (commerce-4, `niu-72f7`). The mobile session archive opens above the existing modal history sheet and uses two large placeholders when both archive groups are empty (archive-mobile, `niu-cd2z`).

At 390 × 850 the financial report section tabs began at y=1004. Selecting Unit economics displayed an active-period count of zero while rendering 89 configured routes; the selected panel measured 7605px tall (report-tab-selected, `niu-llau`, `niu-bar7`). A missing public page produced Chrome's 404 screen with Reload as the only action (entry-1, `niu-joja`). The later anonymous invitation sign-in capture displayed recovery guidance absent from the earlier login capture. Treat the earlier captures as dated observations when revalidating fixes.

The workspace routing dialog tells newcomers to open Advanced for priority and weighting, yet those controls and numeric ranges appear with Advanced closed (configure-0, `niu-5ew8`). A directly opened REST operation dedicates 268px of the desktop viewport to a rail showing a collapsed API section without locating the operation (ref-0-1280, `niu-zo8g`). Long SDK type headings break within CamelCase words even when natural boundaries exist (ref-718-390, `niu-ek96`).

The published REST and SDK indexes linked to 461 and 476 child pages respectively. Every listed child had a screenshot paired to its final path at 1280px and 390px. The paired first-viewport contact sheets were inspected for layout variation, with full-resolution inspection of exceptions. This establishes first-viewport coverage rather than verification of every contract, selector or scroll position.

An SDK alias page displayed only the compatibility assignment and generic source/index links, with no direct link to the canonical type defining its fields (ref-847, `niu-gvkc`). Some workspace model detail pages offer a chat trial and key creation before disclosing that the model's supported inputs and outputs remain unpublished (model-2-390, `niu-57rf`).

The live catalog exposed 95 distinct workspace model URLs. All 95 resolved to their own detail paths and were inspected in desktop/mobile screenshot pairs. In 89 cases the chat trial preceded the unpublished-capabilities warning (`niu-57rf`). The second Provider had zero configured models and disabled credentials. Its empty list retained search and three zero-count filters above the placeholder (other-provider-0/1, `niu-m19q`).

## Review criteria

The financial filter and zero-key composer were assessed against visibility of system status and error prevention. Repeated upload actions and competing empty-state explanations were assessed against consistency and minimalist presentation. These are usability heuristics. The observed counts, enabled controls and button labels establish the product-specific evidence. [Nielsen Norman Group usability heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/)

For keyboard dismissal, the WAI authoring pattern recommends returning focus to the opening control when it remains available. The pricing dialog returned focus to the document body, while the tested Provider and key creation dialogs returned it to their trigger. [WAI modal dialog keyboard pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)

WCAG reflow guidance distinguishes page-level horizontal scrolling from an individual table that requires two-dimensional layout. The recorded 390px documentation measurements establish mobile overflow. A formal conformance check also requires the criterion's specified viewport and applicable exceptions. [W3C explanation of reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html)

## Evidence limits for record details

The customer detail scope tab showed one workspace and two members but labeled their combined tab with a single unexplained count of one (custtab-2-390, `niu-p8dy.7`). The review inspected overview, special prices and workspace/member tabs through the actual customer list.

The signed-in workspace had zero keys even after selecting All keys, zero requests, no saved route or evaluation, and no session in the visible history. Populated key details, execution details, saved generation runs, route inspection and evaluation results require records in an authorized staging workspace. No funds, grants or model requests were issued to simulate these business records. The open review epic retains this verification gap.

## Remediation verification on November 23

The dashboard candidate was rendered against current staging workspace data at 390, 900 and 1280 CSS pixels. With no usable key, the new chat disabled message entry and submission. The mobile key-list placeholder filled 738px below its header and offered one creation action. Opening the archive from mobile history displayed one dialog. Escape restored the history view and returned focus to the archive button. Closing the pricing dialog also returned focus to its trigger.

The local gateway served the revised customer detail from a fresh database. Opening its legacy bookmark preserved the selected tab and fragment when redirecting to the customer slug. Unknown browser routes returned an HTML recovery page with status 404 at both phone and desktop widths. Unknown API routes retained a JSON 404. The website comparison placed platform selection criteria before historical benchmarks at both widths.

These observations cover the candidate assets and local gateway. Populated records and hosted deployment have separate acceptance requirements in Beads.
