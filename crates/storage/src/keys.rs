use sha2::{Digest, Sha256};
use sqlx::Row;
use uuid::Uuid;

use crate::{Store, StoreError, TenantScope};

#[derive(sqlx::FromRow, serde::Serialize)]
pub struct KeyView {
    pub id: Uuid,
    pub name: String,
    pub allowed_models: Vec<String>,
    pub expires_at_ms: i64,
    pub revoked: bool,
    pub expired: bool,
}

/// The secret is returned exactly once. Deliberately no Debug/Serialize impl.
pub struct IssuedKey {
    pub id: Uuid,
    pub token: String,
}

/// Constructed only by successful database authentication. Every dispatch
/// revalidates expiry, revocation and model permission in its transaction.
#[derive(Clone)]
pub struct Principal {
    key_id: Uuid,
    scope: TenantScope,
    allowed_models: Vec<String>,
}

impl Principal {
    pub fn allows_model(&self, model: &str) -> bool {
        self.allowed_models.iter().any(|allowed| allowed == model)
    }

    pub fn scope(&self) -> TenantScope {
        self.scope
    }
    pub fn key_id(&self) -> Uuid {
        self.key_id
    }
}

impl Store {
    pub async fn issue_key(
        &self,
        scope: TenantScope,
        name: &str,
        models: &[String],
        ttl_seconds: i64,
    ) -> Result<IssuedKey, StoreError> {
        if name.trim().is_empty()
            || name.len() > 200
            || models.is_empty()
            || models
                .iter()
                .any(|m| m.is_empty() || m.len() > 200 || m == "*")
            || !(1..=31_536_000).contains(&ttl_seconds)
        {
            return Err(StoreError::InvalidKey);
        }
        let id = Uuid::new_v4();
        // Two independent random UUIDs provide 244 random bits. The key id is
        // separate from the secret and is safe to expose for administration.
        let token = format!("niu_{}{}", Uuid::new_v4().simple(), Uuid::new_v4().simple());
        let hash = Sha256::digest(token.as_bytes()).to_vec();
        let mut tx = self.pool.begin().await?;
        sqlx::query("INSERT INTO api_keys (id, organization_id, project_id, name, token_hash, allowed_models, expires_at) VALUES ($1,$2,$3,$4,$5,$6,clock_timestamp() + $7 * interval '1 second')")
            .bind(id).bind(scope.organization_id).bind(scope.project_id).bind(name).bind(hash).bind(models).bind(ttl_seconds as f64)
            .execute(&mut *tx).await?;
        sqlx::query("INSERT INTO key_audit_events (id,organization_id,project_id,key_id,action) VALUES ($1,$2,$3,$4,'issued')")
            .bind(Uuid::new_v4()).bind(scope.organization_id).bind(scope.project_id).bind(id).execute(&mut *tx).await?;
        tx.commit().await?;
        Ok(IssuedKey { id, token })
    }

    pub async fn authenticate(&self, token: &str) -> Result<Principal, StoreError> {
        if token.len() != 68 || !token.starts_with("niu_") {
            return Err(StoreError::Unauthorized);
        }
        let hash = Sha256::digest(token.as_bytes()).to_vec();
        let row = sqlx::query("SELECT id, organization_id, project_id, allowed_models FROM api_keys WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > clock_timestamp()")
            .bind(hash).fetch_optional(&self.pool).await?.ok_or(StoreError::Unauthorized)?;
        Ok(Principal {
            allowed_models: row.get("allowed_models"),
            key_id: row.get("id"),
            scope: TenantScope {
                organization_id: row.get("organization_id"),
                project_id: row.get("project_id"),
            },
        })
    }

    pub async fn list_keys(&self, scope: TenantScope) -> Result<Vec<KeyView>, StoreError> {
        Ok(sqlx::query_as("SELECT id,name,allowed_models,floor(extract(epoch FROM expires_at)*1000)::bigint AS expires_at_ms,revoked_at IS NOT NULL AS revoked,expires_at <= clock_timestamp() AS expired FROM api_keys WHERE organization_id=$1 AND project_id=$2 ORDER BY created_at,id LIMIT 1000")
            .bind(scope.organization_id).bind(scope.project_id).fetch_all(&self.pool).await?)
    }

    /// Rotation revokes the old key and creates its replacement atomically.
    /// Permissions and absolute expiry are preserved; only one racer can win.
    pub async fn rotate_key(&self, scope: TenantScope, old: Uuid) -> Result<IssuedKey, StoreError> {
        let id = Uuid::new_v4();
        let token = format!("niu_{}{}", Uuid::new_v4().simple(), Uuid::new_v4().simple());
        let hash = Sha256::digest(token.as_bytes()).to_vec();
        let mut tx = self.pool.begin().await?;
        let changed = sqlx::query("UPDATE api_keys SET revoked_at=clock_timestamp() WHERE organization_id=$1 AND project_id=$2 AND id=$3 AND revoked_at IS NULL AND expires_at > clock_timestamp()")
            .bind(scope.organization_id).bind(scope.project_id).bind(old).execute(&mut *tx).await?.rows_affected();
        if changed != 1 {
            return Err(StoreError::Conflict);
        }
        sqlx::query("INSERT INTO api_keys (id,organization_id,project_id,name,token_hash,allowed_models,expires_at) SELECT $1,organization_id,project_id,name,$2,allowed_models,expires_at FROM api_keys WHERE id=$3")
            .bind(id).bind(hash).bind(old).execute(&mut *tx).await?;
        sqlx::query("INSERT INTO key_audit_events (id,organization_id,project_id,key_id,action,replacement_key_id) VALUES ($1,$2,$3,$4,'rotated',$5)")
            .bind(Uuid::new_v4()).bind(scope.organization_id).bind(scope.project_id).bind(old).bind(id).execute(&mut *tx).await?;
        tx.commit().await?;
        Ok(IssuedKey { id, token })
    }

