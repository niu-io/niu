//!Squashed initial schema baseline with lossless legacy migration compatibility.
//!
//! Fresh databases execute `0001_initial_schema.sql` as a single baseline
//! migration. Existing databases that still hold pre-squash `_sqlx_migrations`
//! receipts (versions `1..=383`, including the original development receipt for
//! version `174`) have every applied receipt verified byte-for-byte, execute any
//! remaining legacy steps up to `383`, and atomically collapse `1..=383` into
//! the squashed `version = 1` baseline receipt before running post-baseline
//! migrations (`0002+`).

use crate::{MIGRATOR, StoreError};
use sqlx::{
    Connection, PgConnection, PgPool,
    migrate::{Migration, MigrationType, Migrator},
};
use std::{borrow::Cow, sync::LazyLock, time::Duration};

const INITIAL_SCHEMA: &str = include_str!("../migrations/0001_initial_schema.sql");
const ORIGINAL_174: &str = include_str!("../compatibility/0174_original.sql");
const MARKER_PREFIX: &str = "-- @niu-legacy-migration ";
/// Session-level lock held across the compatibility check, legacy migration run
/// and receipt collapse. SQLx's own advisory lock covers only its migration
/// runs, so it cannot serialize the separate collapse transaction.
const COMPATIBILITY_LOCK: i64 = 0x4E49_554D_4947_5200;
const COMPATIBILITY_LOCK_ATTEMPTS: u32 = 600;

static LEGACY_MIGRATIONS: LazyLock<Vec<Migration>> = LazyLock::new(parse_legacy_migrations);

fn try_parse_legacy_migrations() -> Result<Vec<Migration>, ()> {
    let bytes = INITIAL_SCHEMA.as_bytes();
    let prefix = MARKER_PREFIX.as_bytes();
    let mut pos = 0;
    let mut out = Vec::with_capacity(384);
    while pos < bytes.len() {
        if !bytes[pos..].starts_with(prefix) {
            return Err(());
        }
        let meta_start = pos + prefix.len();
        let line_end = bytes[meta_start..]
            .iter()
            .position(|&b| b == b'\n')
            .map(|offset| meta_start + offset)
            .ok_or(())?;
        let meta = &INITIAL_SCHEMA[meta_start..line_end];
        let (filename, len_str) = meta.split_once(' ').ok_or(())?;
        let byte_len: usize = len_str.parse().map_err(|_| ())?;
        let stem = filename.strip_suffix(".sql").ok_or(())?;
        let (version_str, desc_raw) = stem.split_once('_').ok_or(())?;
        let version: i64 = version_str.parse().map_err(|_| ())?;
        if version <= 0 {
            return Err(());
        }
        let description = desc_raw.replace('_', " ");
        let sql_start = line_end + 1;
        let sql_end = sql_start
            .checked_add(byte_len)
            .filter(|end| *end <= bytes.len())
            .ok_or(())?;
        let sql = &INITIAL_SCHEMA[sql_start..sql_end];
        out.push(Migration::new(
            version,
            Cow::Owned(description),
            MigrationType::Simple,
            Cow::Borrowed(sql),
            false,
        ));
        pos = sql_end.checked_add(1).ok_or(())?;
    }
    if out.is_empty() { Err(()) } else { Ok(out) }
}

fn parse_legacy_migrations() -> Vec<Migration> {
    try_parse_legacy_migrations().expect("embedded squashed migration baseline is malformed")
}

/// Validate the embedded squashed baseline before it is used. Startup returns a
/// typed error instead of panicking on malformed embedded SQL.
pub fn validate_legacy_migrations() -> Result<(), StoreError> {
    try_parse_legacy_migrations()
        .map(|_| ())
        .map_err(|_| StoreError::MigrationBaselineInvalid)
}

/// Returns the individual pre-squash migrations (`1..=383`) reconstructed
/// byte-for-byte from `0001_initial_schema.sql`.
pub fn legacy_migrations() -> &'static [Migration] {
    LEGACY_MIGRATIONS.as_slice()
}

/// Returns a [`Migrator`] over the individual pre-squash migrations (`1..=383`).
pub fn legacy_migrator() -> Migrator {
    Migrator {
        migrations: Cow::Borrowed(legacy_migrations()),
        ignore_missing: false,
        locking: true,
        no_tx: false,
    }
}

/// Returns the exact SQL source of a pre-squash migration by version number.
pub fn legacy_migration_sql(version: i64) -> &'static str {
    let migration = legacy_migrations()
        .iter()
        .find(|m| m.version == version)
        .unwrap_or_else(|| panic!("unknown legacy migration version {version}"));
    match &migration.sql {
        Cow::Borrowed(sql) => sql,
        Cow::Owned(_) => {
            unreachable!("legacy migration SQL is always borrowed from INITIAL_SCHEMA")
        }
    }
}

