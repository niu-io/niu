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

## Correction and actual hosted verification

Core `1a32fb9eef4828d8d81318b702dc0fef9cf9e7a7` was deployed for this
verification. The priced Chat validator accepts bounded user image-URL content
for a route advertising image input. Text-only route rejection remains explicit.
Key token-rate admission uses the route input limit plus the output bound for
images, rather than treating encoded image bytes as a sound token estimate.
Migration 0437 records that distinct estimator without rewriting historical
admissions. Existing text bounds retain their original estimator.

An actual native priced image request with a one-token-per-minute key limit was
rejected before dispatch; independent request inventory remained empty. Applying
the migration to a retained database with four actual prior admission rows left
those rows byte-identical. This is bounded admission/migration evidence, not an
upstream image-completion claim. Backend compilation, build, all-target static
checks, generated API checks and documentation build completed; fixture outcomes
were not used.

The hosted browser then submitted the public Niu mark PNG once with a fresh
prompt asking for blade count, colors and visible text. The unsent draft was
read independently and reloaded before submission. The completed answer counted
seven curved blades, described warm yellow/orange/coral colors, and reported no
text. Independent visual inspection of the input agrees with those observations;
this does not establish general model quality.

The saved session and downloaded JSON export retain the same prompt, attachment,
model, completed text and stop reason. The export intentionally omits diagnostic
fields retained in the backend session; equality was checked on the exported
fields rather than assuming identical schemas. The decoded PNG is byte-identical
to the original: 22,353 bytes, SHA-256
`4ff254f73bd098c41eccaa9f78440592749bf6a44196f86d85851e874dbc8491`.
Independent request evidence reports one confirmed completed invocation,
245 input tokens, 3,253 output tokens, 3,498 total, and a settled USD-zero customer
charge under the applicable zero tariff. Reload retained the completed answer.
The temporary key was revoked and its old token returned 401.

A separate actual API image request exercised the isolated, noncash-funded
compatibility tariff documented in
[positive customer charge verification](positive-customer-charge-2026-11-18.md).
Its conservative reservation was 1,008,192 nanos; the fresh key had the same
explicit cap. Independent records agree on 235 input and 4,096 output tokens.
The Provider reported all 4,096 output tokens as reasoning, an empty final answer,
and `finish_reason=length`. This verifies bounded execution/accounting, **not**
a successful answer to the image question; no automatic retry was submitted.
The visible successful answer is the separate browser request described above.

At the configured customer rates, the raw token charge was 8,427 nanos and the
10,000-nano minimum applied. Request charge and key committed amount both equal
10,000. Final account balance and key remaining amount both equal 998,192 nanos;
reserved balance is zero, reservation inventory is empty, and the independently
summed ledger equals that balance. The key was revoked with a subsequent 401.
The funding adjustment was explicitly noncash credit, not a payment or revenue
claim. Default-platform positive pricing and merchant payment acceptance remain
outside this bounded run.

The deployed asset graph was independently checked: all 249 assets reachable
from the previous dashboard entry remained byte-identical and both health and
readiness endpoints returned 200. This bounds retained-client compatibility;
it does not replace full release regression or acceptance of a later merged tip.
