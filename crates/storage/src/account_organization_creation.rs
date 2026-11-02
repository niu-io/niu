//! Self-service organization creation, multi-organization session switching,
//! and explicit membership linking for authenticated members.
use crate::{
    NamedResource, OperatorPrincipal, OperatorRole, OperatorScope, OrganizationRoute, Store,
    StoreError, WorkspaceRoute,
};
use sha2::{Digest, Sha256};
use uuid::Uuid;

const RESERVED_ORGANIZATION_SLUGS: &[&str] = &[
    "default",
    "new",
    "by-route",
    "settings",
    "members",
    "workspaces",
    "billing",
    "credits",
    "invoices",
    "payments",
    "providers",
    "settlements",
];

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CreatedAccountOrganization {
    pub organization_id: Uuid,
    pub operator_id: Uuid,
    pub slug: String,
    pub name: String,
    pub currency: String,
}

impl Store {
    /// Atomically creates a zero-funded organization, an organization-wide
    /// `owner` operator membership linked to the caller's account identity,
    /// an operator audit event, and an idempotency receipt.
    pub async fn create_account_organization(
        &self,
        principal: OperatorPrincipal,
        name: &str,
        currency: &str,
        key_sha256: &[u8],
    ) -> Result<CreatedAccountOrganization, StoreError> {
        self.create_account_organization_with_slug(
            principal,
            name,
            None,
            currency,
            Some(key_sha256),
        )
        .await
    }

    pub async fn create_account_organization_with_slug(
        &self,
        principal: OperatorPrincipal,
        name: &str,
        slug: Option<&str>,
        currency: &str,
        key_sha256: Option<&[u8]>,
    ) -> Result<CreatedAccountOrganization, StoreError> {
        let name = validate_company_name(name)?;
        let explicit_slug = slug.map(validate_organization_slug).transpose()?;
        let currency = normalize_company_currency(currency)?;
        if key_sha256.is_some_and(|key| key.len() != 32) {
            return Err(StoreError::Conflict);
        }
        let request_sha256 =
            create_account_organization_request_sha256(&name, explicit_slug.as_deref(), &currency)?;

        let mut tx = self.begin_bounded_recording().await?;
        let active_session_operator: Option<Uuid> = sqlx::query_scalar(
            "SELECT operator_id FROM admin_sessions \
             WHERE id = $1 \
               AND revoked_at IS NULL \
               AND expires_at_unix > extract(epoch FROM clock_timestamp())::bigint \
             FOR SHARE",
        )
        .bind(principal.session_id)
        .fetch_optional(&mut *tx)
        .await?;
        if active_session_operator != Some(principal.id) {
            return Err(StoreError::Unauthorized);
        }

        let current_operator: Option<(String, Option<Uuid>, bool)> = sqlx::query_as(
            "SELECT name, organization_id, revoked_at IS NOT NULL \
             FROM admin_operators \
             WHERE id = $1 \
             FOR SHARE",
        )
        .bind(principal.id)
        .fetch_optional(&mut *tx)
        .await?;
        let Some((operator_name, Some(current_org_id), false)) = current_operator else {
            return Err(StoreError::Unauthorized);
        };
        if current_org_id != principal.scope.organization_id {
            return Err(StoreError::Unauthorized);
        }

        let identity_id =
            ensure_operator_identity_in_tx(&mut tx, principal.id, current_org_id).await?;

        if let Some(key) = key_sha256 {
            sqlx::query(
                "SELECT pg_advisory_xact_lock(
                    hashtextextended('niu-account-org-create:' || $1::text || ':' || encode($2::bytea, 'hex'), 0)
                )",
            )
            .bind(identity_id)
            .bind(key)
            .execute(&mut *tx)
            .await?;

            let existing: Option<(Uuid, Uuid, Vec<u8>, String, bool)> = sqlx::query_as(
                "SELECT r.organization_id, r.operator_id, r.request_sha256, o.slug, op.revoked_at IS NOT NULL \
                 FROM account_organization_creation_receipts r \
                 JOIN organizations o ON o.id = r.organization_id \
                 JOIN admin_operators op ON op.id = r.operator_id \
                 WHERE r.identity_id = $1 AND r.key_sha256 = $2",
            )
            .bind(identity_id)
            .bind(key)
            .fetch_optional(&mut *tx)
            .await?;
            if let Some((
                organization_id,
                operator_id,
                saved_request_sha256,
                saved_slug,
                operator_revoked,
            )) = existing
            {
                if saved_request_sha256 != request_sha256 || operator_revoked {
                    return Err(StoreError::Conflict);
                }
                tx.commit().await?;
                return Ok(CreatedAccountOrganization {
                    organization_id,
                    operator_id,
                    slug: saved_slug,
                    name,
                    currency,
                });
            }
        }

