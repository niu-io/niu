# Live customer Chat and Logs checkpoint — 2026-10-08

Scope: the existing development service on port 2566, authenticated demo account,
Default workspace and its saved Demo API key. This is an owner-funded personal
OpenRouter text check, not discounted supply or prepaid billing qualification.

## Verified workflow

- Ordinary email/password sign-in returned to an accessible workspace. Reloading
  Chat retained the authenticated session; no installation token was required.
- The workspace chooser opened and selected Default workspace. Chat automatically
  offered its saved Demo API key without asking for the key secret.
- The model dialog showed 25 available routes. Selecting only
  `openai/gpt-4.1-mini` and submitting `Reply with only OK.` produced `OK`.
  This verifies that single route, not the remaining catalog.
- Chat reported 14 tokens and 1,315 ms client elapsed time. After reload, the
  saved chat could be reopened from history with its response and metrics intact.
  The explicit `new=1` URL opened a new composer while preserving saved history.
- Inspect request opened the matching scoped Logs detail. It showed the actual
  request and response, 12 input tokens, 2 output tokens, HTTP 200 and the durable
  finish reason. Gateway duration was 1,301 ms: preparation 63 ms, first-output
  wait approximately 1.17 s, output stream 71 ms. Client and gateway durations
  have different boundaries and were not substituted for one another.
- Customer charge displayed **Own API key**, without substituting a Supplier
  purchase price or claiming a customer prepaid debit.
- Desktop review at 1280 × 720 and phone review at 390 × 844 covered the request
  detail, measured waterfall, fixed navigation controls and scrolling to both
  payloads. Phone content fit the viewport and the underlying rail was hidden.

## Limits and next checks

The historical `demo-workspace` URL is unavailable to this account; the rendered
recovery state offers an accessible workspace rather than fabricated data.
Guardrail verification has no selectable Chat key; Default workspace does.
No workspace, credential or Supplier was deleted or recreated for this check.

This checkpoint does not qualify session expiry, HTTPS cookies, reader/writer
roles, cross-workspace denials, every model/protocol, full-period aggregates,
prepaid top-ups, video, result retrieval or the complete F02/F03/F04/F06/F08 gates.
Supplier capability/rate and video workflow acceptance remain open. Agent
Observability was not changed or reviewed.
