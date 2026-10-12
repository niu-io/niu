# Workspace material storage acceptance

The durable workspace library was exercised through the actual HTTP handlers at
commit `a8f9e68fb7e221f612a1e415db7a763bf9162720`, with schema 285, in an
independent native PostgreSQL copy. The retained release binary SHA was checked
before execution. The original service, database and encryption identity were
not changed by this run. This is library acceptance, not evidence of original
installation deployment or a complete Seedance workflow.

## Current-input evidence

The inputs were an existing real generated MP4, its decoded PNG frame and its
decoded WAV audio. No new upstream generation or fabricated Provider response
was used. Original input hashes were retained privately. All three uploaded
objects were downloaded with exactly matching bytes, media types and SHA-256;
independent FFmpeg decoding succeeded. Seven saved downloads covered initial
reads, process restart and encryption rotation.

Owner writes and viewer reads succeeded. Viewer writes and foreign workspace
access were refused; reads and mutations using a real foreign asset identifier
were also refused. Metadata did not serialize encrypted content or audit actors.
Rename advanced the revision; stale writes were refused. Deletion erased the
stored encrypted bytes, retained an irreversible metadata tombstone and made
content unavailable across restart. Repeated deletion did not restore content.
Both a workspace with live materials and a separate workspace containing only a
material tombstone refused workspace deletion with HTTP 409 and retained data.

A real held library-table lock produced a safe HTTP 503 in approximately
257 milliseconds; the lock was authoritatively released before further reads.
At 255 active objects, eight simultaneous uploads across two Gateway processes
produced exactly one HTTP 201 and seven capacity refusals. Independent native
records contained 256 live objects. This verifies the object-count ceiling;
exhausting the separate 256 MiB workspace byte ceiling was not exercised.

Offline encryption rotation ran with 256 nonempty live library objects. An
independent verifier reopened the stopped database, decrypted every object with
the new key and compared plaintext hashes and lengths with the real inputs.
The old key failed for all 256 objects. Metadata remained unchanged and both
deleted objects had no ciphertext. Wrong-key startup, wrong-source rotation and
missing offline-maintenance consent were refused. The wrong-key startup may
encounter existing Supplier credentials before library content; it does not
independently identify the library as the first failing domain.

Original financial records were independently compared against the stopped
source and remained unchanged. Supplier metadata was unchanged apart from the
authorized credential ciphertext rewrap. Both verification copies were stopped
at completion. Raw responses, binary downloads, input hashes, native fingerprints
and independent verification records are retained outside the public repository.

## Remaining scope

The independent eight-format media-validation matrix is tracked separately.
Library CRUD and retention do not authorize a Provider asset or establish
inspection eligibility. Saved materials still require a fresh authorized image
inspection and an atomic task-dispatch binding that checks deletion and immutable
content identity. Video and audio task references, Provider qualification and a
real successful material-backed Seedance task are not established by this run.
