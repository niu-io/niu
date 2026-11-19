use crate::{Store, StoreError};
use serde_json::{Value, json};
use uuid::Uuid;

impl Store {
    pub async fn platform_bank_details(&self) -> Result<Value, StoreError> {
        Ok(sqlx::query_scalar(
            "SELECT jsonb_build_object('revision',revision::text,'details',details)
            FROM platform_bank_details WHERE singleton",
        )
        .fetch_optional(&self.pool)
        .await?
        .unwrap_or_else(|| json!({"revision":"0","details":null})))
    }

    pub async fn save_bank_details(
        &self,
        expected: i64,
        details: Option<Value>,
    ) -> Result<Value, StoreError> {
        let mut tx = self.begin_bounded_recording().await?;
        sqlx::query("LOCK TABLE platform_bank_details IN SHARE ROW EXCLUSIVE MODE")
            .execute(&mut *tx)
            .await?;
        let prior: i64 =
            sqlx::query_scalar("SELECT COALESCE(max(revision),0) FROM platform_bank_details")
                .fetch_one(&mut *tx)
                .await?;
        if prior != expected {
            return Err(StoreError::Conflict);
        }
        let saved = sqlx::query_scalar("INSERT INTO platform_bank_details(singleton,revision,details)
            VALUES(true,1,$1) ON CONFLICT(singleton) DO UPDATE SET revision=platform_bank_details.revision+1,
            details=excluded.details RETURNING jsonb_build_object('revision',revision::text,'details',details)")
            .bind(details).fetch_one(&mut *tx).await?;
        crate::commit_tx(tx).await?;
        Ok(saved)
    }

    pub async fn customer_bank_details(
        &self,
        organization: Uuid,
    ) -> Result<Option<Value>, StoreError> {
        Ok(sqlx::query_scalar(
            "SELECT d.details || jsonb_build_object('memo',o.bank_memo)
            FROM platform_bank_details d CROSS JOIN organizations o
            WHERE d.singleton AND d.details IS NOT NULL AND o.id=$1",
        )
        .bind(organization)
        .fetch_optional(&self.pool)
        .await?)
    }
}