    /// Idempotent revocation within a trusted administrative tenant scope.
    pub async fn revoke_key(&self, scope: TenantScope, id: Uuid) -> Result<(), StoreError> {
        let mut tx = self.pool.begin().await?;
        let revoked: bool = sqlx::query_scalar("SELECT revoked_at IS NOT NULL FROM api_keys WHERE organization_id=$1 AND project_id=$2 AND id=$3 FOR UPDATE")
            .bind(scope.organization_id).bind(scope.project_id).bind(id).fetch_optional(&mut *tx).await?.ok_or(StoreError::Conflict)?;
        if !revoked {
            sqlx::query("UPDATE api_keys SET revoked_at=clock_timestamp() WHERE id=$1")
                .bind(id)
                .execute(&mut *tx)
                .await?;
            sqlx::query("INSERT INTO key_audit_events (id,organization_id,project_id,key_id,action) VALUES ($1,$2,$3,$4,'revoked')")
                .bind(Uuid::new_v4()).bind(scope.organization_id).bind(scope.project_id).bind(id).execute(&mut *tx).await?;
        }
        tx.commit().await?;
        Ok(())
    }

    /// Permission recheck and dispatch intent commit in one transaction. A key
    /// row lock serializes revocation against admission. Revocation prevents
    /// future admissions; it cannot unsend work already admitted upstream.
    pub async fn mark_dispatched(&self, principal: &Principal, id: Uuid) -> Result<(), StoreError> {
        let scope = principal.scope;
        let mut tx = self.pool.begin().await?;
        let key = sqlx::query("SELECT id FROM api_keys WHERE id = $1 AND organization_id = $2 AND project_id = $3 AND revoked_at IS NULL AND expires_at > clock_timestamp() FOR SHARE")
            .bind(principal.key_id).bind(scope.organization_id).bind(scope.project_id).fetch_optional(&mut *tx).await?;
        if key.is_none() {
            return Err(StoreError::Unauthorized);
        }
        sqlx::query("SELECT id FROM projects WHERE organization_id=$1 AND id=$2 FOR SHARE")
            .bind(scope.organization_id)
            .bind(scope.project_id)
            .fetch_optional(&mut *tx)
            .await?
            .ok_or(StoreError::Conflict)?;
        if let Some(account) = sqlx::query_scalar::<_,Uuid>("SELECT account_id FROM account_assignments WHERE organization_id=$1 AND project_id=$2 AND attempt_id=$3")
            .bind(scope.organization_id).bind(scope.project_id).bind(id).fetch_optional(&mut *tx).await? {
            let eligible = sqlx::query("SELECT a.id FROM supplier_accounts a JOIN account_assignments s ON s.account_id=a.id WHERE a.id=$1 AND s.attempt_id=$2 AND a.health='ready' AND a.refresh_owner IS NULL AND a.credential_revision=s.credential_revision FOR SHARE OF a")
                .bind(account).bind(id).fetch_optional(&mut *tx).await?;
            if eligible.is_none() { return Err(StoreError::AccountUnavailable); }
        }
        // Take the attempt lock in a separate statement so the following
        // reservation check observes any release committed while we waited.
        sqlx::query("SELECT id FROM attempts WHERE organization_id=$1 AND project_id=$2 AND id=$3 FOR UPDATE")
            .bind(scope.organization_id).bind(scope.project_id).bind(id).fetch_optional(&mut *tx).await?.ok_or(StoreError::Conflict)?;
        let changed = sqlx::query("UPDATE attempts a SET execution = 'may_have_executed', dispatched_at = clock_timestamp(), api_key_id = $4 FROM operations o, api_keys k WHERE a.organization_id = $1 AND a.project_id = $2 AND a.id = $3 AND a.execution = 'not_sent' AND o.id = a.operation_id AND k.id = $4 AND o.model_alias = ANY(k.allowed_models) AND k.expires_at > clock_timestamp() AND NOT EXISTS (SELECT 1 FROM account_assignments s WHERE s.attempt_id=a.id AND s.state <> 'held') AND (NOT EXISTS (SELECT 1 FROM project_budgets b WHERE b.organization_id=$1 AND b.project_id=$2) OR EXISTS (SELECT 1 FROM cost_reservations r WHERE r.attempt_id=a.id AND r.state='held'))")
            .bind(scope.organization_id).bind(scope.project_id).bind(id).bind(principal.key_id).execute(&mut *tx).await?.rows_affected();
        if changed != 1 {
            return Err(StoreError::Conflict);
        }
        tx.commit().await?;
        Ok(())
    }
}
