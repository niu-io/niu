//! Bounded transactions for financial ledger, invoice and Supplier recording.
use crate::{Store, StoreError};
use sqlx::{Postgres, Transaction};

impl Store {
    /// Keep financial row/statement waits bounded without changing pool-wide
    /// settings. Existing domain validation, locking and commit logic stays in
    /// the caller; an error rolls back its complete recording transaction.
    pub(crate) async fn begin_financial_recording(
        &self,
    ) -> Result<Transaction<'_, Postgres>, StoreError> {
        let mut tx = self.pool.begin().await?;
        sqlx::query(
            "SELECT set_config('lock_timeout','250ms',true), set_config('statement_timeout','2s',true)",
        )
        .execute(&mut *tx)
        .await?;
        Ok(tx)
    }
}
