# Member invitation and first-access design

Countermeasure design, 2026-11-04. Tracks existing `niu-098`, with first-account/recovery limits in `niu-287.5`. This specifies the intended replacement experience; it is not a claim that invitations, verified-email identity or mail delivery are currently implemented. It addresses stories14,15 and22 in the story-led product design.

## Outcome and current burden

An owner should choose who may join, their workspace scope and role. The recipient should follow a recognizable invitation, sign in under a supported identity policy, review the scope and accept. Niu should own invitation state, identity binding, authorization checks and recovery. Neither person should need to understand an operator session token or transport it as routine onboarding configuration.

Current `OperatorCreateForm` says adding a user creates a temporary access token and sends no email. Its expiry choices concern the access credential. `joinOrganization` posts that token to `/api/v1/session/memberships`; the backend requires an already authenticated member, proves the target membership using an operator session token, links it to the account and switches context. It rejects a membership already linked elsewhere. This is an existing credential-linking mechanism, not a purpose-bound invitation lifecycle. Wrapping that same long-lived session token in a URL would preserve the underlying problem.

## Familiar reference and applicable boundary

GitHub's organization invitation pattern separates pending invitation from accepted membership, binds emailed invitations to verified identity, and supports expiry, retry and cancellation. This is a mature reference for the interaction model, not permission to copy all GitHub organization features or claim Niu has its email infrastructure. See [GitHub's invitation documentation](https://docs.github.com/en/organizations/managing-membership-in-your-organization/inviting-users-to-join-your-organization), inspected2026-11-04. The organization People surface was separately inspected during the governance review; no invitation was sent.

Use Niu's existing organization settings and installed dialog/menu primitives. Show human names and explicit scope; internal resource identifiers remain in the API/storage boundary. Keep organization management secondary to everyday model work.

## Owner flow

From organization Members, choose Invite member. The required decisions are recipient, workspace scope and role. Explain each role's actual permission consequences, including organization-wide financial access where applicable. Niu validates the actor's current authority and eligible scopes; an invitation cannot grant rights the actor is not authorized to assign.

Where a supported verified account can be selected, bind the invitation to that account. Where verified email delivery and recipient identity are supported, accept the recipient email under that documented policy. Do not treat a self-edited profile email as verified ownership. If neither mechanism is available, state the actual first-access constraint and provide the supported owner-assisted path; do not fabricate an invitation being delivered.

Create a separate, short-lived, purpose-bound invitation. A seven-day default is a reference-led proposal; its expiry is distinct from member account lifetime and subsequent API-key lifetime. Keep expiry advanced unless installation policy requires an explicit choice. Store only a digest of a high-entropy redemption secret, with organization, allowed workspace scope, role, inviter, intended recipient/binding policy and version.

When configured delivery succeeds, say invitation sent. A created record or queued email is not delivery. Show pending, delivery-failed, expired, canceled and accepted outcomes accurately. An explicit copy-link action may be a supported authorized fallback; label it as an invitation link, with expiry and audience, not as a member credential or proof of acceptance. Never insert an existing operator session token into that link. No email infrastructure is implied by showing this action.

The owner can revisit the pending invitation, cancel it or send a replacement through a supported channel. Replacement invalidates the old redemption secret. A changed role, scope or intended recipient creates a new reviewable invitation version. Accepted members remain managed in the member list, rather than being mislabeled pending.

## Recipient flow

The invitation enters a dedicated accept page and preserves that destination through login. Show the inviting organization, workspace scope, role consequences and intended signed-in identity at the appropriate authorized step. Offer a clear decline/return path. Do not silently switch an existing account or attach membership merely because the page opened.

An existing supported account signs in and explicitly accepts. A person without an account follows the installation's actual first-account policy, preserving the invitation for return. If self-registration or password setup is unsupported, show the precise supported handoff instead of presenting a dead signup or reset link. This branch remains part of `niu-287.5`; an existing-account success cannot qualify first access for a new person.

Acceptance atomically verifies invitation state/expiry/version, recipient binding, current inviter authority and target scope, then creates or links the authorized membership. It records a durable receipt and consumes the invitation exactly once. Replay by the same recipient can reconcile the completed result without duplicating membership; another identity is denied. No general-purpose member session credential is returned to the owner as an invitation side effect.

After acceptance, land in the named authorized workspace and show who pays for model use. A person with no permitted models gets the responsible-owner action, not Provider administration or raw alias instructions. Invitation acceptance does not approve a paid model call, an agent grant or a wider organization role.

## Recovery and revocation

An expired or canceled invitation explains how to request a replacement without leaking another member's details. Delivery failure remains visible to the owner. A sign-in failure preserves the return destination. A lost acceptance response is reconciled against the durable membership result before another grant is attempted.

Pending cancellation prevents future redemption. Removing an accepted membership prevents future authorized member access according to its documented lifetime contract; it does not rewrite historical records. Organization-owned keys and explicitly member-delegated agent grants require their own stated ownership/revocation semantics. Do not silently infer that every creator-owned artifact is either permanent or automatically deleted.

Preserve existing token-based sign-in and membership-linking API compatibility during migration. Move technical credential issuance into explicitly named lifecycle actions for users who need it. Retiring that mechanism requires a separate compatibility/data decision and cannot be achieved by renaming the existing token dialog to Invite.

## Acceptance evidence

Exercise owner and recipient separately through normal browser entry points. Cover existing-account and first-account policy branches; wrong identity, unsupported/unverified email binding, duplicate acceptance, two concurrent recipients, lost response, canceled/expired/replaced invitation, changed inviter role, deleted workspace and cross-organization attempts. Verify the person sees exactly the granted workspace and no upstream credentials.

For configured mail, verify creation, queueing, delivery failure and successful handoff as distinct evidence. Do not send invitations to real people during a fixture run. Test role/scope explanations, supported return paths, keyboard use, open menus, desktop/intermediate/narrow layouts and revisiting invitation state. Receipt/API tests establish atomicity and authorization; they do not establish the usability of either person's complete task.

This design removes the credential-transport burden and makes responsibility explicit. It does not close `niu-098` until the supported recipient journey is implemented and verified, nor does it authorize unsupported self-registration, mail delivery or arbitrary credential disclosure.

## Implementation status (2026-11-06, handoff tree)

Implemented in the handoff working tree (not deployed):

- Migration `0426_member_invitations.sql` adds a purpose-bound invitation record and an immutable lifecycle journal. Only a SHA-256 digest of the redemption secret is stored.
- `POST/GET /api/v1/organizations/{organization}/invitations` create and list invitations with Owner/installation authority, exact role/scope validation and a scope-filtered directory. A new invitation for the same organization, workspace and email revokes the earlier pending link and records a `replaced` event.
- `POST /api/v1/invitations/preview` and `POST /api/v1/session/invitations` preview and accept a link for the signed-in account. Acceptance requires the account's saved sign-in email to match, revalidates the inviter's current Owner authority and target scope, creates only the invited role/scope, consumes the secret once, reconciles same-identity replay without a duplicate membership, and never returns a reusable operator token.
- `DELETE /api/v1/invitations/{invitation}` cancels a pending invitation. Accepted members are managed through the existing member revocation path.
- Dashboard Members now offers **Invite member** instead of new-user temporary-token creation. The dialog explains scope, role and expiry, returns a copyable one-time link, and states that no email was sent because delivery is not configured. Pending invitations can be canceled or replaced. The recipient review page shows the inviting organization, workspace scope, role consequences, intended email and expiry; mismatch, expired, canceled and already-accepted states are explicit.
- Existing temporary-token session APIs and API-compatible member creation remain, but are no longer the member onboarding path in the dashboard. Acceptance refuses to add a second membership in the same organization and does not widen an existing operator record.
- Verification: storage lifecycle tests, gateway HTTP tests, focused storage operator/auth tests and gateway password/operator/audit tests pass locally; dashboard invitation tests, typecheck, i18n audit, dashboard build, SDK tests and generated contract checks pass. Browser create → open → sign in → accept was exercised at desktop and 390 px against the local dev stack.

Remaining security and deployment gaps (not claimed as solved):

- **No email provider is configured.** Delivery always reports `not_configured`; the owner must copy the one-time link. There is no queued/sent/failed delivery evidence, no automatic resend, and no email-provider integration.
- **Identity binding is not verified-mailbox binding.** Acceptance compares the invitation email with the account's saved password-login email. Niu does not verify mailbox ownership, and a token-only account without a saved email cannot accept an email-bound invitation.
- **New-person first access remains unsupported.** A person without an existing account and password credential cannot complete acceptance; the UI states that an existing account is required. Self-registration and invitation-driven password setup remain part of `niu-287.5`.
- The dashboard invitation route places the redemption secret in the URL path (`/invite/{token}`), so it can appear in browser history, referrers or infrastructure request logs. The API itself sends the secret in request bodies and stores only its digest.
- Current authorization still reserves member management to organization Owners (or installation administration). Admin-role members cannot create invitations; enabling that would require a deliberate role-policy change.
- Preview and acceptance have no dedicated rate limiter beyond the existing authenticated-session protections. The invitation secret is high entropy and single-use, but a broader abuse budget was not added.
- No real email delivery, deployment migration execution, or staging/production browser verification was performed from this handoff tree.
