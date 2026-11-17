# Image-input rejection on the hosted 0.3 candidate

Observed 2026-11-18 against core `3f949559156ff2499a900e6890b3e29ed6ed4dde`.
Current execution state and correction are tracked in Beads `niu-sjbh`, blocking
inference acceptance `niu-nrcn.4`.

An actual browser request used a fresh, expiring, model-restricted key with a
zero-dollar Niu spending cap. Discovery advertised text and image input for
`qiniu/deepseek-v4.1-flash`. Chat accepted the public Niu brand PNG and a new prompt
asking about its shapes, colors and visible text. Reload retained the unsent
prompt, attachment and selected key.

Sending failed with the priced-route text-only validation error. No model answer
was returned. Independent administrative request inventory contained zero
attempts for the key. This is an observed admission failure, not evidence of an
upstream model failure or successful image support.

The actual browser-downloaded session export contained one failed result with
empty content and null finish reason. Its embedded PNG matched the original
22,353 bytes exactly, SHA-256
`4ff254f73bd098c41eccaa9f78440592749bf6a44196f86d85851e874dbc8491`.
The export SHA-256 was
`cc3ddab6264e0e467331e9f92886a1ff8e706ab36ec675efe518029993c57e11`.
The temporary key was revoked; an independent request with its old credential
returned HTTP 401.

Source inspection identifies both priced Chat validation and shared key token
admission as text-only boundaries. A correction must reconcile discovery,
invocation and bounded accounting together. Removing one validator alone does
not qualify image input. This observation does not expand historical image-output
acceptance into an image-input acceptance claim. No fixture result is evidence
for this finding.

## Correction in progress

The correction admits bounded user `image_url` blocks on declared image routes
and retains the serialized-input byte guard. Image token-rate admission uses the
same configured input ceiling as monetary reservation, plus the output limit.
Migration 0437 adds the distinct `route-input-limit-plus-output-v1` provenance;
historical text bounds retain their existing estimator.

An actual native gateway with PostgreSQL and a newly configured zero-price image
route rejected the current brand PNG with HTTP 429 `key_token_rate_exceeded` when
the key limit was one token per minute. An independent database query found zero
dispatched attempts. The runtime key was revoked and independently returned 401.
This negative-path run used an unusable upstream credential and establishes no
upstream image completion. Earlier harness setup errors are excluded from product
findings. The service and database were stopped afterward.

A separate migration-only run upgraded the retained database from earlier actual
Chat invocations. All four historical token-bound rows remained byte-identical
before and after migration 0437, SHA-256
`1df2573af283f65bae9f6e801a546f81eb86aab1893c267ed5c0763a52506096`.
Fresh schema creation and the expanded estimator constraint were also inspected.

Compilation across gateway/storage targets, the gateway build and generated API
consistency completed. These checks do not replace a real image response, positive
accounting reconciliation or the corrected hosted save/reload/export journey;
those acceptance requirements remain open in `niu-sjbh`.