pub async fn run(pool: &PgPool) -> Result<(), StoreError> {
    // A dedicated connection keeps the session lock alive while SQLx uses pool
    // connections for the migration runs. Re-checking inside the lock makes a
    // second Gateway observe the collapsed baseline instead of racing it.
    let mut lock = acquire_compatibility_lock(pool).await?;
    let result = run_locked(pool).await;
    let _ = sqlx::query("SELECT pg_advisory_unlock($1)")
        .bind(COMPATIBILITY_LOCK)
        .execute(&mut lock)
        .await;
    result
}

async fn acquire_compatibility_lock(pool: &PgPool) -> Result<PgConnection, StoreError> {
    let options = pool.connect_options();
    let mut lock = PgConnection::connect_with(options.as_ref()).await?;
    for _ in 0..COMPATIBILITY_LOCK_ATTEMPTS {
        let acquired: bool = sqlx::query_scalar("SELECT pg_try_advisory_lock($1)")
            .bind(COMPATIBILITY_LOCK)
            .fetch_one(&mut lock)
            .await?;
        if acquired {
            return Ok(lock);
        }
        tokio::time::sleep(Duration::from_secs(1)).await;
    }
    Err(StoreError::MigrationLockUnavailable)
}

async fn run_locked(pool: &PgPool) -> Result<(), StoreError> {
    validate_legacy_migrations()?;
    let exists: bool = sqlx::query_scalar("SELECT to_regclass('_sqlx_migrations') IS NOT NULL")
        .fetch_one(pool)
        .await?;
    if exists {
        let v1_checksum: Option<Vec<u8>> = sqlx::query_scalar(
            "SELECT checksum FROM _sqlx_migrations WHERE version = 1 AND success",
        )
        .fetch_optional(pool)
        .await?;
        let legacy = legacy_migrations();
        let baseline = MIGRATOR
            .migrations
            .first()
            .expect("0001_initial_schema.sql migration");
        if let Some(ref current_v1) = v1_checksum
            && current_v1.as_slice() != baseline.checksum.as_ref()
            && let Some(first_legacy) = legacy.first()
            && current_v1.as_slice() == first_legacy.checksum.as_ref()
        {
            let mut migrations = legacy.to_vec();
            let checksum_174: Option<Vec<u8>> = sqlx::query_scalar(
                "SELECT checksum FROM _sqlx_migrations WHERE version = 174 AND success",
            )
            .fetch_optional(pool)
            .await?;
            if let Some(current_174) = migrations.iter_mut().find(|m| m.version == 174) {
                let original_174 = Migration::new(
                    174,
                    current_174.description.clone(),
                    current_174.migration_type,
                    Cow::Borrowed(ORIGINAL_174),
                    current_174.no_tx,
                );
                if checksum_174.as_deref() == Some(original_174.checksum.as_ref()) {
                    *current_174 = original_174;
                }
            }
            // Validate all existing legacy receipts and apply any pending legacy
            // steps up to the squashed baseline boundary before collapsing.
            Migrator {
                migrations: Cow::Owned(migrations),
                ignore_missing: true,
                locking: true,
                no_tx: false,
            }
            .run(pool)
            .await?;

            let legacy_max_version = legacy.last().map(|m| m.version).unwrap_or(1);
            let mut tx = pool.begin().await?;
            let total_exec_time: i64 = sqlx::query_scalar(
                "SELECT COALESCE(SUM(execution_time), 0)::BIGINT FROM _sqlx_migrations WHERE version <= $1",
            )
            .bind(legacy_max_version)
            .fetch_one(&mut *tx)
            .await?;
            sqlx::query("DELETE FROM _sqlx_migrations WHERE version <= $1")
                .bind(legacy_max_version)
                .execute(&mut *tx)
                .await?;
            sqlx::query(
                "INSERT INTO _sqlx_migrations (version, description, installed_on, success, checksum, execution_time) \
                 VALUES ($1, $2, now(), TRUE, $3, $4)",
            )
            .bind(baseline.version)
            .bind(baseline.description.as_ref())
            .bind(baseline.checksum.as_ref())
            .bind(total_exec_time)
            .execute(&mut *tx)
            .await?;
            tx.commit().await?;
        }
    }
    MIGRATOR.run(pool).await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_squashed_legacy_migrations_losslessly() {
        let legacy = legacy_migrations();
        assert_eq!(legacy.len(), 382);
        assert_eq!(legacy.first().unwrap().version, 1);
        assert_eq!(legacy.first().unwrap().description, "tenants and attempts");
        assert_eq!(legacy.last().unwrap().version, 383);
        assert!(legacy.windows(2).all(|w| w[0].version < w[1].version));
        assert!(!legacy_migration_sql(10).is_empty());
        assert!(!legacy_migration_sql(11).is_empty());
        assert!(!legacy_migration_sql(323).is_empty());
        assert!(!MIGRATOR.migrations.is_empty());
        assert_eq!(MIGRATOR.migrations[0].version, 1);
        assert_eq!(MIGRATOR.migrations[0].description, "initial schema");
        assert!(validate_legacy_migrations().is_ok());
    }
}
