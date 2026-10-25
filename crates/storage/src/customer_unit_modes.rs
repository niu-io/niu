//! Explicit preview-confirmed mode publication. No balances or prices convert.
use crate::{OperatorAuditActor, Store, StoreError};
use serde_json::Value;
use sqlx::{Postgres, Transaction};
use uuid::Uuid;

const PREVIEW: &str =
    "SELECT jsonb_build_object('id',id,'expected_revision',expected_revision::text,
    'source_mode',source_mode,'target_mode',target_mode,'snapshot',snapshot,
    'created_at',to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"'),
    'expires_at',to_char(expires_at AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"'))
    FROM customer_unit_mode_previews WHERE id=$1";
const CHANGE: &str =
    "SELECT jsonb_build_object('revision',revision::text,'previous_mode',source_mode,
    'billing_mode',target_mode,'preview_id',preview_id,
    'created_at',to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"'))
    FROM customer_unit_mode_changes WHERE idempotency_key=$1";

async fn authorize(
    tx: &mut Transaction<'_, Postgres>,
    actor: OperatorAuditActor,
) -> Result<(), StoreError> {
    if let OperatorAuditActor::Operator(id) = actor {
        sqlx::query("SELECT id FROM admin_operators WHERE id=$1 AND platform_admin AND revoked_at IS NULL FOR SHARE")
            .bind(id).fetch_optional(&mut **tx).await?.ok_or(StoreError::Unauthorized)?;
    }
    Ok(())
}

fn publication_error(error: sqlx::Error) -> StoreError {
    if error
        .as_database_error()
        .and_then(|e| e.code())
        .is_some_and(|code| matches!(code.as_ref(), "55P03" | "40P01" | "40001"))
    {
        StoreError::Conflict
    } else {
        StoreError::Database(error)
    }
}

impl Store {
    pub async fn prepare_customer_unit_mode(
        &self,
        target: &str,
        expected: i64,
        key: Uuid,
        actor: OperatorAuditActor,
    ) -> Result<Value, StoreError> {
        if !matches!(target, "currency" | "credits") || expected < 0 {
            return Err(StoreError::InvalidCustomerUnit);
        }
        let mut tx = self.begin_bounded_recording().await?;
        // Serialize identical preparations with configuration changes, without
        // holding locks while a human reviews the saved snapshot.
        let (revision, source): (i64,String) = sqlx::query_as("SELECT revision,billing_mode FROM customer_unit_configuration WHERE singleton FOR UPDATE")
            .fetch_one(&mut *tx).await?;
        authorize(&mut tx, actor).await?;
        let prior: Option<(Uuid,i64,String)> = sqlx::query_as("SELECT id,expected_revision,target_mode FROM customer_unit_mode_previews WHERE idempotency_key=$1")
            .bind(key).fetch_optional(&mut *tx).await?;
        if let Some((id, old_expected, old_target)) = prior {
            if expected != old_expected || target != old_target {
                return Err(StoreError::Conflict);
            }
            return Ok(sqlx::query_scalar(PREVIEW)
                .bind(id)
                .fetch_one(&mut *tx)
                .await?);
        }
        if revision != expected {
            return Err(StoreError::Conflict);
        }
        let snapshot: Value = sqlx::query_scalar(include_str!("customer_unit_mode_preview.sql"))
            .bind(target)
            .fetch_one(&mut *tx)
            .await?;
        let id = Uuid::new_v4();
        let (kind, operator) = actor.kind_and_id();
        sqlx::query("INSERT INTO customer_unit_mode_previews(id,expected_revision,source_mode,target_mode,snapshot,idempotency_key,actor_kind,actor_operator_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)")
            .bind(id).bind(expected).bind(source).bind(target).bind(snapshot).bind(key).bind(kind).bind(operator)
            .execute(&mut *tx).await?;
        let result = sqlx::query_scalar(PREVIEW)
            .bind(id)
            .fetch_one(&mut *tx)
            .await?;
        tx.commit().await?;
        Ok(result)
    }

    pub async fn read_customer_unit_mode_preview(
        &self,
        id: Uuid,
    ) -> Result<Option<Value>, StoreError> {
        Ok(sqlx::query_scalar(PREVIEW)
            .bind(id)
            .fetch_optional(&self.pool)
            .await?)
    }

    pub async fn publish_customer_unit_mode(
        &self,
        preview: Uuid,
        expected: i64,
        key: Uuid,
        actor: OperatorAuditActor,
    ) -> Result<Value, StoreError> {
        if expected < 0 {
            return Err(StoreError::InvalidCustomerUnit);
        }
        let mut tx = self.begin_bounded_recording().await?;
        authorize(&mut tx, actor).await?;
        let prior:Option<(Uuid,i64)>=sqlx::query_as("SELECT preview_id,expected_revision FROM customer_unit_mode_changes WHERE idempotency_key=$1")
            .bind(key).fetch_optional(&mut *tx).await?;
        if let Some((old_preview, old_expected)) = prior {
            if old_preview != preview || old_expected != expected {
                return Err(StoreError::Conflict);
            }
            return Ok(sqlx::query_scalar(CHANGE)
                .bind(key)
                .fetch_one(&mut *tx)
                .await?);
        }
        // Acquire table locks before the configuration row. Both are NOWAIT:
        // active financial work wins instead of waiting in an inverted order.
        sqlx::query("SELECT niu_lock_customer_unit_mode_change()")
            .execute(&mut *tx)
            .await
            .map_err(publication_error)?;
        let (revision,source):(i64,String)=sqlx::query_as("SELECT revision,billing_mode FROM customer_unit_configuration WHERE singleton FOR UPDATE NOWAIT")
            .fetch_one(&mut *tx).await.map_err(publication_error)?;
        // Another publication may have completed between the first replay read
        // and lock acquisition. Recheck before considering the expected version.
        let prior:Option<(Uuid,i64)>=sqlx::query_as("SELECT preview_id,expected_revision FROM customer_unit_mode_changes WHERE idempotency_key=$1")
            .bind(key).fetch_optional(&mut *tx).await?;
        if let Some((old_preview, old_expected)) = prior {
            if old_preview != preview || old_expected != expected {
                return Err(StoreError::Conflict);
            }
            return Ok(sqlx::query_scalar(CHANGE)
                .bind(key)
                .fetch_one(&mut *tx)
                .await?);
        }
        if revision != expected {
            return Err(StoreError::Conflict);
        }
        let target:Option<String>=sqlx::query_scalar("SELECT target_mode FROM customer_unit_mode_previews WHERE id=$1 AND expected_revision=$2 AND source_mode=$3 AND target_mode<>source_mode AND expires_at>clock_timestamp() AND snapshot->>'blockers_empty'='true' AND snapshot->>'change_required'='true'")
            .bind(preview).bind(expected).bind(&source).fetch_optional(&mut *tx).await?;
        let target = target.ok_or(StoreError::Conflict)?;
        let current: Value = sqlx::query_scalar(include_str!("customer_unit_mode_preview.sql"))
            .bind(&target)
            .fetch_one(&mut *tx)
            .await?;
        if current["blockers_empty"] != true {
            return Err(StoreError::Conflict);
        }
        let next = expected.checked_add(1).ok_or(StoreError::Conflict)?;
        let (kind, operator) = actor.kind_and_id();
        sqlx::query("INSERT INTO customer_unit_mode_changes(revision,expected_revision,preview_id,source_mode,target_mode,idempotency_key,actor_kind,actor_operator_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)")
            .bind(next).bind(expected).bind(preview).bind(source).bind(&target).bind(key).bind(kind).bind(operator)
            .execute(&mut *tx).await?;
        sqlx::query(
            "UPDATE customer_unit_configuration SET revision=$1,billing_mode=$2 WHERE singleton",
        )
        .bind(next)
        .bind(target)
        .execute(&mut *tx)
        .await?;
        let result = sqlx::query_scalar(CHANGE)
            .bind(key)
            .fetch_one(&mut *tx)
            .await?;
        tx.commit().await?;
        Ok(result)
    }
}
