//! Purpose-bound member invitations. An invitation is a short-lived,
//! one-time secret bound to one organization scope, role and intended email.
//! Acceptance creates a normal scoped member record for the signed-in account;
//! it never issues or upgrades a reusable operator session token.
use crate::{
    OperatorAuditActor, OperatorPrincipal, OperatorRole, OperatorScope, Store, StoreError,
    operator_audit::insert_operator_audit_event,
};
use serde::Serialize;
use sha2::{Digest, Sha256};
use sqlx::FromRow;
use uuid::Uuid;

const MIN_INVITATION_SECONDS: i64 = 3_600;
const MAX_INVITATION_SECONDS: i64 = 2_592_000;
const MAX_INVITATION_PAGE: i64 = 100;

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum MemberInvitationStatus {
    Pending,
    Expired,
    Canceled,
    Accepted,
}

#[derive(Clone, Debug, Serialize)]
pub struct MemberInvitationView {
    pub id: Uuid,
    pub organization_id: Uuid,
    pub organization_name: String,
    pub organization_slug: String,
    pub project_id: Option<Uuid>,
    pub project_name: Option<String>,
    pub project_slug: Option<String>,
    pub role: OperatorRole,
    pub recipient_email: String,
    pub recipient_name: Option<String>,
    pub status: MemberInvitationStatus,
    /// This installation has no configured email provider. The owner receives
    /// a copyable one-time link instead; the API never claims delivery.
    pub delivery: &'static str,
    pub created_at: String,
    pub expires_at: String,
    pub accepted_at: Option<String>,
    pub revoked_at: Option<String>,
    pub invited_by: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
pub struct MemberInvitationPreview {
    #[serde(flatten)]
    pub invitation: MemberInvitationView,
    pub caller_email: Option<String>,
    pub email_matches: bool,
    pub already_accepted_by_caller: bool,
}

#[derive(Clone, Debug)]
pub struct CreatedMemberInvitation {
    pub invitation: MemberInvitationView,
    /// Returned exactly once. Only the digest is stored.
    pub token: String,
}

#[derive(Clone, Debug)]
pub struct AcceptedMemberInvitation {
    pub invitation: MemberInvitationView,
    pub operator_id: Uuid,
    pub replayed: bool,
}

#[derive(FromRow)]
struct InvitationRow {
    id: Uuid,
    organization_id: Uuid,
    organization_name: String,
    organization_slug: String,
    project_id: Option<Uuid>,
    project_name: Option<String>,
    project_slug: Option<String>,
    role: String,
    recipient_email: String,
    recipient_name: Option<String>,
    created_at: String,
    expires_at: String,
    accepted_at: Option<String>,
    revoked_at: Option<String>,
    expired: bool,
    created_by_kind: String,
    created_by_operator_id: Option<Uuid>,
    accepted_operator_id: Option<Uuid>,
    accepted_identity_id: Option<Uuid>,
    invited_by: Option<String>,
}

impl InvitationRow {
    fn view(self) -> Result<MemberInvitationView, StoreError> {
        let status = if self.accepted_at.is_some() {
            MemberInvitationStatus::Accepted
        } else if self.revoked_at.is_some() {
            MemberInvitationStatus::Canceled
        } else if self.expired {
            MemberInvitationStatus::Expired
        } else {
            MemberInvitationStatus::Pending
        };
        Ok(MemberInvitationView {
            id: self.id,
            organization_id: self.organization_id,
            organization_name: self.organization_name,
            organization_slug: self.organization_slug,
            project_id: self.project_id,
            project_name: self.project_name,
            project_slug: self.project_slug,
            role: OperatorRole::parse(&self.role)?,
            recipient_email: self.recipient_email,
            recipient_name: self.recipient_name,
            status,
            delivery: "not_configured",
            created_at: self.created_at,
            expires_at: self.expires_at,
            accepted_at: self.accepted_at,
            revoked_at: self.revoked_at,
            invited_by: self.invited_by,
        })
    }
}

const INVITATION_SELECT: &str = "SELECT i.id, i.organization_id, o.name AS organization_name, \
    o.slug AS organization_slug, i.project_id, p.name AS project_name, p.route_slug AS project_slug, \
    i.role, i.recipient_email, i.recipient_name, \
    to_jsonb(i.created_at)#>>'{}' AS created_at, to_jsonb(i.expires_at)#>>'{}' AS expires_at, \
    to_jsonb(i.accepted_at)#>>'{}' AS accepted_at, to_jsonb(i.revoked_at)#>>'{}' AS revoked_at, \
    (i.accepted_at IS NULL AND i.revoked_at IS NULL AND i.expires_at <= clock_timestamp()) AS expired, \
    i.created_by_kind, i.created_by_operator_id, i.accepted_operator_id, i.accepted_identity_id, \
    creator.name AS invited_by \
    FROM member_invitations i \
    JOIN organizations o ON o.id = i.organization_id \
    LEFT JOIN projects p ON p.organization_id = i.organization_id AND p.id = i.project_id \
    LEFT JOIN admin_operators creator ON creator.id = i.created_by_operator_id";

fn invitation_token(token: &str) -> Result<[u8; 32], StoreError> {
    let token = token.trim();
    if token.len() < 20
        || token.len() > 512
        || !token.starts_with("niu_invite_")
        || !token.bytes().all(|byte| byte.is_ascii_graphic())
    {
        return Err(StoreError::InvitationUnavailable);
    }
    Ok(Sha256::digest(token.as_bytes()).into())
}

fn validate_recipient_name(name: Option<&str>) -> Result<Option<String>, StoreError> {
    let Some(name) = name.map(str::trim).filter(|name| !name.is_empty()) else {
        return Ok(None);
    };
    if name.chars().count() > 200 || name.chars().any(char::is_control) {
        return Err(StoreError::InvalidInvitation);
    }
    Ok(Some(name.to_string()))
}

/// A current operator must still hold Owner authority over the exact target
/// scope. Installation credentials are not stored as invitation creators and
/// are accepted as-is by the caller's own authorization.
async fn operator_still_owner(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    operator_id: Uuid,
    target: OperatorScope,
) -> Result<bool, StoreError> {
    let row: Option<(String, Uuid, Option<Uuid>, bool)> = sqlx::query_as(
        "SELECT role, organization_id, project_id, revoked_at IS NOT NULL \
         FROM admin_operators WHERE id = $1 FOR SHARE",
    )
    .bind(operator_id)
    .fetch_optional(&mut **tx)
    .await?;
    Ok(matches!(
        row,
        Some((ref role, organization_id, project_id, false))
            if role == "owner"
                && organization_id == target.organization_id
                && project_id.is_none_or(|project| target.project_id == Some(project))
    ))
}

async fn require_owner(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    actor: OperatorAuditActor,
    target: OperatorScope,
) -> Result<(), StoreError> {
    match actor {
        OperatorAuditActor::Installation => Ok(()),
        OperatorAuditActor::Operator(operator_id) => {
            if operator_still_owner(tx, operator_id, target).await? {
                Ok(())
            } else {
                Err(StoreError::InvitationAuthorityLost)
            }
        }
    }
}

async fn insert_invitation_event(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    invitation_id: Uuid,
    action: &'static str,
    actor: OperatorAuditActor,
    organization_id: Uuid,
) -> Result<(), StoreError> {
    let (actor_kind, actor_operator_id) = actor.kind_and_id();
    sqlx::query(
        "INSERT INTO member_invitation_events \
         (id, invitation_id, action, actor_kind, actor_operator_id, organization_id) \
         VALUES ($1, $2, $3, $4, $5, $6)",
    )
    .bind(Uuid::new_v4())
    .bind(invitation_id)
    .bind(action)
    .bind(actor_kind)
    .bind(actor_operator_id)
    .bind(organization_id)
    .execute(&mut **tx)
    .await?;
    Ok(())
}

impl Store {
    /// Create a one-time invitation and replace any earlier pending invitation
    /// for the same organization, workspace and email. Replacement invalidates
    /// the previous link so an owner can recover a lost link without leaving
    /// multiple redeemable secrets.
    pub async fn create_member_invitation(
        &self,
        scope: OperatorScope,
        recipient_email: &str,
        recipient_name: Option<&str>,
        role: OperatorRole,
        expires_in_seconds: i64,
        actor: OperatorAuditActor,
    ) -> Result<CreatedMemberInvitation, StoreError> {
        let recipient_email = crate::password_logins::email_address(recipient_email)
            .ok_or(StoreError::InvalidInvitation)?;
        let recipient_name = validate_recipient_name(recipient_name)?;
        if !(MIN_INVITATION_SECONDS..=MAX_INVITATION_SECONDS).contains(&expires_in_seconds) {
            return Err(StoreError::InvalidInvitation);
        }

        let token = format!(
            "niu_invite_{}{}",
            Uuid::new_v4().simple(),
            Uuid::new_v4().simple()
        );
        let digest = Sha256::digest(token.as_bytes());
        let invitation_id = Uuid::new_v4();

        let mut tx = self.begin_bounded_recording().await?;
        require_owner(&mut tx, actor, scope).await?;
        let organization_exists: Option<Uuid> =
            sqlx::query_scalar("SELECT id FROM organizations WHERE id = $1 FOR SHARE")
                .bind(scope.organization_id)
                .fetch_optional(&mut *tx)
                .await?;
        if organization_exists.is_none() {
            return Err(StoreError::Conflict);
        }
        if let Some(project_id) = scope.project_id {
            let project_exists: Option<Uuid> = sqlx::query_scalar(
                "SELECT id FROM projects WHERE organization_id = $1 AND id = $2 FOR SHARE",
            )
            .bind(scope.organization_id)
            .bind(project_id)
            .fetch_optional(&mut *tx)
            .await?;
            if project_exists.is_none() {
                return Err(StoreError::Conflict);
            }
        }

        let already_member: bool = sqlx::query_scalar(
            "SELECT EXISTS(
                SELECT 1
                FROM member_password_credentials c
                JOIN account_memberships credential_membership
                  ON credential_membership.operator_id = c.operator_id
                JOIN account_memberships target_membership
                  ON target_membership.identity_id = credential_membership.identity_id
                JOIN admin_operators target
                  ON target.id = target_membership.operator_id
                WHERE c.email = $1
                  AND target_membership.organization_id = $2
                  AND target.revoked_at IS NULL
            )",
        )
        .bind(&recipient_email)
        .bind(scope.organization_id)
        .fetch_one(&mut *tx)
        .await?;
        if already_member {
            return Err(StoreError::InvitationRecipientAlreadyMember);
        }

