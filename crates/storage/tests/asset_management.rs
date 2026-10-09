use niu_storage::{MIGRATOR, Store, StoreError, VendorInput};
use sqlx::PgPool;
use uuid::Uuid;

async fn vendor(store: &Store, name: &str) -> Uuid {
    let id = Uuid::new_v4();
    store
        .create_vendor(VendorInput {
            id,
            name: name.into(),
            adapter: "openai".into(),
            api_base: "https://ark.cn-beijing.volcengineapi.com/api/v3".into(),
            enabled: false,
            credential_ciphertext: vec![0x44; 48],
        })
        .await
        .unwrap();
    id
}
fn encrypted_fixture(byte: u8) -> Vec<u8> {
    let mut value = vec![byte; 48];
    value[0] = 1;
    value
}

async fn qualify(store: &Store, scope: niu_storage::TenantScope, account: Uuid) {
    store
        .qualify_asset_group_creation(
            scope,
            niu_storage::AssetOperationQualification {
                vendor_id: account,
                vendor_revision: store.vendor(account).await.unwrap().unwrap().revision,
                credential_revision: 1,
                rights_sha256: [1; 32],
                protocol_sha256: [2; 32],
                data_handling_sha256: [3; 32],
                free_operation_sha256: [4; 32],
                valid_for_seconds: 3600,
            },
            niu_storage::OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn asset_management_credentials_pin_original_revision_and_preserve_bearer(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let first = vendor(&store, "First asset account").await;
    let other = vendor(&store, "Second asset account").await;
    let ciphertext = encrypted_fixture(0x22);
    assert_eq!(
        store
            .save_asset_management_credential(first, 0, "original-project", &ciphertext)
            .await
            .unwrap(),
        1
    );
    assert_eq!(
        store
            .save_asset_management_credential(first, 1, "rotated-project", &encrypted_fixture(0x33))
            .await
            .unwrap(),
        2
    );
    let reopened = Store::from_pool(pool.clone());
    let original = reopened
        .asset_management_credential_revision(first, 1)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(original.vendor_id, first);
    assert_eq!(original.revision, 1);
    assert_eq!(original.upstream_project, "original-project");
    assert_eq!(original.credential_ciphertext, ciphertext);
    assert_eq!(
        reopened
            .asset_management_credential_revision(first, 2)
            .await
            .unwrap()
            .unwrap()
            .upstream_project,
        "rotated-project"
    );
    assert!(
        reopened
            .asset_management_credential_revision(other, 1)
            .await
            .unwrap()
            .is_none()
    );
    assert!(
        reopened
            .asset_management_credential_revision(first, 3)
            .await
            .unwrap()
            .is_none()
    );
    assert_eq!(
        reopened
            .vendor_credential_ciphertext(first)
            .await
            .unwrap()
            .unwrap(),
        vec![0x44; 48]
    );
    for statement in [
        "UPDATE vendor_asset_management_credentials SET upstream_project='changed' WHERE vendor_id=$1",
        "DELETE FROM vendor_asset_management_credentials WHERE vendor_id=$1",
    ] {
        assert!(
            sqlx::query(statement)
                .bind(first)
                .execute(&pool)
                .await
                .is_err()
        );
    }
    let vendor_revision = store.vendor(first).await.unwrap().unwrap().revision;
    store
        .update_vendor(
            first,
            niu_storage::VendorUpdate {
                name: "Changed account configuration".into(),
                api_base: "https://openrouter.ai/api/v1".into(),
                enabled: false,
                credential_ciphertext: None,
                expected_revision: vendor_revision,
            },
        )
        .await
        .unwrap();
    assert!(matches!(
        store
            .save_asset_management_credential_bound(
                first,
                vendor_revision,
                2,
                "stale-account-project",
                &encrypted_fixture(0x55)
            )
            .await,
        Err(StoreError::Conflict)
    ));
    assert!(
        store
            .asset_management_credential_revision(first, 3)
            .await
            .unwrap()
            .is_none()
    );
    assert_eq!(
        store
            .asset_management_credential_revision(first, 1)
            .await
            .unwrap()
            .unwrap()
            .upstream_project,
        "original-project"
    );
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn asset_management_credentials_serialize_rotation_and_reject_invalid_setup(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let id = vendor(&store, "Concurrent asset account").await;
    let first = encrypted_fixture(0x22);
    let second = encrypted_fixture(0x33);
    let (a, b) = tokio::join!(
        store.save_asset_management_credential(id, 0, "first-project", &first),
        store.save_asset_management_credential(id, 0, "second-project", &second)
    );
    assert_eq!(usize::from(a.is_ok()) + usize::from(b.is_ok()), 1);
    let failure = if a.is_err() { a } else { b };
    assert!(matches!(failure, Err(StoreError::Conflict)));
    let rows: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM vendor_asset_management_credentials WHERE vendor_id=$1",
    )
    .bind(id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(rows, 1);
    for project in ["", " padded ", "line\nother"] {
        assert!(matches!(
            store
                .save_asset_management_credential(id, 1, project, &first)
                .await,
            Err(StoreError::InvalidVendor)
        ));
    }
    assert!(matches!(
        store
            .save_asset_management_credential(id, 1, "valid", &[1; 29])
            .await,
        Err(StoreError::InvalidVendor)
    ));
    assert!(matches!(
        store
            .save_asset_management_credential(id, 1, "valid", &[2; 48])
            .await,
        Err(StoreError::InvalidVendor)
    ));
    assert!(matches!(
        store
            .save_asset_management_credential(Uuid::new_v4(), 0, "valid", &first)
            .await,
        Err(StoreError::Conflict)
    ));
    assert!(matches!(
        store.asset_management_credential_revision(id, 0).await,
        Err(StoreError::InvalidVendor)
    ));
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn asset_management_revocation_and_erasure_are_durable_and_rotation_safe(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let id = vendor(&store, "Asset erasure fixture").await;
    for expected in [0, 1] {
        store
            .save_asset_management_credential(
                id,
                expected,
                "bound-project",
                &encrypted_fixture(0x22),
            )
            .await
            .unwrap();
    }
    assert!(matches!(
        store.revoke_asset_management_credentials(id, 1, true).await,
        Err(StoreError::Conflict)
    ));
    assert!(
        store
            .asset_management_credential_revision(id, 1)
            .await
            .unwrap()
            .is_some()
    );
    assert_eq!(
        store
            .revoke_asset_management_credentials(id, 2, false)
            .await
            .unwrap(),
        0
    );
    assert!(
        store
            .asset_management_credential_revision(id, 1)
            .await
            .unwrap()
            .is_none()
    );
    assert!(
        store
            .asset_management_credential_revision(id, 2)
            .await
            .unwrap()
            .is_none()
    );
    let configured = store
        .asset_management_configuration(id)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(configured, (2, "bound-project".into(), false));
    let retained: i64=sqlx::query_scalar("SELECT COUNT(*) FROM vendor_asset_management_credentials WHERE vendor_id=$1 AND credential_ciphertext IS NOT NULL").bind(id).fetch_one(&pool).await.unwrap();
    assert_eq!(retained, 2);
    assert_eq!(
        store
            .revoke_asset_management_credentials(id, 2, true)
            .await
            .unwrap(),
        2
    );
    assert_eq!(
        store
            .revoke_asset_management_credentials(id, 2, true)
            .await
            .unwrap(),
        0
    );
    let erased: i64=sqlx::query_scalar("SELECT COUNT(*) FROM vendor_asset_management_credentials WHERE vendor_id=$1 AND credential_ciphertext IS NULL").bind(id).fetch_one(&pool).await.unwrap();
    assert_eq!(erased, 2);
    for table in [
        "vendor_asset_management_revocations",
        "vendor_asset_management_erasures",
    ] {
        let count: i64 =
            sqlx::query_scalar(&format!("SELECT COUNT(*) FROM {table} WHERE vendor_id=$1"))
                .bind(id)
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(count, 1);
        assert!(
            sqlx::query(&format!("DELETE FROM {table} WHERE vendor_id=$1"))
                .bind(id)
                .execute(&pool)
                .await
                .is_err()
        );
    }
    store
        .save_asset_management_credential(id, 2, "new-project", &encrypted_fixture(0x33))
        .await
        .unwrap();
    let reopened = Store::from_pool(pool.clone());
    assert_eq!(
        reopened
            .asset_management_configuration(id)
            .await
            .unwrap()
            .unwrap(),
        (3, "new-project".into(), true)
    );
    assert!(
        reopened
            .asset_management_credential_revision(id, 1)
            .await
            .unwrap()
            .is_none()
    );
    assert!(
        reopened
            .asset_management_credential_revision(id, 3)
            .await
            .unwrap()
            .is_some()
    );
    assert!(matches!(
        reopened
            .revoke_asset_management_credentials(id, 2, true)
            .await,
        Err(StoreError::Conflict)
    ));
    assert!(sqlx::query("UPDATE vendor_asset_management_credentials SET credential_ciphertext=NULL WHERE vendor_id=$1 AND revision=3").bind(id).execute(&pool).await.is_err());
    assert_eq!(
        reopened
            .vendor_credential_ciphertext(id)
            .await
            .unwrap()
            .unwrap(),
        vec![0x44; 48]
    );
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn asset_management_group_intents_pin_replay_and_never_reclaim_uncertainty(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let scope = store.default_workspace().await.unwrap();
    let account = vendor(&store, "Intent account").await;
    store
        .save_asset_management_credential(account, 0, "original", &encrypted_fixture(0x55))
        .await
        .unwrap();
    qualify(&store, scope, account).await;
    let key = Uuid::new_v4();
    let request =
        niu_media::asset_group::OrdinaryAssetGroupCreate::new("Virtual character".into(), None)
            .unwrap();
    let intent = store
        .prepare_asset_group_create(scope, key, account, 1, &request)
        .await
        .unwrap();
    assert_eq!(
        intent.request_body.as_ref().unwrap()["ProjectName"],
        "original"
    );
    let reopened = Store::from_pool(pool.clone());
    assert_eq!(
        reopened
            .prepare_asset_group_create(scope, key, account, 1, &request)
            .await
            .unwrap()
            .id,
        intent.id
    );
    let changed =
        niu_media::asset_group::OrdinaryAssetGroupCreate::new("Changed".into(), None).unwrap();
    assert!(matches!(
        store
            .prepare_asset_group_create(scope, key, account, 1, &changed)
            .await,
        Err(StoreError::Conflict)
    ));
    let (a, b) = tokio::join!(
        store.claim_asset_group_create(scope, intent.id),
        reopened.claim_asset_group_create(scope, intent.id)
    );
    assert_ne!(a.unwrap(), b.unwrap());
    assert!(
        store
            .mark_asset_group_create_uncertain(scope, intent.id)
            .await
            .unwrap()
    );
    assert!(
        !reopened
            .claim_asset_group_create(scope, intent.id)
            .await
            .unwrap()
    );
    assert!(
        sqlx::query("UPDATE asset_group_create_intents SET state='prepared' WHERE id=$1")
            .bind(intent.id)
            .execute(&pool)
            .await
            .is_err()
    );
    assert!(
        sqlx::query("UPDATE asset_group_create_intents SET request_body='{}' WHERE id=$1")
            .bind(intent.id)
            .execute(&pool)
            .await
            .is_err()
    );
    let prepared = store
        .prepare_asset_group_create(scope, Uuid::new_v4(), account, 1, &request)
        .await
        .unwrap();
    store
        .revoke_asset_management_credentials(account, 1, false)
        .await
        .unwrap();
    assert!(
        !store
            .claim_asset_group_create(scope, prepared.id)
            .await
            .unwrap()
    );
    assert!(
        store
            .complete_asset_group_create(scope, intent.id, "group-fixture")
            .await
            .unwrap()
    );
    assert!(
        !store
            .complete_asset_group_create(scope, intent.id, "group-other")
            .await
            .unwrap()
    );
    let mut foreign = scope;
    foreign.project_id = Uuid::new_v4();
    assert!(
        store
            .asset_group_create_intent(foreign, intent.id)
            .await
            .unwrap()
            .is_none()
    );
    let recovered = reopened
        .asset_group_create_intent(scope, intent.id)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(recovered.state, "succeeded");
    assert_eq!(
        recovered.upstream_group_id.as_deref(),
        Some("group-fixture")
    );

    assert!(
        !store
            .claim_asset_group_create(foreign, intent.id)
            .await
            .unwrap()
    );
    assert!(
        !store
            .complete_asset_group_create(foreign, intent.id, "group-fixture")
            .await
            .unwrap()
    );
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn asset_management_intents_reject_changed_account_configuration(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let scope = store.default_workspace().await.unwrap();
    let account = vendor(&store, "Pinned asset account").await;
    store
        .save_asset_management_credential(account, 0, "original", &encrypted_fixture(0x66))
        .await
        .unwrap();
    qualify(&store, scope, account).await;
    let request =
        niu_media::asset_group::OrdinaryAssetGroupCreate::new("Character".into(), None).unwrap();
    let key = Uuid::new_v4();
    let intent = store
        .prepare_asset_group_create(scope, key, account, 1, &request)
        .await
        .unwrap();
    let revision = store.vendor(account).await.unwrap().unwrap().revision;
    assert_eq!(intent.vendor_revision, revision);
    store
        .update_vendor(
            account,
            niu_storage::VendorUpdate {
                name: "Changed account".into(),
                api_base: "https://openrouter.ai/api/v1".into(),
                enabled: false,
                credential_ciphertext: None,
                expected_revision: revision,
            },
        )
        .await
        .unwrap();
    assert!(
        !store
            .claim_asset_group_create(scope, intent.id)
            .await
            .unwrap()
    );
    assert!(matches!(
        store
            .prepare_asset_group_create(scope, key, account, 1, &request)
            .await,
        Err(StoreError::Conflict)
    ));
    assert_eq!(
        store
            .asset_group_create_intent(scope, intent.id)
            .await
            .unwrap()
            .unwrap()
            .vendor_revision,
        revision
    );
    assert!(sqlx::query("UPDATE asset_group_create_intents SET vendor_revision=$2,state='dispatching' WHERE id=$1").bind(intent.id).bind(revision+1).execute(&pool).await.is_err());
}

#[sqlx::test(migrations = false)]
#[ignore = "requires PostgreSQL"]
async fn asset_management_intent_upgrade_preserves_history_without_fabricating_revision(
    pool: PgPool,
) {
    let old = sqlx::migrate::Migrator {
        migrations: std::borrow::Cow::Owned(
            MIGRATOR
                .iter()
                .filter(|migration| migration.version <= 155)
                .cloned()
                .collect(),
        ),
        ..sqlx::migrate::Migrator::DEFAULT
    };
    old.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let scope = store.default_workspace().await.unwrap();
    let account = vendor(&store, "Legacy asset account").await;
    store
        .save_asset_management_credential(
            account,
            0,
            "historical-project",
            &encrypted_fixture(0x77),
        )
        .await
        .unwrap();
    let body = serde_json::json!({"Name":"Historical character","GroupType":"AIGC","ProjectName":"historical-project"});
    let mut saved = Vec::new();
    for state in ["prepared", "dispatching", "uncertain", "succeeded"] {
        let id = Uuid::new_v4();
        let group = if state == "succeeded" {
            Some("group-historical")
        } else {
            None
        };
        sqlx::query("INSERT INTO asset_group_create_intents(id,organization_id,project_id,idempotency_key,vendor_id,credential_revision,upstream_project,request_body,state,upstream_group_id) VALUES($1,$2,$3,$4,$5,1,'historical-project',$6,$7,$8)")
            .bind(id).bind(scope.organization_id).bind(scope.project_id).bind(Uuid::new_v4()).bind(account).bind(&body).bind(state).bind(group).execute(&pool).await.unwrap();
        let created: String = sqlx::query_scalar(
            "SELECT created_at::text FROM asset_group_create_intents WHERE id=$1",
        )
        .bind(id)
        .fetch_one(&pool)
        .await
        .unwrap();
        saved.push((id, state, group, created));
    }
    MIGRATOR.run(&pool).await.unwrap();
    let reopened = Store::from_pool(pool.clone());
    for (id, state, group, created) in saved {
        let record = reopened
            .asset_group_create_intent(scope, id)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(record.vendor_revision, 0);
        assert_eq!(record.vendor_id, account);
        assert_eq!(record.credential_revision, 1);
        assert_eq!(record.upstream_project, "historical-project");
        assert_eq!(record.request_body, Some(body.clone()));
        assert_eq!(record.state, state);
        assert_eq!(record.upstream_group_id.as_deref(), group);
        assert_eq!(
            sqlx::query_scalar::<_, String>(
                "SELECT created_at::text FROM asset_group_create_intents WHERE id=$1"
            )
            .bind(id)
            .fetch_one(&pool)
            .await
            .unwrap(),
            created
        );
        assert!(!reopened.claim_asset_group_create(scope, id).await.unwrap());
        assert!(sqlx::query("UPDATE asset_group_create_intents SET vendor_revision=1,state='dispatching' WHERE id=$1").bind(id).execute(&pool).await.is_err());
    }
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn asset_management_reconciliation_is_bounded_scoped_and_never_requeues(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let scope = store.default_workspace().await.unwrap();
    let account = vendor(&store, "Recovery account").await;
    store
        .save_asset_management_credential(account, 0, "original", &encrypted_fixture(0x88))
        .await
        .unwrap();
    qualify(&store, scope, account).await;
    let request =
        niu_media::asset_group::OrdinaryAssetGroupCreate::new("Character".into(), None).unwrap();
    let mut old_ids = Vec::new();
    for _ in 0..3 {
        let intent = store
            .prepare_asset_group_create(scope, Uuid::new_v4(), account, 1, &request)
            .await
            .unwrap();
        assert!(
            store
                .claim_asset_group_create(scope, intent.id)
                .await
                .unwrap()
        );
        sqlx::query("UPDATE asset_group_create_intents SET state='uncertain',updated_at=clock_timestamp()-interval '2 hours' WHERE id=$1").bind(intent.id).execute(&pool).await.unwrap();
        old_ids.push(intent.id);
    }
    old_ids.sort();
    let young = store
        .prepare_asset_group_create(scope, Uuid::new_v4(), account, 1, &request)
        .await
        .unwrap();
    store
        .claim_asset_group_create(scope, young.id)
        .await
        .unwrap();
    let prepared = store
        .prepare_asset_group_create(scope, Uuid::new_v4(), account, 1, &request)
        .await
        .unwrap();
    store
        .revoke_asset_management_credentials(account, 1, true)
        .await
        .unwrap();
    let reopened = Store::from_pool(pool.clone());
    let first = reopened
        .asset_group_reconciliation_candidates(scope, None, 2, 3600)
        .await
        .unwrap();
    assert_eq!(first.iter().map(|r| r.id).collect::<Vec<_>>(), old_ids[..2]);
    assert!(first.iter().all(|r| r.vendor_id == account
        && r.credential_revision == 1
        && r.vendor_revision > 0
        && r.state == "uncertain"));
    let second = reopened
        .asset_group_reconciliation_candidates(scope, Some(first[1].id), 2, 3600)
        .await
        .unwrap();
    assert_eq!(
        second.iter().map(|r| r.id).collect::<Vec<_>>(),
        old_ids[2..]
    );
    assert!(
        !reopened
            .claim_asset_group_create(scope, old_ids[0])
            .await
            .unwrap()
    );
    assert!(
        reopened
            .complete_asset_group_create(scope, old_ids[0], "group-reconciled")
            .await
            .unwrap()
    );
    let remaining = reopened
        .asset_group_reconciliation_candidates(scope, None, 100, 3600)
        .await
        .unwrap();
    assert_eq!(
        remaining.iter().map(|r| r.id).collect::<Vec<_>>(),
        old_ids[1..]
    );
    let all = reopened
        .asset_group_reconciliation_candidates(scope, None, 100, 0)
        .await
        .unwrap();
    assert!(all.iter().any(|r| r.id == young.id));
    assert!(!all.iter().any(|r| r.id == prepared.id));
    let mut foreign = scope;
    foreign.project_id = Uuid::new_v4();
    assert!(
        reopened
            .asset_group_reconciliation_candidates(foreign, None, 100, 0)
            .await
            .unwrap()
            .is_empty()
    );
    for (limit, age) in [(0, 0), (101, 0), (1, -1), (1, 2592001)] {
        assert!(matches!(
            reopened
                .asset_group_reconciliation_candidates(scope, None, limit, age)
                .await,
            Err(StoreError::InvalidVendor)
        ));
    }
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn asset_management_request_expiry_hides_and_erases_without_losing_recovery(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let scope = store.default_workspace().await.unwrap();
    let account = vendor(&store, "Retention account").await;
    store
        .save_asset_management_credential(account, 0, "original", &encrypted_fixture(0x99))
        .await
        .unwrap();
    qualify(&store, scope, account).await;
    let revision = store.vendor(account).await.unwrap().unwrap().revision;
    let body =
        serde_json::json!({"Name":"Private character","GroupType":"AIGC","ProjectName":"original"});
    let expired = Uuid::new_v4();
    let expired_key = Uuid::new_v4();
    sqlx::query("INSERT INTO asset_group_create_intents(id,organization_id,project_id,idempotency_key,vendor_id,vendor_revision,credential_revision,upstream_project,request_body,request_fingerprint,request_expires_at,state,created_at) VALUES($1,$2,$3,$4,$5,$6,1,'original',$7,sha256(convert_to($7::jsonb::text,'UTF8')),clock_timestamp()-interval '1 hour','uncertain',clock_timestamp()-interval '25 hours')")
        .bind(expired).bind(scope.organization_id).bind(scope.project_id).bind(expired_key).bind(account).bind(revision).bind(&body).execute(&pool).await.unwrap();
    let summaries = store
        .asset_group_request_summaries(scope, None, 30)
        .await
        .unwrap();
    assert_eq!(summaries.len(), 1);
    assert_eq!(summaries[0]["request_content_status"], "expired");
    assert!(summaries[0]["name"].is_null());
    assert_eq!(summaries[0].as_object().unwrap().len(), 5);
    let mut foreign = scope;
    foreign.project_id = Uuid::new_v4();
    assert!(
        store
            .asset_group_request_summaries(foreign, None, 30)
            .await
            .unwrap()
            .is_empty()
    );
    for limit in [0, 102] {
        assert!(
            store
                .asset_group_request_summaries(scope, None, limit)
                .await
                .is_err()
        );
    }
    let before = store
        .asset_group_create_intent(scope, expired)
        .await
        .unwrap()
        .unwrap();
    assert!(before.request_body.is_none());
    let customer = store
        .asset_group_request_detail(scope, expired)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(customer["request_content_status"], "expired");
    assert!(customer["request"].is_null());
    for private in [
        "Private character",
        "vendor_id",
        "credential_revision",
        "upstream_project",
        "request_fingerprint",
    ] {
        assert!(!customer.to_string().contains(private));
    }

    assert!(
        sqlx::query_scalar::<_, bool>(
            "SELECT request_body IS NOT NULL FROM asset_group_create_intents WHERE id=$1"
        )
        .bind(expired)
        .fetch_one(&pool)
        .await
        .unwrap()
    );
    let request =
        niu_media::asset_group::OrdinaryAssetGroupCreate::new("Fresh character".into(), None)
            .unwrap();
    let fresh = store
        .prepare_asset_group_create(scope, Uuid::new_v4(), account, 1, &request)
        .await
        .unwrap();
    assert!(
        sqlx::query("UPDATE asset_group_create_intents SET request_body=NULL WHERE id=$1")
            .bind(fresh.id)
            .execute(&pool)
            .await
            .is_err()
    );
    assert!(sqlx::query("UPDATE asset_group_create_intents SET request_expires_at=clock_timestamp()+interval '10 days',state='succeeded',upstream_group_id='group-fixture' WHERE id=$1").bind(expired).execute(&pool).await.is_err());
    store.purge_expired_request_payloads().await.unwrap();
    assert_eq!(store.purge_expired_asset_group_requests().await.unwrap(), 0);
    assert!(
        !sqlx::query_scalar::<_, bool>(
            "SELECT request_body IS NOT NULL FROM asset_group_create_intents WHERE id=$1"
        )
        .bind(expired)
        .fetch_one(&pool)
        .await
        .unwrap()
    );
    let after = store
        .asset_group_create_intent(scope, expired)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(after.request_fingerprint, before.request_fingerprint);
    assert_eq!(after.state, "uncertain");
    let original =
        niu_media::asset_group::OrdinaryAssetGroupCreate::new("Private character".into(), None)
            .unwrap();
    let replay = store
        .prepare_asset_group_create(scope, expired_key, account, 1, &original)
        .await
        .unwrap();
    assert_eq!(replay.id, expired);
    assert!(replay.request_body.is_none());
    assert!(matches!(
        store
            .prepare_asset_group_create(scope, expired_key, account, 1, &request)
            .await,
        Err(StoreError::Conflict)
    ));

    assert!(
        !store
            .claim_asset_group_create(scope, expired)
            .await
            .unwrap()
    );
    assert!(
        store
            .complete_asset_group_create(scope, expired, "group-reconciled")
            .await
            .unwrap()
    );
    assert!(
        store
            .asset_group_create_intent(scope, fresh.id)
            .await
            .unwrap()
            .unwrap()
            .request_body
            .is_some()
    );
    assert!(
        sqlx::query("UPDATE asset_group_create_intents SET request_body=$2 WHERE id=$1")
            .bind(expired)
            .bind(&body)
            .execute(&pool)
            .await
            .is_err()
    );
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn asset_management_claim_loads_original_credentials_once_after_rotation(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let scope = store.default_workspace().await.unwrap();
    let account = vendor(&store, "Dispatch handoff account").await;
    let original = encrypted_fixture(0x11);
    store
        .save_asset_management_credential(account, 0, "original-project", &original)
        .await
        .unwrap();
    qualify(&store, scope, account).await;
    let request =
        niu_media::asset_group::OrdinaryAssetGroupCreate::new("Character".into(), None).unwrap();
    let intent = store
        .prepare_asset_group_create(scope, Uuid::new_v4(), account, 1, &request)
        .await
        .unwrap();
    store
        .save_asset_management_credential(account, 1, "rotated-project", &encrypted_fixture(0x22))
        .await
        .unwrap();
    let reopened = Store::from_pool(pool.clone());
    let (a, b) = tokio::join!(
        store.claim_asset_group_create_credentials(scope, intent.id),
        reopened.claim_asset_group_create_credentials(scope, intent.id)
    );
    let mut claims = vec![a.unwrap(), b.unwrap()]
        .into_iter()
        .flatten()
        .collect::<Vec<_>>();
    assert_eq!(claims.len(), 1);
    let claimed = claims.pop().unwrap();
    assert_eq!(claimed.intent.id, intent.id);
    assert_eq!(claimed.intent.state, "dispatching");
    assert_eq!(
        claimed.intent.request_body.as_ref().unwrap()["ProjectName"],
        "original-project"
    );
    assert_eq!(
        claimed.request().body("original-project").unwrap(),
        *claimed.intent.request_body.as_ref().unwrap()
    );
    assert_eq!(claimed.credential.vendor_id, account);
    assert_eq!(claimed.credential.revision, 1);
    assert_eq!(claimed.credential.upstream_project, "original-project");
    assert_eq!(claimed.credential.credential_ciphertext, original);
    let blocked = store
        .prepare_asset_group_create(scope, Uuid::new_v4(), account, 2, &request)
        .await
        .unwrap();
    store
        .revoke_asset_management_credentials(account, 2, true)
        .await
        .unwrap();
    assert!(
        reopened
            .claim_asset_group_create_credentials(scope, blocked.id)
            .await
            .unwrap()
            .is_none()
    );
    assert!(
        reopened
            .claim_asset_group_create_credentials(scope, intent.id)
            .await
            .unwrap()
            .is_none()
    );
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn asset_management_explicit_request_deletion_is_scoped_and_blocks_restoration(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let scope = store.default_workspace().await.unwrap();
    let account = vendor(&store, "Deletion account").await;
    store
        .save_asset_management_credential(account, 0, "original", &encrypted_fixture(0xaa))
        .await
        .unwrap();
    qualify(&store, scope, account).await;
    let request =
        niu_media::asset_group::OrdinaryAssetGroupCreate::new("Character".into(), None).unwrap();
    let key = Uuid::new_v4();
    let intent = store
        .prepare_asset_group_create(scope, key, account, 1, &request)
        .await
        .unwrap();
    let mut foreign = scope;
    foreign.project_id = Uuid::new_v4();
    assert!(
        !store
            .delete_asset_group_request(foreign, intent.id)
            .await
            .unwrap()
    );
    assert!(
        store
            .asset_group_create_intent(scope, intent.id)
            .await
            .unwrap()
            .unwrap()
            .request_body
            .is_some()
    );
    assert!(
        store
            .delete_asset_group_request(scope, intent.id)
            .await
            .unwrap()
    );
    assert!(
        !store
            .delete_asset_group_request(scope, intent.id)
            .await
            .unwrap()
    );
    assert!(
        !store
            .claim_asset_group_create(scope, intent.id)
            .await
            .unwrap()
    );
    let replay = store
        .prepare_asset_group_create(scope, key, account, 1, &request)
        .await
        .unwrap();
    assert_eq!(replay.id, intent.id);
    assert!(replay.request_body.is_none());
    assert_eq!(replay.request_fingerprint, intent.request_fingerprint);
    assert_eq!(
        sqlx::query_scalar::<_, i64>(
            "SELECT count(*) FROM asset_group_request_deletions WHERE intent_id=$1"
        )
        .bind(intent.id)
        .fetch_one(&pool)
        .await
        .unwrap(),
        1
    );
    assert!(
        sqlx::query("DELETE FROM asset_group_request_deletions WHERE intent_id=$1")
            .bind(intent.id)
            .execute(&pool)
            .await
            .is_err()
    );
    assert!(
        sqlx::query("UPDATE asset_group_create_intents SET request_body=$2 WHERE id=$1")
            .bind(intent.id)
            .bind(intent.request_body.unwrap())
            .execute(&pool)
            .await
            .is_err()
    );
    let dispatched = store
        .prepare_asset_group_create(scope, Uuid::new_v4(), account, 1, &request)
        .await
        .unwrap();
    assert!(
        store
            .claim_asset_group_create(scope, dispatched.id)
            .await
            .unwrap()
    );
    assert!(
        store
            .delete_asset_group_request(scope, dispatched.id)
            .await
            .unwrap()
    );
    assert!(
        store
            .mark_asset_group_create_uncertain(scope, dispatched.id)
            .await
            .unwrap()
    );
    assert!(
        store
            .complete_asset_group_create(scope, dispatched.id, "group-reconciled")
            .await
            .unwrap()
    );
    assert!(
        store
            .asset_group_create_intent(scope, dispatched.id)
            .await
            .unwrap()
            .unwrap()
            .request_body
            .is_none()
    );
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn asset_management_claim_rejects_malformed_saved_request_without_consuming_intent(
    pool: PgPool,
) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let scope = store.default_workspace().await.unwrap();
    let account = vendor(&store, "Legacy request validation account").await;
    store
        .save_asset_management_credential(account, 0, "original-project", &encrypted_fixture(0x77))
        .await
        .unwrap();
    qualify(&store, scope, account).await;
    let revision = store.vendor(account).await.unwrap().unwrap().revision;
    let valid = niu_media::asset_group::OrdinaryAssetGroupCreate::new("Character".into(), None)
        .unwrap()
        .body("original-project")
        .unwrap();
    for (field, value) in [
        ("GroupType", serde_json::json!("LivenessFace")),
        ("ProjectName", serde_json::json!("different-project")),
        ("Description", serde_json::json!(null)),
        ("UnreviewedControl", serde_json::json!(true)),
    ] {
        let intent = Uuid::new_v4();
        let mut body = valid.clone();
        body[field] = value;
        // Simulate an imported/legacy record. Its fingerprint is valid, so
        // only semantic validation can reject this credential handoff.
        sqlx::query("INSERT INTO asset_group_create_intents(id,organization_id,project_id,idempotency_key,vendor_id,vendor_revision,credential_revision,upstream_project,request_body,request_fingerprint,request_expires_at) VALUES($1,$2,$3,$4,$5,$6,1,'original-project',$7,sha256(convert_to($7::jsonb::text,'UTF8')),clock_timestamp()+interval '24 hours')")
            .bind(intent).bind(scope.organization_id).bind(scope.project_id).bind(Uuid::new_v4()).bind(account).bind(revision).bind(&body).execute(&pool).await.unwrap();
        assert!(matches!(
            store
                .claim_asset_group_create_credentials(scope, intent)
                .await,
            Err(StoreError::InvalidVendor)
        ));
        let saved = store
            .asset_group_create_intent(scope, intent)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(saved.state, "prepared");
        assert_eq!(saved.request_body, Some(body));
        assert!(saved.upstream_group_id.is_none());
    }
}
