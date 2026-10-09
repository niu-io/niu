use niu_storage::{MIGRATOR, ProviderOfferInput, Store};
use serde_json::json;
use sqlx::PgPool;
use uuid::Uuid;

#[sqlx::test]
#[ignore = "requires PostgreSQL with permission to create test databases"]
async fn chat_charges_come_from_scoped_customer_ledger_not_saved_browser_values(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let scope = store.default_workspace().await.unwrap();
    let other = store
        .create_project(scope.organization_id, "Other")
        .await
        .unwrap();
    store
        .publish_customer_tariff(
            scope,
            &ProviderOfferInput {
                model_alias: "priced".into(),
                currency: "USD".into(),
                prompt_rate: "3000000000".into(),
                completion_rate: "7000000000".into(),
                expected_revision: None,
            },
        )
        .await
        .unwrap();
    let mut ids = Vec::new();
    for (tenant, model, dispatched) in [
        (scope, "priced", true),
        (scope, "priced", true),
        (scope, "unpriced", true),
        (scope, "priced", false),
        (other, "priced", true),
    ] {
        let (_, id) = store
            .prepare_gateway_attempt(tenant, model, None, "fixture")
            .await
            .unwrap();
        store.bind_customer_tariff(tenant, id, model).await.unwrap();
        if dispatched {
            sqlx::query(
                "UPDATE attempts SET execution='may_have_executed',dispatched_at=now() WHERE id=$1",
            )
            .bind(id)
            .execute(&pool)
            .await
            .unwrap();
        }
        ids.push(id);
    }
    store
        .complete_and_settle(scope, ids[0], Some((1, 1)))
        .await
        .unwrap();
    store.accrue_customer_charge(ids[0]).await.unwrap();
    let result = |id, model| json!({"attemptId":id,"model":model,"phase":"complete","content":"fixture","elapsedMs":1,"cashNanos":"999999999999","apiEquivalentNanos":"999999999999","currency":"EUR","customerChargeNanos":"888888888888","customerChargeStatus":"charged","customerChargeCurrency":"EUR"});
    let id = Uuid::new_v4();
    let payload = json!({"id":id,"prompt":"Fixture","createdAt":1,"results":[result(ids[0],"priced"),result(ids[1],"priced"),result(ids[2],"unpriced"),result(ids[3],"priced")],"turns":[{"prompt":"Mismatched references","results":[result(ids[0],"wrong-model"),result(ids[4],"priced")]}]});
    store
        .save_chat_session(scope, "owner", id, &payload)
        .await
        .unwrap();
    let reopened = Store::from_pool(pool);
    let saved = reopened.chat_sessions(scope, "owner").await.unwrap();
    let results = saved[0]["results"].as_array().unwrap();
    assert_eq!(results[0]["customerChargeNanos"], "10000");
    assert_eq!(results[0]["customerChargeCurrency"], "USD");
    for (result, status) in results
        .iter()
        .zip(["charged", "pending", "unpriced", "not_charged"])
    {
        assert_eq!(result["customerChargeStatus"], status);
        for field in ["cashNanos", "apiEquivalentNanos", "currency"] {
            assert!(result.get(field).is_none());
        }
    }
    for result in saved[0]["turns"][0]["results"].as_array().unwrap() {
        for field in [
            "cashNanos",
            "apiEquivalentNanos",
            "currency",
            "customerChargeNanos",
            "customerChargeStatus",
            "customerChargeCurrency",
        ] {
            assert!(result.get(field).is_none());
        }
    }
    assert!(
        reopened
            .chat_sessions(scope, "another-owner")
            .await
            .unwrap()
            .is_empty()
    );
}

