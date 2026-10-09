use super::*;
use axum::response::Response;
use niu_storage::{OperatorAuditActor, OperatorRole, OperatorScope};

async fn export(
    state: AppState,
    scope: niu_storage::TenantScope,
    token: &str,
    query: &str,
) -> Response {
    router(state)
        .oneshot(
            Request::get(format!(
                "/admin/v1/organizations/{}/projects/{}/requests/export{query}",
                scope.organization_id, scope.project_id
            ))
            .header("authorization", format!("Bearer {token}"))
            .body(axum::body::Body::empty())
            .unwrap(),
        )
        .await
        .unwrap()
}

async fn bulk(pool: &PgPool, scope: niu_storage::TenantScope, count: i32) {
    sqlx::query("WITH new_operations AS (INSERT INTO operations(id,organization_id,project_id,model_alias) SELECT gen_random_uuid(),$1,$2,'bulk' FROM generate_series(1,$3) RETURNING id) INSERT INTO attempts(id,organization_id,project_id,operation_id,resource_id,offer_revision) SELECT gen_random_uuid(),$1,$2,id,'bulk','fixture' FROM new_operations")
        .bind(scope.organization_id).bind(scope.project_id).bind(count).execute(pool).await.unwrap();
}

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn customer_charge_breakdowns_preserve_currency_and_unsettled_coverage(pool: PgPool) {
    let state = test_state(None, pool.clone());
    let scope = state.store.default_workspace().await.unwrap();
    let key = state
        .store
        .issue_key(scope, "Charge investigation", &["fast".into()], 3600)
        .await
        .unwrap();
    let mut tariff_revision = None;
    for (currency, settled) in [
        (Some("USD"), true),
        (Some("EUR"), true),
        (Some("USD"), false),
        (None, false),
    ] {
        let (_, attempt) = state
            .store
            .prepare_gateway_attempt(scope, "fast", None, "fixture")
            .await
            .unwrap();
        if let Some(currency) = currency {
            tariff_revision = Some(
                state
                    .store
                    .publish_customer_tariff(
                        scope,
                        &niu_storage::ProviderOfferInput {
                            model_alias: "fast".into(),
                            currency: currency.into(),
                            prompt_rate: "1000000".into(),
                            completion_rate: "2000000".into(),
                            expected_revision: tariff_revision,
                        },
                    )
                    .await
                    .unwrap(),
            );
            state
                .store
                .bind_customer_tariff(scope, attempt, "fast")
                .await
                .unwrap();
        }
        sqlx::query("UPDATE attempts SET api_key_id=$2,execution='may_have_executed',dispatched_at=now() WHERE id=$1")
            .bind(attempt).bind(key.id).execute(&pool).await.unwrap();
        if settled {
            state
                .store
                .complete_gateway_batch(vec![niu_storage::GatewayCompletion {
                    token_categories: None,
                    scope,
                    attempt_id: attempt,
                    usage: Some((2, 1)),
                    provider_model: None,
                }])
                .await
                .unwrap();
            state.store.accrue_customer_charge(attempt).await.unwrap();
        }
    }
    let summary = state
        .store
        .gateway_activity_summary(scope, &Default::default())
        .await
        .unwrap();
    for rows in [&summary.charges_by_model, &summary.charges_by_key] {
        assert_eq!(rows.len(), 3);
        for currency in ["USD", "EUR"] {
            let row = rows.iter().find(|row| row["currency"] == currency).unwrap();
            assert_eq!(row["amount_nanos"], "4");
            assert_eq!(row["charged_requests"], 1);
            assert_eq!(row["request_count"], 1);
        }
        let unknown = rows.iter().find(|row| row["currency"].is_null()).unwrap();
        assert!(unknown["amount_nanos"].is_null());
        assert_eq!(unknown["request_count"], 2);
        assert_eq!(unknown["unresolved_requests"], 1);
        assert_eq!(unknown["unpriced_requests"], 1);
        assert_eq!(unknown["not_charged_requests"], 0);
        assert_eq!(unknown["charged_requests"], 0);
    }
}

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn request_export_is_scoped_exact_filtered_and_never_silently_truncated(pool: PgPool) {
    let state = test_state(None, pool.clone());
    let scope = state.store.default_workspace().await.unwrap();
    let other = state
        .store
        .create_project(scope.organization_id, "Other export workspace")
        .await
        .unwrap();
    let viewer = state
        .store
        .create_operator(
            OperatorScope {
                organization_id: scope.organization_id,
                project_id: Some(scope.project_id),
            },
            "Export reader",
            OperatorRole::Viewer,
            3600,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let key = state
        .store
        .issue_key(scope, "=private-formula-fixture", &["fast".into()], 3600)
        .await
        .unwrap();
    let (_, attempt) = state
        .store
        .prepare_gateway_attempt(scope, "fast", None, "fixture")
        .await
        .unwrap();
    state
        .store
        .publish_customer_tariff(
            scope,
            &niu_storage::ProviderOfferInput {
                model_alias: "fast".into(),
                currency: "USD".into(),
                prompt_rate: "1000000".into(),
                completion_rate: "2000000".into(),
                expected_revision: None,
            },
        )
        .await
        .unwrap();
    state
        .store
        .bind_customer_tariff(scope, attempt, "fast")
        .await
        .unwrap();
    sqlx::query("UPDATE attempts SET api_key_id=$2,execution='may_have_executed',dispatched_at=now() WHERE id=$1")
        .bind(attempt).bind(key.id).execute(&pool).await.unwrap();
    state
        .store
        .complete_gateway_batch(vec![niu_storage::GatewayCompletion {
            token_categories: Some(niu_storage::RequestTokenCategories {
                cached_input_tokens: Some(9_007_199_254_740_991),
                reasoning_output_tokens: Some(0),
            }),
            scope,
            attempt_id: attempt,
            usage: Some((9_007_199_254_740_991, 1)),
            provider_model: None,
        }])
        .await
        .unwrap();
    state.store.accrue_customer_charge(attempt).await.unwrap();
    state
        .store
        .save_request_finish_reasons(
            scope,
            attempt,
            vec![niu_storage::RequestChoiceFinish {
                index: 0,
                reason: niu_storage::RequestFinishReason::Length,
            }],
        )
        .await
        .unwrap();
    sqlx::query("INSERT INTO request_timings(attempt_id,total_ms,complete,http_status) VALUES($1,10,true,502)")
        .bind(attempt).execute(&pool).await.unwrap();
    bulk(&pool, scope, 150).await;
    state
        .store
        .prepare_gateway_attempt(other, "private-other-workspace", None, "fixture")
        .await
        .unwrap();

    let response = export(state.clone(), scope, &viewer.token, "").await;
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(response.headers()["cache-control"], "no-store");
    assert_eq!(
        response.headers()["content-type"],
        "text/csv; charset=utf-8"
    );
    assert_eq!(
        response.headers()["content-disposition"],
        "attachment; filename=\"niu-requests.csv\""
    );
    let text = String::from_utf8(
        response
            .into_body()
            .collect()
            .await
            .unwrap()
            .to_bytes()
            .to_vec(),
    )
    .unwrap();
    assert_eq!(text.lines().count(), 152);
    assert!(
        text.lines()
            .next()
            .unwrap()
            .ends_with("Cached input tokens,Reasoning output tokens,Finish reasons,Failure kind,Upstream HTTP status")
    );
    assert!(
        text.lines()
            .any(|line| line.contains("\"9007199254740991\",\"0\""))
    );
    assert!(text.lines().skip(1).any(|line| line.ends_with("\"\",\"\"")));
    assert!(text.contains("\"9007199254740993\""));
    assert!(text.contains("\"'=private-formula-fixture\""));
    assert!(text.contains("\"unknown\",\"\",\"\",\"not_charged\""));
    for forbidden in [
        attempt.to_string(),
        key.id.to_string(),
        key.token.clone(),
        scope.project_id.to_string(),
        "private-other-workspace".into(),
        "cash_nanos".into(),
        "supplier".into(),
        "offer_revision".into(),
    ] {
        assert!(!text.contains(&forbidden));
    }

    let filtered = export(
        state.clone(),
        scope,
        &viewer.token,
        "?model_alias=fast&status=confirmed_completed",
    )
    .await;
    assert_eq!(filtered.status(), StatusCode::OK);
    let bytes = filtered.into_body().collect().await.unwrap().to_bytes();
    assert_eq!(
        String::from_utf8(bytes.to_vec()).unwrap().lines().count(),
        2
    );
    let all = state
        .store
        .gateway_activity_summary(scope, &Default::default())
        .await
        .unwrap();
    assert_eq!(all.request_count, 151);
    let charged = all
        .charges_by_model
        .iter()
        .find(|row| row["model_alias"] == "fast")
        .unwrap();
    assert_eq!(charged["amount_nanos"], "9007199254740993");
    assert_eq!(charged["currency"], "USD");
    assert_eq!(charged["charged_requests"], 1);
    let unsettled = all
        .charges_by_model
        .iter()
        .find(|row| row["model_alias"] == "bulk")
        .unwrap();
    assert!(unsettled["amount_nanos"].is_null());
    assert!(unsettled["currency"].is_null());
    assert_eq!(unsettled["not_charged_requests"], 150);
    let attributed = all
        .charges_by_key
        .iter()
        .find(|row| row["api_key_id"] == key.id.to_string())
        .unwrap();
    assert_eq!(attributed["amount_nanos"], charged["amount_nanos"]);
    assert_eq!(attributed["key_name"], "=private-formula-fixture");
    for breakdown in [&all.charges_by_model, &all.charges_by_key] {
        assert_eq!(
            breakdown
                .iter()
                .map(|row| row["request_count"].as_i64().unwrap())
                .sum::<i64>(),
            151
        );
        assert!(
            !serde_json::to_string(breakdown)
                .unwrap()
                .contains("private-other-workspace")
        );
    }
    assert_eq!(
        all.delivery_statuses
            .iter()
            .map(|row| row.request_count)
            .sum::<i64>(),
        151
    );
    assert_eq!(
        all.delivery_statuses
            .iter()
            .find(|row| row.http_status == Some(502))
            .unwrap()
            .request_count,
        1
    );
    assert_eq!(
        all.delivery_statuses
            .iter()
            .find(|row| row.http_status.is_none())
            .unwrap()
            .request_count,
        150
    );
    for query in [
        "?http_status=502",
        "?status=delivery_failed",
        "?http_status=502&status=confirmed_completed",
    ] {
        let response = export(state.clone(), scope, &viewer.token, query).await;
        assert_eq!(response.status(), StatusCode::OK);
        let text = String::from_utf8(
            response
                .into_body()
                .collect()
                .await
                .unwrap()
                .to_bytes()
                .to_vec(),
        )
        .unwrap();
        assert_eq!(text.lines().count(), 2);
        assert!(text.contains("\"9007199254740993\""));
        assert!(text.contains("\"confirmed_completed\""));
        assert!(text.contains("\"[{\"\"index\"\":0,\"\"reason\"\":\"\"length\"\"}]\""));
    }
    let known = router(state.clone())
        .oneshot(
            Request::get(format!(
                "/admin/v1/organizations/{}/projects/{}/requests?limit=1&http_status=502",
                scope.organization_id, scope.project_id
            ))
            .header("authorization", format!("Bearer {}", viewer.token))
            .body(axum::body::Body::empty())
            .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(known.status(), StatusCode::OK);
    let known: Value =
        serde_json::from_slice(&known.into_body().collect().await.unwrap().to_bytes()).unwrap();
    assert_eq!(
        known["data"][0]["finish_reasons"],
        json!([{"index":0,"reason":"length"}])
    );
    let response = router(state.clone())
        .oneshot(
            Request::get(format!(
                "/admin/v1/organizations/{}/projects/{}/requests?limit=1&http_status=unknown",
                scope.organization_id, scope.project_id
            ))
            .header("authorization", format!("Bearer {}", viewer.token))
            .body(axum::body::Body::empty())
            .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let value: serde_json::Value =
        serde_json::from_slice(&response.into_body().collect().await.unwrap().to_bytes()).unwrap();
    assert_eq!(value["data"].as_array().unwrap().len(), 1);
    assert_eq!(value["summary"]["request_count"], 150);
    assert_eq!(
        value["summary"]["token_categories"],
        serde_json::json!({
            "cached_input_tokens":null,"cached_input_requests":0,"cached_input_unknown_requests":150,
            "reasoning_output_tokens":null,"reasoning_output_requests":0,"reasoning_output_unknown_requests":150
        })
    );
    assert!(value["data"][0]["cached_input_tokens"].is_null());
    assert!(value["data"][0]["reasoning_output_tokens"].is_null());
    assert!(value["data"][0]["finish_reasons"].is_null());
    assert_eq!(
        value["summary"]["delivery_statuses"],
        serde_json::json!([{"http_status":null,"request_count":150}])
    );
    assert_eq!(
        export(state.clone(), other, &viewer.token, "")
            .await
            .status(),
        StatusCode::NOT_FOUND
    );
    assert_eq!(
        export(state.clone(), scope, &key.token, "").await.status(),
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(
        export(state.clone(), scope, "invalid", "").await.status(),
        StatusCode::UNAUTHORIZED
    );
    for query in [
        "?limit=1",
        "?from_ms=2&to_ms=1",
        "?status=invalid",
        "?model_alias=",
        "?http_status=99",
        "?http_status=600",
        "?http_status=invalid",
    ] {
        assert_eq!(
            export(state.clone(), scope, &viewer.token, query)
                .await
                .status(),
            StatusCode::BAD_REQUEST
        );
    }
    bulk(&pool, scope, 10_001).await;
    assert_eq!(
        export(state.clone(), scope, &viewer.token, "")
            .await
            .status(),
        StatusCode::PAYLOAD_TOO_LARGE
    );
    assert_eq!(
        export(state, scope, &viewer.token, "?model_alias=fast")
            .await
            .status(),
        StatusCode::OK
    );
}

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn request_sorting_covers_the_filtered_range_and_paginates_known_and_unknown_values(
    pool: PgPool,
) {
    let state = test_state(None, pool.clone());
    let scope = state.store.default_workspace().await.unwrap();
    let token = "niu-test-admin-token-that-is-long-1234";
    let mut ids = Vec::new();
    for (index, usage) in [Some((9, 1000)), Some((10, 2)), Some((10, 3)), None, None]
        .into_iter()
        .enumerate()
    {
        let (_, id) = state
            .store
            .prepare_gateway_attempt(scope, "sort-model", None, "fixture")
            .await
            .unwrap();
        sqlx::query("UPDATE attempts SET created_at='2026-01-01'::timestamptz + make_interval(secs=>$2),dispatched_at=now(),execution='may_have_executed' WHERE id=$1")
            .bind(id).bind(index as f64).execute(&pool).await.unwrap();
        state
            .store
            .complete_gateway_batch(vec![niu_storage::GatewayCompletion {
                token_categories: None,
                scope,
                attempt_id: id,
                usage,
                provider_model: None,
            }])
            .await
            .unwrap();
        sqlx::query("INSERT INTO request_timings(attempt_id,total_ms,complete) VALUES($1,$2,$3)")
            .bind(id)
            .bind(if index == 0 {
                100_i64
            } else if index == 3 {
                5000
            } else {
                200
            })
            .bind(index < 3)
            .execute(&pool)
            .await
            .unwrap();
        ids.push(id);
    }
    let expected = [
        ("time_desc", vec![ids[4], ids[3], ids[2], ids[1], ids[0]]),
        ("time_asc", ids.clone()),
        ("input_desc", vec![ids[2], ids[1], ids[0], ids[4], ids[3]]),
        ("output_desc", vec![ids[0], ids[2], ids[1], ids[4], ids[3]]),
        ("latency_desc", vec![ids[2], ids[1], ids[0], ids[4], ids[3]]),
    ];
    for (sort, wanted) in expected {
        let mut actual = Vec::new();
        let mut after = None;
        loop {
            let cursor = after.map(|id| format!("&after={id}")).unwrap_or_default();
            let response=router(state.clone()).oneshot(Request::get(format!("/admin/v1/organizations/{}/projects/{}/requests?limit=2&model_alias=sort-model&sort={sort}{cursor}",scope.organization_id,scope.project_id)).header("authorization",format!("Bearer {token}")).body(axum::body::Body::empty()).unwrap()).await.unwrap();
            assert_eq!(response.status(), StatusCode::OK, "{sort}");
            let value: serde_json::Value =
                serde_json::from_slice(&response.into_body().collect().await.unwrap().to_bytes())
                    .unwrap();
            assert_eq!(value["summary"]["request_count"], 5);
            actual.extend(
                value["data"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .map(|row| Uuid::parse_str(row["attempt_id"].as_str().unwrap()).unwrap()),
            );
            after = value["next_cursor"]
                .as_str()
                .map(|id| Uuid::parse_str(id).unwrap());
            if after.is_none() {
                break;
            }
            assert!(actual.len() <= 5, "cursor did not advance");
        }
        assert_eq!(actual, wanted, "{sort}");
        let response = export(
            state.clone(),
            scope,
            token,
            &format!("?model_alias=sort-model&sort={sort}"),
        )
        .await;
        assert_eq!(response.status(), StatusCode::OK);
        let csv = String::from_utf8(
            response
                .into_body()
                .collect()
                .await
                .unwrap()
                .to_bytes()
                .to_vec(),
        )
        .unwrap();
        let dates: Vec<_> = csv
            .lines()
            .skip(1)
            .map(|line| line.split(',').next().unwrap().to_owned())
            .collect();
        let mut sorted_filter = niu_storage::GatewayActivityFilter {
            model_alias: Some("sort-model".into()),
            ..Default::default()
        };
        sorted_filter.sort = match sort {
            "time_asc" => niu_storage::GatewayActivitySort::Oldest,
            "input_desc" => niu_storage::GatewayActivitySort::InputTokens,
            "output_desc" => niu_storage::GatewayActivitySort::OutputTokens,
            "latency_desc" => niu_storage::GatewayActivitySort::Latency,
            _ => niu_storage::GatewayActivitySort::Newest,
        };
        let entries = state
            .store
            .gateway_activity(scope, None, 100, &sorted_filter)
            .await
            .unwrap();
        assert_eq!(
            dates,
            entries
                .iter()
                .map(|row| format!("\"{}\"", row.created_at))
                .collect::<Vec<_>>()
        );
    }
    let rejected = export(state.clone(), scope, token, "?sort=unsupported").await;
    assert_eq!(rejected.status(), StatusCode::BAD_REQUEST);
    let other = state
        .store
        .create_project(scope.organization_id, "Other sorted workspace")
        .await
        .unwrap();
    let (_, foreign) = state
        .store
        .prepare_gateway_attempt(other, "sort-model", None, "fixture")
        .await
        .unwrap();
    let filter = niu_storage::GatewayActivityFilter {
        sort: niu_storage::GatewayActivitySort::InputTokens,
        ..Default::default()
    };
    assert!(
        state
            .store
            .gateway_activity(scope, Some(foreign), 100, &filter)
            .await
            .unwrap()
            .is_empty()
    );
}
