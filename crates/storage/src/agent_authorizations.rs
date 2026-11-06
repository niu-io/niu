//! Browser authorization requests. HTTP callers must authenticate and authorize
//! workspace writes before deciding; knowledge of a user code is not authority.
use crate::{IssuedKey, Store, StoreError, TenantScope};
use serde::Serialize;
use sha2::{Digest, Sha256};
use uuid::Uuid;

/// Inference interfaces are independently approvable. The order is stable for
/// API readback, review surfaces and contract tests. A credential may only use
/// an interface that was explicitly approved with its invocation authority.
pub const INVOCATION_PROTOCOLS: [&str; 7] = [
    "chat",
    "responses",
    "messages",
    "content",
    "decisions",
    "embeddings",
    "video",
];

/// Reject unknown, duplicate or empty interface selections. A missing list
/// means every interface only through the explicit legacy helper below.
pub fn valid_invocation_protocols(protocols: &[String]) -> bool {
    !protocols.is_empty()
        && protocols.len() <= INVOCATION_PROTOCOLS.len()
        && protocols
            .iter()
            .all(|value| INVOCATION_PROTOCOLS.contains(&value.as_str()))
        && protocols
            .iter()
            .collect::<std::collections::HashSet<_>>()
            .len()
            == protocols.len()
}

fn legacy_invocation_protocols() -> Vec<String> {
    INVOCATION_PROTOCOLS
        .iter()
        .map(|value| (*value).to_owned())
        .collect()
}

/// Secret returned once to the requesting agent; deliberately no Debug/Serialize.
pub struct AgentAuthorizationRequest {
    pub device_secret: String,
    pub user_code: String,
}

#[derive(Serialize)]
pub struct AgentAuthorizationView {
    pub client_name: String,
    pub state: String,
    pub capabilities: Vec<String>,
    /// Self-reported task context. It explains the request; it never grants
    /// authority or narrows the backend's independent authorization checks.
    pub task: Option<String>,
}

impl Store {
    pub async fn create_agent_authorization(
        &self,
        client_name: &str,
    ) -> Result<AgentAuthorizationRequest, StoreError> {
        self.create_agent_authorization_with_task(client_name, &[], None)
            .await
    }

    pub async fn create_agent_authorization_with_capabilities(
        &self,
        client_name: &str,
        capabilities: &[String],
    ) -> Result<AgentAuthorizationRequest, StoreError> {
        self.create_agent_authorization_with_task(client_name, capabilities, None)
            .await
    }

    /// The task is bounded, trimmed display context shown during review. It is
    /// never stored on the issued credential and never becomes an authority
    /// check, so wording differences cannot widen or narrow real grants.
    pub async fn create_agent_authorization_with_task(
        &self,
        client_name: &str,
        capabilities: &[String],
        task: Option<&str>,
    ) -> Result<AgentAuthorizationRequest, StoreError> {
        if capabilities.len() > 6
            || capabilities.iter().any(|value| {
                !matches!(
                    value.as_str(),
                    "pools:read"
                        | "pools:write"
                        | "events:read"
                        | "events:write"
                        | "evaluations:read"
                        | "evaluations:write"
                )
            })
            || capabilities
                .iter()
                .collect::<std::collections::HashSet<_>>()
                .len()
                != capabilities.len()
        {
            return Err(StoreError::InvalidKey);
        }
        let task = task.map(str::trim).filter(|value| !value.is_empty());
        if task.is_some_and(|value| {
            value.chars().count() > 200 || value.chars().any(|ch| ch.is_control())
        }) {
            return Err(StoreError::InvalidKey);
        }
        if !matches!(client_name, "Claude Code" | "Codex" | "DeepSeek Harness") {
            return Err(StoreError::InvalidKey);
        }
        let device_secret = format!("{}{}", Uuid::new_v4().simple(), Uuid::new_v4().simple());
        let user_code = Uuid::new_v4().simple().to_string()[..12].to_uppercase();
        sqlx::query("INSERT INTO agent_authorizations(id,client_name,device_hash,user_code,requested_capabilities,requested_task,expires_at) VALUES ($1,$2,$3,$4,$5,$6,clock_timestamp()+interval '10 minutes')")
            .bind(Uuid::new_v4()).bind(client_name)
            .bind(Sha256::digest(device_secret.as_bytes()).to_vec()).bind(&user_code).bind(capabilities).bind(task)
            .execute(&self.pool).await?;
        Ok(AgentAuthorizationRequest {
            device_secret,
            user_code,
        })
    }