        let resolved_slug = if let Some(explicit_slug) = explicit_slug {
            sqlx::query(
                "SELECT pg_advisory_xact_lock(hashtextextended('niu-organization-slugs', 0))",
            )
            .execute(&mut *tx)
            .await?;
            let taken: bool = sqlx::query_scalar(
                "SELECT EXISTS(SELECT 1 FROM organizations WHERE slug = $1) \
                 OR EXISTS(SELECT 1 FROM organization_slug_aliases WHERE slug = $1)",
            )
            .bind(&explicit_slug)
            .fetch_one(&mut *tx)
            .await?;
            if taken {
                return Err(StoreError::OrganizationSlugTaken);
            }
            explicit_slug
        } else {
            let base_slug = crate::workspace_creation::workspace_slug_from_name(&name);
            sqlx::query_scalar("SELECT niu_available_organization_slug($1)")
                .bind(base_slug)
                .fetch_one(&mut *tx)
                .await?
        };

        let organization_id = Uuid::new_v4();
        let operator_id = Uuid::new_v4();
        sqlx::query("INSERT INTO organizations (id, name, slug) VALUES ($1, $2, $3)")
            .bind(organization_id)
            .bind(&name)
            .bind(&resolved_slug)
            .execute(&mut *tx)
            .await
            .map_err(map_organization_slug_error)?;
        sqlx::query(
            "INSERT INTO customer_balance_accounts (id, organization_id, currency) \
             VALUES ($1, $2, $3)",
        )
        .bind(Uuid::new_v4())
        .bind(organization_id)
        .bind(&currency)
        .execute(&mut *tx)
        .await?;
        sqlx::query(
            "INSERT INTO admin_operators (id, name, role, organization_id, project_id) \
             VALUES ($1, $2, 'owner', $3, NULL)",
        )
        .bind(operator_id)
        .bind(&operator_name)
        .bind(organization_id)
        .execute(&mut *tx)
        .await?;
        sqlx::query(
            "INSERT INTO account_memberships (identity_id, operator_id, organization_id) \
             VALUES ($1, $2, $3)",
        )
        .bind(identity_id)
        .bind(operator_id)
        .bind(organization_id)
        .execute(&mut *tx)
        .await?;
        crate::operator_audit::insert_operator_audit_event(
            &mut tx,
            crate::OperatorAuditActor::Operator(operator_id),
            "operator_created",
            operator_id,
            None,
            OperatorScope {
                organization_id,
                project_id: None,
            },
        )
        .await?;
        if let Some(key) = key_sha256 {
            sqlx::query(
                "INSERT INTO account_organization_creation_receipts \
                 (identity_id, key_sha256, request_sha256, organization_id, operator_id) \
                 VALUES ($1, $2, $3, $4, $5)",
            )
            .bind(identity_id)
            .bind(key)
            .bind(request_sha256.as_slice())
            .bind(organization_id)
            .bind(operator_id)
            .execute(&mut *tx)
            .await?;
        }

