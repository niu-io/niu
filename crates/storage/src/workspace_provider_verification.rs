//! Workspace-owned upstream verification sessions. No local liveness judgment,
//! client approval, plaintext token retention or automatic creation replay.
use crate::{
    Principal, Store, StoreError, TenantScope, WorkspaceProviderAssetPage,
    WorkspaceProviderAssetRoute,
};
use niu_media::fastrouter_domain::{
    FastRouterVerificationCreate, FastRouterVerificationResult, FastRouterVerificationSession,
    FastRouterVerificationStatus,
};
use serde::Serialize;
use sha2::{Digest, Sha256};
use uuid::Uuid;

#[derive(Serialize, sqlx::FromRow)]
pub struct WorkspaceProviderVerificationSession {
    pub id: Uuid,
    pub model: String,
    pub subject_name: Option<String>,
    pub status: String,
    pub group_id: Option<Uuid>,
    pub expires_at: Option<String>,
    pub created_at_ms: i64,
    pub updated_at_ms: i64,
    #[serde(skip)]
    key_id: Uuid,
    #[serde(skip)]
    stored_status: String,
    #[serde(skip)]
    vendor_id: Uuid,
    #[serde(skip)]
    vendor_revision: i64,
    #[serde(skip)]
    model_revision: i64,
}
impl WorkspaceProviderVerificationSession {
    pub fn original_key_id(&self) -> Uuid {
        self.key_id
    }
    pub fn vendor_id(&self) -> Uuid {
        self.vendor_id
    }
    pub fn vendor_revision(&self) -> i64 {
        self.vendor_revision
    }
    pub fn model_revision(&self) -> i64 {
        self.model_revision
    }
}
/// Authenticated private envelope only; no Debug/Serialize or public URI.
pub struct WorkspaceProviderVerificationContent {
    pub session: WorkspaceProviderVerificationSession,
    pub ciphertext: Vec<u8>,
    pub aad: Vec<u8>,
}
pub fn workspace_provider_verification_aad(scope: TenantScope, key: Uuid, id: Uuid) -> Vec<u8> {
    format!(
        "niu:provider-verification-session:v1\0{}\0{}\0{}\0{}",
        scope.organization_id, scope.project_id, key, id
    )
    .into_bytes()
}
const COLS: &str = "id,model_alias AS model,subject_name,CASE WHEN expires_at<=clock_timestamp() AND status IN ('waiting_user','processing','unknown','resolving') THEN 'expired' WHEN status='resolving' THEN 'unknown' ELSE status END AS status,group_id,to_char(expires_at AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') AS expires_at,floor(extract(epoch FROM created_at)*1000)::bigint AS created_at_ms,floor(extract(epoch FROM updated_at)*1000)::bigint AS updated_at_ms,key_id,vendor_id,vendor_revision,model_revision,status AS stored_status";
impl Store {
    async fn verification_using(
        tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
        scope: TenantScope,
        id: Uuid,
        lock: bool,
    ) -> Result<Option<WorkspaceProviderVerificationSession>, StoreError> {
        let sql = format!(
            "SELECT {COLS} FROM workspace_provider_verification_sessions WHERE organization_id=$1 AND project_id=$2 AND id=$3{}",
            if lock { " FOR UPDATE" } else { "" }
        );
        Ok(sqlx::query_as(&sql)
            .bind(scope.organization_id)
            .bind(scope.project_id)
            .bind(id)
            .fetch_optional(&mut **tx)
            .await?)
    }
    fn verification_bound(
        session: &WorkspaceProviderVerificationSession,
        route: &WorkspaceProviderAssetRoute,
    ) -> Result<(), StoreError> {
        if session.model != route.model_alias()
            || session.vendor_id != route.vendor_id()
            || session.vendor_revision != route.vendor_revision()
            || session.model_revision != route.model_revision()
        {
            return Err(StoreError::Conflict);
        }
        Ok(())
    }
    pub async fn workspace_provider_verification(
        &self,
        p: &Principal,
        id: Uuid,
    ) -> Result<Option<WorkspaceProviderVerificationSession>, StoreError> {
        let mut tx = self.begin_bounded_read_snapshot().await?;
        let session = Self::verification_using(&mut tx, p.scope(), id, false).await?;
        if let Some(session) = &session {
            Self::provider_asset_key_using(&mut tx, p, &session.model, false).await?;
        }
        tx.commit().await?;
        Ok(session)
    }
    pub async fn workspace_provider_verifications(
        &self,
        p: &Principal,
        model: &str,
        after: Option<Uuid>,
        limit: i64,
    ) -> Result<WorkspaceProviderAssetPage<WorkspaceProviderVerificationSession>, StoreError> {
        if !(1..=100).contains(&limit) {
            return Err(StoreError::InvalidObservation);
        }
        let mut tx = self.begin_bounded_read_snapshot().await?;
        Self::provider_asset_key_using(&mut tx, p, model, false).await?;
        if let Some(id) = after {
            let cursor = Self::verification_using(&mut tx, p.scope(), id, false)
                .await?
                .ok_or(StoreError::Conflict)?;
            if cursor.model != model {
                return Err(StoreError::Conflict);
            }
        }
        let scope = p.scope();
        let sql = format!(
            "SELECT {COLS} FROM workspace_provider_verification_sessions WHERE organization_id=$1 AND project_id=$2 AND model_alias=$3 AND ($4::uuid IS NULL OR id>$4) ORDER BY id LIMIT $5"
        );
        let mut data: Vec<WorkspaceProviderVerificationSession> = sqlx::query_as(&sql)
            .bind(scope.organization_id)
            .bind(scope.project_id)
            .bind(model)
            .bind(after)
            .bind(limit + 1)
            .fetch_all(&mut *tx)
            .await?;
        let next_cursor = if data.len() > limit as usize {
            data.truncate(limit as usize);
            data.last().map(|session| session.id)
        } else {
            None
        };
        tx.commit().await?;
        Ok(WorkspaceProviderAssetPage { data, next_cursor })
    }
    pub async fn prepare_workspace_provider_verification(
        &self,
        p: &Principal,
        route: &WorkspaceProviderAssetRoute,
        input: &FastRouterVerificationCreate,
        idem: Uuid,
    ) -> Result<WorkspaceProviderVerificationSession, StoreError> {
        if idem.is_nil() {
            return Err(StoreError::InvalidObservation);
        }
        let body = input.body().map_err(|_| StoreError::InvalidObservation)?;
        let digest = Sha256::digest(
            serde_json::to_vec(&(route.model_alias(), body))
                .map_err(|_| StoreError::InvalidObservation)?,
        )
        .to_vec();
        let mut tx = self.begin_bounded_recording().await?;
        Self::provider_asset_route_check_using(&mut tx, p, route).await?;
        let scope = p.scope();
        sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))")
            .bind(format!(
                "niu-provider-assets:{}:{}",
                scope.organization_id, scope.project_id
            ))
            .execute(&mut *tx)
            .await?;
        let found:Option<(Uuid,Vec<u8>)>=sqlx::query_as("SELECT id,request_sha256 FROM workspace_provider_verification_sessions WHERE organization_id=$1 AND project_id=$2 AND idempotency_key=$3").bind(scope.organization_id).bind(scope.project_id).bind(idem).fetch_optional(&mut *tx).await?;
        let id = if let Some((id, saved)) = found {
            if saved != digest {
                return Err(StoreError::Conflict);
            }
            id
        } else {
            let count: i64 = sqlx::query_scalar(
                "SELECT count(*) FROM workspace_provider_verification_sessions \
                 WHERE organization_id=$1 AND project_id=$2 \
                   AND status NOT IN ('verified','failed','expired','not_sent') \
                   AND (expires_at IS NULL OR expires_at > clock_timestamp())",
            )
            .bind(scope.organization_id)
            .bind(scope.project_id)
            .fetch_one(&mut *tx)
            .await?;
            if count >= 1024 {
                return Err(StoreError::Conflict);
            }
            let id = Uuid::new_v4();
            sqlx::query("INSERT INTO workspace_provider_verification_sessions(id,organization_id,project_id,key_id,vendor_id,vendor_revision,model_alias,model_revision,upstream_model,idempotency_key,request_sha256,subject_name,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'prepared')")
                .bind(id).bind(scope.organization_id).bind(scope.project_id).bind(p.key_id()).bind(route.vendor_id()).bind(route.vendor_revision()).bind(route.model_alias()).bind(route.model_revision()).bind(route.upstream_model()).bind(idem).bind(digest).bind(&input.subject_name).execute(&mut *tx).await?;
            id
        };
        let session = Self::verification_using(&mut tx, scope, id, false)
            .await?
            .ok_or(StoreError::Conflict)?;
        Self::verification_bound(&session, route)?;
        tx.commit().await?;
        Ok(session)
    }
    pub async fn claim_workspace_provider_verification(
        &self,
        p: &Principal,
        id: Uuid,
        route: &WorkspaceProviderAssetRoute,
    ) -> Result<bool, StoreError> {
        let mut tx = self.begin_bounded_recording().await?;
        Self::provider_asset_route_check_using(&mut tx, p, route).await?;
        let session = Self::verification_using(&mut tx, p.scope(), id, true)
            .await?
            .ok_or(StoreError::Conflict)?;
        Self::verification_bound(&session, route)?;
        let claimed = if session.status == "prepared" {
            sqlx::query("UPDATE workspace_provider_verification_sessions SET status='unknown',updated_at=clock_timestamp() WHERE id=$1").bind(id).execute(&mut *tx).await?;
            true
        } else {
            false
        };
        tx.commit().await?;
        Ok(claimed)
    }
    pub async fn record_workspace_provider_verification_created(
        &self,
        scope: TenantScope,
        id: Uuid,
        ciphertext: &[u8],
        upstream: &FastRouterVerificationSession,
    ) -> Result<(), StoreError> {
        if !(30..=32800).contains(&ciphertext.len()) {
            return Err(StoreError::InvalidObservation);
        }
        let expiry = upstream.expires_at();
        let mut tx = self.begin_bounded_recording().await?;
        let count=sqlx::query("UPDATE workspace_provider_verification_sessions SET ciphertext=$4,expires_at=date_trunc('milliseconds',$5::text::timestamptz),status=CASE WHEN $5::text::timestamptz<=clock_timestamp() THEN 'expired' ELSE 'waiting_user' END,updated_at=clock_timestamp() WHERE organization_id=$1 AND project_id=$2 AND id=$3 AND status='unknown' AND ciphertext IS NULL")
            .bind(scope.organization_id).bind(scope.project_id).bind(id).bind(ciphertext).bind(expiry).execute(&mut *tx).await?.rows_affected();
        if count != 1 {
            return Err(StoreError::Conflict);
        }
        tx.commit().await?;
        Ok(())
    }
    pub async fn record_workspace_provider_verification_failure(
        &self,
        scope: TenantScope,
        id: Uuid,
        http_status: Option<u16>,
        request_id: Option<&str>,
        not_dispatched: bool,
    ) -> Result<(), StoreError> {
        if http_status.is_some_and(|status| !(100..=599).contains(&status))
            || request_id
                .is_some_and(|value| value.len() > 256 || value.chars().any(char::is_control))
        {
            return Err(StoreError::InvalidObservation);
        }
        let mut tx = self.begin_bounded_recording().await?;
        sqlx::query("UPDATE workspace_provider_verification_sessions SET status=CASE WHEN $6 THEN 'not_sent' ELSE status END,http_status=$4,request_id=$5,updated_at=clock_timestamp() WHERE organization_id=$1 AND project_id=$2 AND id=$3 AND status='unknown' AND ciphertext IS NULL")
            .bind(scope.organization_id).bind(scope.project_id).bind(id).bind(http_status.map(i32::from)).bind(request_id).bind(not_dispatched).execute(&mut *tx).await?;
        tx.commit().await?;
        Ok(())
    }
    pub async fn workspace_provider_verification_content(
        &self,
        p: &Principal,
        id: Uuid,
        route: &WorkspaceProviderAssetRoute,
    ) -> Result<WorkspaceProviderVerificationContent, StoreError> {
        let mut tx = self.begin_bounded_recording().await?;
        Self::provider_asset_route_check_using(&mut tx, p, route).await?;
        let session = Self::verification_using(&mut tx, p.scope(), id, false)
            .await?
            .ok_or(StoreError::Conflict)?;
        Self::verification_bound(&session, route)?;
        if !matches!(session.status.as_str(), "waiting_user" | "processing") {
            return Err(StoreError::Conflict);
        }
        let ciphertext: Vec<u8> = sqlx::query_scalar(
            "SELECT ciphertext FROM workspace_provider_verification_sessions WHERE id=$1",
        )
        .bind(id)
        .fetch_one(&mut *tx)
        .await?;
        let aad = workspace_provider_verification_aad(p.scope(), session.key_id, id);
        tx.commit().await?;
        Ok(WorkspaceProviderVerificationContent {
            session,
            ciphertext,
            aad,
        })
    }
    pub async fn claim_workspace_provider_verification_query(
        &self,
        p: &Principal,
        id: Uuid,
        route: &WorkspaceProviderAssetRoute,
    ) -> Result<bool, StoreError> {
        let mut tx = self.begin_bounded_recording().await?;
        Self::provider_asset_route_check_using(&mut tx, p, route).await?;
        let session = Self::verification_using(&mut tx, p.scope(), id, true)
            .await?
            .ok_or(StoreError::Conflict)?;
        Self::verification_bound(&session, route)?;
        let claimed = if matches!(session.status.as_str(), "waiting_user" | "processing") {
            sqlx::query("UPDATE workspace_provider_verification_sessions SET query_previous_status=status,status='resolving',updated_at=clock_timestamp() WHERE id=$1").bind(id).execute(&mut *tx).await?;
            true
        } else {
            false
        };
        tx.commit().await?;
        Ok(claimed)
    }
    pub async fn record_workspace_provider_verification_query_failure(
        &self,
        scope: TenantScope,
        id: Uuid,
        http_status: Option<u16>,
        request_id: Option<&str>,
        not_dispatched: bool,
    ) -> Result<(), StoreError> {
        if http_status.is_some_and(|status| !(100..=599).contains(&status))
            || request_id
                .is_some_and(|value| value.len() > 256 || value.chars().any(char::is_control))
        {
            return Err(StoreError::InvalidObservation);
        }
        let mut tx = self.begin_bounded_recording().await?;
        let _ = not_dispatched;
        sqlx::query("UPDATE workspace_provider_verification_sessions SET status=CASE WHEN expires_at IS NOT NULL AND expires_at<=clock_timestamp() THEN 'expired' ELSE query_previous_status END,ciphertext=CASE WHEN expires_at IS NOT NULL AND expires_at<=clock_timestamp() THEN NULL ELSE ciphertext END,query_previous_status=NULL,http_status=$4,request_id=$5,updated_at=clock_timestamp() WHERE organization_id=$1 AND project_id=$2 AND id=$3 AND status='resolving'")
            .bind(scope.organization_id).bind(scope.project_id).bind(id).bind(http_status.map(i32::from)).bind(request_id).execute(&mut *tx).await?;
        tx.commit().await?;
        Ok(())
    }
    pub async fn observe_workspace_provider_verification(
        &self,
        p: &Principal,
        id: Uuid,
        route: &WorkspaceProviderAssetRoute,
        result: &FastRouterVerificationResult,
    ) -> Result<WorkspaceProviderVerificationSession, StoreError> {
        let status = match result.status {
            FastRouterVerificationStatus::WaitingUser => "waiting_user",
            FastRouterVerificationStatus::Processing => "processing",
            FastRouterVerificationStatus::Verified => "verified",
            FastRouterVerificationStatus::Failed => "failed",
            FastRouterVerificationStatus::Expired => "expired",
        };
        if (status == "verified") != result.private_group_reference().is_some() {
            return Err(StoreError::InvalidObservation);
        }
        let mut tx = self.begin_bounded_recording().await?;
        Self::provider_asset_route_check_using(&mut tx, p, route).await?;
        let scope = p.scope();
        sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))")
            .bind(format!(
                "niu-provider-assets:{}:{}",
                scope.organization_id, scope.project_id
            ))
            .execute(&mut *tx)
            .await?;
        let session = Self::verification_using(&mut tx, scope, id, true)
            .await?
            .ok_or(StoreError::Conflict)?;
        Self::verification_bound(&session, route)?;
        if session.stored_status != "resolving" || session.status == "expired" {
            return Err(StoreError::Conflict);
        }
        let group_id = if let Some(reference) = result.private_group_reference() {
            let count:i64=sqlx::query_scalar("SELECT count(*) FROM workspace_provider_asset_groups WHERE organization_id=$1 AND project_id=$2 AND status<>'deleted'").bind(scope.organization_id).bind(scope.project_id).fetch_one(&mut *tx).await?;
            if count >= 256 {
                return Err(StoreError::Conflict);
            }
            let group_id = Uuid::new_v4();
            let name = session
                .subject_name
                .as_deref()
                .unwrap_or("Verified person group");
            sqlx::query("INSERT INTO workspace_provider_asset_groups(id,organization_id,project_id,vendor_id,vendor_revision,model_alias,model_revision,upstream_model,provider_ref,name,kind,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'person','ready')")
                .bind(group_id).bind(scope.organization_id).bind(scope.project_id).bind(route.vendor_id()).bind(route.vendor_revision()).bind(route.model_alias()).bind(route.model_revision()).bind(route.upstream_model()).bind(reference.private_ref()).bind(name).execute(&mut *tx).await?;
            Some(group_id)
        } else {
            None
        };
        sqlx::query("UPDATE workspace_provider_verification_sessions SET status=$2,group_id=$3,ciphertext=CASE WHEN $2 IN ('verified','failed','expired') THEN NULL ELSE ciphertext END,query_previous_status=NULL,updated_at=clock_timestamp() WHERE id=$1").bind(id).bind(status).bind(group_id).execute(&mut *tx).await?;
        let session = Self::verification_using(&mut tx, scope, id, false)
            .await?
            .ok_or(StoreError::Conflict)?;
        tx.commit().await?;
        Ok(session)
    }
    pub async fn purge_expired_workspace_provider_verification_sessions(
        &self,
    ) -> Result<u64, StoreError> {
        self.run_background_work(
            crate::background_work::BackgroundWork::ContentRetention,
            |tx| {
                Box::pin(async move {
                    let removed: i64 = sqlx::query_scalar(
                        "SELECT niu_purge_workspace_provider_verification_page()",
                    )
                    .fetch_one(&mut **tx)
                    .await?;
                    Ok(removed as u64)
                })
            },
        )
        .await
        .map(|removed| removed.unwrap_or(0))
    }
}
