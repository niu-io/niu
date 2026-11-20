//! Shared bounded recording and repeatable read transactions.
use crate::{Store, StoreError};
use sqlx::{PgPool, Postgres, Transaction};

/// Begin a top-level pool transaction inside an uncancelled task so dropping the
/// caller future mid-handshake rolls back cleanly instead of returning an open
/// transaction connection to the pool.
pub(crate) async fn begin_tx(pool: &PgPool) -> Result<Transaction<'static, Postgres>, StoreError> {
    begin_tx_with(pool, None).await
}

pub(crate) async fn begin_tx_with(
    pool: &PgPool,
    statement: Option<&'static str>,
) -> Result<Transaction<'static, Postgres>, StoreError> {
    let pool = pool.clone();
    let (sender, receiver) = tokio::sync::oneshot::channel();
    tokio::spawn(async move {
        let result = match statement {
            Some(sql) => pool.begin_with(sql).await,
            None => pool.begin().await,
        };
        match result {
            Ok(tx) => {
                if let Err(Ok(orphaned_tx)) = sender.send(Ok(tx)) {
                    let _ = orphaned_tx.rollback().await;
                }
            }
            Err(error) => {
                let _ = sender.send(Err(error));
            }
        }
    });
    match receiver.await {
        Ok(result) => Ok(result?),
        Err(_) => Err(StoreError::Database(sqlx::Error::WorkerCrashed)),
    }
}

/// Commit a top-level pool transaction inside an uncancelled task so dropping the
/// caller future after `COMMIT` reaches PostgreSQL never triggers a spurious
/// `ROLLBACK` on an idle pooled connection.
pub(crate) async fn commit_tx(tx: Transaction<'static, Postgres>) -> Result<(), StoreError> {
    let (sender, receiver) = tokio::sync::oneshot::channel();
    tokio::spawn(async move {
        let _ = sender.send(tx.commit().await);
    });
    match receiver.await {
        Ok(result) => Ok(result?),
        Err(_) => Err(StoreError::Database(sqlx::Error::WorkerCrashed)),
    }
}

/// Explicitly roll back a top-level pool transaction inside an uncancelled task.
pub(crate) async fn rollback_tx(tx: Transaction<'static, Postgres>) -> Result<(), StoreError> {
    let (sender, receiver) = tokio::sync::oneshot::channel();
    tokio::spawn(async move {
        let _ = sender.send(tx.rollback().await);
    });
    match receiver.await {
        Ok(result) => Ok(result?),
        Err(_) => Err(StoreError::Database(sqlx::Error::WorkerCrashed)),
    }
}

