# API key mutation recovery

Implementation tracking: [#108](https://github.com/niu-io/niu/issues/108). The storage, HTTP and SDK contracts below support dashboard recovery. Dashboard adoption and integrated recovery acceptance are recorded in Beads `niu-lxs.28` and the dated evidence in `docs/ux/remediation.md`. Existing callers without a request identity retain their previous behavior.

## Request identity and outcomes

Send a nonzero UUID in `Idempotency-Key` when creating a workspace key or rotating an existing key. Retain the same identity and input until the outcome is known. The identity is scoped to the authorized workspace and is an internal recovery reference, not a display name or browser resource slug.

The database commits the mutation and its outcome together. Concurrent identical submissions produce one mutation. Reusing the identity with different input conflicts. Validation failures that roll back produce no committed record. Issuance and initial policies remain atomic; rotation preserves existing expiry, grants and limit lineage.

- **201:** a new key secret is returned once with `secret_available: true`.
- **200 on a repeated mutation:** the original key metadata is returned with `secret_available: false`. There is no `token` field. The secret cannot be retrieved.
- **Uncertain transport or server result:** do not assume rollback or submit with a new identity. Read the outcome or retry the original identity and unchanged input.

`GET /api/v1/workspaces/{workspace}/keys/requests/{request}` returns the committed action and key metadata, or null data if no committed outcome was observed. Null is not evidence that an in-flight writer cannot still commit. The read rechecks current workspace write access, never returns a secret, and uses `Cache-Control: no-store`. Role or scope loss must stop recovery actions rather than falling back to another credential.

## Recovering usable access

If creation committed but its secret was lost, explicitly revoke the identified key before requesting a new one. Do not silently issue another credential or describe an undisclosed key as usable.

If rotation committed, the original secret has already been revoked. The recorded replacement can be inspected and explicitly revoked; a new authorized operation is needed to obtain usable access. Repeating the lost operation only identifies that same replacement and cannot reveal or revive either secret.

The SDK exposes `createWorkspaceKeyRequest`, `rotateWorkspaceKeyRequest` and `getWorkspaceKeyRequest`. Mutation results discriminate on `secret_available`; consumers must not treat a recovered result as a newly issued secret. Legacy creation/rotation methods remain compatible and do not automatically gain retry safety.

## Verification boundaries

Storage tests cover concurrent retry, response loss followed by reconstruction from storage, changed-intent rejection, absence before commit, scope isolation, explicit revocation and secret non-retrievability. SDK tests cover request identity propagation and secret-free replay results. HTTP tests exercise the configured gateway and current member permissions. No merchant or model request is needed to verify this contract.

Dashboard recovery preserves pending intent across navigation, reconciles on re-entry, distinguishes validation errors from uncertain outcomes, and presents explicit replacement/revocation choices. Acceptance includes a disposable-gateway browser run with successful responses dropped after commit, exactly-once database assertions, frontend error/role-loss regressions, and rendered desktop/narrow dialog checks. No live credentials or upstream requests are part of that acceptance.

## Reference boundary

OpenRouter's [key creation contract](https://openrouter.ai/docs/api/api-reference/api-keys/create-keys) returns the secret only when the key is created; its [management-key guide](https://openrouter.ai/docs/guides/overview/auth/management-api-keys) likewise instructs users to save it when shown. Niu preserves that one-time-secret model. The durable request identity and lost-response recovery contract described here are Niu implementation decisions, not claims about an equivalent OpenRouter recovery feature. The authenticated OpenRouter key list and Create API Key dialog were inspected on 2026-10-22. Niu retains the name-first single-column dialog, explicit expiration, grouped limits and clear primary action, while adding its supported model-access control. Its lost-response recovery follows the existing Niu funding-recovery pattern; an equivalent OpenRouter recovery behavior was not claimed or induced.
