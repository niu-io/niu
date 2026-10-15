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
        if let Some((kind, actor, hash)) = &identity
            && (hash.len() != 32 || (*kind == "member" && actor.is_nil()))
        {
            return Err(StoreError::Conflict);
        }
        let mut tx = self.begin_bounded_recording().await?;
        if let Some((kind, actor, hash)) = &identity {
            sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended('niu-workspace-create:'||$1::text||':'||$2::uuid::text||':'||encode($3::bytea,'hex'),0))")
                .bind(kind).bind(actor).bind(hash).execute(&mut *tx).await?;
        }
        if let Some(member) = member {
            Self::authorize_company_writer_in_tx(
                &mut tx,
                organization_id.ok_or(StoreError::Unauthorized)?,
                member,
            )
            .await?;
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
