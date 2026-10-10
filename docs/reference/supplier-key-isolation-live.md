# Supplier key configuration isolation with actual inference

Date: 2026-10-10. Backend revision: `59922df`.

An isolated native PostgreSQL database and gateway were configured through normal
management APIs with one Supplier business and two independently stored API key
configurations. Each key had its own private model alias, capability/pricing
document and workspace inference key. Input bounds and configured expense rates
differed between the mappings. Customer tariffs and bounded internal credit
followed the [credit workflow](internal-credit-workflow-live.md).

Both local configurations used the owner's existing personal OpenRouter secret.
No commercial offer, Supplier qualification or funding receipt was fabricated.
The run verifies Niu's configuration isolation, not issuance or independence of
two external account credentials.

## Actual workflow and independent observations

1. The first mapping completed a real strict-JSON request containing a fresh
   nonce. Its charge matched an independent calculation from client usage.
2. The first credential was re-encrypted through the normal credential-update
   API and disabled in the same revisioned update. Its revision/ciphertext digest
   changed. Independent database reads confirmed that the second credential's
   revision and ciphertext digest were unchanged; its model management response,
   including pricing, also remained unchanged.
3. A request to the disabled mapping returned HTTP 404 without a new attempt.
   The second mapping completed a real request and returned the requested nonce.
4. After restarting the gateway, the second credential/model snapshots still
   matched and a third real request completed through that mapping. Filtering
   key configurations by Supplier returned exactly the two expected entries,
   both attached to the original Supplier business.
5. Three customer charges and matching debits were present, each 17,902 USD
   nanounits, totaling 53,706. All reservations were released and the reconciliation
   API reported no missing, mismatched, unexpected or duplicate entries and no
   settled open reservation.

Temporary inference keys were revoked and mappings disabled. The isolated
gateway/database stopped; the original development database and encrypted
credential identity were preserved. No fixture result supports these findings.

This does not qualify distinct upstream credentials, an enabled first-key call
after rotation, concurrent credential edits, Supplier-member workflows, UI
onboarding, commercial earnings or every model/Provider combination.

## Enabled replacement and concurrent edits

A subsequent isolated current-input run on 2026-10-10 added two simultaneous
credential updates with the same expected revision, both leaving the credential
enabled. Exactly one returned HTTP 200 and the other returned HTTP 409. A real
strict-JSON request then completed through the winning configuration before the
first credential was disabled. Independent database and management reads kept
the second credential ciphertext/revision and model/pricing snapshot unchanged.
The second mapping also completed real calls before and after restart.

Four independently calculated customer charges matched the posted debits; no
open customer reservations or reconciliation discrepancies remained. This closes
the enabled-call-after-local-replacement and concurrent-edit observations for
the exercised workflow. Both configurations still used the owner's same upstream
secret; distinct external account credentials, commercial qualification and UI
workflows remain outside this evidence. No existing development identity or
funding receipt was changed.

## Rejected model prices preserve saved configuration

On 2026-10-10, a fresh isolated native run created a valid encrypted configuration
and priced model mapping through the management API. Current-input updates with
negative rates, a lowercase currency, zero input/output bounds, an overflowing
maximum charge, a string rate and an unknown pricing field each returned HTTP
400. After every rejection, the model-list response and the independently read
complete PostgreSQL model row were unchanged.

A valid disable operation advanced the model revision. A subsequent stale-revision
write returned HTTP 409 without changing that row. Restart preserved the accepted
revision, disabled state and original price. Independent reads found no attempts
or customer ledger entries; these management checks made no upstream calls.
The original development credential identity was unchanged. This verifies the
exercised save/rejection behavior, not all possible price bounds or commercial
Supplier qualification.

## Exact price preservation through a JavaScript capability edit

An isolated current-input run on 2026-10-10 saved the integer route rate
9007199254740993 through HTTP, with valid small token bounds. A native JavaScript
client read that mapping, confirmed its numeric price was outside JavaScript's
safe-integer range, and changed a capability while omitting `pricing` entirely
from the update body. The gateway accepted the revisioned update.

