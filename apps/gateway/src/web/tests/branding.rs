use super::*;
use axum::body::Body;
use base64::Engine;
use niu_storage::{OperatorAuditActor, OperatorRole, OperatorScope};
use std::io::Cursor;

async fn call(
    app: &Router,
    method: &str,
    path: &str,
    token: Option<&str>,
    payload: Option<Value>,
) -> (StatusCode, Value) {
    let mut request = Request::builder().method(method).uri(path);
    if let Some(token) = token {
        request = request.header("authorization", format!("Bearer {token}"));
    }
    let body = if let Some(payload) = payload {
        request = request.header("content-type", "application/json");
        Body::from(payload.to_string())
    } else {
        Body::empty()
    };
    let response = app
        .clone()
        .oneshot(request.body(body).unwrap())
        .await
        .unwrap();
    assert_eq!(response.headers()["cache-control"], "no-store");
    let status = response.status();
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    (status, serde_json::from_slice(&bytes).unwrap())
}
#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn branding_api_is_public_safe_platform_only_and_revision_checked(pool: PgPool) {
    let state = test_state(None, pool.clone());
    let store = state.store.clone();
    let scope = store.default_workspace().await.unwrap();
    let member = store
        .create_operator(
            OperatorScope {
                organization_id: scope.organization_id,
                project_id: Some(scope.project_id),
            },
            "Brand administrator",
            OperatorRole::Owner,
            3600,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let app = router(state);
    let admin = "/admin/v1/platform/branding";
    let public = "/v1/branding";
    let defaults = serde_json::to_value(niu_storage::BrandingSettings::default()).unwrap();
    assert_eq!(
        call(&app, "GET", public, None, None).await.1,
        json!({"data":{"revision":"0","settings":defaults}})
    );
    let input = json!({"expected_revision":"0","settings":defaults});
    assert_eq!(
        call(&app, "PUT", admin, None, Some(input.clone())).await.0,
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(
        call(&app, "GET", admin, Some(&member.token), None).await.0,
        StatusCode::FORBIDDEN
    );
    assert_eq!(
        call(&app, "PUT", admin, Some(&member.token), Some(input.clone()))
            .await
            .0,
        StatusCode::FORBIDDEN
    );
    sqlx::query("UPDATE admin_operators SET platform_admin=true WHERE id=$1")
        .bind(member.operator_id)
        .execute(&pool)
        .await
        .unwrap();
    let mut changed = input.clone();
    changed["settings"]["display_name"] = json!("Example deployment");
    changed["settings"]["light"] = json!({"primary":"#112233"});
    let mut png = Cursor::new(Vec::new());
    image::DynamicImage::new_rgba8(32, 32)
        .write_to(&mut png, image::ImageFormat::Png)
        .unwrap();
    let asset = format!(
        "data:image/png;base64,{}",
        base64::engine::general_purpose::STANDARD.encode(png.into_inner())
    );
    changed["settings"]["logo_data_url"] = json!(asset);
    changed["settings"]["favicon_data_url"] = json!(asset);
    let saved = call(
        &app,
        "PUT",
        admin,
        Some(&member.token),
        Some(changed.clone()),
    )
    .await;
    assert_eq!(saved.0, StatusCode::OK);
    assert_eq!(saved.1["data"]["revision"], "1");
    assert!(
        saved.1["data"]["settings"]["logo_data_url"]
            .as_str()
            .unwrap()
            .starts_with("data:image/png;base64,")
    );
    assert!(saved.1["data"]["settings"]["favicon_data_url"].is_string());
    assert_eq!(call(&app, "GET", public, None, None).await.1, saved.1);
    assert_eq!(
        call(
            &app,
            "PUT",
            admin,
            Some(&member.token),
            Some(changed.clone())
        )
        .await
        .0,
        StatusCode::CONFLICT
    );
    changed["expected_revision"] = json!("1");
    changed["settings"]["light"] = json!({"primary":"url(https://example.org/x)"});
    assert_eq!(
        call(&app, "PUT", admin, Some(&member.token), Some(changed))
            .await
            .0,
        StatusCode::BAD_REQUEST
    );
    let malformed = json!({"expected_revision":"1","settings":{
        "display_name":"NIU.IO","default_appearance":"system","light":{},"dark":{},
        "logo_data_url":"data:image/png;base64,AAAA"
    }});
    assert_eq!(
        call(&app, "PUT", admin, Some(&member.token), Some(malformed))
            .await
            .0,
        StatusCode::BAD_REQUEST
    );
    assert_eq!(store.branding_configuration().await.unwrap().0, 1);
    let actor: Option<Uuid> = sqlx::query_scalar(
        "SELECT actor_operator_id FROM branding_configuration_events WHERE revision=1",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(actor, Some(member.operator_id));
    let mut reset = input;
    reset["expected_revision"] = json!("1");
    assert_eq!(
        call(&app, "PUT", admin, Some(&member.token), Some(reset.clone()))
            .await
            .0,
        StatusCode::OK
    );
    assert_eq!(
        call(&app, "GET", public, None, None).await.1["data"]["settings"]["display_name"],
        "NIU.IO"
    );
    let reset_assets = call(&app, "GET", public, None, None).await.1;
    assert!(reset_assets["data"]["settings"]["logo_data_url"].is_null());
    assert!(reset_assets["data"]["settings"]["favicon_data_url"].is_null());
    sqlx::query("UPDATE admin_operators SET platform_admin=false WHERE id=$1")
        .bind(member.operator_id)
        .execute(&pool)
        .await
        .unwrap();
    reset["expected_revision"] = json!("2");
    assert_eq!(
        call(&app, "PUT", admin, Some(&member.token), Some(reset))
            .await
            .0,
        StatusCode::FORBIDDEN
    );
    assert_eq!(store.branding_configuration().await.unwrap().0, 2);
}
