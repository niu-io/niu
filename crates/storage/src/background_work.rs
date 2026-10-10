//! Database ownership and deadlines for bounded background transactions.
use crate::{Store, StoreError};
use sqlx::{Postgres, Transaction};

pub(crate) enum BackgroundWork {
    Financial,
    ContentRetention,
}

impl Store {
    pub(crate) async fn begin_background_work(
        &self,
        work: BackgroundWork,
    ) -> Result<Option<Transaction<'static, Postgres>>, StoreError> {
        let Some(mut tx) = self.pool.try_begin().await? else {
            return Ok(None);
        };
        let owner = match work {
            BackgroundWork::Financial => "niu:financial-recovery",
            BackgroundWork::ContentRetention => "niu:content-retention",
        };
        let claimed: bool =
            sqlx::query_scalar("SELECT pg_try_advisory_xact_lock(hashtextextended($1,0))")
                .bind(owner)
                .fetch_one(&mut *tx)
                .await?;
        if !claimed {
            tx.rollback().await?;
            return Ok(None);
        }
        sqlx::query("SET LOCAL lock_timeout = '250ms'")
            .execute(&mut *tx)
            .await?;
        sqlx::query("SET LOCAL statement_timeout = '2s'")
            .execute(&mut *tx)
            .await?;
        Ok(Some(tx))
    }

    /// Statements are internal constants, with their own bounded retention
    /// predicates. A skipped claim is a no-op; a timeout rolls back this domain.
    pub(crate) async fn execute_content_retention(
        &self,
        statement: &'static str,
    ) -> Result<u64, StoreError> {
        let Some(mut tx) = self
            .begin_background_work(BackgroundWork::ContentRetention)
            .await?
        else {
            return Ok(0);
        };
        let changed = sqlx::query(statement)
            .execute(&mut *tx)
            .await?
            .rows_affected();
        tx.commit().await?;
        Ok(changed)
    }
}
