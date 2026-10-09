use niu_storage::{
    AssetOperationQualification, MIGRATOR, OperatorAuditActor, Store, StoreError, VendorInput,
};
use sqlx::PgPool;
use uuid::Uuid;

fn qualification(vendor: Uuid, seconds: i32) -> AssetOperationQualification {
    AssetOperationQualification {
        vendor_id: vendor,
        vendor_revision: 1,
        credential_revision: 1,
        rights_sha256: [1; 32],
        protocol_sha256: [2; 32],
        data_handling_sha256: [3; 32],
        free_operation_sha256: [4; 32],
        valid_for_seconds: seconds,
    }
}
#[sqlx::test]
#[ignore = "requires PostgreSQL with test database creation permission"]
async fn qualifications_are_exact_expiring_immutable_and_revocable(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let org = store
        .create_organization("Asset qualification fixture")
        .await
        .unwrap();
    let scope = store
        .create_project(org, "Authorized workspace")
        .await
        .unwrap();
    let other = store.create_project(org, "Other workspace").await.unwrap();
    let vendor = Uuid::new_v4();
    store
        .create_vendor(VendorInput {
            id: vendor,
            name: "Direct Ark fixture".into(),
            adapter: "openai".into(),
            api_base: "https://ark.cn-beijing.volcengineapi.com/api/v3".into(),
            enabled: false,
            credential_ciphertext: vec![1; 48],
        })
        .await
        .unwrap();
    store
        .save_asset_management_credential(vendor, 0, "original-project", &[1; 48])
        .await
        .unwrap();
    assert!(
        !store
            .asset_group_creation_is_qualified(scope, vendor, 1, 1)
            .await
            .unwrap()
    );
    let id = store
        .qualify_asset_group_creation(
            scope,
            qualification(vendor, 60),
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    assert!(
        store
            .asset_group_creation_is_qualified(scope, vendor, 1, 1)
            .await
            .unwrap()
    );
    assert!(
        !store
            .asset_group_read_is_qualified(scope, vendor, 1, 1)
            .await
            .unwrap()
    );
    let read = store
        .qualify_asset_group_read(
            scope,
            qualification(vendor, 60),
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    assert!(
        store
            .asset_group_read_is_qualified(scope, vendor, 1, 1)
            .await
            .unwrap()
    );
    // Even simultaneous create/read grants cannot authorize listing.
    assert!(
        !store
            .asset_listing_is_qualified(scope, vendor, 1, 1)
            .await
            .unwrap()
    );
    let listing = store
        .qualify_asset_listing(
            scope,
            qualification(vendor, 60),
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    assert!(
        store
            .asset_listing_is_qualified(scope, vendor, 1, 1)
            .await
            .unwrap()
    );
    // Creation, group read and listing must not imply individual asset reads.
    assert!(
        !store
            .asset_lookup_is_qualified(scope, vendor, 1, 1)
            .await
            .unwrap()
    );
    let lookup = store
        .qualify_asset_lookup(
            scope,
            qualification(vendor, 60),
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    assert!(
        store
            .asset_lookup_is_qualified(scope, vendor, 1, 1)
            .await
            .unwrap()
    );
    assert!(
        !store
            .asset_group_update_is_qualified(scope, vendor, 1, 1)
            .await
            .unwrap()
    );
    let update = store
        .qualify_asset_group_update(
            scope,
            qualification(vendor, 60),
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    assert!(
        store
            .asset_group_update_is_qualified(scope, vendor, 1, 1)
            .await
            .unwrap()
    );
    // All existing grants together must still not authorize cascading deletion.
    assert!(
        !store
            .asset_group_deletion_is_qualified(scope, vendor, 1, 1)
            .await
            .unwrap()
    );
    let deletion = store
        .qualify_asset_group_deletion(
            scope,
            qualification(vendor, 60),
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    assert!(
        store
            .asset_group_deletion_is_qualified(scope, vendor, 1, 1)
            .await
            .unwrap()
    );
    for (target, account_revision, credential_revision) in
        [(other, 1, 1), (scope, 2, 1), (scope, 1, 2)]
    {
        assert!(
            !store
                .asset_group_deletion_is_qualified(
                    target,
                    vendor,
                    account_revision,
                    credential_revision
                )
                .await
                .unwrap()
        );
    }
    let deletion_operation: String =
        sqlx::query_scalar("SELECT operation FROM asset_operation_authorizations WHERE id=$1")
            .bind(deletion)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(deletion_operation, "DeleteAssetGroup");
    assert!(
        sqlx::query(
            "UPDATE asset_operation_authorizations SET operation='GetAssetGroup' WHERE id=$1"
        )
        .bind(deletion)
        .execute(&pool)
        .await
        .is_err()
    );
    assert!(
        sqlx::query("DELETE FROM asset_operation_authorizations WHERE id=$1")
            .bind(deletion)
            .execute(&pool)
            .await
            .is_err()
    );
    store
        .revoke_asset_operation_authorization(deletion, OperatorAuditActor::Installation)
        .await
        .unwrap();
    assert!(
        !store
            .asset_group_deletion_is_qualified(scope, vendor, 1, 1)
            .await
            .unwrap()
    );
    assert!(
        store
            .asset_group_update_is_qualified(scope, vendor, 1, 1)
            .await
            .unwrap()
    );
    // All existing grants together must still not authorize media ingestion.
    assert!(
        !store
            .asset_creation_is_qualified(scope, vendor, 1, 1)
            .await
            .unwrap()
    );
    let ingestion = store
        .qualify_asset_creation(
            scope,
            qualification(vendor, 60),
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    assert!(
        store
            .asset_creation_is_qualified(scope, vendor, 1, 1)
            .await
            .unwrap()
    );
    for (target, account_revision, credential_revision) in
        [(other, 1, 1), (scope, 2, 1), (scope, 1, 2)]
    {
        assert!(
            !store
                .asset_creation_is_qualified(target, vendor, account_revision, credential_revision)
                .await
                .unwrap()
        );
    }
    let ingestion_operation: String =
        sqlx::query_scalar("SELECT operation FROM asset_operation_authorizations WHERE id=$1")
            .bind(ingestion)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(ingestion_operation, "CreateAsset");
    assert!(
        sqlx::query(
            "UPDATE asset_operation_authorizations SET operation='GetAssetGroup' WHERE id=$1"
        )
        .bind(ingestion)
        .execute(&pool)
        .await
        .is_err()
    );
    assert!(
        sqlx::query("DELETE FROM asset_operation_authorizations WHERE id=$1")
            .bind(ingestion)
            .execute(&pool)
            .await
            .is_err()
    );
    store
        .revoke_asset_operation_authorization(ingestion, OperatorAuditActor::Installation)
        .await
        .unwrap();
    assert!(
        !store
            .asset_creation_is_qualified(scope, vendor, 1, 1)
            .await
            .unwrap()
    );
    assert!(
        store
            .asset_group_update_is_qualified(scope, vendor, 1, 1)
            .await
            .unwrap()
    );
    for (target, account_revision, credential_revision) in
        [(other, 1, 1), (scope, 2, 1), (scope, 1, 2)]
    {
        assert!(
            !store
                .asset_group_update_is_qualified(
                    target,
                    vendor,
                    account_revision,
                    credential_revision
                )
                .await
                .unwrap()
        );
    }
    store
        .revoke_asset_operation_authorization(update, OperatorAuditActor::Installation)
        .await
        .unwrap();
    assert!(
        !store
            .asset_group_update_is_qualified(scope, vendor, 1, 1)
            .await
            .unwrap()
    );
    assert!(
        store
            .asset_lookup_is_qualified(scope, vendor, 1, 1)
            .await
            .unwrap()
    );
    assert!(
        store
            .asset_listing_is_qualified(scope, vendor, 1, 1)
            .await
            .unwrap()
    );
    assert!(
        store
            .asset_group_creation_is_qualified(scope, vendor, 1, 1)
            .await
            .unwrap()
    );
    assert!(
        store
            .asset_group_read_is_qualified(scope, vendor, 1, 1)
            .await
            .unwrap()
    );
    for (target, account_revision, credential_revision) in
        [(other, 1, 1), (scope, 2, 1), (scope, 1, 2)]
    {
        assert!(
            !store
                .asset_lookup_is_qualified(target, vendor, account_revision, credential_revision)
                .await
                .unwrap()
        );
    }
    store
        .revoke_asset_operation_authorization(lookup, OperatorAuditActor::Installation)
        .await
        .unwrap();
    assert!(
        !store
            .asset_lookup_is_qualified(scope, vendor, 1, 1)
            .await
            .unwrap()
    );
    assert!(
        store
            .asset_group_read_is_qualified(scope, vendor, 1, 1)
            .await
            .unwrap()
    );
    for (target, account_revision, credential_revision) in
        [(other, 1, 1), (scope, 2, 1), (scope, 1, 2)]
    {
        assert!(
            !store
                .asset_listing_is_qualified(target, vendor, account_revision, credential_revision)
                .await
                .unwrap()
        );
    }
    store
        .revoke_asset_operation_authorization(listing, OperatorAuditActor::Installation)
        .await
        .unwrap();
    assert!(
        !store
            .asset_listing_is_qualified(scope, vendor, 1, 1)
            .await
            .unwrap()
    );
    assert!(
        store
            .asset_group_read_is_qualified(scope, vendor, 1, 1)
            .await
            .unwrap()
    );
    assert!(
        store
            .asset_group_creation_is_qualified(scope, vendor, 1, 1)
            .await
            .unwrap()
    );
    for (target, account_revision, credential_revision) in
        [(other, 1, 1), (scope, 2, 1), (scope, 1, 2)]
    {
        assert!(
            !store
                .asset_group_read_is_qualified(
                    target,
                    vendor,
                    account_revision,
                    credential_revision
                )
                .await
                .unwrap()
        );
    }
    store
        .revoke_asset_operation_authorization(read, OperatorAuditActor::Installation)
        .await
        .unwrap();
    assert!(
        !store
            .asset_group_read_is_qualified(scope, vendor, 1, 1)
            .await
            .unwrap()
    );
    assert!(
        store
            .asset_group_creation_is_qualified(scope, vendor, 1, 1)
            .await
            .unwrap()
    );
    assert!(
        !store
            .asset_group_creation_is_qualified(other, vendor, 1, 1)
            .await
            .unwrap()
    );
    assert!(
        !store
            .asset_group_creation_is_qualified(scope, vendor, 2, 1)
            .await
            .unwrap()
    );
    assert!(
        !store
            .asset_group_creation_is_qualified(scope, vendor, 1, 2)
            .await
            .unwrap()
    );
    assert!(sqlx::query("UPDATE asset_operation_authorizations SET expires_at=expires_at+interval '1 day' WHERE id=$1").bind(id).execute(&pool).await.is_err());
    assert!(
        sqlx::query("DELETE FROM asset_operation_authorizations WHERE id=$1")
            .bind(id)
            .execute(&pool)
            .await
            .is_err()
    );
    assert!(
        store
            .revoke_asset_operation_authorization(id, OperatorAuditActor::Installation)
            .await
            .unwrap()
    );
    assert!(
        !store
            .revoke_asset_operation_authorization(id, OperatorAuditActor::Installation)
            .await
            .unwrap()
    );
    assert!(
        !store
            .asset_group_creation_is_qualified(scope, vendor, 1, 1)
            .await
            .unwrap()
    );
    let read_only = store
        .qualify_asset_group_read(
            scope,
            qualification(vendor, 60),
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    assert!(
        store
            .asset_group_read_is_qualified(scope, vendor, 1, 1)
            .await
            .unwrap()
    );
    assert!(
        !store
            .asset_group_creation_is_qualified(scope, vendor, 1, 1)
            .await
            .unwrap()
    );
    store
        .revoke_asset_operation_authorization(read_only, OperatorAuditActor::Installation)
        .await
        .unwrap();
    let expiring = store
        .qualify_asset_group_creation(
            scope,
            qualification(vendor, 1),
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    sqlx::query("SELECT pg_sleep(1.1)")
        .execute(&pool)
        .await
        .unwrap();
    assert!(
        !store
            .asset_group_creation_is_qualified(scope, vendor, 1, 1)
            .await
            .unwrap()
    );
    assert_ne!(id, expiring);
    for seconds in [0, -1, 7_776_001] {
        assert!(matches!(
            store
                .qualify_asset_group_creation(
                    scope,
                    qualification(vendor, seconds),
                    OperatorAuditActor::Installation
                )
                .await,
            Err(StoreError::InvalidObservation)
        ));
    }
    let mut missing = qualification(vendor, 60);
    missing.free_operation_sha256 = [0; 32];
    assert!(matches!(
        store
            .qualify_asset_group_creation(scope, missing, OperatorAuditActor::Installation)
            .await,
        Err(StoreError::InvalidObservation)
    ));
    store
        .qualify_asset_group_creation(
            scope,
            qualification(vendor, 60),
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    store
        .revoke_asset_management_credentials(vendor, 1, false)
        .await
        .unwrap();
    assert!(
        !store
            .asset_group_creation_is_qualified(scope, vendor, 1, 1)
            .await
            .unwrap()
    );
    assert!(matches!(
        store
            .qualify_asset_group_creation(
                scope,
                qualification(vendor, 60),
                OperatorAuditActor::Installation
            )
            .await,
        Err(StoreError::Conflict)
    ));
}

#[sqlx::test]
#[ignore = "requires PostgreSQL with test database creation permission"]
async fn asset_handoff_requires_live_exact_qualification_and_records_it_atomically(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let scope = store.default_workspace().await.unwrap();
    let other = store
        .create_project(scope.organization_id, "Other asset workspace")
        .await
        .unwrap();
    let vendor = Uuid::new_v4();
    store
        .create_vendor(VendorInput {
            id: vendor,
            name: "Handoff qualification fixture".into(),
            adapter: "openai".into(),
            api_base: "https://ark.cn-beijing.volcengineapi.com/api/v3".into(),
            enabled: false,
            credential_ciphertext: vec![1; 48],
        })
        .await
        .unwrap();
    store
        .save_asset_management_credential(vendor, 0, "bound-project", &[1; 48])
        .await
        .unwrap();
    let request =
        niu_media::asset_group::OrdinaryAssetGroupCreate::new("Character".into(), None).unwrap();
    let intent = store
        .prepare_asset_group_create(scope, Uuid::new_v4(), vendor, 1, &request)
        .await
        .unwrap();
    assert!(
        store
            .claim_asset_group_create_credentials(scope, intent.id)
            .await
            .unwrap()
            .is_none()
    );
    store
        .qualify_asset_group_creation(
            other,
            qualification(vendor, 60),
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    assert!(
        store
            .claim_asset_group_create_credentials(scope, intent.id)
            .await
            .unwrap()
            .is_none()
    );
    store
        .qualify_asset_group_creation(
            scope,
            qualification(vendor, 1),
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    sqlx::query("SELECT pg_sleep(1.1)")
        .execute(&pool)
        .await
        .unwrap();
    assert!(
        store
            .claim_asset_group_create_credentials(scope, intent.id)
            .await
            .unwrap()
            .is_none()
    );
    let grant = store
        .qualify_asset_group_creation(
            scope,
            qualification(vendor, 60),
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    // A revocation holding the account lock must win before a waiting claim.
    let mut revoke = pool.begin().await.unwrap();
    sqlx::query("SELECT id FROM vendors WHERE id=$1 FOR UPDATE")
        .bind(vendor)
        .execute(&mut *revoke)
        .await
        .unwrap();
    sqlx::query("INSERT INTO asset_operation_authorization_revocations(authorization_id,actor_kind) VALUES($1,'installation')").bind(grant).execute(&mut *revoke).await.unwrap();
    let claiming = store.clone();
    let mut task = tokio::spawn(async move {
        claiming
            .claim_asset_group_create_credentials(scope, intent.id)
            .await
    });
    assert!(
        tokio::time::timeout(std::time::Duration::from_millis(100), &mut task)
            .await
            .is_err()
    );
    revoke.commit().await.unwrap();
    assert!(task.await.unwrap().unwrap().is_none());
    let saved = store
        .asset_group_create_intent(scope, intent.id)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(saved.state, "prepared");
    let count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM asset_group_dispatch_authorizations WHERE intent_id=$1",
    )
    .bind(intent.id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(count, 0);
    let valid = store
        .qualify_asset_group_creation(
            scope,
            qualification(vendor, 60),
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    // A still-active qualification for revision one never authorizes new keys.
    store
        .save_asset_management_credential(vendor, 1, "bound-project", &[1; 48])
        .await
        .unwrap();
    let rotated = store
        .prepare_asset_group_create(scope, Uuid::new_v4(), vendor, 2, &request)
        .await
        .unwrap();
    assert!(
        store
            .claim_asset_group_create_credentials(scope, rotated.id)
            .await
            .unwrap()
            .is_none()
    );
    assert_eq!(
        store
            .asset_group_create_intent(scope, rotated.id)
            .await
            .unwrap()
            .unwrap()
            .state,
        "prepared"
    );
    sqlx::query("CREATE FUNCTION fail_dispatch_authorization_fixture() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture receipt unavailable'; END; $$")
        .execute(&pool).await.unwrap();
    sqlx::query("CREATE TRIGGER fail_dispatch_authorization_fixture BEFORE INSERT ON asset_group_dispatch_authorizations FOR EACH ROW EXECUTE FUNCTION fail_dispatch_authorization_fixture()")
        .execute(&pool).await.unwrap();
    assert!(
        store
            .claim_asset_group_create_credentials(scope, intent.id)
            .await
            .is_err()
    );
    assert_eq!(
        store
            .asset_group_create_intent(scope, intent.id)
            .await
            .unwrap()
            .unwrap()
            .state,
        "prepared"
    );
    sqlx::query(
        "DROP TRIGGER fail_dispatch_authorization_fixture ON asset_group_dispatch_authorizations",
    )
    .execute(&pool)
    .await
    .unwrap();
    let claimed = store
        .claim_asset_group_create_credentials(scope, intent.id)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(claimed.authorization_id, valid);
    let receipt: Uuid = sqlx::query_scalar(
        "SELECT authorization_id FROM asset_group_dispatch_authorizations WHERE intent_id=$1",
    )
    .bind(intent.id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(receipt, valid);
    assert!(
        sqlx::query(
            "UPDATE asset_group_dispatch_authorizations SET authorization_id=$2 WHERE intent_id=$1"
        )
        .bind(intent.id)
        .bind(grant)
        .execute(&pool)
        .await
        .is_err()
    );
    assert!(
        sqlx::query("DELETE FROM asset_group_dispatch_authorizations WHERE intent_id=$1")
            .bind(intent.id)
            .execute(&pool)
            .await
            .is_err()
    );
    assert!(
        !store
            .record_asset_group_dispatch_outcome(other, intent.id, None, Some("timeout"), 5)
            .await
            .unwrap()
    );
    assert!(
        store
            .record_asset_group_dispatch_outcome(scope, intent.id, None, None, 5)
            .await
            .is_err()
    );
    assert!(
        store
            .record_asset_group_dispatch_outcome(scope, intent.id, None, Some("timeout"), -1)
            .await
            .is_err()
    );
    sqlx::query("CREATE FUNCTION fail_dispatch_outcome_fixture() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture outcome audit unavailable'; END; $$").execute(&pool).await.unwrap();
    sqlx::query("CREATE TRIGGER fail_dispatch_outcome_fixture BEFORE INSERT ON asset_group_dispatch_outcomes FOR EACH ROW EXECUTE FUNCTION fail_dispatch_outcome_fixture()").execute(&pool).await.unwrap();
    assert!(
        store
            .record_asset_group_dispatch_outcome(
                scope,
                intent.id,
                Some("group-outcome-fixture"),
                None,
                42
            )
            .await
            .is_err()
    );
    assert_eq!(
        store
            .asset_group_create_intent(scope, intent.id)
            .await
            .unwrap()
            .unwrap()
            .state,
        "dispatching"
    );
    sqlx::query("DROP TRIGGER fail_dispatch_outcome_fixture ON asset_group_dispatch_outcomes")
        .execute(&pool)
        .await
        .unwrap();
    assert!(
        store
            .record_asset_group_dispatch_outcome(
                scope,
                intent.id,
                None,
                Some("upstream_uncertain"),
                42
            )
            .await
            .unwrap()
    );
    assert!(
        !store
            .record_asset_group_dispatch_outcome(scope, intent.id, None, Some("timeout"), 43)
            .await
            .unwrap()
    );
    let detail = store
        .asset_group_request_detail(scope, intent.id)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(detail["dispatch"]["duration_ms"], 42);
    assert_eq!(detail["dispatch"]["reason"], "upstream_uncertain");
    assert!(!detail.to_string().contains(&valid.to_string()));
    store
        .revoke_asset_operation_authorization(valid, OperatorAuditActor::Installation)
        .await
        .unwrap();
    assert!(
        store
            .claim_asset_group_create_credentials(scope, intent.id)
            .await
            .unwrap()
            .is_none()
    );
    assert!(
        !store
            .mark_asset_group_create_uncertain(scope, intent.id)
            .await
            .unwrap()
    );
    assert!(
        store
            .complete_asset_group_create(scope, intent.id, "group-existing-receipt")
            .await
            .unwrap()
    );
}

#[sqlx::test]
#[ignore = "requires PostgreSQL with test database creation permission"]
async fn asset_reads_claim_original_group_once_and_audit_without_billing(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let org = store
        .create_organization("Read audit fixture")
        .await
        .unwrap();
    let scope = store
        .create_project(org, "Original workspace")
        .await
        .unwrap();
    let other = store.create_project(org, "Other workspace").await.unwrap();
    let vendor = Uuid::new_v4();
    store
        .create_vendor(VendorInput {
            id: vendor,
            name: "Read fixture".into(),
            adapter: "openai".into(),
            api_base: "https://ark.cn-beijing.volcengineapi.com/api/v3".into(),
            enabled: false,
            credential_ciphertext: vec![1; 48],
        })
        .await
        .unwrap();
    store
        .save_asset_management_credential(vendor, 0, "original-project", &[1; 48])
        .await
        .unwrap();
    store
        .qualify_asset_group_creation(
            scope,
            qualification(vendor, 60),
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let body =
        niu_media::asset_group::OrdinaryAssetGroupCreate::new("Character".into(), None).unwrap();
    let intent = store
        .prepare_asset_group_create(scope, Uuid::new_v4(), vendor, 1, &body)
        .await
        .unwrap();
    assert!(
        store
            .claim_asset_group_read(scope, intent.id, Uuid::new_v4())
            .await
            .unwrap()
            .is_none()
    );
    assert!(
        store
            .claim_asset_group_create(scope, intent.id)
            .await
            .unwrap()
    );
    assert!(
        store
            .record_asset_group_dispatch_outcome(scope, intent.id, Some("group-original"), None, 4)
            .await
            .unwrap()
    );
    assert!(
        store
            .claim_asset_group_read(scope, intent.id, Uuid::new_v4())
            .await
            .unwrap()
            .is_none()
    );
    let grant = store
        .qualify_asset_group_read(
            scope,
            qualification(vendor, 60),
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    assert!(
        store
            .claim_asset_group_read(other, intent.id, Uuid::new_v4())
            .await
            .unwrap()
            .is_none()
    );
    let read_id = Uuid::new_v4();
    let (first, second) = tokio::join!(
        store.claim_asset_group_read(scope, intent.id, read_id),
        store.claim_asset_group_read(scope, intent.id, read_id)
    );
    let (first, second) = (first.unwrap(), second.unwrap());
    assert_ne!(first.is_some(), second.is_some());
    let claimed = first.or(second).unwrap();
    assert_eq!(claimed.authorization_id, grant);
    assert_eq!(claimed.credential.revision, 1);
    assert_eq!(claimed.credential.upstream_project, "original-project");
    let signer = niu_media::asset_signing::AssetManagementSigner::new(
        "AKEXAMPLE".into(),
        "fixture-secret".into(),
    )
    .unwrap();
    let signed = signer
        .sign_get_group("20261008T000000Z", claimed.request())
        .unwrap();
    assert_eq!(
        serde_json::from_slice::<serde_json::Value>(&signed.body).unwrap(),
        serde_json::json!({"Id":"group-original","ProjectName":"original-project"})
    );
    assert!(
        !store
            .record_asset_group_read_outcome(other, read_id, None, 5)
            .await
            .unwrap()
    );
    assert!(matches!(
        store
            .record_asset_group_read_outcome(scope, read_id, Some("private upstream detail"), 5)
            .await,
        Err(StoreError::InvalidObservation)
    ));
    store
        .revoke_asset_operation_authorization(grant, OperatorAuditActor::Installation)
        .await
        .unwrap();
    assert!(
        store
            .claim_asset_group_read(scope, intent.id, Uuid::new_v4())
            .await
            .unwrap()
            .is_none()
    );
    assert!(
        store
            .record_asset_group_read_outcome(scope, read_id, None, 5)
            .await
            .unwrap()
    );
    assert!(
        !store
            .record_asset_group_read_outcome(scope, read_id, Some("timeout"), 8)
            .await
            .unwrap()
    );
    assert!(
        sqlx::query("DELETE FROM asset_group_read_claims WHERE id=$1")
            .bind(read_id)
            .execute(&pool)
            .await
            .is_err()
    );
    assert!(
        sqlx::query("UPDATE asset_group_read_outcomes SET duration_ms=9 WHERE read_id=$1")
            .bind(read_id)
            .execute(&pool)
            .await
            .is_err()
    );
    let outcome: (String, Option<String>, i64) = sqlx::query_as(
        "SELECT outcome,reason,duration_ms FROM asset_group_read_outcomes WHERE read_id=$1",
    )
    .bind(read_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(outcome, ("succeeded".into(), None, 5));
    assert_eq!(
        store
            .asset_group_create_intent(scope, intent.id)
            .await
            .unwrap()
            .unwrap()
            .state,
        "succeeded"
    );
    store
        .qualify_asset_group_read(
            scope,
            qualification(vendor, 60),
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    store
        .revoke_asset_management_credentials(vendor, 1, false)
        .await
        .unwrap();
    assert!(
        store
            .claim_asset_group_read(scope, intent.id, Uuid::new_v4())
            .await
            .unwrap()
            .is_none()
    );
    let claims: i64 = sqlx::query_scalar("SELECT count(*) FROM asset_group_read_claims")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(claims, 1);
    let financial_rows: i64 = sqlx::query_scalar("SELECT (SELECT count(*) FROM customer_balance_entries WHERE organization_id=$1)+(SELECT count(*) FROM customer_balance_reservations WHERE organization_id=$1)+(SELECT count(*) FROM customer_charges WHERE organization_id=$1)")
        .bind(org).fetch_one(&pool).await.unwrap();
    assert_eq!(financial_rows, 0);
}

#[sqlx::test]
#[ignore = "requires PostgreSQL with test database creation permission"]
async fn asset_listings_claim_original_group_once_and_audit_without_billing(pool: PgPool) {
    use niu_storage::AssetListingOutcome;
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let org = store.create_organization("Listing fixture").await.unwrap();
    let scope = store
        .create_project(org, "Original workspace")
        .await
        .unwrap();
    let other = store.create_project(org, "Other workspace").await.unwrap();
    let vendor = Uuid::new_v4();
    store
        .create_vendor(VendorInput {
            id: vendor,
            name: "Listing account".into(),
            adapter: "openai".into(),
            api_base: "https://ark.cn-beijing.volcengineapi.com/api/v3".into(),
            enabled: false,
            credential_ciphertext: vec![1; 48],
        })
        .await
        .unwrap();
    store
        .save_asset_management_credential(vendor, 0, "original-project", &[1; 48])
        .await
        .unwrap();
    store
        .qualify_asset_group_creation(
            scope,
            qualification(vendor, 60),
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let original_read_grant = store
        .qualify_asset_group_read(
            scope,
            qualification(vendor, 60),
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let body =
        niu_media::asset_group::OrdinaryAssetGroupCreate::new("Character".into(), None).unwrap();
    let intent = store
        .prepare_asset_group_create(scope, Uuid::new_v4(), vendor, 1, &body)
        .await
        .unwrap();
    let grant = store
        .qualify_asset_listing(
            scope,
            qualification(vendor, 60),
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    assert!(
        store
            .claim_asset_listing(scope, intent.id, Uuid::new_v4(), 2)
            .await
            .unwrap()
            .is_none()
    );
    assert!(
        store
            .claim_asset_group_create(scope, intent.id)
            .await
            .unwrap()
    );
    assert!(
        store
            .record_asset_group_dispatch_outcome(scope, intent.id, Some("group-original"), None, 1)
            .await
            .unwrap()
    );
    use niu_storage::PreparedAssetGroupUpdate;
    use sha2::{Digest, Sha256};
    let update_patch = niu_media::asset_group_update::OrdinaryGroupUpdate::new(
        niu_media::asset_read::OrdinaryGroupRead::new(
            "group-original".into(),
            "original-project".into(),
        )
        .unwrap(),
        Some("Renamed character".into()),
        Some(String::new()),
    )
    .unwrap();
    let plaintext = update_patch.encode_private().unwrap();
    let digest: [u8; 32] = Sha256::digest(&plaintext).into();
    // Opaque storage fixture; gateway authenticated encryption remains a separate gate.
    let prepared = |update_id| PreparedAssetGroupUpdate {
        intent_id: intent.id,
        update_id,
        patch_sha256: digest,
        ciphertext: vec![1; 48],
    };
    let revoked_update = Uuid::new_v4();
    assert!(
        store
            .prepare_asset_group_update(scope, prepared(revoked_update))
            .await
            .is_err()
    );
    let update_grant = store
        .qualify_asset_group_update(
            scope,
            qualification(vendor, 60),
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    assert!(
        store
            .prepare_asset_group_update(other, prepared(revoked_update))
            .await
            .is_err()
    );
    let mut invalid = prepared(Uuid::new_v4());
    invalid.patch_sha256 = [0; 32];
    assert!(
        store
            .prepare_asset_group_update(scope, invalid)
            .await
            .is_err()
    );
    let mut invalid = prepared(Uuid::new_v4());
    invalid.ciphertext = vec![1; 29];
    assert!(
        store
            .prepare_asset_group_update(scope, invalid)
            .await
            .is_err()
    );
    assert!(
        store
            .prepare_asset_group_update(scope, prepared(revoked_update))
            .await
            .unwrap()
    );
    assert!(
        !store
            .prepare_asset_group_update(scope, prepared(revoked_update))
            .await
            .unwrap()
    );
    let mut changed = prepared(revoked_update);
    changed.patch_sha256 = [9; 32];
    assert!(
        store
            .prepare_asset_group_update(scope, changed)
            .await
            .is_err()
    );
    store
        .revoke_asset_operation_authorization(update_grant, OperatorAuditActor::Installation)
        .await
        .unwrap();
    assert!(
        store
            .claim_asset_group_update(scope, revoked_update, |_| panic!(
                "revoked grant cannot decode"
            ))
            .await
            .unwrap()
            .is_none()
    );
    let update_grant = store
        .qualify_asset_group_update(
            scope,
            qualification(vendor, 60),
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    assert!(
        store
            .claim_asset_group_update(scope, revoked_update, |_| panic!(
                "new grant cannot transfer original intent"
            ))
            .await
            .unwrap()
            .is_none()
    );
    let erased_update = Uuid::new_v4();
    store
        .prepare_asset_group_update(scope, prepared(erased_update))
        .await
        .unwrap();
    assert!(
        !store
            .delete_asset_group_update_patch(other, erased_update)
            .await
            .unwrap()
    );
    assert!(
        store
            .delete_asset_group_update_patch(scope, erased_update)
            .await
            .unwrap()
    );
    assert!(
        !store
            .delete_asset_group_update_patch(scope, erased_update)
            .await
            .unwrap()
    );
    assert!(
        !store
            .prepare_asset_group_update(scope, prepared(erased_update))
            .await
            .unwrap()
    );
    assert!(
        store
            .claim_asset_group_update(scope, erased_update, |_| panic!(
                "erased patch cannot decode"
            ))
            .await
            .unwrap()
            .is_none()
    );
    let expired_update = Uuid::new_v4();
    sqlx::query("INSERT INTO asset_group_update_intents(id,intent_id,authorization_id,patch_sha256) VALUES($1,$2,$3,$4)").bind(expired_update).bind(intent.id).bind(update_grant).bind(digest.as_slice()).execute(&pool).await.unwrap();
    sqlx::query("INSERT INTO asset_group_update_patches(update_id,ciphertext,expires_at) VALUES($1,$2,clock_timestamp()-interval '1 second')").bind(expired_update).bind(vec![1u8;48]).execute(&pool).await.unwrap();
    assert!(
        store
            .claim_asset_group_update(scope, expired_update, |_| panic!(
                "expired patch cannot decode"
            ))
            .await
            .unwrap()
            .is_none()
    );
    store.purge_expired_request_payloads().await.unwrap();
    let expired: Option<Vec<u8>> =
        sqlx::query_scalar("SELECT ciphertext FROM asset_group_update_patches WHERE update_id=$1")
            .bind(expired_update)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert!(expired.is_none());
    let update_id = Uuid::new_v4();
    store
        .prepare_asset_group_update(scope, prepared(update_id))
        .await
        .unwrap();
    assert!(
        store
            .claim_asset_group_update(other, update_id, |_| panic!(
                "wrong workspace cannot decode"
            ))
            .await
            .unwrap()
            .is_none()
    );
    assert!(
        store
            .claim_asset_group_update(scope, update_id, |_| Err(StoreError::InvalidObservation))
            .await
            .is_err()
    );
    assert!(
        store
            .claim_asset_group_update(scope, update_id, |_| Ok(b"{}".to_vec()))
            .await
            .is_err()
    );
    let (a, b) = tokio::join!(
        store.claim_asset_group_update(scope, update_id, |bytes| {
            assert_eq!(bytes, &[1; 48]);
            Ok(plaintext.clone())
        }),
        store.claim_asset_group_update(scope, update_id, |_| Ok(plaintext.clone()))
    );
    let (a, b) = (a.unwrap(), b.unwrap());
    assert_ne!(a.is_some(), b.is_some());
    let mutation = a.or(b).unwrap();
    assert_eq!(mutation.authorization_id, update_grant);
    assert_eq!(mutation.request().encode_private().unwrap(), plaintext);
    assert_eq!(mutation.credential.upstream_project, "original-project");
    let blocked_update = Uuid::new_v4();
    store
        .prepare_asset_group_update(scope, prepared(blocked_update))
        .await
        .unwrap();
    assert!(
        store
            .claim_asset_group_update(scope, blocked_update, |_| panic!(
                "unresolved mutation holds group"
            ))
            .await
            .unwrap()
            .is_none()
    );
    assert!(
        sqlx::query("DELETE FROM asset_group_update_claims WHERE update_id=$1")
            .bind(update_id)
            .execute(&pool)
            .await
            .is_err()
    );
    assert!(
        sqlx::query("UPDATE asset_group_update_intents SET patch_sha256=$2 WHERE id=$1")
            .bind(update_id)
            .bind([7u8; 32].as_slice())
            .execute(&pool)
            .await
            .is_err()
    );
    assert!(
        sqlx::query("UPDATE asset_group_update_patches SET ciphertext=$2 WHERE update_id=$1")
            .bind(update_id)
            .bind(vec![1u8; 48])
            .execute(&pool)
            .await
            .is_err()
    );
    assert!(
        store
            .delete_asset_group_update_patch(scope, update_id)
            .await
            .unwrap()
    );
    assert!(
        store
            .claim_asset_group_update(scope, update_id, |_| panic!(
                "claimed mutation never replays"
            ))
            .await
            .unwrap()
            .is_none()
    );
    let held: Uuid =
        sqlx::query_scalar("SELECT update_id FROM asset_group_update_holds WHERE intent_id=$1")
            .bind(intent.id)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(held, update_id);
    use niu_storage::AssetGroupUpdateOutcome;
    let pending = store
        .asset_group_update_history(scope, vendor, None, 101)
        .await
        .unwrap();
    let unresolved = pending
        .iter()
        .find(|row| row["update_id"] == update_id.to_string())
        .unwrap();
    assert_eq!(unresolved["status"], "unresolved");
    assert_eq!(unresolved["patch_status"], "erased");
    assert_eq!(unresolved["reconciliation_required"], true);
    for field in ["completed_at", "duration_ms", "reason"] {
        assert!(unresolved[field].is_null());
    }
    let unsent = pending
        .iter()
        .find(|row| row["update_id"] == blocked_update.to_string())
        .unwrap();
    assert_eq!(unsent["status"], "prepared");
    assert_eq!(unsent["reconciliation_required"], false);
    // Another ordinary group can proceed independently of this group's hold.
    let other_body =
        niu_media::asset_group::OrdinaryAssetGroupCreate::new("Other character".into(), None)
            .unwrap();
    let other_intent = store
        .prepare_asset_group_create(scope, Uuid::new_v4(), vendor, 1, &other_body)
        .await
        .unwrap();
    assert!(
        store
            .claim_asset_group_create(scope, other_intent.id)
            .await
            .unwrap()
    );
    store
        .record_asset_group_dispatch_outcome(scope, other_intent.id, Some("group-other"), None, 1)
        .await
        .unwrap();
    let other_patch = niu_media::asset_group_update::OrdinaryGroupUpdate::new(
        niu_media::asset_read::OrdinaryGroupRead::new(
            "group-other".into(),
            "original-project".into(),
        )
        .unwrap(),
        Some("Other renamed".into()),
        None,
    )
    .unwrap()
    .encode_private()
    .unwrap();
    let uncertain_update = Uuid::new_v4();
    store
        .prepare_asset_group_update(
            scope,
            PreparedAssetGroupUpdate {
                intent_id: other_intent.id,
                update_id: uncertain_update,
                patch_sha256: Sha256::digest(&other_patch).into(),
                ciphertext: vec![1; 48],
            },
        )
        .await
        .unwrap();
    store
        .claim_asset_group_update(scope, uncertain_update, |_| Ok(other_patch.clone()))
        .await
        .unwrap()
        .unwrap();
    store
        .revoke_asset_operation_authorization(update_grant, OperatorAuditActor::Installation)
        .await
        .unwrap();
    let ack = || AssetGroupUpdateOutcome::Acknowledged;
    assert!(
        !store
            .record_asset_group_update_outcome(other, update_id, ack(), 1)
            .await
            .unwrap()
    );
    assert!(
        !store
            .record_asset_group_update_outcome(scope, blocked_update, ack(), 1)
            .await
            .unwrap()
    );
    assert!(
        !store
            .record_asset_group_update_outcome(scope, Uuid::new_v4(), ack(), 1)
            .await
            .unwrap()
    );
    assert!(
        store
            .record_asset_group_update_outcome(scope, update_id, ack(), -1)
            .await
            .is_err()
    );
    assert!(
        store
            .record_asset_group_update_outcome(
                scope,
                update_id,
                AssetGroupUpdateOutcome::Uncertain {
                    reason: "raw upstream content"
                },
                1
            )
            .await
            .is_err()
    );
    let (a, b) = tokio::join!(
        store.record_asset_group_update_outcome(scope, update_id, ack(), 1),
        store.record_asset_group_update_outcome(scope, update_id, ack(), 2)
    );
    assert_ne!(a.unwrap(), b.unwrap());
    assert!(
        !store
            .record_asset_group_update_outcome(
                scope,
                update_id,
                AssetGroupUpdateOutcome::Uncertain { reason: "timeout" },
                3
            )
            .await
            .unwrap()
    );
    assert!(
        store
            .record_asset_group_update_outcome(
                scope,
                uncertain_update,
                AssetGroupUpdateOutcome::Uncertain { reason: "timeout" },
                4
            )
            .await
            .unwrap()
    );
    assert!(
        !store
            .record_asset_group_update_outcome(scope, uncertain_update, ack(), 5)
            .await
            .unwrap()
    );
    assert!(
        sqlx::query("UPDATE asset_group_update_outcomes SET duration_ms=0 WHERE update_id=$1")
            .bind(update_id)
            .execute(&pool)
            .await
            .is_err()
    );
    assert!(
        sqlx::query("DELETE FROM asset_group_update_outcomes WHERE update_id=$1")
            .bind(update_id)
            .execute(&pool)
            .await
            .is_err()
    );
    store
        .revoke_asset_operation_authorization(original_read_grant, OperatorAuditActor::Installation)
        .await
        .unwrap();
    let reconciliation_read = Uuid::new_v4();
    // Update permission does not imply read permission, even after acknowledgement.
    assert!(
        store
            .claim_asset_group_update_read(scope, update_id, reconciliation_read)
            .await
            .unwrap()
            .is_none()
    );
    let read_grant = store
        .qualify_asset_group_read(
            scope,
            qualification(vendor, 60),
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    for (read_scope, update) in [
        (other, update_id),
        (scope, uncertain_update),
        (scope, blocked_update),
        (scope, Uuid::new_v4()),
    ] {
        assert!(
            store
                .claim_asset_group_update_read(read_scope, update, Uuid::new_v4())
                .await
                .unwrap()
                .is_none()
        );
    }
    let fresh = store
        .claim_asset_group_update_read(scope, update_id, reconciliation_read)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(fresh.authorization_id, read_grant);
    assert_eq!(fresh.credential.vendor_id, vendor);
    assert!(
        store
            .claim_asset_group_update_read(scope, update_id, reconciliation_read)
            .await
            .unwrap()
            .is_none()
    );
    let bound: (Uuid, Uuid) = sqlx::query_as("SELECT r.intent_id,b.update_id FROM asset_group_update_reads b JOIN asset_group_read_claims r ON r.id=b.read_id WHERE b.read_id=$1").bind(reconciliation_read).fetch_one(&pool).await.unwrap();
    assert_eq!(bound, (intent.id, update_id));
    let fresh_after_ack: bool = sqlx::query_scalar("SELECT r.created_at>=o.created_at FROM asset_group_read_claims r JOIN asset_group_update_reads b ON b.read_id=r.id JOIN asset_group_update_outcomes o ON o.update_id=b.update_id WHERE r.id=$1").bind(reconciliation_read).fetch_one(&pool).await.unwrap();
    assert!(fresh_after_ack);
    assert!(
        sqlx::query("DELETE FROM asset_group_update_reads WHERE read_id=$1")
            .bind(reconciliation_read)
            .execute(&pool)
            .await
            .is_err()
    );
    let history = Store::from_pool(pool.clone())
        .asset_group_update_history(scope, vendor, None, 101)
        .await
        .unwrap();
    assert_eq!(history.len(), 6);
    let acknowledged = history
        .iter()
        .find(|row| row["update_id"] == update_id.to_string())
        .unwrap();
    assert_eq!(acknowledged["status"], "acknowledged");
    assert_eq!(acknowledged["reconciliation_required"], true);
    assert!(acknowledged["reason"].is_null());
    assert!(!acknowledged["completed_at"].is_null());
    let uncertain = history
        .iter()
        .find(|row| row["update_id"] == uncertain_update.to_string())
        .unwrap();
    assert_eq!(uncertain["status"], "uncertain");
    assert_eq!(uncertain["reason"], "timeout");
    assert_eq!(uncertain["reconciliation_required"], true);
    for row in &history {
        assert_eq!(row.as_object().unwrap().len(), 9);
    }
    for private in [
        "Renamed character",
        "original-project",
        "group-original",
        "patch_sha256",
        "authorization_id",
        "ciphertext",
        "credential",
        "amount",
    ] {
        assert!(!serde_json::to_string(&history).unwrap().contains(private));
    }
    assert!(
        store
            .asset_group_update_history(other, vendor, None, 10)
            .await
            .unwrap()
            .is_empty()
    );
    assert!(
        store
            .asset_group_update_history(scope, Uuid::new_v4(), None, 10)
            .await
            .unwrap()
            .is_empty()
    );
    assert!(
        store
            .asset_group_update_history(scope, vendor, Some(Uuid::new_v4()), 10)
            .await
            .unwrap()
            .is_empty()
    );
    for limit in [0, 102, -1] {
        assert!(
            store
                .asset_group_update_history(scope, vendor, None, limit)
                .await
                .is_err()
        );
    }
    let first = store
        .asset_group_update_history(scope, vendor, None, 1)
        .await
        .unwrap();
    let cursor = Uuid::parse_str(first[0]["update_id"].as_str().unwrap()).unwrap();
    assert_eq!(
        store
            .asset_group_update_history(scope, vendor, Some(cursor), 100)
            .await
            .unwrap()
            .len(),
        5
    );
    assert!(
        store
            .asset_group_update_history(other, vendor, Some(cursor), 100)
            .await
            .unwrap()
            .is_empty()
    );
    let holds: i64 = sqlx::query_scalar("SELECT count(*) FROM asset_group_update_holds")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(holds, 2);
    // Erased patches and uncertain writes cannot be reconciled.
    assert!(
        !store
            .reconcile_asset_group_update(scope, update_id, reconciliation_read, |_, _| panic!(
                "erased patch must not decode"
            ))
            .await
            .unwrap()
    );
    assert!(
        !store
            .reconcile_asset_group_update(
                scope,
                uncertain_update,
                reconciliation_read,
                |_, _| panic!("uncertain write must not decode")
            )
            .await
            .unwrap()
    );
    store
        .qualify_asset_group_update(
            scope,
            qualification(vendor, 60),
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let reconcile_intent = store
        .prepare_asset_group_create(scope, Uuid::new_v4(), vendor, 1, &other_body)
        .await
        .unwrap();
    assert!(
        store
            .claim_asset_group_create(scope, reconcile_intent.id)
            .await
            .unwrap()
    );
    store
        .record_asset_group_dispatch_outcome(
            scope,
            reconcile_intent.id,
            Some("group-reconcile"),
            None,
            1,
        )
        .await
        .unwrap();
    let reconcile_patch = niu_media::asset_group_update::OrdinaryGroupUpdate::new(
        niu_media::asset_read::OrdinaryGroupRead::new(
            "group-reconcile".into(),
            "original-project".into(),
        )
        .unwrap(),
        Some("Verified name".into()),
        Some("Verified description".into()),
    )
    .unwrap()
    .encode_private()
    .unwrap();
    let reconcile_update = Uuid::new_v4();
    store
        .prepare_asset_group_update(
            scope,
            PreparedAssetGroupUpdate {
                intent_id: reconcile_intent.id,
                update_id: reconcile_update,
                patch_sha256: Sha256::digest(&reconcile_patch).into(),
                ciphertext: vec![1; 48],
            },
        )
        .await
        .unwrap();
    store
        .claim_asset_group_update(scope, reconcile_update, |_| Ok(reconcile_patch.clone()))
        .await
        .unwrap()
        .unwrap();
    store
        .record_asset_group_update_outcome(scope, reconcile_update, ack(), 1)
        .await
        .unwrap();
    let verified_read = Uuid::new_v4();
    store
        .claim_asset_group_update_read(scope, reconcile_update, verified_read)
        .await
        .unwrap()
        .unwrap();
    assert!(
        !store
            .reconcile_asset_group_update(scope, reconcile_update, verified_read, |_, _| panic!(
                "unfinished read must not decode"
            ))
            .await
            .unwrap()
    );
    store
        .save_asset_group_read_result(scope, verified_read, &[1; 48], 1)
        .await
        .unwrap();
    let observed = |name: &str| niu_media::asset_read::OrdinaryGroupDetails {
        name: name.into(),
        description: Some("Verified description".into()),
        created_at: "2026-10-08T00:00:00Z".into(),
        updated_at: "2026-10-08T00:00:01Z".into(),
    };
    store
        .revoke_asset_operation_authorization(read_grant, OperatorAuditActor::Installation)
        .await
        .unwrap();
    assert!(
        !store
            .reconcile_asset_group_update(scope, reconcile_update, verified_read, |_, _| panic!(
                "revoked grant cannot decode"
            ))
            .await
            .unwrap()
    );
    store
        .qualify_asset_group_read(
            scope,
            qualification(vendor, 60),
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    assert!(
        !store
            .reconcile_asset_group_update(scope, reconcile_update, verified_read, |_, _| panic!(
                "new grant cannot revive old read"
            ))
            .await
            .unwrap()
    );
    let verified_read = Uuid::new_v4();
    store
        .claim_asset_group_update_read(scope, reconcile_update, verified_read)
        .await
        .unwrap()
        .unwrap();
    store
        .save_asset_group_read_result(scope, verified_read, &[1; 48], 1)
        .await
        .unwrap();
    assert!(
        !store
            .reconcile_asset_group_update(other, reconcile_update, verified_read, |_, _| panic!(
                "wrong workspace"
            ))
            .await
            .unwrap()
    );
    assert!(
        !store
            .reconcile_asset_group_update(
                scope,
                reconcile_update,
                reconciliation_read,
                |_, _| panic!("different update's read")
            )
            .await
            .unwrap()
    );
    assert!(
        store
            .reconcile_asset_group_update(scope, reconcile_update, verified_read, |_, _| Err(
                StoreError::InvalidObservation
            ))
            .await
            .is_err()
    );
    assert!(
        store
            .reconcile_asset_group_update(scope, reconcile_update, verified_read, |_, _| Ok((
                b"wrong digest".to_vec(),
                observed("Verified name")
            )))
            .await
            .is_err()
    );
    assert!(
        store
            .reconcile_asset_group_update(scope, reconcile_update, verified_read, |_, _| Ok((
                reconcile_patch.clone(),
                observed("Wrong name")
            )))
            .await
            .is_err()
    );
    let has_hold: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM asset_group_update_holds WHERE update_id=$1)",
    )
    .bind(reconcile_update)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert!(has_hold);
    assert!(
        store
            .reconcile_asset_group_update(scope, reconcile_update, verified_read, |patch, read| {
                assert_eq!(patch, &[1; 48]);
                assert_eq!(read, &[1; 48]);
                Ok((reconcile_patch.clone(), observed("Verified name")))
            })
            .await
            .unwrap()
    );
    assert!(
        !store
            .reconcile_asset_group_update(scope, reconcile_update, verified_read, |_, _| panic!(
                "never repeat verification"
            ))
            .await
            .unwrap()
    );
    let has_hold: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM asset_group_update_holds WHERE update_id=$1)",
    )
    .bind(reconcile_update)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert!(!has_hold);
    let reopened_history = Store::from_pool(pool.clone())
        .asset_group_update_history(scope, vendor, None, 101)
        .await
        .unwrap();
    let reconciled = reopened_history
        .iter()
        .find(|row| row["update_id"] == reconcile_update.to_string())
        .unwrap();
    assert_eq!(reconciled["status"], "reconciled");
    assert_eq!(reconciled["reconciliation_required"], false);
    assert_eq!(reconciled.as_object().unwrap().len(), 9);
    let saved_read: Uuid = sqlx::query_scalar(
        "SELECT read_id FROM asset_group_update_reconciliations WHERE update_id=$1",
    )
    .bind(reconcile_update)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(saved_read, verified_read);
    assert!(
        sqlx::query("DELETE FROM asset_group_update_reconciliations WHERE update_id=$1")
            .bind(reconcile_update)
            .execute(&pool)
            .await
            .is_err()
    );
    assert!(
        store
            .claim_asset_group_update(scope, reconcile_update, |_| panic!(
                "reconciled mutation cannot replay"
            ))
            .await
            .unwrap()
            .is_none()
    );
    let next_update = Uuid::new_v4();
    store
        .prepare_asset_group_update(
            scope,
            PreparedAssetGroupUpdate {
                intent_id: reconcile_intent.id,
                update_id: next_update,
                patch_sha256: Sha256::digest(&reconcile_patch).into(),
                ciphertext: vec![1; 48],
            },
        )
        .await
        .unwrap();
    assert!(
        store
            .claim_asset_group_update(scope, next_update, |_| Ok(reconcile_patch.clone()))
            .await
            .unwrap()
            .is_some()
    );
    // Creation/read authorization never substitutes for a listing grant.
    store
        .revoke_asset_operation_authorization(grant, OperatorAuditActor::Installation)
        .await
        .unwrap();
    assert!(
        store
            .claim_asset_listing(scope, intent.id, Uuid::new_v4(), 2)
            .await
            .unwrap()
            .is_none()
    );
    let grant = store
        .qualify_asset_listing(
            scope,
            qualification(vendor, 60),
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    assert!(
        store
            .claim_asset_listing(other, intent.id, Uuid::new_v4(), 2)
            .await
            .unwrap()
            .is_none()
    );
    for maximum in [0, 101, 255] {
        assert!(
            store
                .claim_asset_listing(scope, intent.id, Uuid::new_v4(), maximum)
                .await
                .is_err()
        );
    }
    let id = Uuid::new_v4();
    let (a, b) = tokio::join!(
        store.claim_asset_listing(scope, intent.id, id, 2),
        store.claim_asset_listing(scope, intent.id, id, 2)
    );
    let (a, b) = (a.unwrap(), b.unwrap());
    assert_ne!(a.is_some(), b.is_some());
    let claimed = a.or(b).unwrap();
    assert_eq!(claimed.authorization_id, grant);
    assert_eq!(claimed.credential.upstream_project, "original-project");
    let signer = niu_media::asset_signing::AssetManagementSigner::new(
        "AKEXAMPLE".into(),
        "fixture-secret".into(),
    )
    .unwrap();
    let signed = signer
        .sign_list_assets("20261008T000000Z", claimed.request())
        .unwrap();
    let signed_body: serde_json::Value = serde_json::from_slice(&signed.body).unwrap();
    assert_eq!(
        signed_body["Filter"]["GroupIds"],
        serde_json::json!(["group-original"])
    );
    assert_eq!(signed_body["Filter"]["GroupType"], "AIGC");
    assert_eq!(signed_body["ProjectName"], "original-project");
    assert_eq!(signed_body["MaxResults"], 2);
    assert!(signed_body.get("NextToken").is_none());
    let success = || AssetListingOutcome::Succeeded {
        item_count: 2,
        has_more: true,
    };
    assert!(
        !store
            .record_asset_listing_outcome(other, id, success(), 5)
            .await
            .unwrap()
    );
    assert!(
        store
            .record_asset_listing_outcome(
                scope,
                id,
                AssetListingOutcome::Failed {
                    reason: "private error"
                },
                5
            )
            .await
            .is_err()
    );
    assert!(
        !store
            .record_asset_listing_outcome(
                scope,
                id,
                AssetListingOutcome::Succeeded {
                    item_count: 3,
                    has_more: false
                },
                5
            )
            .await
            .unwrap()
    );
    assert!(
        store
            .record_asset_listing_outcome(scope, id, success(), -1)
            .await
            .is_err()
    );
    store
        .revoke_asset_operation_authorization(grant, OperatorAuditActor::Installation)
        .await
        .unwrap();
    assert!(
        store
            .claim_asset_listing(scope, intent.id, Uuid::new_v4(), 2)
            .await
            .unwrap()
            .is_none()
    );
    // Revocation blocks new work but preserves completion of a committed claim.
    assert!(
        store
            .record_asset_listing_outcome(scope, id, success(), 5)
            .await
            .unwrap()
    );
    assert!(
        !store
            .record_asset_listing_outcome(
                scope,
                id,
                AssetListingOutcome::Failed { reason: "timeout" },
                9
            )
            .await
            .unwrap()
    );
    let outcome:(String,Option<i32>,Option<bool>,i64)=sqlx::query_as("SELECT outcome,item_count,has_more,duration_ms FROM asset_listing_outcomes WHERE listing_id=$1").bind(id).fetch_one(&pool).await.unwrap();
    assert_eq!(outcome, ("succeeded".into(), Some(2), Some(true), 5));
    assert!(
        sqlx::query("DELETE FROM asset_listing_claims WHERE id=$1")
            .bind(id)
            .execute(&pool)
            .await
            .is_err()
    );
    assert!(
        sqlx::query("UPDATE asset_listing_outcomes SET duration_ms=6 WHERE listing_id=$1")
            .bind(id)
            .execute(&pool)
            .await
            .is_err()
    );
    let failed_id = Uuid::new_v4();
    let result_grant = store
        .qualify_asset_listing(
            scope,
            qualification(vendor, 60),
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    store
        .claim_asset_listing(scope, intent.id, failed_id, 1)
        .await
        .unwrap()
        .unwrap();
    assert!(
        store
            .record_asset_listing_outcome(
                scope,
                failed_id,
                AssetListingOutcome::Failed { reason: "timeout" },
                7
            )
            .await
            .unwrap()
    );
    let failed: (Option<i32>, Option<bool>) = sqlx::query_as(
        "SELECT item_count,has_more FROM asset_listing_outcomes WHERE listing_id=$1",
    )
    .bind(failed_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(failed, (None, None));
    // Storage handles opaque ciphertext; this fixture does not claim that its
    // synthetic bytes are a decryptable upstream page.
    let ciphertext = vec![1; 48];
    let result_id = Uuid::new_v4();
    store
        .claim_asset_listing(scope, intent.id, result_id, 2)
        .await
        .unwrap()
        .unwrap();
    assert!(
        store
            .save_asset_listing_result(scope, result_id, success(), 8, &ciphertext)
            .await
            .unwrap()
    );
    // Claim tests use a synthetic decoder; gateway AES-GCM is a separate gate.
    fn decode_lookup(
        bytes: &[u8],
        request: &niu_media::asset_list::OrdinaryAssetList,
    ) -> Result<niu_media::asset_list::OrdinaryAssetPage, StoreError> {
        assert_eq!(bytes, &[1; 48]);
        let body = serde_json::json!({"ResponseMetadata":{"Action":"ListAssets","Version":"2024-01-01","Service":"ark","Region":"cn-beijing"},"Result":{"Items":[{"Id":"asset-original","GroupId":"group-original","ProjectName":"original-project","Name":"Character","AssetType":"Image","Status":"Active","CreateTime":"2026-10-08T00:00:00Z","UpdateTime":"2026-10-08T00:00:01Z"}]}});
        niu_media::asset_list::OrdinaryAssetPage::restore_private(
            &serde_json::to_vec(&body).unwrap(),
            request,
        )
        .map_err(|_| StoreError::InvalidObservation)
    }
    let lookup_id = Uuid::new_v4();
    assert!(
        store
            .claim_asset_lookup(scope, vendor, result_id, lookup_id, 0, decode_lookup)
            .await
            .unwrap()
            .is_none()
    );
    let lookup_grant = store
        .qualify_asset_lookup(
            scope,
            qualification(vendor, 60),
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    for (target, account, listing, index) in [
        (other, vendor, result_id, 0),
        (scope, Uuid::new_v4(), result_id, 0),
        (scope, vendor, Uuid::new_v4(), 0),
        (scope, vendor, result_id, 1),
    ] {
        assert!(
            store
                .claim_asset_lookup(
                    target,
                    account,
                    listing,
                    Uuid::new_v4(),
                    index,
                    decode_lookup
                )
                .await
                .unwrap()
                .is_none()
        );
    }
    assert!(
        store
            .claim_asset_lookup(scope, vendor, result_id, Uuid::new_v4(), 100, decode_lookup)
            .await
            .is_err()
    );
    assert!(
        store
            .claim_asset_lookup(scope, vendor, result_id, Uuid::new_v4(), 0, |_, _| Err(
                StoreError::InvalidObservation
            ))
            .await
            .is_err()
    );
    assert!(
        store
            .claim_asset_lookup(scope, vendor, result_id, Uuid::new_v4(), 0, |bytes, _| {
                let original = niu_media::asset_list::OrdinaryAssetList::first_page(
                    "group-original".into(),
                    "original-project".into(),
                    2,
                )
                .unwrap();
                let mut page = decode_lookup(bytes, &original)?;
                page.items[0].name = "invalid\nname".into();
                Ok(page)
            })
            .await
            .is_err()
    );
    let (a, b) = tokio::join!(
        store.claim_asset_lookup(scope, vendor, result_id, lookup_id, 0, decode_lookup),
        store.claim_asset_lookup(scope, vendor, result_id, lookup_id, 0, decode_lookup)
    );
    let (a, b) = (a.unwrap(), b.unwrap());
    assert_ne!(a.is_some(), b.is_some());
    let claimed = a.or(b).unwrap();
    assert_eq!(claimed.authorization_id, lookup_grant);
    assert_eq!(claimed.credential.upstream_project, "original-project");
    let signed = signer
        .sign_get_asset("20261008T000000Z", claimed.request())
        .unwrap();
    assert_eq!(
        serde_json::from_slice::<serde_json::Value>(&signed.body).unwrap(),
        serde_json::json!({"Id":"asset-original","ProjectName":"original-project"})
    );
    let audit: (i32, Vec<u8>) = sqlx::query_as(
        "SELECT item_index,listing_snapshot_sha256 FROM asset_lookup_claims WHERE id=$1",
    )
    .bind(lookup_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(audit.0, 0);
    assert_eq!(audit.1.len(), 32);
    assert!(
        sqlx::query("UPDATE asset_lookup_claims SET item_index=1 WHERE id=$1")
            .bind(lookup_id)
            .execute(&pool)
            .await
            .is_err()
    );
    assert!(
        sqlx::query("DELETE FROM asset_lookup_claims WHERE id=$1")
            .bind(lookup_id)
            .execute(&pool)
            .await
            .is_err()
    );
    use niu_media::asset_list::AssetStatus;
    // Storage ciphertext fixture: authenticated encryption is verified separately.
    let retained_lookup = Uuid::new_v4();
    let erased_lookup = Uuid::new_v4();
    for id in [retained_lookup, erased_lookup] {
        store
            .claim_asset_lookup(scope, vendor, result_id, id, 0, decode_lookup)
            .await
            .unwrap()
            .unwrap();
    }
    assert!(
        store
            .save_asset_lookup_result(
                scope,
                retained_lookup,
                niu_media::asset_list::AssetStatus::Processing,
                6,
                &[1; 29]
            )
            .await
            .is_err()
    );
    assert!(
        !store
            .save_asset_lookup_result(
                other,
                retained_lookup,
                niu_media::asset_list::AssetStatus::Processing,
                6,
                &ciphertext
            )
            .await
            .unwrap()
    );
    assert!(
        store
            .save_asset_lookup_result(
                scope,
                retained_lookup,
                niu_media::asset_list::AssetStatus::Processing,
                6,
                &ciphertext
            )
            .await
            .unwrap()
    );
    let (recovered, request) = Store::from_pool(pool.clone())
        .asset_lookup_result_context(scope, vendor, retained_lookup)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(recovered, ciphertext);
    assert_eq!(request.maximum_items(), 1);
    assert!(
        store
            .asset_lookup_result_context(other, vendor, retained_lookup)
            .await
            .unwrap()
            .is_none()
    );
    assert!(
        store
            .asset_lookup_result_context(scope, Uuid::new_v4(), retained_lookup)
            .await
            .unwrap()
            .is_none()
    );
    assert!(
        !store
            .delete_asset_lookup_result(other, vendor, retained_lookup)
            .await
            .unwrap()
    );
    assert!(
        store
            .delete_asset_lookup_result(scope, vendor, erased_lookup)
            .await
            .unwrap()
    );
    assert!(
        !store
            .delete_asset_lookup_result(scope, vendor, erased_lookup)
            .await
            .unwrap()
    );
    assert!(
        store
            .save_asset_lookup_result(
                scope,
                erased_lookup,
                niu_media::asset_list::AssetStatus::Active,
                7,
                &ciphertext
            )
            .await
            .unwrap()
    );
    let resurrected: bool =
        sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM asset_lookup_results WHERE lookup_id=$1)")
            .bind(erased_lookup)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert!(!resurrected);
    assert!(
        !store
            .save_asset_lookup_result(
                scope,
                retained_lookup,
                niu_media::asset_list::AssetStatus::Active,
                8,
                &ciphertext
            )
            .await
            .unwrap()
    );
    assert!(
        sqlx::query("UPDATE asset_lookup_results SET ciphertext=$2 WHERE lookup_id=$1")
            .bind(retained_lookup)
            .bind(&ciphertext)
            .execute(&pool)
            .await
            .is_err()
    );
    assert!(
        sqlx::query("DELETE FROM asset_lookup_results WHERE lookup_id=$1")
            .bind(retained_lookup)
            .execute(&pool)
            .await
            .is_err()
    );
    let expired_lookup = Uuid::new_v4();
    store
        .claim_asset_lookup(scope, vendor, result_id, expired_lookup, 0, decode_lookup)
        .await
        .unwrap()
        .unwrap();
    store
        .record_asset_lookup_outcome(
            scope,
            expired_lookup,
            niu_storage::AssetLookupOutcome::Observed {
                status: niu_media::asset_list::AssetStatus::Active,
            },
            5,
        )
        .await
        .unwrap();
    // Explicit expired storage fixture; never mutate an immutable expiry in place.
    sqlx::query("INSERT INTO asset_lookup_results(lookup_id,ciphertext,expires_at) VALUES($1,$2,clock_timestamp()-interval '1 second')").bind(expired_lookup).bind(&ciphertext).execute(&pool).await.unwrap();
    assert!(
        store
            .asset_lookup_result_context(scope, vendor, expired_lookup)
            .await
            .unwrap()
            .is_none()
    );
    store.purge_expired_request_payloads().await.unwrap();
    let purged: Option<Vec<u8>> =
        sqlx::query_scalar("SELECT ciphertext FROM asset_lookup_results WHERE lookup_id=$1")
            .bind(expired_lookup)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert!(purged.is_none());
    use niu_storage::AssetLookupOutcome;
    let failed_lookup = Uuid::new_v4();
    let unresolved_lookup = Uuid::new_v4();
    for id in [failed_lookup, unresolved_lookup] {
        store
            .claim_asset_lookup(scope, vendor, result_id, id, 0, decode_lookup)
            .await
            .unwrap()
            .unwrap();
    }
    store
        .revoke_asset_operation_authorization(lookup_grant, OperatorAuditActor::Installation)
        .await
        .unwrap();
    assert!(
        store
            .claim_asset_lookup(scope, vendor, result_id, Uuid::new_v4(), 0, decode_lookup)
            .await
            .unwrap()
            .is_none()
    );
    assert!(
        store
            .asset_lookup_result_context(scope, vendor, retained_lookup)
            .await
            .unwrap()
            .is_none()
    );
    // A later grant cannot revive content bound to the revoked original grant.
    store
        .qualify_asset_lookup(
            scope,
            qualification(vendor, 60),
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    assert!(
        store
            .asset_lookup_result_context(scope, vendor, retained_lookup)
            .await
            .unwrap()
            .is_none()
    );
    assert!(
        store
            .delete_asset_lookup_result(scope, vendor, retained_lookup)
            .await
            .unwrap()
    );
    let erased: Option<Vec<u8>> =
        sqlx::query_scalar("SELECT ciphertext FROM asset_lookup_results WHERE lookup_id=$1")
            .bind(retained_lookup)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert!(erased.is_none());
    store.purge_expired_asset_lookup_results().await.unwrap();
    // Already-dispatched work can finish its audit after grant revocation.
    let observed = || AssetLookupOutcome::Observed {
        status: AssetStatus::Failed,
    };
    assert!(
        !store
            .record_asset_lookup_outcome(other, lookup_id, observed(), 7)
            .await
            .unwrap()
    );
    assert!(
        !store
            .record_asset_lookup_outcome(scope, Uuid::new_v4(), observed(), 7)
            .await
            .unwrap()
    );
    assert!(
        store
            .record_asset_lookup_outcome(scope, lookup_id, observed(), -1)
            .await
            .is_err()
    );
    assert!(
        store
            .record_asset_lookup_outcome(
                scope,
                lookup_id,
                AssetLookupOutcome::Failed {
                    reason: "private upstream message"
                },
                7
            )
            .await
            .is_err()
    );
    assert!(
        store
            .record_asset_lookup_outcome(scope, lookup_id, observed(), 7)
            .await
            .unwrap()
    );
    assert!(
        !store
            .record_asset_lookup_outcome(
                scope,
                lookup_id,
                AssetLookupOutcome::Observed {
                    status: AssetStatus::Active
                },
                9
            )
            .await
            .unwrap()
    );
    let (a, b) = tokio::join!(
        store.record_asset_lookup_outcome(
            scope,
            failed_lookup,
            AssetLookupOutcome::Failed { reason: "timeout" },
            8
        ),
        store.record_asset_lookup_outcome(
            scope,
            failed_lookup,
            AssetLookupOutcome::Failed {
                reason: "transport"
            },
            9
        )
    );
    assert_ne!(a.unwrap(), b.unwrap());
    assert!(
        sqlx::query("UPDATE asset_lookup_outcomes SET duration_ms=0 WHERE lookup_id=$1")
            .bind(lookup_id)
            .execute(&pool)
            .await
            .is_err()
    );
    assert!(
        sqlx::query("DELETE FROM asset_lookup_outcomes WHERE lookup_id=$1")
            .bind(lookup_id)
            .execute(&pool)
            .await
            .is_err()
    );
    let history = Store::from_pool(pool.clone())
        .asset_lookup_history(scope, vendor, None, 101)
        .await
        .unwrap();
    assert_eq!(history.len(), 6);
    let observed_row = history
        .iter()
        .find(|row| row["lookup_id"] == lookup_id.to_string())
        .unwrap();
    assert_eq!(observed_row["status"], "succeeded");
    assert_eq!(observed_row["asset_status"], "Failed");
    assert_eq!(observed_row["duration_ms"], 7);
    assert!(observed_row["reason"].is_null());
    let unresolved = history
        .iter()
        .find(|row| row["lookup_id"] == unresolved_lookup.to_string())
        .unwrap();
    assert_eq!(unresolved["status"], "unresolved");
    for field in ["asset_status", "duration_ms", "completed_at", "reason"] {
        assert!(unresolved[field].is_null());
    }
    for row in &history {
        assert_eq!(row.as_object().unwrap().len(), 8);
    }
    assert!(
        store
            .asset_lookup_history(other, vendor, None, 10)
            .await
            .unwrap()
            .is_empty()
    );
    assert!(
        store
            .asset_lookup_history(scope, Uuid::new_v4(), None, 10)
            .await
            .unwrap()
            .is_empty()
    );
    assert!(
        store
            .asset_lookup_history(scope, vendor, Some(Uuid::new_v4()), 10)
            .await
            .unwrap()
            .is_empty()
    );
    for limit in [0, 102, -1] {
        assert!(
            store
                .asset_lookup_history(scope, vendor, None, limit)
                .await
                .is_err()
        );
    }
    let first = store
        .asset_lookup_history(scope, vendor, None, 1)
        .await
        .unwrap();
    let cursor = Uuid::parse_str(first[0]["lookup_id"].as_str().unwrap()).unwrap();
    let tail = store
        .asset_lookup_history(scope, vendor, Some(cursor), 10)
        .await
        .unwrap();
    assert_eq!(tail.len(), 5);
    assert!(
        tail.iter()
            .all(|row| row["lookup_id"] != cursor.to_string())
    );
    assert!(
        store
            .asset_lookup_history(other, vendor, Some(cursor), 10)
            .await
            .unwrap()
            .is_empty()
    );
    let reopened = Store::from_pool(pool.clone());
    assert_eq!(
        reopened
            .asset_listing_result(scope, vendor, result_id)
            .await
            .unwrap(),
        Some(ciphertext.clone())
    );
    assert!(
        reopened
            .asset_listing_result(other, vendor, result_id)
            .await
            .unwrap()
            .is_none()
    );
    assert!(
        reopened
            .asset_listing_result(scope, Uuid::new_v4(), result_id)
            .await
            .unwrap()
            .is_none()
    );
    fn next_request(group: &str, maximum: u8) -> niu_media::asset_list::OrdinaryAssetList {
        let request = niu_media::asset_list::OrdinaryAssetList::first_page(
            group.into(),
            "original-project".into(),
            maximum,
        )
        .unwrap();
        let body = serde_json::json!({"ResponseMetadata":{"Action":"ListAssets","Version":"2024-01-01","Service":"ark","Region":"cn-beijing"},"Result":{"Items":[],"NextToken":"private-next-page"}});
        niu_media::asset_list::OrdinaryAssetPage::restore_private(
            &serde_json::to_vec(&body).unwrap(),
            &request,
        )
        .unwrap()
        .next_request
        .unwrap()
    }
    let continuation = |previous, maximum, bytes: Vec<u8>| niu_storage::AssetListingContinuation {
        previous_listing_id: previous,
        expected_ciphertext: bytes,
        request: next_request("group-original", maximum),
    };
    assert!(
        store
            .claim_asset_listing_continuation(
                other,
                intent.id,
                Uuid::new_v4(),
                continuation(result_id, 2, ciphertext.clone())
            )
            .await
            .unwrap()
            .is_none()
    );
    assert!(
        store
            .claim_asset_listing_continuation(
                scope,
                intent.id,
                Uuid::new_v4(),
                continuation(result_id, 3, ciphertext.clone())
            )
            .await
            .unwrap()
            .is_none()
    );
    assert!(
        store
            .claim_asset_listing_continuation(
                scope,
                intent.id,
                Uuid::new_v4(),
                continuation(result_id, 2, vec![2; 48])
            )
            .await
            .unwrap()
            .is_none()
    );
    assert!(
        store
            .claim_asset_listing_continuation(
                scope,
                intent.id,
                Uuid::new_v4(),
                niu_storage::AssetListingContinuation {
                    previous_listing_id: result_id,
                    expected_ciphertext: ciphertext.clone(),
                    request: next_request("group-other", 2)
                }
            )
            .await
            .is_err()
    );
    assert!(
        store
            .claim_asset_listing_continuation(
                scope,
                intent.id,
                result_id,
                continuation(result_id, 2, ciphertext.clone())
            )
            .await
            .unwrap()
            .is_none()
    );
    store
        .qualify_asset_lookup(
            scope,
            qualification(vendor, 60),
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let child_a = Uuid::new_v4();
    let child_b = Uuid::new_v4();
    let (a, b) = tokio::join!(
        store.claim_asset_listing_continuation(
            scope,
            intent.id,
            child_a,
            continuation(result_id, 2, ciphertext.clone())
        ),
        store.claim_asset_listing_continuation(
            scope,
            intent.id,
            child_b,
            continuation(result_id, 2, ciphertext.clone())
        )
    );
    let (a, b) = (a.unwrap(), b.unwrap());
    assert_ne!(a.is_some(), b.is_some());
    let child = a.or(b).unwrap();
    assert_eq!(child.authorization_id, result_grant);
    let signed = signer
        .sign_list_assets("20261008T000000Z", child.request())
        .unwrap();
    let body: serde_json::Value = serde_json::from_slice(&signed.body).unwrap();
    assert_eq!(body["NextToken"], "private-next-page");
    assert_eq!(body["ProjectName"], "original-project");
    let receipt:(i32,bool)=sqlx::query_as("SELECT page_number,parent_snapshot_sha256=sha256($2::bytea) FROM asset_listing_claims WHERE id=$1")
        .bind(child.listing_id).bind(&ciphertext).fetch_one(&pool).await.unwrap();
    assert_eq!(receipt, (2, true));
    assert!(
        store
            .save_asset_listing_result(
                scope,
                child.listing_id,
                AssetListingOutcome::Succeeded {
                    item_count: 0,
                    has_more: false
                },
                8,
                &ciphertext
            )
            .await
            .unwrap()
    );
    assert!(
        store
            .claim_asset_listing_continuation(
                scope,
                intent.id,
                Uuid::new_v4(),
                continuation(child.listing_id, 2, ciphertext.clone())
            )
            .await
            .unwrap()
            .is_none()
    );
    // Seed a complete 100-page audit chain to exercise the hard final-page gate.
    let chain_root = Uuid::new_v4();
    store
        .claim_asset_listing(scope, intent.id, chain_root, 2)
        .await
        .unwrap()
        .unwrap();
    store
        .save_asset_listing_result(scope, chain_root, success(), 8, &ciphertext)
        .await
        .unwrap();
    let mut last = chain_root;
    for number in 2..=100 {
        let page = Uuid::new_v4();
        sqlx::query("INSERT INTO asset_listing_claims(id,intent_id,authorization_id,maximum_items,parent_listing_id,page_number,parent_snapshot_sha256) VALUES($1,$2,$3,2,$4,$5,sha256($6::bytea))")
            .bind(page).bind(intent.id).bind(result_grant).bind(last).bind(number).bind(&ciphertext).execute(&pool).await.unwrap();
        store
            .save_asset_listing_result(scope, page, success(), 8, &ciphertext)
            .await
            .unwrap();
        last = page;
    }
    assert!(
        store
            .claim_asset_listing_continuation(
                scope,
                intent.id,
                Uuid::new_v4(),
                continuation(last, 2, ciphertext.clone())
            )
            .await
            .unwrap()
            .is_none()
    );
    assert!(
        !store
            .delete_asset_listing_result(other, vendor, result_id)
            .await
            .unwrap()
    );
    assert!(
        store
            .delete_asset_listing_result(scope, vendor, result_id)
            .await
            .unwrap()
    );
    assert!(
        !store
            .delete_asset_listing_result(scope, vendor, result_id)
            .await
            .unwrap()
    );
    assert!(
        store
            .asset_listing_result(scope, vendor, result_id)
            .await
            .unwrap()
            .is_none()
    );
    assert!(
        sqlx::query(
            "UPDATE asset_listing_results SET ciphertext=$2,deleted_at=NULL WHERE listing_id=$1"
        )
        .bind(result_id)
        .bind(&ciphertext)
        .execute(&pool)
        .await
        .is_err()
    );
    assert!(
        !store
            .save_asset_listing_result(scope, result_id, success(), 9, &ciphertext)
            .await
            .unwrap()
    );
    // Erasing the source page prevents new lookups even with a fresh lookup grant.
    assert!(
        store
            .claim_asset_lookup(scope, vendor, result_id, Uuid::new_v4(), 0, |_, _| panic!(
                "deleted page must not reach decoder"
            ))
            .await
            .unwrap()
            .is_none()
    );
    let lookup_count: i64 = sqlx::query_scalar("SELECT count(*) FROM asset_lookup_claims")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(lookup_count, 6);
    assert_eq!(
        store
            .asset_lookup_history(scope, vendor, None, 101)
            .await
            .unwrap(),
        history
    );
    let race_page = Uuid::new_v4();
    store
        .claim_asset_listing(scope, intent.id, race_page, 2)
        .await
        .unwrap()
        .unwrap();
    store
        .save_asset_listing_result(scope, race_page, success(), 8, &ciphertext)
        .await
        .unwrap();
    let raced = tokio::time::timeout(std::time::Duration::from_secs(5), async {
        tokio::join!(
            store.claim_asset_lookup(scope, vendor, race_page, Uuid::new_v4(), 0, decode_lookup),
            store.delete_asset_listing_result(scope, vendor, race_page)
        )
    })
    .await
    .unwrap();
    raced.0.unwrap();
    assert!(raced.1.unwrap());
    assert!(
        store
            .claim_asset_lookup(scope, vendor, race_page, Uuid::new_v4(), 0, |_, _| panic!(
                "erasure must prevent decode"
            ))
            .await
            .unwrap()
            .is_none()
    );
    let late_id = Uuid::new_v4();
    store
        .claim_asset_listing(scope, intent.id, late_id, 2)
        .await
        .unwrap()
        .unwrap();
    assert!(
        store
            .delete_asset_listing_result(scope, vendor, late_id)
            .await
            .unwrap()
    );
    assert!(
        store
            .save_asset_listing_result(scope, late_id, success(), 8, &ciphertext)
            .await
            .unwrap()
    );
    let late_rows: i64 =
        sqlx::query_scalar("SELECT count(*) FROM asset_listing_results WHERE listing_id=$1")
            .bind(late_id)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(late_rows, 0);
    assert!(
        store
            .claim_asset_listing_continuation(
                scope,
                intent.id,
                Uuid::new_v4(),
                continuation(late_id, 2, ciphertext.clone())
            )
            .await
            .unwrap()
            .is_none()
    );
    let rolled_back = Uuid::new_v4();
    store
        .claim_asset_listing(scope, intent.id, rolled_back, 2)
        .await
        .unwrap()
        .unwrap();
    sqlx::query("CREATE FUNCTION fail_listing_result_fixture() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture failure'; END $$").execute(&pool).await.unwrap();
    sqlx::query("CREATE TRIGGER fail_listing_result_fixture BEFORE INSERT ON asset_listing_results FOR EACH ROW EXECUTE FUNCTION fail_listing_result_fixture()").execute(&pool).await.unwrap();
    assert!(
        store
            .save_asset_listing_result(scope, rolled_back, success(), 8, &ciphertext)
            .await
            .is_err()
    );
    let outcome_rows: i64 =
        sqlx::query_scalar("SELECT count(*) FROM asset_listing_outcomes WHERE listing_id=$1")
            .bind(rolled_back)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(outcome_rows, 0);
    sqlx::query("DROP TRIGGER fail_listing_result_fixture ON asset_listing_results")
        .execute(&pool)
        .await
        .unwrap();
    assert!(
        store
            .save_asset_listing_result(scope, rolled_back, success(), 8, &ciphertext)
            .await
            .unwrap()
    );
    let expired_id = Uuid::new_v4();
    store
        .claim_asset_listing(scope, intent.id, expired_id, 2)
        .await
        .unwrap()
        .unwrap();
    store
        .record_asset_listing_outcome(scope, expired_id, success(), 8)
        .await
        .unwrap();
    sqlx::query("INSERT INTO asset_listing_results(listing_id,ciphertext,expires_at) VALUES($1,$2,clock_timestamp()-interval '1 second')")
        .bind(expired_id).bind(&ciphertext).execute(&pool).await.unwrap();
    assert!(
        store
            .asset_listing_result(scope, vendor, expired_id)
            .await
            .unwrap()
            .is_none()
    );
    store.purge_expired_request_payloads().await.unwrap();
    let erased:bool=sqlx::query_scalar("SELECT ciphertext IS NULL AND deleted_at IS NOT NULL FROM asset_listing_results WHERE listing_id=$1").bind(expired_id).fetch_one(&pool).await.unwrap();
    assert!(erased);
    assert!(
        store
            .claim_asset_listing_continuation(
                scope,
                intent.id,
                Uuid::new_v4(),
                continuation(expired_id, 2, ciphertext.clone())
            )
            .await
            .unwrap()
            .is_none()
    );
    store
        .revoke_asset_operation_authorization(result_grant, OperatorAuditActor::Installation)
        .await
        .unwrap();
    assert!(
        store
            .asset_listing_result(scope, vendor, rolled_back)
            .await
            .unwrap()
            .is_none()
    );
    store
        .qualify_asset_listing(
            scope,
            qualification(vendor, 60),
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    assert!(
        store
            .asset_listing_result(scope, vendor, rolled_back)
            .await
            .unwrap()
            .is_none(),
        "another grant cannot restore original revoked content"
    );
    store
        .revoke_asset_management_credentials(vendor, 1, false)
        .await
        .unwrap();
    assert!(
        store
            .claim_asset_listing(scope, intent.id, Uuid::new_v4(), 2)
            .await
            .unwrap()
            .is_none()
    );
    assert_eq!(
        store
            .asset_group_create_intent(scope, intent.id)
            .await
            .unwrap()
            .unwrap()
            .state,
        "succeeded"
    );
    // Audit stays scoped and useful after both result and credential revocation.
    let mut cursor = None;
    let mut seen = std::collections::HashSet::new();
    loop {
        let rows = store
            .asset_listing_history(scope, vendor, cursor, 7)
            .await
            .unwrap();
        if rows.is_empty() {
            break;
        }
        for row in &rows {
            assert_eq!(row.as_object().unwrap().len(), 10);
            assert!(seen.insert(row["listing_id"].as_str().unwrap().to_owned()));
            for private in [
                "original-project",
                "group-original",
                "ciphertext",
                "credential_revision",
                "authorization_id",
            ] {
                assert!(!row.to_string().contains(private));
            }
        }
        cursor = Some(
            rows.last().unwrap()["listing_id"]
                .as_str()
                .unwrap()
                .parse()
                .unwrap(),
        );
    }
    let expected:i64=sqlx::query_scalar("SELECT count(*) FROM asset_listing_claims r JOIN asset_group_create_intents i ON i.id=r.intent_id WHERE i.organization_id=$1 AND i.project_id=$2 AND i.vendor_id=$3")
        .bind(scope.organization_id).bind(scope.project_id).bind(vendor).fetch_one(&pool).await.unwrap();
    assert_eq!(seen.len() as i64, expected);
    assert!(
        expected > 100,
        "fixture crosses the public maximum page size"
    );
    assert!(
        store
            .asset_listing_history(other, vendor, Some(id), 30)
            .await
            .unwrap()
            .is_empty()
    );
    assert!(
        store
            .asset_listing_history(scope, Uuid::new_v4(), None, 30)
            .await
            .unwrap()
            .is_empty()
    );
    assert!(
        store
            .asset_listing_history(scope, vendor, Some(Uuid::new_v4()), 30)
            .await
            .unwrap()
            .is_empty()
    );
    for limit in [0, 102] {
        assert!(
            store
                .asset_listing_history(scope, vendor, None, limit)
                .await
                .is_err()
        );
    }
    for table in [
        "customer_charges",
        "customer_balance_entries",
        "customer_balance_reservations",
    ] {
        let count: i64 = sqlx::query_scalar(&format!("SELECT count(*) FROM {table}"))
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(count, 0);
    }
}
