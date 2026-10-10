# Supplier secret startup validation

The gateway validates retained Supplier inference credentials and every retained
asset-management credential revision before binding its HTTP listener. Disabled
and model-less configurations are included. Asset validation retains the exact
vendor, revision and upstream-project authenticated binding; it does not fall
back to a current revision or inference key. Failure reports a fixed diagnostic
without secrets, ciphertext or endpoints.

Both scans use keyset pages of 100 rows. The asset scan uses the existing
`(vendor_id, revision)` primary key, so a revision beyond the first page cannot
be silently skipped. Revocation does not erase retained ciphertext and does not
exempt it from validation. An explicitly erased ciphertext is absent and cannot
be validated; its immutable revision metadata remains. Startup never erases,
re-encrypts or repairs a record and performs no upstream credential probe.

## Current-input verification

An isolated native gateway stored 101 asset credential revisions through the
normal configuration API. Independently authenticated re-encryption changed only
the associated inference credential to a different deployment key, modeling an
incomplete master-key replacement. The previous binary became ready despite the
remaining asset secrets requiring the original key. The updated binary exited
before readiness with a sanitized asset-decryption diagnostic. Restoring the
correct original key and inference ciphertext restored startup.

Further checks used the same actual API-created records:

- Truncating only revision 101 failed startup, verifying the second page is read.
- Placing revision 100's authentic ciphertext in revision 101 failed its binding.
- Removing the deployment key failed closed.
- API revocation without erasure retained the history and still rejected the
  incompatible key.
- Explicit API erasure removed all 101 ciphertexts. The different deployment key
  then became ready when it matched the remaining inference credential.

Fault preparation was confined to the isolated database, with original encrypted
values restored before exercising normal erasure. Logs were checked for the
throwaway deployment and asset secrets. Independent reopening confirmed all 101
revision identities, one revocation and one erasure through revision 101, no
remaining asset ciphertext, restored database triggers and no attempt or balance
entry. The original development database and encryption identity were unchanged.

A separate current-input native run made two real OpenRouter completions across
two gateways. Independent reopening matched both raw usages, one exact internal
customer debit and no personal-route charge or open customer reservation. Restart
preserved the records. This is internal-credit and personal self-funded evidence,
not a received merchant payment or commercial Supplier qualification.

## Operational boundary

Back up the database and retain its deployment key separately. A readiness
failure is not permission to erase credentials. Restore the matching deployment
key and investigate the affected encrypted data. Master-key re-encryption and
crash-resumable rotation remain unimplemented under issue #9. This validation
change does not qualify every encrypted data domain, external asset operations,
large-installation startup capacity or the complete release. Fixture outcomes
are not evidence.
