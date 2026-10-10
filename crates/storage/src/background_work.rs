//! Database ownership and deadlines for bounded background transactions.
use crate::{Store, StoreError};
use sqlx::{Acquire, Postgres, Transaction};
use std::{future::Future, pin::Pin, time::Duration};

pub(crate) enum BackgroundWork {
    Financial,
    ContentRetention,
}

impl Store {
    /// Attempt one independently committed domain with a bounded pool wait.
    /// Complete connection return before the caller tries its next domain,
    /// including rollback after an error.
    pub(crate) async fn run_background_work<T, F>(
        &self,
        work: BackgroundWork,
        operation: F,
    ) -> Result<Option<T>, StoreError>
    where
        F: for<'a, 'c> FnOnce(
            &'a mut Transaction<'c, Postgres>,
        )
            -> Pin<Box<dyn Future<Output = Result<T, StoreError>> + Send + 'a>>,
    {
        // A try-only acquisition can miss every tick when independently
        // scheduled workers share a small pool. Join the pool's fair queue,
        // but stop waiting before maintenance builds an unbounded backlog.
        let mut connection =
            match tokio::time::timeout(Duration::from_millis(250), self.pool.acquire()).await {
                Ok(connection) => connection?,
                Err(_) => return Ok(None),
            };
        let result = async {
            let mut tx = connection.begin().await?;
            if !claim_background_work(&mut tx, work).await? {
                tx.rollback().await?;
                return Ok(None);
            }
            let value = operation(&mut tx).await?;
            tx.commit().await?;
            Ok(Some(value))
        }
        .await;
        // SQLx normally spawns the connection's return on drop. With a small
        // pool, a returning connection can otherwise consume the next domain's
        // acquisition allowance. Eager return also flushes a failed domain's
        // rollback. All work remains within the existing shared pool's limit.
        connection.return_to_pool().await;
        result
    }

    /// Statements are internal constants, with their own bounded retention
    /// predicates. A skipped claim is a no-op; a timeout rolls back this domain.
    pub(crate) async fn execute_content_retention(
        &self,
        statement: &'static str,
    ) -> Result<u64, StoreError> {
        self.run_background_work(BackgroundWork::ContentRetention, |tx| {
            Box::pin(async move {
                Ok(sqlx::query(statement)
                    .execute(&mut **tx)
                    .await?
                    .rows_affected())
            })
        })
        .await
        .map(|changed| changed.unwrap_or(0))
    }
}

async fn claim_background_work(
    tx: &mut Transaction<'_, Postgres>,
    work: BackgroundWork,
) -> Result<bool, StoreError> {
    let owner = match work {
        BackgroundWork::Financial => "niu:financial-recovery",
        BackgroundWork::ContentRetention => "niu:content-retention",
    };
    let claimed: bool =
        sqlx::query_scalar("SELECT pg_try_advisory_xact_lock(hashtextextended($1,0))")
            .bind(owner)
            .fetch_one(&mut **tx)
            .await?;
    if !claimed {
        return Ok(false);
    }
    sqlx::query("SET LOCAL lock_timeout = '250ms'")
        .execute(&mut **tx)
        .await?;
    sqlx::query("SET LOCAL statement_timeout = '2s'")
        .execute(&mut **tx)
        .await?;
    Ok(true)
}
