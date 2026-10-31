use super::*;
use axum::body::{Body, to_bytes};
use niu_storage::{OperatorAuditActor, OperatorRole, OperatorScope};

async fn request(
    app: &Router,
    path: &str,
    token: Option<&str>,
    origin: Option<&str>,
    body: Value,
) -> (StatusCode, HeaderMap, Value) {
    let mut builder = Request::builder()
        .method("POST")
        .uri(path)
        .header("content-type", "application/json");
    if let Some(token) = token {
        builder = builder.header("authorization", format!("Bearer {token}"));
    }
    if let Some(origin) = origin {
        builder = builder.header("origin", origin);
    }
    let response = app
        .clone()
        .oneshot(builder.body(Body::from(body.to_string())).unwrap())
        .await
        .unwrap();
    let status = response.status();
    let headers = response.headers().clone();
    let bytes = to_bytes(response.into_body(), 16384).await.unwrap();
    (
        status,
        headers,
        if bytes.is_empty() {
            Value::Null
        } else {
            serde_json::from_slice(&bytes).unwrap()
        },
    )
}

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn agent_connection_requires_scoped_explicit_browser_approval(pool: PgPool) {
    let store_pool = pool.clone();
    let mut state = test_state(None, pool);
    state.password_auth = Some(Arc::new(
        crate::admin::passwords::Runtime::new("https://niu.example.test")
            .await
            .unwrap(),
    ));
    let store = state.store.clone();
    let scope = store.default_workspace().await.unwrap();
    let owner = store
        .create_operator(
            OperatorScope {
                organization_id: scope.organization_id,
                project_id: Some(scope.project_id),
            },
            "Connect owner",
            OperatorRole::Owner,
            3600,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let viewer = store
        .create_operator(
            OperatorScope {
                organization_id: scope.organization_id,
                project_id: Some(scope.project_id),
            },
            "Connect viewer",
            OperatorRole::Viewer,
            3600,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let app = router(state);
    let (status, headers, created) = request(
        &app,
        "/api/v1/auth/agents",
        None,
        None,
        json!({"client_name":"DeepSeek Harness"}),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED);
    assert_eq!(headers["cache-control"], "no-store");
    assert!(created.get("token").is_none());
    let code = created["user_code"].as_str().unwrap();
    let path = format!("/api/v1/auth/agents/{code}");
    let decision = json!({"approve":true,"organization_id":scope.organization_id,"workspace_id":scope.project_id,"allowed_models":["*"],"ttl_seconds":3600});
    assert_eq!(
        request(
            &app,
            &path,
            None,
            Some("https://niu.example.test"),
            decision.clone()
        )
        .await
        .0,
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(
        request(
            &app,
            &path,
            Some(&viewer.token),
            Some("https://niu.example.test"),
            decision.clone()
        )
        .await
        .0,
        StatusCode::FORBIDDEN
    );
    assert_eq!(
        request(
            &app,
            &path,
            Some(&owner.token),
            Some("https://evil.example"),
            decision.clone()
        )
        .await
        .0,
        StatusCode::FORBIDDEN
    );
    assert_eq!(
        request(&app, &path, Some(&owner.token), None, decision.clone())
            .await
            .0,
        StatusCode::FORBIDDEN
    );
    let exchange = json!({"device_secret":created["device_secret"]});
    assert_eq!(
        request(
            &app,
            "/api/v1/auth/agents/token",
            None,
            None,
            exchange.clone()
        )
        .await
        .0,
        StatusCode::ACCEPTED
    );
    assert_eq!(
        request(
            &app,
            &path,
            Some(&owner.token),
            Some("https://niu.example.test"),
            decision
        )
        .await
        .0,
        StatusCode::NO_CONTENT
    );
    sqlx::query("UPDATE agent_authorizations SET next_poll_at=clock_timestamp()-interval '1 second' WHERE user_code=$1").bind(code).execute(&store_pool).await.unwrap();
    let (status, headers, result) = request(
        &app,
        "/api/v1/auth/agents/token",
        None,
        None,
        exchange.clone(),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(headers["cache-control"], "no-store");
    let principal = store
        .authenticate(result["token"].as_str().unwrap())
        .await
        .unwrap();
    assert_eq!(principal.scope().project_id, scope.project_id);
    assert_eq!(
        request(&app, "/api/v1/auth/agents/token", None, None, exchange)
            .await
            .0,
        StatusCode::UNAUTHORIZED
    );
}
