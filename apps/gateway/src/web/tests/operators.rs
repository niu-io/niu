use super::*;
use axum::http::Method;
use niu_storage::{OperatorAuditActor, OperatorRole, OperatorScope};

const BOOTSTRAP: &str = "niu-test-admin-token-that-is-long-1234";

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn scoped_directory_filters_before_list_limits(pool: sqlx::PgPool) {
    let state = test_state(None, pool.clone());
    let scope = state.store.default_workspace().await.unwrap();
    sqlx::query("INSERT INTO organizations (id,name,created_at) SELECT gen_random_uuid(),'earlier organization',now()-interval '1 day' FROM generate_series(1,1001)")
        .execute(&pool).await.unwrap();
    sqlx::query("INSERT INTO projects (id,organization_id,name,created_at) SELECT gen_random_uuid(),$1,'earlier project',now()-interval '1 day' FROM generate_series(1,1001)")
        .bind(scope.organization_id).execute(&pool).await.unwrap();
    let operator = state
        .store
        .create_operator(
            OperatorScope {
                organization_id: scope.organization_id,
                project_id: Some(scope.project_id),
            },
            "late project viewer",
            OperatorRole::Viewer,
            3600,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let app = router(state);
    let (status, organizations) = call(
        &app,
        Method::GET,
        "/admin/v1/organizations",
        &operator.token,
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(organizations["data"].as_array().unwrap().len(), 1);
    assert_eq!(
        organizations["data"][0]["id"],
        scope.organization_id.to_string()
    );
    let (status, projects) = call(
        &app,
        Method::GET,
        &format!("/admin/v1/organizations/{}/projects", scope.organization_id),
        &operator.token,
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(projects["data"].as_array().unwrap().len(), 1);
    assert_eq!(projects["data"][0]["id"], scope.project_id.to_string());
}

async fn call(
    app: &Router,
    method: Method,
    path: &str,
    token: &str,
    payload: Option<Value>,
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
                    payload.map(|value| value.to_string()).unwrap_or_default(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.headers()["cache-control"], "no-store");
    let status = response.status();
    let body = response.into_body().collect().await.unwrap().to_bytes();
    (
        status,
        if body.is_empty() {
            Value::Null
        } else {
            serde_json::from_slice(&body).unwrap()
        },
    )
}

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn platform_admin_session_rechecks_grants_without_expanding_customer_scope(
    pool: sqlx::PgPool,
) {
    let state = test_state(None, pool.clone());
    let scope = state.store.default_workspace().await.unwrap();
    let issued = state
        .store
        .create_operator(
            OperatorScope {
                organization_id: scope.organization_id,
                project_id: Some(scope.project_id),
            },
            "Platform administrator",
            OperatorRole::Owner,
            3600,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let app = router(state);
    assert_eq!(
        call(&app, Method::GET, "/admin/v1/vendors", &issued.token, None)
            .await
            .0,
        StatusCode::FORBIDDEN
    );
    sqlx::query("UPDATE admin_operators SET platform_admin=true WHERE id=$1")
        .bind(issued.operator_id)
        .execute(&pool)
        .await
        .unwrap();
    assert_eq!(
        call(&app, Method::GET, "/admin/v1/vendors", &issued.token, None)
            .await
            .0,
        StatusCode::OK
    );
    let (_, identity) = call(&app, Method::GET, "/admin/v1/session", &issued.token, None).await;
    assert_eq!(identity["data"]["kind"], "operator");
    assert_eq!(identity["data"]["permissions"]["platform_admin"], true);
    assert_eq!(
        identity["data"]["operator"]["project_id"],
        scope.project_id.to_string()
    );
    let (_, organizations) = call(
        &app,
        Method::GET,
        "/admin/v1/organizations",
        &issued.token,
        None,
    )
    .await;
    assert_eq!(organizations["data"].as_array().unwrap().len(), 1);
    assert_eq!(
        organizations["data"][0]["id"],
        scope.organization_id.to_string()
    );
    let foreign = format!("/admin/v1/organizations/{}/projects", Uuid::new_v4());
    assert_eq!(
        call(&app, Method::GET, &foreign, &issued.token, None)
            .await
            .0,
        StatusCode::NOT_FOUND
    );
    sqlx::query("UPDATE admin_operators SET platform_admin=false WHERE id=$1")
        .bind(issued.operator_id)
        .execute(&pool)
        .await
        .unwrap();
    assert_eq!(
        call(&app, Method::GET, "/admin/v1/vendors", &issued.token, None)
            .await
            .0,
        StatusCode::FORBIDDEN
    );
    let (_, identity) = call(&app, Method::GET, "/admin/v1/session", &issued.token, None).await;
    assert_eq!(identity["data"]["permissions"]["platform_admin"], false);
}

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn session_identity_rechecks_role_scope_expiry_and_revocation(pool: sqlx::PgPool) {
    let state = test_state(None, pool.clone());
    let store = state.store.clone();
    let scope = store.default_workspace().await.unwrap();
    let app = router(state);
    let (status, identity) = call(&app, Method::GET, "/admin/v1/session", BOOTSTRAP, None).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(identity["data"]["kind"], "installation");
    assert!(identity["data"]["operator"].is_null());
    assert_eq!(
        identity["data"]["permissions"],
        json!({"read":true,"write":true,"manage_operators":true,"platform_admin":true})
    );

    for (role, write, manage) in [
        (OperatorRole::Owner, true, true),
        (OperatorRole::Admin, true, false),
        (OperatorRole::Viewer, false, false),
    ] {
        let issued = store
            .create_operator(
                OperatorScope {
                    organization_id: scope.organization_id,
                    project_id: Some(scope.project_id),
                },
                "scoped operator",
                role,
                3600,
                OperatorAuditActor::Installation,
            )
            .await
            .unwrap();
        let (status, identity) =
            call(&app, Method::GET, "/admin/v1/session", &issued.token, None).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(identity["data"]["kind"], "operator");
        assert_eq!(
            identity["data"]["operator"]["id"],
            issued.operator_id.to_string()
        );
        assert_eq!(
            identity["data"]["operator"]["organization_id"],
            scope.organization_id.to_string()
        );
        assert_eq!(
            identity["data"]["operator"]["project_id"],
            scope.project_id.to_string()
        );
        assert_eq!(
            identity["data"]["operator"]["role"],
            serde_json::to_value(role).unwrap()
        );
        assert_eq!(
            identity["data"]["permissions"],
            json!({"read":true,"write":write,"manage_operators":manage,"platform_admin":false})
        );
        assert!(!identity.to_string().contains(&issued.token));
        store
            .revoke_operator_session(
                issued.operator_id,
                issued.session.id,
                OperatorAuditActor::Installation,
            )
            .await
            .unwrap();
        assert_eq!(
            call(&app, Method::GET, "/admin/v1/session", &issued.token, None)
                .await
                .0,
            StatusCode::UNAUTHORIZED
        );
        let expired = store
            .create_operator_session(issued.operator_id, 60, OperatorAuditActor::Installation)
            .await
            .unwrap();
        sqlx::query("UPDATE admin_sessions SET expires_at_unix=1 WHERE id=$1")
            .bind(expired.session.id)
            .execute(&pool)
            .await
            .unwrap();
        assert_eq!(
            call(&app, Method::GET, "/admin/v1/session", &expired.token, None)
                .await
                .0,
            StatusCode::UNAUTHORIZED
        );
    }
    let org_owner = store
        .create_operator(
            OperatorScope {
                organization_id: scope.organization_id,
                project_id: None,
            },
            "organization owner",
            OperatorRole::Owner,
            3600,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let (_, identity) = call(
        &app,
        Method::GET,
        "/admin/v1/session",
        &org_owner.token,
        None,
    )
    .await;
    assert!(identity["data"]["operator"]["project_id"].is_null());
    let client = store
        .issue_key(scope, "inference only", &["fast".into()], 60)
        .await
        .unwrap();
    for token in [&client.token, "invalid", ""] {
        assert_eq!(
            call(&app, Method::GET, "/admin/v1/session", token, None)
                .await
                .0,
            StatusCode::UNAUTHORIZED
        );
    }
}

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn operator_http_workflow_enforces_scope_and_revokes_sessions(pool: sqlx::PgPool) {
    let state = test_state(None, pool);
    let store = state.store.clone();
    let scope = store.default_workspace().await.unwrap();
    let sibling = store
        .create_project(scope.organization_id, "sibling")
        .await
        .unwrap();
    let foreign_org = store.create_organization("foreign").await.unwrap();
    let foreign_scope = store.create_project(foreign_org, "foreign").await.unwrap();
    let owner = store
        .create_operator(
            OperatorScope {
                organization_id: scope.organization_id,
                project_id: Some(scope.project_id),
            },
            "owner",
            OperatorRole::Owner,
            3600,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let foreign = store
        .create_operator(
            OperatorScope {
                organization_id: foreign_org,
                project_id: Some(foreign_scope.project_id),
            },
            "foreign owner",
            OperatorRole::Owner,
            3600,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let app = router(state);
    let create = |organization_id: Uuid, project_id: Option<Uuid>, role: &str| {
        json!({
            "organization_id":organization_id, "project_id":project_id,
            "name":"team member", "role":role, "expires_in_seconds":3600,
        })
    };
    for (org, project) in [
        (scope.organization_id, None),
        (scope.organization_id, Some(sibling.project_id)),
        (foreign_org, Some(foreign_scope.project_id)),
    ] {
        assert_eq!(
            call(
                &app,
                Method::POST,
                "/admin/v1/operators",
                &owner.token,
                Some(create(org, project, "owner"))
            )
            .await
            .0,
            StatusCode::NOT_FOUND
        );
    }
    let (status, created) = call(
        &app,
        Method::POST,
        "/admin/v1/operators",
        &owner.token,
        Some(create(
            scope.organization_id,
            Some(scope.project_id),
            "viewer",
        )),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED);
    let id = created["operator"]["id"].as_str().unwrap();
    let viewer_token = created["token"].as_str().unwrap();
    let base = format!("/admin/v1/operators/{id}");
    let sessions = format!("{base}/sessions");
    assert_eq!(
        call(&app, Method::GET, "/admin/v1/operators", viewer_token, None)
            .await
            .0,
        StatusCode::FORBIDDEN
    );
    let (status, listed) = call(&app, Method::GET, "/admin/v1/operators", &owner.token, None).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(listed["data"].as_array().unwrap().len(), 2);
    assert!(
        !listed
            .to_string()
            .contains(&foreign.operator_id.to_string())
    );
    assert!(!listed.to_string().contains(viewer_token));
    for role in [OperatorRole::Admin, OperatorRole::Viewer] {
        let limited = store
            .create_operator(
                OperatorScope {
                    organization_id: scope.organization_id,
                    project_id: Some(scope.project_id),
                },
                "limited role",
                role,
                3600,
                OperatorAuditActor::Installation,
            )
            .await
            .unwrap();
        for (method, path, payload) in [
            (Method::GET, "/admin/v1/operators".to_owned(), None),
            (
                Method::POST,
                "/admin/v1/operators".to_owned(),
                Some(create(
                    scope.organization_id,
                    Some(scope.project_id),
                    "owner",
                )),
            ),
            (Method::GET, sessions.clone(), None),
            (
                Method::POST,
                sessions.clone(),
                Some(json!({"expires_in_seconds":600})),
            ),
            (Method::DELETE, base.clone(), None),
        ] {
            assert_eq!(
                call(&app, method, &path, &limited.token, payload).await.0,
                StatusCode::FORBIDDEN
            );
        }
    }
    assert_eq!(
        call(
            &app,
            Method::GET,
            &format!("/admin/v1/operators/{}/sessions", foreign.operator_id),
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
            Method::DELETE,
            &format!("/admin/v1/operators/{}", foreign.operator_id),
            &owner.token,
            None
        )
        .await
        .0,
        StatusCode::NOT_FOUND
    );
    let (status, issued) = call(
        &app,
        Method::POST,
        &sessions,
        &owner.token,
        Some(json!({"expires_in_seconds":600})),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED);
    let second_token = issued["token"].as_str().unwrap();
    let (_, listed) = call(&app, Method::GET, &sessions, &owner.token, None).await;
    assert_eq!(listed["data"].as_array().unwrap().len(), 2);
    assert!(!listed.to_string().contains(second_token));
    let revoke = format!("{sessions}/{}", issued["session"]["id"].as_str().unwrap());
    assert_eq!(
        call(&app, Method::DELETE, &revoke, &owner.token, None)
            .await
            .0,
        StatusCode::NO_CONTENT
    );
    assert_eq!(
        call(&app, Method::GET, "/admin/v1/session", second_token, None)
            .await
            .0,
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(
        call(&app, Method::GET, "/admin/v1/session", viewer_token, None)
            .await
            .0,
        StatusCode::OK
    );
    assert_eq!(
        call(&app, Method::DELETE, &base, &owner.token, None)
            .await
            .0,
        StatusCode::NO_CONTENT
    );
    assert_eq!(
        call(&app, Method::GET, "/admin/v1/session", viewer_token, None)
            .await
            .0,
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(
        call(
            &app,
            Method::POST,
            &sessions,
            &owner.token,
            Some(json!({"expires_in_seconds":600}))
        )
        .await
        .0,
        StatusCode::CONFLICT
    );
}

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn workspace_key_last_use_is_reader_safe_and_not_inference_accessible(pool: sqlx::PgPool) {
    let state = test_state(None, pool.clone());
    let store = state.store.clone();
    let scope = store.default_workspace().await.unwrap();
    let other = store
        .create_project(scope.organization_id, "Private key activity")
        .await
        .unwrap();
    let key = store
        .issue_key(scope, "Observed workspace key", &["fast".into()], 3600)
        .await
        .unwrap();
    let unused = store
        .issue_key(scope, "No recorded dispatch", &["fast".into()], 3600)
        .await
        .unwrap();
    let principal = store.authenticate(&key.token).await.unwrap();
    let operation = store.create_operation(scope, "fast").await.unwrap();
    let attempt = store
        .prepare_attempt(scope, operation, "fast", "fixture")
        .await
        .unwrap();
    store.mark_dispatched(&principal, attempt).await.unwrap();
    let expected = store
        .list_keys(scope)
        .await
        .unwrap()
        .into_iter()
        .find(|item| item.id == key.id)
        .unwrap()
        .last_used_at_ms
        .unwrap();
    let reader = store
        .create_operator(
            OperatorScope {
                organization_id: scope.organization_id,
                project_id: Some(scope.project_id),
            },
            "Workspace activity reader",
            OperatorRole::Viewer,
            3600,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let app = router(state);
    let path = format!(
        "/admin/v1/organizations/{}/projects/{}/keys",
        scope.organization_id, scope.project_id
    );
    let (status, body) = call(&app, Method::GET, &path, &reader.token, None).await;
    assert_eq!(status, StatusCode::OK);
    let keys = body["data"].as_array().unwrap();
    assert_eq!(keys.len(), 2);
    let observed = keys
        .iter()
        .find(|item| item["id"] == key.id.to_string())
        .unwrap();
    assert_eq!(observed["last_used_at_ms"], expected);
    assert_eq!(observed["name"], "Observed workspace key");
    assert!(
        keys.iter()
            .find(|item| item["id"] == unused.id.to_string())
            .unwrap()["last_used_at_ms"]
            .is_null()
    );
    for item in keys {
        let actual = item
            .as_object()
            .unwrap()
            .keys()
            .map(String::as_str)
            .collect::<std::collections::BTreeSet<_>>();
        let expected = [
            "id",
            "revision",
            "name",
            "allowed_models",
            "expires_at_ms",
            "last_used_at_ms",
            "revoked",
            "expired",
        ]
        .into_iter()
        .collect::<std::collections::BTreeSet<_>>();
        assert_eq!(actual, expected);
        assert_eq!(item["revision"], 1);
        assert!(item.get("token").is_none());
        assert!(item.get("token_hash").is_none());
        assert!(item.get("supplier_cost").is_none());
    }
    assert!(!body.to_string().contains(&key.token));
    assert!(!body.to_string().contains(&reader.token));
    assert_eq!(
        call(&app, Method::GET, &path, &key.token, None).await.0,
        StatusCode::UNAUTHORIZED
    );
    let foreign = format!(
        "/admin/v1/organizations/{}/projects/{}/keys",
        other.organization_id, other.project_id
    );
    assert_eq!(
        call(&app, Method::GET, &foreign, &reader.token, None)
            .await
            .0,
        StatusCode::NOT_FOUND
    );
}
