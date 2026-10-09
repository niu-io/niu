//! Workspace-private subscription supply. Credentials are opaque ciphertext.
use crate::{Store, StoreError, TenantScope};
use serde_json::Value;
use uuid::Uuid;

#[derive(sqlx::FromRow, serde::Serialize)]
pub struct CodexConnectionView {
    pub id: Uuid,
    pub name: String,
    pub health: String,
    pub busy: bool,
    pub models: Value,
}

// Never derive Debug or Serialize for credential-bearing records.
#[derive(sqlx::FromRow)]
pub struct CodexConnectionSecret {
    pub account_id: Uuid,
    pub subject: String,
    pub client_id: String,
    pub credential_ciphertext: Vec<u8>,
}

pub struct CodexConnectionInput<'a> {
    pub id: Uuid,
    pub name: &'a str,
    pub subject: &'a str,
    pub client_id: &'a str,
    pub credential_ciphertext: &'a [u8],
    pub models: &'a Value,
}

impl Store {
    pub async fn codex_connection_secrets(&self) -> Result<Vec<CodexConnectionSecret>, StoreError> {
        Ok(sqlx::query_as(
            "SELECT account_id,subject,client_id,credential_ciphertext FROM codex_connections",
        )
        .fetch_all(&self.pool)
        .await?)
    }
    pub async fn codex_host_id(&self) -> Result<Uuid, StoreError> {
        sqlx::query("INSERT INTO codex_runtime_identity(singleton,host_id) VALUES(TRUE,$1) ON CONFLICT DO NOTHING")
            .bind(Uuid::new_v4()).execute(&self.pool).await?;
        Ok(
            sqlx::query_scalar("SELECT host_id FROM codex_runtime_identity WHERE singleton")
                .fetch_one(&self.pool)
                .await?,
        )
    }

    pub async fn codex_connections(
        &self,
        scope: TenantScope,
    ) -> Result<Vec<CodexConnectionView>, StoreError> {
        Ok(sqlx::query_as("SELECT c.account_id AS id,c.name,a.health,c.lease_owner IS NOT NULL AS busy,c.models FROM codex_connections c JOIN supplier_accounts a ON a.id=c.account_id WHERE c.organization_id=$1 AND c.project_id=$2 ORDER BY c.name,c.account_id LIMIT 1000")
            .bind(scope.organization_id).bind(scope.project_id).fetch_all(&self.pool).await?)
    }

    pub async fn codex_connection_secret(
        &self,
        scope: TenantScope,
        id: Uuid,
    ) -> Result<CodexConnectionSecret, StoreError> {
        sqlx::query_as("SELECT account_id,subject,client_id,credential_ciphertext FROM codex_connections WHERE organization_id=$1 AND project_id=$2 AND account_id=$3")
            .bind(scope.organization_id).bind(scope.project_id).bind(id).fetch_optional(&self.pool).await?.ok_or(StoreError::Conflict)
    }

    pub async fn save_codex_connection(
        &self,
        scope: TenantScope,
        input: CodexConnectionInput<'_>,
        replacing: bool,
    ) -> Result<(), StoreError> {
        if input.name.trim().is_empty()
            || input.name.len() > 100
            || input.name.chars().any(char::is_control)
            || input.subject.is_empty()
            || input.client_id.is_empty()
            || input.credential_ciphertext.is_empty()
            || input
                .models
                .as_array()
                .is_none_or(|models| models.is_empty() || models.len() > 1000)
        {
            return Err(StoreError::InvalidAccount);
        }
        let mut tx = self.pool.begin().await?;
        if replacing {
            let changed=sqlx::query("UPDATE codex_connections SET name=$4,credential_ciphertext=$5,models=$6,cooldown_until=NULL WHERE organization_id=$1 AND project_id=$2 AND account_id=$3 AND subject=$7 AND client_id=$8 AND lease_owner IS NULL")
                .bind(scope.organization_id).bind(scope.project_id).bind(input.id).bind(input.name).bind(input.credential_ciphertext).bind(input.models).bind(input.subject).bind(input.client_id).execute(&mut *tx).await?.rows_affected();
            if changed != 1 {
                return Err(StoreError::AccountUnavailable);
            }
            sqlx::query("UPDATE supplier_accounts SET health='ready',credential_revision=credential_revision+1 WHERE id=$1 AND health<>'disabled'")
                .bind(input.id).execute(&mut *tx).await?;
        } else {
            sqlx::query("INSERT INTO supplier_accounts(id,organization_id,project_id,provider,plan,authentication_mode,billing_mode,credential_reference,concurrency_limit,health) VALUES($1,$2,$3,'codex','ChatGPT plan','oauth_refresh','subscription',$4,1,'ready')")
                .bind(input.id).bind(scope.organization_id).bind(scope.project_id).bind(format!("secret:codex/{}",input.id)).execute(&mut *tx).await?;
            sqlx::query("INSERT INTO codex_connections(account_id,organization_id,project_id,name,subject,client_id,credential_ciphertext,models) VALUES($1,$2,$3,$4,$5,$6,$7,$8)")
                .bind(input.id).bind(scope.organization_id).bind(scope.project_id).bind(input.name).bind(input.subject).bind(input.client_id).bind(input.credential_ciphertext).bind(input.models).execute(&mut *tx).await?;
        }
        tx.commit().await?;
        Ok(())
    }

