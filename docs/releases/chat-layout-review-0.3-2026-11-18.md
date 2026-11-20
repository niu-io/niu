# Short-chat layout follow-up — 2026-11-18

Finding: `niu-mm90.33`. This is a review disposition, not an implemented
bottom-alignment change or a release acceptance claim.

The finding's recorded product decision accepts an intentional readable gap,
prioritizes functional layout and scrolling, and says not to treat that gap or
heading scale alone as a release blocker. The original proposal to move every
short exchange next to the composer and strip its response treatment is therefore
not adopted. It is closed as a superseded cosmetic proposal, not marked as a
successful implementation of its original bottom-alignment criterion.

The actual staging saved short exchange was inspected at 1440×900 and 768×900;
its response remains near the top, with a stable composer below. The response
body, completion state, timing, tokens and explicit no-charge value remain
readable. The older saved route retains its historical model alias rather than
inventing a current catalog name. Current catalog-backed responses show the
catalog name. The latest saved video session shows its prompt and timestamp;
legacy request-only video entries use readable model names and dated request
references where a saved prompt is unavailable.

A populated saved conversation was inspected at 390×844 and scrolled with actual
wheel input from offset 0 to its 673px maximum. The composer remained at y=708
through y=844 throughout; document width remained 390px. The final response and
its request action were reachable above the composer. Historical saved failure
messages were observed, not produced by this review, and are not evidence of a
new live failure. No message, draft, model configuration or historical result was
changed, and no inference request was sent.

The actual [OpenRouter Chat](https://openrouter.ai/chat) empty state was inspected
at 1440×900: its composer remains at the bottom beneath the working area. That
reference supports retaining a stable input surface, but no authenticated
completed-response state was available, so it does not establish a reference
requirement for short-response alignment.

The judgment follows the UX skills' distinction between functional behavior,
rendered integrity and optional style changes. [NN/g visual design principles](https://www.nngroup.com/articles/principles-visual-design/) support meaningful
hierarchy and grouping; they do not require all empty space to be removed.
The local recorded product decision governs this particular gap. The inspected
response is distinguishable from secondary metadata, and the input remains
reachable while the transcript scrolls. This bounded review is not a complete
accessibility, rich-response or streaming acceptance audit.
