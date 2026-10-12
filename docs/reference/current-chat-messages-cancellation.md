# Current Chat and Messages streaming cancellation

This bounded checkpoint adds two genuine streaming cancellation cases to [inference failure acceptance](inference-failure-acceptance.md). It uses native Gateway `8bfdef10003eebe9402401247aa52cd69d3a398f`, binary SHA-256 `6f5290d182c9bf51de1f2bb8d469067351c9f9771150235adc2917b1d39c6900`, compiled JavaScript SDK `ce97f3b0116570dfd2a487b802d2d2de18efbf39` and schema 293.

A stopped database copy preserves the genuine personal self-funded OpenRouter credential, previously approved internal verification credit, existing private model mapping and frozen customer tariff. No cash receipt, Supplier qualification, new upstream credential, model/capability change or tariff change was created. Payment and video polling were disabled in these copies; original services, database, configuration and encryption identity were untouched.

## Actual requests and outcomes

Each request supplied a fresh prompt marker and requested at most 64 output tokens. The client aborted only after the compiled SDK yielded a real nonempty upstream text delta. Outcomes were independently observed rather than inferred from calling `AbortController.abort()`.

| Protocol | Actual delivery | Final native state |
| --- | --- | --- |
| Chat streaming | HTTP 200; genuine text delta followed by client abort; saved prefix has no `[DONE]` | `response_stream_cancelled`, `may_have_executed`, unknown aggregate usage |
| Messages streaming | HTTP 200; genuine `content_block_delta` text followed by client abort; saved prefix has no `message_stop` | The same explicit cancellation and uncertainty state |

There were exactly two real inference POSTs. An initial Chat harness called a nonexistent SDK method and produced a local TypeError before any HTTP request; it is not backend failure evidence or a consumed upstream call. The corrected Chat-only continuation copied the stopped first case, preserving its genuine Messages cancellation and hold. Messages was not repeated. No timeout or failed upstream execution was retried.

## Independently checked final artifacts

A separate reader reopened the final stopped database and a fresh copy of the original stopped source. For each new operation it found exactly one dispatched attempt, its original API key, selected model/account revisions and scoped inspection binding. The two attempts retained the same frozen tariff revision; no alternate attempt was dispatched. The saved partial streams and executable matched their SHA-256 digests.

Each request retained one open customer liability of **316,050 nanounits**, independently recomputed from its frozen input/output bounds, customer rates, fee and minimum. The completion bound is 64. No missing input/output quantity was inferred as zero, and neither request created a customer charge or debit. Both unresolved holds remain after restart and key revocation; neither was released on the basis of a client disconnect.

Original financial and credential/model rows were preserved. The existing procurement budget's reserved counter legitimately increased by exactly the two new held procurement reservations; this is explicitly excluded from a claim that every original financial row is byte-identical. Original charges, ledger entries, funding receipts and existing reservations remain unchanged. Procurement amounts are not disclosed in this customer-facing record.

Actual request detail responses before and after restart are equal. Both temporary inference keys were revoked, all copied Gateway/PostgreSQL processes were stopped, and the unresolved attempts were left intact for evidence-based recovery. No canonical receipt, usage total or completed execution was fabricated.

## Scope remaining

These observations qualify current Chat/Messages client cancellation and preservation of route, key, tariff and guardrail identity. They complement the genuinely executed Responses authentication-refusal fallback/cancellation and request-timeout records. They do not authorize replay of uncertain requests, arbitrary HTTP-status fallback, or forced settlement without a valid same-generation receipt.

Response-body idle timeout was not triggered by these cases and remains explicitly unverified. A prior bounded run observed a send-stage request timeout and an ordinary completed stream, not that body-timeout branch. No fabricated upstream stall or repeated paid search for that timing condition is presented as evidence. Direct Anthropic/Gemini account activation and a full optional-protocol cross-product are not added to this finite failure scope.
