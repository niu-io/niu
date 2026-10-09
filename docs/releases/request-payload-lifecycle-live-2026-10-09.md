# Live request payload lifecycle

Date: 2026-10-09. This checkpoint exercised one actual nonstreaming
`openai/gpt-4.1-mini` request through Niu using the personal OpenRouter route.
The harmless diagnostic request omitted the payload-retention header, exercising
the default capture path. It does not qualify commercial billing or all payload
formats.

## Actual observations

- The saved request object matched the submitted body, and the saved response
  parsed to the same object delivered to the client. Capture was complete and
  not truncated. The read endpoint returned `Cache-Control: no-store`.
- A newly issued workspace-scoped viewer credential read the content but received
  HTTP 403 when attempting deletion. The content remained intact.
- The viewer received HTTP 404 through a foreign workspace route. Installation
  access through that foreign route returned no content, and deletion through
  that route did not remove the original workspace's payload.
- After gateway restart, the payload was identical. Independent PostgreSQL reads
  matched both bodies and confirmed expiry exactly 86,400 seconds after the
  original attempt creation time.
- Two authorized deletion requests returned HTTP 204. Subsequent reads returned
  no payload, while the request summary, usage, finish reason and timing remained
  unchanged.
- After another restart, PostgreSQL contained no payload row and exactly one
  deletion marker for this attempt. The finish-reason row and unchanged request
  diagnostics remained available.

The temporary inference key and viewer credential were revoked. Credentials,
request identifiers and private verification artifacts remain outside Git.
No customer funds were credited or charged.

## Qualification limits

This verifies default nonstreaming capture, scoped access, explicit deletion and
restart durability for the exercised live request. The recorded 24-hour deadline
was inspected; a full 24-hour expiry and background-purge cycle was not observed.
Concurrent late writes, size truncation, all streaming/content formats and the
frontend workflow remain unverified by this run. No fixture-test outcome is used
as evidence. This checkpoint does not complete F06 or F09.