#[sqlx::test]
#[ignore = "requires PostgreSQL with permission to create test databases"]
async fn chat_history_survives_reconnect_and_isolates_owners_and_workspaces(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let scope = store.default_workspace().await.unwrap();
    let other = store
        .create_project(scope.organization_id, "Other")
        .await
        .unwrap();
    let id = Uuid::new_v4();
    let payload = json!({"id":id,"prompt":"Hello","results":[],"createdAt":1,"attachments":[{"name":"note.txt","type":"text","content":"Example"}],"settings":{"temperature":0.7}});
    store
        .save_chat_session(scope, "operator:a", id, &payload)
        .await
        .unwrap();
    drop(store);
    let reopened = Store::from_pool(pool);
    assert_eq!(
        reopened.chat_sessions(scope, "operator:a").await.unwrap(),
        vec![payload.clone()]
    );
    assert!(
        reopened
            .chat_sessions(scope, "operator:b")
            .await
            .unwrap()
            .is_empty()
    );
    assert!(
        reopened
            .chat_sessions(other, "operator:a")
            .await
            .unwrap()
            .is_empty()
    );
    let mut completed = payload;
    completed["results"] = json!([{"content":"Hi","phase":"complete"}]);
    reopened
        .save_chat_session(scope, "operator:a", id, &completed)
        .await
        .unwrap();
    assert_eq!(
        reopened.chat_sessions(scope, "operator:a").await.unwrap(),
        vec![completed.clone()]
    );
    reopened
        .delete_chat_session(other, "operator:a", id)
        .await
        .unwrap();
    reopened
        .delete_chat_session(scope, "operator:b", id)
        .await
        .unwrap();
    assert_eq!(
        reopened.chat_sessions(scope, "operator:a").await.unwrap(),
        vec![completed]
    );
    reopened
        .delete_chat_session(scope, "operator:a", id)
        .await
        .unwrap();
    reopened
        .delete_chat_session(scope, "operator:a", id)
        .await
        .unwrap();
    assert!(
        reopened
            .chat_sessions(scope, "operator:a")
            .await
            .unwrap()
            .is_empty()
    );
}

#[sqlx::test]
#[ignore = "requires PostgreSQL with permission to create test databases"]
async fn chat_archive_is_owner_scoped_durable_and_not_overwritten_by_saves(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let scope = store.default_workspace().await.unwrap();
    let other = store
        .create_project(scope.organization_id, "Other archive workspace")
        .await
        .unwrap();
    let id = Uuid::new_v4();
    let payload = json!({"id":id,"prompt":"Saved conversation","results":[],"createdAt":1});
    store
        .save_chat_session(scope, "owner", id, &payload)
        .await
        .unwrap();
    assert!(
        !store
            .set_chat_session_archived(other, "owner", id, true)
            .await
            .unwrap()
    );
    assert!(
        !store
            .set_chat_session_archived(scope, "foreign", id, true)
            .await
            .unwrap()
    );
    assert!(
        store
            .set_chat_session_archived(scope, "owner", id, true)
            .await
            .unwrap()
    );
    assert!(
        store
            .set_chat_session_archived(scope, "owner", id, true)
            .await
            .unwrap()
    );
    store
        .save_chat_session(scope, "owner", id, &payload)
        .await
        .unwrap();
    let reopened = Store::from_pool(pool);
    assert!(
        reopened
            .chat_sessions(scope, "owner")
            .await
            .unwrap()
            .is_empty()
    );
    assert_eq!(
        reopened
            .chat_sessions_by_archive(scope, "owner", true)
            .await
            .unwrap(),
        vec![payload.clone()]
    );
    assert_eq!(
        reopened.chat_session(scope, "owner", id).await.unwrap(),
        Some(payload.clone())
    );
    assert!(
        reopened
            .set_chat_session_archived(scope, "owner", id, false)
            .await
            .unwrap()
    );
    assert_eq!(
        reopened.chat_sessions(scope, "owner").await.unwrap(),
        vec![payload]
    );
    reopened
        .delete_chat_session(scope, "owner", id)
        .await
        .unwrap();
    assert!(
        reopened
            .chat_sessions_by_archive(scope, "owner", true)
            .await
            .unwrap()
            .is_empty()
    );
}
