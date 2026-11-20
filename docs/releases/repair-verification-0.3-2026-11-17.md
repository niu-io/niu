# Niu 0.3 repair verification — 2026-11-17

This continues the [earlier readiness run](release-readiness-0.3-2026-11-17.md).
The new-key handoff and public-document artifact check were repaired. A paid video
completed through the supported owner-funded workflow. This does not qualify a
formal release. Current execution state belongs in Beads: `niu-zhlk`, `niu-qety`,
`niu-gzpa`, `niu-16wj`, `niu-pfsr` and the retained parent `niu-nrcn`.

## Source and evidence boundaries

The UI/documentation candidate is `2ec290daa4525a3277c3e49dae46395674a9ac96`, deployed
to staging before the hosted key check. The separate container publication candidate
is `4475680588a6d199b6d8d2593376d7f1c9209497`; its local ARM64 image was executed,
but it was not published as an accepted version. The video was submitted on core
`23cae63a`; recovery, final retrieval and replay completed after deployment of
`2ec290da`. Required CI workflows execute fixture diagnostics; their outcomes are
disregarded. Conclusions below use current inputs, actual services, saved records
and independently inspected artifacts.

## New-key handoff

Newly issued session entries lacked slugs and hid saved key metadata. The route
could resolve a key while calling its slug invalid. Saved backend metadata now
owns slug resolution and availability; issued secrets are only loading hints.

The local candidate used the real staging backend: create a restricted key in the
Dialog, follow Open Generations and submit without reload. The answer was
`HANDOFF_FIXED_20261117`. Independent request/chat reads agreed: completed,
17 input tokens, 10 output tokens and USD customer charge zero.

The hosted candidate repeated creation and direct handoff with a new free-model
key. Submission was enabled without reload. The first request received upstream
HTTP 429; the saved record conservatively retained `may_have_executed`, unknown
usage and `not_charged`. One spaced explicit retry returned
`HOSTED_HANDOFF_FIXED_20261117`, 18 input tokens, 91 output tokens and USD customer
charge zero. Independent saved-chat readback retained both outcomes.

Revocation returned 204; independent inference authentication returned 401.
The revoked slug displayed textual recovery and disabled Send. The local run also
checked an unknown slug and removal from the refreshed chooser. Only the newly
created text conversations were deleted; subsequent reads returned 404.

