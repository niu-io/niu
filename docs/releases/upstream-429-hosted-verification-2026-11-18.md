# Hosted HTTP 429 guidance verification

Tracking: `niu-bgst`. Hosted core:
`2a4dfb858fba5c94e8d3c466bf0e300ff5108313`.

Reopened the real HTTP 429 request produced during the current-input new-key
handoff verification. The deployed request detail states that the Provider
returned HTTP 429 and recommends reviewing its response and routing. It does not
infer rate limiting, balance exhaustion or another unreported cause. The raw
saved response remains unchanged; usage remains unknown and customer charge
status remains not charged.

Inspected the actual 1440×900 and 390×844 rendered detail, including scrolling
the narrow detail body to the next-step guidance. Text wraps without document
overflow. Escape closes the detail and restores focus to the original failed
request row. No new inference or retry was submitted in this follow-up.

This completes the hosted verification of the factual-copy correction. It does
not diagnose the upstream failure or establish that arbitrary retries succeed.
