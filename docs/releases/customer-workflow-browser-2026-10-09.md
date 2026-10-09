# Customer workflow browser checkpoint — 2026-10-09

Status: bounded rendered review passed; full release acceptance remains open.
The running source includes the migration-0188 compatibility fix.

| Workflow | Observed result | Boundary |
| --- | --- | --- |
| Sign-in and reload | Normal email/password sign-in reaches the populated workspace overview; reload restores the session. | Local development session; production HTTPS expiry/revocation acceptance remains separate. |
| Models | Rail opens global `/models`; model detail retains workspace context and provides a complete authenticated curl request with model, endpoint and message body. | Customer prices remain explicitly unpublished when absent; catalog presence is not live qualification. |
| Key setup | Model detail opens the workspace key creation dialog. Name and expiration are focused controls; opening the expiration menu preserves alignment and cancellation returns to the key list. An existing active key is shown. | No new credential was issued; creation/rotation/revocation browser acceptance remains open. |
| Saved Chat | Existing durable conversation restores its title, prompt, response and selected key. Inspect request opens the corresponding Logs detail. | No new upstream request was submitted in this review. |
| Logs diagnosis | Matching detail shows request/response messages, token categories, finish reason, own-key charge label and measured preparation/first-output/stream waterfall. Closing retains the model filter. | This checks one existing successful text request, not every protocol/error/retention case. |
| Responsive Logs | At 390×844 the desktop rail is hidden, list fits, detail scrolls to payloads and close/previous/next remain available. At 1280×900 the full diagnostic table fits. | Other feature layouts and narrow interaction states remain open. |

No source UI change or fabricated data was needed for this checkpoint. Existing
stored product data was inspected locally and is not copied into this document.
These observations do not qualify billing/top-ups, live model supply, video,
Guardrails, all workspace roles or the complete F02/F03/F06/F08/F10 gates.

## Billing, Payments and merchant setup

The avatar menu opens global Settings over the existing Logs page. Billing and
Payments are separate sections; closing restores the originating route and its
model filter. Billing shows shared account capacity, low-balance warning
configuration and the exhausted-capacity suspension state. No invoice payment
or credit-card prerequisite is imposed.

Payments currently offers no online methods in the reviewed local environment.
The development launcher has no private Zhifux configuration file connected;
EPay is disabled. No top-up, checkout, transfer or merchant-setting mutation was
performed. This is an observed configuration gap, not passed top-up acceptance.
Merchant credentials alone cannot establish verified API endpoints, qualified
methods, checkout origins or a reachable authenticated notification endpoint.

Admin → Payment gateways exposes a focused EPay configuration dialog with
merchant ID/key, gateway URL, notification/return URLs and Alipay/WeChat Pay
controls. The form fits at 390×844 and 1280×900; cancellation preserves disabled
state. Native Zhifux and Stripe are still server-managed and lack equivalent
rendered configuration lifecycle acceptance. Native 支付FM credentials are not
assumed EPay-compatible. Complete merchant configuration, signed checkout and
callback recovery, durable verified top-up credit and post-top-up paid request
acceptance remain open under F05/F10.
