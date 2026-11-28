//! Installation-only and platform-admin company onboarding with durable retry identity.
use crate::{
    OperatorAuditActor, OperatorScope, Store, StoreError,
    operator_audit::insert_operator_audit_event, password_logins::email_address,
};
use serde::Serialize;
use sha2::{Digest, Sha256};
use uuid::Uuid;

pub struct CustomerOwnerOnboarding<'a> {
    pub name: &'a str,
    pub email: &'a str,
    pub password_hash: &'a str,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
pub struct OnboardedPlatformCustomer {
    pub id: Uuid,
    pub slug: String,
    pub name: String,
    pub account_kind: String,
    pub currency: String,
    pub workspace_id: Option<Uuid>,
    pub workspace_name: Option<String>,
    pub workspace_slug: Option<String>,
    pub owner_id: Option<Uuid>,
    pub owner_name: Option<String>,
    pub owner_email: Option<String>,
    pub trial_credit_nanos: Option<String>,
}

impl Store {
    /// Commit the optional receipt, company and zero-funded account together.
    /// Installation credentials share a namespace distinct from workspace creation.
    /// A replay returns its original identity, including a deleted identity; the
    /// caller must read current metadata and return not-found rather than recreate.
    pub async fn create_prepaid_organization_with_key(
        &self,
        name: &str,
        currency: &str,
        key_sha256: Option<&[u8]>,
    ) -> Result<Uuid, StoreError> {
        self.create_prepaid_organization_with_key_and_kind(
            name,
            currency,
            "organization",
            key_sha256,
        )
        .await
    }

