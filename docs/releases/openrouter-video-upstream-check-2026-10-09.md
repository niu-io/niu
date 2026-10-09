# OpenRouter video upstream checkpoint — 2026-10-09

This is a direct upstream check using the existing personal credential, not a
completed Niu video workflow or qualified commercial supply. The
[official video API](https://openrouter.ai/docs/guides/overview/multimodal/video-generation)
documents asynchronous submission, polling and result retrieval.

## Actual observations

- Authenticated `GET /videos/models` returned a video catalog. A single
  text-to-video request selected `x-ai/grok-imagine-video-1.5-lite`, duration 1,
  resolution `480p` and aspect ratio `16:9`, all advertised by that catalog.
- `POST /videos` returned HTTP 202 with `id`, `polling_url` and `status`.
  Subsequent reads of the same job observed `pending`, then `completed`.
  No submission retry was made.
- The completed response contained `id`, `generation_id`, `polling_url`,
  `status`, `unsigned_urls` and `usage`. It did not contain a model identity or
  reported duration/token quantity. Usage contained upstream cost information;
  this private personal expenditure is not a customer charge or a retail meter.
- The returned result URL was on the OpenRouter API origin. An unauthenticated
  request returned HTTP 401 despite the `unsigned_urls` field name. Retrying
  result retrieval with authentication confined to that exact origin succeeded.
  Redirects were handled separately, without forwarding credentials to another
  origin. This retried retrieval, not generation.
- The saved MP4 was 90,503 bytes. Independent `ffprobe` inspection found H.264,
  848×480 and a container duration of approximately 1.04 seconds. Full `ffmpeg`
  decoding completed. The private artifact includes a SHA-256 digest; neither
  credentials nor upstream job references/result URLs enter this repository.

## Niu integration still required

The current gateway restricts video submission and recovery to `ark-direct-v1`
and video-token metering. Its direct query decoder requires a model field and
different lifecycle/result fields. OpenRouter therefore needs explicit protocol
translation, pinned job identity, authenticated same-origin content retrieval
and durable recovery integration. A public model listing does not enable this
channel in Niu.

Preserve missing reported quantities as unknown. Neither requested duration nor
an independently measured artifact duration by itself proves the Provider's
billable quantity. Keep owner-funded requests separate from customer pricing.
End-to-end Niu submission, restart recovery, scoped result retrieval and billing
remain unverified. No fixture-test outcome is evidence for this checkpoint.
