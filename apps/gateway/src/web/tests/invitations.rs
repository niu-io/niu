use super::*;
use niu_storage::{OperatorAuditActor, OperatorRole, OperatorScope, passwords::hash_password};
use serde_json::json;
use sqlx::PgPool;

async fn call(
    app: &Router,
    method: &str,
    path: &str,
    token: &str,
    body: Value,
) -> (StatusCode, Value) {
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method(method)
                .uri(path)
                .header("authorization", format!("Bearer {token}"))
                .header("content-type", "application/json")
                .body(axum::body::Body::from(body.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    let status = response.status();
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    (
        status,
        serde_json::from_slice(&bytes).unwrap_or(Value::Null),
    )
}

async fn member_session(
    store: &niu_storage::Store,
    operator_id: Uuid,
    email: &str,
) -> (String, Uuid) {
    let hash = hash_password("synthetic invitation passphrase").unwrap();
    store
        .set_member_password(
            operator_id,
            email,
            &hash,
            None,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let issued = store
        .create_operator_session(operator_id, 3_600, OperatorAuditActor::Installation)
        .await
        .unwrap();
    (issued.token, operator_id)
}

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn owner_invites_existing_account_and_recipient_accepts_once(pool: PgPool) {
    let state = test_state(None, pool.clone());
    let default_workspace = state.store.default_workspace().await.unwrap();
    let default_project = default_workspace.project_id;
    let owner = state
        .store
        .create_operator(
            OperatorScope {
                organization_id: default_workspace.organization_id,
                project_id: None,
            },
            "Inviting Owner",
            OperatorRole::Owner,
            3_600,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let other_org = state
        .store
        .create_organization("Recipient Org")
        .await
        .unwrap();
    let other_workspace = state
        .store
        .create_project(other_org, "Recipient Workspace")
        .await
        .unwrap();
    let recipient = state
        .store
        .create_operator(
            OperatorScope {
                organization_id: other_org,
                project_id: Some(other_workspace.project_id),
            },
            "Recipient",
            OperatorRole::Viewer,
            3_600,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let (recipient_token, _) = member_session(
        &state.store,
        recipient.operator_id,
        "recipient@example.test",
    )
    .await;
    let admin = state
        .store
        .create_operator(
            OperatorScope {
                organization_id: default_workspace.organization_id,
                project_id: None,
            },
            "Admin Without Member Management",
            OperatorRole::Admin,
            3_600,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let other_owner = state
        .store
        .create_operator(
            OperatorScope {
                organization_id: other_org,
                project_id: None,
            },
            "Other Owner",
            OperatorRole::Owner,
            3_600,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let app = router(state);
    let invitations = format!(
        "/api/v1/organizations/{}/invitations",
        default_workspace.organization_id
    );

    let created = call(
        &app,
        "POST",
        &invitations,
        &owner.token,
        json!({
            "email": "Recipient@Example.Test",
            "name": "Recipient",
            "role": "admin",
            "project_id": default_project,
            "expires_in_seconds": 604800
        }),
    )
    .await;
    assert_eq!(created.0, StatusCode::CREATED, "{}", created.1);
    let token = created.1["token"].as_str().unwrap().to_string();
    assert!(token.starts_with("niu_invite_"));
    assert_eq!(created.1["delivery"]["state"], "not_configured");
    assert_eq!(created.1["delivery"]["email_sent"], false);
    assert_eq!(
        created.1["invitation"]["recipient_email"],
        "recipient@example.test"
    );
    assert_eq!(created.1["invitation"]["role"], "admin");
    assert_eq!(created.1["invitation"]["status"], "pending");
    assert_eq!(created.1["accept_path"], format!("/invite/{token}"));

    // The directory never returns the redemption secret or its digest.
    let listed = call(&app, "GET", &invitations, &owner.token, Value::Null).await;
    assert_eq!(listed.0, StatusCode::OK, "{}", listed.1);
    assert_eq!(listed.1["data"].as_array().unwrap().len(), 1);
    assert!(listed.1["data"][0].get("token").is_none());
    assert!(listed.1["data"][0].get("token_sha256").is_none());

    // An admin cannot manage member invitations under current authorization.
    assert_eq!(
        call(
            &app,
            "POST",
            &invitations,
            &admin.token,
            json!({"email":"someone@example.test","role":"viewer","expires_in_seconds":3600}),
        )
        .await
        .0,
        StatusCode::FORBIDDEN
    );
    assert_eq!(
        call(&app, "GET", &invitations, &admin.token, Value::Null)
            .await
            .0,
        StatusCode::FORBIDDEN
    );
    assert_eq!(
        call(&app, "GET", &invitations, &other_owner.token, Value::Null)
            .await
            .0,
        StatusCode::NOT_FOUND
    );

    let preview = call(
        &app,
        "POST",
        "/api/v1/invitations/preview",
        &recipient_token,
        json!({"token": token}),
    )
    .await;
    assert_eq!(preview.0, StatusCode::OK, "{}", preview.1);
    assert_eq!(preview.1["data"]["email_matches"], true);
    assert_eq!(preview.1["data"]["caller_email"], "recipient@example.test");
    assert_eq!(preview.1["data"]["status"], "pending");
    assert_eq!(
        preview.1["data"]["project_slug"],
        default_workspace_slug(&pool).await
    );
    assert_eq!(
        call(
            &app,
            "POST",
            "/api/v1/invitations/preview",
            &owner.token,
            json!({"token": token}),
        )
        .await
        .1["data"]["email_matches"],
        false
    );

    // The wrong signed-in identity cannot consume the link.
    assert_eq!(
        call(
            &app,
            "POST",
            "/api/v1/session/invitations",
            &owner.token,
            json!({"token": token}),
        )
        .await
        .0,
        StatusCode::FORBIDDEN
    );

    let accepted = call(
        &app,
        "POST",
        "/api/v1/session/invitations",
        &recipient_token,
        json!({"token": token}),
    )
    .await;
    assert_eq!(accepted.0, StatusCode::OK, "{}", accepted.1);
    assert_eq!(accepted.1["replayed"], false);
    assert_eq!(accepted.1["data"]["operator"]["role"], "admin");
    assert_eq!(
        accepted.1["data"]["operator"]["organization_id"],
        default_workspace.organization_id.to_string()
    );
    assert_eq!(
        accepted.1["data"]["operator"]["project_id"],
        default_project.to_string()
    );
    assert_eq!(accepted.1["invitation"]["status"], "accepted");
    assert!(accepted.1.get("token").is_none());
    assert!(accepted.1.get("session").is_none());

    let identity = call(
        &app,
        "GET",
        "/api/v1/session",
        &recipient_token,
        Value::Null,
    )
    .await;
    assert_eq!(identity.0, StatusCode::OK);
    assert_eq!(identity.1["data"]["operator"]["role"], "admin");
    let organizations = call(
        &app,
        "GET",
        "/api/v1/organizations",
        &recipient_token,
        Value::Null,
    )
    .await;
    assert!(organizations.1["data"]
        .as_array()
        .unwrap()
        .iter()
        .any(|organization| organization["id"]
            == default_workspace.organization_id.to_string()));

    let replay = call(
        &app,
        "POST",
        "/api/v1/session/invitations",
        &recipient_token,
        json!({"token": token}),
    )
    .await;
    assert_eq!(replay.0, StatusCode::OK, "{}", replay.1);
    assert_eq!(replay.1["replayed"], true);
    assert_eq!(
        replay.1["data"]["operator"]["organization_id"],
        default_workspace.organization_id.to_string()
    );
    assert_eq!(
        call(
            &app,
            "POST",
            "/api/v1/session/invitations",
            &owner.token,
            json!({"token": token}),
        )
        .await
        .0,
        StatusCode::NOT_FOUND
    );

    let events: Vec<String> = sqlx::query_scalar(
        "SELECT action FROM member_invitation_events WHERE invitation_id = $1 ORDER BY created_at, id",
    )
    .bind(
        created.1["invitation"]["id"]
            .as_str()
            .unwrap()
            .parse::<Uuid>()
            .unwrap(),
    )
    .fetch_all(&pool)
    .await
    .unwrap();
    assert_eq!(events, vec!["created".to_string(), "accepted".to_string()]);

    // The recipient's original scoped membership is unchanged; inviting did not
    // widen existing access or rewrite the consumed invitation.
    let (role, project): (String, Option<Uuid>) =
        sqlx::query_as("SELECT role, project_id FROM admin_operators WHERE id = $1")
            .bind(recipient.operator_id)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(role, "viewer");
    assert_eq!(project, Some(other_workspace.project_id));
}

async fn default_workspace_slug(pool: &PgPool) -> String {
    sqlx::query_scalar(
        "SELECT p.route_slug FROM default_workspace d JOIN projects p \
         ON p.organization_id = d.organization_id AND p.id = d.project_id",
    )
    .fetch_one(pool)
    .await
    .unwrap()
}

async fn new_recipient(store: &niu_storage::Store, name: &str, email: &str) -> String {
    let organization = store
        .create_organization(&format!("{name} Org"))
        .await
        .unwrap();
    let workspace = store
        .create_project(organization, "Workspace")
        .await
        .unwrap();
    let member = store
        .create_operator(
            OperatorScope {
                organization_id: organization,
                project_id: Some(workspace.project_id),
            },
            name,
            OperatorRole::Viewer,
            3_600,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    member_session(store, member.operator_id, email).await.0
}

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn replacement_cancellation_scope_and_replay_are_enforced(pool: PgPool) {
    let state = test_state(None, pool.clone());
    let workspace = state.store.default_workspace().await.unwrap();
    let organization = workspace.organization_id;
    let owner = state
        .store
        .create_operator(
            OperatorScope {
                organization_id: organization,
                project_id: None,
            },
            "Organization Owner",
            OperatorRole::Owner,
            3_600,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let project_owner = state
        .store
        .create_operator(
            OperatorScope {
                organization_id: organization,
                project_id: Some(workspace.project_id),
            },
            "Workspace Owner",
            OperatorRole::Owner,
            3_600,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let first_recipient =
        new_recipient(&state.store, "First Recipient", "first@example.test").await;
    let second_recipient =
        new_recipient(&state.store, "Second Recipient", "second@example.test").await;
    let invitations = format!("/api/v1/organizations/{organization}/invitations");
    let app = router(state);

    // A workspace-scoped owner cannot grant organization-wide access.
    assert_eq!(
        call(
            &app,
            "POST",
            &invitations,
            &project_owner.token,
            json!({"email":"first@example.test","role":"viewer","expires_in_seconds":3600}),
        )
        .await
        .0,
        StatusCode::NOT_FOUND
    );
    let first = call(
        &app,
        "POST",
        &invitations,
        &project_owner.token,
        json!({
            "email": "first@example.test",
            "role": "viewer",
            "project_id": workspace.project_id,
            "expires_in_seconds": 3600
        }),
    )
    .await;
    assert_eq!(first.0, StatusCode::CREATED, "{}", first.1);
    let first_token = first.1["token"].as_str().unwrap().to_string();

    // Replacing a pending invitation invalidates the earlier link.
    let replacement = call(
        &app,
        "POST",
        &invitations,
        &project_owner.token,
        json!({
            "email": "first@example.test",
            "role": "admin",
            "project_id": workspace.project_id,
            "expires_in_seconds": 3600
        }),
    )
    .await;
    assert_eq!(replacement.0, StatusCode::CREATED, "{}", replacement.1);
    let replacement_token = replacement.1["token"].as_str().unwrap().to_string();
    assert_ne!(replacement_token, first_token);
    assert_eq!(
        call(
            &app,
            "POST",
            "/api/v1/invitations/preview",
            &first_recipient,
            json!({"token": first_token}),
        )
        .await
        .1["data"]["status"],
        "canceled"
    );
    assert_eq!(
        call(
            &app,
            "POST",
            "/api/v1/session/invitations",
            &first_recipient,
            json!({"token": first_token}),
        )
        .await
        .0,
        StatusCode::NOT_FOUND
    );

    // Project-scoped owners see only their workspace's invitations; an
    // organization-wide invitation is neither visible nor cancellable.
    let workspace_list = call(&app, "GET", &invitations, &project_owner.token, Value::Null).await;
    assert_eq!(workspace_list.0, StatusCode::OK);
    assert!(
        workspace_list.1["data"]
            .as_array()
            .unwrap()
            .iter()
            .all(|invitation| invitation["project_id"] == workspace.project_id.to_string())
    );
    let organization_wide = call(
        &app,
        "POST",
        &invitations,
        &owner.token,
        json!({"email":"second@example.test","role":"viewer","expires_in_seconds":3600}),
    )
    .await;
    assert_eq!(
        organization_wide.0,
        StatusCode::CREATED,
        "{}",
        organization_wide.1
    );
    let organization_wide_id = organization_wide.1["invitation"]["id"]
        .as_str()
        .unwrap()
        .to_string();
    assert_eq!(
        call(
            &app,
            "DELETE",
            &format!("/api/v1/invitations/{organization_wide_id}"),
            &project_owner.token,
            Value::Null,
        )
        .await
        .0,
        StatusCode::NOT_FOUND
    );

    // A replacement can be accepted once, then accepted-invitation cancellation
    // is refused because member access is managed from the member list.
    let accepted = call(
        &app,
        "POST",
        "/api/v1/session/invitations",
        &first_recipient,
        json!({"token": replacement_token}),
    )
    .await;
    assert_eq!(accepted.0, StatusCode::OK, "{}", accepted.1);
    assert_eq!(accepted.1["data"]["operator"]["role"], "admin");
    let replacement_id = replacement.1["invitation"]["id"].as_str().unwrap();
    assert_eq!(
        call(
            &app,
            "DELETE",
            &format!("/api/v1/invitations/{replacement_id}"),
            &project_owner.token,
            Value::Null,
        )
        .await
        .0,
        StatusCode::CONFLICT
    );

    // Canceling a pending organization-wide invitation prevents redemption.
    let canceled = call(
        &app,
        "DELETE",
        &format!("/api/v1/invitations/{organization_wide_id}"),
        &owner.token,
        Value::Null,
    )
    .await;
    assert_eq!(canceled.0, StatusCode::NO_CONTENT);
    assert_eq!(
        call(
            &app,
            "POST",
            "/api/v1/session/invitations",
            &second_recipient,
            json!({"token": organization_wide.1["token"].as_str().unwrap()}),
        )
        .await
        .0,
        StatusCode::NOT_FOUND
    );

    // Expired invitations are not redeemable even though the secret is valid.
    let expiring = call(
        &app,
        "POST",
        &invitations,
        &owner.token,
        json!({"email":"second@example.test","role":"viewer","expires_in_seconds":3600}),
    )
    .await;
    assert_eq!(expiring.0, StatusCode::CREATED, "{}", expiring.1);
    sqlx::query(
        "UPDATE member_invitations SET created_at = clock_timestamp() - interval '2 hours', expires_at = clock_timestamp() - interval '1 hour' WHERE id = $1",
    )
    .bind(
        expiring.1["invitation"]["id"]
            .as_str()
            .unwrap()
            .parse::<Uuid>()
            .unwrap(),
    )
    .execute(&pool)
    .await
    .unwrap();
    assert_eq!(
        call(
            &app,
            "POST",
            "/api/v1/session/invitations",
            &second_recipient,
            json!({"token": expiring.1["token"].as_str().unwrap()}),
        )
        .await
        .0,
        StatusCode::NOT_FOUND
    );

    // Invalid input is rejected before storage mutation.
    assert_eq!(
        call(
            &app,
            "POST",
            &invitations,
            &owner.token,
            json!({"email":"person@example.test","role":"viewer","expires_in_seconds":60}),
        )
        .await
        .0,
        StatusCode::BAD_REQUEST
    );
}
