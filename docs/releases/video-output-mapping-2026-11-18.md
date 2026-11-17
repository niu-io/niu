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