impl Store {
    pub(crate) async fn begin_tx(&self) -> Result<Transaction<'static, Postgres>, StoreError> {
        begin_tx(&self.pool).await
    }

    pub(crate) async fn begin_tx_with(
        &self,
        statement: &'static str,
    ) -> Result<Transaction<'static, Postgres>, StoreError> {
        begin_tx_with(&self.pool, Some(statement)).await
    }

    /// Keep recording row/statement waits bounded without changing pool-wide
    /// settings. Existing domain validation, locking and commit logic stays in
    /// the caller; an error rolls back its complete recording transaction.
    /// Bounds travel with `BEGIN` in one simple-query message, so a recording
    /// transaction pays one setup round trip instead of two.
    pub(crate) async fn begin_bounded_recording(
        &self,
    ) -> Result<Transaction<'static, Postgres>, StoreError> {
        self.begin_tx_with(
            "BEGIN; SET LOCAL lock_timeout='250ms'; SET LOCAL statement_timeout='2s'; SET LOCAL jit=off",
        )
        .await
    }

    /// Keep multi-query financial reads on one read-only snapshot without
    /// allowing a blocked statement to hold a service connection indefinitely.
    /// Set isolation before the configuration query starts the snapshot.
    pub(crate) async fn begin_bounded_financial_snapshot(
        &self,
    ) -> Result<Transaction<'static, Postgres>, StoreError> {
        self.begin_bounded_read_snapshot().await
    }

    /// Read related saved state consistently with bounded statement and lock
    /// waits. The transaction mode and local limits travel in the single
    /// simple-query `BEGIN` message, so callers pay one setup round trip rather
    /// than three. One-statement callers should not use this helper at all.
    pub(crate) async fn begin_bounded_read_snapshot(
        &self,
    ) -> Result<Transaction<'static, Postgres>, StoreError> {
        self.begin_tx_with(
            "BEGIN ISOLATION LEVEL REPEATABLE READ, READ ONLY; \
             SET LOCAL lock_timeout='250ms'; \
             SET LOCAL statement_timeout='2s'; \
             SET LOCAL jit=off",
        )
        .await
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[sqlx::test]
    #[ignore = "requires PostgreSQL"]
    async fn bounded_read_snapshot_applies_isolation_and_limits_in_one_setup(pool: sqlx::PgPool) {
        let store = Store::from_pool(pool);
        let mut snapshot = store.begin_bounded_read_snapshot().await.unwrap();
        let settings: (String, String, String, String) = sqlx::query_as(
            "SELECT current_setting('transaction_isolation'), \
                    current_setting('statement_timeout'), \
                    current_setting('lock_timeout'), \
                    current_setting('jit')",
        )
        .fetch_one(&mut *snapshot)
        .await
        .unwrap();
        assert_eq!(settings.0, "repeatable read");
        assert_eq!(settings.1, "2s");
        assert_eq!(settings.2, "250ms");
        assert_eq!(settings.3, "off");
        rollback_tx(snapshot).await.unwrap();
    }

    #[sqlx::test]
    #[ignore = "requires PostgreSQL"]
    async fn cancelling_begin_commit_or_rollback_never_leaks_open_transaction(pool: sqlx::PgPool) {
        use sqlx::postgres::PgPoolOptions;
        use std::future::Future;
        use std::task::{Context, Waker};

        let single = PgPoolOptions::new()
            .max_connections(1)
            .connect_with(pool.connect_options().as_ref().clone())
            .await
            .unwrap();
        let store = Store::from_pool(single.clone());

        // Poll begin_bounded_read_snapshot once until Pending, then drop immediately.
        // Without cancel-safe spawning, dropping mid-BEGIN leaks an open READ ONLY
        // transaction into the 1-connection pool and breaks subsequent writes.
        for iteration in 0..16 {
            let mut fut = Box::pin(store.begin_bounded_read_snapshot());
            let mut cx = Context::from_waker(Waker::noop());
            match fut.as_mut().poll(&mut cx) {
                std::task::Poll::Pending => drop(fut),
                std::task::Poll::Ready(Ok(tx)) => {
                    let _ = rollback_tx(tx).await;
                }
                std::task::Poll::Ready(Err(err)) => {
                    panic!("unexpected begin error on iteration {iteration}: {err}")
                }
            }

            // Cancellation during commit_tx / rollback_tx also must leave the connection clean.
            let tx = begin_tx_with(&single, Some("BEGIN")).await.unwrap();
            let mut commit_fut = Box::pin(commit_tx(tx));
            if commit_fut.as_mut().poll(&mut cx).is_pending() {
                drop(commit_fut);
            }

            let ro_tx = store.begin_bounded_read_snapshot().await.unwrap();
            let mut rb_fut = Box::pin(rollback_tx(ro_tx));
            if rb_fut.as_mut().poll(&mut cx).is_pending() {
                drop(rb_fut);
            }

            // Immediately run a writable transaction on the same single-connection pool.
            let mut rw = begin_tx_with(&single, Some("BEGIN ISOLATION LEVEL SERIALIZABLE"))
                .await
                .unwrap();
            let ro_mode: String = sqlx::query_scalar("SHOW transaction_read_only")
                .fetch_one(&mut *rw)
                .await
                .unwrap();
            assert_eq!(ro_mode, "off");
            sqlx::query(
                "CREATE TEMP TABLE IF NOT EXISTS _cancel_test_probe (n int) ON COMMIT DROP",
            )
            .execute(&mut *rw)
            .await
            .unwrap();
            commit_tx(rw).await.unwrap();
        }
        single.close().await;
    }
}
