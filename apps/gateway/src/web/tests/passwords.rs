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
    let read_path = format!("/api/v1/operators/{}/password", member.operator_id);
    let read = request(
        &app,
        Method::GET,
        &read_path,
        Some(ADMIN),
        None,
        Value::Null,
    )
    .await;
    assert_eq!(read.0, StatusCode::OK);
    assert_eq!(read.1["cache-control"], "no-store");
    assert_eq!(
        read.2,
        json!({"configured":false,"email":null,"revision":null})
    );
    for (credential, expected) in [
        (None, StatusCode::UNAUTHORIZED),
        (Some(foreign_owner.token.as_str()), StatusCode::NOT_FOUND),
        (Some(member.token.as_str()), StatusCode::FORBIDDEN),
    ] {
        let denied = request(&app, Method::GET, &read_path, credential, None, Value::Null).await;
        assert_eq!(denied.0, expected);
        assert_eq!(denied.1["cache-control"], "no-store");
        assert!(denied.2.get("email").is_none());
    }
    let missing = format!("/api/v1/operators/{}/password", Uuid::new_v4());
    assert_eq!(
        request(&app, Method::GET, &missing, Some(ADMIN), None, Value::Null)
            .await
            .0,
        StatusCode::NOT_FOUND
    );
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
    let read = request(
        &app,
        Method::GET,
        &read_path,
        Some(ADMIN),
        None,
        Value::Null,
    )
    .await;
    assert_eq!(
        read.2,
        json!({"configured":true,"email":"member@example.test","revision":1})
    );
    // A saved binding remains inspectable while browser password auth is disabled.
    let mut disabled_state = state.clone();
    disabled_state.password_auth = None;
    assert_eq!(
        request(
            &router(disabled_state),
            Method::GET,
            &read_path,
            Some(ADMIN),
            None,
            Value::Null
        )
        .await
        .2,
        read.2
    );

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
            &read_path,
            Some(ADMIN),
            None,
            Value::Null
        )
        .await
        .2,
        json!({"configured":true,"email":"member@example.test","revision":2})
    );
    // An old expected revision never silently overwrites a newer password.
    assert_eq!(request(&reopened, Method::PUT, &path, Some(ADMIN), None,
        json!({"email":"member@example.test","password":"synthetic stale passphrase","expected_revision":1})).await.0,
        StatusCode::CONFLICT);

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
    assert_eq!(config_body["password_login"], true);
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

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn customer_console_provisioning_handoff_preserves_company_isolation(pool: PgPool) {
    let captured = Captured::default();
    let upstream = Router::new()
        .route("/v1/chat/completions", post(provider))
        .with_state(captured.clone());
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let upstream_task = tokio::spawn(async move { axum::serve(listener, upstream).await.unwrap() });
    let mut state = test_state(Some(format!("http://{address}/v1")), pool.clone());
    Arc::make_mut(&mut state.config).models.clear();
    let cipher = Arc::new(
        crate::vendors::crypto::CredentialCipher::new(
            "customer-handoff-fixture-master-key-1234567890",
        )
        .unwrap(),
    );
    state.vendor_cipher = Some(cipher.clone());
    state
        .store
        .configure_platform_currency("USD")
        .await
        .unwrap();
    crate::payments::readiness::configure_test_gateway(&mut state).await;
    state.password_auth = Some(Arc::new(
        crate::admin::passwords::Runtime::new("https://niu.example.test")
            .await
            .unwrap(),
    ));
    let original = state.store.default_workspace().await.unwrap();
    let store = state.store.clone();
    // Use the same registered, qualified supply required by platform pricing.
    let vendor_id = Uuid::new_v4();
    let vendor = store
        .create_vendor(niu_storage::VendorInput {
            id: vendor_id,
            name: "Customer handoff Provider key".into(),
            adapter: "openai".into(),
            api_base: format!("http://{address}/v1"),
            enabled: true,
            credential_ciphertext: cipher.seal(vendor_id, "provider-secret-token").unwrap(),
        })
        .await
        .unwrap();
    let supplier = store
        .create_provider_business("Customer handoff Provider")
        .await
        .unwrap();
    store
        .associate_vendor_supplier(vendor_id, supplier, vendor.revision)
        .await
        .unwrap();
    store.upsert_vendor_model(vendor_id, niu_storage::VendorModelInput {
        alias: "fast".into(), upstream_model: "provider-secret-model".into(), enabled: true,
        public_catalog: true, capabilities: json!({}), expected_revision: None,
        pricing: Some(json!({"currency":"USD","api_prompt_rate":2000000,"api_completion_rate":4000000,"cash_prompt_rate":1000000,"cash_completion_rate":2000000,"max_input_tokens":64,"max_output_tokens":10})),
    }).await.unwrap();
    let offer_revision = store
        .publish_provider_offer(
            supplier,
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
    let offer: Uuid = sqlx::query_scalar(
        "SELECT id FROM provider_offers WHERE provider_id=$1 AND model_alias='fast'",
    )
    .bind(supplier)
    .fetch_one(&pool)
    .await
    .unwrap();
    let expiry = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as i64
        + 3600000;
    store
        .qualify_provider_business(
            supplier,
            &niu_storage::ProviderQualificationInput {
                supply_rights_sha256: "a".repeat(64),
                supply_capability_sha256: "b".repeat(64),
                data_handling_sha256: "c".repeat(64),
                valid_until_ms: expiry,
            },
        )
        .await
        .unwrap();
    store
        .qualify_provider_offer(
            supplier,
            offer,
            &niu_storage::ProviderOfferQualificationInput {
                rate_revision: offer_revision,
                model_identity_sha256: "d".repeat(64),
                protocol_matrix_sha256: "e".repeat(64),
                protocol_matrix_version: "chat-fixture-v1".into(),
                data_handling_sha256: "f".repeat(64),
                availability_sha256: "1".repeat(64),
                agreed_rates_sha256: "2".repeat(64),
                valid_until_ms: expiry,
            },
        )
        .await
        .unwrap();
    let manager = store
        .create_operator(
            niu_storage::OperatorScope {
                organization_id: original.organization_id,
                project_id: None,
            },
            "Handoff supply manager",
            niu_storage::OperatorRole::Owner,
            3600,
            niu_storage::OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    store
        .set_provider_member(supplier, manager.operator_id, "manager", true)
        .await
        .unwrap();
    store
        .set_provider_offer_active(supplier, offer, manager.operator_id, true)
        .await
        .unwrap();
    let app = router(state);
    async fn create(app: &Router, path: &str, key: &str, body: Value) -> Value {
        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(path)
                    .header("authorization", format!("Bearer {ADMIN}"))
                    .header("content-type", "application/json")
                    .header("idempotency-key", key)
                    .body(Body::from(body.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        let status = response.status();
        let bytes = to_bytes(response.into_body(), 65536).await.unwrap();
        assert_eq!(
            status,
            StatusCode::CREATED,
            "{}",
            String::from_utf8_lossy(&bytes)
        );
        serde_json::from_slice(&bytes).unwrap()
    }
    let company = create(
        &app,
        "/api/v1/organizations",
        "customer-handoff-company",
        json!({"name":"Separate customer"}),
    )
    .await;
    let workspace = create(&app, "/api/v1/workspaces", "customer-handoff-workspace", json!({"organization_id":company["id"],"name":"Customer workspace","slug":"customer-workspace"})).await;
    let input = json!({"organization_id":company["id"],"project_id":null,"name":"Customer owner","role":"owner","issue_session":false});
    let owner = create(
        &app,
        "/api/v1/operators",
        "customer-handoff-owner",
        input.clone(),
    )
    .await;
    assert_eq!(
        owner,
        create(&app, "/api/v1/operators", "customer-handoff-owner", input).await
    );
    assert!(owner["token"].is_null());
    let password_path = format!(
        "/api/v1/operators/{}/password",
        owner["operator"]["id"].as_str().unwrap()
    );
    assert_eq!(request(&app, Method::PUT, &password_path, Some(ADMIN), None,
        json!({"email":"customer@example.test","password":"synthetic customer handoff password","expected_revision":null})).await.0, StatusCode::OK);
    let login = request(
        &app,
        Method::POST,
        "/api/v1/auth/login",
        None,
        Some("https://niu.example.test"),
        json!({"email":"customer@example.test","password":"synthetic customer handoff password"}),
    )
    .await;
    assert_eq!(login.0, StatusCode::OK);
    let token = login.2["token"].as_str().unwrap();
    let principal = store.authenticate_operator(token).await.unwrap();
    assert_eq!(principal.role, OperatorRole::Owner);
    assert_eq!(
        principal.scope.organization_id.to_string(),
        company["id"].as_str().unwrap()
    );
    assert_eq!(principal.scope.project_id, None);
    let companies = request(
        &app,
        Method::GET,
        "/api/v1/organizations",
        Some(token),
        None,
        Value::Null,
    )
    .await;
    assert_eq!(companies.0, StatusCode::OK);
    assert_eq!(companies.2["data"].as_array().unwrap().len(), 1);
    assert_eq!(companies.2["data"][0]["id"], company["id"]);
    let workspaces = request(
        &app,
        Method::GET,
        "/api/v1/workspaces",
        Some(token),
        None,
        Value::Null,
    )
    .await;
    assert_eq!(workspaces.0, StatusCode::OK);
    assert_eq!(workspaces.2["data"].as_array().unwrap().len(), 1);
    assert_eq!(workspaces.2["data"][0]["id"], workspace["id"]);
    let foreign_users = format!(
        "/api/v1/operators?organization_id={}",
        original.organization_id
    );
    assert_eq!(
        request(
            &app,
            Method::GET,
            &foreign_users,
            Some(token),
            None,
            Value::Null
        )
        .await
        .0,
        StatusCode::NOT_FOUND
    );
    assert_eq!(
        request(
            &app,
            Method::POST,
            "/api/v1/setup/default-workspace",
            Some(token),
            None,
            json!({})
        )
        .await
        .0,
        StatusCode::FORBIDDEN
    );
    let self_created = request(
        &app,
        Method::POST,
        "/api/v1/organizations",
        Some(token),
        None,
        json!({"name":"Independent customer"}),
    )
    .await;
    assert_eq!(self_created.0, StatusCode::CREATED, "{}", self_created.2);
    assert_eq!(self_created.2["slug"], "independent-customer");
    assert_ne!(self_created.2["id"], company["id"]);
    let scope = niu_storage::TenantScope {
        organization_id: Uuid::parse_str(company["id"].as_str().unwrap()).unwrap(),
        project_id: Uuid::parse_str(workspace["id"].as_str().unwrap()).unwrap(),
    };
    store.create_budget(scope, "USD", 1000).await.unwrap();
    store
        .publish_retail_standard(
            niu_storage::RetailStandardPublication {
                model_alias: "fast".into(),
                currency: "USD".into(),
                schedule: niu_storage::RetailSchedule::Text(niu_storage::TextRetailSchedule {
                    prompt_rate: "1000000".into(),
                    completion_rate: "2000000".into(),
                    cached_prompt_rate: None,
                    cache_write_prompt_rate: None,
                    reasoning_completion_rate: None,
                    minimum_charge_nanos: "0".into(),
                    request_fee_nanos: "0".into(),
                    context_tiers: vec![],
                }),
                expected_version: "0".into(),
                idempotency_key: Uuid::new_v4(),
                reason: "Customer handoff platform price".into(),
            },
            niu_storage::OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let selection = store.retail_text_enrollment(scope, "fast").await.unwrap();
    assert_eq!(selection["pricing_source"], "platform");
    assert_eq!(
        selection["version"], "0",
        "no workspace enrollment was created"
    );
    let key_path = format!("/api/v1/workspaces/{}/keys", scope.project_id);
    let key = request(
        &app,
        Method::POST,
        &key_path,
        Some(token),
        None,
        json!({"name":"Customer application","allowed_models":["fast"],"ttl_seconds":3600}),
    )
    .await;
    assert_eq!(key.0, StatusCode::CREATED, "{}", key.2);
    let secret = key.2["token"].as_str().unwrap();
    let models = request(
        &app,
        Method::GET,
        "/v1/models",
        Some(secret),
        None,
        Value::Null,
    )
    .await;
    assert_eq!(models.0, StatusCode::OK);
    assert!(
        models.2["data"]
            .as_array()
            .unwrap()
            .iter()
            .any(|model| model["id"] == "fast")
    );
    let prompt =
        json!({"model":"fast","messages":[{"role":"user","content":"hi"}],"max_tokens":10});
    let denied = request(
        &app,
        Method::POST,
        "/v1/chat/completions",
        Some(secret),
        None,
        prompt.clone(),
    )
    .await;
    assert_eq!(denied.0, StatusCode::PAYMENT_REQUIRED, "{}", denied.2);
    assert!(captured.0.lock().unwrap().is_none());
    // Trusted settlement is a controlled test boundary, not a simulated merchant checkout.
    store
        .record_settled_customer_funding(
            scope.organization_id,
            "USD",
            1000,
            "handoff-fixture",
            "first-funding",
        )
        .await
        .unwrap();
    let success = request(
        &app,
        Method::POST,
        "/v1/chat/completions",
        Some(secret),
        None,
        prompt,
    )
    .await;
    assert_eq!(success.0, StatusCode::OK, "{}", success.2);
    assert_eq!(success.2["choices"][0]["message"]["content"], "ok");
    assert!(captured.0.lock().unwrap().is_some());
    let charges: i64 = sqlx::query_scalar("SELECT count(*) FROM customer_balance_entries WHERE organization_id=$1 AND project_id=$2 AND kind='charge'")
        .bind(scope.organization_id).bind(scope.project_id).fetch_one(&pool).await.unwrap();
    assert_eq!(charges, 1);

    // Verify self_created organization has independent zero-funded billing and no charges from Org 1
    let second_org_id = Uuid::parse_str(self_created.2["id"].as_str().unwrap()).unwrap();
    let second_charges: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM customer_balance_entries WHERE organization_id = $1",
    )
    .bind(second_org_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(second_charges, 0);

    // Switch session to self_created organization by slug, create a workspace, and verify authority
    let switched = request(
        &app,
        Method::PUT,
        "/api/v1/session/organization",
        Some(token),
        None,
        json!({"organization": "independent-customer"}),
    )
    .await;
    assert_eq!(switched.0, StatusCode::OK, "{}", switched.2);
    assert_eq!(
        switched.2["data"]["operator"]["organization_id"],
        self_created.2["id"]
    );
    assert_eq!(switched.2["data"]["operator"]["role"], "owner");

    // While switched to Org 2, Org 1 workspace/billing mutations fail with 404
    assert_eq!(
        request(
            &app,
            Method::GET,
            &format!(
                "/api/v1/organizations/{}/billing/balance",
                scope.organization_id
            ),
            Some(token),
            None,
            Value::Null,
        )
        .await
        .0,
        StatusCode::NOT_FOUND
    );
    assert_eq!(
        request(
            &app,
            Method::GET,
            &format!(
                "/api/v1/organizations/{}/projects/{}/requests/export",
                scope.organization_id, scope.project_id
            ),
            Some(token),
            None,
            Value::Null,
        )
        .await
        .0,
        StatusCode::NOT_FOUND
    );

    // Rename Org 2 and verify slug remains immutable and resolvable via /organizations/by-route/{slug}
    let renamed = request(
        &app,
        Method::PATCH,
        &format!("/api/v1/organizations/{second_org_id}"),
        Some(token),
        None,
        json!({"name": "Independent Customer Renamed"}),
    )
    .await;
    assert_eq!(renamed.0, StatusCode::OK, "{}", renamed.2);
    assert_eq!(renamed.2["name"], "Independent Customer Renamed");
    assert_eq!(renamed.2["slug"], "independent-customer");

    let by_route = request(
        &app,
        Method::GET,
        "/api/v1/organizations/by-route/independent-customer",
        Some(token),
        None,
        Value::Null,
    )
    .await;
    assert_eq!(by_route.0, StatusCode::OK, "{}", by_route.2);
    assert_eq!(by_route.2["id"], self_created.2["id"]);

    // Verify customer billing overview and transactions never expose supplier/procurement fields
    let org2_balance = request(
        &app,
        Method::GET,
        &format!("/api/v1/organizations/{second_org_id}/billing/balance"),
        Some(token),
        None,
        Value::Null,
    )
    .await;
    assert_eq!(org2_balance.0, StatusCode::OK, "{}", org2_balance.2);
    let balance_text = org2_balance.2.to_string();
    for forbidden_term in [
        "supplier",
        "purchase_price",
        "procurement",
        "margin",
        "provider-secret",
    ] {
        assert!(!balance_text.contains(forbidden_term));
    }

    upstream_task.abort();
}

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn multi_organization_membership_claiming_isolation_and_internal_mode_admission(
    pool: PgPool,
) {
    let captured = Captured::default();
    let upstream = Router::new()
        .route("/v1/chat/completions", post(provider))
        .with_state(captured.clone());
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let upstream_task = tokio::spawn(async move { axum::serve(listener, upstream).await.unwrap() });
    let mut state = test_state(Some(format!("http://{address}/v1")), pool.clone());
    Arc::make_mut(&mut state.config).models.clear();
    let cipher = Arc::new(
        crate::vendors::crypto::CredentialCipher::new(
            "multi-org-isolation-fixture-master-key-12345",
        )
        .unwrap(),
    );
    state.vendor_cipher = Some(cipher.clone());
    state
        .store
        .configure_platform_currency("USD")
        .await
        .unwrap();
    crate::payments::readiness::configure_test_gateway(&mut state).await;
    state.password_auth = Some(Arc::new(
        crate::admin::passwords::Runtime::new("https://niu.example.test")
            .await
            .unwrap(),
    ));
    let original = state.store.default_workspace().await.unwrap();
    let store = state.store.clone();
    let vendor_id = Uuid::new_v4();
    let vendor = store
        .create_vendor(niu_storage::VendorInput {
            id: vendor_id,
            name: "Multi-org Provider key".into(),
            adapter: "openai".into(),
            api_base: format!("http://{address}/v1"),
            enabled: true,
            credential_ciphertext: cipher.seal(vendor_id, "provider-secret-token").unwrap(),
        })
        .await
        .unwrap();
    let supplier = store
        .create_provider_business("Multi-org Provider")
        .await
        .unwrap();
    store
        .associate_vendor_supplier(vendor_id, supplier, vendor.revision)
        .await
        .unwrap();
    store
        .upsert_vendor_model(
            vendor_id,
            niu_storage::VendorModelInput {
                alias: "fast".into(),
                upstream_model: "provider-secret-model".into(),
                enabled: true,
                public_catalog: true,
                capabilities: json!({}),
                expected_revision: None,
                pricing: Some(json!({
                    "currency":"USD",
                    "api_prompt_rate":2000000,
                    "api_completion_rate":4000000,
                    "cash_prompt_rate":1000000,
                    "cash_completion_rate":2000000,
                    "max_input_tokens":64,
                    "max_output_tokens":10
                })),
            },
        )
        .await
        .unwrap();
    let offer_revision = store
        .publish_provider_offer(
            supplier,
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
    let offer: Uuid = sqlx::query_scalar(
        "SELECT id FROM provider_offers WHERE provider_id=$1 AND model_alias='fast'",
    )
    .bind(supplier)
    .fetch_one(&pool)
    .await
    .unwrap();
    let expiry = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as i64
        + 3_600_000;
    store
        .qualify_provider_business(
            supplier,
            &niu_storage::ProviderQualificationInput {
                supply_rights_sha256: "a".repeat(64),
                supply_capability_sha256: "b".repeat(64),
                data_handling_sha256: "c".repeat(64),
                valid_until_ms: expiry,
            },
        )
        .await
        .unwrap();
    store
        .qualify_provider_offer(
            supplier,
            offer,
            &niu_storage::ProviderOfferQualificationInput {
                rate_revision: offer_revision,
                model_identity_sha256: "d".repeat(64),
                protocol_matrix_sha256: "e".repeat(64),
                protocol_matrix_version: "chat-fixture-v1".into(),
                data_handling_sha256: "f".repeat(64),
                availability_sha256: "1".repeat(64),
                agreed_rates_sha256: "2".repeat(64),
                valid_until_ms: expiry,
            },
        )
        .await
        .unwrap();
    let supply_mgr = store
        .create_operator(
            niu_storage::OperatorScope {
                organization_id: original.organization_id,
                project_id: None,
            },
            "Supply manager",
            niu_storage::OperatorRole::Owner,
            3600,
            niu_storage::OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    store
        .set_provider_member(supplier, supply_mgr.operator_id, "manager", true)
        .await
        .unwrap();
    store
        .set_provider_offer_active(supplier, offer, supply_mgr.operator_id, true)
        .await
        .unwrap();
    store
        .publish_retail_standard(
            niu_storage::RetailStandardPublication {
                model_alias: "fast".into(),
                currency: "USD".into(),
                schedule: niu_storage::RetailSchedule::Text(niu_storage::TextRetailSchedule {
                    prompt_rate: "1000000".into(),
                    completion_rate: "2000000".into(),
                    cached_prompt_rate: None,
                    cache_write_prompt_rate: None,
                    reasoning_completion_rate: None,
                    minimum_charge_nanos: "0".into(),
                    request_fee_nanos: "0".into(),
                    context_tiers: vec![],
                }),
                expected_version: "0".into(),
                idempotency_key: Uuid::new_v4(),
                reason: "Multi-org retail price".into(),
            },
            niu_storage::OperatorAuditActor::Installation,
        )
        .await
        .unwrap();

    let app = router(state.clone());

    // 1. Provision user Alice with a password login in Org A
    let org_a_owner = store
        .create_operator(
            OperatorScope {
                organization_id: original.organization_id,
                project_id: None,
            },
            "Alice Chen",
            OperatorRole::Owner,
            3600,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    store
        .set_member_password(
            org_a_owner.operator_id,
            "alice@example.test",
            &niu_storage::passwords::hash_password("alice-passphrase-12345").unwrap(),
            None,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let alice_login = request(
        &app,
        Method::POST,
        "/api/v1/auth/login",
        None,
        Some("https://niu.example.test"),
        json!({"email":"alice@example.test","password":"alice-passphrase-12345"}),
    )
    .await;
    assert_eq!(alice_login.0, StatusCode::OK);
    let alice_token = alice_login.2["token"].as_str().unwrap().to_string();

    // 2. Self-service organization creation idempotency over HTTP (concurrent same-key retries + conflict on changed input)
    let create_req = |key: &str, body: Value| {
        let app = app.clone();
        let token = alice_token.clone();
        let key = key.to_string();
        async move {
            let resp = app
                .oneshot(
                    Request::builder()
                        .method("POST")
                        .uri("/api/v1/organizations")
                        .header("authorization", format!("Bearer {token}"))
                        .header("content-type", "application/json")
                        .header("idempotency-key", key)
                        .body(Body::from(body.to_string()))
                        .unwrap(),
                )
                .await
                .unwrap();
            let status = resp.status();
            let bytes = to_bytes(resp.into_body(), 16384).await.unwrap();
            (status, serde_json::from_slice::<Value>(&bytes).unwrap())
        }
    };
    let (r1, r2) = tokio::join!(
        create_req(
            "alice-org-b-key",
            json!({"name": "Alice Studio", "slug": "alice-studio"})
        ),
        create_req(
            "alice-org-b-key",
            json!({"name": "Alice Studio", "slug": "alice-studio"})
        ),
    );
    assert_eq!(r1.0, StatusCode::CREATED, "{}", r1.1);
    assert_eq!(r2.0, StatusCode::CREATED, "{}", r2.1);
    assert_eq!(r1.1["id"], r2.1["id"]);
    assert_eq!(r1.1["slug"], "alice-studio");
    let org_b_id = Uuid::parse_str(r1.1["id"].as_str().unwrap()).unwrap();

    // Changed input with same idempotency key returns 409 Conflict
    let conflict = create_req(
        "alice-org-b-key",
        json!({"name": "Different Studio", "slug": "alice-studio"}),
    )
    .await;
    assert_eq!(conflict.0, StatusCode::CONFLICT, "{}", conflict.1);

    // 3. Provision a separate organization Org C owned by Bob; Bob invites "Alice Chen" (matching name, no auto-link)
    let org_c_id = store.create_organization("Bob Ventures").await.unwrap();
    let bob_owner = store
        .create_operator(
            OperatorScope {
                organization_id: org_c_id,
                project_id: None,
            },
            "Bob Owner",
            OperatorRole::Owner,
            3600,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    // Bob creates an operator named "Alice Chen" in Org C via HTTP
    let invited = request(
        &app,
        Method::POST,
        "/api/v1/operators",
        Some(&bob_owner.token),
        None,
        json!({
            "organization_id": org_c_id,
            "project_id": null,
            "name": "Alice Chen",
            "role": "viewer",
            "expires_in_seconds": 3600
        }),
    )
    .await;
    assert_eq!(invited.0, StatusCode::CREATED, "{}", invited.2);
    let invite_token = invited.2["token"].as_str().unwrap().to_string();
    let invited_op_id = Uuid::parse_str(invited.2["operator"]["id"].as_str().unwrap()).unwrap();

    // Matching name does NOT grant Alice access to Org C before claiming
    let alice_orgs_before = request(
        &app,
        Method::GET,
        "/api/v1/organizations",
        Some(&alice_token),
        None,
        Value::Null,
    )
    .await;
    assert_eq!(alice_orgs_before.0, StatusCode::OK);
    assert_eq!(alice_orgs_before.2["data"].as_array().unwrap().len(), 2);

    // Alice claims the membership via POST /api/v1/session/memberships
    let claimed = request(
        &app,
        Method::POST,
        "/api/v1/session/memberships",
        Some(&alice_token),
        None,
        json!({"token": invite_token}),
    )
    .await;
    assert_eq!(claimed.0, StatusCode::OK, "{}", claimed.2);
    assert_eq!(
        claimed.2["data"]["operator"]["organization_id"],
        org_c_id.to_string()
    );
    assert_eq!(claimed.2["data"]["operator"]["role"], "viewer");
    // The one-time invite token is now revoked
    assert!(store.authenticate_operator(&invite_token).await.is_err());

    // Alice now sees 3 organizations
    let alice_orgs_after = request(
        &app,
        Method::GET,
        "/api/v1/organizations",
        Some(&alice_token),
        None,
        Value::Null,
    )
    .await;
    assert_eq!(alice_orgs_after.2["data"].as_array().unwrap().len(), 3);

    // Bob promotes Alice in Org C from viewer -> admin -> owner, tests last-owner protection, then demotes and revokes
    for (expected, next) in [("viewer", "admin"), ("admin", "owner")] {
        let role_resp = request(
            &app,
            Method::PATCH,
            &format!("/api/v1/operators/{invited_op_id}"),
            Some(&bob_owner.token),
            None,
            json!({"role": next, "expected_role": expected}),
        )
        .await;
        assert_eq!(role_resp.0, StatusCode::OK, "{}", role_resp.2);
    }
    // Demoting Alice back to viewer succeeds because Bob is still an owner, then demoting Bob (now the last owner) fails with 409 Conflict
    assert_eq!(
        request(
            &app,
            Method::PATCH,
            &format!("/api/v1/operators/{invited_op_id}"),
            Some(&bob_owner.token),
            None,
            json!({"role": "viewer", "expected_role": "owner"}),
        )
        .await
        .0,
        StatusCode::OK
    );
    assert_eq!(
        request(
            &app,
            Method::PATCH,
            &format!("/api/v1/operators/{}", bob_owner.operator_id),
            Some(ADMIN),
            None,
            json!({"role": "viewer", "expected_role": "owner"}),
        )
        .await
        .0,
        StatusCode::CONFLICT
    );

    // 4. Workspace-only user in Org B cannot manage shared organization billing or grant organization access
    let switch_to_b = request(
        &app,
        Method::PUT,
        "/api/v1/session/organization",
        Some(&alice_token),
        None,
        json!({"organization": "alice-studio"}),
    )
    .await;
    assert_eq!(switch_to_b.0, StatusCode::OK);
    let ws_b = request(
        &app,
        Method::POST,
        "/api/v1/workspaces",
        Some(&alice_token),
        None,
        json!({"organization_id": org_b_id, "name": "Studio Workspace", "slug": "studio-workspace"}),
    )
    .await;
    assert_eq!(ws_b.0, StatusCode::CREATED, "{}", ws_b.2);
    let ws_b_id = Uuid::parse_str(ws_b.2["id"].as_str().unwrap()).unwrap();

    let ws_only_op = request(
        &app,
        Method::POST,
        "/api/v1/operators",
        Some(&alice_token),
        None,
        json!({
            "organization_id": org_b_id,
            "project_id": ws_b_id,
            "name": "Workspace Scoped Owner",
            "role": "owner",
            "expires_in_seconds": 3600
        }),
    )
    .await;
    assert_eq!(ws_only_op.0, StatusCode::CREATED, "{}", ws_only_op.2);
    let ws_only_token = ws_only_op.2["token"].as_str().unwrap();

    // Workspace-only owner cannot create organization-wide operators, rename organization, or access organization billing
    assert!(matches!(
        request(
            &app,
            Method::POST,
            "/api/v1/operators",
            Some(ws_only_token),
            None,
            json!({
                "organization_id": org_b_id,
                "project_id": null,
                "name": "Escalated Org Owner",
                "role": "owner",
                "expires_in_seconds": 3600
            }),
        )
        .await
        .0,
        StatusCode::FORBIDDEN | StatusCode::NOT_FOUND
    ));
    assert!(matches!(
        request(
            &app,
            Method::PATCH,
            &format!("/api/v1/organizations/{org_b_id}"),
            Some(ws_only_token),
            None,
            json!({"name": "Unauthorized Rename"}),
        )
        .await
        .0,
        StatusCode::FORBIDDEN | StatusCode::NOT_FOUND
    ));
    assert!(matches!(
        request(
            &app,
            Method::GET,
            &format!("/api/v1/organizations/{org_b_id}/billing/balance"),
            Some(ws_only_token),
            None,
            Value::Null,
        )
        .await
        .0,
        StatusCode::FORBIDDEN | StatusCode::NOT_FOUND
    ));

    // 5. Race test: concurrent organization switch / revocation against workspace mutations and dispatch
    let revoke_path = format!("/api/v1/operators/{invited_op_id}");
    let switch_fut = request(
        &app,
        Method::PUT,
        "/api/v1/session/organization",
        Some(&alice_token),
        None,
        json!({"organization": original.organization_id.to_string()}),
    );
    let revoke_c_fut = request(
        &app,
        Method::DELETE,
        &revoke_path,
        Some(&bob_owner.token),
        None,
        Value::Null,
    );
    let (switch_res, revoke_res) = tokio::join!(switch_fut, revoke_c_fut);
    assert_eq!(switch_res.0, StatusCode::OK);
    assert_eq!(revoke_res.0, StatusCode::NO_CONTENT);
    // Switching to revoked Org C now fails with 404
    assert_eq!(
        request(
            &app,
            Method::PUT,
            "/api/v1/session/organization",
            Some(&alice_token),
            None,
            json!({"organization": org_c_id.to_string()}),
        )
        .await
        .0,
        StatusCode::NOT_FOUND
    );

    // 6. Self-funded Internal operating mode vs Resale mode admission for zero-funded Org B
    let switch_back_b = request(
        &app,
        Method::PUT,
        "/api/v1/session/organization",
        Some(&alice_token),
        None,
        json!({"organization": "alice-studio"}),
    )
    .await;
    assert_eq!(switch_back_b.0, StatusCode::OK);
    let key_b = request(
        &app,
        Method::POST,
        &format!("/api/v1/workspaces/{ws_b_id}/keys"),
        Some(&alice_token),
        None,
        json!({"name":"Studio Key","allowed_models":["fast"],"ttl_seconds":3600}),
    )
    .await;
    assert_eq!(key_b.0, StatusCode::CREATED, "{}", key_b.2);
    let secret_b = key_b.2["token"].as_str().unwrap();
    let prompt =
        json!({"model":"fast","messages":[{"role":"user","content":"hi"}],"max_tokens":10});

    // In Resale mode, zero-funded Org B is rejected with 402 Payment Required
    let resale_denied = request(
        &app,
        Method::POST,
        "/v1/chat/completions",
        Some(secret_b),
        None,
        prompt.clone(),
    )
    .await;
    assert_eq!(resale_denied.0, StatusCode::PAYMENT_REQUIRED);

    // In self-funded Internal mode, an owner-funded vendor scoped to Org B is admitted without customer balance debit and isolated from Org A
    let mut internal_state = state.clone();
    internal_state.operating_mode = crate::state::OperatingMode::Internal;
    let internal_app = router(internal_state);
    let personal_vendor = request(
        &internal_app,
        Method::POST,
        "/api/v1/vendors",
        Some(ADMIN),
        None,
        json!({
            "name": "Org B Personal Key",
            "adapter": "openai",
            "api_base": format!("http://{address}/v1"),
            "api_key": "org-b-personal-secret",
            "create_supplier": true,
            "personal_organization_id": org_b_id
        }),
    )
    .await;
    assert_eq!(
        personal_vendor.0,
        StatusCode::CREATED,
        "{}",
        personal_vendor.2
    );
    let personal_vendor_id = personal_vendor.2["data"]["id"].as_str().unwrap();
    let add_model = request(
        &internal_app,
        Method::POST,
        &format!("/api/v1/vendors/{personal_vendor_id}/models"),
        Some(ADMIN),
        None,
        json!({
            "alias": "internal-fast",
            "upstream_model": "provider-secret-model",
            "enabled": true,
            "public_catalog": false,
            "capabilities": {},
            "expected_revision": null
        }),
    )
    .await;
    assert_eq!(add_model.0, StatusCode::OK, "{}", add_model.2);
    let internal_key_b = store
        .issue_key(
            niu_storage::TenantScope {
                organization_id: org_b_id,
                project_id: ws_b_id,
            },
            "Studio Internal Key",
            &["internal-fast".to_owned()],
            3600,
        )
        .await
        .unwrap();
    let internal_ok = request(
        &internal_app,
        Method::POST,
        "/v1/chat/completions",
        Some(&internal_key_b.token),
        None,
        json!({"model":"internal-fast","messages":[{"role":"user","content":"hi"}],"max_tokens":10}),
    )
    .await;
    assert_eq!(internal_ok.0, StatusCode::OK, "{}", internal_ok.2);

    // Org A cannot invoke Org B's owner-funded personal model
    let org_a_key = store
        .issue_key(original, "Org A Key", &["internal-fast".to_owned()], 3600)
        .await
        .unwrap();
    let foreign_internal = request(
        &internal_app,
        Method::POST,
        "/v1/chat/completions",
        Some(&org_a_key.token),
        None,
        json!({"model":"internal-fast","messages":[{"role":"user","content":"hi"}],"max_tokens":10}),
    )
    .await;
    assert_eq!(foreign_internal.0, StatusCode::NOT_FOUND);

    upstream_task.abort();
}
