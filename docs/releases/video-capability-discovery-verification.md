# Customer Video capability discovery checkpoint

Reviewed 2026-10-07. This verifies a local API/SDK subset, not live video entitlement or the rendered Video workflow.

`GET /v1/video/models` and the signed-in selected-key dashboard equivalent return current configured text-video controls. Both paths use current workspace/model grants, personal ownership, enabled Supplier/model routes and video-compatible workspace/key Guardrails. Discovery and admission share the policy check; unsupported content-inspection/output rules cannot be bypassed by discovering a model.

The projection includes customer aliases, owner-funded/customer mode, text limits, configured defaults and required/exclusive controls, and output resolution/ratio-to-pixel mappings. It filters unmapped choice values and omits callbacks, reference inputs, unsupported channels/meters and models lacking an output estimator. Credentials, endpoints, upstream model mappings, private revisions and procurement prices never enter the response. Resolution/ratio pairs remain authoritative; independently listed choices do not imply a valid Cartesian product.

Discovery is read-only. It makes no upstream calls, creates no jobs and holds no funds. It is not a tariff quote, funding check or admission guarantee. Estimate and submission independently revalidate current configuration, customer tariffs, policy and funds. Saved jobs keep their original accounting.

Evidence:

- Five isolated PostgreSQL gateway video fixtures passed. Both prepaid API-key and owner-session paths discover the configured model and retain the submission/recovery/settlement assertions. Paused offers disappear; personal models remain owner-scoped; ungranted models and a current deny-all workspace policy disappear; unsupported seconds meters are omitted. Generation-call counts remain unchanged by discovery.
- Two projection unit tests passed for exact mapped choices, callback/reference/private-field exclusion and unsupported/mismatched contracts.
- All 137 JavaScript SDK tests passed, including discovery paths, GET methods, cancellation and no submission/retries. Public and dashboard clients expose typed Video model lists.
- OpenAPI parses with unique operation IDs and resolved local references. Gateway Clippy passed for all targets with warnings denied. Public-boundary and scoped whitespace checks passed.

Still open: live model/channel qualification, customer Video controls and history/result interactions, safe result/last-frame delivery, media-reference/asset/verification workflows, and packaged acceptance. No F01–F10 gate is closed.

## Inspected inline image discovery checkpoint

Discovery now advertises configured inline PNG/JPEG/WebP inputs only when current
parent/key consent permits every required runtime and video policy allows the
image path. Image count and byte limits intersect the model schema and every
decoder; dimension/decoded-byte limits and schema roles are returned. Remote
URLs and unsupported MIME types are omitted. The response identifies the
required prompt and policies that require an image. It remains read-only and
does not reserve current capacity or prove live qualification.

On 2026-10-07, three projection unit tests passed. One isolated PostgreSQL/API
fixture passed: discovery returned text-only inputs before consent and the
bounded image path after consent without detector calls, followed by exact
inspected submission and the existing negative consent/verdict/revocation cases.
This fixture uncovered and fixed an output-snapshot restriction that rejected
images when an estimator was configured. Validated text/image inputs now retain
the configured output snapshot; video references remain rejected because their
duration requires separate metering qualification.

SDK compilation, five SDK dashboard-video tests, dashboard type checking,
OpenAPI YAML parsing and whitespace checks passed. No rendered reference-input
controls or live Supplier/detector acceptance are claimed by this checkpoint.

## Dashboard request preparation checkpoint

The Video request builder now accepts typed inline image references and validates
discovered required-image, MIME, role, count, reference-byte and complete-body
limits before constructing an estimate/submission body. It rejects remote URLs
and preserves exact encoded references. This is client validation only: bounded
decoding and content inspection remain backend responsibilities. No attachment
controls or saved reference workflow are delivered by this increment.

On 2026-10-07, eight focused Video tests and dashboard type checking passed.
The running dev page was inspected and reported no supported video route for
its selected key; reference interaction states were therefore not browser
qualified. OpenRouter's actual Chat attachment menu was inspected as the layout
reference for subsequent controls. A broader dashboard run produced 512 passing
and three failing tests in Administration, AppLayout integration and provider
isolation. Those navigation/authentication failures remain release work; the
focused result does not establish complete dashboard acceptance.

The three failures were rechecked on 2026-10-07 and traced to outdated test
expectations: Administration now owns the permission boundary rather than
Supplier tabs; the shared Users empty-state title is text rather than a heading;
and the retired Agent Observability route belongs in the existing not-found
coverage rather than the active authentication route matrix. Tests now retain
unauthorized directory/detail denial and named Supplier destination preservation,
check the actual Users empty state and include active Admin authentication.
All 57 tests in the affected files passed, followed by all 515 dashboard tests
across 72 files and dashboard type checking. These results supersede the earlier
three failures; rendered reference controls and live qualification remain open.

