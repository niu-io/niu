//! Atomic workspace onboarding with optional durable, actor-scoped replay.
use crate::{OperatorAuditActor, OperatorPrincipal, Store, StoreError, TenantScope};
use sha2::{Digest, Sha256};
use uuid::Uuid;

pub struct WorkspaceCreationKey {
    pub actor: OperatorAuditActor,
    pub key_sha256: Vec<u8>,
}

impl Store {
    pub async fn create_workspace(
        &self,
        organization_id: Option<Uuid>,
        name: &str,
    ) -> Result<TenantScope, StoreError> {
        self.create_workspace_with_key(organization_id, name, None, None)
            .await
    }

    /// Receipt, optional company/account and workspace commit together. Replays
    /// return the original identity. Gateway callers supply the authenticated
    /// member for transactional reauthorization; None is installation/internal use.
    pub async fn create_workspace_with_key(
        &self,
        organization_id: Option<Uuid>,
        name: &str,
        key: Option<WorkspaceCreationKey>,
        member: Option<OperatorPrincipal>,
    ) -> Result<TenantScope, StoreError> {
        let request =
            serde_json::to_vec(&serde_json::json!({"organization_id":organization_id,"name":name}))
                .map_err(|_| StoreError::Conflict)?;
        let request_sha256 = Sha256::digest(request).to_vec();
        let identity = key.map(|key| {
            let (kind, actor) = match key.actor {
                OperatorAuditActor::Installation => ("installation", Uuid::nil()),
                OperatorAuditActor::Operator(id) => ("member", id),
            };
            (kind, actor, key.key_sha256)
        });
        let mut tx = self.pool.begin().await?;
        if let Some((kind, actor, hash)) = &identity {
            if hash.len() != 32 || (*kind == "member" && actor.is_nil()) {
                return Err(StoreError::Conflict);
            }
            sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended('niu-workspace-create:'||$1::text||':'||$2::uuid::text||':'||encode($3::bytea,'hex'),0))")
                .bind(kind).bind(actor).bind(hash).execute(&mut *tx).await?;
        }
        // Lock current member and session rows after any idempotency wait, so
        // revocation or scope changes cannot race the receipt/business commit.
        // The separate clock query also evaluates expiry after row-lock waits.
        if let Some(member) = member {
            let access: Option<(bool, i64)> = sqlx::query_as(
                "SELECT o.revoked_at IS NULL AND s.revoked_at IS NULL \
                 AND o.role IN ('owner','admin') AND o.project_id IS NULL \
                 AND o.organization_id=$3, s.expires_at_unix \
                 FROM admin_operators o JOIN admin_sessions s ON s.operator_id=o.id \
                 WHERE o.id=$1 AND s.id=$2 FOR SHARE OF o,s",
            )
            .bind(member.id)
            .bind(member.session_id)
            .bind(organization_id)
            .fetch_optional(&mut *tx)
            .await?;
            let Some((true, expires_at)) = access else {
                return Err(StoreError::Unauthorized);
            };
            let unexpired: bool = sqlx::query_scalar(
                "SELECT $1::bigint > extract(epoch FROM clock_timestamp())::bigint",
            )
            .bind(expires_at)
            .fetch_one(&mut *tx)
            .await?;
            if !unexpired {
                return Err(StoreError::Unauthorized);
            }
        }
        if let Some((kind, actor, hash)) = &identity {
            let saved: Option<(Vec<u8>, Uuid, Uuid)> = sqlx::query_as("SELECT request_sha256,organization_id,project_id FROM workspace_creation_receipts WHERE actor_kind=$1 AND actor_id=$2 AND key_sha256=$3")
                .bind(kind).bind(actor).bind(hash).fetch_optional(&mut *tx).await?;
            if let Some((request, organization_id, project_id)) = saved {
                if request != request_sha256 {
                    return Err(StoreError::Conflict);
                }
                tx.commit().await?;
                return Ok(TenantScope {
                    organization_id,
                    project_id,
                });
            }
        }
        let organization_id = match organization_id {
            Some(id) => id,
            None => {
                Self::create_prepaid_organization_in_tx(&mut tx, "Personal workspace", "USD")
                    .await?
            }
        };
        let project_id = Uuid::new_v4();
        sqlx::query("INSERT INTO projects(id,organization_id,name) VALUES($1,$2,$3)")
            .bind(project_id)
            .bind(organization_id)
            .bind(name)
            .execute(&mut *tx)
            .await?;
        if let Some((kind, actor, hash)) = identity {
            sqlx::query("INSERT INTO workspace_creation_receipts(actor_kind,actor_id,key_sha256,request_sha256,organization_id,project_id) VALUES($1,$2,$3,$4,$5,$6)")
                .bind(kind).bind(actor).bind(hash).bind(request_sha256).bind(organization_id).bind(project_id).execute(&mut *tx).await?;
        }
        tx.commit().await?;
        Ok(TenantScope {
            organization_id,
            project_id,
        })
    }
}
