# Video estimate failure recovery — 2026-11-18

Bead: `niu-g1d4`. Candidate changes are based on release `373fbb41`.
This is bounded local verification, not final hosted release acceptance.

## Trigger and correction

On hosted core `9fd281e5`, an unchanged owner-funded Wan draft issued three
unsupported automatic estimates at 3.86, 5.01 and 6.17 seconds without user action.
A failed estimate cleared the busy state and scheduled the same operation again.
The candidate remembers the attempted input and access context, skips automatic
estimation for known owner-funded models without output metadata, and preserves
explicit manual retries. The missing-estimator message has a Chinese translation.
Dismissing the Provider-charge confirmation restores focus to its actual trigger.

## Actual execution evidence

The candidate dashboard used the actual staging API for the existing unquoted
model. With the resource timing buffer enlarged before observation, idle input
made no estimate requests. Each of two explicit Estimate clicks made one HTTP 501
request, with no repeated call during the subsequent bounded observation. The
prompt and Provider-charge warning remained visible. Cancel and Escape both
restored Generate video focus; neither submitted generation.

A separately installed current native gateway and PostgreSQL used supported
internal mode, a personal Provider, a real workspace and a short-lived model-limited
key. Its configured output mapping was 720p, 16:9, 1280 by 720, with the
OutputSecondsV1 estimator. This local mapping does not qualify upstream behavior
or reduce the hosted model's advertised capability scope. No upstream video was
submitted.

After the actual Provider was disabled through its administration API, editing
the prompt produced one automatic HTTP 404 estimate. At 13.82 seconds after that
request, there was still exactly one estimate. A manual Estimate click added one
404. After re-enabling the Provider and changing the prompt, a new automatic
estimate returned HTTP 200. Approximately 24.83 seconds later there was still
only that one successful recovery estimate. The browser retained the edited
prompt and displayed 720p, 16:9, 3.0 seconds and Provider-account billing.
Independent HTTP inspection confirmed an estimated quantity of exactly 3 seconds,
1280 by 720 output, owner-funded mode and null customer charge fields. Browser
network observations contained draft writes and estimates, with no job creation.

Stopping the entire native gateway was also exercised. It opened the global
Gateway unavailable dialog; restarting against the retained database restored
the composer and prompt. Because that dialog prevented editing, this interruption
was not used as evidence for the single-estimate failure branch.

## Bounded UX review

This local Operate-surface review follows the ux-review skill's recovery and
state-legibility criteria. Nielsen's user-control and error-recovery heuristics
support explicit retry and preserved input; the WAI-ARIA dialog pattern requires
focus restoration after dismissal. Actual Cancel and Escape observations satisfy
that focus criterion for this confirmation. The alert is localized, the billing
warning remains distinct, and the repaired flow does not generate implicitly.

Rendered 1440- and 390-pixel views were inspected separately from network behavior:
alerts and prompt remain readable, the existing action hierarchy is retained,
and the narrow confirmation has visible cancellation and primary actions without
horizontal overflow. OpenRouter's actual anonymous chat surface was inspected as
a reference for explicit model and submission controls; its estimate failure
behavior was not inspected and is not claimed as a reference for this repair.

Sources: [Nielsen usability heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/)
and [WAI-ARIA modal dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/).

SDK compilation, dashboard route type generation, TypeScript and lint completed.
Fixture results are not evidence. Exact merged hosted-candidate acceptance remains
required before closing the bead or qualifying this work for release.
