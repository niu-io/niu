use niu_storage::{
    MIGRATOR, RequestFailure, RequestFailureKind, Store, VendorInput, VendorModelInput,
};
use sqlx::PgPool;

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn account_restriction_is_durable_without_claiming_nonexecution(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let scope = store.default_workspace().await.unwrap();
    let operation = store
        .create_operation(scope, "restricted-model")
        .await
        .unwrap();
    let attempt = store
        .prepare_attempt(scope, operation, "restricted-model", "fixture")
        .await
        .unwrap();
    let vendor = store
        .create_vendor(VendorInput {
            id: uuid::Uuid::new_v4(),
            name: "Incident fixture".into(),
            adapter: "openai".into(),
            api_base: "https://example.test/v1".into(),
            enabled: true,
            credential_ciphertext: vec![1; 48],
        })
        .await
        .unwrap();
    let model = store
        .upsert_vendor_model(
            vendor.id,
            VendorModelInput {
                alias: "restricted-model".into(),
                upstream_model: "restricted-model".into(),
                public_catalog: false,
                enabled: true,
                capabilities: serde_json::json!({}),
                pricing: None,
                expected_revision: None,
            },
        )
        .await
        .unwrap();
    sqlx::query("INSERT INTO managed_attempt_routes(attempt_id,vendor_id,model_alias,vendor_revision,model_revision) VALUES($1,$2,$3,$4,$5)")
        .bind(attempt).bind(vendor.id).bind(&model.alias).bind(vendor.revision).bind(model.revision)
        .execute(&pool).await.unwrap();
    // Model a dispatched attempt without performing any upstream transport.
    sqlx::query("UPDATE attempts SET dispatch_provider='openai',execution='may_have_executed',dispatched_at=clock_timestamp() WHERE id=$1")
        .bind(attempt).execute(&pool).await.unwrap();
    let failure = RequestFailure {
        kind: RequestFailureKind::UpstreamAccountRestricted,
        upstream_http_status: Some(403),
        transport_phase: None,
    };
    store
        .save_request_failure(scope, attempt, failure)
        .await
        .unwrap();
    store
        .save_request_failure(scope, attempt, failure)
        .await
        .unwrap();
    let saved: (String, String) = sqlx::query_as("SELECT f.kind,a.execution FROM request_failures f JOIN attempts a ON a.id=f.attempt_id WHERE a.id=$1")
        .bind(attempt).fetch_one(&pool).await.unwrap();
    assert_eq!(
        saved,
        (
            "upstream_account_restricted".into(),
            "may_have_executed".into()
        )
    );
    let observations: i64 =
        sqlx::query_scalar("SELECT observations FROM connection_incidents WHERE vendor_id=$1")
            .bind(vendor.id)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(
        observations, 1,
        "identical replay must not create another incident observation"
    );
    assert!(
        store
            .save_request_failure(
                scope,
                attempt,
                RequestFailure {
                    kind: RequestFailureKind::UpstreamHttpError,
                    ..failure
                }
            )
            .await
            .is_err()
    );
    assert!(
        store
            .save_request_failure(
                scope,
                attempt,
                RequestFailure {
                    upstream_http_status: None,
                    ..failure
                }
            )
            .await
            .is_err()
    );
    let recovered_operation = store
        .create_operation(scope, "restricted-model")
        .await
        .unwrap();
    let recovered = store
        .prepare_attempt(scope, recovered_operation, "restricted-model", "fixture")
        .await
        .unwrap();
    sqlx::query("INSERT INTO managed_attempt_routes(attempt_id,vendor_id,model_alias,vendor_revision,model_revision) VALUES($1,$2,$3,$4,$5)")
        .bind(recovered).bind(vendor.id).bind(&model.alias).bind(vendor.revision).bind(model.revision)
        .execute(&pool).await.unwrap();
    sqlx::query("UPDATE attempts SET dispatch_provider='openai',execution='may_have_executed',dispatched_at=clock_timestamp() WHERE id=$1")
        .bind(recovered).execute(&pool).await.unwrap();
    sqlx::query("INSERT INTO request_timings(attempt_id,total_ms,complete,http_status) VALUES($1,1,true,200)")
        .bind(recovered).execute(&pool).await.unwrap();
    let active: bool = sqlx::query_scalar(
        "SELECT resolved_at IS NULL FROM connection_incidents WHERE vendor_id=$1",
    )
    .bind(vendor.id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert!(active, "HTTP timing alone cannot confirm recovery");
    sqlx::query("UPDATE attempts SET execution='confirmed_completed',completed_at=clock_timestamp() WHERE id=$1")
        .bind(recovered).execute(&pool).await.unwrap();
    let recovery: Option<uuid::Uuid> = sqlx::query_scalar(
        "SELECT recovery_attempt_id FROM connection_incidents WHERE vendor_id=$1",
    )
    .bind(vendor.id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(recovery, Some(recovered));
}
