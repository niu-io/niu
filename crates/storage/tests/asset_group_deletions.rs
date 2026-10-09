use niu_storage::{
    AssetGroupDeletionConsent, AssetOperationQualification, MIGRATOR, OperatorAuditActor, Store,
    StoreError, VendorInput,
};
use sqlx::PgPool;
use uuid::Uuid;

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn deletion_consent_is_specific_immutable_short_lived_and_revocable(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let org = store
        .create_organization("Deletion consent fixture")
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
            name: "Ark consent fixture".into(),
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
    let qualification = || AssetOperationQualification {
        vendor_id: vendor,
        vendor_revision: 1,
        credential_revision: 1,
        rights_sha256: [1; 32],
        protocol_sha256: [2; 32],
        data_handling_sha256: [3; 32],
        free_operation_sha256: [4; 32],
        valid_for_seconds: 60,
    };
    let creation = store
        .qualify_asset_group_creation(scope, qualification(), OperatorAuditActor::Installation)
        .await
        .unwrap();
    let body =
        niu_media::asset_group::OrdinaryAssetGroupCreate::new("Character".into(), None).unwrap();
    let intent = store
        .prepare_asset_group_create(scope, Uuid::new_v4(), vendor, 1, &body)
        .await
        .unwrap();
    let grant = store
        .qualify_asset_group_deletion(scope, qualification(), OperatorAuditActor::Installation)
        .await
        .unwrap();
    let id = Uuid::new_v4();
    let input =
        |id, authorization_id, valid_for_seconds, confirm_cascade| AssetGroupDeletionConsent {
            id,
            intent_id: intent.id,
            authorization_id,
            valid_for_seconds,
            confirm_cascade,
        };
    assert!(matches!(
        store
            .consent_asset_group_deletion(
                scope,
                input(id, grant, 900, true),
                OperatorAuditActor::Installation
            )
            .await,
        Err(StoreError::Conflict)
    ));
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
    for (seconds, confirm) in [(0, true), (901, true), (60, false)] {
        assert!(matches!(
            store
                .consent_asset_group_deletion(
                    scope,
                    input(id, grant, seconds, confirm),
                    OperatorAuditActor::Installation
                )
                .await,
            Err(StoreError::InvalidObservation)
        ));
    }
    for (target, authorization) in [(other, grant), (scope, creation)] {
        assert!(matches!(
            store
                .consent_asset_group_deletion(
                    target,
                    input(id, authorization, 900, true),
                    OperatorAuditActor::Installation
                )
                .await,
            Err(StoreError::Conflict)
        ));
    }
    let (a, b) = tokio::join!(
        store.consent_asset_group_deletion(
            scope,
            input(id, grant, 900, true),
            OperatorAuditActor::Installation
        ),
        store.consent_asset_group_deletion(
            scope,
            input(id, grant, 900, true),
            OperatorAuditActor::Installation
        )
    );
    assert_ne!(a.unwrap(), b.unwrap());
    let snapshot: serde_json::Value =
        sqlx::query_scalar("SELECT to_jsonb(c) FROM asset_group_deletion_consents c WHERE id=$1")
            .bind(id)
            .fetch_one(&pool)
            .await
            .unwrap();
    let capped: bool = sqlx::query_scalar("SELECT c.expires_at=a.expires_at FROM asset_group_deletion_consents c JOIN asset_operation_authorizations a ON a.id=c.authorization_id WHERE c.id=$1").bind(id).fetch_one(&pool).await.unwrap();
    assert!(capped);
    assert!(matches!(
        store
            .consent_asset_group_deletion(
                scope,
                input(id, grant, 900, true),
                OperatorAuditActor::Operator(Uuid::new_v4())
            )
            .await,
        Err(StoreError::Conflict)
    ));
    for actor in [
        OperatorAuditActor::Installation,
        OperatorAuditActor::Operator(Uuid::new_v4()),
    ] {
        assert!(matches!(
            store
                .consent_asset_group_deletion(scope, input(id, grant, 60, true), actor)
                .await,
            Err(StoreError::Conflict)
        ));
    }
    for sql in [
        "UPDATE asset_group_deletion_consents SET valid_for_seconds=1 WHERE id=$1",
        "DELETE FROM asset_group_deletion_consents WHERE id=$1",
    ] {
        assert!(sqlx::query(sql).bind(id).execute(&pool).await.is_err());
    }
    let reopened = Store::from_pool(pool.clone());
    assert!(
        !reopened
            .consent_asset_group_deletion(
                scope,
                input(id, grant, 900, true),
                OperatorAuditActor::Installation
            )
            .await
            .unwrap()
    );
    let unchanged: serde_json::Value =
        sqlx::query_scalar("SELECT to_jsonb(c) FROM asset_group_deletion_consents c WHERE id=$1")
            .bind(id)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(snapshot, unchanged);
    assert!(
        !store
            .revoke_asset_group_deletion_consent(other, id, OperatorAuditActor::Installation)
            .await
            .unwrap()
    );
    assert!(
        store
            .revoke_asset_group_deletion_consent(scope, id, OperatorAuditActor::Installation)
            .await
            .unwrap()
    );
    assert!(
        !store
            .revoke_asset_group_deletion_consent(scope, id, OperatorAuditActor::Installation)
            .await
            .unwrap()
    );
    assert!(matches!(
        store
            .consent_asset_group_deletion(
                scope,
                input(id, grant, 900, true),
                OperatorAuditActor::Installation
            )
            .await,
        Err(StoreError::Conflict)
    ));
    assert!(
        sqlx::query("DELETE FROM asset_group_deletion_consent_revocations WHERE consent_id=$1")
            .bind(id)
            .execute(&pool)
            .await
            .is_err()
    );
    let expired = Uuid::new_v4();
    assert!(
        store
            .consent_asset_group_deletion(
                scope,
                input(expired, grant, 1, true),
                OperatorAuditActor::Installation
            )
            .await
            .unwrap()
    );
    sqlx::query("SELECT pg_sleep(1.1)")
        .execute(&pool)
        .await
        .unwrap();
    assert!(matches!(
        store
            .consent_asset_group_deletion(
                scope,
                input(expired, grant, 1, true),
                OperatorAuditActor::Installation
            )
            .await,
        Err(StoreError::Conflict)
    ));

    use niu_storage::{AssetGroupDeletionOutcome, PreparedAssetGroupUpdate};
    use sha2::{Digest, Sha256};
    let consent = Uuid::new_v4();
    store
        .consent_asset_group_deletion(
            scope,
            input(consent, grant, 60, true),
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    store
        .qualify_asset_group_update(scope, qualification(), OperatorAuditActor::Installation)
        .await
        .unwrap();
    let patch = store
        .asset_group_update_request(scope, vendor, intent.id, Some("Renamed".into()), None)
        .await
        .unwrap()
        .unwrap()
        .encode_private()
        .unwrap();
    let update = Uuid::new_v4();
    store
        .prepare_asset_group_update(
            scope,
            PreparedAssetGroupUpdate {
                intent_id: intent.id,
                update_id: update,
                patch_sha256: Sha256::digest(&patch).into(),
                ciphertext: vec![1; 48],
            },
        )
        .await
        .unwrap();
    assert!(
        store
            .claim_asset_group_deletion(other, consent)
            .await
            .unwrap()
            .is_none()
    );
    assert!(
        store
            .claim_asset_group_deletion(scope, id)
            .await
            .unwrap()
            .is_none()
    );
    assert!(
        store
            .claim_asset_group_deletion(scope, expired)
            .await
            .unwrap()
            .is_none()
    );
    let (a, b) = tokio::join!(
        store.claim_asset_group_deletion(scope, consent),
        store.claim_asset_group_deletion(scope, consent)
    );
    let a = a.unwrap();
    let b = b.unwrap();
    assert_ne!(a.is_some(), b.is_some());
    let claimed = a.or(b).unwrap();
    assert_eq!(claimed.intent_id, intent.id);
    assert_eq!(claimed.authorization_id, grant);
    assert_eq!(claimed.credential.vendor_id, vendor);
    assert_eq!(claimed.credential.revision, 1);
    assert_eq!(claimed.credential.upstream_project, "original-project");
    assert!(
        store
            .claim_asset_group_update(scope, update, |_| panic!(
                "deletion fence must reject before decoding"
            ))
            .await
            .unwrap()
            .is_none()
    );
    let replacement = Uuid::new_v4();
    store
        .consent_asset_group_deletion(
            scope,
            input(replacement, grant, 60, true),
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    assert!(
        store
            .claim_asset_group_deletion(scope, replacement)
            .await
            .unwrap()
            .is_none()
    );
    assert!(
        !store
            .record_asset_group_deletion_outcome(
                other,
                consent,
                AssetGroupDeletionOutcome::Acknowledged,
                1
            )
            .await
            .unwrap()
    );
    assert!(
        store
            .record_asset_group_deletion_outcome(
                scope,
                consent,
                AssetGroupDeletionOutcome::Uncertain { reason: "timeout" },
                4
            )
            .await
            .unwrap()
    );
    assert!(
        !store
            .record_asset_group_deletion_outcome(
                scope,
                consent,
                AssetGroupDeletionOutcome::Acknowledged,
                5
            )
            .await
            .unwrap()
    );
    let reopened = Store::from_pool(pool.clone());
    assert!(
        reopened
            .claim_asset_group_deletion(scope, consent)
            .await
            .unwrap()
            .is_none()
    );
    assert!(
        reopened
            .claim_asset_group_update(scope, update, |_| panic!(
                "uncertain deletion must retain fence"
            ))
            .await
            .unwrap()
            .is_none()
    );
    for sql in [
        "DELETE FROM asset_group_deletion_claims WHERE consent_id=$1",
        "UPDATE asset_group_deletion_outcomes SET outcome='acknowledged',reason=NULL WHERE consent_id=$1",
    ] {
        assert!(sqlx::query(sql).bind(consent).execute(&pool).await.is_err());
    }
    let outcome: (String, String, i64) = sqlx::query_as(
        "SELECT outcome,reason,duration_ms FROM asset_group_deletion_outcomes WHERE consent_id=$1",
    )
    .bind(consent)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(outcome, ("uncertain".into(), "timeout".into(), 4));
    // A different local creation receipt for the same upstream group cannot
    // bypass the original-account mutation fence.
    let alias = store
        .prepare_asset_group_create(scope, Uuid::new_v4(), vendor, 1, &body)
        .await
        .unwrap();
    store
        .claim_asset_group_create(scope, alias.id)
        .await
        .unwrap();
    store
        .record_asset_group_dispatch_outcome(scope, alias.id, Some("group-original"), None, 1)
        .await
        .unwrap();
    let alias_consent = Uuid::new_v4();
    store
        .consent_asset_group_deletion(
            scope,
            AssetGroupDeletionConsent {
                id: alias_consent,
                intent_id: alias.id,
                authorization_id: grant,
                valid_for_seconds: 60,
                confirm_cascade: true,
            },
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    assert!(
        store
            .claim_asset_group_deletion(scope, alias_consent)
            .await
            .unwrap()
            .is_none()
    );
    let alias_patch = store
        .asset_group_update_request(scope, vendor, alias.id, Some("Alias patch".into()), None)
        .await
        .unwrap()
        .unwrap()
        .encode_private()
        .unwrap();
    let alias_update = Uuid::new_v4();
    store
        .prepare_asset_group_update(
            scope,
            PreparedAssetGroupUpdate {
                intent_id: alias.id,
                update_id: alias_update,
                patch_sha256: Sha256::digest(&alias_patch).into(),
                ciphertext: vec![1; 48],
            },
        )
        .await
        .unwrap();
    assert!(
        store
            .claim_asset_group_update(scope, alias_update, |_| panic!(
                "alias must not bypass deletion fence"
            ))
            .await
            .unwrap()
            .is_none()
    );
    // A pending metadata mutation must also prevent deletion, including after
    // acknowledgement until the independent update reconciliation releases it.
    let second = store
        .prepare_asset_group_create(scope, Uuid::new_v4(), vendor, 1, &body)
        .await
        .unwrap();
    assert!(
        store
            .claim_asset_group_create(scope, second.id)
            .await
            .unwrap()
    );
    store
        .record_asset_group_dispatch_outcome(scope, second.id, Some("group-second"), None, 1)
        .await
        .unwrap();
    let second_consent = Uuid::new_v4();
    store
        .consent_asset_group_deletion(
            scope,
            AssetGroupDeletionConsent {
                id: second_consent,
                intent_id: second.id,
                authorization_id: grant,
                valid_for_seconds: 60,
                confirm_cascade: true,
            },
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let patch = store
        .asset_group_update_request(scope, vendor, second.id, Some("Other name".into()), None)
        .await
        .unwrap()
        .unwrap()
        .encode_private()
        .unwrap();
    let second_update = Uuid::new_v4();
    store
        .prepare_asset_group_update(
            scope,
            PreparedAssetGroupUpdate {
                intent_id: second.id,
                update_id: second_update,
                patch_sha256: Sha256::digest(&patch).into(),
                ciphertext: vec![1; 48],
            },
        )
        .await
        .unwrap();
    assert!(
        store
            .claim_asset_group_update(scope, second_update, |_| Ok(patch))
            .await
            .unwrap()
            .is_some()
    );
    assert!(
        store
            .claim_asset_group_deletion(scope, second_consent)
            .await
            .unwrap()
            .is_none()
    );
    store
        .record_asset_group_update_outcome(
            scope,
            second_update,
            niu_storage::AssetGroupUpdateOutcome::Acknowledged,
            1,
        )
        .await
        .unwrap();
    assert!(
        store
            .claim_asset_group_deletion(scope, second_consent)
            .await
            .unwrap()
            .is_none()
    );
    store
        .revoke_asset_operation_authorization(grant, OperatorAuditActor::Installation)
        .await
        .unwrap();
    assert!(matches!(
        store
            .consent_asset_group_deletion(
                scope,
                input(Uuid::new_v4(), grant, 60, true),
                OperatorAuditActor::Installation
            )
            .await,
        Err(StoreError::Conflict)
    ));
    let count: i64 = sqlx::query_scalar("SELECT count(*) FROM asset_group_deletion_consents")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(count, 6);
}
