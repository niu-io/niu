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
