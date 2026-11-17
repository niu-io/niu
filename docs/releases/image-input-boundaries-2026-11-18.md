# Actual image-input admission boundaries — 2026-11-18

Bead: `niu-sjbh`. Deployed core:
`1a32fb9eef4828d8d81318b702dc0fef9cf9e7a7`.

A fresh model-scoped key with an explicit USD-zero customer cap sent four actual
current-input requests to the hosted Chat endpoint. The requests used a non-HTTPS
image URL, malformed inline base64, an unsupported image-detail value, and an
image in an assistant-role message, respectively. All four returned HTTP 400.
An independent read of the key's request inventory remained empty: none produced
a Provider attempt. The task key was revoked with HTTP 204, and a subsequent
request with its old token returned 401.

This is actual hosted admission evidence, with no synthetic Provider and no
fixture-test result. It does not establish universal image validation, general
model quality, or acceptance of a later release candidate. The public Niu mark
was the valid source image for cases varying role or detail; no private content
or credentials are included here.
