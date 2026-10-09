use super::*;
use axum::body::{Body, to_bytes};
use axum::http::Method;
use niu_storage::{OperatorAuditActor, OperatorRole, OperatorScope};

const ADMIN: &str = "niu-test-admin-token-that-is-long-1234";

async fn request(
    app: &Router,
    method: Method,
    path: &str,
    token: Option<&str>,
    origin: Option<&str>,
    body: Value,
) -> (StatusCode, HeaderMap, Value) {
    let mut request = Request::builder()
        .method(method)
        .uri(path)
        .header("content-type", "application/json");
    if let Some(token) = token {
        request = request.header("authorization", format!("Bearer {token}"));
    }
    if let Some(origin) = origin {
        request = request.header("origin", origin);
    }
    let response = app
        .clone()
        .oneshot(request.body(Body::from(body.to_string())).unwrap())
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
async fn password_api_issues_scoped_sessions_and_reset_revokes_them(pool: PgPool) {
    let mut state = test_state(None, pool.clone());
    state.password_auth = Some(Arc::new(
        crate::admin::passwords::Runtime::new("https://niu.example.test")
            .await
            .unwrap(),
    ));
    let store = state.store.clone();
    let scope = store.default_workspace().await.unwrap();
    let member = store
        .create_operator(
            OperatorScope {
                organization_id: scope.organization_id,
                project_id: Some(scope.project_id),
            },
            "Password viewer",
            OperatorRole::Viewer,
            3600,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let app = router(state.clone());
    let path = format!("/admin/v1/operators/{}/password", member.operator_id);
    let foreign_organization = Uuid::new_v4();
    sqlx::query("INSERT INTO organizations(id,name) VALUES($1,'Foreign password organization')")
        .bind(foreign_organization)
        .execute(&pool)
        .await
        .unwrap();
    let foreign_owner = store
        .create_operator(
            OperatorScope {
                organization_id: foreign_organization,
                project_id: None,
            },
            "Foreign owner",
            OperatorRole::Owner,
            3600,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let provision = json!({"email":"Member@Example.test","password":"synthetic first passphrase"});
    assert_eq!(
        request(
            &app,
            Method::PUT,
            &path,
            Some(&foreign_owner.token),
            None,
            provision.clone()
        )
        .await
        .0,
        StatusCode::NOT_FOUND
    );
    assert_eq!(
        request(
            &app,
            Method::PUT,
            &path,
            Some(&member.token),
            None,
            provision.clone()
        )
        .await
        .0,
        StatusCode::FORBIDDEN
    );
    assert_eq!(
        request(
            &app,
            Method::PUT,
            &path,
            Some(ADMIN),
            Some("https://foreign.example.test"),
            provision.clone()
        )
        .await
        .0,
        StatusCode::FORBIDDEN
    );
    let (status, headers, body) =
        request(&app, Method::PUT, &path, Some(ADMIN), None, provision).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(headers["cache-control"], "no-store");
    assert_eq!(body, json!({"revision":1}));
    let wrong = request(
        &app,
        Method::POST,
        "/admin/v1/auth/login",
        None,
        None,
        json!({"email":"member@example.test","password":"synthetic wrong passphrase"}),
    )
    .await;
    let unknown = request(
        &app,
        Method::POST,
        "/admin/v1/auth/login",
        None,
        None,
        json!({"email":"unknown@example.test","password":"synthetic wrong passphrase"}),
    )
    .await;
    assert_eq!(wrong.0, StatusCode::UNAUTHORIZED);
    assert_eq!(unknown.0, wrong.0);
    assert_eq!(unknown.2, wrong.2);
    assert_eq!(wrong.1["cache-control"], "no-store");
    let login = json!({"email":"MEMBER@example.test","password":"synthetic first passphrase"});
    let (status, headers, logged_in) = request(
        &app,
        Method::POST,
        "/admin/v1/auth/login",
        None,
        Some("https://niu.example.test"),
        login,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(headers["cache-control"], "no-store");
    let token = logged_in["token"].as_str().unwrap();
    let principal = store.authenticate_operator(token).await.unwrap();
    assert_eq!(principal.role, OperatorRole::Viewer);
    assert_eq!(principal.scope.project_id, Some(scope.project_id));
    assert_eq!(
        request(
            &app,
            Method::GET,
            "/admin/v1/session",
            Some(token),
            None,
            Value::Null
        )
        .await
        .0,
        StatusCode::OK
    );
    assert_eq!(request(&app, Method::PUT, &path, Some(token), None, json!({"email":"member@example.test","password":"synthetic second passphrase","expected_revision":1})).await.0, StatusCode::FORBIDDEN);
    let reset = json!({"email":"member@example.test","password":"synthetic second passphrase","expected_revision":1});
    assert_eq!(
        request(&app, Method::PUT, &path, Some(ADMIN), None, reset)
            .await
            .0,
        StatusCode::OK
    );
    let reopened = router(state);
    assert_eq!(
        request(
            &reopened,
            Method::GET,
            "/admin/v1/session",
            Some(token),
            None,
            Value::Null
        )
        .await
        .0,
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(
        request(
            &reopened,
            Method::POST,
            "/admin/v1/auth/login",
            None,
            None,
            json!({"email":"member@example.test","password":"synthetic second passphrase"})
        )
        .await
        .0,
        StatusCode::OK
    );
    assert_eq!(
        sqlx::query_scalar::<_, i64>("SELECT count(*) FROM attempts")
            .fetch_one(&pool)
            .await
            .unwrap(),
        0
    );
}

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn password_api_is_opt_in_and_limits_unknown_identity_retries(pool: PgPool) {
    let mut state = test_state(None, pool.clone());
    let disabled = router(state.clone());
    let login = json!({"email":"unknown@example.test","password":"synthetic private passphrase"});
    let result = request(
        &disabled,
        Method::POST,
        "/admin/v1/auth/login",
        None,
        None,
        login.clone(),
    )
    .await;
    assert_eq!(result.0, StatusCode::NOT_IMPLEMENTED);
    assert_eq!(result.1["cache-control"], "no-store");
    for invalid in [
        "http://niu.example.test",
        "https://user:secret@niu.example.test",
        "https://niu.example.test/path",
        "https://niu.example.test/?query=1",
    ] {
        assert!(
            crate::admin::passwords::Runtime::new(invalid)
                .await
                .is_err()
        );
    }
    state.password_auth = Some(Arc::new(
        crate::admin::passwords::Runtime::new("https://niu.example.test")
            .await
            .unwrap(),
    ));
    let app = router(state.clone());
    assert_eq!(
        request(
            &app,
            Method::POST,
            "/admin/v1/auth/login",
            None,
            Some("https://foreign.example.test"),
            login.clone()
        )
        .await
        .0,
        StatusCode::FORBIDDEN
    );
    for _ in 0..5 {
        let result = request(
            &app,
            Method::POST,
            "/admin/v1/auth/login",
            None,
            None,
            login.clone(),
        )
        .await;
        assert_eq!(result.0, StatusCode::UNAUTHORIZED);
        assert!(!result.2.to_string().contains("private passphrase"));
    }
    let reopened = router(state);
    let result = request(
        &reopened,
        Method::POST,
        "/admin/v1/auth/login",
        None,
        None,
        login,
    )
    .await;
    assert_eq!(result.0, StatusCode::TOO_MANY_REQUESTS);
    assert_eq!(result.1["retry-after"], "60");
    assert_eq!(result.1["cache-control"], "no-store");
}

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn member_sign_out_revokes_only_current_session_and_survives_reopening(pool: PgPool) {
    assert!(
        crate::admin::passwords::Runtime::from_setting("")
            .await
            .unwrap()
            .is_none()
    );
    assert!(
        crate::admin::passwords::Runtime::from_setting(" ")
            .await
            .is_err()
    );
    let state = test_state(None, pool.clone());
    let store = state.store.clone();
    let workspace = store.default_workspace().await.unwrap();
    let scope = OperatorScope {
        organization_id: workspace.organization_id,
        project_id: Some(workspace.project_id),
    };
    let first = store
        .create_operator(
            scope,
            "Sign-out viewer",
            OperatorRole::Viewer,
            3600,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let second = store
        .create_operator_session(first.operator_id, 3600, OperatorAuditActor::Installation)
        .await
        .unwrap();
    let other = store
        .create_operator(
            scope,
            "Other viewer",
            OperatorRole::Viewer,
            3600,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let app = router(state);
    let (status, headers, body) = request(
        &app,
        Method::POST,
        "/admin/v1/auth/logout",
        Some(&first.token),
        None,
        Value::Null,
    )
    .await;
    assert_eq!(status, StatusCode::NO_CONTENT);
    assert_eq!(headers["cache-control"], "no-store");
    assert_eq!(body, Value::Null);
    let reopened = router(test_state(None, pool.clone()));
    assert!(store.authenticate_operator(&first.token).await.is_err());
    assert!(store.authenticate_operator(&second.token).await.is_ok());
    assert!(store.authenticate_operator(&other.token).await.is_ok());
    for token in [
        None,
        Some(first.token.as_str()),
        Some(ADMIN),
        Some("invalid"),
    ] {
        assert_eq!(
            request(
                &reopened,
                Method::POST,
                "/admin/v1/auth/logout",
                token,
                None,
                Value::Null
            )
            .await
            .0,
            StatusCode::UNAUTHORIZED
        );
    }
    let count: i64 = sqlx::query_scalar("SELECT count(*) FROM operator_audit_events WHERE action='session_revoked' AND target_operator_id=$1 AND target_session_id=$2 AND actor_operator_id=$1")
        .bind(first.operator_id).bind(first.session.id).fetch_one(&pool).await.unwrap();
    assert_eq!(count, 1);
    sqlx::query("UPDATE admin_sessions SET expires_at_unix=1 WHERE id=$1")
        .bind(second.session.id)
        .execute(&pool)
        .await
        .unwrap();
    assert_eq!(
        request(
            &reopened,
            Method::POST,
            "/admin/v1/auth/logout",
            Some(&second.token),
            None,
            Value::Null
        )
        .await
        .0,
        StatusCode::UNAUTHORIZED
    );
}

async fn cookie_request(
    app: &Router,
    method: Method,
    path: &str,
    cookie: &str,
    origin: Option<&str>,
    site: Option<&str>,
) -> (StatusCode, HeaderMap, Value) {
    let mut builder = Request::builder()
        .method(method)
        .uri(path)
        .header("cookie", cookie);
    if let Some(origin) = origin {
        builder = builder.header("origin", origin);
    }
    if let Some(site) = site {
        builder = builder.header("sec-fetch-site", site);
    }
    let response = app
        .clone()
        .oneshot(builder.body(Body::empty()).unwrap())
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
async fn browser_sessions_are_scoped_http_only_origin_checked_and_durably_revoked(pool: PgPool) {
    let mut state = test_state(None, pool.clone());
    state.password_auth = Some(Arc::new(
        crate::admin::passwords::Runtime::new("https://niu.example.test")
            .await
            .unwrap(),
    ));
    let store = state.store.clone();
    let workspace = store.default_workspace().await.unwrap();
    let member = store
        .create_operator(
            OperatorScope {
                organization_id: workspace.organization_id,
                project_id: Some(workspace.project_id),
            },
            "Browser viewer",
            OperatorRole::Viewer,
            3600,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    store
        .set_member_password(
            member.operator_id,
            "browser@example.test",
            &niu_storage::passwords::hash_password("synthetic browser passphrase").unwrap(),
            None,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let app = router(state.clone());
    let (config_status, config_headers, config_body) = request(
        &app,
        Method::GET,
        "/admin/v1/auth/config",
        None,
        None,
        Value::Null,
    )
    .await;
    assert_eq!(config_status, StatusCode::OK);
    assert_eq!(config_headers["cache-control"], "no-store");
    assert_eq!(config_body, json!({"password_login":true}));
    let input = json!({"email":"browser@example.test","password":"synthetic browser passphrase"});
    for origin in [None, Some("https://hostile.example")] {
        assert_eq!(
            request(
                &app,
                Method::POST,
                "/admin/v1/auth/browser/login",
                None,
                origin,
                input.clone()
            )
            .await
            .0,
            StatusCode::FORBIDDEN
        );
    }
    let (status, headers, body) = request(
        &app,
        Method::POST,
        "/admin/v1/auth/browser/login",
        None,
        Some("https://niu.example.test"),
        input,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(headers["cache-control"], "no-store");
    assert!(body.get("token").is_none());
    assert_eq!(
        body["session"]["operator_id"],
        member.operator_id.to_string()
    );
    let set_cookie = headers["set-cookie"].to_str().unwrap();
    for attribute in [
        "Path=/",
        "Secure",
        "HttpOnly",
        "SameSite=Lax",
        "Max-Age=28800",
    ] {
        assert!(set_cookie.contains(attribute));
    }
    let cookie = set_cookie.split(';').next().unwrap();
    for (present_cookie, bearer, expected) in [
        (cookie, "niu-browser-member-session", StatusCode::OK),
        ("", "niu-browser-member-session", StatusCode::UNAUTHORIZED),
        (cookie, "invalid-explicit-bearer", StatusCode::UNAUTHORIZED),
    ] {
        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/admin/v1/session")
                    .header("cookie", present_cookie)
                    .header("sec-fetch-site", "same-origin")
                    .header("authorization", format!("Bearer {bearer}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), expected);
        assert_eq!(response.headers()["cache-control"], "no-store");
    }
    for (origin, site) in [
        (None, None),
        (None, Some("cross-site")),
        (Some("https://hostile.example"), Some("same-origin")),
    ] {
        assert_eq!(
            cookie_request(&app, Method::GET, "/admin/v1/session", cookie, origin, site)
                .await
                .0,
            StatusCode::FORBIDDEN
        );
    }
    let (status, _, principal) = cookie_request(
        &app,
        Method::GET,
        "/admin/v1/session",
        cookie,
        None,
        Some("same-origin"),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(principal["data"]["kind"], "operator");
    assert_eq!(principal["data"]["operator"]["role"], "viewer");
    assert_eq!(principal["data"]["permissions"]["manage_operators"], false);
    assert_eq!(
        cookie_request(
            &app,
            Method::GET,
            "/admin/v1/session",
            &format!("{cookie}; {cookie}"),
            None,
            Some("same-origin")
        )
        .await
        .0,
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(
        cookie_request(
            &app,
            Method::GET,
            "/admin/v1/session",
            &format!("__Host-niu_member_session={ADMIN}"),
            None,
            Some("same-origin")
        )
        .await
        .0,
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(
        cookie_request(
            &app,
            Method::POST,
            "/admin/v1/auth/browser/logout",
            cookie,
            None,
            Some("same-origin")
        )
        .await
        .0,
        StatusCode::FORBIDDEN
    );
    assert_eq!(
        cookie_request(
            &app,
            Method::GET,
            "/admin/v1/session",
            cookie,
            None,
            Some("same-origin")
        )
        .await
        .0,
        StatusCode::OK
    );
    for site in ["cross-site", "same-site", "none", "invalid"] {
        assert_eq!(
            cookie_request(
                &app,
                Method::GET,
                "/admin/v1/session",
                cookie,
                Some("https://niu.example.test"),
                Some(site)
            )
            .await
            .0,
            StatusCode::FORBIDDEN
        );
        assert_eq!(
            cookie_request(
                &app,
                Method::POST,
                "/admin/v1/auth/browser/logout",
                cookie,
                Some("https://niu.example.test"),
                Some(site)
            )
            .await
            .0,
            StatusCode::FORBIDDEN
        );
    }
    for header_name in ["authorization", "origin", "sec-fetch-site"] {
        let mut builder = Request::builder()
            .uri("/admin/v1/session")
            .header("cookie", cookie)
            .header("origin", "https://niu.example.test")
            .header("sec-fetch-site", "same-origin")
            .header("authorization", "Bearer niu-browser-member-session");
        builder = builder.header(
            header_name,
            match header_name {
                "authorization" => "Bearer invalid",
                "origin" => "https://niu.example.test",
                _ => "same-origin",
            },
        );
        let response = app
            .clone()
            .oneshot(builder.body(Body::empty()).unwrap())
            .await
            .unwrap();
        assert_eq!(
            response.status(),
            if header_name == "authorization" {
                StatusCode::UNAUTHORIZED
            } else {
                StatusCode::FORBIDDEN
            }
        );
    }
    sqlx::query("CREATE FUNCTION reject_signout_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='session_revoked' THEN RAISE EXCEPTION 'synthetic signout audit failure'; END IF; RETURN NEW; END $$")
        .execute(&pool).await.unwrap();
    sqlx::query("CREATE TRIGGER reject_signout_audit BEFORE INSERT ON operator_audit_events FOR EACH ROW EXECUTE FUNCTION reject_signout_audit()")
        .execute(&pool).await.unwrap();
    let (failed, failed_headers, failed_body) = cookie_request(
        &app,
        Method::POST,
        "/admin/v1/auth/browser/logout",
        cookie,
        Some("https://niu.example.test"),
        None,
    )
    .await;
    assert_eq!(failed, StatusCode::SERVICE_UNAVAILABLE);
    assert_eq!(failed_headers["cache-control"], "no-store");
    assert!(!failed_headers.contains_key("set-cookie"));
    assert!(
        !failed_body
            .to_string()
            .contains("synthetic signout audit failure")
    );
    assert_eq!(
        cookie_request(
            &app,
            Method::GET,
            "/admin/v1/session",
            cookie,
            None,
            Some("same-origin")
        )
        .await
        .0,
        StatusCode::OK
    );
    sqlx::query("DROP TRIGGER reject_signout_audit ON operator_audit_events")
        .execute(&pool)
        .await
        .unwrap();
    let (status, headers, _) = cookie_request(
        &app,
        Method::POST,
        "/admin/v1/auth/browser/logout",
        cookie,
        Some("https://niu.example.test"),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::NO_CONTENT);
    assert!(
        headers["set-cookie"]
            .to_str()
            .unwrap()
            .contains("Max-Age=0")
    );
    let reopened = router(state);
    assert_eq!(
        cookie_request(
            &reopened,
            Method::GET,
            "/admin/v1/session",
            cookie,
            None,
            Some("same-origin")
        )
        .await
        .0,
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(
        cookie_request(
            &reopened,
            Method::POST,
            "/admin/v1/auth/browser/logout",
            cookie,
            Some("https://niu.example.test"),
            None
        )
        .await
        .0,
        StatusCode::NO_CONTENT
    );
}

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn viewer_password_change_requires_current_proof_and_revokes_only_own_sessions(pool: PgPool) {
    let mut state = test_state(None, pool.clone());
    state.password_auth = Some(Arc::new(
        crate::admin::passwords::Runtime::new("https://niu.example.test")
            .await
            .unwrap(),
    ));
    let store = state.store.clone();
    let workspace = store.default_workspace().await.unwrap();
    let scope = OperatorScope {
        organization_id: workspace.organization_id,
        project_id: Some(workspace.project_id),
    };
    let member = store
        .create_operator(
            scope,
            "Self-service viewer",
            OperatorRole::Viewer,
            3600,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let other = store
        .create_operator(
            scope,
            "Unchanged viewer",
            OperatorRole::Viewer,
            3600,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    store
        .set_member_password(
            member.operator_id,
            "self@example.test",
            &niu_storage::passwords::hash_password("synthetic current passphrase").unwrap(),
            None,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let verified = store
        .member_password_credential("self@example.test")
        .await
        .unwrap()
        .unwrap()
        .verify("synthetic current passphrase")
        .unwrap();
    let stale = store
        .member_password_credential("self@example.test")
        .await
        .unwrap()
        .unwrap()
        .verify("synthetic current passphrase")
        .unwrap();
    let current = store.issue_password_login_session(verified).await.unwrap();
    let second = store
        .create_operator_session(member.operator_id, 3600, OperatorAuditActor::Installation)
        .await
        .unwrap();
    let app = router(state);
    let good = json!({"current_password":"synthetic current passphrase","password":"synthetic replacement passphrase"});
    assert_eq!(
        request(
            &app,
            Method::PUT,
            "/admin/v1/auth/password",
            Some(ADMIN),
            None,
            good.clone()
        )
        .await
        .0,
        StatusCode::FORBIDDEN
    );
    for (body, expected) in [
        (
            json!({"current_password":"wrong","password":"synthetic replacement passphrase"}),
            StatusCode::UNAUTHORIZED,
        ),
        (
            json!({"current_password":"synthetic current passphrase","password":"short"}),
            StatusCode::BAD_REQUEST,
        ),
        (
            json!({"current_password":"synthetic current passphrase","password":"synthetic replacement passphrase","operator_id":other.operator_id}),
            StatusCode::BAD_REQUEST,
        ),
    ] {
        assert_eq!(
            request(
                &app,
                Method::PUT,
                "/admin/v1/auth/password",
                Some(&current.token),
                None,
                body
            )
            .await
            .0,
            expected
        );
        assert!(store.authenticate_operator(&current.token).await.is_ok());
        assert!(store.authenticate_operator(&second.token).await.is_ok());
    }
    let (status, headers, body) = request(
        &app,
        Method::PUT,
        "/admin/v1/auth/password",
        Some(&current.token),
        None,
        good,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(headers["cache-control"], "no-store");
    assert_eq!(body, json!({"revision":2,"sign_in_required":true}));
    assert!(!headers.contains_key("set-cookie"));
    assert!(store.authenticate_operator(&current.token).await.is_err());
    assert!(store.authenticate_operator(&second.token).await.is_err());
    assert!(store.authenticate_operator(&other.token).await.is_ok());
    assert!(matches!(
        store
            .change_verified_member_password(
                stale,
                &niu_storage::passwords::hash_password("synthetic stale replacement").unwrap()
            )
            .await,
        Err(niu_storage::StoreError::Conflict)
    ));
    assert!(
        store
            .member_password_credential("self@example.test")
            .await
            .unwrap()
            .unwrap()
            .verify("synthetic current passphrase")
            .is_none()
    );
    let (status, _, body) = request(
        &app,
        Method::POST,
        "/admin/v1/auth/login",
        None,
        None,
        json!({"email":"self@example.test","password":"synthetic replacement passphrase"}),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert!(
        store
            .authenticate_operator(body["token"].as_str().unwrap())
            .await
            .is_ok()
    );
    let own_changes: i64 = sqlx::query_scalar("SELECT count(*) FROM operator_audit_events WHERE action='password_changed' AND actor_operator_id=$1 AND target_operator_id=$1")
        .bind(member.operator_id).fetch_one(&pool).await.unwrap();
    assert_eq!(own_changes, 1);
    sqlx::query(
        "UPDATE password_login_admission SET window_start=clock_timestamp()-interval '2 minutes'",
    )
    .execute(&pool)
    .await
    .unwrap();
    let (_, browser_headers, _) = request(
        &app,
        Method::POST,
        "/admin/v1/auth/browser/login",
        None,
        Some("https://niu.example.test"),
        json!({"email":"self@example.test","password":"synthetic replacement passphrase"}),
    )
    .await;
    let cookie = browser_headers["set-cookie"]
        .to_str()
        .unwrap()
        .split(';')
        .next()
        .unwrap();
    for origin in [
        None,
        Some("https://hostile.example"),
        Some("https://niu.example.test"),
    ] {
        let mut builder = Request::builder()
            .method(Method::PUT)
            .uri("/admin/v1/auth/password")
            .header("cookie", cookie)
            .header("sec-fetch-site", "same-origin")
            .header("content-type", "application/json");
        if let Some(origin) = origin {
            builder = builder.header("origin", origin);
        }
        let response = app.clone().oneshot(builder.body(Body::from(json!({"current_password":"synthetic replacement passphrase","password":"synthetic final passphrase"}).to_string())).unwrap()).await.unwrap();
        if origin == Some("https://niu.example.test") {
            assert_eq!(response.status(), StatusCode::OK);
            assert!(
                response.headers()["set-cookie"]
                    .to_str()
                    .unwrap()
                    .contains("Max-Age=0")
            );
        } else {
            assert_eq!(response.status(), StatusCode::FORBIDDEN);
            assert!(!response.headers().contains_key("set-cookie"));
        }
    }
    assert!(
        store
            .authenticate_operator(body["token"].as_str().unwrap())
            .await
            .is_err()
    );
    assert!(store.authenticate_operator(&other.token).await.is_ok());
    assert!(
        store
            .member_password_credential("self@example.test")
            .await
            .unwrap()
            .unwrap()
            .verify("synthetic final passphrase")
            .is_some()
    );
}
