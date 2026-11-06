//! Shared bounded recording and repeatable read transactions.
use crate::{Store, StoreError};
use sqlx::{Postgres, Transaction};

impl Store {
    /// Keep recording row/statement waits bounded without changing pool-wide
    /// settings. Existing domain validation, locking and commit logic stays in
    /// the caller; an error rolls back its complete recording transaction.
    /// Bounds travel with `BEGIN` in one simple-query message, so a recording
    /// transaction pays one setup round trip instead of two.
    pub(crate) async fn begin_bounded_recording(
        &self,
    ) -> Result<Transaction<'_, Postgres>, StoreError> {
        Ok(self
            .pool
            .begin_with("BEGIN; SET LOCAL lock_timeout='250ms'; SET LOCAL statement_timeout='2s'")
            .await?)
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
    /// waits. The transaction mode and both local limits travel in the single
    /// simple-query `BEGIN` message, so callers pay one setup round trip rather
    /// than three. One-statement callers should not use this helper at all.
    pub(crate) async fn begin_bounded_read_snapshot(
        &self,
    ) -> Result<Transaction<'_, Postgres>, StoreError> {
        Ok(self
            .pool
            .begin_with(
                "BEGIN ISOLATION LEVEL REPEATABLE READ, READ ONLY; \
                 SET LOCAL lock_timeout='250ms'; \
                 SET LOCAL statement_timeout='2s'",
            )
            .await?)
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
        let settings: (String, String, String) = sqlx::query_as(
            "SELECT current_setting('transaction_isolation'), \
                    current_setting('statement_timeout'), \
                    current_setting('lock_timeout')",
        )
        .fetch_one(&mut *snapshot)
        .await
        .unwrap();
        assert_eq!(settings.0, "repeatable read");
        assert_eq!(settings.1, "2s");
        assert_eq!(settings.2, "250ms");
        snapshot.rollback().await.unwrap();
    }
}