        tx.commit().await?;
        Ok(CreatedAccountOrganization {
            organization_id,
            operator_id,
            slug: resolved_slug,
            name,
            currency,
        })
    }

    /// Rename an organization while preserving its immutable `slug` and UUID.
    pub async fn rename_organization(
        &self,
        organization_id: Uuid,
        name: &str,
        member: Option<OperatorPrincipal>,
    ) -> Result<Option<NamedResource>, StoreError> {
        let name = validate_company_name(name).map_err(|_| StoreError::InvalidVendor)?;
        let mut tx = self.begin_bounded_recording().await?;
        if let Some(member) = member {
            Self::authorize_company_writer_in_tx(&mut tx, organization_id, member).await?;
        }
        let updated: Option<NamedResource> = sqlx::query_as(
            "UPDATE organizations SET name = $2 WHERE id = $1 RETURNING id, name, slug",
        )
        .bind(organization_id)
        .bind(&name)
        .fetch_optional(&mut *tx)
        .await?;
        tx.commit().await?;
        Ok(updated)
    }

    /// Lists all active organizations the authenticated member can access across
    /// `account_memberships`, ordered by `(organizations.created_at, organizations.id)`.
    pub async fn member_organization_page(
        &self,
        principal: OperatorPrincipal,
        after: Option<Uuid>,
        limit: i64,
    ) -> Result<Vec<NamedResource>, StoreError> {
        if !(1..=1001).contains(&limit) {
            return Err(StoreError::Conflict);
        }
        let mut tx = self.begin_bounded_read_snapshot().await?;
        let active_session_operator: Option<Uuid> = sqlx::query_scalar(
            "SELECT operator_id FROM admin_sessions \
             WHERE id = $1 \
               AND revoked_at IS NULL \
               AND expires_at_unix > extract(epoch FROM clock_timestamp())::bigint",
        )
        .bind(principal.session_id)
        .fetch_optional(&mut *tx)
        .await?;
        if active_session_operator != Some(principal.id) {
            return Err(StoreError::Unauthorized);
        }
        let active_operator: Option<(Option<Uuid>, bool)> = sqlx::query_as(
            "SELECT organization_id, revoked_at IS NOT NULL \
             FROM admin_operators \
             WHERE id = $1",
        )
        .bind(principal.id)
        .fetch_optional(&mut *tx)
        .await?;
        let Some((Some(current_org_id), false)) = active_operator else {
            return Err(StoreError::Unauthorized);
        };
        if current_org_id != principal.scope.organization_id {
            return Err(StoreError::Unauthorized);
        }
        let identity_id: Uuid = sqlx::query_scalar(
            "SELECT COALESCE(
                (SELECT identity_id FROM account_memberships WHERE operator_id = $1),
                $1
             )",
        )
        .bind(principal.id)
        .fetch_one(&mut *tx)
        .await?;

        let cursor: Option<(String, Uuid)> = if let Some(after) = after {
            Some(
                sqlx::query_as(
                    "SELECT org.created_at::text, org.id \
                     FROM organizations org \
                     WHERE org.id = $1 \
                       AND (org.id = $2 OR EXISTS (
                           SELECT 1 FROM account_memberships m
                           JOIN admin_operators o ON o.id = m.operator_id AND o.organization_id = m.organization_id
                           WHERE m.identity_id = $3
                             AND m.organization_id = org.id
                             AND o.revoked_at IS NULL
                       ))",
                )
                .bind(after)
                .bind(current_org_id)
                .bind(identity_id)
                .fetch_optional(&mut *tx)
                .await?
                .ok_or(StoreError::Conflict)?,
            )
        } else {
            None
        };

        let rows: Vec<NamedResource> = sqlx::query_as(
            "SELECT org.id, org.name, org.slug \
             FROM organizations org \
             WHERE (org.id = $1 OR EXISTS (
                 SELECT 1 FROM account_memberships m
                 JOIN admin_operators o ON o.id = m.operator_id AND o.organization_id = m.organization_id
                 WHERE m.identity_id = $2
                   AND m.organization_id = org.id
                   AND o.revoked_at IS NULL
             )) \
               AND ($3::text IS NULL OR (org.created_at, org.id) > ($3::text::timestamptz, $4::uuid)) \
             ORDER BY org.created_at, org.id \
             LIMIT $5",
        )
        .bind(current_org_id)
        .bind(identity_id)
        .bind(cursor.as_ref().map(|c| &c.0))
        .bind(cursor.as_ref().map(|c| c.1))
        .bind(limit)
        .fetch_all(&mut *tx)
        .await?;
        tx.commit().await?;
        Ok(rows)
    }

    pub async fn member_organizations(
        &self,
        principal: OperatorPrincipal,
    ) -> Result<Vec<NamedResource>, StoreError> {
        self.member_organization_page(principal, None, 1000).await
    }

    pub async fn organization_route_for_member(
        &self,
        principal: OperatorPrincipal,
        route_slug: &str,
    ) -> Result<Option<OrganizationRoute>, StoreError> {
        let parsed_id = Uuid::parse_str(route_slug.trim()).ok();
        Ok(sqlx::query_as(
            "SELECT o.id, o.name, o.slug, \
                    ARRAY(SELECT a.slug FROM organization_slug_aliases a WHERE a.organization_id = o.id) AS slug_aliases \
             FROM organizations o \
             WHERE (o.slug = $1 \
                 OR EXISTS (SELECT 1 FROM organization_slug_aliases a WHERE a.organization_id = o.id AND a.slug = $1) \
                 OR ($2::uuid IS NOT NULL AND o.id = $2)) \
               AND (o.id = $3 OR EXISTS (
                   SELECT 1 FROM account_memberships m
                   JOIN admin_operators mo ON mo.id = m.operator_id AND mo.organization_id = m.organization_id
                   WHERE m.identity_id = COALESCE((SELECT im.identity_id FROM account_memberships im WHERE im.operator_id = $4), $4)
                     AND m.organization_id = o.id
                     AND mo.revoked_at IS NULL
               ))",
        )
        .bind(route_slug.trim())
        .bind(parsed_id)
        .bind(principal.scope.organization_id)
        .bind(principal.id)
        .fetch_optional(&self.pool)
        .await?)
    }

    pub async fn workspace_route_for_member(
        &self,
        principal: OperatorPrincipal,
        route_slug: &str,
    ) -> Result<Option<WorkspaceRoute>, StoreError> {
        Ok(sqlx::query_as(
            "SELECT p.id, p.organization_id, p.name, p.route_slug, p.route_slug AS slug, \
                    ARRAY(SELECT a.slug FROM workspace_slug_aliases a WHERE a.project_id = p.id) AS slug_aliases \
             FROM projects p \
             WHERE (p.route_slug = $1 OR EXISTS (SELECT 1 FROM workspace_slug_aliases a WHERE a.project_id = p.id AND a.slug = $1)) \
               AND (
                   (p.organization_id = $2 AND ($3::uuid IS NULL OR p.id = $3))
                   OR EXISTS (
                       SELECT 1 FROM account_memberships m
                       JOIN admin_operators mo ON mo.id = m.operator_id AND mo.organization_id = m.organization_id
                       WHERE m.identity_id = COALESCE((SELECT im.identity_id FROM account_memberships im WHERE im.operator_id = $4), $4)
                         AND m.organization_id = p.organization_id
                         AND mo.revoked_at IS NULL
                         AND (mo.project_id IS NULL OR mo.project_id = p.id)
                   )
               )",
        )
        .bind(route_slug)
        .bind(principal.scope.organization_id)
        .bind(principal.scope.project_id)
        .bind(principal.id)
        .fetch_optional(&self.pool)
        .await?)
    }

    /// Switches the caller's authenticated session to another active organization
    /// membership belonging to the same `account_identities` row. Accepts either
    /// organization UUID or organization slug/alias.
    pub async fn switch_session_organization(
        &self,
        principal: OperatorPrincipal,
        target_organization: &str,
    ) -> Result<OperatorPrincipal, StoreError> {
        self.switch_session_organization_with_expiry(principal, target_organization)
            .await
            .map(|(updated, _)| updated)
    }

    pub async fn switch_session_organization_with_expiry(
        &self,
        principal: OperatorPrincipal,
        target_organization: &str,
    ) -> Result<(OperatorPrincipal, i64), StoreError> {
        let target_raw = target_organization.trim();
        if target_raw.is_empty() || target_raw.len() > 120 {
            return Err(StoreError::InvalidOperator);
        }
        let parsed_org_id = Uuid::parse_str(target_raw).ok();

        let mut tx = self.begin_bounded_recording().await?;
        let session_row: Option<(Uuid, i64, bool)> = sqlx::query_as(
            "SELECT operator_id, expires_at_unix, \
                    (NOT browser_session OR admin_mode_until > clock_timestamp()) IS TRUE \
             FROM admin_sessions \
             WHERE id = $1 \
               AND revoked_at IS NULL \
               AND expires_at_unix > extract(epoch FROM clock_timestamp())::bigint \
             FOR UPDATE",
        )
        .bind(principal.session_id)
        .fetch_optional(&mut *tx)
        .await?;
        let Some((session_operator_id, expires_at_unix, allow_platform_admin)) = session_row else {
            return Err(StoreError::Unauthorized);
        };
        if session_operator_id != principal.id {
            return Err(StoreError::Unauthorized);
        }

        let current_operator: Option<(Option<Uuid>, bool)> = sqlx::query_as(
            "SELECT organization_id, revoked_at IS NOT NULL \
             FROM admin_operators \
             WHERE id = $1 \
             FOR SHARE",
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

        let identity_id =
            ensure_operator_identity_in_tx(&mut tx, principal.id, current_org_id).await?;

        let target_org_id: Option<Uuid> = sqlx::query_scalar(
            "SELECT o.id FROM organizations o \
             WHERE ($1::uuid IS NOT NULL AND o.id = $1) \
                OR o.slug = $2 \
                OR EXISTS (SELECT 1 FROM organization_slug_aliases a WHERE a.organization_id = o.id AND a.slug = $2)",
        )
        .bind(parsed_org_id)
        .bind(target_raw)
        .fetch_optional(&mut *tx)
        .await?;
        let Some(target_org_id) = target_org_id else {
            return Err(StoreError::Unauthorized);
        };

        let target_member: Option<(Uuid, String, bool, Option<Uuid>, bool)> = sqlx::query_as(
            "SELECT o.id, o.role, o.platform_admin, o.project_id, o.revoked_at IS NOT NULL \
             FROM account_memberships m \
             JOIN admin_operators o ON o.id = m.operator_id AND o.organization_id = m.organization_id \
             WHERE m.identity_id = $1 AND m.organization_id = $2 \
             FOR SHARE OF o",
        )
        .bind(identity_id)
        .bind(target_org_id)
        .fetch_optional(&mut *tx)
        .await?;
        let Some((
            target_operator_id,
            target_role_raw,
            target_platform_admin,
            target_project_id,
            false,
        )) = target_member
        else {
            return Err(StoreError::Unauthorized);
        };
        let target_role = OperatorRole::parse(&target_role_raw)?;

        sqlx::query(
            "UPDATE admin_sessions \
             SET operator_id = $2 \
             WHERE id = $1 AND revoked_at IS NULL",
        )
        .bind(principal.session_id)
        .bind(target_operator_id)
        .execute(&mut *tx)
        .await?;

        tx.commit().await?;
        Ok((
            OperatorPrincipal {
                session_id: principal.session_id,
                id: target_operator_id,
                platform_admin: target_platform_admin && allow_platform_admin,
                role: target_role,
                scope: OperatorScope {
                    organization_id: target_org_id,
                    project_id: target_project_id,
                },
            },
            expires_at_unix,
        ))
    }

    /// Links an invited operator membership (presented via its issued operator
    /// session bearer token) to the authenticated caller's `account_identities`
    /// row with explicit ownership/consent checks, revokes the one-time invite
    /// session token, and switches the caller's session to the newly claimed
    /// organization membership.
    pub async fn claim_organization_membership(
        &self,
        principal: OperatorPrincipal,
        issued_token: &str,
    ) -> Result<OperatorPrincipal, StoreError> {
        self.claim_organization_membership_with_expiry(principal, issued_token)
            .await
            .map(|(updated, _)| updated)
    }

    pub async fn claim_organization_membership_with_expiry(
        &self,
        principal: OperatorPrincipal,
        issued_token: &str,
    ) -> Result<(OperatorPrincipal, i64), StoreError> {
        let token = issued_token.trim();
        if token.len() < 32 || token.len() > 512 {
            return Err(StoreError::Unauthorized);
        }
        let token_digest: [u8; 32] = Sha256::digest(token.as_bytes()).into();

        let mut tx = self.begin_bounded_recording().await?;
        let session_row: Option<(Uuid, i64, bool)> = sqlx::query_as(
            "SELECT operator_id, expires_at_unix, \
                    (NOT browser_session OR admin_mode_until > clock_timestamp()) IS TRUE \
             FROM admin_sessions \
             WHERE id = $1 \
               AND revoked_at IS NULL \
               AND expires_at_unix > extract(epoch FROM clock_timestamp())::bigint \
             FOR UPDATE",
        )
        .bind(principal.session_id)
        .fetch_optional(&mut *tx)
        .await?;
        let Some((session_operator_id, expires_at_unix, allow_platform_admin)) = session_row else {
            return Err(StoreError::Unauthorized);
        };
        if session_operator_id != principal.id {
            return Err(StoreError::Unauthorized);
        }

        let current_operator: Option<(Option<Uuid>, bool)> = sqlx::query_as(
            "SELECT organization_id, revoked_at IS NOT NULL \
             FROM admin_operators \
             WHERE id = $1 \
             FOR SHARE",
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
            ensure_operator_identity_in_tx(&mut tx, principal.id, current_org_id).await?;

        let invite_session: Option<(Uuid, Uuid)> = sqlx::query_as(
            "SELECT id, operator_id \
             FROM admin_sessions \
             WHERE token_hash = $1 \
               AND revoked_at IS NULL \
               AND expires_at_unix > extract(epoch FROM clock_timestamp())::bigint \
             FOR UPDATE",
        )
        .bind(token_digest.as_slice())
        .fetch_optional(&mut *tx)
        .await?;
        let Some((invite_session_id, target_operator_id)) = invite_session else {
            return Err(StoreError::Unauthorized);
        };

        let target_operator: Option<(String, bool, Uuid, Option<Uuid>)> = sqlx::query_as(
            "SELECT role, platform_admin, organization_id, project_id \
                 FROM admin_operators \
                 WHERE id = $1 \
                   AND revoked_at IS NULL \
                   AND organization_id IS NOT NULL \
                 FOR UPDATE",
        )
        .bind(target_operator_id)
        .fetch_optional(&mut *tx)
        .await?;
        let Some((target_role_raw, target_platform_admin, target_org_id, target_project_id)) =
            target_operator
        else {
            return Err(StoreError::Unauthorized);
        };
        let target_role = OperatorRole::parse(&target_role_raw)?;

        let target_identity_id =
            ensure_operator_identity_in_tx(&mut tx, target_operator_id, target_org_id).await?;

        if target_identity_id != caller_identity_id {
            let has_password_credential: bool = sqlx::query_scalar(
                "SELECT EXISTS(
                    SELECT 1 FROM member_password_credentials
                    WHERE operator_id = $1 OR operator_id = $2
                )",
            )
            .bind(target_operator_id)
            .bind(target_identity_id)
            .fetch_one(&mut *tx)
            .await?;
            if has_password_credential {
                return Err(StoreError::Conflict);
            }

            let target_membership_count: i64 = sqlx::query_scalar(
                "SELECT COUNT(*) FROM account_memberships WHERE identity_id = $1",
            )
            .bind(target_identity_id)
            .fetch_one(&mut *tx)
            .await?;
            if target_membership_count > 1 {
                return Err(StoreError::Conflict);
            }

            let existing_org_operator: Option<Uuid> = sqlx::query_scalar(
                "SELECT operator_id FROM account_memberships \
                 WHERE identity_id = $1 AND organization_id = $2 \
                 FOR UPDATE",
            )
            .bind(caller_identity_id)
            .bind(target_org_id)
            .fetch_optional(&mut *tx)
            .await?;
            if let Some(existing_op_id) = existing_org_operator
                && existing_op_id != target_operator_id
            {
                let existing_revoked: bool = sqlx::query_scalar(
                    "SELECT revoked_at IS NOT NULL FROM admin_operators WHERE id = $1 FOR UPDATE",
                )
                .bind(existing_op_id)
                .fetch_one(&mut *tx)
                .await?;
                if !existing_revoked {
                    return Err(StoreError::Conflict);
                }
                sqlx::query(
                    "INSERT INTO account_identities (id) VALUES ($1) ON CONFLICT (id) DO NOTHING",
                )
                .bind(existing_op_id)
                .execute(&mut *tx)
                .await?;
                sqlx::query(
                    "UPDATE account_memberships SET identity_id = $1 WHERE operator_id = $1",
                )
                .bind(existing_op_id)
                .execute(&mut *tx)
                .await?;
            }

            sqlx::query(
                "UPDATE account_memberships \
                 SET identity_id = $1 \
                 WHERE operator_id = $2 AND organization_id = $3",
            )
            .bind(caller_identity_id)
            .bind(target_operator_id)
            .bind(target_org_id)
            .execute(&mut *tx)
            .await?;
        }

        if invite_session_id != principal.session_id {
            sqlx::query(
                "UPDATE admin_sessions \
                 SET revoked_at = clock_timestamp() \
                 WHERE id = $1 AND revoked_at IS NULL",
            )
            .bind(invite_session_id)
            .execute(&mut *tx)
            .await?;
        }

        sqlx::query(
            "UPDATE admin_sessions \
             SET operator_id = $2 \
             WHERE id = $1 AND revoked_at IS NULL",
        )
        .bind(principal.session_id)
        .bind(target_operator_id)
        .execute(&mut *tx)
        .await?;

        tx.commit().await?;
        Ok((
            OperatorPrincipal {
                session_id: principal.session_id,
                id: target_operator_id,
                platform_admin: target_platform_admin && allow_platform_admin,
                role: target_role,
                scope: OperatorScope {
                    organization_id: target_org_id,
                    project_id: target_project_id,
                },
            },
            expires_at_unix,
        ))
    }
}

