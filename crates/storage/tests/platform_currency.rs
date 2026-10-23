use niu_storage::{MIGRATOR, Store, StoreError};
use sqlx::PgPool;
#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn currency_is_durable_once_and_does_not_relabel_history(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    assert_eq!(store.platform_currency().await.unwrap(), None);
    assert!(matches!(
        store.configure_platform_currency("ABC").await,
        Err(StoreError::InvalidPrice)
    ));
    let legacy = store.create_organization("Legacy postpaid").await.unwrap();
    let old = store
        .create_prepaid_organization("Historical USD", "USD")
        .await
        .unwrap();
    store.configure_platform_currency("CNY").await.unwrap();
    assert!(
        store
            .customer_balance_summary(legacy)
            .await
            .unwrap()
            .is_empty()
    );
    assert!(
        store
            .customer_balance_summary(old)
            .await
            .unwrap()
            .iter()
            .any(|row| row["currency"] == "CNY" && row["balance_nanos"] == "0")
    );
    store.configure_platform_currency("CNY").await.unwrap();
    assert!(matches!(
        store.configure_platform_currency("USD").await,
        Err(StoreError::Conflict)
    ));
    assert_eq!(
        Store::from_pool(pool.clone())
            .platform_currency()
            .await
            .unwrap()
            .as_deref(),
        Some("CNY")
    );
    assert_eq!(
        store
            .customer_balance_summary(old)
            .await
            .unwrap()
            .into_iter()
            .find(|row| row["currency"] == "USD")
            .unwrap()["currency"],
        "USD"
    );
    assert!(
        store
            .create_prepaid_organization("Wrong currency", "USD")
            .await
            .is_err()
    );
    store
        .create_prepaid_organization("Correct currency", "CNY")
        .await
        .unwrap();
    assert!(sqlx::query("UPDATE customer_balance_accounts SET credit_limit_nanos=1 WHERE organization_id=$1 AND currency='USD'").bind(old).execute(&pool).await.is_err());
    let workspace = store.create_workspace(None, "Personal CNY").await.unwrap();
    assert_eq!(
        store
            .customer_balance_summary(workspace.organization_id)
            .await
            .unwrap()[0]["currency"],
        "CNY"
    );
    assert!(
        sqlx::query("UPDATE platform_currency SET currency='USD'")
            .execute(&pool)
            .await
            .is_err()
    );
    assert!(
        sqlx::query("DELETE FROM platform_currency")
            .execute(&pool)
            .await
            .is_err()
    );
}
