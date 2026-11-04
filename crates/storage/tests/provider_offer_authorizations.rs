use niu_storage::{
    MIGRATOR, OperatorAuditActor, OperatorRole, OperatorScope, ProviderOfferInput,
    RouteRegistryOffer, Store, StoreError,
};
use sqlx::PgPool;
use uuid::Uuid;

#[test]
fn older_routing_snapshot_without_authorization_still_deserializes() {
    let id = Uuid::new_v4();
    let old = serde_json::json!({"model_alias":"example","vendor_id":id,"provider_id":id,
        "offer_id":id,"active":false,"current_revision":null,"offer_review":null,"supplier_review":null});
    let offer: RouteRegistryOffer = serde_json::from_value(old.clone()).unwrap();
    assert_eq!(offer.offer_authorization, None);
    assert_eq!(serde_json::to_value(offer).unwrap(), old);
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn commercial_authorization_pins_revision_and_fails_closed_on_invalidation(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let provider = store
        .create_provider_business("First Provider")
        .await
        .unwrap();
    let other = store
        .create_provider_business("Other Provider")
        .await
        .unwrap();
    let vendor = Uuid::new_v4();
    sqlx::query("INSERT INTO vendors(id,name,adapter,api_base,credential_ciphertext) VALUES($1,'upstream','openai','https://example.com/v1',$2)")
        .bind(vendor).bind(vec![1u8;48]).execute(&pool).await.unwrap();
    sqlx::query("INSERT INTO vendor_models(alias,vendor_id,upstream_model,capabilities) VALUES('authorization-test',$1,'model',$2)")
        .bind(vendor).bind(serde_json::json!({})).execute(&pool).await.unwrap();
    let revision = store
        .publish_provider_offer(
            provider,
            &ProviderOfferInput {
                model_alias: "authorization-test".into(),
                currency: "USD".into(),
                prompt_rate: "1".into(),
                completion_rate: "1".into(),
                expected_revision: None,
            },
        )
        .await
        .unwrap();
    let offer: Uuid =
        sqlx::query_scalar("SELECT id FROM provider_offers WHERE model_alias='authorization-test'")
            .fetch_one(&pool)
            .await
            .unwrap();
    let scope = store.default_workspace().await.unwrap();
    let member = store
        .create_operator(
            OperatorScope {
                organization_id: scope.organization_id,
                project_id: Some(scope.project_id),
            },
            "Ordinary member",
            OperatorRole::Viewer,
            3600,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    assert!(matches!(
        store
            .record_provider_offer_authorization(
                provider,
                offer,
                revision,
                OperatorAuditActor::Operator(member.operator_id)
            )
            .await,
        Err(StoreError::Unauthorized)
    ));
    assert!(matches!(
        store
            .record_provider_offer_authorization(
                provider,
                offer,
                revision,
                OperatorAuditActor::Installation
            )
            .await,
        Err(StoreError::Conflict)
    ));
    sqlx::query("INSERT INTO vendor_supplier_ownership(vendor_id,provider_id) VALUES($1,$2)")
        .bind(vendor)
        .bind(provider)
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("UPDATE vendors SET enabled=FALSE WHERE id=$1")
        .bind(vendor)
        .execute(&pool)
        .await
        .unwrap();
    assert!(matches!(
        store
            .record_provider_offer_authorization(
                provider,
                offer,
                revision,
                OperatorAuditActor::Installation
            )
            .await,
        Err(StoreError::Conflict)
    ));
    sqlx::query("UPDATE vendors SET enabled=TRUE WHERE id=$1")
        .bind(vendor)
        .execute(&pool)
        .await
        .unwrap();
    assert!(matches!(
        store
            .record_provider_offer_authorization(
                provider,
                offer,
                Uuid::new_v4(),
                OperatorAuditActor::Installation
            )
            .await,
        Err(StoreError::Conflict)
    ));
    let recorded = store
        .record_provider_offer_authorization(
            provider,
            offer,
            revision,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let recorded_revision: Uuid =
        sqlx::query_scalar("SELECT rate_revision FROM provider_offer_authorizations WHERE id=$1")
            .bind(recorded)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(recorded_revision, revision);
    sqlx::query("UPDATE provider_offers SET current_authorization=$2 WHERE id=$1")
        .bind(offer)
        .bind(recorded)
        .execute(&pool)
        .await
        .unwrap();
    // An authorized but paused offer does not expose sellable supply.
    assert!(
        !store
            .supplier_model_available("authorization-test")
            .await
            .unwrap()
    );
    assert!(
        sqlx::query("UPDATE provider_offers SET current_authorization=$2 WHERE id=$1")
            .bind(offer)
            .bind(Uuid::new_v4())
            .execute(&pool)
            .await
            .is_err()
    );
    sqlx::query("UPDATE provider_offers SET active=TRUE WHERE id=$1")
        .bind(offer)
        .execute(&pool)
        .await
        .unwrap();
    assert!(
        store
            .supplier_model_available("authorization-test")
            .await
            .unwrap()
    );
    let operation = store
        .create_operation(scope, "authorization-test")
        .await
        .unwrap();
    let attempt = store
        .prepare_attempt(scope, operation, "authorization-test", "route-v1")
        .await
        .unwrap();
    store
        .bind_provider_offer(
            scope,
            attempt,
            "authorization-test",
            "model",
            Some("https://example.com/v1"),
        )
        .await
        .unwrap();
    let pinned: (Option<Uuid>, Option<Uuid>) = sqlx::query_as("SELECT qualification_review_id,authorization_id FROM provider_attempt_offers WHERE attempt_id=$1")
        .bind(attempt).fetch_one(&pool).await.unwrap();
    assert_eq!(pinned, (None, Some(recorded)));
    sqlx::query(
        "UPDATE vendor_models SET upstream_model='new-model' WHERE alias='authorization-test'",
    )
    .execute(&pool)
    .await
    .unwrap();
    let pointer: Option<Uuid> =
        sqlx::query_scalar("SELECT current_authorization FROM provider_offers WHERE id=$1")
            .bind(offer)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(pointer, None);
    let dispatch = sqlx::query(
        "UPDATE attempts SET execution='may_have_executed',dispatched_at=now() WHERE id=$1",
    )
    .bind(attempt)
    .execute(&pool)
    .await
    .unwrap_err();
    assert_eq!(
        dispatch
            .as_database_error()
            .and_then(|error| error.code())
            .as_deref(),
        Some("P0007")
    );
    let after_model = store
        .record_provider_offer_authorization(
            provider,
            offer,
            revision,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    sqlx::query("UPDATE provider_offers SET current_authorization=$2 WHERE id=$1")
        .bind(offer)
        .bind(after_model)
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("UPDATE vendors SET api_base='https://other.example.com/v1' WHERE id=$1")
        .bind(vendor)
        .execute(&pool)
        .await
        .unwrap();
    let pointer: Option<Uuid> =
        sqlx::query_scalar("SELECT current_authorization FROM provider_offers WHERE id=$1")
            .bind(offer)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(pointer, None);
    let after_route = store
        .record_provider_offer_authorization(
            provider,
            offer,
            revision,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    sqlx::query("UPDATE provider_offers SET current_authorization=$2 WHERE id=$1")
        .bind(offer)
        .bind(after_route)
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("UPDATE provider_offers SET active=TRUE WHERE id=$1")
        .bind(offer)
        .execute(&pool)
        .await
        .unwrap();
    let operation = store
        .create_operation(scope, "authorization-test")
        .await
        .unwrap();
    let revoked_attempt = store
        .prepare_attempt(scope, operation, "authorization-test", "route-v1")
        .await
        .unwrap();
    store
        .bind_provider_offer(
            scope,
            revoked_attempt,
            "authorization-test",
            "new-model",
            Some("https://other.example.com/v1"),
        )
        .await
        .unwrap();
    store
        .revoke_provider_offer_authorization(
            provider,
            offer,
            after_route,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let dispatch = sqlx::query(
        "UPDATE attempts SET execution='may_have_executed',dispatched_at=now() WHERE id=$1",
    )
    .bind(revoked_attempt)
    .execute(&pool)
    .await
    .unwrap_err();
    assert_eq!(
        dispatch
            .as_database_error()
            .and_then(|error| error.code())
            .as_deref(),
        Some("P0007")
    );
    let pointer: Option<Uuid> =
        sqlx::query_scalar("SELECT current_authorization FROM provider_offers WHERE id=$1")
            .bind(offer)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(pointer, None);
    let before_rate = store
        .record_provider_offer_authorization(
            provider,
            offer,
            revision,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    sqlx::query("UPDATE provider_offers SET current_authorization=$2 WHERE id=$1")
        .bind(offer)
        .bind(before_rate)
        .execute(&pool)
        .await
        .unwrap();
    let next_revision = store
        .publish_provider_offer(
            provider,
            &ProviderOfferInput {
                model_alias: "authorization-test".into(),
                currency: "USD".into(),
                prompt_rate: "2".into(),
                completion_rate: "2".into(),
                expected_revision: Some(revision),
            },
        )
        .await
        .unwrap();
    let pointer: Option<Uuid> =
        sqlx::query_scalar("SELECT current_authorization FROM provider_offers WHERE id=$1")
            .bind(offer)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(pointer, None);
    assert!(matches!(
        store
            .enable_authorized_provider_offer(
                provider,
                offer,
                revision,
                OperatorAuditActor::Installation
            )
            .await,
        Err(StoreError::Conflict)
    ));
    assert!(matches!(
        store
            .enable_authorized_provider_offer(
                provider,
                offer,
                next_revision,
                OperatorAuditActor::Operator(member.operator_id)
            )
            .await,
        Err(StoreError::Unauthorized)
    ));
    let enabled = store
        .enable_authorized_provider_offer(
            provider,
            offer,
            next_revision,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let selected: (bool, Option<Uuid>) =
        sqlx::query_as("SELECT active,current_authorization FROM provider_offers WHERE id=$1")
            .bind(offer)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(selected, (true, Some(enabled)));
    let retry = store
        .enable_authorized_provider_offer(
            provider,
            offer,
            next_revision,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    assert_eq!(retry, enabled);
    let count: i64 = sqlx::query_scalar("SELECT count(*) FROM provider_offer_authorizations WHERE provider_id=$1 AND offer_id=$2 AND rate_revision=$3")
        .bind(provider).bind(offer).bind(next_revision).fetch_one(&pool).await.unwrap();
    assert_eq!(count, 1);
    assert!(
        store
            .supplier_model_available("authorization-test")
            .await
            .unwrap()
    );
    store
        .revoke_provider_offer_authorization(
            provider,
            offer,
            enabled,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    assert!(
        !store
            .supplier_model_available("authorization-test")
            .await
            .unwrap()
    );
    let replacement = store
        .enable_authorized_provider_offer(
            provider,
            offer,
            next_revision,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    assert_ne!(replacement, enabled);
    store
        .revoke_provider_offer_authorization(
            provider,
            offer,
            enabled,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    assert!(
        store
            .supplier_model_available("authorization-test")
            .await
            .unwrap()
    );
    assert!(matches!(
        store
            .revoke_provider_offer_authorization(
                provider,
                offer,
                recorded,
                OperatorAuditActor::Operator(member.operator_id)
            )
            .await,
        Err(StoreError::Unauthorized)
    ));
    assert!(matches!(
        store
            .revoke_provider_offer_authorization(
                other,
                offer,
                recorded,
                OperatorAuditActor::Installation
            )
            .await,
        Err(StoreError::Conflict)
    ));
    store
        .revoke_provider_offer_authorization(
            provider,
            offer,
            recorded,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    store
        .revoke_provider_offer_authorization(
            provider,
            offer,
            recorded,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let revocations: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM provider_offer_authorization_revocations WHERE authorization_id=$1",
    )
    .bind(recorded)
    .fetch_one(&pool)
    .await
    .unwrap();
    let audits: i64 = sqlx::query_scalar("SELECT count(*) FROM provider_audit_events WHERE action='offer_authorization_revoked' AND resource_id=$1")
        .bind(recorded).fetch_one(&pool).await.unwrap();
    assert_eq!((revocations, audits), (1, 1));
    let authorization = Uuid::new_v4();
    let insert = "INSERT INTO provider_offer_authorizations(id,provider_id,offer_id,rate_revision,actor_kind) VALUES($1,$2,$3,$4,'installation')";
    assert!(
        sqlx::query(insert)
            .bind(Uuid::new_v4())
            .bind(other)
            .bind(offer)
            .bind(revision)
            .execute(&pool)
            .await
            .is_err()
    );
    assert!(
        sqlx::query(insert)
            .bind(Uuid::new_v4())
            .bind(provider)
            .bind(offer)
            .bind(Uuid::new_v4())
            .execute(&pool)
            .await
            .is_err()
    );
    assert!(sqlx::query("INSERT INTO provider_offer_authorizations(id,provider_id,offer_id,rate_revision,actor_kind) VALUES($1,$2,$3,$4,'operator')")
        .bind(Uuid::new_v4()).bind(provider).bind(offer).bind(revision).execute(&pool).await.is_err());
    sqlx::query(insert)
        .bind(authorization)
        .bind(provider)
        .bind(offer)
        .bind(revision)
        .execute(&pool)
        .await
        .unwrap();
    assert!(
        sqlx::query("UPDATE provider_offer_authorizations SET rate_revision=$2 WHERE id=$1")
            .bind(authorization)
            .bind(revision)
            .execute(&pool)
            .await
            .is_err()
    );
    assert!(
        sqlx::query("DELETE FROM provider_offer_authorizations WHERE id=$1")
            .bind(authorization)
            .execute(&pool)
            .await
            .is_err()
    );
    assert!(
        !sqlx::query_scalar::<_, bool>("SELECT niu_offer_qualification_current($1,$2,$3)")
            .bind(provider)
            .bind(offer)
            .bind(revision)
            .fetch_one(&pool)
            .await
            .unwrap()
    );
    let revoke = "INSERT INTO provider_offer_authorization_revocations(id,provider_id,offer_id,authorization_id,actor_kind) VALUES($1,$2,$3,$4,'installation')";
    assert!(
        sqlx::query(revoke)
            .bind(Uuid::new_v4())
            .bind(other)
            .bind(offer)
            .bind(authorization)
            .execute(&pool)
            .await
            .is_err()
    );
    sqlx::query(revoke)
        .bind(Uuid::new_v4())
        .bind(provider)
        .bind(offer)
        .bind(authorization)
        .execute(&pool)
        .await
        .unwrap();
    assert!(
        sqlx::query(revoke)
            .bind(Uuid::new_v4())
            .bind(provider)
            .bind(offer)
            .bind(authorization)
            .execute(&pool)
            .await
            .is_err()
    );
}
