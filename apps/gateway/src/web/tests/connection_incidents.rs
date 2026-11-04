use super::*;
use axum::body::{Body, to_bytes};
use niu_storage::{OperatorAuditActor, OperatorRole, OperatorScope, VendorInput};

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn connection_incident_reads_require_platform_authority_and_disable_caching(pool: PgPool) {
    let state = test_state(None, pool);
    let scope = state.store.default_workspace().await.unwrap();
    let owner = state
        .store
        .create_operator(
            OperatorScope {
                organization_id: scope.organization_id,
                project_id: None,
            },
            "Workspace owner",
            OperatorRole::Owner,
            3600,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let vendor = state
        .store
        .create_vendor(VendorInput {
            id: Uuid::new_v4(),
            name: "Incident API fixture".into(),
            adapter: "openai".into(),
            api_base: "https://example.test/v1".into(),
            enabled: true,
            credential_ciphertext: vec![1; 48],
        })
        .await
        .unwrap();
    let app = router(state);
    let path = format!("/api/v1/vendors/{}/incidents", vendor.id);
    for path in [&path, "/api/v1/incidents"] {
        for (token, expected) in [
            (None, StatusCode::UNAUTHORIZED),
            (Some(owner.token.as_str()), StatusCode::FORBIDDEN),
            (
                Some("niu-test-admin-token-that-is-long-1234"),
                StatusCode::OK,
            ),
        ] {
            let mut request = Request::builder().uri(path);
            if let Some(token) = token {
                request = request.header("authorization", format!("Bearer {token}"));
            }
            let response = app
                .clone()
                .oneshot(request.body(Body::empty()).unwrap())
                .await
                .unwrap();
            assert_eq!(response.status(), expected);
            if expected == StatusCode::OK {
                assert_eq!(response.headers()["cache-control"], "no-store");
                let data: Value =
                    serde_json::from_slice(&to_bytes(response.into_body(), 8192).await.unwrap())
                        .unwrap();
                assert_eq!(data, json!({"data":[],"next_before":null}));
            }
        }
    }
}