    /// Browser-safe request metadata; never returns the polling capability.
    pub async fn agent_authorization_view(
        &self,
        user_code: &str,
    ) -> Result<AgentAuthorizationView, StoreError> {
        let row: Option<(String,String,Vec<String>,Option<String>)> = sqlx::query_as("SELECT client_name,state,requested_capabilities,requested_task FROM agent_authorizations WHERE user_code=$1 AND expires_at>clock_timestamp()")
            .bind(user_code).fetch_optional(&self.pool).await?;
        let (client_name, state, capabilities, task) = row.ok_or(StoreError::Unauthorized)?;
        Ok(AgentAuthorizationView {
            client_name,
            state,
            capabilities,
            task,
        })
    }

    /// Caller must first establish current workspace-write authority and validate
    /// visible model grants, exactly as for ordinary workspace key issuance.
    pub async fn approve_agent_authorization(
        &self,
        user_code: &str,
        scope: TenantScope,
        actor: Uuid,
        models: &[String],
        ttl_seconds: i64,
    ) -> Result<(), StoreError> {
        self.approve_agent_authorization_with_invocation(
            user_code,
            scope,
            actor,
            models,
            ttl_seconds,
            true,
        )
        .await
    }

    pub async fn approve_agent_authorization_with_invocation(
        &self,
        user_code: &str,
        scope: TenantScope,
        actor: Uuid,
        models: &[String],
        ttl_seconds: i64,
        invocation_allowed: bool,
    ) -> Result<(), StoreError> {
        self.approve_agent_authorization_with_scope(
            user_code,
            scope,
            actor,
            models,
            ttl_seconds,
            invocation_allowed,
            &legacy_invocation_protocols(),
        )
        .await
    }

    /// Persist the reviewed invocation switch and interface scope with the
    /// management grant. The interface list is frozen here; later model or
    /// protocol additions never expand it. Callers that do not select an
    /// interface list use the compatibility helper above and retain legacy
    /// full-interface meaning.
    #[allow(clippy::too_many_arguments)]
    pub async fn approve_agent_authorization_with_scope(
        &self,
        user_code: &str,
        scope: TenantScope,
        actor: Uuid,
        models: &[String],
        ttl_seconds: i64,
        invocation_allowed: bool,
        invocation_protocols: &[String],
    ) -> Result<(), StoreError> {
        if !(60..=86400).contains(&ttl_seconds)
            || models.is_empty()
            || models.iter().any(|m| m.is_empty() || m.len() > 200)
            || (models.iter().any(|m| m == "*") && models.len() != 1)
            || !valid_invocation_protocols(invocation_protocols)
        {
            return Err(StoreError::InvalidKey);
        }
        let result=sqlx::query("UPDATE agent_authorizations SET state='approved',organization_id=$2,project_id=$3,approved_by=$4,approved_models=$5,credential_ttl_seconds=$6,invocation_allowed=$7,invocation_protocols=$8 WHERE user_code=$1 AND state='pending' AND expires_at>clock_timestamp() AND EXISTS(SELECT 1 FROM admin_operators o WHERE o.id=$4 AND o.revoked_at IS NULL AND o.role IN ('owner','admin') AND o.organization_id=$2 AND (o.project_id IS NULL OR o.project_id=$3))")
            .bind(user_code).bind(scope.organization_id).bind(scope.project_id).bind(actor).bind(models).bind(ttl_seconds).bind(invocation_allowed).bind(invocation_protocols).execute(&self.pool).await?;
        if result.rows_affected() != 1 {
            return Err(StoreError::Conflict);
        }
        Ok(())
    }

    pub async fn deny_agent_authorization(&self, user_code: &str) -> Result<(), StoreError> {
        let result=sqlx::query("UPDATE agent_authorizations SET state='denied' WHERE user_code=$1 AND state='pending' AND expires_at>clock_timestamp()")
            .bind(user_code).execute(&self.pool).await?;
        if result.rows_affected() != 1 {
            return Err(StoreError::Conflict);
        }
        Ok(())
    }

