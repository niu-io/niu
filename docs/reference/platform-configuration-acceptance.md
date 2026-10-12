# Platform configuration contract acceptance

S10-1 covers eleven methods: public authentication capability discovery and
branding, platform branding read/write (including theme), payment integration
inventory, EPay configuration read/write, and member profile/preferences
read/write. Theme is part of branding settings, not a separate endpoint.

Commit `4fd3e479` publishes four missing handler contracts and root references;
all eleven methods now have published operation schemas. Commit `4a459338` adds
SDK authentication discovery, public branding and EPay configuration helpers.
The SDK compiles from committed source; compilation alone does not verify runtime
behavior of those new helpers.

## Current-input native evidence

Native implementation `186662c5`, schema 283, was exercised through actual HTTP
against a preserved database copy. Independent PostgreSQL reopening checked
saved raw-response digests, exact snapshots/revisions/audit rows and original
financial full-row fingerprints.

- Public discovery exposes only password-login capability. Public branding
  exposes display/theme settings, with no credentials or procurement data.
- Installation administration can read/save branding and disabled EPay drafts.
  Six ordinary company/workspace owner, administrator and viewer roles receive
  403 for platform reads and writes. Member roles do not inherit platform access.
- Branding revisions persist across restart. Stale writes return 409 and SVG
  input is refused; no arbitrary executable branding is accepted.
- Disabled EPay configuration saves an encrypted snapshot and audit revision.
  An empty key retains the previously configured secret. Responses omit the
  secret. The three-integration inventory omits merchant credentials/endpoints;
  configured support does not prove external merchant activation.
- Six members independently save profile revision zero to one and reject stale
  updates or unsafe avatar inputs. Saved preferences override the branding
  default and survive restart. Installation tokens cannot act as member profile
  identities. Verification members are revoked after execution.

No original database, encrypted identity, funding or upstream model call was
changed. S10-2 encryption rotation and S10-3 broader public/configuration safety
remain separate acceptance items. HTTPS/browser rendering and merchant
activation are outside this checkpoint. Fixture outcomes have zero signal.
