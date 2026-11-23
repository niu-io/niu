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
