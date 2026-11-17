# Packaged client discovery and revocation — 2026-11-18

Tracking: `niu-nrcn.9` (`CLIENT-03`). This record covers a current-input run with
development tarballs and the actual staging gateway. It does not qualify a
published release, native host integration, paid inference or the final release
candidate.

## Artifact identity

The JavaScript SDK and MCP packages were built from
`d264a3a656042132295970f72eca157b9e80d6d1`, packed, extracted outside the source
checkout, and executed from their extracted contents. Both declare version
`0.1.0`. The hosted gateway used core
`2a4dfb858fba5c94e8d3c466bf0e300ff5108313`.

| Artifact | SHA-256 |
| --- | --- |
| `niu-io-sdk-0.1.0.tgz` | `84d17615b0818d94f9f7bbc652ddb23dbc7dc13018d368525d09538f773a67e1` |
| `niu-io-mcp-0.1.0.tgz` | `de19e847b56a131a652e2953e14ba35941727cdb4a86737ad0c0c395105446bd` |

The completed run occurred at 2026-11-17 18:09:54–18:09:59 UTC
(2026-11-18 in Asia/Shanghai), using Node.js 22.23.2.

## Actual observations

- A temporary, 15-minute workspace credential was restricted to
  `babelark-video/wan3.0-video`. No inference was submitted.
- The packaged SDK's key introspection matched an independent HTTP read.
  Moving usage-window timestamps were checked for freshness separately;
  remaining fields matched. An initial harness comparison included this
  moving timestamp and was corrected; it did not establish a product defect.
- SDK model discovery matched the independent HTTP response and returned
  exactly the permitted model.
- The extracted MCP executable started as a real stdio subprocess, completed
  protocol initialization and tool discovery, and successfully executed
  `inspect_key` and `list_models` against the hosted gateway.
- Administrative revocation returned HTTP 204. An independent key read and
  the existing SDK instance then received HTTP 401. The same MCP process
  returned a tool error after revocation.
- Temporary credentials from both the initial comparison and completed run
  were revoked; local plaintext tokens were removed. No Provider request or
  new charge was generated.

These observations establish the scoped discovery and revocation behavior of
these development artifacts. They do not cover browser device approval,
native host loading, authorized management writes, live model results,
published artifact installation, or the final accepted candidate. Those
acceptance requirements remain tracked in Beads. Fixture outcomes supply no
evidence for this record.
