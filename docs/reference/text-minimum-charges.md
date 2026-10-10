# Minimum customer charge for text requests

Customer text tariff publication accepts optional `minimum_charge_nanos`, an
exact nonnegative decimal integer string up to 9223372036854775807. Its unit is
currency nanounits per completed request, not nanounits per million tokens.
Supplier rates and procurement budgets are unchanged.

New tariffs default to zero. Replacing a tariff with a nonzero minimum requires
an explicit value; omission returns 409 rather than silently disabling it.
An explicit `"0"` disables the minimum for future requests. Null, negative,
fractional and overflowing inputs are rejected. Revisions and operation/attempt
bindings remain immutable; changes do not reprice earlier requests.

For completed text requests with known provider-reported billable usage:

```
customer charge = max(ceil(exact combined token charge), minimum_charge_nanos)
```

The token calculation retains existing flat/cached-input semantics and its single
rounding step. Missing required cached usage remains unresolved, even with a
minimum. Failed, unsent or uncertain requests are not automatically charged the
minimum. Output delivery failure does not erase known completed upstream usage.

Pre-dispatch customer liability reserves the greater of the configured token
bound and the minimum. A zero token rate does not bypass this hold. Company,
workspace and key financial admission use the same reservation transaction;
confirmed nonexecution retains the existing release mechanism. Historical invoice
lines and workspace/model-price reads include the applicable minimum as an exact
string. The JavaScript SDK's `publishCustomerTariff` accepts the same field.
This is a charge floor, not an additional fixed fee, and does not add minimum
pricing to video or Supplier settlement.

## Current-input verification

A fresh native gateway/database used the saved personal OpenRouter credential
with private internal retail rates and explicitly approved credit. Three real
strict-JSON completions each returned the requested fresh marker and reported
47 prompt / 11 completion tokens:

| Tariff case | Minimum nanounits | Customer charge nanounits |
| --- | ---: | ---: |
| Zero token rates | 1,000,000 | 1,000,000 |
| Token amount above minimum | 1 | 16,667 |
| Explicitly disabled minimum | 0 | 16,667 |

The latter two used prompt/completion rates of 123456789/987654321 nanounits per
million tokens. Independent arithmetic, immutable tariff snapshots, customer
charges and ledger debits matched. The first call's saved reservation was exactly
1,000,000. A key limit of 999,999 rejected that request before dispatch. Invalid
amounts and omission of an existing nonzero minimum left the saved tariff
unchanged. Restarts between calls preserved history; final holds were released
and reconciliation had no discrepancy.

The resulting three invoice lines retained minimums 1000000, 1 and 0 and matched
the exact charge sum. Invoice replay and restart returned the same data without
new charges. The built SDK separately saved 9007199254740993 exactly, verified by
SQL and HTTP, then explicitly restored zero without changing historical charges.
An upgrade of a retained database containing two actual priced completions kept
old tariff minimums at zero and preserved request/CSV accounting across restart.
Isolated processes stopped and original encrypted identity checks were unchanged.

A separate actual OpenRouter authentication rejection with a 1,000,000 minimum
released the customer/key and procurement holds without charging. After correcting
the isolated credential and restarting, one real completion charged exactly the
minimum; reconciliation remained consistent. This verifies that supported
nonexecution release does not turn the floor into a failed-request fee.

These are scoped actual text and configuration observations, not external funding,
commercial resale, customer-funded video, every protocol, concurrent tariff edits
or a minimum-aware interrupted-stream qualification. No fixture result supports
the observations.

## Refund and key allowance recovery

A subsequent current-input run reopened the isolated database containing the
actual 1,000,000 minimum-charge completion above. Two concurrent identical
600,000-nanounit refund requests produced one linked ledger refund. A further
500,000 request was rejected with 409 because it exceeded the remaining 400,000.
Refunding that remaining amount and replaying it produced exactly two refund
entries totaling 1,000,000. Independent reads showed the key's committed amount
reduced by exactly that total, while all three original customer charges and the
issued historical invoice lines remained unchanged.

After gateway restart, replaying both refund identities returned the same results
without additional entries; key commitments and invoice lines were unchanged.
The original encrypted identity was preserved and isolated processes stopped.
This qualifies internal balance refund of the exercised actual minimum charge;
it is not an external merchant refund or evidence of received cash funding.
