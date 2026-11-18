# Saved Video preview admission — 2026-11-18

Tracking: `niu-5zx0`; related reliability finding `niu-mvhk`.

On hosted core `c2d3634e`, opening a session with eight actual saved videos caused
the newest result to show Downloads are busy. Explicit restoration recovered it.
A subsequent fresh-cache browser trace showed all eight content fetches starting
within one millisecond. That warmed-service run returned eight HTTP 200 responses;
it does not reproduce the original rejection or prove its precise cause.
The backend reserves a maximum video buffer before downloading and rejects excess
admission. Its resource protections must remain intact.

The shared browser media cache now queues uncached body reads with two active slots.
A slot lasts until the body has been consumed. Queued work is removed on abort;
active work releases its slot when its reader finishes or rejects. Cache hits and
deduplication retain their existing behavior. Explicit Video result refresh uses
the same limiter. No submission, automatic retry, billing or backend limit changes
are included.

## Actual current-input verification

The current source browser used the real staging backend and the existing saved
session. Eight artifacts loaded in pairs; all eight players reached readyState 4
with no media error. All eight downloaded MP4s fully decoded independently.
The four most recent downloads matched the previously independently verified API
hashes in [the response recovery record](video-submit-response-recovery-2026-11-18.md).
No video generation was submitted.

With an empty disposable media cache, leaving after two download starts prevented
any further queued content request. One started request recorded AbortError; the
other had already received headers. Returning through the actual session link
loaded all eight videos again, demonstrating recovered queue capacity. No claim
is made that abort cancels upstream processing already started.

The sibling Assets preview loaded its existing saved workspace video. Its download
fully decoded as H.264/AAC, 854×480, 3.018 seconds. Escape closed the preview and
restored focus to the named file trigger. The local browser signed out through
the account action and returned to Login. An initial diagnostic logout request
without the product authentication header returned 401; that is not a product
logout defect.

## Bounded UX review

The existing preview layout and controls are retained. Under the ux-review skill's
[NN/g status, user control and recovery criteria](https://www.nngroup.com/articles/ten-usability-heuristics/),
queued results continue showing their loading state and navigation cancels obsolete
work. At 1024×900, expanded workspace/history navigation leaves approximately
464px for the session; the first video is 388×218px. At 390×844, the video is
362×204px with 14px side insets. Screenshots were visually inspected: result,
playback and download remain grouped; the fixed composer remains accessible and
neither document has horizontal overflow. No new visual pattern is introduced.

Type checking, lint, i18n and production packaging completed as bounded static
checks. Fixture outcomes are disregarded. Exact hosted-fix acceptance and direct
uncached-server rejection reproduction remain open. During the run, key loading
and the gateway briefly became unavailable before automatic recovery; subsequent
readiness/auth-config requests returned 200. This remains separate reliability
evidence, not a claim that the queue resolves gateway availability.
