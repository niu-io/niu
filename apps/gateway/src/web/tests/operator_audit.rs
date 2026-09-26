use axum::{
    Router,
    http::{Method, Request, StatusCode},
};
use http_body_util::BodyExt;
use serde_json::{Value, json};
use tower::ServiceExt;
use uuid::Uuid;

use super::{router, test_state};

const BOOTSTRAP: &str = "niu-test-admin-token-that-is-long-1234";

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn operator_audit_api_attributes_actor_and_pages_without_leaks(pool: sqlx::PgPool) {
    let state = test_state(None, pool.clone());
    let store = state.store.clone();
    let scope = store.default_workspace().await.unwrap();
    let app = router(state);

    let (status, owner_created) = call(
        &app,
        Method::POST,
        "/admin/v1/operators",
        BOOTSTRAP,
        Some(json!({
            "organization_id":scope.organization_id,
            "project_id":scope.project_id,
            "name":"audit owner",
            "role":"owner",
            "expires_in_seconds":3600
        })),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED);
    let owner_id = Uuid::parse_str(owner_created["operator"]["id"].as_str().unwrap()).unwrap();
    let owner_token = owner_created["token"].as_str().unwrap();

    let before_rejected_writes: i64 =
        sqlx::query_scalar("SELECT count(*) FROM operator_audit_events")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(
        call(
            &app,
            Method::POST,
            "/admin/v1/operators",
            "invalid-operator-token",
            Some(json!({
                "organization_id":scope.organization_id,
                "project_id":scope.project_id,
                "name":"rejected",
                "role":"viewer",
                "expires_in_seconds":3600
            })),
        )
        .await
        .0,
        StatusCode::UNAUTHORIZED
    );

    let (status, target_created) = call(
        &app,
        Method::POST,
        "/admin/v1/operators",
        owner_token,
        Some(json!({
            "organization_id":scope.organization_id,
            "project_id":scope.project_id,
            "name":"audit viewer",
            "role":"viewer",
            "expires_in_seconds":3600
        })),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED);
    let target_id = Uuid::parse_str(target_created["operator"]["id"].as_str().unwrap()).unwrap();
    let target_session = target_created["session"]["id"].as_str().unwrap().to_owned();
    let target_token = target_created["token"].as_str().unwrap();

    assert_eq!(
        call(
            &app,
            Method::POST,
            "/admin/v1/operators",
            target_token,
            Some(json!({
                "organization_id":scope.organization_id,
                "project_id":scope.project_id,
                "name":"denied",
                "role":"viewer",
                "expires_in_seconds":3600
            })),
        )
        .await
        .0,
        StatusCode::FORBIDDEN
    );
    assert_eq!(
        call(
            &app,
            Method::GET,
            &format!("/admin/v1/operators/{target_id}/events"),
            target_token,
            None,
        )
        .await
        .0,
        StatusCode::FORBIDDEN,
        "viewers cannot read operator audit events"
    );

    let target_path = format!("/admin/v1/operators/{target_id}");
    let sessions_path = format!("{target_path}/sessions");
    let (status, issued) = call(
        &app,
        Method::POST,
        &sessions_path,
        owner_token,
        Some(json!({"expires_in_seconds":3600})),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED);
    let extra_session_id = issued["session"]["id"].as_str().unwrap().to_owned();
    assert_eq!(
        call(
            &app,
            Method::DELETE,
            &format!("{sessions_path}/{extra_session_id}"),
            owner_token,
            None,
        )
        .await
        .0,
        StatusCode::NO_CONTENT
    );
    assert_eq!(
        call(&app, Method::DELETE, &target_path, owner_token, None)
            .await
            .0,
        StatusCode::NO_CONTENT
    );
    let after_rejected_writes: i64 =
        sqlx::query_scalar("SELECT count(*) FROM operator_audit_events")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(
        after_rejected_writes,
        before_rejected_writes + 5,
        "rejected authentication and permission checks append no events"
    );

    let owner_events = format!("/admin/v1/operators/{owner_id}/events?limit=10");
    let (status, owner_page) = call(&app, Method::GET, &owner_events, BOOTSTRAP, None).await;
    assert_eq!(status, StatusCode::OK);
    let foreign_cursor = owner_page["data"][0]["id"].as_str().unwrap();

    let events_path = format!("/admin/v1/operators/{target_id}/events?limit=2");
    let mut seen_ids = Vec::new();
    let (status, page_one) = call(&app, Method::GET, &events_path, owner_token, None).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(page_one["data"].as_array().unwrap().len(), 2);
    let cursor_one = page_one["next_cursor"].as_str().unwrap();
    seen_ids.extend(ids(&page_one["data"]));

    let page_two_path = format!("{events_path}&cursor={cursor_one}");
    let (status, page_two) = call(&app, Method::GET, &page_two_path, owner_token, None).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(page_two["data"].as_array().unwrap().len(), 2);
    let cursor_two = page_two["next_cursor"].as_str().unwrap();
    seen_ids.extend(ids(&page_two["data"]));

    let page_three_path = format!("{events_path}&cursor={cursor_two}");
    let (status, page_three) = call(&app, Method::GET, &page_three_path, owner_token, None).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(page_three["data"].as_array().unwrap().len(), 1);
    assert!(page_three["next_cursor"].is_null());
    seen_ids.extend(ids(&page_three["data"]));
    seen_ids.sort_unstable();
    seen_ids.dedup();
    assert_eq!(seen_ids.len(), 5, "pagination must not duplicate rows");

    for event in page_one["data"]
        .as_array()
        .unwrap()
        .iter()
        .chain(page_two["data"].as_array().unwrap())
        .chain(page_three["data"].as_array().unwrap())
    {
        assert_eq!(event["actor_kind"], "operator");
        assert_eq!(event["actor_operator_id"], owner_id.to_string());
        assert_eq!(event["target_operator_id"], target_id.to_string());
        assert_eq!(event["organization_id"], scope.organization_id.to_string());
        assert_eq!(event["project_id"], scope.project_id.to_string());
        assert!(event.get("token").is_none());
        assert!(event.get("token_hash").is_none());
    }
    let mut events = Vec::new();
    events.extend(page_one["data"].as_array().unwrap().iter().cloned());
    events.extend(page_two["data"].as_array().unwrap().iter().cloned());
    events.extend(page_three["data"].as_array().unwrap().iter().cloned());
    for action in [
        "operator_created",
        "session_created",
        "session_revoked",
        "operator_revoked",
    ] {
        assert!(events.iter().any(|event| event["action"] == action));
    }
    assert!(
        events
            .iter()
            .any(|event| event["target_session_id"] == target_session)
    );
    assert!(
        events
            .iter()
            .any(|event| event["target_session_id"] == extra_session_id)
    );
    let serialized_events = serde_json::to_string(&events).unwrap();
    assert!(!serialized_events.contains(owner_token));
    assert!(!serialized_events.contains(target_token));

    assert_eq!(
        call(
            &app,
            Method::GET,
            &format!("/admin/v1/operators/{target_id}/events?cursor={foreign_cursor}"),
            owner_token,
            None,
        )
        .await
        .0,
        StatusCode::BAD_REQUEST,
        "a cursor from another target is rejected"
    );
}

fn ids(events: &Value) -> Vec<String> {
    events
        .as_array()
        .unwrap()
        .iter()
        .map(|event| event["id"].as_str().unwrap().to_owned())
        .collect()
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
