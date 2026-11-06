use niu_storage::{AssetLibraryCreate, AssetLibraryKind, AssetLibraryLimits, Store, StoreError};
use sha2::{Digest, Sha256};
use sqlx::PgPool;
use uuid::Uuid;

const BYTES: &[u8] = b"exact workspace image bytes";

fn seal(_aad: &[u8], bytes: &[u8]) -> Result<Vec<u8>, StoreError> {
    let mut sealed = vec![7u8; 28];
    sealed.extend_from_slice(bytes);
    Ok(sealed)
}

fn open(_aad: &[u8], bytes: &[u8]) -> Result<Vec<u8>, StoreError> {
    if bytes.len() < 28 {
        return Err(StoreError::InvalidObservation);
    }
    Ok(bytes[28..].to_vec())
}

async fn asset(
    store: &Store,
    scope: niu_storage::TenantScope,
    name: &str,
) -> niu_storage::AssetLibraryAsset {
    store
        .create_workspace_asset(
            scope,
            AssetLibraryCreate {
                id: Uuid::new_v4(),
                name,
                kind: AssetLibraryKind::Image,
                content_type: "image/png",
                bytes: BYTES,
                actor: "test",
            },
            AssetLibraryLimits::default(),
            seal,
        )
        .await
        .unwrap()
}

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn workspace_source_capabilities_are_scoped_content_bound_and_bounded(pool: PgPool) {
    tokio::task::spawn_blocking(move || {
        tokio::runtime::Runtime::new().unwrap().block_on(async move {
            let store = Store::from_pool(pool.clone());
            let scope = store.default_workspace().await.unwrap();
            let key = store
                .issue_key(scope, "source capability test", &["*".to_string()], 3600)
                .await
                .unwrap();
            let principal = store.dashboard_key_by_id(key.id).await.unwrap();
            let first = asset(&store, scope, "First image").await;

            let access = store
                .issue_workspace_asset_source_access(&principal, first.id)
                .await
                .unwrap()
                .expect("active workspace asset issues once");
            let delivered = store
                .deliver_workspace_asset_source(access.token(), open)
                .await
                .unwrap()
                .expect("valid capability delivers");
            assert_eq!(delivered.content_type(), "image/png");
            assert_eq!(delivered.into_parts().1, BYTES);

            // Four deliveries are allowed; the fifth is refused.
            for _ in 0..3 {
                assert!(store
                    .deliver_workspace_asset_source(access.token(), open)
                    .await
                    .unwrap()
                    .is_some());
            }
            assert!(store
                .deliver_workspace_asset_source(access.token(), open)
                .await
                .unwrap()
                .is_none());

            // Expiry invalidates an otherwise valid capability.
            let expired = store
                .issue_workspace_asset_source_access(&principal, first.id)
                .await
                .unwrap()
                .unwrap();
            let digest: [u8; 32] = Sha256::digest(expired.token().as_bytes()).into();
            sqlx::query("UPDATE workspace_asset_source_access SET created_at=clock_timestamp()-interval '2 minutes',expires_at=clock_timestamp()-interval '1 minute' WHERE token_sha256=$1")
                .bind(digest.as_slice())
                .execute(&pool)
                .await
                .unwrap();
            assert!(store
                .deliver_workspace_asset_source(expired.token(), open)
                .await
                .unwrap()
                .is_none());

            // The capability is bound to the exact current content hash.
            let tampered = store
                .issue_workspace_asset_source_access(&principal, first.id)
                .await
                .unwrap()
                .unwrap();
            let digest: [u8; 32] = Sha256::digest(tampered.token().as_bytes()).into();
            sqlx::query("UPDATE workspace_asset_source_access SET content_sha256=$2 WHERE token_sha256=$1")
                .bind(digest.as_slice())
                .bind("b".repeat(64))
                .execute(&pool)
                .await
                .unwrap();
            assert!(store
                .deliver_workspace_asset_source(tampered.token(), open)
                .await
                .unwrap()
                .is_none());

            // Deletion erases content and invalidates every outstanding capability.
            let deleted = store
                .issue_workspace_asset_source_access(&principal, first.id)
                .await
                .unwrap()
                .unwrap();
            assert!(store
                .delete_workspace_asset(scope, first.id, None, "test")
                .await
                .unwrap());
            assert!(store
                .deliver_workspace_asset_source(deleted.token(), open)
                .await
                .unwrap()
                .is_none());

            // A foreign workspace asset cannot be issued from this principal.
            let other_scope = store
                .create_project(scope.organization_id, "Other source workspace")
                .await
                .unwrap();
            let other_key = store
                .issue_key(other_scope, "other source key", &["*".to_string()], 3600)
                .await
                .unwrap();
            let other_principal = store.dashboard_key_by_id(other_key.id).await.unwrap();
            let other_asset = asset(&store, other_scope, "Other image").await;
            assert!(store
                .issue_workspace_asset_source_access(&principal, other_asset.id)
                .await
                .unwrap()
                .is_none());
            assert!(store
                .issue_workspace_asset_source_access(&other_principal, other_asset.id)
                .await
                .unwrap()
                .is_some());

            // A well-formed but unknown capability never delivers.
            assert!(store
                .deliver_workspace_asset_source(
                    &format!("nws_{}", "0".repeat(64)),
                    open,
                )
                .await
                .unwrap()
                .is_none());
        })
    })
    .await
    .unwrap();
}
