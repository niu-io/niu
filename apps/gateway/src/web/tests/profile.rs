use super::*;
use axum::{body::Body, http::Method};
use base64::{Engine, engine::general_purpose::STANDARD};
use niu_storage::{OperatorAuditActor, OperatorRole, OperatorScope};
use std::io::Cursor;

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn chat_drafts_are_durable_private_and_revision_checked(pool: PgPool) {
    let state = test_state(None, pool);
    let store = state.store.clone();
    let workspace = store.default_workspace().await.unwrap();
    let scope = OperatorScope {
        organization_id: workspace.organization_id,
        project_id: Some(workspace.project_id),
    };
    let member = store
        .create_operator(
            scope,
            "Draft member",
            OperatorRole::Admin,
            3600,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let other = store
        .create_operator(
            scope,
            "Other draft member",
            OperatorRole::Admin,
            3600,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let reader = store
        .create_operator(
            scope,
            "Draft reader",
            OperatorRole::Viewer,
            3600,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let app = router(state);
    let path = format!(
        "/admin/v1/organizations/{}/projects/{}/chat-draft",
        workspace.organization_id, workspace.project_id
    );
    let payload = json!({"sessionId":null,"prompt":"Unsent question","models":["fast"],"attachments":[{"name":"note.md","type":"text","content":"Unsent context"}],"settings":{"systemPrompt":"Be concise","maxTokens":512,"temperature":0.7,"logPayloads":true}});
    assert_eq!(
        call_path(&app, Method::GET, None, Value::Null, &path)
            .await
            .0,
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(
        call_path(&app, Method::GET, Some(&member.token), Value::Null, &path)
            .await
            .1,
        json!({"data":{"payload":null,"revision":0}})
    );
    assert_eq!(
        call_path(
            &app,
            Method::PUT,
            Some(&reader.token),
            json!({"payload":payload,"expected_revision":0}),
            &path
        )
        .await
        .0,
        StatusCode::FORBIDDEN
    );
    let (status, saved) = call_path(
        &app,
        Method::PUT,
        Some(&member.token),
        json!({"payload":payload,"expected_revision":0}),
        &path,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(saved, json!({"data":{"payload":payload,"revision":1}}));
    assert_eq!(
        call_path(&app, Method::GET, Some(&member.token), Value::Null, &path)
            .await
            .1,
        saved
    );
    assert_eq!(
        call_path(&app, Method::GET, Some(&other.token), Value::Null, &path)
            .await
            .1,
        json!({"data":{"payload":null,"revision":0}})
    );
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri(&path)
                .header("authorization", format!("Bearer {}", member.token))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.headers().get("cache-control").unwrap(), "no-store");
    let foreign_path = format!(
        "/admin/v1/organizations/{}/projects/{}/chat-draft",
        workspace.organization_id,
        Uuid::new_v4()
    );
    assert_eq!(
        call_path(
            &app,
            Method::GET,
            Some(&member.token),
            Value::Null,
            &foreign_path
        )
        .await
        .0,
        StatusCode::FORBIDDEN
    );
    let mut too_many = payload.clone();
    too_many["models"] = json!(["one", "two", "three", "four", "five"]);
    assert_eq!(
        call_path(
            &app,
            Method::PUT,
            Some(&member.token),
            json!({"payload":too_many,"expected_revision":1}),
            &path
        )
        .await
        .0,
        StatusCode::BAD_REQUEST
    );
    assert_eq!(
        call_path(
            &app,
            Method::PUT,
            Some(&member.token),
            json!({"payload":null,"expected_revision":0}),
            &path
        )
        .await
        .0,
        StatusCode::CONFLICT
    );
    let mut invalid = payload.clone();
    invalid["settings"]["token"] = json!("must-not-store");
    assert_eq!(
        call_path(
            &app,
            Method::PUT,
            Some(&member.token),
            json!({"payload":invalid,"expected_revision":1}),
            &path
        )
        .await
        .0,
        StatusCode::BAD_REQUEST
    );
    let mut missing = payload.clone();
    missing["sessionId"] = json!(Uuid::new_v4());
    assert_eq!(
        call_path(
            &app,
            Method::PUT,
            Some(&member.token),
            json!({"payload":missing,"expected_revision":1}),
            &path
        )
        .await
        .0,
        StatusCode::BAD_REQUEST
    );
    assert_eq!(
        call_path(
            &app,
            Method::PUT,
            Some(&member.token),
            json!({"payload":null,"expected_revision":1}),
            &path
        )
        .await
        .1,
        json!({"data":{"payload":null,"revision":2}})
    );
    assert_eq!(
        call_path(
            &app,
            Method::PUT,
            Some(&member.token),
            json!({"payload":payload,"expected_revision":1}),
            &path
        )
        .await
        .0,
        StatusCode::CONFLICT
    );
    store
        .revoke_operator(member.operator_id, OperatorAuditActor::Installation)
        .await
        .unwrap();
    assert_eq!(
        call_path(&app, Method::GET, Some(&member.token), Value::Null, &path)
            .await
            .0,
        StatusCode::UNAUTHORIZED
    );
}

async fn call(
    app: &Router,
    method: Method,
    token: Option<&str>,
    body: Value,
) -> (StatusCode, Value) {
    call_path(app, method, token, body, "/admin/v1/auth/profile").await
}

async fn call_path(
    app: &Router,
    method: Method,
    token: Option<&str>,
    body: Value,
    path: &str,
) -> (StatusCode, Value) {
    let mut request = Request::builder()
        .method(method)
        .uri(path)
        .header("content-type", "application/json");
    if let Some(token) = token {
        request = request.header("authorization", format!("Bearer {token}"));
    }
    let response = app
        .clone()
        .oneshot(request.body(Body::from(body.to_string())).unwrap())
        .await
        .unwrap();
    let status = response.status();
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    (status, serde_json::from_slice(&bytes).unwrap())
}

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn profile_is_member_owned_durable_and_checks_conflicts_and_images(pool: PgPool) {
    let state = test_state(None, pool);
    let store = state.store.clone();
    let workspace = store.default_workspace().await.unwrap();
    let scope = OperatorScope {
        organization_id: workspace.organization_id,
        project_id: Some(workspace.project_id),
    };
    let member = store
        .create_operator(
            scope,
            "First member",
            OperatorRole::Viewer,
            3600,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let other = store
        .create_operator(
            scope,
            "Second member",
            OperatorRole::Viewer,
            3600,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let app = router(state);
    assert_eq!(
        call(&app, Method::GET, None, Value::Null).await.0,
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(
        call(
            &app,
            Method::GET,
            Some("niu-test-admin-token-that-is-long-1234"),
            Value::Null
        )
        .await
        .0,
        StatusCode::FORBIDDEN
    );
    let (status, original) = call(&app, Method::GET, Some(&member.token), Value::Null).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(
        original["data"],
        json!({"name":"First member","email":null,"avatar_data_url":null,"revision":0})
    );
    let mut png = Cursor::new(Vec::new());
    image::DynamicImage::new_rgba8(2, 2)
        .write_to(&mut png, image::ImageFormat::Png)
        .unwrap();
    let avatar = format!(
        "data:image/png;base64,{}",
        STANDARD.encode(png.into_inner())
    );
    let (_, saved) = call(
        &app,
        Method::PUT,
        Some(&member.token),
        json!({"name":"New name","avatar_data_url":avatar,"expected_revision":0}),
    )
    .await;
    assert_eq!(saved["data"]["name"], "New name");
    assert_eq!(saved["data"]["revision"], 1);
    assert!(
        saved["data"]["avatar_data_url"]
            .as_str()
            .unwrap()
            .starts_with("data:image/png;base64,")
    );
    assert_eq!(
        call(&app, Method::GET, Some(&member.token), Value::Null)
            .await
            .1,
        saved
    );
    assert_eq!(
        call(&app, Method::GET, Some(&other.token), Value::Null)
            .await
            .1["data"]["name"],
        "Second member"
    );
    assert_eq!(
        call(
            &app,
            Method::PUT,
            Some(&member.token),
            json!({"name":"Stale name","avatar_data_url":null,"expected_revision":0})
        )
        .await
        .0,
        StatusCode::CONFLICT
    );
    assert_eq!(call(&app,Method::PUT,Some(&member.token),json!({"name":"No image","avatar_data_url":"data:image/png;base64,bm90LWFuLWltYWdl","expected_revision":1})).await.0,StatusCode::BAD_REQUEST);
    assert_eq!(call(&app,Method::PUT,Some(&member.token),json!({"name":"Target","operator_id":other.operator_id,"avatar_data_url":null,"expected_revision":1})).await.0,StatusCode::BAD_REQUEST);
    let oversized = image::DynamicImage::new_rgba8(257, 1);
    let mut png = Cursor::new(Vec::new());
    oversized
        .write_to(&mut png, image::ImageFormat::Png)
        .unwrap();
    assert_eq!(call(&app,Method::PUT,Some(&member.token),json!({"name":"Too wide","avatar_data_url":format!("data:image/png;base64,{}",STANDARD.encode(png.into_inner())),"expected_revision":1})).await.0,StatusCode::BAD_REQUEST);
    assert_eq!(
        call(
            &app,
            Method::PUT,
            Some(&member.token),
            json!({"name":"New name","avatar_data_url":null,"expected_revision":1})
        )
        .await
        .0,
        StatusCode::OK
    );
    assert!(
        call(&app, Method::GET, Some(&member.token), Value::Null)
            .await
            .1["data"]["avatar_data_url"]
            .is_null()
    );
    store
        .revoke_operator(member.operator_id, OperatorAuditActor::Installation)
        .await
        .unwrap();
    assert_eq!(
        call(&app, Method::GET, Some(&member.token), Value::Null)
            .await
            .0,
        StatusCode::UNAUTHORIZED
    );
}

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn appearance_is_member_owned_durable_and_validated(pool: PgPool) {
    let state = test_state(None, pool);
    let store = state.store.clone();
    let workspace = store.default_workspace().await.unwrap();
    let scope = OperatorScope {
        organization_id: workspace.organization_id,
        project_id: Some(workspace.project_id),
    };
    let member = store
        .create_operator(
            scope,
            "Appearance member",
            OperatorRole::Viewer,
            3600,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let other = store
        .create_operator(
            scope,
            "Other member",
            OperatorRole::Viewer,
            3600,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let app = router(state);
    let path = "/admin/v1/auth/preferences";
    assert_eq!(
        call_path(&app, Method::GET, None, Value::Null, path)
            .await
            .0,
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(
        call_path(
            &app,
            Method::GET,
            Some("niu-test-admin-token-that-is-long-1234"),
            Value::Null,
            path
        )
        .await
        .0,
        StatusCode::FORBIDDEN
    );
    assert_eq!(
        call_path(&app, Method::GET, Some(&member.token), Value::Null, path)
            .await
            .1,
        json!({"data":{"color_mode":"system"}})
    );
    for mode in ["dark", "light", "system"] {
        let (status, saved) = call_path(
            &app,
            Method::PUT,
            Some(&member.token),
            json!({"color_mode":mode}),
            path,
        )
        .await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(saved, json!({"data":{"color_mode":mode}}));
        assert_eq!(
            call_path(&app, Method::GET, Some(&member.token), Value::Null, path)
                .await
                .1,
            saved
        );
        assert_eq!(
            call(&app, Method::GET, Some(&member.token), Value::Null)
                .await
                .1["data"]["revision"],
            0
        );
    }
    assert_eq!(
        call_path(
            &app,
            Method::PUT,
            Some(&member.token),
            json!({"color_mode":"dark"}),
            path
        )
        .await
        .0,
        StatusCode::OK
    );
    assert_eq!(
        call_path(&app, Method::GET, Some(&other.token), Value::Null, path)
            .await
            .1,
        json!({"data":{"color_mode":"system"}})
    );
    for invalid in [
        json!({"color_mode":"custom"}),
        json!({"color_mode":"dark","operator_id":other.operator_id}),
        json!({}),
    ] {
        assert_eq!(
            call_path(&app, Method::PUT, Some(&member.token), invalid, path)
                .await
                .0,
            StatusCode::BAD_REQUEST
        );
    }
    assert_eq!(
        call_path(&app, Method::GET, Some(&member.token), Value::Null, path)
            .await
            .1,
        json!({"data":{"color_mode":"dark"}})
    );
    store
        .revoke_operator(member.operator_id, OperatorAuditActor::Installation)
        .await
        .unwrap();
    assert_eq!(
        call_path(&app, Method::GET, Some(&member.token), Value::Null, path)
            .await
            .0,
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(
        call_path(
            &app,
            Method::PUT,
            Some(&member.token),
            json!({"color_mode":"light"}),
            path
        )
        .await
        .0,
        StatusCode::UNAUTHORIZED
    );
}
