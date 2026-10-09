# Supplier configuration and workspace backend checkpoint — 2026-10-09

Scope: current-input public API workflows against a running gateway and
PostgreSQL, with actual owner-funded OpenRouter generation. Fixture outcomes
were not used. These are backend subsets; frontend qualification, commercial
Supply, customer pricing, prepaid reconciliation, video and performance remain
open. No full first-release gate is qualified.

## Actual workflows

- Created one unqualified Supplier business and two independently encrypted
  credential records attached to it. Both records intentionally reused the one
  available personal upstream key. This verifies independent Niu configuration,
  not separate upstream credentials/accounts or commercial supply rights.
- Assigned both credentials to the same personal account. Credential A had two
  private model aliases; credential B had one. Each alias mapped to the real
  `openai/gpt-4.1-mini` model. All three aliases completed real streaming requests.
- Disabled credential A. Its model call was denied with HTTP 404, while B still
  completed a streaming request. API reads showed B's credential configuration
  and model mappings unchanged. Restored A using the new revision.
- An API key without the B model grant could not invoke B (HTTP 404). The
  intentionally undisclosed resource response preserves the access boundary.
- Rotated the explicitly granted qualification key. The old token returned 401,
  the new token completed a real B generation, and revocation then denied the
  new token with 401.
- Created a separate account/workspace and wildcard key. Its model listing
  excluded the personal aliases and its attempted B invocation returned 404.
- A regular viewer scoped to the original workspace could read its request
  logs. Foreign workspace logs returned 404, Supplier configuration returned
  403, and attempted key issuance returned 403. Temporary isolation keys and
  the viewer session/operator were revoked after verification.

## Independent records and network diagnosis

Independent PostgreSQL queries found seven completed, provider-reported HTTP 200
attempts across the three independent aliases, plus one unknown-usage HTTP 403
attempt. The seven completions span the initial partial run and its resumed
workflow. There were no customer tariff, customer balance-account or commercial
Supplier-offer bindings. A failed local verification assertion was corrected
from an expected 403 to the actual access-hiding 404; it was not a product defect.

The regional refusal occurred with TUN enabled. Inspecting the actual Clash
connection showed an IP-only destination, a default `Match` rule and a Hong Kong
egress selected by the automatic proxy group. Enabling TLS domain recognition
without destination override and directing the OpenRouter domain rule to an
available US node produced successful actual generations. The connection API
then reported `sniffHost=openrouter.ai`, `DomainSuffix`, and the intended US
node. The modified gateway's real 403 response used the fixed regional message,
with unknown usage rather than fabricated tokens or a free-execution claim.

Network settings and private runtime artifacts remain outside the repository.
This checkpoint neither introduces a proxy exception into Niu nor qualifies
all automatic egress choices. See [network guidance](../reference/openrouter-network.md).

## Remaining scope

Independent upstream account rotation, commercial model/rate offers, customer
selling tariffs, paid request admission, top-up callbacks and exactly-once
settlement remain unverified. No video-capable entitlement was supplied by the
personal text-model check. Run those workflows with their actual current inputs
before beginning integrated performance qualification.
