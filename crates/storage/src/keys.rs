use sha2::{Digest, Sha256};
use sqlx::Row;
use uuid::Uuid;

use crate::{Store, StoreError, TenantScope};

#[derive(sqlx::FromRow, serde::Serialize)]
pub struct KeyView {
    pub id: Uuid,
    pub revision: i64,
    pub name: String,
    pub allowed_models: Vec<String>,
    pub expires_at_ms: i64,
    /// Latest durable dispatch intent; absent does not establish that a key was never authenticated.
    pub last_used_at_ms: Option<i64>,
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
        self.allowed_models
            .iter()
            .any(|allowed| allowed == "*" || allowed == model)
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
            || (models.iter().any(|m| m == "*") && models.len() != 1)
            || models.iter().any(|m| m.is_empty() || m.len() > 200)
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

    /// Resolve a selected key only after the caller authorizes administrative
    /// access to this exact tenant. Write access is required for inference; reads
    /// may use read access. Inference still revalidates at dispatch.
    pub async fn dashboard_key(
        &self,
        scope: TenantScope,
        id: Uuid,
    ) -> Result<Principal, StoreError> {
        let row = sqlx::query("SELECT allowed_models FROM api_keys WHERE organization_id=$1 AND project_id=$2 AND id=$3 AND revoked_at IS NULL AND expires_at > clock_timestamp()")
            .bind(scope.organization_id).bind(scope.project_id).bind(id)
            .fetch_optional(&self.pool).await?.ok_or(StoreError::Unauthorized)?;
        Ok(Principal {
            key_id: id,
            scope,
            allowed_models: row.get("allowed_models"),
        })
    }

    /// Resolve current access for a saved video query without reusing a revoked secret.
    /// Only the original rotation lineage, tenant and model grant can authorize recovery.
    pub async fn media_recovery_key(
        &self,
        scope: TenantScope,
        attempt: Uuid,
    ) -> Result<Principal, StoreError> {
        let key: Uuid = sqlx::query_scalar("SELECT current.id FROM attempts a JOIN api_keys original ON original.id=a.api_key_id JOIN api_keys current ON current.spending_root_id=original.spending_root_id AND current.organization_id=a.organization_id AND current.project_id=a.project_id JOIN media_jobs job ON job.attempt_id=a.id WHERE a.organization_id=$1 AND a.project_id=$2 AND a.id=$3 AND a.dispatched_at IS NOT NULL AND current.revoked_at IS NULL AND current.expires_at>clock_timestamp() AND ('*'=ANY(current.allowed_models) OR a.resource_id=ANY(current.allowed_models)) ORDER BY (current.id=original.id) DESC,current.created_at DESC,current.id LIMIT 1")
            .bind(scope.organization_id).bind(scope.project_id).bind(attempt).fetch_optional(&self.pool).await?.ok_or(StoreError::Unauthorized)?;
        self.dashboard_key(scope, key).await
    }

    pub async fn list_keys(&self, scope: TenantScope) -> Result<Vec<KeyView>, StoreError> {
        Ok(sqlx::query_as("SELECT k.id,k.revision,k.name,k.allowed_models,floor(extract(epoch FROM k.expires_at)*1000)::bigint AS expires_at_ms,floor(extract(epoch FROM activity.dispatched_at)*1000)::bigint AS last_used_at_ms,k.revoked_at IS NOT NULL AS revoked,k.expires_at <= clock_timestamp() AS expired FROM api_keys k LEFT JOIN LATERAL (SELECT a.dispatched_at FROM attempts a WHERE a.organization_id=k.organization_id AND a.project_id=k.project_id AND a.api_key_id=k.id AND a.dispatched_at IS NOT NULL ORDER BY a.dispatched_at DESC LIMIT 1) activity ON true WHERE k.organization_id=$1 AND k.project_id=$2 ORDER BY k.created_at,k.id LIMIT 1000")
            .bind(scope.organization_id).bind(scope.project_id).fetch_all(&self.pool).await?)
    }