pub(crate) async fn ensure_operator_identity_in_tx(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    operator_id: Uuid,
    organization_id: Uuid,
) -> Result<Uuid, StoreError> {
    if let Some(identity_id) = sqlx::query_scalar(
        "SELECT identity_id FROM account_memberships WHERE operator_id = $1 FOR SHARE",
    )
    .bind(operator_id)
    .fetch_optional(&mut **tx)
    .await?
    {
        return Ok(identity_id);
    }

    sqlx::query("INSERT INTO account_identities (id) VALUES ($1) ON CONFLICT (id) DO NOTHING")
        .bind(operator_id)
        .execute(&mut **tx)
        .await?;
    sqlx::query(
        "INSERT INTO account_memberships (identity_id, operator_id, organization_id) \
         VALUES ($1, $1, $2) \
         ON CONFLICT (operator_id) DO NOTHING",
    )
    .bind(operator_id)
    .bind(organization_id)
    .execute(&mut **tx)
    .await?;

    sqlx::query_scalar(
        "SELECT identity_id FROM account_memberships WHERE operator_id = $1 FOR SHARE",
    )
    .bind(operator_id)
    .fetch_one(&mut **tx)
    .await
    .map_err(StoreError::from)
}

fn validate_company_name(name: &str) -> Result<String, StoreError> {
    let trimmed = name.trim();
    if trimmed.is_empty() || trimmed.chars().count() > 120 || trimmed.chars().any(char::is_control)
    {
        return Err(StoreError::InvalidOperator);
    }
    Ok(trimmed.to_string())
}

