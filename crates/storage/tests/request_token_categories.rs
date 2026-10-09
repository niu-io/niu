use niu_storage::{MIGRATOR, RequestTokenCategories, Store};
use sqlx::PgPool;

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn category_aggregates_remain_exact_beyond_integer_ranges(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let scope = store.default_workspace().await.unwrap();
    let key = store
        .issue_key(scope, "Exact category fixture", &["*".into()], 3600)
        .await
        .unwrap();
    let principal = store.authenticate(&key.token).await.unwrap();
    for _ in 0..2 {
        let operation = store.create_operation(scope, "exact").await.unwrap();
        let attempt = store
            .prepare_attempt(scope, operation, "exact", "exact-fixture")
            .await
            .unwrap();
        store.mark_dispatched(&principal, attempt).await.unwrap();
        store
            .complete_gateway_batch(vec![niu_storage::GatewayCompletion {
                scope,
                attempt_id: attempt,
                usage: Some((i64::MAX as u64, 1)),
                provider_model: None,
                token_categories: Some(RequestTokenCategories {
                    cached_input_tokens: Some(i64::MAX),
                    reasoning_output_tokens: Some(0),
                }),
            }])
            .await
            .unwrap();
    }
    let summary = store
        .gateway_activity_summary(scope, &Default::default())
        .await
        .unwrap();
    assert_eq!(
        summary.token_categories["cached_input_tokens"],
        "18446744073709551614"
    );
    assert_eq!(summary.token_categories["reasoning_output_tokens"], "0");
    assert_eq!(summary.token_categories["cached_input_requests"], 2);
    let rows = store
        .gateway_activity_export(scope, &Default::default())
        .await
        .unwrap();
    assert_eq!(rows.len(), 2);
    assert!(rows.iter().all(|row| row.cached_input_tokens.as_deref()
        == Some("9223372036854775807")
        && row.reasoning_output_tokens.as_deref() == Some("0")));
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn categories_are_scoped_bounded_immutable_and_preserve_unknowns(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let scope = store.default_workspace().await.unwrap();
    let other = store
        .create_project(scope.organization_id, "Other categories workspace")
        .await
        .unwrap();
    let key = store
        .issue_key(scope, "Categories fixture", &["*".into()], 3600)
        .await
        .unwrap();
    let principal = store.authenticate(&key.token).await.unwrap();
    let operation = store.create_operation(scope, "fixture").await.unwrap();
    let attempt = store
        .prepare_attempt(scope, operation, "fixture", "categories-fixture")
        .await
        .unwrap();
    let categories = RequestTokenCategories {
        cached_input_tokens: Some(0),
        reasoning_output_tokens: None,
    };
    assert!(
        store
            .save_request_token_categories(scope, attempt, categories)
            .await
            .is_err()
    );
    store.mark_dispatched(&principal, attempt).await.unwrap();
    store
        .complete_with_provider_model(scope, attempt, Some((10, 5)), Some("fixture"))
        .await
        .unwrap();
    assert!(
        store
            .save_request_token_categories(other, attempt, categories)
            .await
            .is_err()
    );
    for invalid in [
        RequestTokenCategories {
            cached_input_tokens: None,
            reasoning_output_tokens: None,
        },
        RequestTokenCategories {
            cached_input_tokens: Some(-1),
            reasoning_output_tokens: None,
        },
        RequestTokenCategories {
            cached_input_tokens: Some(11),
            reasoning_output_tokens: None,
        },
        RequestTokenCategories {
            cached_input_tokens: None,
            reasoning_output_tokens: Some(6),
        },
    ] {
        assert!(
            store
                .save_request_token_categories(scope, attempt, invalid)
                .await
                .is_err()
        );
    }
    store
        .save_request_token_categories(scope, attempt, categories)
        .await
        .unwrap();
    store
        .save_request_token_categories(scope, attempt, categories)
        .await
        .unwrap();
    assert!(
        store
            .save_request_token_categories(
                scope,
                attempt,
                RequestTokenCategories {
                    cached_input_tokens: Some(1),
                    reasoning_output_tokens: None
                }
            )
            .await
            .is_err()
    );
    let row: (Option<i64>, Option<i64>) = sqlx::query_as("SELECT cached_input_tokens,reasoning_output_tokens FROM request_token_categories WHERE attempt_id=$1").bind(attempt).fetch_one(&pool).await.unwrap();
    assert_eq!(row, (Some(0), None));
    let saved = store.attempt(scope, attempt).await.unwrap().unwrap();
    assert_eq!(
        (saved.prompt_tokens, saved.completion_tokens),
        (Some(10), Some(5))
    );
    let next = store
        .prepare_attempt(scope, operation, "fixture", "atomic-category-fixture")
        .await
        .unwrap();
    store.mark_dispatched(&principal, next).await.unwrap();
    let mut record = niu_storage::GatewayCompletion {
        scope,
        attempt_id: next,
        usage: Some((10, 5)),
        provider_model: Some("fixture".into()),
        token_categories: Some(RequestTokenCategories {
            cached_input_tokens: Some(11),
            reasoning_output_tokens: Some(2),
        }),
    };
    assert!(
        store
            .complete_gateway_batch(vec![record.clone()])
            .await
            .is_err()
    );
    assert_eq!(
        store.attempt(scope, next).await.unwrap().unwrap().execution,
        "may_have_executed"
    );
    record
        .token_categories
        .as_mut()
        .unwrap()
        .cached_input_tokens = Some(4);
    store.complete_gateway_batch(vec![record]).await.unwrap();
    let row: (Option<i64>, Option<i64>) = sqlx::query_as("SELECT cached_input_tokens,reasoning_output_tokens FROM request_token_categories WHERE attempt_id=$1").bind(next).fetch_one(&pool).await.unwrap();
    assert_eq!(row, (Some(4), Some(2)));
    assert_eq!(
        store.attempt(scope, next).await.unwrap().unwrap().execution,
        "confirmed_completed"
    );
    let filters = niu_storage::GatewayActivityFilter::default();
    let summary = store
        .gateway_activity_summary(scope, &filters)
        .await
        .unwrap();
    assert_eq!(
        summary.token_categories,
        serde_json::json!({
            "cached_input_tokens":"4","cached_input_requests":2,"cached_input_unknown_requests":0,
            "reasoning_output_tokens":"2","reasoning_output_requests":1,"reasoning_output_unknown_requests":1
        })
    );
    let page = store
        .gateway_activity(scope, None, 1, &filters)
        .await
        .unwrap();
    assert_eq!(page.len(), 1);
    assert_eq!(page[0].cached_input_tokens.as_deref(), Some("4"));
    assert_eq!(page[0].reasoning_output_tokens.as_deref(), Some("2"));
    for (target, filter) in [
        (other, filters),
        (
            scope,
            niu_storage::GatewayActivityFilter {
                model_alias: Some("absent".into()),
                ..Default::default()
            },
        ),
    ] {
        let empty = store
            .gateway_activity_summary(target, &filter)
            .await
            .unwrap();
        assert_eq!(empty.request_count, 0);
        assert_eq!(
            empty.token_categories["cached_input_tokens"],
            serde_json::Value::Null
        );
        assert_eq!(
            empty.token_categories["reasoning_output_tokens"],
            serde_json::Value::Null
        );
        assert_eq!(empty.token_categories["cached_input_requests"], 0);
    }
}