Existing Niu layouts and shadcn controls were retained. Desktop, intermediate
1024px and narrow 390px views were inspected; narrow document width equaled the
viewport width. Errors, responses and the composer remained readable; menus opened,
selection persisted and Escape dismissed menu/settings layers. The error review
follows [WCAG 2.2 SC 3.3.1](https://www.w3.org/WAI/WCAG22/Understanding/error-identification.html).
Responsive inspection uses the principle in
[SC 1.4.10](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html);
390px inspection does not establish full 320px/400%-zoom conformance.

## Public documentation artifacts

The public handler contract intentionally filters platform/Provider operations.
CI incorrectly compared it with the full handler inventory: actual built output
had 225 paths versus 331 in that inventory. Two job logs reported runner cancellation
at that step; its resource-level cause was not established.

The corrected step compares built contracts with their intended public sources,
uses bounded diagnostics, checks HTML entrypoints, resolves local references and
independently rejects administrative path families. A fresh build verified 225
public handler paths and 211 full-public-contract paths. The corrected
[documentation CI run](https://github.com/niu-io/niu/actions/runs/44100750497)
completed on the candidate. Hidden operations were not restored to make CI pass.

## Actual paid video and recovery

Source and live schema inspection corrected the earlier interpretation of HTTP 501
estimates: owner-funded Ark/BabelArk generation supports unquoted confirmation.
Missing estimators do not prove submission/result retrieval is broken. No fictional
estimator or price was configured.

After finite spending authorization, the actual
[BabelArk model detail](https://api.babelark.ai/models/wan3.0-video) showed advertised
USD 0.0442 per second at 720p. One text-only request used 3 seconds, 720p and 16:9,
depicting a red wooden cube on a white tabletop. This advertised price is not an
effective account quote or final invoice.

The intent was dispatched once. A Provider check recovered unknown status to
running; reload recovered the same session/task, and the final state became
succeeded across the deployment transition. Independent request readback showed one
`confirmed_completed` operation. Canonical intent replay returned the original
successful job (202); the key's request list still contained exactly one operation.

Downloaded MP4: 2,310,373 bytes; SHA-256
`c652ab8cc7e82e51705fac8376baa4d998229d460bbfb1905b2ef06698e67aba`.
FFprobe identified H.264, 1280×720, 30 fps, AAC and 3.018005 seconds. Full FFmpeg
decoding succeeded and an extracted frame was visually inspected. Browser video
readyState was 4 without a media error. Desktop/390px views were inspected; the
narrow player measured 362px within the viewport.

Billing remained `owner_funded` with null Niu charge, price, output estimate and
usage. This does not establish free upstream service or an exact Provider charge.
The paid result/session was retained for review; the temporary key was revoked and
independently rejected with 401. Other video Providers, effective estimates and
commercial charging remain outside this execution.

## Container distribution repair

The workflow previously uploaded installer/client assets without building the
referenced container. The prepared repair builds both Linux architectures, checks
anonymous registry metadata/content hashes and source labels, then publishes
`IMAGE_DIGEST` with checksums. Installation uses that digest and refuses a different
source build. Legacy releases retain a warned remote tagged-source fallback;
arbitrary local source is no longer mislabeled as the requested version.

The actual ARM64 image at `44756805` had matching source/revision labels; executing
the binary returned that full commit. Against fresh isolated PostgreSQL it became
ready, created a current-input organization, returned it through the API and
contained the independently queried SQL row. Installation HTML was served; runtime
UID was 10001. Temporary container/database/network resources were removed.

This is local package evidence. Anonymous retrieval of an accepted published patch,
AMD64 startup and final tag/source/bundle/image correspondence still need the final
artifacts. Preserve v0.3.0; publish corrections as a new patch after the retained
staging gate. The public-image finding is failed prebuilt-image retrieval, not proof
that every legacy source-build installation path fails.

## Additional effective video dimensions — 2026-11-18

Two additional current-input BabelArk Wan tasks were submitted sequentially under
the existing operator budget, each at 720p for two seconds. The current public
model page lists USD 0.0442 per second for 720p: advertised total USD 0.1768 for
these two requests, or USD 0.3094 including the earlier three-second run. These
figures are not a Provider account invoice. The page did not list a 480p quote,
so no 480p paid request was made.

Both original saved jobs progressed from uncertain status to success through
explicit status refresh; no generation retry was issued. Independent scoped
request inspection contained exactly two records for the temporary credential.

| Requested ratio | Downloaded artifact | Independently inspected output |
| --- | --- | --- |
| 9:16 | 1,608,568 bytes; SHA-256 `cf9c79ace30c9f0a333035faec9e97a1130b60a5b40a2ea0fbf0d3aba3914466` | H.264/AAC, 720×1280, 30fps, 2.020 seconds |
| 1:1 | 1,628,572 bytes; SHA-256 `9e9b9c68f6ee06bad317ae66db6f2f78d24c7b03fa844eb15fdf5d786d3a8c6f` | H.264/AAC, 960×960, 30fps, 2.020 seconds |

Both complete files decoded successfully, and extracted frames were visually
inspected. In particular, the square output is 960×960, not a guessed 720×720.
Together with the earlier landscape artifact, all three configured 720p ratios
now have observed output dimensions. This does not establish the 480p mappings
or other Providers' behavior. No schema was modified.

Billing remained `owner_funded`, with null usage, price and customer charge. The
one-hour model-restricted credential was revoked with HTTP 204 and independently
rejected with HTTP 401 afterward; its token was removed from local verification
state. Saved results remain durable. These observations precede the next
integrated staging deployment and do not substitute for its acceptance.
