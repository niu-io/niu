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