        let replaced: Vec<Uuid> = sqlx::query_scalar(
            "UPDATE member_invitations SET revoked_at = clock_timestamp() \
             WHERE organization_id = $1 \
               AND project_id IS NOT DISTINCT FROM $2 \
               AND recipient_email = $3 \
               AND accepted_at IS NULL AND revoked_at IS NULL \
               AND expires_at > clock_timestamp() \
             RETURNING id",
        )
        .bind(scope.organization_id)
        .bind(scope.project_id)
        .bind(&recipient_email)
        .fetch_all(&mut *tx)
        .await?;
        for replaced_id in replaced {
            insert_invitation_event(
                &mut tx,
                replaced_id,
                "replaced",
                actor,
                scope.organization_id,
            )
            .await?;
        }

        let (created_by_kind, created_by_operator_id) = actor.kind_and_id();
        sqlx::query(
            "INSERT INTO member_invitations \
             (id, organization_id, project_id, role, recipient_email, recipient_name, token_sha256, \
              created_by_kind, created_by_operator_id, expires_at) \
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, \
                     clock_timestamp() + make_interval(secs => $10::double precision))",
        )
        .bind(invitation_id)
        .bind(scope.organization_id)
        .bind(scope.project_id)
        .bind(role.as_str())
        .bind(&recipient_email)
        .bind(recipient_name.as_deref())
        .bind(digest.as_slice())
        .bind(created_by_kind)
        .bind(created_by_operator_id)
        .bind(expires_in_seconds)
        .execute(&mut *tx)
        .await?;
        insert_invitation_event(
            &mut tx,
            invitation_id,
            "created",
            actor,
            scope.organization_id,
        )
        .await?;

