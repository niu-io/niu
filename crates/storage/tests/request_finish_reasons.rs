use niu_storage::{MIGRATOR, RequestChoiceFinish, RequestFinishReason, Store};
use sqlx::PgPool;

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn request_finish_reasons_are_durable_scoped_immutable_and_payload_independent(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let scope = store.default_workspace().await.unwrap();
    let other = store
        .create_project(scope.organization_id, "Other finish workspace")
        .await
        .unwrap();
    let other_scope = other;
    let key = store
        .issue_key(scope, "Finish fixture", &["*".into()], 3600)
        .await
        .unwrap();
    let principal = store.authenticate(&key.token).await.unwrap();
    let operation = store.create_operation(scope, "finish").await.unwrap();
    let attempt = store
        .prepare_attempt(scope, operation, "finish", "fixture")
        .await
        .unwrap();
    let observation = vec![RequestChoiceFinish {
        index: 0,
        reason: RequestFinishReason::Length,
    }];
    assert_eq!(
        store.request_finish_reasons(scope, attempt).await.unwrap(),
        None
    );
    assert!(
        store
            .save_request_finish_reasons(scope, attempt, observation.clone())
            .await
            .is_err()
    );
    store.mark_dispatched(&principal, attempt).await.unwrap();
    store
        .complete_with_provider_model(scope, attempt, None, None)
        .await
        .unwrap();
    assert!(
        store
            .save_request_finish_reasons(other_scope, attempt, observation.clone())
            .await
            .is_err()
    );
    store
        .save_request_finish_reasons(scope, attempt, observation.clone())
        .await
        .unwrap();
    store
        .save_request_finish_reasons(scope, attempt, observation.clone())
        .await
        .unwrap();
    assert!(
        store
            .save_request_finish_reasons(
                scope,
                attempt,
                vec![RequestChoiceFinish {
                    index: 0,
                    reason: RequestFinishReason::Stop
                }]
            )
            .await
            .is_err()
    );
    assert!(
        store
            .save_request_finish_reasons(scope, attempt, vec![])
            .await
            .is_err()
    );
    assert!(
        store
            .save_request_finish_reasons(
                scope,
                attempt,
                vec![observation[0].clone(), observation[0].clone()]
            )
            .await
            .is_err()
    );
    let request =
        serde_json::json!({"messages":[{"role":"user","content":"private finish fixture"}]});
    store
        .save_request_payload(
            attempt,
            &request,
            "private response",
            "application/json",
            true,
            false,
        )
        .await
        .unwrap();
    assert!(
        store
            .request_payload(scope, attempt)
            .await
            .unwrap()
            .is_some()
    );
    store.delete_request_payload(scope, attempt).await.unwrap();
    store
        .save_request_payload(
            attempt,
            &request,
            "late private response",
            "application/json",
            true,
            false,
        )
        .await
        .unwrap();
    assert!(
        store
            .request_payload(scope, attempt)
            .await
            .unwrap()
            .is_none()
    );
    let reopened = Store::from_pool(pool.clone());
    assert_eq!(
        reopened
            .request_finish_reasons(scope, attempt)
            .await
            .unwrap(),
        Some(observation)
    );
    assert_eq!(
        reopened
            .request_finish_reasons(other_scope, attempt)
            .await
            .unwrap(),
        None
    );
    let payloads: i64 = sqlx::query_scalar("SELECT count(*) FROM request_payloads")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(payloads, 0);
    let saved = reopened.attempt(scope, attempt).await.unwrap().unwrap();
    assert_eq!(saved.prompt_tokens, None);
    assert_eq!(saved.completion_tokens, None);

    // Expiry is distinct from explicit deletion: the original attempt time
    // must prevent a late payload write from reopening the retention window.
    let expired = store
        .prepare_attempt(scope, operation, "finish", "expiry")
        .await
        .unwrap();
    store.mark_dispatched(&principal, expired).await.unwrap();
    store
        .complete_with_provider_model(scope, expired, None, None)
        .await
        .unwrap();
    let interrupted = vec![RequestChoiceFinish {
        index: 0,
        reason: RequestFinishReason::ContentFilter,
    }];
    store
        .save_request_finish_reasons(scope, expired, interrupted.clone())
        .await
        .unwrap();
    store
        .save_request_payload(
            expired,
            &request,
            "expired private response",
            "application/json",
            true,
            false,
        )
        .await
        .unwrap();
    sqlx::query("UPDATE attempts SET created_at=now()-interval '25 hours' WHERE id=$1")
        .bind(expired)
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query(
        "UPDATE request_payloads SET expires_at=now()-interval '1 hour' WHERE attempt_id=$1",
    )
    .bind(expired)
    .execute(&pool)
    .await
    .unwrap();
    assert!(
        store
            .request_payload(scope, expired)
            .await
            .unwrap()
            .is_none()
    );
    store.purge_expired_request_payloads().await.unwrap();
    store
        .save_request_payload(
            expired,
            &request,
            "late private response",
            "application/json",
            true,
            false,
        )
        .await
        .unwrap();
    let reopened = Store::from_pool(pool.clone());
    assert_eq!(
        reopened
            .request_finish_reasons(scope, expired)
            .await
            .unwrap(),
        Some(interrupted)
    );
    assert_eq!(
        reopened
            .request_finish_reasons(other_scope, expired)
            .await
            .unwrap(),
        None
    );
    let remaining: i64 =
        sqlx::query_scalar("SELECT count(*) FROM request_payloads WHERE attempt_id=$1")
            .bind(expired)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(remaining, 0);
}
