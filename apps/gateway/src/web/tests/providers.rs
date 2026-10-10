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
    let supplier_qualification = format!("/admin/v1/providers/{supplier}/qualification");
    let valid_until_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as i64
        + 30 * 24 * 60 * 60 * 1000;
    let qualification = json!({
        "supply_rights_sha256":"a".repeat(64),
        "supply_capability_sha256":"b".repeat(64),
        "data_handling_sha256":"c".repeat(64),
        "valid_until_ms":valid_until_ms
    });
    assert_eq!(
        call(
            &app,
            Method::PUT,
            &supplier_qualification,
            &owner.token,
            Some(qualification.clone())
        )
        .await
        .0,
        StatusCode::FORBIDDEN
    );
    assert_eq!(
        call(
            &app,
            Method::PUT,
            &supplier_qualification,
            ADMIN,
            Some(json!({
                "supply_rights_sha256":"not-a-digest",
                "supply_capability_sha256":"b".repeat(64),
                "data_handling_sha256":"c".repeat(64),
                "valid_until_ms":valid_until_ms
            }))
        )
        .await
        .0,
        StatusCode::BAD_REQUEST
    );
    assert_eq!(
        call(
            &app,
            Method::PUT,
            &supplier_qualification,
            ADMIN,
            Some(qualification)
        )
        .await
        .0,
        StatusCode::OK
    );
    let businesses = call(&app, Method::GET, "/admin/v1/providers", ADMIN, None)
        .await
        .1["data"]
        .as_array()
        .unwrap()
        .clone();
    assert_eq!(
        businesses
            .iter()
            .find(|business| business["id"] == supplier.to_string())
            .unwrap()["qualification_status"],
        "qualified"
    );
    assert_eq!(
        call(
            &app,
            Method::POST,
            &format!("/admin/v1/providers/{supplier}/qualification/revoke"),
            &owner.token,
            Some(json!({"reason_sha256":"d".repeat(64)}))
        )
        .await
        .0,
        StatusCode::FORBIDDEN
    );
    assert_eq!(
        call(
            &app,
            Method::POST,
            &format!("/admin/v1/providers/{supplier}/qualification/revoke"),
            ADMIN,
            Some(json!({"reason_sha256":"d".repeat(64)}))
        )
        .await
        .0,
        StatusCode::OK
    );
    let businesses = call(&app, Method::GET, "/admin/v1/providers", ADMIN, None)
        .await
        .1["data"]
        .as_array()
        .unwrap()
        .clone();
    assert_eq!(
        businesses
            .iter()
            .find(|business| business["id"] == supplier.to_string())
            .unwrap()["qualification_status"],
        "unqualified"
    );
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
    let members_path = format!("/admin/v1/providers/{supplier}/members");
    assert_eq!(
        call(&app, Method::GET, &members_path, &owner.token, None)
            .await
            .0,
        StatusCode::FORBIDDEN
    );
    let (status, members) = call(&app, Method::GET, &members_path, ADMIN, None).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(
        members["data"][0]["operator_id"],
        owner.operator_id.to_string()
    );
    assert_eq!(members["data"][0]["role"], "viewer");
    assert_eq!(members["data"][0]["active"], true);
    assert!(members["data"][0]["name"].is_string());
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
    let app = router(state);
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
    let revision = store
        .publish_provider_offer(supplier, &rates)
        .await
        .unwrap();
    let offer: Uuid = sqlx::query_scalar(
        "SELECT id FROM provider_offers WHERE provider_id=$1 AND model_alias='billable'",
    )
    .bind(supplier)
    .fetch_one(&pool)
    .await
    .unwrap();
    let valid_until_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as i64
        + 30 * 24 * 60 * 60 * 1000;
    assert_eq!(
        call(
            &app,
            Method::PUT,
            &format!("/admin/v1/providers/{supplier}/qualification"),
            ADMIN,
            Some(json!({
                "supply_rights_sha256":"a".repeat(64),
                "supply_capability_sha256":"b".repeat(64),
                "data_handling_sha256":"c".repeat(64),
                "valid_until_ms":valid_until_ms
            }))
        )
        .await
        .0,
        StatusCode::OK
    );
    assert_eq!(
        call(
            &app,
            Method::PUT,
            &format!("/admin/v1/providers/{supplier}/offers/{offer}/qualification"),
            ADMIN,
            Some(json!({
                "rate_revision":revision,
                "model_identity_sha256":"d".repeat(64),
                "protocol_matrix_sha256":"e".repeat(64),
                "protocol_matrix_version":"chat-v1",
                "data_handling_sha256":"f".repeat(64),
                "availability_sha256":"1".repeat(64),
                "agreed_rates_sha256":"2".repeat(64),
                "valid_until_ms":valid_until_ms
            }))
        )
        .await
        .0,
        StatusCode::OK
    );
    let supplier_manager = store
        .create_operator(
            OperatorScope {
                organization_id: scope.organization_id,
                project_id: None,
            },
            "supplier manager",
            OperatorRole::Owner,
            3600,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    store
        .set_provider_member(supplier, supplier_manager.operator_id, "manager", true)
        .await
        .unwrap();
    store
        .set_provider_offer_active(supplier, offer, supplier_manager.operator_id, true)
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
        .clone()
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
    assert_eq!(
        store.customer_billing(scope).await.unwrap()["balances"][0]["charged_nanos"],
        "12000"
    );
    assert_eq!(
        store.provider_dashboard(supplier, 30).await.unwrap()["balances"][0]["earned_nanos"],
        "4000"
    );
    assert_eq!(sqlx::query_scalar::<_,i64>("SELECT COUNT(*) FROM customer_charges c JOIN provider_earnings e ON e.attempt_id=c.attempt_id").fetch_one(&pool).await.unwrap(),1);
    let billing_path = format!(
        "/admin/v1/organizations/{}/projects/{}/billing",
        scope.organization_id, scope.project_id
    );
    let now_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as i64;
    let invoice_input = json!({"from_ms":now_ms-60_000,"to_ms":now_ms,"currency":"USD","idempotency_key":Uuid::new_v4()});
    let (status, invoice) = call(
        &app,
        Method::POST,
        &format!("{billing_path}/invoices"),
        ADMIN,
        Some(invoice_input.clone()),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let (status, replay) = call(
        &app,
        Method::POST,
        &format!("{billing_path}/invoices"),
        ADMIN,
        Some(invoice_input),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(replay, invoice);
    let invoice_id = invoice["data"]["id"].as_str().unwrap();
    let (status, lines) = call(
        &app,
        Method::GET,
        &format!("{billing_path}/invoices/{invoice_id}"),
        ADMIN,
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(lines["data"].as_array().unwrap().len(), 1);
    assert_eq!(lines["data"][0]["amount_nanos"], "12000");
    assert_eq!(lines["data"][0]["model_alias"], "billable");
    assert!(!lines.to_string().contains("earned_nanos"));
    assert_eq!(
        call(
            &app,
            Method::POST,
            &format!("/admin/v1/providers/{supplier}/offers/{offer}/qualification/revoke"),
            ADMIN,
            Some(json!({"reason_sha256":"3".repeat(64)}))
        )
        .await
        .0,
        StatusCode::OK
    );
    let second_response = app
        .oneshot(
            Request::post("/v1/chat/completions")
                .header("authorization", format!("Bearer {}", key.token))
                .header("content-type", "application/json")
                .body(axum::body::Body::from(
                    json!({"model":"billable","messages":[{"role":"user","content":"again"}]})
                        .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(second_response.status(), StatusCode::SERVICE_UNAVAILABLE);
    assert_eq!(
        store.customer_billing(scope).await.unwrap()["balances"][0]["charged_nanos"],
        "12000"
    );
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
    for (suffix, expected) in [
        ("costs", StatusCode::FORBIDDEN),
        ("budget", StatusCode::FORBIDDEN),
        ("executions/cohort", StatusCode::NOT_FOUND),
    ] {
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
            expected
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

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn supplier_rate_http_updates_require_current_revision(pool: PgPool) {
    let state = test_state(None, pool.clone());
    let store = state.store.clone();
    let scope = store.default_workspace().await.unwrap();
    let customer = store
        .create_operator(
            OperatorScope {
                organization_id: scope.organization_id,
                project_id: Some(scope.project_id),
            },
            "workspace rate viewer",
            OperatorRole::Owner,
            3600,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let supplier = store
        .create_provider_business("Rate fixture")
        .await
        .unwrap();
    store
        .set_provider_member(supplier, customer.operator_id, "manager", true)
        .await
        .unwrap();
    let vendor = Uuid::new_v4();
    sqlx::query("INSERT INTO vendors(id,name,adapter,api_base,credential_ciphertext) VALUES($1,'rate fixture','openai','https://example.com/v1',$2)")
        .bind(vendor).bind(vec![1u8;48]).execute(&pool).await.unwrap();
    sqlx::query("INSERT INTO vendor_models(alias,vendor_id,upstream_model,capabilities) VALUES('rate-fixture',$1,'rate-fixture',$2)")
        .bind(vendor).bind(json!({})).execute(&pool).await.unwrap();
    let app = router(state.clone());
    let path = format!("/admin/v1/providers/{supplier}/offers");
    let mut rates = json!({"model_alias":"rate-fixture","currency":"USD","prompt_rate":"400000000","completion_rate":"1600000000","expected_revision":null});
    assert_eq!(
        call(
            &app,
            Method::POST,
            &path,
            &customer.token,
            Some(rates.clone())
        )
        .await
        .0,
        StatusCode::FORBIDDEN
    );
    let (status, created) = call(&app, Method::POST, &path, ADMIN, Some(rates.clone())).await;
    assert_eq!(status, StatusCode::OK);
    assert!(
        !crate::vendors::effective_models(&state)
            .await
            .unwrap()
            .contains_key("rate-fixture")
    );
    let original = created["data"]["revision"].clone();
    assert_eq!(
        call(&app, Method::POST, &path, ADMIN, Some(rates.clone()))
            .await
            .0,
        StatusCode::CONFLICT
    );
    rates["expected_revision"] = original;
    rates["prompt_rate"] = json!("500000000");
    let (status, changed) = call(&app, Method::POST, &path, ADMIN, Some(rates.clone())).await;
    assert_eq!(status, StatusCode::OK);
    assert_ne!(created["data"]["revision"], changed["data"]["revision"]);
    assert_eq!(
        call(&app, Method::POST, &path, ADMIN, Some(rates)).await.0,
        StatusCode::CONFLICT
    );
    let (_, report) = call(
        &app,
        Method::GET,
        &format!("/admin/v1/providers/{supplier}/administration"),
        ADMIN,
        None,
    )
    .await;
    assert_eq!(
        report["data"]["offers"][0]["revision"],
        changed["data"]["revision"]
    );
    assert_eq!(report["data"]["offers"][0]["prompt_rate"], "500000000");
    assert_eq!(report["data"]["offers"][0]["active"], false);
    assert_eq!(report["data"]["offers"][0]["qualified"], false);
    for (field, value) in [
        ("prompt_rate", "-1"),
        ("completion_rate", "0.5"),
        ("prompt_rate", "1000000000000001"),
        ("currency", "usd"),
    ] {
        let mut invalid = json!({"model_alias":"rate-fixture","currency":"USD","prompt_rate":"500000000","completion_rate":"1600000000","expected_revision":changed["data"]["revision"]});
        invalid[field] = json!(value);
        assert_eq!(
            call(&app, Method::POST, &path, ADMIN, Some(invalid))
                .await
                .0,
            StatusCode::BAD_REQUEST
        );
    }
    let (_, unchanged) = call(
        &app,
        Method::GET,
        &format!("/admin/v1/providers/{supplier}/administration"),
        ADMIN,
        None,
    )
    .await;
    assert_eq!(unchanged["data"]["offers"], report["data"]["offers"]);
}

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn client_model_prices_are_retail_scoped_exact_and_unknown_without_a_tariff(pool: PgPool) {
    let state = test_state(None, pool.clone());
    let store = state.store.clone();
    let scope = store.default_workspace().await.unwrap();
    let key = store
        .issue_key(scope, "customer", &["fast".into()], 3600)
        .await
        .unwrap();
    let app = router(state);
    let (status, unpriced) = call(&app, Method::GET, "/v1/models", &key.token, None).await;
    assert_eq!(status, StatusCode::OK);
    assert!(unpriced["data"][0]["customer_pricing"].is_null());
    let rates = niu_storage::ProviderOfferInput {
        model_alias: "fast".into(),
        currency: "USD".into(),
        prompt_rate: "1234567891".into(),
        completion_rate: "1000000000000000".into(),
        expected_revision: None,
    };
    let revision = store.publish_customer_tariff(scope, &rates).await.unwrap();
    let (status, priced) = call(&app, Method::GET, "/v1/models", &key.token, None).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(priced["data"].as_array().unwrap().len(), 1);
    assert_eq!(
        priced["data"][0]["customer_pricing"],
        json!({"revision":revision,"currency":"USD","unit":"nanounits_per_million_tokens","prompt_rate":"1234567891","completion_rate":"1000000000000000","cached_prompt_rate":null})
    );
    let dashboard_path = format!(
        "/admin/v1/models?organization_id={}&project_id={}",
        scope.organization_id, scope.project_id
    );
    let (status, dashboard) = call(&app, Method::GET, &dashboard_path, ADMIN, None).await;
    assert_eq!(status, StatusCode::OK);
    let fast = dashboard["data"]
        .as_array()
        .unwrap()
        .iter()
        .find(|model| model["id"] == "fast")
        .unwrap();
    assert_eq!(
        fast["customer_pricing"],
        priced["data"][0]["customer_pricing"]
    );
    let (_, unscoped) = call(&app, Method::GET, "/admin/v1/models", ADMIN, None).await;
    assert!(
        unscoped["data"]
            .as_array()
            .unwrap()
            .iter()
            .all(|model| model["customer_pricing"].is_null())
    );
    let missing = format!(
        "/admin/v1/models?organization_id={}&project_id={}",
        scope.organization_id,
        Uuid::new_v4()
    );
    assert_eq!(
        call(&app, Method::GET, &missing, ADMIN, None).await.0,
        StatusCode::NOT_FOUND
    );
    let tariff_path = format!(
        "/admin/v1/organizations/{}/projects/{}/billing/tariffs",
        scope.organization_id, scope.project_id
    );
    let update = json!({"model_alias":"fast","currency":"USD","prompt_rate":"0","completion_rate":"0","expected_revision":revision});
    let (status, updated) = call(
        &app,
        Method::POST,
        &tariff_path,
        ADMIN,
        Some(update.clone()),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(
        call(&app, Method::POST, &tariff_path, ADMIN, Some(update))
            .await
            .0,
        StatusCode::CONFLICT
    );
    let (_, current) = call(&app, Method::GET, "/v1/models", &key.token, None).await;
    assert_eq!(
        current["data"][0]["customer_pricing"]["revision"],
        updated["data"]["revision"]
    );
    assert_eq!(current["data"][0]["customer_pricing"]["prompt_rate"], "0");
    let historical: (i64, i64) = sqlx::query_as(
        "SELECT prompt_rate,completion_rate FROM customer_tariff_revisions WHERE id=$1",
    )
    .bind(revision)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(historical, (1_234_567_891, 1_000_000_000_000_000));
    let foreign = store
        .create_project(scope.organization_id, "Foreign customer")
        .await
        .unwrap();
    let foreign_scope = foreign;
    let foreign_key = store
        .issue_key(foreign_scope, "other customer", &["fast".into()], 3600)
        .await
        .unwrap();
    let (_, other) = call(&app, Method::GET, "/v1/models", &foreign_key.token, None).await;
    assert!(other["data"][0]["customer_pricing"].is_null());
    let other_dashboard = format!(
        "/admin/v1/models?organization_id={}&project_id={}",
        foreign_scope.organization_id, foreign_scope.project_id
    );
    let workspace_reader = store
        .create_operator(
            OperatorScope {
                organization_id: scope.organization_id,
                project_id: Some(scope.project_id),
            },
            "Workspace reader",
            OperatorRole::Viewer,
            3600,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    assert_eq!(
        call(
            &app,
            Method::GET,
            &dashboard_path,
            &workspace_reader.token,
            None
        )
        .await
        .0,
        StatusCode::OK
    );
    assert_eq!(
        call(
            &app,
            Method::GET,
            &other_dashboard,
            &workspace_reader.token,
            None
        )
        .await
        .0,
        StatusCode::NOT_FOUND
    );
    assert_eq!(
        call(&app, Method::GET, &dashboard_path, &key.token, None)
            .await
            .0,
        StatusCode::UNAUTHORIZED
    );
    let (_, other_dashboard) = call(&app, Method::GET, &other_dashboard, ADMIN, None).await;
    assert!(
        other_dashboard["data"]
            .as_array()
            .unwrap()
            .iter()
            .all(|model| model["customer_pricing"].is_null())
    );

    for field in [
        "cash_prompt_rate",
        "cash_completion_rate",
        "api_prompt_rate",
        "api_completion_rate",
        "credential",
        "provider_earnings",
    ] {
        assert!(!priced.to_string().contains(field));
    }
}

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn personal_credentials_are_excluded_from_shared_model_access(pool: PgPool) {
    let state = test_state(None, pool.clone());
    let scope = state.store.default_workspace().await.unwrap();
    let vendor = Uuid::new_v4();
    sqlx::query("INSERT INTO vendors(id,name,adapter,api_base,credential_ciphertext) VALUES($1,'personal fixture','openai','https://example.com/v1',$2)")
        .bind(vendor).bind(vec![1u8;48]).execute(&pool).await.unwrap();
    sqlx::query("INSERT INTO vendor_models(alias,vendor_id,upstream_model,capabilities,public_catalog) VALUES('personal-fixture',$1,'personal-fixture',$2,true)")
        .bind(vendor).bind(json!({})).execute(&pool).await.unwrap();
    assert!(
        crate::vendors::effective_models(&state)
            .await
            .unwrap()
            .contains_key("personal-fixture")
    );
    let revision: i64 = sqlx::query_scalar("SELECT revision FROM vendors WHERE id=$1")
        .bind(vendor)
        .fetch_one(&pool)
        .await
        .unwrap();
    state
        .store
        .assign_personal_vendor_owner(vendor, scope.organization_id, revision)
        .await
        .unwrap();
    assert!(
        !crate::vendors::effective_models(&state)
            .await
            .unwrap()
            .contains_key("personal-fixture")
    );
    assert!(
        crate::vendors::resolve_model(&state, "personal-fixture")
            .await
            .is_err()
    );
    let app = router(state);
    let response = app
        .oneshot(
            Request::builder()
                .uri("/catalog/v1/models")
                .body(axum::body::Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    let catalog: Value = serde_json::from_slice(&bytes).unwrap();
    assert!(!catalog.to_string().contains("personal-fixture"));
}

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn media_offer_configuration_is_installation_only_bounded_and_receipt_safe(pool: PgPool) {
    let state = test_state(None, pool.clone());
    let store = state.store.clone();
    let scope = store.default_workspace().await.unwrap();
    let owner = store
        .create_operator(
            OperatorScope {
                organization_id: scope.organization_id,
                project_id: None,
            },
            "Customer owner",
            OperatorRole::Owner,
            3600,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let supplier = store
        .create_provider_business("Media fixture")
        .await
        .unwrap();
    let vendor = Uuid::new_v4();
    sqlx::query("INSERT INTO vendors(id,name,adapter,api_base,credential_ciphertext) VALUES($1,'Video credential','openai','https://fixture.example',$2)").bind(vendor).bind(vec![17u8;48]).execute(&pool).await.unwrap();
    store
        .associate_vendor_supplier(vendor, supplier, 1)
        .await
        .unwrap();
    let schema = json!({"version":1,"revision":"fixture-schema","model_alias":"video/fixture","upstream_model":"private-video","channel":"ark-direct-v1","maximum_body_bytes":1024,"maximum_content_items":1,"inputs":{"text":{"maximum_items":1,"maximum_bytes":256,"https":false,"data_mime_types":[],"roles":[],"role_required":false}},"controls":{},"required_controls":[],"exclusive_controls":[],"callbacks_qualified":false});
    sqlx::query("INSERT INTO vendor_models(alias,vendor_id,upstream_model,capabilities) VALUES('video/fixture',$1,'private-video',$2)").bind(vendor).bind(json!({"video_schema":schema})).execute(&pool).await.unwrap();
    let app = router(state);
    let choices = format!("/admin/v1/providers/{supplier}/media-offer-models");
    let publish = format!("/admin/v1/providers/{supplier}/media-offers");
    for token in [&owner.token, "invalid"] {
        let status = call(&app, Method::GET, &choices, token, None).await.0;
        assert_eq!(
            status,
            if token == "invalid" {
                StatusCode::UNAUTHORIZED
            } else {
                StatusCode::FORBIDDEN
            }
        );
    }
    assert_eq!(
        call(
            &app,
            Method::GET,
            &format!("{choices}?limit=101"),
            ADMIN,
            None
        )
        .await
        .0,
        StatusCode::BAD_REQUEST
    );
    let (status, page) = call(
        &app,
        Method::GET,
        &format!("{choices}?limit=1"),
        ADMIN,
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let choice = &page["data"][0];
    assert_eq!(choice["api_key_name"], "Video credential");
    for forbidden in [
        "credential_ciphertext",
        "api_base",
        "upstream_model",
        "prompt_rate",
        "completion_rate",
    ] {
        assert!(choice.get(forbidden).is_none());
    }
    let second_vendor = Uuid::new_v4();
    sqlx::query("INSERT INTO vendors(id,name,adapter,api_base,credential_ciphertext) VALUES($1,'Independent credential','openai','https://independent.fixture.example',$2)").bind(second_vendor).bind(vec![19u8;48]).execute(&pool).await.unwrap();
    store
        .associate_vendor_supplier(second_vendor, supplier, 1)
        .await
        .unwrap();
    let original_capabilities: serde_json::Value =
        sqlx::query_scalar("SELECT capabilities FROM vendor_models WHERE alias='video/fixture'")
            .fetch_one(&pool)
            .await
            .unwrap();
    for (alias, key) in [("video/shared", vendor), ("video/separate", second_vendor)] {
        let mut capabilities = original_capabilities.clone();
        capabilities["video_schema"]["model_alias"] = json!(alias);
        capabilities["video_schema"]["upstream_model"] = json!(alias);
        sqlx::query("INSERT INTO vendor_models(alias,vendor_id,upstream_model,capabilities) VALUES($1,$2,$1,$3)").bind(alias).bind(key).bind(capabilities).execute(&pool).await.unwrap();
    }
    // Invalid schemas may fill a raw page; its cursor must still advance to valid choices.
    sqlx::query("INSERT INTO vendor_models(alias,vendor_id,upstream_model,capabilities) VALUES('000-invalid',$1,'invalid',$2)").bind(vendor).bind(json!({"video_schema":{}})).execute(&pool).await.unwrap();
    let mut after = None;
    let mut discovered = std::collections::BTreeMap::new();
    for _ in 0..4 {
        let uri = after.as_ref().map_or_else(
            || format!("{choices}?limit=1"),
            |cursor: &String| format!("{choices}?limit=1&after={cursor}"),
        );
        let (status, page) = call(&app, Method::GET, &uri, ADMIN, None).await;
        assert_eq!(status, StatusCode::OK);
        for item in page["data"].as_array().unwrap() {
            discovered.insert(
                item["model_alias"].as_str().unwrap().to_owned(),
                item["vendor_id"].as_str().unwrap().to_owned(),
            );
            for field in [
                "credential_ciphertext",
                "api_base",
                "upstream_model",
                "prompt_rate",
                "completion_rate",
            ] {
                assert!(item.get(field).is_none());
            }
        }
        if page["has_more"] == false {
            after = None;
            break;
        }
        let next = page["next_after"].as_str().unwrap().to_owned();
        assert!(after.as_ref().is_none_or(|old| old < &next));
        after = Some(next);
    }
    assert!(after.is_none());
    assert_eq!(discovered.len(), 3);
    assert_eq!(discovered["video/fixture"], vendor.to_string());
    assert_eq!(discovered["video/shared"], vendor.to_string());
    assert_eq!(discovered["video/separate"], second_vendor.to_string());
    sqlx::query("UPDATE vendors SET revision=9007199254740993 WHERE id=$1")
        .bind(vendor)
        .execute(&pool)
        .await
        .unwrap();
    let receipt = Uuid::new_v4();
    let body = json!({"revision":receipt,"model_alias":"video/fixture","vendor_id":vendor,"vendor_revision":"9007199254740993","model_revision":"1","schema_revision":"fixture-schema","expected_revision":null});
    assert_eq!(
        call(
            &app,
            Method::POST,
            &publish,
            &owner.token,
            Some(body.clone())
        )
        .await
        .0,
        StatusCode::FORBIDDEN
    );
    for _ in 0..2 {
        let (status, saved) = call(&app, Method::POST, &publish, ADMIN, Some(body.clone())).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(saved["data"]["revision"], receipt.to_string());
    }
    let mut changed = body.clone();
    changed["schema_revision"] = json!("different");
    assert_eq!(
        call(&app, Method::POST, &publish, ADMIN, Some(changed))
            .await
            .0,
        StatusCode::CONFLICT
    );
    let mut extra = body;
    extra["customer_price"] = json!(123);
    let extra_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method(Method::POST)
                .uri(&publish)
                .header("authorization", format!("Bearer {ADMIN}"))
                .header("content-type", "application/json")
                .body(axum::body::Body::from(extra.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(extra_response.status(), StatusCode::UNPROCESSABLE_ENTITY);
    let oversized = app
        .oneshot(
            Request::builder()
                .method(Method::POST)
                .uri(&publish)
                .header("authorization", format!("Bearer {ADMIN}"))
                .header("content-type", "application/json")
                .body(axum::body::Body::from(" ".repeat(4097)))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(oversized.status(), StatusCode::PAYLOAD_TOO_LARGE);
}

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn supplier_directory_crud_retains_audit_and_protects_configured_suppliers(pool: PgPool) {
    let state = test_state(None, pool.clone());
    let store = state.store.clone();
    let scope = store.default_workspace().await.unwrap();
    let owner = store
        .create_operator(
            OperatorScope {
                organization_id: scope.organization_id,
                project_id: None,
            },
            "Customer",
            OperatorRole::Owner,
            3600,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let app = router(state);
    let created = call(
        &app,
        Method::POST,
        "/admin/v1/providers",
        ADMIN,
        Some(json!({"name":"Directory fixture"})),
    )
    .await;
    assert_eq!(created.0, StatusCode::OK);
    let id = created.1["data"]["id"].as_str().unwrap();
    let path = format!("/admin/v1/providers/{id}");
    assert_eq!(
        call(
            &app,
            Method::PATCH,
            &path,
            &owner.token,
            Some(json!({"name":"Forbidden"}))
        )
        .await
        .0,
        StatusCode::FORBIDDEN
    );
    assert_eq!(
        call(&app, Method::DELETE, &path, &owner.token, None)
            .await
            .0,
        StatusCode::FORBIDDEN
    );
    assert_eq!(
        call(
            &app,
            Method::PATCH,
            &path,
            ADMIN,
            Some(json!({"name":"Renamed Supplier"}))
        )
        .await
        .0,
        StatusCode::OK
    );
    assert_eq!(
        call(&app, Method::DELETE, &path, ADMIN, None).await.0,
        StatusCode::OK
    );
    let list = call(&app, Method::GET, "/admin/v1/providers", ADMIN, None).await;
    assert!(
        !list.1["data"]
            .as_array()
            .unwrap()
            .iter()
            .any(|row| row["id"] == id)
    );
    let events: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM provider_audit_events WHERE provider_id=$1")
            .bind(Uuid::parse_str(id).unwrap())
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(events, 3);
    assert_eq!(
        call(
            &app,
            Method::PATCH,
            &path,
            ADMIN,
            Some(json!({"name":"Reopen"}))
        )
        .await
        .0,
        StatusCode::CONFLICT
    );
    let configured = store
        .create_provider_business("Configured Supplier")
        .await
        .unwrap();
    sqlx::query("INSERT INTO provider_memberships(provider_id,operator_id,role,active) VALUES($1,$2,'manager',true)").bind(configured).bind(owner.operator_id).execute(&pool).await.unwrap();
    assert_eq!(
        call(
            &app,
            Method::DELETE,
            &format!("/admin/v1/providers/{configured}"),
            ADMIN,
            None
        )
        .await
        .0,
        StatusCode::CONFLICT
    );
    assert_eq!(
        call(
            &app,
            Method::GET,
            "/admin/v1/platform/configuration",
            &owner.token,
            None
        )
        .await
        .0,
        StatusCode::FORBIDDEN
    );
}

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn platform_epay_configuration_is_encrypted_validated_and_applied(pool: PgPool) {
    let mut state = test_state(None, pool.clone());
    state.vendor_cipher = Some(std::sync::Arc::new(
        crate::vendors::crypto::CredentialCipher::new(
            "private-test-payment-encryption-key-123456789",
        )
        .unwrap(),
    ));
    let store = state.store.clone();
    let scope = store.default_workspace().await.unwrap();
    let owner = store
        .create_operator(
            OperatorScope {
                organization_id: scope.organization_id,
                project_id: None,
            },
            "Customer",
            OperatorRole::Owner,
            3600,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let app = router(state.clone());
    let path = "/admin/v1/platform/payments/epay";
    let secret = "private-fixture-merchant-key";
    let configuration = json!({"expected_revision":"0","enabled":true,"merchant_id":"12345","key":secret,"endpoint":"https://payments.example.com","notify_url":"https://niu.example.com/payments/epay/notify","return_url":"https://niu.example.com/settings/billing","methods":["alipay","wxpay"]});
    assert_eq!(
        call(&app, Method::GET, path, &owner.token, None).await.0,
        StatusCode::FORBIDDEN
    );
    assert_eq!(
        call(
            &app,
            Method::PUT,
            path,
            &owner.token,
            Some(configuration.clone())
        )
        .await
        .0,
        StatusCode::FORBIDDEN
    );
    let mut invalid = configuration.clone();
    invalid["notify_url"] = json!("http://niu.example.com/notify");
    assert_eq!(
        call(&app, Method::PUT, path, ADMIN, Some(invalid)).await.0,
        StatusCode::BAD_REQUEST
    );
    assert!(
        store
            .payment_gateway_configuration()
            .await
            .unwrap()
            .is_none()
    );
    sqlx::query("UPDATE admin_operators SET platform_admin=true WHERE id=$1")
        .bind(owner.operator_id)
        .execute(&pool)
        .await
        .unwrap();
    let saved = call(
        &app,
        Method::PUT,
        path,
        &owner.token,
        Some(configuration.clone()),
    )
    .await;
    assert_eq!(saved.0, StatusCode::OK, "{saved:?}");
    assert_eq!(saved.1["data"]["revision"], "1");
    assert_eq!(saved.1["data"]["has_key"], true);
    assert!(!saved.1.to_string().contains(secret));
    assert_eq!(
        call(&app, Method::PUT, path, ADMIN, Some(configuration.clone()))
            .await
            .0,
        StatusCode::CONFLICT
    );
    let (_, ciphertext) = store
        .payment_gateway_configuration()
        .await
        .unwrap()
        .unwrap();
    assert!(
        !ciphertext
            .windows(secret.len())
            .any(|bytes| bytes == secret.as_bytes())
    );
    let mut updated = configuration;
    updated["expected_revision"] = json!("1");
    updated["key"] = json!("");
    assert_eq!(
        call(&app, Method::PUT, path, ADMIN, Some(updated)).await.0,
        StatusCode::OK
    );
    let reopened = router(state.clone());
    let read = call(&reopened, Method::GET, path, ADMIN, None).await;
    assert_eq!(read.1["data"]["revision"], "2");
    assert_eq!(read.1["data"]["has_key"], true);
    assert!(!read.1.to_string().contains(secret));
    let methods = call(
        &reopened,
        Method::GET,
        &format!(
            "/admin/v1/organizations/{}/billing/payment-methods?currency=CNY&payment_gateway=epay",
            scope.organization_id
        ),
        ADMIN,
        None,
    )
    .await;
    assert_eq!(methods.0, StatusCode::OK);
    assert_eq!(methods.1["data"]["payment_gateway"], "epay");
    let events: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM payment_gateway_configuration_events")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(events, 2);
    let actor_events: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM payment_gateway_configuration_events WHERE actor_operator_id=$1",
    )
    .bind(owner.operator_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(actor_events, 1);
    let company = store
        .create_prepaid_organization("Pending EPay fixture", "CNY")
        .await
        .unwrap();
    store
        .create_customer_topup(
            company,
            &niu_storage::TopupInput {
                currency: "CNY",
                amount_nanos: 1_000_000_000,
                aggregator: "epay",
                merchant: "12345",
                payment_method: "alipay",
                idempotency_key: Uuid::new_v4(),
            },
        )
        .await
        .unwrap();
    let disabled = json!({"expected_revision":"2","enabled":false,"merchant_id":"12345","key":"","endpoint":"https://payments.example.com","notify_url":"https://niu.example.com/payments/epay/notify","return_url":"https://niu.example.com/settings/billing","methods":["alipay","wxpay"]});
    assert_eq!(
        call(&app, Method::PUT, path, ADMIN, Some(disabled)).await.0,
        StatusCode::CONFLICT
    );
    assert_eq!(
        store
            .payment_gateway_configuration()
            .await
            .unwrap()
            .unwrap()
            .0,
        2
    );
    sqlx::query("UPDATE admin_operators SET platform_admin=false WHERE id=$1")
        .bind(owner.operator_id)
        .execute(&pool)
        .await
        .unwrap();
    assert_eq!(
        call(&app, Method::GET, path, &owner.token, None).await.0,
        StatusCode::FORBIDDEN
    );
}

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn supplier_profile_is_durable_validated_and_revision_guarded(pool: PgPool) {
    let state = test_state(None, pool.clone());
    let store = state.store.clone();
    let scope = store.default_workspace().await.unwrap();
    let owner = store
        .create_operator(
            OperatorScope {
                organization_id: scope.organization_id,
                project_id: None,
            },
            "Customer",
            OperatorRole::Owner,
            3600,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let supplier = store
        .create_provider_business("Profile fixture")
        .await
        .unwrap();
    store
        .set_provider_member(supplier, owner.operator_id, "manager", true)
        .await
        .unwrap();
    let path = format!("/admin/v1/providers/{supplier}");
    let app = router(state);
    assert_eq!(
        call(&app, Method::GET, &path, &owner.token, None).await.0,
        StatusCode::FORBIDDEN
    );
    let input = json!({"name":" Updated supplier ","description":"Supply business\nModel services", "website_url":"https://example.com", "logo_url":"https://example.com/logo.png", "expected_revision":1});
    assert_eq!(
        call(
            &app,
            Method::PATCH,
            &path,
            &owner.token,
            Some(input.clone())
        )
        .await
        .0,
        StatusCode::FORBIDDEN
    );
    let saved = call(&app, Method::PATCH, &path, ADMIN, Some(input.clone())).await;
    assert_eq!(saved.0, StatusCode::OK);
    assert_eq!(saved.1["data"]["name"], "Updated supplier");
    assert_eq!(saved.1["data"]["revision"], 2);
    assert_eq!(call(&app, Method::GET, &path, ADMIN, None).await.1, saved.1);
    assert_eq!(
        call(&app, Method::PATCH, &path, ADMIN, Some(input)).await.0,
        StatusCode::CONFLICT
    );
    for invalid in [
        "javascript:alert(1)",
        "https://user:secret@example.com",
        "data:image/png;base64,invalid",
    ] {
        assert_eq!(
            call(
                &app,
                Method::PATCH,
                &path,
                ADMIN,
                Some(json!({"name":"Invalid", "logo_url":invalid}))
            )
            .await
            .0,
            StatusCode::BAD_REQUEST
        );
    }
    let renamed = call(
        &app,
        Method::PATCH,
        &path,
        ADMIN,
        Some(json!({"name":"Legacy rename"})),
    )
    .await;
    assert_eq!(renamed.0, StatusCode::OK);
    assert_eq!(
        renamed.1["data"]["description"],
        saved.1["data"]["description"]
    );
    let cleared = call(&app, Method::PATCH, &path, ADMIN, Some(json!({"name":"Legacy rename", "website_url":"", "logo_url":"", "description":"", "expected_revision":3}))).await;
    assert_eq!(cleared.0, StatusCode::OK);
    assert_eq!(
        store
            .supplier_profile(supplier)
            .await
            .unwrap()
            .unwrap()
            .logo_url,
        ""
    );
    let events: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM provider_audit_events WHERE provider_id=$1")
            .bind(supplier)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(events, 5); // creation, membership, and three successful profile updates
}
