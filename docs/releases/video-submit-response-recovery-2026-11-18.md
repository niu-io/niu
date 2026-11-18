# Saved Video submission response recovery — 2026-11-18

Tracking: `niu-j993`; related `niu-qycy` and release gate `niu-nrcn.5`.

## Actual defect

With source `8dfa9c6a`, an actual two-second Wan request reached staging and
returned HTTP 202. A task-local forwarding proxy then closed only that response,
after independently reading the original saved intent as dispatched. It matched
the dedicated key and exact test prompt; no upstream response or task was mocked.
The browser received HTTP 502, retained the prompt and left Generate available.
The composer allocated a new intent on its next invocation. No retry was made.
This was a genuine ambiguous-response recovery defect with a duplicate-generation
risk, not evidence that a duplicate charge actually occurred.

## Correction

Once the actor-private request and its session turn are durably prepared, the
composer locates its readable `input-…` reference in the current session URL.
It retires only the matching backend draft before submitting. The saved request
then owns the input, including when the response is lost or the browser reloads.
An unresolved reference disables fresh generation and exposes Check status and
Open saved request. Status recovery reads that original intent, verifies its
session binding and uses the existing saved-request resolver to focus the result.
It never calls submission. A matching retained draft from the older flow is
cleared with revision protection only after the original job is confirmed.

This reuses Niu's existing request, session, draft-CAS and readable-result contracts;
it adds neither browser-only durable data nor a new upstream retry mechanism.

## Current-input execution

Three serial requests used one dedicated, one-hour, Wan-only key and the existing
finite operator-approved video budget. Each requested 720p, 16:9, two seconds.
The current public Provider price entry was read before submission; it is not an
account invoice. Owner-funded accounting remains explicit, with unknown Niu charge.

The first request (`run-1113`) completed normally. The test driver's draft preflight
observed an older 480p save before the 720p edit had finished persisting; its
assertion prevented arming the response interruption, but a separately sequenced
browser command still submitted. This was a verification-driver sequencing error,
not a product failure. The actual output was 720p. Subsequent arming and submission
were separate dependent steps, after confirmed exact backend draft readback.

The second request (`run-1114`, `input-1005`) reproduced the pre-fix defect. A
same-task Provider refresh recovered its final result; no generation retry occurred.
The corrected status action later read that original intent and cleared its matching
retained draft. This compatibility recovery is distinct from the fresh post-fix run.

The third request (`run-1115`, `input-1006`) exercised the correction with a new
input and a new one-shot response interruption. Staging returned HTTP 202 and an
independent original-intent read showed dispatched. The browser retained
`?pending=input-1006`, an empty composer, disabled Generate and the recovery actions.
Reload preserved the reference and empty draft. Check status recovered the same
job; it reached succeeded and played in the browser without resubmission. Opening
the saved request also resolved to the original result. Keyboard Enter on Check
status resolved to `#run-1115` and focused that result element.

Independent key inventory remained exactly three requests throughout recovery.
No replacement request appeared. The final backend draft was empty at revision 65.

## Independent artifacts

All three downloads fully decoded as H.264/AAC, 1280×720, 30 fps, 2.020 seconds.
Extracted frames were inspected and matched the orange, cyan and magenta cube
inputs. The final browser video had readyState 4 and no media error; its download
was byte-identical to the independently downloaded API artifact.

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| Orange | 1,788,758 | `c49ed9b4dc0ceef53e3ff96acbf10cc9e24ed07494d4bcbeda2f921d05d23d39` |
| Cyan | 1,656,786 | `3caa1ffea7ec564903bf6e8ad7132c8fb52affc17946bf5e1c0fe8e6c818ef7c` |
| Magenta, API and browser | 1,709,731 | `25798954247fe56f0dd5c06f21352da2bbd3fa43a0061eca35135eaceb98ecae` |

The dedicated key was revoked (HTTP 204) and independently denied (HTTP 401);
its local plaintext token was removed. Browser logout returned HTTP 204. The
one-shot proxy modifications were removed and the original forwarding service
restored. Private request receipts, media and screenshots remain outside the tree.
This brings this release verification series to twelve video requests and
25 requested seconds. It is not an exact Provider expense statement.

## Bounded UX review and limits

The correction follows the ux-review skill's source-backed
[NN/g user control, status and recovery criteria](https://www.nngroup.com/articles/ten-usability-heuristics/)
and Niu's existing saved-request recovery pattern. The recovery warning and actions
remain beside the affected composer, while the existing saved video stays readable.
At 390px both recovery actions and disabled generation are visible. At 1024×900
with navigation/history open, the composer occupies 464×186px, without document
horizontal overflow; warning, actions, prompt and model controls remain grouped.
A collapsed-navigation screenshot captured a transition and is not used as proof
of the settled collapsed layout. The original full composer and result resolver
were operated as sibling references, including keyboard focus to the original run.

These observations qualify the actual response-loss and read-only recovery path.
Preparation-write interruption before a readable saved reference is returned,
settled collapsed-navigation inspection and exact hosted-candidate acceptance
remain outside this evidence. The separate unquoted Seedance execution scope is
not qualified by these configured Wan runs. Fixture outcomes are disregarded.

## Preparation-response interruption follow-up

The composer now derives internal intent and turn identities from the confirmed
backend draft scope and revision. Repeating the unchanged confirmed draft after a
reload therefore resumes its existing preparation. Editing or retiring that draft
advances its revision. The browser member credential is a stable session sentinel;
no private input or credential is added to the readable URL. If preparation cannot
be confirmed, the composer explains that the retained unchanged draft can be retried.
This guarantee requires a confirmed backend draft; it does not qualify the separate
best-effort path when draft persistence itself is unavailable.

An actual current-input run interrupted the first intent PUT response after staging
returned HTTP 200. The saved request was `input-1007`, still without a generation.
Reload restored the exact backend draft at revision 66. A second one-shot response
interruption on explicit retry returned the same intent, reference and revision.
Independent scoped request inventory remained zero. Removing the interruption,
reloading and explicitly submitting the same input resumed that request and bound
one session turn to `run-1116`. It reached succeeded. Independent inventory contained
exactly one request, so neither preparation interruption generated a replacement.

The requested lime cube appeared in the extracted frame. Both browser and API
artifacts were byte-identical: 1,530,812 bytes, SHA-256
`677ec544d2c4e8cc615fb934786b583d0022565b02fc24113d5608e7e71771b0`.
Independent probing found H.264/AAC, 1280×720, 30 fps and 2.020 seconds; the entire
file decoded without error. The browser reported readyState 4 and no media error.
At 390px, the retained input, recovery guidance and generation action fit without
clipping. This is preparation recovery evidence, not the missing settled layout
inspection of the different pending-submission warning.

The scoped temporary key was revoked with HTTP 204 and independently denied with
HTTP 401; its plaintext token was removed. Browser sign-out reached the login page,
and the ordinary forwarding proxy was restored. The verification series now totals
thirteen video requests and 27 requested seconds, not an exact expense statement.
One administrative inventory read returned HTTP 503 before a later successful read;
that observation remains reliability evidence and is not erased by the retry.
An initial diagnostic incorrectly used inference/installation authentication for
an actor-private metadata route and received 401/404; the authenticated browser
read of that original metadata returned 200. Those diagnostic errors do not establish
product authorization defects. Exact hosted-candidate acceptance, the earlier
settled pending-warning layout check and unquoted Seedance execution remain open.
