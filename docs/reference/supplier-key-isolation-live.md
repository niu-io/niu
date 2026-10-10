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
