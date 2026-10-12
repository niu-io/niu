# Chat write guards and empty workspace deletion

Current-input checkpoint on clean runtime `0fe8a71f`, schema 0283, reviewed
2026-10-12. Fixture outcomes provide no evidence.

A protected conversation retains a content-free guard identity after its body
is deleted, preventing stale autosaves from recreating it. The initial guard
foreign key also prevented deletion of its otherwise empty workspace. An actual
API run reproduced 409 after all conversation content was removed.

Schema 0283 allows only these content-free identities to cascade when their
workspace is explicitly deleted. Conversation, credential, request and financial
foreign keys retain their existing restrictive behavior. While the workspace
exists, conversation deletion continues to retain its guard. This does not grant
permission to erase billing or request history.

The existing empty-workspace deletion contract is
`DELETE /admin/v1/organizations/{organization}/projects/{project}`. The legacy
route names remain API compatibility names; this is a workspace action.

## Actual verification

A stopped copy of real request history provided actual two-turn response content.
Installation administration created a zero-funded company and two workspaces,
saved guarded content through the API and deleted it. No inference, payment,
funding receipt or new charge occurred.

- A workspace containing saved conversation content still returned 409.
- After that content was deleted, its guard identity remained. The preceding
  executable refused empty-workspace deletion with 409; the revised one returned
  204 and removed that workspace and its content-free guard only.
- The sibling workspace and its retained guard remained unchanged.
- The source workspace with actual requests/accounting remained protected from
  deletion, returning 409.
- Restart preserved the deletion and remaining sibling state; the deleted
  conversation route returned 404.

An independent process reopened source and final databases. It checked absent
workspace/guard rows, preserved sibling identity and source request workspace,
the native foreign key's cascade action and complete fingerprints for attempts,
charges, ledger, funding, reservations and Supplier earnings. Those business
tables were unchanged. Original installation data, configuration and encrypted
identity were preserved; native update followed a fresh backup and isolated
restore comparison. Raw content and credentials remain private.

This verifies the exercised empty-scope cleanup and restrictive record behavior.
Company deletion, every concurrent scope/content mutation, mixed deployment
versions and complete frontend/workspace lifecycle qualification remain separate.
