# Integrated staging deployment — 2026-11-18

Tracking: `niu-k9q7`, `niu-nrcn`; new preview finding `niu-5zx0`.

Staging now uses public core `c2d3634e404504bd2d6bd453df177ee4370d888c`
through immutable distribution commit `cefdf03a3b251310ab7b8ea979ba87d05c12a835`.
[Deployment workflow](https://github.com/niu-io/cloud/actions/runs/44206095759)
completed; an independent deployment API read confirmed that exact distribution
commit live. Production and release tags were not changed.

Before deployment, all 249 dependencies of the previous live dashboard were read
and hashed. After deployment, every artifact returned HTTP 200 on its first read,
with identical length and SHA-256. The existing browser document retained its
pre-deployment marker while navigating to Usage and loading actual request data.
This qualifies that observed upgrade path, not general availability.

A fresh hosted saved Video session loaded its historical results. The newest
completed video initially showed the localized download-busy recovery state.
Explicit Restore video recovered that same result. The downloaded hosted artifact
was byte-identical to the independently decoded 720p lime video described in
[the response-recovery record](video-submit-response-recovery-2026-11-18.md).
The source automatically starts a preview for every mounted available result;
`niu-5zx0` tracks reproducing and correcting this admission behavior without
weakening the backend memory limit. Exact concurrency causality is not yet proven.

The deployed core includes the earlier session recovery and durable draft changes.
The later preparation/submit response recovery work remains on its feature branch,
so its local-browser evidence is not claimed as hosted acceptance. Actual invalid
session recovery, complete integrated journey acceptance and the preview finding
remain open in Beads. Fixture outcomes provide no evidence.