        let row: InvitationRow = sqlx::query_as(&format!(
            "{INVITATION_SELECT} WHERE i.id = $1 AND i.organization_id = $2"
        ))
        .bind(invitation_id)
        .bind(scope.organization_id)
        .fetch_one(&mut *tx)
        .await?;
        let invitation = row.view()?;
        tx.commit().await?;
        Ok(CreatedMemberInvitation { invitation, token })
    }

    /// Owner-only, scope-filtered invitation directory. Project-scoped owners
    /// see only invitations for their workspace.
    pub async fn member_invitations(
        &self,
        scope: OperatorScope,
    ) -> Result<Vec<MemberInvitationView>, StoreError> {
        let rows: Vec<InvitationRow> = sqlx::query_as(&format!(
            "{INVITATION_SELECT} \
             WHERE i.organization_id = $1 AND ($2::uuid IS NULL OR i.project_id = $2) \
             ORDER BY i.created_at DESC, i.id DESC LIMIT $3"
        ))
        .bind(scope.organization_id)
        .bind(scope.project_id)
        .bind(MAX_INVITATION_PAGE)
        .fetch_all(&self.pool)
        .await?;
        rows.into_iter().map(InvitationRow::view).collect()
    }

    pub async fn member_invitation_scope(
        &self,
        invitation_id: Uuid,
    ) -> Result<Option<OperatorScope>, StoreError> {
        let row: Option<(Uuid, Option<Uuid>)> = sqlx::query_as(
            "SELECT organization_id, project_id FROM member_invitations WHERE id = $1",
        )
        .bind(invitation_id)
        .fetch_optional(&self.pool)
        .await?;
        Ok(row.map(|(organization_id, project_id)| OperatorScope {
            organization_id,
            project_id,
        }))
    }