    /// A durable exclusive lease serializes execution and rotating OAuth refresh.
    /// No timeout steals a lease after an ambiguous provider outcome.
    pub async fn claim_codex_connection(
        &self,
        scope: TenantScope,
        model: &str,
        owner: Uuid,
    ) -> Result<CodexConnectionSecret, StoreError> {
        let mut tx = self.pool.begin().await?;
        let secret: CodexConnectionSecret=sqlx::query_as("SELECT c.account_id,c.subject,c.client_id,c.credential_ciphertext FROM codex_connections c JOIN supplier_accounts a ON a.id=c.account_id WHERE c.organization_id=$1 AND c.project_id=$2 AND a.health IN ('ready','cooldown') AND a.refresh_owner IS NULL AND c.lease_owner IS NULL AND (c.cooldown_until IS NULL OR c.cooldown_until<=clock_timestamp()) AND c.models @> $3 ORDER BY c.last_used_at NULLS FIRST,c.account_id FOR UPDATE OF c,a SKIP LOCKED LIMIT 1")
            .bind(scope.organization_id).bind(scope.project_id).bind(serde_json::json!([{ "slug":model }])).fetch_optional(&mut *tx).await?.ok_or(StoreError::AccountUnavailable)?;
        sqlx::query("UPDATE codex_connections SET lease_owner=$2,last_used_at=clock_timestamp() WHERE account_id=$1")
            .bind(secret.account_id).bind(owner).execute(&mut *tx).await?;
        tx.commit().await?;
        Ok(secret)
    }

    pub async fn replace_codex_tokens(
        &self,
        scope: TenantScope,
        id: Uuid,
        owner: Uuid,
        ciphertext: &[u8],
    ) -> Result<(), StoreError> {
        let mut tx = self.pool.begin().await?;
        let changed=sqlx::query("UPDATE codex_connections SET credential_ciphertext=$5 WHERE organization_id=$1 AND project_id=$2 AND account_id=$3 AND lease_owner=$4")
            .bind(scope.organization_id).bind(scope.project_id).bind(id).bind(owner).bind(ciphertext).execute(&mut *tx).await?.rows_affected();
        if changed != 1 {
            return Err(StoreError::Conflict);
        }
        sqlx::query(
            "UPDATE supplier_accounts SET credential_revision=credential_revision+1 WHERE id=$1",
        )
        .bind(id)
        .execute(&mut *tx)
        .await?;
        tx.commit().await?;
        Ok(())
    }

    pub async fn bind_codex_attempt(
        &self,
        scope: TenantScope,
        id: Uuid,
        owner: Uuid,
        attempt: Uuid,
    ) -> Result<(), StoreError> {
        let mut tx = self.pool.begin().await?;
        let revision:i64=sqlx::query_scalar("SELECT a.credential_revision FROM codex_connections c JOIN supplier_accounts a ON a.id=c.account_id WHERE c.organization_id=$1 AND c.project_id=$2 AND c.account_id=$3 AND c.lease_owner=$4 AND a.health IN ('ready','cooldown') AND a.refresh_owner IS NULL AND (c.cooldown_until IS NULL OR c.cooldown_until<=clock_timestamp()) FOR UPDATE OF c,a")
            .bind(scope.organization_id).bind(scope.project_id).bind(id).bind(owner).fetch_optional(&mut *tx).await?.ok_or(StoreError::AccountUnavailable)?;
        sqlx::query("INSERT INTO account_assignments(attempt_id,organization_id,project_id,account_id,credential_revision) VALUES($1,$2,$3,$4,$5)")
            .bind(attempt).bind(scope.organization_id).bind(scope.project_id).bind(id).bind(revision).execute(&mut *tx).await?;
        tx.commit().await?;
        Ok(())
    }

    pub async fn finish_codex_lease(
        &self,
        scope: TenantScope,
        id: Uuid,
        owner: Uuid,
        health: &str,
        cooldown_seconds: i32,
    ) -> Result<(), StoreError> {
        if !matches!(health, "ready" | "cooldown" | "authentication_expired")
            || !(0..=86400).contains(&cooldown_seconds)
        {
            return Err(StoreError::InvalidAccount);
        }
        let mut tx = self.pool.begin().await?;
        let changed=sqlx::query("UPDATE codex_connections SET lease_owner=NULL,cooldown_until=CASE WHEN $5>0 THEN clock_timestamp()+make_interval(secs=>$5) ELSE NULL END WHERE organization_id=$1 AND project_id=$2 AND account_id=$3 AND lease_owner=$4")
            .bind(scope.organization_id).bind(scope.project_id).bind(id).bind(owner).bind(cooldown_seconds).execute(&mut *tx).await?.rows_affected();
        if changed != 1 {
            return Err(StoreError::Conflict);
        }
        sqlx::query(
            "UPDATE account_assignments SET state='released' WHERE account_id=$1 AND state='held'",
        )
        .bind(id)
        .execute(&mut *tx)
        .await?;
        sqlx::query("UPDATE supplier_accounts SET health=$2 WHERE id=$1 AND health<>'disabled'")
            .bind(id)
            .bind(health)
            .execute(&mut *tx)
            .await?;
        tx.commit().await?;
        Ok(())
    }

    pub async fn set_codex_connection_enabled(
        &self,
        scope: TenantScope,
        id: Uuid,
        enabled: bool,
    ) -> Result<(), StoreError> {
        let changed=sqlx::query("UPDATE supplier_accounts a SET health=CASE WHEN $4 THEN 'ready' ELSE 'disabled' END WHERE a.organization_id=$1 AND a.project_id=$2 AND a.id=$3 AND EXISTS(SELECT 1 FROM codex_connections c WHERE c.account_id=a.id)")
            .bind(scope.organization_id).bind(scope.project_id).bind(id).bind(enabled).execute(&self.pool).await?.rows_affected();
        if changed != 1 {
            return Err(StoreError::Conflict);
        }
        Ok(())
    }
}
