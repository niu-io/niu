use niu_storage::{MIGRATOR, Store};
use sqlx::{
    ConnectOptions, PgPool,
    migrate::{Migration, Migrator},
};
use std::borrow::Cow;

#[sqlx::test(migrations = false)]
#[ignore = "requires PostgreSQL"]
async fn original_174_receipt_upgrades_without_rewriting_history(pool: PgPool) {
    let mut migrations: Vec<_> = MIGRATOR
        .iter()
        .filter(|m| m.version <= 174)
        .cloned()
        .collect();
    let current = migrations.iter_mut().find(|m| m.version == 174).unwrap();
    *current = Migration::new(
        174,
        current.description.clone(),
        current.migration_type,
        Cow::Borrowed(include_str!("../compatibility/0174_original.sql")),
        current.no_tx,
    );
    Migrator {
        migrations: Cow::Owned(migrations),
        ignore_missing: false,
        locking: true,
        no_tx: false,
    }
    .run(&pool)
    .await
    .unwrap();
    let receipts: Vec<(i64, Vec<u8>)> =
        sqlx::query_as("SELECT version,checksum FROM _sqlx_migrations ORDER BY version")
            .fetch_all(&pool)
            .await
            .unwrap();
    let organization = Store::from_pool(pool.clone())
        .create_organization("Preserved organization")
        .await
        .unwrap();
    let url = pool.connect_options().to_url_lossy().to_string();
    let upgraded = Store::connect(&url).await.unwrap();
    assert_eq!(upgraded.organizations().await.unwrap()[0].id, organization);
    let after: Vec<(i64, Vec<u8>)> = sqlx::query_as(
        "SELECT version,checksum FROM _sqlx_migrations WHERE version<=174 ORDER BY version",
    )
    .fetch_all(&pool)
    .await
    .unwrap();
    assert_eq!(receipts, after);
    let present: bool =
        sqlx::query_scalar("SELECT to_regclass('asset_group_read_result_deletions') IS NOT NULL")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert!(present);
    Store::connect(&url).await.unwrap();
    // An unknown checksum must still fail closed, with its receipt untouched.
    sqlx::query(
        "UPDATE _sqlx_migrations SET checksum=decode(repeat('00',48),'hex') WHERE version=174",
    )
    .execute(&pool)
    .await
    .unwrap();
    assert!(Store::connect(&url).await.is_err());
}

#[sqlx::test(migrations = "./migrations")]
#[ignore = "requires PostgreSQL"]
async fn current_174_receipt_remains_unchanged(pool: PgPool) {
    let before: Vec<(i64, Vec<u8>)> =
        sqlx::query_as("SELECT version,checksum FROM _sqlx_migrations ORDER BY version")
            .fetch_all(&pool)
            .await
            .unwrap();
    Store::connect(pool.connect_options().to_url_lossy().as_str())
        .await
        .unwrap();
    let after: Vec<(i64, Vec<u8>)> =
        sqlx::query_as("SELECT version,checksum FROM _sqlx_migrations ORDER BY version")
            .fetch_all(&pool)
            .await
            .unwrap();
    assert_eq!(before, after);
}