    /// Cancel a pending invitation. Already-canceled invitations remain
    /// idempotent; accepted invitations must be managed through member access.
    pub async fn cancel_member_invitation(
        &self,
        invitation_id: Uuid,
        actor: OperatorAuditActor,
    ) -> Result<(), StoreError> {
        let mut tx = self.begin_bounded_recording().await?;
        let row: Option<(Uuid, Option<Uuid>, bool, bool)> = sqlx::query_as(
            "SELECT organization_id, project_id, accepted_at IS NOT NULL, \
                    revoked_at IS NOT NULL \
             FROM member_invitations WHERE id = $1 FOR UPDATE",
        )
        .bind(invitation_id)
        .fetch_optional(&mut *tx)
        .await?;
        let Some((organization_id, project_id, accepted, revoked)) = row else {
            return Err(StoreError::InvitationUnavailable);
        };
        let scope = OperatorScope {
            organization_id,
            project_id,
        };
        require_owner(&mut tx, actor, scope).await?;
        if accepted {
            return Err(StoreError::InvitationAlreadyAccepted);
        }
        if revoked {
            tx.commit().await?;
            return Ok(());
        }
        sqlx::query(
            "UPDATE member_invitations SET revoked_at = clock_timestamp() \
             WHERE id = $1 AND revoked_at IS NULL",
        )
        .bind(invitation_id)
        .execute(&mut *tx)
        .await?;
        insert_invitation_event(&mut tx, invitation_id, "canceled", actor, organization_id).await?;
        tx.commit().await?;
        Ok(())
    }