Independent PostgreSQL reads retained the exact original decimal value and the
new revision. After gateway restart, an exact-integer JSON reader observed the
same complete price and updated capability. No inference or ledger entry was
created. This verifies that an omitted-price edit does not overwrite the stored
value with JavaScript's rounded representation. It does not make an unsafe JSON
number safe to edit or resubmit, and does not qualify the browser form itself.

## Multiple mappings on one credential — current-input verification

A fresh native run against backend revision `c15ad4a` exercised one Supplier with
two credential configurations and three private mappings. The first configuration
had one mapping; the second had two, each with its own workspace key and customer
tariff. All configuration was created through management APIs. Both configurations
used the saved owner's OpenRouter secret; these are independent Niu configurations,
not independently issued upstream credentials or commercial supply.

After an actual completion on the first configuration, its credential was
re-encrypted and disabled through a revisioned update. The second configuration's
ciphertext digest/revision and complete two-model management response remained
unchanged. One of its models completed before and after gateway restart; the other
completed after restart. All four strict-JSON responses contained the requested
fresh marker. Four independently calculated charges totaled 56,792 USD nanounits,
matching the customer debits; customer holds were released and the reconciliation
response reported no discrepancies.

The disabled first route returned 404. A key restricted to the second mapping
also received 404 when requesting the third mapping, despite their shared upstream
credential. Independent SQL still showed only the four completed-call attempts.
Supplier filtering returned the original two configurations. Temporary keys were
revoked, mappings disabled and isolated processes stopped. The original database
and encrypted identity were preserved.

An earlier execution stopped at a verifier that incorrectly expected 403 for the
model-allowlist rejection. The handler intentionally returns 404; that execution
is not recorded as a completed verification. The fresh completed run above used
the actual contract. This checkpoint does not qualify every provider/model,
concurrent mapping mutation, external account isolation or browser onboarding.

## Atomic Supplier and first-credential creation — 2026-10-11

A fresh native gateway received eight concurrent current-input
`POST /admin/v1/vendors` requests with the same credential-configuration name
and `create_supplier: true`. Exactly one returned 201 and seven returned 409.
Independent reopening found exactly one Supplier business, one encrypted
credential configuration and one ownership association. The retained audit
records consisted of one business creation and the credential creation and
association events; losing transactions left no extra business or audit rows.

Subsequent requests supplied an empty secret, an absent existing Supplier, and
both new-Supplier and existing-Supplier options. They returned 400, 409 and 400,
respectively. After each rejection the complete row-count/audit-count snapshot,
credential ciphertext digest and revision were unchanged. Gateway restart
preserved those observations, and filtering configurations by the surviving
Supplier returned precisely its one credential.

No inference, customer ledger entry, Supplier earning or settlement was created.
The saved personal upstream secret was used only as encrypted configuration;
there was no upstream request or commercial qualification claim. The original
development identity was unchanged and isolated processes stopped. These actual
HTTP and independently reopened database observations cover duplicate-name
contention and the exercised validation failures, not lost commit acknowledgments,
every constraint failure, crash recovery or browser onboarding. No fixture result
was used as evidence.

## Explicit Supplier selection rejects unavailable scope — 2026-10-11

`GET /admin/v1/vendors?supplier=...` now rejects missing or deleted Suppliers
with 404 after checking platform authorization. A valid Supplier with no
configurations still returns 200 with an empty `data` array. Omitting the filter
retains the installation-wide directory contract. The generated OpenAPI records
this distinction so clients can separate unavailable selection from empty setup.

An actual isolated native run reproduced the previous successful empty response
for both missing and deleted Suppliers. With the updated binary, the same flow
returned 404 for each, 200 for the active empty Supplier and unfiltered directory,
and 403 for a company viewer without platform authority. Gateway restart retained
the deleted-scope rejection. Independent reopening confirmed the Supplier's
retained deletion marker/audit and no credentials, inference or financial records.
No fixture outcome was used. This run covers selected-scope validation, not
concurrent deletion between authorization and list reads or populated pagination.
