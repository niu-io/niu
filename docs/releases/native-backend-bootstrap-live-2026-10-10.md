# Native backend bootstrap and restart

Status: scoped current-input backend verification, 2026-10-10.
This is not complete release, container, frontend or paid-billing qualification.

A separate native PostgreSQL instance started with an empty public schema and
fresh database and installation-admin credentials. The release gateway used an
empty model configuration and the existing authorized encryption identity.
Startup applied migrations through 0218 and reached database readiness. The
existing development database and running gateway were not replaced or restored.

All product setup used the actual management APIs:

1. Create a company and workspace.
2. Configure an independent Supplier credential with the saved owner's upstream
   key and explicitly assign personal ownership.
3. Bind the actual text model without commercial pricing.
4. Issue a workspace key restricted to that alias.
5. Make a real owner-funded Chat request and read its saved payload.
6. Stop and restart the gateway against the same new database and configuration.
7. Read the original payload and make another actual request with the same key.
8. Revoke the key and confirm another inference request is denied.

Both completed requests returned nonempty model output. Provider-reported token
counts matched independent PostgreSQL reads of the confirmed attempts. Retained
request objects matched the submitted bodies, and retained response JSON matched
the delivered responses. The first payload, including expiry/completion metadata,
was identical after restart. The Supplier ciphertext digest and revision also
remained unchanged across restart, and the saved credential still dispatched.

Revocation returned 401 and left exactly the two previous dispatches. There were
no customer balance entries. The verifier did not invent funding, commercial
qualification or a discounted offer. Temporary access was revoked and the model
and credential disabled. Both isolated processes were stopped. The original
development credential's revision and ciphertext digest were independently
checked and remained unchanged; its original gateway stayed running.

Private evidence retains response hashes and usage observations. No fixture
outcome supports this checkpoint. It covers native cold migration, actual API
setup, personal inference, content persistence and restart/revocation for this
model. Commercial admission/debit, multiple-key configuration on this new
installation, deployment packaging, browser workflows, disaster restore and
performance remain outside this run.