    /// None means pending. Issuance is single-use and atomic. A lost successful
    /// response requires a new authorization; it cannot retrieve the secret.
    pub async fn exchange_agent_authorization(
        &self,
        device_secret: &str,
    ) -> Result<Option<IssuedKey>, StoreError> {
        if device_secret.len() != 64 || !device_secret.bytes().all(|b| b.is_ascii_hexdigit()) {
            return Err(StoreError::Unauthorized);
        }
        let mut tx = self.begin_bounded_recording().await?;
        type Grant = (
            Uuid,
            String,
            String,
            Option<Uuid>,
            Option<Uuid>,
            Option<Vec<String>>,
            Option<i64>,
            bool,
            Vec<String>,
        );
        let row:Option<Grant>=sqlx::query_as("SELECT id,state,client_name,organization_id,project_id,approved_models,credential_ttl_seconds,next_poll_at<=clock_timestamp(),invocation_protocols FROM agent_authorizations a WHERE device_hash=$1 AND expires_at>clock_timestamp() AND (state!='approved' OR EXISTS(SELECT 1 FROM admin_operators o WHERE o.id=a.approved_by AND o.revoked_at IS NULL AND o.role IN ('owner','admin') AND o.organization_id=a.organization_id AND (o.project_id IS NULL OR o.project_id=a.project_id))) FOR UPDATE")
            .bind(Sha256::digest(device_secret.as_bytes()).to_vec()).fetch_optional(&mut *tx).await?;
        let (id, state, client, organization, project, models, ttl, poll_ready, protocols) =
            row.ok_or(StoreError::Unauthorized)?;
        if (state == "pending" || state == "approved") && !poll_ready {
            return Err(StoreError::AgentAuthorizationPollLimited);
        }
        if state == "pending" {
            sqlx::query("UPDATE agent_authorizations SET next_poll_at=clock_timestamp()+interval '5 seconds' WHERE id=$1").bind(id).execute(&mut *tx).await?;
            tx.commit().await?;
            return Ok(None);
        }
        if state != "approved" {
            return Err(StoreError::Unauthorized);
        }
        let scope = TenantScope {
            organization_id: organization.ok_or(StoreError::Unauthorized)?,
            project_id: project.ok_or(StoreError::Unauthorized)?,
        };
        if !valid_invocation_protocols(&protocols) {
            return Err(StoreError::InvalidKey);
        }
        let issued = Self::issue_key_with_expiry_in_tx(
            &mut tx,
            scope,
            &format!("Niu for {client}"),
            &models.ok_or(StoreError::Unauthorized)?,
            ttl,
        )
        .await?;
        sqlx::query("UPDATE api_keys SET invocation_allowed=a.invocation_allowed,invocation_protocols=a.invocation_protocols FROM agent_authorizations a WHERE api_keys.id=$1 AND a.id=$2")
            .bind(issued.id).bind(id).execute(&mut *tx).await?;
        sqlx::query("INSERT INTO agent_key_capabilities(key_id,capability,authorization_id) SELECT $2,unnest(requested_capabilities),id FROM agent_authorizations WHERE id=$1")
            .bind(id).bind(issued.id).execute(&mut *tx).await?;
        sqlx::query(
            "UPDATE agent_authorizations SET state='consumed',issued_key_id=$2 WHERE id=$1",
        )
        .bind(id)
        .bind(issued.id)
        .execute(&mut *tx)
        .await?;
        tx.commit().await?;
        Ok(Some(issued))
    }
    pub async fn agent_key_has_capability(
        &self,
        scope: TenantScope,
        key_id: Uuid,
        capability: &str,
    ) -> Result<bool, StoreError> {
        Ok(sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM agent_key_capabilities c JOIN api_keys k ON k.id=c.key_id JOIN agent_authorizations a ON a.id=c.authorization_id JOIN admin_operators o ON o.id=a.approved_by WHERE c.key_id=$1 AND k.organization_id=$2 AND k.project_id=$3 AND c.capability=$4 AND k.revoked_at IS NULL AND k.expires_at>clock_timestamp() AND o.revoked_at IS NULL AND o.role IN ('owner','admin') AND o.organization_id=k.organization_id AND (o.project_id IS NULL OR o.project_id=k.project_id))")
            .bind(key_id).bind(scope.organization_id).bind(scope.project_id).bind(capability).fetch_one(&self.pool).await?)
    }
    pub async fn agent_key_capabilities(
        &self,
        scope: TenantScope,
        key_id: Uuid,
    ) -> Result<Vec<String>, StoreError> {
        Ok(sqlx::query_scalar("SELECT c.capability FROM agent_key_capabilities c JOIN api_keys k ON k.id=c.key_id JOIN agent_authorizations a ON a.id=c.authorization_id JOIN admin_operators o ON o.id=a.approved_by WHERE c.key_id=$1 AND k.organization_id=$2 AND k.project_id=$3 AND k.revoked_at IS NULL AND k.expires_at>clock_timestamp() AND o.revoked_at IS NULL AND o.role IN ('owner','admin') AND o.organization_id=k.organization_id AND (o.project_id IS NULL OR o.project_id=k.project_id) ORDER BY c.capability")
            .bind(key_id).bind(scope.organization_id).bind(scope.project_id).fetch_all(&self.pool).await?)
    }
}