## Reference attachment controls checkpoint

Video now renders inline image attachments beside the prompt when discovery
provides a supported image rule. Pending files use local reads with bounded
type/byte/count checks; failed multi-file selection adds no partial attachments.
Schema roles use the shared DropdownMenu primitives. Removal, model/key changes
and new-video actions clear or update the pending references; attachment changes
invalidate estimates. Starting a file read also invalidates the estimate and
blocks estimation/generation until completion, preventing an old quote from
authorizing a different pending input. Pending drafts are not saved video assets.

On 2026-10-07, twelve focused component/composer tests and type checking passed.
The actual OpenRouter Chat attachment placement was inspected before editing.
An isolated browser component fixture verified the actual attachment row, role
menu alignment/selection and removal at desktop and 390px widths. The temporary
fixture files and tab were removed; no fake Supplier, route or generation was
added to the running product. Full page submission/reload and durable reference
assets still require an eligible test channel and remain unqualified. The prior
515-test full dashboard result predates these controls.

## Pending-read cancellation regression

Model changes and attachment-component unmounts now abort pending FileReader
operations and clear the parent's read state. Late completion cannot append
references from the prior model. Thirteen focused attachment/composer tests and
dashboard type checking passed on 2026-10-07, including a controlled pending-read
model switch and late-completion rejection. No layout changed in this increment.

Fresh full-suite qualification did not pass. The default run reported 56 failed
and 464 passed tests with widespread timeouts. A two-worker diagnostic run still
reported nine failed and 507 passed tests, plus two worker-start timeout errors
that prevented two files from running. Environment startup accounted for 69%
of tracked time in that diagnostic run. Do not substitute the earlier 515-test
result or focused 13-test result for current complete-suite acceptance. These
failures and the full rendered/live reference journey remain open release work.

## Full-suite failure isolation

On 2026-10-07, Settings navigation passed its two tests in isolation. The other
five previously affected or unstarted files then passed all 88 tests with two
workers. A complete two-worker run still failed: 518 tests passed and two Supplier
qualification/rate tests failed. That Supplier file subsequently passed all 11
tests in isolation. A complete one-worker run then reported 515 passing and five
failing tests across all 520 tests; failures remained in Supplier qualification
and media-rate publication. Assertions and timeout limits were unchanged.

Complete dashboard acceptance remains unproven. Isolated passes do not erase the
full-run failures or establish their cause. Continue investigation of those
Supplier workflows before treating the current UI release as qualified.

## Interaction-fixture checkpoint — 2026-10-08

Supplier qualification and media-rate fixtures now paste complete hashes and
financial strings instead of simulating hundreds of keystrokes. All 17 focused
tests passed; the following complete run passed 517 of 520 tests. Its remaining
failures were schema-role validation and Chat timeouts, plus a mapping-save
assertion contaminated by the timed-out role-entry operation.

The oversized UTF-8 role and the comparison prompt/system instructions now use
complete paste interactions, retaining the same values, validation, menu actions,
request assertions and timeout limits. Both affected files passed all 47 tests;
dashboard type checking also passed.

A fresh complete run executed 522 tests across 74 files and passed 518, with four
failures: organization switching could not find the sign-in Email field; invalid
Supplier offer revision validation and unsent Chat restoration timed out; Supplier
catalog mapping hit a cleanup hook timeout. The run reported 1125.67 seconds,
including two individual tests exceeding 1000 seconds. This is not proof of a
product cause or of an environment cause. Concurrent work added tests during this
qualification window. Full-suite acceptance remains open; focused passes do not
supersede the complete-run failures. No release gate is marked passed.

The four failing files subsequently passed all 62 tests in a one-worker isolated
run (16.30 seconds), without further changes. This narrows the reproduction but
does not erase the complete-run failures or establish their cause.

A subsequent full run reported 508 passed and one timed-out media-rate history
test, with two worker-start failures leaving two files unexecuted. A before/after
SHA-256 comparison found five dashboard source inputs changed during that run.
It cannot qualify a stable source snapshot. No full dashboard acceptance is
claimed, and this result does not supersede the current focused workflow checks.

The isolated, complete source-snapshot runner subsequently passed all 523 tests
across 74 files and TypeScript checking, with unchanged captured inputs and
dependency receipts. See [automated qualification](dashboard-automated-verification.md).
This supersedes the earlier failures for that automated snapshot only; complete
rendered/live reference-input and release acceptance remain open.
