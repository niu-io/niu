//! Preserve the exact first development receipt without rewriting migration history.
use crate::{MIGRATOR, StoreError};
use sqlx::{
    PgPool,
    migrate::{Migration, Migrator},
};
use std::borrow::Cow;

const ORIGINAL_174: &str = include_str!("../compatibility/0174_original.sql");

pub(crate) async fn run(pool: &PgPool) -> Result<(), StoreError> {
    let exists: bool = sqlx::query_scalar("SELECT to_regclass('_sqlx_migrations') IS NOT NULL")
        .fetch_one(pool)
        .await?;
    if exists {
        let checksum: Option<Vec<u8>> = sqlx::query_scalar(
            "SELECT checksum FROM _sqlx_migrations WHERE version=174 AND success",
        )
        .fetch_optional(pool)
        .await?;
        let current = MIGRATOR
            .iter()
            .find(|m| m.version == 174)
            .expect("migration 174");
        let original = Migration::new(
            174,
            current.description.clone(),
            current.migration_type,
            Cow::Borrowed(ORIGINAL_174),
            current.no_tx,
        );
        if checksum.as_deref() == Some(original.checksum.as_ref()) {
            let mut migrations = MIGRATOR.migrations.to_vec();
            *migrations
                .iter_mut()
                .find(|m| m.version == 174)
                .expect("migration 174") = original;
            // SQLx retains its advisory lock, dirty checks and validation of
            // every receipt. Only the exact original SQL is recognized.
            Migrator {
                migrations: Cow::Owned(migrations),
                ignore_missing: false,
                locking: true,
                no_tx: false,
            }
            .run(pool)
            .await?;
            return Ok(());
        }
    }
    MIGRATOR.run(pool).await?;
    Ok(())
}
