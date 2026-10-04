use super::*;
use axum::http::Method;
use niu_storage::{OperatorAuditActor, OperatorRole, OperatorScope};
const ADMIN: &str = "niu-test-admin-token-that-is-long-1234";
async fn call(
    app: &Router,
    method: Method,
    path: &str,
    token: &str,
    body: Option<Value>,
) -> (StatusCode, Value) {
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method(method)
                .uri(path)
                .header("authorization", format!("Bearer {token}"))
                .header("content-type", "application/json")
                .body(axum::body::Body::from(
                    body.map(|v| v.to_string()).unwrap_or_default(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.headers()["cache-control"], "no-store");
    let status = response.status();
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    (status, serde_json::from_slice(&bytes).unwrap())
}
#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn provider_business_requires_explicit_membership_and_denies_cross_supplier_access(
    pool: PgPool,
) {
    let state = test_state(None, pool.clone());
    let store = state.store.clone();
    let scope = store.default_workspace().await.unwrap();
    let owner = store
        .create_operator(
            OperatorScope {
                organization_id: scope.organization_id,
                project_id: None,
            },
            "customer owner",
            OperatorRole::Owner,
            3600,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let supplier = store.create_provider_business("Supplier").await.unwrap();
    let foreign = store.create_provider_business("Foreign").await.unwrap();
    let app = router(state);
    let path = format!("/admin/v1/providers/{supplier}/dashboard");
    assert_eq!(
        call(&app, Method::GET, &path, &owner.token, None).await.0,
        StatusCode::NOT_FOUND
    );
    assert_eq!(
        call(&app, Method::GET, &path, ADMIN, None).await.0,
        StatusCode::FORBIDDEN
    );
    assert!(
        call(&app, Method::GET, "/admin/v1/session", &owner.token, None)
            .await
            .1["data"]["provider_memberships"]
            .as_array()
            .unwrap()
            .is_empty()
    );
    assert_eq!(
        call(
            &app,
            Method::POST,
            "/admin/v1/providers",
            &owner.token,
            Some(json!({"name":"self-granted"}))
        )
        .await
        .0,
        StatusCode::FORBIDDEN
    );
    let member_path = format!(
        "/admin/v1/providers/{supplier}/members/{}",
        owner.operator_id
    );
    assert_eq!(
        call(
            &app,
            Method::PUT,
            &member_path,
            &owner.token,
            Some(json!({"role":"manager","active":true}))
        )
        .await
        .0,
        StatusCode::FORBIDDEN
    );
    assert_eq!(
        call(
            &app,
            Method::PUT,
            &member_path,
            ADMIN,
            Some(json!({"role":"viewer","active":true}))
        )
        .await
        .0,
        StatusCode::OK
    );
    let (_, session) = call(&app, Method::GET, "/admin/v1/session", &owner.token, None).await;
    assert_eq!(
        session["data"]["provider_memberships"][0]["id"],
        supplier.to_string()
    );
    assert_eq!(
        call(&app, Method::GET, &path, &owner.token, None).await.0,
        StatusCode::OK
    );
    assert_eq!(
        call(
            &app,
            Method::GET,
            &format!("/admin/v1/providers/{foreign}/dashboard"),
            &owner.token,
            None
        )
        .await
        .0,
        StatusCode::NOT_FOUND
    );
    assert_eq!(
        call(
            &app,
            Method::GET,
            &format!("{path}?days=10000"),
            &owner.token,
            None
        )
        .await
        .0,
        StatusCode::BAD_REQUEST
    );
    assert_eq!(
        call(
            &app,
            Method::PATCH,
            &format!("/admin/v1/providers/{supplier}/offers/{}", Uuid::new_v4()),
            &owner.token,
            Some(json!({"active":false}))
        )
        .await
        .0,
        StatusCode::NOT_FOUND
    );
    assert_eq!(call(&app,Method::POST,&format!("/admin/v1/providers/{supplier}/settlements"),&owner.token,Some(json!({"idempotency_key":Uuid::new_v4(),"payment_reference":"fake","attempt_ids":[Uuid::new_v4()]}))).await.0,StatusCode::FORBIDDEN);
    store
        .set_provider_member(supplier, owner.operator_id, "viewer", false)
        .await
        .unwrap();
    assert_eq!(
        call(&app, Method::GET, &path, &owner.token, None).await.0,
        StatusCode::NOT_FOUND
    );
}

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn customer_billing_is_project_scoped_and_financial_writes_are_installation_only(
    pool: PgPool,
) {
    let state = test_state(None, pool);
    let store = state.store.clone();
    let scope = store.default_workspace().await.unwrap();
    let owner = store
        .create_operator(
            OperatorScope {
                organization_id: scope.organization_id,
                project_id: Some(scope.project_id),
            },
            "customer",
            OperatorRole::Owner,
            3600,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let app = router(state);
    let base = format!(
        "/admin/v1/organizations/{}/projects/{}/billing",
        scope.organization_id, scope.project_id
    );
    assert_eq!(
        call(&app, Method::GET, &base, &owner.token, None).await.0,
        StatusCode::OK
    );
    let foreign = format!(
        "/admin/v1/organizations/{}/projects/{}/billing",
        scope.organization_id,
        Uuid::new_v4()
    );
    assert_eq!(
        call(&app, Method::GET, &foreign, &owner.token, None)
            .await
            .0,
        StatusCode::NOT_FOUND
    );
    assert_eq!(call(&app,Method::POST,&format!("{base}/tariffs"),&owner.token,Some(json!({"model_alias":"text","currency":"USD","prompt_rate":"1","completion_rate":"1","expected_revision":null}))).await.0,StatusCode::FORBIDDEN);
    assert_eq!(
        call(
            &app,
            Method::POST,
            &format!("{base}/invoices"),
            &owner.token,
            Some(json!({"from_ms":0,"to_ms":1,"currency":"USD","idempotency_key":Uuid::new_v4()}))
        )
        .await
        .0,
        StatusCode::FORBIDDEN
    );
    assert_eq!(
        call(
            &app,
            Method::POST,
            &format!("{base}/invoices/{}/payment", Uuid::new_v4()),
            &owner.token,
            Some(json!({"payment_reference":"fake"}))
        )
        .await
        .0,
        StatusCode::FORBIDDEN
    );
    assert_eq!(
        call(&app, Method::GET, &base, "invalid", None).await.0,
        StatusCode::UNAUTHORIZED
    );
}

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn inference_accrues_customer_and_provider_ledgers_at_independent_rates(pool: PgPool) {
    let upstream = Router::new()
        .route("/v1/chat/completions", post(provider))
        .with_state(Captured::default());
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let server = tokio::spawn(async move { axum::serve(listener, upstream).await.unwrap() });
    let mut state = test_state(None, pool.clone());
    state.vendor_cipher = Some(Arc::new(
        crate::vendors::crypto::CredentialCipher::new(
            "billing-test-master-secret-at-least-32-characters",
        )
        .unwrap(),
    ));
    let store = state.store.clone();
    let scope = store.default_workspace().await.unwrap();
    let app = router(state.clone());
    let (status,vendor)=call(&app,Method::POST,"/admin/v1/vendors",ADMIN,Some(json!({"name":"Billing fixture","adapter":"openai","api_base":format!("http://{address}/v1"),"api_key":"fixture-key"}))).await;
    assert_eq!(status, StatusCode::CREATED);
    let vendor = vendor["data"]["id"].as_str().unwrap();
    assert_eq!(
        call(
            &app,
            Method::POST,
            &format!("/admin/v1/vendors/{vendor}/models"),
            ADMIN,
            Some(json!({"alias":"billable","upstream_model":"fixture","enabled":true}))
        )
        .await
        .0,
        StatusCode::OK
    );
    let supplier = store
        .create_provider_business("Billable supplier")
        .await
        .unwrap();
    let mut rates = niu_storage::ProviderOfferInput {
        model_alias: "billable".into(),
        currency: "USD".into(),
        prompt_rate: "1000000000".into(),
        completion_rate: "2000000000".into(),
        expected_revision: None,
    };
    store
        .publish_provider_offer(supplier, &rates)
        .await
        .unwrap();
    rates.prompt_rate = "3000000000".into();
    rates.completion_rate = "6000000000".into();
    store.publish_customer_tariff(scope, &rates).await.unwrap();
    let key = store
        .issue_key(scope, "consumer", &["billable".into()], 3600)
        .await
        .unwrap();
    let response = app
        .oneshot(
            Request::post("/v1/chat/completions")
                .header("authorization", format!("Bearer {}", key.token))
                .header("content-type", "application/json")
                .body(axum::body::Body::from(
                    json!({"model":"billable","messages":[{"role":"user","content":"hello"}]})
                        .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let attempt: Uuid = response.headers()["x-niu-attempt-id"]
        .to_str()
        .unwrap()
        .parse()
        .unwrap();
    wait_for_completed_attempt(&state, scope, attempt).await;
    // The application recovery loop accrues commercial ledgers separately from
    // gateway completion persistence. Drive that loop explicitly in this fixture.
    store.recover_customer_charges(None).await.unwrap();
    store.recover_provider_earnings(None).await.unwrap();
    assert_eq!(
        store.customer_billing(scope).await.unwrap()["balances"][0]["charged_nanos"],
        "12000"
    );
    assert_eq!(
        store.provider_dashboard(supplier, 30).await.unwrap()["balances"][0]["earned_nanos"],
        "4000"
    );
    assert_eq!(sqlx::query_scalar::<_,i64>("SELECT COUNT(*) FROM customer_charges c JOIN provider_earnings e ON e.attempt_id=c.attempt_id").fetch_one(&pool).await.unwrap(),1);
    server.abort();
}

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn consumer_access_never_exposes_platform_costs_or_supplier_request_records(pool: PgPool) {
    let state = test_state(None, pool.clone());
    let store = state.store.clone();
    let scope = store.default_workspace().await.unwrap();
    let owner = store
        .create_operator(
            OperatorScope {
                organization_id: scope.organization_id,
                project_id: Some(scope.project_id),
            },
            "consumer",
            OperatorRole::Owner,
            3600,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let op = store.create_operation(scope, "text").await.unwrap();
    store
        .prepare_attempt(scope, op, "text", "test")
        .await
        .unwrap();
    let supplier = store.create_provider_business("Supplier").await.unwrap();
    store
        .set_provider_member(supplier, owner.operator_id, "viewer", true)
        .await
        .unwrap();
    let app = router(state);
    let base = format!(
        "/admin/v1/organizations/{}/projects/{}",
        scope.organization_id, scope.project_id
    );
    for suffix in ["costs", "budget", "executions/cohort"] {
        assert_eq!(
            call(
                &app,
                Method::GET,
                &format!("{base}/{suffix}"),
                &owner.token,
                None
            )
            .await
            .0,
            StatusCode::FORBIDDEN
        );
    }
    assert_eq!(
        call(
            &app,
            Method::POST,
            &format!("{base}/budget"),
            &owner.token,
            Some(json!({"currency":"USD","limit_nanos":"1000"}))
        )
        .await
        .0,
        StatusCode::FORBIDDEN
    );
    let (status, activity) = call(
        &app,
        Method::GET,
        &format!("{base}/requests"),
        &owner.token,
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(activity["data"].as_array().unwrap().len(), 1);
    for name in [
        "cash_nanos",
        "api_equivalent_nanos",
        "settled_costs",
        "unknown_cost_count",
    ] {
        assert!(!activity.to_string().contains(name));
    }
    let (status, provider) = call(
        &app,
        Method::GET,
        &format!("/admin/v1/providers/{supplier}/dashboard"),
        &owner.token,
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert!(provider["data"].get("earnings").is_none());
    assert!(provider["data"]["consumption"].is_array());
    for field in [
        "organization_id",
        "project_id",
        "task_id",
        "attempt_id",
        "operation_id",
        "key_name",
    ] {
        assert!(!provider.to_string().contains(field));
    }
}