    pub async fn create_prepaid_organization_with_key_and_kind(
        &self,
        name: &str,
        currency: &str,
        account_kind: &str,
        key_sha256: Option<&[u8]>,
    ) -> Result<Uuid, StoreError> {
        if !matches!(account_kind, "personal" | "organization") {
            return Err(StoreError::InvalidPrice);
        }
        let payload = if account_kind == "organization" {
            serde_json::json!({"name": name, "currency": currency})
        } else {
            serde_json::json!({"name": name, "currency": currency, "account_kind": account_kind})
        };
        let request = serde_json::to_vec(&payload).map_err(|_| StoreError::Conflict)?;
        let request_sha256 = Sha256::digest(request).to_vec();
        if key_sha256.is_some_and(|key| key.len() != 32) {
            return Err(StoreError::Conflict);
        }
        let mut tx = self.begin_bounded_recording().await?;
        if let Some(key) = key_sha256 {
            sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended('niu-company-create:'||encode($1::bytea,'hex'),0))")
                .bind(key).execute(&mut *tx).await?;
            let saved: Option<(Vec<u8>, Uuid)> = sqlx::query_as(
                "SELECT request_sha256,organization_id FROM company_creation_receipts WHERE key_sha256=$1",
            ).bind(key).fetch_optional(&mut *tx).await?;
            if let Some((request, organization)) = saved {
                if request != request_sha256 {
                    return Err(StoreError::Conflict);
                }
                crate::commit_tx(tx).await?;
                return Ok(organization);
            }
        }
        let organization = Self::create_prepaid_organization_in_tx_with_kind(
            &mut tx,
            name,
            currency,
            account_kind,
        )
        .await?;
        if let Some(key) = key_sha256 {
            sqlx::query("INSERT INTO company_creation_receipts(key_sha256,request_sha256,organization_id) VALUES($1,$2,$3)")
                .bind(key).bind(request_sha256).bind(organization).execute(&mut *tx).await?;
        }
        crate::commit_tx(tx).await?;
        Ok(organization)
    }

    /// Atomically onboard a customer organization (or personal customer account),
    /// its optional `Default` workspace, its optional initial `owner` login
    /// credential, and its optional initial trial credit grant in a single
    /// PostgreSQL transaction. Any validation or email-uniqueness failure rolls
    /// back completely without leaving half-created organizations or operators.
    #[allow(clippy::too_many_arguments)]
    pub async fn onboard_platform_customer(
        &self,
        name: &str,
        account_kind: &str,
        currency: &str,
        create_default_workspace: bool,
        owner: Option<CustomerOwnerOnboarding<'_>>,
        trial_credit_nanos: Option<i64>,
        key_sha256: Option<&[u8]>,
        actor: OperatorAuditActor,
    ) -> Result<OnboardedPlatformCustomer, StoreError> {
        let trimmed_name = name.trim();
        if trimmed_name.is_empty()
            || trimmed_name.chars().count() > 200
            || trimmed_name.chars().any(char::is_control)
        {
            return Err(StoreError::InvalidVendor);
        }
        if !matches!(account_kind, "personal" | "organization") {
            return Err(StoreError::InvalidPrice);
        }
        if currency.len() != 3 || !currency.bytes().all(|b| b.is_ascii_uppercase()) {
            return Err(StoreError::InvalidPrice);
        }
        if let Some(nanos) = trial_credit_nanos
            && nanos <= 0
        {
            return Err(StoreError::InvalidPrice);
        }
        let validated_owner = match owner {
            Some(item) => {
                let owner_name = item.name.trim();
                if owner_name.is_empty()
                    || owner_name.chars().count() > 200
                    || owner_name.chars().any(char::is_control)
                {
                    return Err(StoreError::InvalidOperator);
                }
                let normalized_email =
                    email_address(item.email).ok_or(StoreError::InvalidOperator)?;
                if !crate::passwords::supported_password_hash(item.password_hash) {
                    return Err(StoreError::InvalidOperator);
                }
                Some((owner_name.to_owned(), normalized_email, item.password_hash))
            }
            None => None,
        };
        if key_sha256.is_some_and(|key| key.len() != 32) {
            return Err(StoreError::Conflict);
        }

        let payload = serde_json::json!({
            "op": "onboard_platform_customer",
            "name": trimmed_name,
            "account_kind": account_kind,
            "currency": currency,
            "create_default_workspace": create_default_workspace,
            "owner": validated_owner.as_ref().map(|(n, e, _)| serde_json::json!({"name": n, "email": e})),
            "trial_credit_nanos": trial_credit_nanos,
        });
        let request_sha256 =
            Sha256::digest(serde_json::to_vec(&payload).map_err(|_| StoreError::Conflict)?)
                .to_vec();

        let mut tx = self.begin_bounded_recording().await?;
        if let Some(key) = key_sha256 {
            sqlx::query(
                "SELECT pg_advisory_xact_lock(hashtextextended('niu-company-create:'||encode($1::bytea,'hex'),0))",
            )
            .bind(key)
            .execute(&mut *tx)
            .await?;
            let saved: Option<(Vec<u8>, Uuid)> = sqlx::query_as(
                "SELECT request_sha256, organization_id FROM company_creation_receipts WHERE key_sha256 = $1",
            )
            .bind(key)
            .fetch_optional(&mut *tx)
            .await?;
            if let Some((saved_hash, organization_id)) = saved {
                if saved_hash != request_sha256 {
                    return Err(StoreError::Conflict);
                }
                let org_row: Option<(String, String, String)> = sqlx::query_as(
                    "SELECT slug, name, account_kind FROM organizations WHERE id = $1",
                )
                .bind(organization_id)
                .fetch_optional(&mut *tx)
                .await?;
                let (slug, saved_name, saved_kind) = org_row.ok_or(StoreError::Conflict)?;
                let ws_row: Option<(Uuid, String, Option<String>)> = sqlx::query_as(
                    "SELECT id, name, route_slug FROM projects WHERE organization_id = $1 ORDER BY created_at ASC LIMIT 1",
                )
                .bind(organization_id)
                .fetch_optional(&mut *tx)
                .await?;
                let owner_row: Option<(Uuid, String, Option<String>)> = sqlx::query_as(
                    "SELECT o.id, o.name, c.email \
                     FROM admin_operators o \
                     LEFT JOIN account_memberships m ON m.operator_id = o.id \
                     LEFT JOIN member_password_credentials c ON c.operator_id = COALESCE(m.identity_id, o.id) \
                     WHERE o.organization_id = $1 AND o.role = 'owner' AND o.project_id IS NULL AND o.revoked_at IS NULL \
                     ORDER BY o.created_at ASC LIMIT 1",
                )
                .bind(organization_id)
                .fetch_optional(&mut *tx)
                .await?;
                let grant_row: Option<i64> = sqlx::query_scalar(
                    "SELECT amount_nanos FROM customer_balance_grants WHERE organization_id = $1 AND currency = $2 ORDER BY created_at ASC LIMIT 1",
                )
                .bind(organization_id)
                .bind(currency)
                .fetch_optional(&mut *tx)
                .await?;
                crate::commit_tx(tx).await?;
                return Ok(OnboardedPlatformCustomer {
                    id: organization_id,
                    slug,
                    name: saved_name,
                    account_kind: saved_kind,
                    currency: currency.to_owned(),
                    workspace_id: ws_row.as_ref().map(|r| r.0),
                    workspace_name: ws_row.as_ref().map(|r| r.1.clone()),
                    workspace_slug: ws_row.and_then(|r| r.2),
                    owner_id: owner_row.as_ref().map(|r| r.0),
                    owner_name: owner_row.as_ref().map(|r| r.1.clone()),
                    owner_email: owner_row.and_then(|r| r.2),
                    trial_credit_nanos: grant_row.map(|n| n.to_string()),
                });
            }
        }

        let platform_currency: Option<String> =
            sqlx::query_scalar("SELECT currency FROM platform_currency WHERE singleton")
                .fetch_optional(&mut *tx)
                .await?;
        if let Some(saved_currency) = platform_currency.as_deref()
            && saved_currency != currency
        {
            return Err(StoreError::InvalidPrice);
        }

        if let Some((_, ref email, _)) = validated_owner {
            sqlx::query(
                "SELECT pg_advisory_xact_lock(hashtextextended('niu-registration-email:' || $1, 0))",
            )
            .bind(email)
            .execute(&mut *tx)
            .await?;
            let email_exists: bool = sqlx::query_scalar(
                "SELECT EXISTS(SELECT 1 FROM member_password_credentials WHERE email = $1)",
            )
            .bind(email)
            .fetch_one(&mut *tx)
            .await?;
            if email_exists {
                return Err(StoreError::RegistrationEmailExists);
            }
        }

        let organization_id = Self::create_prepaid_organization_in_tx_with_kind(
            &mut tx,
            trimmed_name,
            currency,
            account_kind,
        )
        .await?;
        let slug: String = sqlx::query_scalar("SELECT slug FROM organizations WHERE id = $1")
            .bind(organization_id)
            .fetch_one(&mut *tx)
            .await?;

        let (workspace_id, workspace_name, workspace_slug) = if create_default_workspace {
            let project_id = Uuid::new_v4();
            let base_ws_slug = crate::workspace_creation::workspace_slug_from_name(trimmed_name);
            let ws_slug: String = sqlx::query_scalar("SELECT niu_available_workspace_slug($1)")
                .bind(base_ws_slug)
                .fetch_one(&mut *tx)
                .await?;
            sqlx::query(
                "INSERT INTO projects(id, organization_id, name, route_slug) VALUES ($1, $2, 'Default', $3)",
            )
            .bind(project_id)
            .bind(organization_id)
            .bind(&ws_slug)
            .execute(&mut *tx)
            .await?;
            (Some(project_id), Some("Default".to_owned()), Some(ws_slug))
        } else {
            (None, None, None)
        };

        let (owner_id, owner_name, owner_email) = if let Some((owner_name, email, password_hash)) =
            validated_owner
        {
            let operator_id = Uuid::new_v4();
            sqlx::query(
                "INSERT INTO admin_operators(id, name, role, organization_id, project_id) \
                     VALUES ($1, $2, 'owner', $3, NULL)",
            )
            .bind(operator_id)
            .bind(&owner_name)
            .bind(organization_id)
            .execute(&mut *tx)
            .await?;
            crate::account_organization_creation::ensure_operator_identity_in_tx(
                &mut tx,
                operator_id,
                organization_id,
            )
            .await?;
            sqlx::query(
                    "INSERT INTO member_password_credentials(operator_id, email, password_hash, revision) \
                     VALUES ($1, $2, $3, 1)",
                )
                .bind(operator_id)
                .bind(&email)
                .bind(password_hash)
                .execute(&mut *tx)
                .await
                .map_err(|error| {
                    if error
                        .as_database_error()
                        .is_some_and(|db| db.is_unique_violation())
                    {
                        StoreError::RegistrationEmailExists
                    } else {
                        error.into()
                    }
                })?;
            let scope = OperatorScope {
                organization_id,
                project_id: None,
            };
            insert_operator_audit_event(
                &mut tx,
                actor,
                "operator_created",
                operator_id,
                None,
                scope,
            )
            .await?;
            insert_operator_audit_event(
                &mut tx,
                actor,
                "password_changed",
                operator_id,
                None,
                scope,
            )
            .await?;
            (Some(operator_id), Some(owner_name), Some(email))
        } else {
            (None, None, None)
        };

        if let Some(amount_nanos) = trial_credit_nanos {
            let account_id: Uuid = sqlx::query_scalar(
                "SELECT id FROM customer_balance_accounts WHERE organization_id = $1 AND currency = $2 FOR NO KEY UPDATE",
            )
            .bind(organization_id)
            .bind(currency)
            .fetch_one(&mut *tx)
            .await?;
            let grant_key = Uuid::new_v4();
            let prepared_id = Uuid::new_v4();
            let entry_id = Uuid::new_v4();
            let grant_id = Uuid::new_v4();
            let (actor_kind, actor_id) = actor.kind_and_id();
            sqlx::query(
                "INSERT INTO prepared_customer_balance_grants \
                 (id, organization_id, currency, amount_nanos, reason, idempotency_key, application_policy, actor_kind, actor_operator_id) \
                 VALUES ($1, $2, $3, $4, 'Trial credit', $5, 'future_only', $6, $7)",
            )
            .bind(prepared_id)
            .bind(organization_id)
            .bind(currency)
            .bind(amount_nanos)
            .bind(grant_key)
            .bind(actor_kind)
            .bind(actor_id)
            .execute(&mut *tx)
            .await?;
            sqlx::query(
                "INSERT INTO customer_balance_entries \
                 (id, organization_id, account_id, currency, kind, amount_nanos, idempotency_key) \
                 VALUES ($1, $2, $3, $4, 'adjustment', $5, $6)",
            )
            .bind(entry_id)
            .bind(organization_id)
            .bind(account_id)
            .bind(currency)
            .bind(amount_nanos)
            .bind(grant_key)
            .execute(&mut *tx)
            .await?;
            sqlx::query(
                "INSERT INTO customer_balance_grants \
                 (id, organization_id, account_id, currency, entry_id, amount_nanos, noncash_offset_nanos, idempotency_key, reason, actor_kind, actor_operator_id) \
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'Trial credit', $9, $10)",
            )
            .bind(grant_id)
            .bind(organization_id)
            .bind(account_id)
            .bind(currency)
            .bind(entry_id)
            .bind(amount_nanos)
            .bind(-amount_nanos)
            .bind(grant_key)
            .bind(actor_kind)
            .bind(actor_id)
            .execute(&mut *tx)
            .await?;
            sqlx::query(
                "INSERT INTO customer_grant_policies(grant_id, policy) VALUES ($1, 'future_only')",
            )
            .bind(grant_id)
            .execute(&mut *tx)
            .await?;
        }

        if let Some(key) = key_sha256 {
            sqlx::query(
                "INSERT INTO company_creation_receipts(key_sha256, request_sha256, organization_id) VALUES ($1, $2, $3)",
            )
            .bind(key)
            .bind(request_sha256)
            .bind(organization_id)
            .execute(&mut *tx)
            .await?;
        }

        crate::commit_tx(tx).await?;
        Ok(OnboardedPlatformCustomer {
            id: organization_id,
            slug,
            name: trimmed_name.to_owned(),
            account_kind: account_kind.to_owned(),
            currency: currency.to_owned(),
            workspace_id,
            workspace_name,
            workspace_slug,
            owner_id,
            owner_name,
            owner_email,
            trial_credit_nanos: trial_credit_nanos.map(|n| n.to_string()),
        })
    }
}
