//! Shared bounded recording and repeatable read transactions.
use crate::{Store, StoreError};
use sqlx::{Postgres, Transaction};

async fn bound_statement_waits(tx: &mut Transaction<'_, Postgres>) -> Result<(), StoreError> {
    sqlx::query(
        "SELECT set_config('lock_timeout', '250ms', true), \
                set_config('statement_timeout', '2s', true)",
    )
    .execute(&mut **tx)
    .await?;
    Ok(())
}

impl Store {
    /// Keep recording row/statement waits bounded without changing pool-wide
    /// settings. Existing domain validation, locking and commit logic stays in
    /// the caller; an error rolls back its complete recording transaction.
    pub(crate) async fn begin_bounded_recording(
        &self,
    ) -> Result<Transaction<'_, Postgres>, StoreError> {
        let mut tx = self.pool.begin().await?;
        bound_statement_waits(&mut tx).await?;
        Ok(tx)
    }

    /// Keep multi-query financial reads on one read-only snapshot without
    /// allowing a blocked statement to hold a service connection indefinitely.
    /// Set isolation before the configuration query starts the snapshot.
    pub(crate) async fn begin_bounded_financial_snapshot(
        &self,
    ) -> Result<Transaction<'_, Postgres>, StoreError> {
        self.begin_bounded_read_snapshot().await
    }

    /// Read related saved state consistently with bounded statement and lock
    /// waits. Financial callers retain their existing entry point above.
    pub(crate) async fn begin_bounded_read_snapshot(
        &self,
    ) -> Result<Transaction<'_, Postgres>, StoreError> {
        let mut tx = self
            .pool
            .begin_with("BEGIN ISOLATION LEVEL REPEATABLE READ, READ ONLY")
            .await?;
        bound_statement_waits(&mut tx).await?;
        Ok(tx)
    }
}