    /// Edit metadata without replacing the secret or extending its expiration.
    /// The lock also serializes edits with dispatch admission and revocation.
    pub async fn update_key_metadata(
        &self,
        scope: TenantScope,
        id: Uuid,
        name: &str,
        models: &[String],
        expected_revision: i64,
        actor: &str,
    ) -> Result<i64, StoreError> {
        let name = name.trim();
        if name.is_empty()
            || name.len() > 200
            || models.is_empty()
            || models.iter().any(|m| m.is_empty() || m.len() > 200)
            || (models.iter().any(|m| m == "*") && models.len() != 1)
            || expected_revision < 1
        {
            return Err(StoreError::InvalidKey);
        }
        let mut tx = self.pool.begin().await?;
        let row = sqlx::query("SELECT name,allowed_models,revision FROM api_keys WHERE organization_id=$1 AND project_id=$2 AND id=$3 AND revoked_at IS NULL AND expires_at > clock_timestamp() FOR UPDATE")
            .bind(scope.organization_id).bind(scope.project_id).bind(id)
            .fetch_optional(&mut *tx).await?.ok_or(StoreError::Conflict)?;
        let revision: i64 = row.get("revision");
        if revision != expected_revision {
            return Err(StoreError::Conflict);
        }
        let previous_name: String = row.get("name");
        let previous_models: Vec<String> = row.get("allowed_models");
        if previous_name == name && previous_models == models {
            return Ok(revision);
        }
        sqlx::query(
            "UPDATE api_keys SET name=$1,allowed_models=$2,revision=revision+1 WHERE id=$3",
        )
        .bind(name)
        .bind(models)
        .bind(id)
        .execute(&mut *tx)
        .await?;
        sqlx::query("INSERT INTO key_audit_events (id,organization_id,project_id,key_id,action,actor,previous_metadata,updated_metadata) VALUES ($1,$2,$3,$4,'updated',$5,$6,$7)")
            .bind(Uuid::new_v4()).bind(scope.organization_id).bind(scope.project_id).bind(id).bind(actor)
            .bind(serde_json::json!({"name":previous_name,"allowed_models":previous_models,"revision":revision}))
            .bind(serde_json::json!({"name":name,"allowed_models":models,"revision":revision+1}))
            .execute(&mut *tx).await?;
        tx.commit().await?;
        Ok(revision + 1)
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
        sqlx::query("INSERT INTO api_keys (id,organization_id,project_id,name,token_hash,allowed_models,expires_at,spending_root_id) SELECT $1,organization_id,project_id,name,$2,allowed_models,expires_at,spending_root_id FROM api_keys WHERE id=$3")
            .bind(id).bind(hash).bind(old).execute(&mut *tx).await?;
        sqlx::query("INSERT INTO key_guardrail_assignments (organization_id,project_id,key_id,policy_revision,assignment_revision) SELECT organization_id,project_id,$1,policy_revision,assignment_revision FROM key_guardrail_assignments WHERE organization_id=$2 AND project_id=$3 AND key_id=$4")
            .bind(id).bind(scope.organization_id).bind(scope.project_id).bind(old).execute(&mut *tx).await?;
        // Record the replacement's inherited assignment at rotation time. The
        // original key's immutable history remains attached to that key.
        sqlx::query("INSERT INTO key_guardrail_assignment_events (organization_id,project_id,key_id,assignment_revision,policy_revision,actor) SELECT organization_id,project_id,key_id,assignment_revision,policy_revision,'system' FROM key_guardrail_assignments WHERE organization_id=$1 AND project_id=$2 AND key_id=$3")
            .bind(scope.organization_id).bind(scope.project_id).bind(id).execute(&mut *tx).await?;
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
        let mut tx = self.pool.begin().await?;
        let allowed = Self::mark_dispatched_using(&mut tx, principal, id).await?;
        tx.commit().await?;
        if allowed {
            Ok(())
        } else {
            Err(StoreError::Conflict)
        }
    }

    pub(crate) async fn mark_dispatched_using(
        tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
        principal: &Principal,
        id: Uuid,
    ) -> Result<bool, StoreError> {
        let scope = principal.scope;

        sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended('niu-guardrails:'||$1::text||':'||$2::text,0))")
            .bind(scope.organization_id).bind(scope.project_id).execute(&mut **tx).await?;

        let key = sqlx::query("SELECT k.id FROM api_keys k JOIN projects p ON p.organization_id=k.organization_id AND p.id=k.project_id WHERE k.id=$1 AND k.organization_id=$2 AND k.project_id=$3 AND k.revoked_at IS NULL AND k.expires_at > clock_timestamp() FOR SHARE OF k, p")
            .bind(principal.key_id).bind(scope.organization_id).bind(scope.project_id).fetch_optional(&mut **tx).await?;
        if key.is_none() {
            // The composite key foreign key guarantees that a valid key also
            // has its project. Locking both rows together keeps key revocation
            // and budget creation ordered with dispatch in a single query.
            return Err(StoreError::Unauthorized);
        }
        let account_eligible = sqlx::query_scalar::<_, bool>("SELECT a.health='ready' AND a.refresh_owner IS NULL AND a.credential_revision=s.credential_revision FROM account_assignments s JOIN supplier_accounts a ON a.organization_id=s.organization_id AND a.project_id=s.project_id AND a.id=s.account_id WHERE s.organization_id=$1 AND s.project_id=$2 AND s.attempt_id=$3 FOR SHARE OF a")
            .bind(scope.organization_id).bind(scope.project_id).bind(id).fetch_optional(&mut **tx).await?;
        if account_eligible == Some(false) {
            return Err(StoreError::AccountUnavailable);
        }
        if let Some((offer_id, revision)) = sqlx::query_as::<_, (Uuid, Uuid)>(
            "SELECT offer_id,revision_id FROM provider_attempt_offers WHERE attempt_id=$1",
        )
        .bind(id)
        .fetch_optional(&mut **tx)
        .await?
        {
            sqlx::query("SELECT id FROM provider_offers WHERE id=$1 AND current_revision=$2 AND active FOR SHARE").bind(offer_id).bind(revision).fetch_optional(&mut **tx).await?.ok_or(StoreError::AccountUnavailable)?;
        }
        // Take the attempt lock in a separate statement so the following
        // reservation check observes any release committed while we waited.
        sqlx::query("SELECT id FROM attempts WHERE organization_id=$1 AND project_id=$2 AND id=$3 FOR UPDATE")
            .bind(scope.organization_id).bind(scope.project_id).bind(id).fetch_optional(&mut **tx).await?.ok_or(StoreError::Conflict)?;
        let changed: i64 =
            sqlx::query_scalar("SELECT niu_mark_dispatched_with_guardrail_audit($1,$2,$3,$4)")
                .bind(scope.organization_id)
                .bind(scope.project_id)
                .bind(id)
                .bind(principal.key_id)
                .fetch_one(&mut **tx)
                .await
                .map_err(crate::accounting::map_gateway_admission_error)?;
        if changed == -1 {
            // Commit only the denial audit. Dispatch intent stayed not_sent.
            return Ok(false);
        }
        if changed != 1 {
            return Err(StoreError::Conflict);
        }
        Ok(true)
    }
}