    /// Read invitation details after sign-in. The link holder can see the
    /// intended identity and status; acceptance still requires an email match.
    pub async fn preview_member_invitation(
        &self,
        principal: OperatorPrincipal,
        token: &str,
    ) -> Result<MemberInvitationPreview, StoreError> {
        let digest = invitation_token(token)?;
        let identity_id: Uuid = sqlx::query_scalar(
            "SELECT COALESCE(
                (SELECT identity_id FROM account_memberships WHERE operator_id = $1),
                $1
             )",
        )
        .bind(principal.id)
        .fetch_one(&self.pool)
        .await?;
        let caller_email: Option<String> = sqlx::query_scalar(
            "SELECT c.email FROM member_password_credentials c \
             WHERE c.operator_id = $1 \
                OR c.operator_id IN (
                    SELECT operator_id FROM account_memberships WHERE identity_id = $1
                ) \
             ORDER BY (c.operator_id = $1) DESC LIMIT 1",
        )
        .bind(identity_id)
        .fetch_optional(&self.pool)
        .await?;
        let row: InvitationRow =
            sqlx::query_as(&format!("{INVITATION_SELECT} WHERE i.token_sha256 = $1"))
                .bind(digest.as_slice())
                .fetch_optional(&self.pool)
                .await?
                .ok_or(StoreError::InvitationUnavailable)?;
        let email_matches = caller_email
            .as_deref()
            .is_some_and(|email| email == row.recipient_email);
        let already_accepted_by_caller = row.accepted_identity_id == Some(identity_id);
        Ok(MemberInvitationPreview {
            invitation: row.view()?,
            caller_email,
            email_matches,
            already_accepted_by_caller,
        })
    }

    /// Redeem an invitation exactly once for the signed-in account. Creates a
    /// new member record with the invitation's exact role/scope and switches
    /// the current session to it. A same-identity replay returns the completed
    /// membership without creating another one.
    pub async fn accept_member_invitation(
        &self,
        principal: OperatorPrincipal,
        token: &str,
    ) -> Result<AcceptedMemberInvitation, StoreError> {
        let digest = invitation_token(token)?;
        let mut tx = self.begin_bounded_recording().await?;

        let session_row: Option<(Uuid, i64, bool)> = sqlx::query_as(
            "SELECT operator_id, expires_at_unix, \
                    (NOT browser_session OR admin_mode_until > clock_timestamp()) IS TRUE \
             FROM admin_sessions \
             WHERE id = $1 AND revoked_at IS NULL \
               AND expires_at_unix > extract(epoch FROM clock_timestamp())::bigint \
             FOR UPDATE",
        )
        .bind(principal.session_id)
        .fetch_optional(&mut *tx)
        .await?;
        let Some((session_operator_id, _expires_at_unix, _allow_platform_admin)) = session_row
        else {
            return Err(StoreError::Unauthorized);
        };
        if session_operator_id != principal.id {
            return Err(StoreError::Unauthorized);
        }
        let current_operator: Option<(Option<Uuid>, bool)> = sqlx::query_as(
            "SELECT organization_id, revoked_at IS NOT NULL \
             FROM admin_operators WHERE id = $1 FOR SHARE",
        )
        .bind(principal.id)
        .fetch_optional(&mut *tx)
        .await?;
        let Some((Some(current_org_id), false)) = current_operator else {
            return Err(StoreError::Unauthorized);
        };
        if current_org_id != principal.scope.organization_id {
            return Err(StoreError::Unauthorized);
        }
        let caller_identity_id =
            crate::account_organization_creation::ensure_operator_identity_in_tx(
                &mut tx,
                principal.id,
                current_org_id,
            )
            .await?;
        let caller_email: Option<String> = sqlx::query_scalar(
            "SELECT c.email FROM member_password_credentials c \
             WHERE c.operator_id = $1 \
                OR c.operator_id IN (
                    SELECT operator_id FROM account_memberships WHERE identity_id = $1
                ) \
             ORDER BY (c.operator_id = $1) DESC LIMIT 1",
        )
        .bind(caller_identity_id)
        .fetch_optional(&mut *tx)
        .await?;

        let row: InvitationRow = sqlx::query_as(&format!(
            "{INVITATION_SELECT} WHERE i.token_sha256 = $1 FOR UPDATE OF i"
        ))
        .bind(digest.as_slice())
        .fetch_optional(&mut *tx)
        .await?
        .ok_or(StoreError::InvitationUnavailable)?;
        let target = OperatorScope {
            organization_id: row.organization_id,
            project_id: row.project_id,
        };

        if row.accepted_at.is_some() {
            if row.accepted_identity_id == Some(caller_identity_id) {
                let Some(operator_id) = row.accepted_operator_id else {
                    return Err(StoreError::InvitationUnavailable);
                };
                let active_and_linked: bool = sqlx::query_scalar(
                    "SELECT EXISTS(
                        SELECT 1 FROM admin_operators o
                        JOIN account_memberships m ON m.operator_id = o.id
                        WHERE o.id = $1 AND o.revoked_at IS NULL
                          AND m.identity_id = $2
                    )",
                )
                .bind(operator_id)
                .bind(caller_identity_id)
                .fetch_one(&mut *tx)
                .await?;
                if !active_and_linked {
                    return Err(StoreError::InvitationUnavailable);
                }
                sqlx::query(
                    "UPDATE admin_sessions SET operator_id = $2 \
                     WHERE id = $1 AND revoked_at IS NULL",
                )
                .bind(principal.session_id)
                .bind(operator_id)
                .execute(&mut *tx)
                .await?;
                let invitation = row.view()?;
                tx.commit().await?;
                return Ok(AcceptedMemberInvitation {
                    invitation,
                    operator_id,
                    replayed: true,
                });
            }
            return Err(StoreError::InvitationUnavailable);
        }
        if row.revoked_at.is_some() || row.expired {
            return Err(StoreError::InvitationUnavailable);
        }
        if !caller_email
            .as_deref()
            .is_some_and(|email| email == row.recipient_email)
        {
            return Err(StoreError::InvitationIdentityMismatch);
        }
        if row.created_by_kind == "operator" {
            let Some(inviter_id) = row.created_by_operator_id else {
                return Err(StoreError::InvitationAuthorityLost);
            };
            if !operator_still_owner(&mut tx, inviter_id, target).await? {
                return Err(StoreError::InvitationAuthorityLost);
            }
        }

        let organization_exists: Option<Uuid> =
            sqlx::query_scalar("SELECT id FROM organizations WHERE id = $1 FOR SHARE")
                .bind(target.organization_id)
                .fetch_optional(&mut *tx)
                .await?;
        if organization_exists.is_none() {
            return Err(StoreError::InvitationUnavailable);
        }
        if let Some(project_id) = target.project_id {
            let project_exists: Option<Uuid> = sqlx::query_scalar(
                "SELECT id FROM projects WHERE organization_id = $1 AND id = $2 FOR SHARE",
            )
            .bind(target.organization_id)
            .bind(project_id)
            .fetch_optional(&mut *tx)
            .await?;
            if project_exists.is_none() {
                return Err(StoreError::InvitationUnavailable);
            }
        }
        let existing_membership: Option<Uuid> = sqlx::query_scalar(
            "SELECT operator_id FROM account_memberships \
             WHERE identity_id = $1 AND organization_id = $2 FOR UPDATE",
        )
        .bind(caller_identity_id)
        .bind(target.organization_id)
        .fetch_optional(&mut *tx)
        .await?;
        if existing_membership.is_some() {
            return Err(StoreError::InvitationRecipientAlreadyMember);
        }

        let invitation_id = row.id;
        let invitation_role = row.role.as_str();
        let inviter_actor = match row.created_by_operator_id {
            Some(inviter_id) if row.created_by_kind == "operator" => {
                OperatorAuditActor::Operator(inviter_id)
            }
            _ => OperatorAuditActor::Installation,
        };
        let name = match row.recipient_name.as_deref() {
            Some(name) => name.to_string(),
            None => {
                sqlx::query_scalar("SELECT name FROM admin_operators WHERE id = $1")
                    .bind(principal.id)
                    .fetch_one(&mut *tx)
                    .await?
            }
        };
        let operator_id = Uuid::new_v4();
        sqlx::query(
            "INSERT INTO admin_operators (id, name, role, organization_id, project_id) \
             VALUES ($1, $2, $3, $4, $5)",
        )
        .bind(operator_id)
        .bind(&name)
        .bind(invitation_role)
        .bind(target.organization_id)
        .bind(target.project_id)
        .execute(&mut *tx)
        .await?;
        sqlx::query(
            "INSERT INTO account_memberships (identity_id, operator_id, organization_id) \
             VALUES ($1, $2, $3)",
        )
        .bind(caller_identity_id)
        .bind(operator_id)
        .bind(target.organization_id)
        .execute(&mut *tx)
        .await?;
        sqlx::query(
            "UPDATE member_invitations \
             SET accepted_at = clock_timestamp(), accepted_operator_id = $2, \
                 accepted_identity_id = $3 \
             WHERE id = $1 AND accepted_at IS NULL AND revoked_at IS NULL",
        )
        .bind(invitation_id)
        .bind(operator_id)
        .bind(caller_identity_id)
        .execute(&mut *tx)
        .await?;
        insert_invitation_event(
            &mut tx,
            invitation_id,
            "accepted",
            OperatorAuditActor::Operator(operator_id),
            target.organization_id,
        )
        .await?;
        insert_operator_audit_event(
            &mut tx,
            inviter_actor,
            "operator_created",
            operator_id,
            None,
            target,
        )
        .await?;
        sqlx::query(
            "UPDATE admin_sessions SET operator_id = $2 \
             WHERE id = $1 AND revoked_at IS NULL",
        )
        .bind(principal.session_id)
        .bind(operator_id)
        .execute(&mut *tx)
        .await?;

        let accepted_row: InvitationRow =
            sqlx::query_as(&format!("{INVITATION_SELECT} WHERE i.id = $1"))
                .bind(invitation_id)
                .fetch_one(&mut *tx)
                .await?;
        let invitation = accepted_row.view()?;
        tx.commit().await?;
        Ok(AcceptedMemberInvitation {
            invitation,
            operator_id,
            replayed: false,
        })
    }
}
