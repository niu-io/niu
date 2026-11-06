use super::{router, test_state};
use crate::vendors::crypto::CredentialCipher;
use axum::{
    body::Body,
    http::{Request, StatusCode},
};
use http_body_util::BodyExt;
use niu_storage::{AssetLibraryCreate, AssetLibraryKind, AssetLibraryLimits};
use sqlx::PgPool;
use std::sync::Arc;
use tower::ServiceExt;
use uuid::Uuid;

const BYTES: &[u8] = b"exact workspace image bytes";

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn workspace_source_capability_delivers_exact_bytes_four_times_only(pool: PgPool) {
    tokio::task::spawn_blocking(move || {
        tokio::runtime::Runtime::new()
            .unwrap()
            .block_on(async move {
                let mut state = test_state(None, pool.clone());
                let cipher = Arc::new(
                    CredentialCipher::new("workspace-source-route-test-secret-at-least-32")
                        .unwrap(),
                );
                state.vendor_cipher = Some(cipher.clone());
                std::sync::Arc::make_mut(&mut state.config)
                    .server
                    .image_source_origin = Some("https://niu.example".into());
                let store = state.store.clone();
                let scope = store.default_workspace().await.unwrap();
                let key = store
                    .issue_key(scope, "source route test", &["*".to_string()], 3600)
                    .await
                    .unwrap();
                let principal = store.dashboard_key_by_id(key.id).await.unwrap();
                let asset = store
                    .create_workspace_asset(
                        scope,
                        AssetLibraryCreate {
                            id: Uuid::new_v4(),
                            name: "Source image",
                            kind: AssetLibraryKind::Image,
                            content_type: "image/png",
                            bytes: BYTES,
                            actor: "test",
                        },
                        AssetLibraryLimits::default(),
                        |aad, bytes| {
                            cipher
                                .seal_bytes_with_aad(aad, bytes)
                                .map_err(|_| niu_storage::StoreError::InvalidObservation)
                        },
                    )
                    .await
                    .unwrap();
                let access = store
                    .issue_workspace_asset_source_access(&principal, asset.id)
                    .await
                    .unwrap()
                    .unwrap();
                let app = router(state);

                for _ in 0..4 {
                    let response = app
                        .clone()
                        .oneshot(
                            Request::builder()
                                .uri(format!("/v1/media/sources/{}", access.token()))
                                .body(Body::empty())
                                .unwrap(),
                        )
                        .await
                        .unwrap();
                    assert_eq!(response.status(), StatusCode::OK);
                    assert_eq!(response.headers().get("content-type").unwrap(), "image/png");
                    assert!(
                        response
                            .headers()
                            .get("cache-control")
                            .unwrap()
                            .to_str()
                            .unwrap()
                            .starts_with("no-store")
                    );
                    let body = response.into_body().collect().await.unwrap().to_bytes();
                    assert_eq!(body.as_ref(), BYTES);
                }

                let exhausted = app
                    .clone()
                    .oneshot(
                        Request::builder()
                            .uri(format!("/v1/media/sources/{}", access.token()))
                            .body(Body::empty())
                            .unwrap(),
                    )
                    .await
                    .unwrap();
                assert_eq!(exhausted.status(), StatusCode::NOT_FOUND);

                let invalid = app
                    .clone()
                    .oneshot(
                        Request::builder()
                            .uri(format!("/v1/media/sources/nws_{}", "0".repeat(64)))
                            .body(Body::empty())
                            .unwrap(),
                    )
                    .await
                    .unwrap();
                assert_eq!(invalid.status(), StatusCode::NOT_FOUND);

                let head = app
                    .oneshot(
                        Request::builder()
                            .method("HEAD")
                            .uri(format!("/v1/media/sources/{}", access.token()))
                            .body(Body::empty())
                            .unwrap(),
                    )
                    .await
                    .unwrap();
                assert_eq!(head.status(), StatusCode::METHOD_NOT_ALLOWED);
            })
    })
    .await
    .unwrap();
}
