# Current Wan video output qualification — 2026-11-18

Related Beads: `niu-pfsr`, `niu-nrcn.5`.

Six actual Provider-backed requests qualified the configured Wan video route on
hosted core `1a32fb9e`. These were current-input requests under the authorized
aggregate video budget, not fixture runs. Every result was downloaded, hashed,
independently probed, fully decoded, and visually inspected through an extracted
frame. All artifacts used H.264 video and AAC audio at 30 video frames per second.

| Requested resolution / ratio | Actual dimensions | Duration (seconds) | Bytes | SHA-256 |
| --- | --- | --- | --- | --- |
| 720p / 16:9 | 1280 × 720 | 3.018005 | 2310373 | `c652ab8cc7e82e51705fac8376baa4d998229d460bbfb1905b2ef06698e67aba` |
| 720p / 9:16 | 720 × 1280 | 2.020000 | 1608568 | `cf9c79ace30c9f0a333035faec9e97a1130b60a5b40a2ea0fbf0d3aba3914466` |
| 720p / 1:1 | 960 × 960 | 2.020000 | 1628572 | `9e9b9c68f6ee06bad317ae66db6f2f78d24c7b03fa844eb15fdf5d786d3a8c6f` |
| 480p / 16:9 | 854 × 480 | 2.020000 | 757079 | `2fab1091ab4e92f880d3a942988859c4084aae1f2970a559cc3810476e15451c` |
| 480p / 9:16 | 480 × 854 | 2.020000 | 686079 | `8590e237fae56d626a4622e6b8f64846aa5d2e0c2fcfcc2e4f1f69f91f537987` |
| 480p / 1:1 | 640 × 640 | 2.020000 | 745669 | `8ddd69f4606cf4727b41bb259f3bbbc4dc324f169693aa16b85ff0a211d6ec73` |

The 480p landscape request remained the same saved run after a browser reload
while running. Its completed browser player reported 854 × 480, approximately
2.02 seconds, no media error, and ready state 4. The browser-downloaded file was
byte-identical to the independently downloaded API artifact.

## Effective output configuration

The actual model configuration advanced from revision 1 to 2 after all six
artifacts were verified. The six exact dimension mappings and the
`OutputSecondsV1` estimator were configured with explicit new revisions. A fresh
readback confirmed unchanged pricing, controls, input bounds, enabled state and
catalog visibility. No confidential Provider rates were copied into customer
surfaces or this record.

Six subsequent real estimate requests returned their corresponding dimensions
and a duration quantity of `2/1` seconds. The funding mode remained `owner_funded`;
customer amounts and maximum charges remained unknown rather than invented.
The three historical 480p billing records were unchanged. Independent scoped
request inventory still contained exactly three requests, so estimate calls did
not create additional jobs. A staging-backed browser displayed the configured
480p / 16:9 duration and the Provider-account funding explanation.

All task generation credentials used for these requests were revoked after their scoped checks. The last
credential deletion returned 204, followed by independent authentication denial
with 401. Exactly six video jobs, totaling 13 requested seconds, were submitted
across these dimension checks. The public upstream base price is not a separate
480p tariff, an invoice, or a hard upstream spending cap; exact procurement
settlement remains outside this artifact acceptance claim.

Integrated-candidate hosted verification and a new request using the effective
output configuration remain required by the linked release gate. This record
does not qualify untested Providers or infer a universal output dimension rule.

## Integrated browser submission with configured output

On integrated release `acb5863e`, the Chinese browser composer selected the
configured route and a dedicated model-limited credential, displayed 480p / 16:9 /
2.0 seconds and Provider-account funding, then submitted one current yellow-cube
request. Independent scoped inventory contained exactly one new request. The
saved intent was dispatched with an existing job identity, initially reporting
`unknown`. The browser remained at “Waiting for a confirmed status”; this exposed
the missing unknown-state polling branch recorded in `niu-iyrf`.

A single explicit status refresh of that same job returned `succeeded`, without
another submission. Its downloaded MP4 was 764,459 bytes, SHA-256
`be43ef06a4331ef60e11235f5b7b73b699f0dfac2c1b3317723855b060066f7d`.
Independent full decode and probe confirmed H.264/AAC, 854 × 480, 30 fps and
2.020000 seconds; the inspected frame showed the requested yellow wooden cube.
The job billing retained the configured seconds estimate of `2/1` with Estimate
provenance. Owner-funded charge, price and measured billing usage remained
unknown. This is an output-estimate qualification, not a procurement invoice.
The new current-input run brings this dimension/configuration verification to
seven requests and 15 requested seconds. The status-recovery defect remains open
until its actual browser correction is exercised.

## Automatic unknown-state recovery correction

A second current-input browser request exercised the local correction against
staging, using a green wooden cube prompt and the same two-second output settings.
The saved turn first displayed an unknown status, then Running, then Succeeded
without a manual status refresh or a second submission. The browser video reported
854 × 480, 2.02 seconds and no media error. Its downloaded file matched the API
artifact byte-for-byte: 734,707 bytes, SHA-256
`d49452472bd42b6d93238722b9a23f12a896e21821b0b005a8bbcb679615229f`.
A full independent decode and probe confirmed H.264/AAC and 30 fps; its inspected
frame showed the requested green cube. The persisted billing estimate remained
seconds `2/1`, with owner-funded price and charges unknown.

This correction polls acknowledged `unknown` jobs through existing status and
Provider refresh operations. It does not retry submission-uncertain requests or
create replacement jobs. The matching saved-session freshness decision and legacy
view polling condition were updated together. Hosted acceptance of the correction
remains pending; the actual automatic-completion observation above is from the
changed local dashboard with the real staging backend.

The dedicated key inventory contains two requests for these configured-output
checks, bringing this dimension/configuration/recovery series to eight requests
and 17 requested seconds. Exact upstream settlement is not inferred from video
duration or Niu's owner-funded billing fields.

### Saved-session follow-up — 2026-11-18

The draft-recovery correction was exercised with one additional actual
480p/16:9/two-second request from the saved-session composer. `run-1112` completed
automatically and its browser/API downloads matched: 733,480 bytes,
SHA-256 `8959badecb0becd83c658ab68162f0edc5bbfe8c97f6e9ce723263dc322d5cb7`,
854×480 H.264/AAC at 30 fps, 2.02 seconds. Full decode and visual frame inspection
confirmed the artifact. This makes nine real requests and 19 requested seconds
in the dimension/configuration/recovery series; it is not an upstream invoice.
See [follow-up draft evidence](video-followup-drafts-2026-11-18.md).