pub fn validate_organization_slug(raw: &str) -> Result<String, StoreError> {
    let slug = raw.trim();
    if slug.is_empty()
        || slug.len() > 48
        || RESERVED_ORGANIZATION_SLUGS.contains(&slug)
        || slug.starts_with('-')
        || slug.ends_with('-')
        || slug.contains("--")
        || !slug
            .bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
    {
        return Err(StoreError::InvalidOperator);
    }
    Ok(slug.to_string())
}

fn map_organization_slug_error(error: sqlx::Error) -> StoreError {
    if error
        .as_database_error()
        .and_then(|db| db.code())
        .as_deref()
        == Some("23505")
    {
        return StoreError::OrganizationSlugTaken;
    }
    StoreError::Database(error)
}

fn normalize_company_currency(currency: &str) -> Result<String, StoreError> {
    let normalized = currency.trim().to_ascii_uppercase();
    if !matches!(normalized.as_str(), "USD" | "CNY") {
        return Err(StoreError::InvalidPrice);
    }
    Ok(normalized)
}

fn create_account_organization_request_sha256(
    name: &str,
    slug: Option<&str>,
    currency: &str,
) -> Result<[u8; 32], StoreError> {
    let payload = match slug {
        Some(slug) => serde_json::json!({
            "currency": currency,
            "name": name,
            "slug": slug,
        }),
        None => serde_json::json!({
            "currency": currency,
            "name": name,
        }),
    };
    let canonical = serde_json::to_vec(&payload).map_err(|_| StoreError::Conflict)?;
    Ok(Sha256::digest(canonical).into())
}
