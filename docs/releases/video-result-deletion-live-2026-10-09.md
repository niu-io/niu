# Live video result deletion

Date: 2026-10-09. This run used the second actual personal OpenRouter video
created for the [model-edit recovery checkpoint](video-mapping-recovery-2026-10-09.md).
It did not submit another generation or delete the first lifecycle-check video.

Before deletion, Niu downloaded the saved result successfully. Its byte length
and SHA-256 matched the original independently decoded artifact. Two authorized
result-deletion requests then returned `deleted: true`; availability reported
both video and last frame unavailable, and video download returned HTTP 404.

An explicit refresh queried the real upstream job after deletion. The job
remained succeeded and its billing response was unchanged. The refreshed result
reference did not restore availability or download access. After gateway restart,
a replacement workspace key observed the same saved status, billing response,
unavailable results and download rejection.

Independent PostgreSQL inspection confirmed two retained deletion markers and
zero non-null encrypted result references for this job. Both temporary access
keys were revoked. Request identifiers, credentials and verification artifacts
remain outside Git.

This demonstrates durable Niu result deletion across an actual upstream refresh
and restart for the exercised owner-funded job. It does not establish deletion
of the upstream file, cancellation, a refund or commercial settlement. It does
not qualify an in-flight download/deletion race, automatic expiry, all media
formats or frontend behavior. No fixture-test outcome is used as evidence.
