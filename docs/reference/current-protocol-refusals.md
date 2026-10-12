# Current finite protocol refusal checkpoint

This zero-generation checkpoint uses native runtime `8bfdef10003eebe9402401247aa52cd69d3a398f`, binary SHA-256 `6f5290d182c9bf51de1f2bb8d469067351c9f9771150235adc2917b1d39c6900`, and compiled JavaScript SDK `ce97f3b0116570dfd2a487b802d2d2de18efbf39`. An isolated stopped-database copy migrated to schema 293. It retained the genuine personal OpenRouter account, existing model and financial history; no fake upstream endpoint or new external credential was introduced.

The existing personal model's Responses, Embeddings and Messages flags were temporarily disabled through the actual administration API. The original capabilities were restored afterward. These writes legitimately advance the model revision; this checkpoint does not assert whole-model row equality. No inference request was allowed to execute upstream.

| Actual request | Result |
| --- | --- |
| SDK Responses creation with disabled capability | 501 |
| SDK Embeddings creation with disabled capability | 501 |
| SDK Messages creation with disabled capability | 501 |
| SDK GenerateContent on the OpenRouter model | Native 501 `UNIMPLEMENTED` |
| Explicit HTTP `/v1beta/models/{model_action}` with `:generateContent` on the OpenRouter model | Native 501 `UNIMPLEMENTED` |
| Explicit HTTP native `:streamGenerateContent` action | Native 501 `UNIMPLEMENTED` |
| Native streaming-action refusal after Gateway restart | Native 501 `UNIMPLEMENTED` |

The clean compiled SDK used its default `/v1` base and actually sent GenerateContent to the sibling `/v1beta/models/{model_action}` route. It preserved the same authorization and error handling. No SDK path defect was demonstrated, and no speculative SDK enhancement was committed. Uncommitted local Gemini/route changes were excluded from the executed contract.

An independent reader reopened both the stopped final database and a fresh copy of the stopped source. All observed native attempt, operation, media-job/query/timing, failure, retained payload, financial and credential/ownership fingerprints matched exactly. Thus these refusals produced no new attempt, dispatch, hold, debit, charge, or generation. Saved actual responses and the retained executable matched their SHA-256 digests. Original model capabilities were restored, the temporary key was revoked, and copied services were stopped.

This refresh qualifies the enumerated current rejection boundaries. It does not requalify older positive inference on the new runtime or claim direct Anthropic/Gemini activation. The [finite support boundary](inference-protocol-support-boundary.md) keeps genuine historical positives, current refusals and unverified optional combinations distinct. External activation is not added as a prerequisite to publishing that matrix.
