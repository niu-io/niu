use niu_storage::{
    EvaluationBinding, EvaluationDefinition, EvaluationSample, GatewayAdmission,
    GatewayAdmissionStatus, MIGRATOR, OperatorAuditActor, OperatorRole, OperatorScope, Store,
    TenantScope, evaluation_request_fingerprint,
};
use serde_json::json;
use sqlx::PgPool;
use uuid::Uuid;
#[test]
fn evaluation_fingerprints_are_protocol_bound_canonical_and_ignore_only_transport_metadata() {
    let left =
        json!({"model":"fast","messages":[{"role":"user","content":"sample"}],"temperature":0.2});
    let right:serde_json::Value=serde_json::from_str(r#"{"temperature":0.2,"messages":[{"content":"sample","role":"user"}],"model":"other","stream":true,"metadata":{"task":"another"},"user":"client"}"#).unwrap();
    assert_eq!(
        evaluation_request_fingerprint("chat", &left).unwrap(),
        evaluation_request_fingerprint("chat", &right).unwrap()
    );
    assert_ne!(
        evaluation_request_fingerprint("chat", &left).unwrap(),
        evaluation_request_fingerprint("responses", &left).unwrap()
    );
    let mut different = left.clone();
    different["temperature"] = json!(0.9);
    assert_ne!(
        evaluation_request_fingerprint("chat", &left).unwrap(),
        evaluation_request_fingerprint("chat", &different).unwrap()
    );
    different = left.clone();
    different["messages"][0]["content"] = json!("different task");
    assert_ne!(
        evaluation_request_fingerprint("chat", &left).unwrap(),
        evaluation_request_fingerprint("chat", &different).unwrap()
    );
    assert!(evaluation_request_fingerprint("unsupported", &left).is_err());
}
fn admission(
    scope: TenantScope,
    key: Uuid,
    evaluation: Option<EvaluationBinding>,
) -> GatewayAdmission {
    GatewayAdmission {
        evaluation,
        route_generation: None,
        managed_route: None,
        token_bound: None,
        inspected_guardrails: None,
        operation_id: Uuid::new_v4(),
        attempt_id: Uuid::new_v4(),
        scope,
        key_id: key,
        model: "fast".into(),
        upstream_model: "fast".into(),
        dispatch_provider: "openai".into(),
        api_base: None,
        task_id: None,
        revision: "evaluation-test-route".into(),
    }
}
#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn evaluation_definitions_and_attempt_bindings_are_scoped_versioned_and_atomic(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let scope = store.default_workspace().await.unwrap();
    let owner = store
        .create_operator(
            OperatorScope {
                organization_id: scope.organization_id,
                project_id: Some(scope.project_id),
            },
            "Evaluation owner",
            OperatorRole::Owner,
            3600,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let auth = store
        .create_agent_authorization_with_capabilities(
            "Codex",
            &[
                "evaluations:read".into(),
                "evaluations:write".into(),
                "events:read".into(),
                "events:write".into(),
            ],
        )
        .await
        .unwrap();
    store
        .approve_agent_authorization(
            &auth.user_code,
            scope,
            owner.operator_id,
            &["fast".into()],
            3600,
        )
        .await
        .unwrap();
    let key = store
        .exchange_agent_authorization(&auth.device_secret)
        .await
        .unwrap()
        .unwrap();
    let principal = store.authenticate(&key.token).await.unwrap();
    let ordinary = store
        .issue_key(scope, "Ordinary", &["fast".into()], 3600)
        .await
        .unwrap();
    let plain = store.authenticate(&ordinary.token).await.unwrap();
    let fingerprint = evaluation_request_fingerprint(
        "chat",
        &json!({"model":"fast","messages":[{"role":"user","content":"sample"}]}),
    )
    .unwrap();
    let definition = EvaluationDefinition {
        slug: "meeting-notes".into(),
        name: "Meeting notes".into(),
        task: "Extract decisions and actions".into(),
        rubric: "Accept only if all decisions and assignees are correct".into(),
        protocol: "chat".into(),
        revision: 0,
        samples: vec![EvaluationSample {
            reference: "sample-one".into(),
            request_sha256: fingerprint.clone(),
        }],
    };
    assert!(
        store
            .set_evaluation_definition(&plain, &definition)
            .await
            .is_err()
    );
    let saved = store
        .set_evaluation_definition(&principal, &definition)
        .await
        .unwrap();
    assert_eq!(saved.revision, 1);
    assert!(
        store
            .set_evaluation_definition(&principal, &definition)
            .await
            .is_err()
    );
    let mut updated = saved.clone();
    updated.rubric = "All decisions and deadlines must be correct".into();
    let updated = store
        .set_evaluation_definition(&principal, &updated)
        .await
        .unwrap();
    assert_eq!(updated.revision, 2);
    assert_eq!(
        store
            .evaluation_definition(scope, &definition.slug, Some(1))
            .await
            .unwrap()
            .unwrap()
            .rubric,
        saved.rubric
    );
    let binding = EvaluationBinding {
        evaluation_slug: saved.slug.clone(),
        evaluation_revision: 1,
        sample: "sample-one".into(),
        protocol: "chat".into(),
        request_sha256: fingerprint,
    };
    let tagged = admission(scope, key.id, Some(binding.clone()));
    let attempt = tagged.attempt_id;
    assert_eq!(
        store
            .admit_unpriced_gateway_batch(vec![tagged])
            .await
            .unwrap(),
        vec![GatewayAdmissionStatus::Admitted]
    );
    let evidence = store
        .evaluation_attempt_binding(scope, attempt)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(evidence["evaluation_revision"], 1);
    assert_eq!(evidence["request_sha256"], binding.request_sha256);
    assert!(evidence.get("messages").is_none());
    let run = niu_storage::EvaluationRunSubmission {
        slug: "baseline".into(),
        name: "Baseline".into(),
        evaluation_revision: 1,
        evaluator: niu_storage::EvaluationEvaluator {
            kind: "agent".into(),
            name: "Fixture evaluator".into(),
            version: "1".into(),
        },
        results: vec![niu_storage::EvaluationResult {
            sample: "sample-one".into(),
            attempt_id: attempt,
            verdict: niu_storage::EvaluationVerdict::Accepted,
            reason: Some("Fixture judgment".into()),
        }],
    };
    let evaluation_subscription = Uuid::new_v4();
    let pool_subscription = Uuid::new_v4();
    for (id, slug, event_type) in [
        (
            evaluation_subscription,
            "evaluation-events",
            "evaluation.recorded",
        ),
        (pool_subscription, "pool-events", "pool.changed"),
    ] {
        store
            .set_event_subscription(
                &principal,
                id,
                &niu_storage::EventSubscription {
                    slug: slug.into(),
                    name: slug.into(),
                    endpoint: "https://receiver.example/events".into(),
                    event_types: vec![event_type.into()],
                    enabled: true,
                    revision: 0,
                },
                Some(&[42u8; 48]),
            )
            .await
            .unwrap();
    }
    let receipt = store
        .record_evaluation_run(&principal, &saved.slug, &run)
        .await
        .unwrap();
    assert_eq!(receipt["summary"]["verified_inputs"], 1);
    assert_eq!(
        receipt["results"][0]["source_binding"]["evaluation_revision"],
        1
    );
    assert_eq!(receipt["summary"]["attempts"], 1);
    assert_eq!(
        store
            .record_evaluation_run(&principal, &saved.slug, &run)
            .await
            .unwrap(),
        receipt
    );
    let events = store.workspace_events(scope, 0).await.unwrap();
    assert_eq!(
        events.len(),
        1,
        "immutable replay must not emit another event"
    );
    assert_eq!(events[0]["type"], "evaluation.recorded");
    assert_eq!(
        events[0]["resource"],
        json!({"kind":"evaluation","slug":saved.slug,"revision":1,"run":"baseline"})
    );
    assert!(events[0].get("results").is_none());
    assert!(
        store
            .event_delivery_candidates()
            .await
            .unwrap()
            .contains(&evaluation_subscription)
    );
    assert!(
        !store
            .event_delivery_candidates()
            .await
            .unwrap()
            .contains(&pool_subscription)
    );
    assert!(
        store
            .claim_event_delivery(pool_subscription)
            .await
            .unwrap()
            .is_none()
    );
    let claim = store
        .claim_event_delivery(evaluation_subscription)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(claim.event, events[0]);
    store
        .finish_event_delivery(&claim, Some(204), None)
        .await
        .unwrap();
    let mut conflict = run.clone();
    conflict.name = "Changed".into();
    assert!(matches!(
        store
            .record_evaluation_run(&principal, &saved.slug, &conflict)
            .await,
        Err(niu_storage::StoreError::Conflict)
    ));
    assert!(
        store
            .record_evaluation_run(&plain, &saved.slug, &run)
            .await
            .is_err()
    );
    assert!(
        store
            .evaluation_run(
                niu_storage::TenantScope {
                    organization_id: scope.organization_id,
                    project_id: Uuid::new_v4()
                },
                &saved.slug,
                &run.slug
            )
            .await
            .unwrap()
            .is_none()
    );
    assert_eq!(
        store.workspace_event_head(scope).await.unwrap(),
        1,
        "conflicts and denied captures must not publish events"
    );
    let mut reevaluated = run.clone();
    reevaluated.slug = "revised-rubric".into();
    reevaluated.evaluation_revision = 2;
    let revised_receipt = store
        .record_evaluation_run(&principal, &saved.slug, &reevaluated)
        .await
        .unwrap();
    assert_eq!(
        revised_receipt["results"][0]["source_binding"]["evaluation_revision"],
        1
    );
    let comparison = store
        .compare_evaluation_runs(scope, &saved.slug, &run.slug, &reevaluated.slug)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(comparison["same_task_protocol_and_rubric"], false);
    assert_eq!(comparison["matched_verified_samples"], 0);
    assert!(
        sqlx::query("UPDATE workspace_evaluation_runs SET evidence='{}' WHERE evaluation_slug=$1")
            .bind(&saved.slug)
            .execute(&pool)
            .await
            .is_err()
    );
    let mut mismatch = binding.clone();
    mismatch.request_sha256 = "0".repeat(64);
    let invalid = admission(scope, key.id, Some(mismatch));
    let invalid_attempt = invalid.attempt_id;
    let invalid_operation = invalid.operation_id;
    assert!(matches!(
        store.admit_unpriced_gateway_batch(vec![invalid]).await,
        Err(niu_storage::StoreError::EvaluationBindingMismatch)
    ));
    assert_eq!(
        sqlx::query_scalar::<_, i64>("SELECT count(*) FROM attempts WHERE id=$1")
            .bind(invalid_attempt)
            .fetch_one(&pool)
            .await
            .unwrap(),
        0
    );
    assert_eq!(
        sqlx::query_scalar::<_, i64>("SELECT count(*) FROM operations WHERE id=$1")
            .bind(invalid_operation)
            .fetch_one(&pool)
            .await
            .unwrap(),
        0
    );
    let unauthorized = admission(scope, ordinary.id, Some(binding.clone()));
    let unauthorized_attempt = unauthorized.attempt_id;
    assert!(matches!(
        store.admit_unpriced_gateway_batch(vec![unauthorized]).await,
        Err(niu_storage::StoreError::EvaluationGrantRequired)
    ));
    assert!(
        store
            .evaluation_attempt_binding(scope, unauthorized_attempt)
            .await
            .unwrap()
            .is_none()
    );
    let untagged = admission(scope, ordinary.id, None);
    let untagged_id = untagged.attempt_id;
    assert_eq!(
        store
            .admit_unpriced_gateway_batch(vec![untagged])
            .await
            .unwrap(),
        vec![GatewayAdmissionStatus::Admitted]
    );
    assert!(
        store
            .evaluation_attempt_binding(scope, untagged_id)
            .await
            .unwrap()
            .is_none()
    );
    let other = store
        .create_project(scope.organization_id, "Other evaluation workspace")
        .await
        .unwrap();
    assert!(
        store
            .evaluation_definitions(other, None)
            .await
            .unwrap()
            .is_empty()
    );
    assert!(
        store
            .evaluation_attempt_binding(other, attempt)
            .await
            .unwrap()
            .is_none()
    );
    assert!(
        sqlx::query("UPDATE evaluation_attempt_bindings SET sample='changed' WHERE attempt_id=$1")
            .bind(attempt)
            .execute(&pool)
            .await
            .is_err()
    );
    // The priced path must commit the same binding atomically with its hold.
    store.configure_platform_currency("USD").await.unwrap();
    store.create_budget(scope, "USD", 1000).await.unwrap();
    let rates = || niu_storage::TokenRates {
        prompt: 1_000_000,
        completion: 1_000_000,
    };
    let price = store
        .publish_price(
            scope,
            niu_storage::PriceInput {
                resource_id: "fast",
                offer_revision: "evaluation-test-route",
                currency: "USD",
                api_equivalent: rates(),
                cash: rates(),
            },
        )
        .await
        .unwrap();
    store
        .publish_customer_tariff(
            scope,
            &niu_storage::ProviderOfferInput {
                model_alias: "fast".into(),
                currency: "USD".into(),
                prompt_rate: "2000000".into(),
                completion_rate: "3000000".into(),
                expected_revision: None,
            },
        )
        .await
        .unwrap();
    let reservation = niu_storage::GatewayReservation {
        price_revision_id: price,
        resource_id: "fast".into(),
        offer_revision: "evaluation-test-route".into(),
        prompt_bound: 10,
        completion_bound: 10,
        token_usage: niu_storage::GatewayTokenUsageCapabilities {
            cached_input: true,
            cache_write_input: true,
            reasoning_output: true,
        },
    };
    let priced = admission(scope, key.id, Some(binding.clone()));
    let priced_attempt = priced.attempt_id;
    store
        .admit_priced_gateway(&principal, priced, &reservation)
        .await
        .unwrap();
    assert_eq!(
        store
            .evaluation_attempt_binding(scope, priced_attempt)
            .await
            .unwrap()
            .unwrap()["request_sha256"],
        binding.request_sha256
    );
    let holds: i64 =
        sqlx::query_scalar("SELECT count(*) FROM cost_reservations WHERE attempt_id=$1")
            .bind(priced_attempt)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(holds, 1);
    let mut mismatch = binding.clone();
    mismatch.request_sha256 = "0".repeat(64);
    let invalid_priced = admission(scope, key.id, Some(mismatch));
    let invalid_attempt = invalid_priced.attempt_id;
    assert!(
        store
            .admit_priced_gateway(&principal, invalid_priced, &reservation)
            .await
            .is_err()
    );
    assert!(
        store
            .evaluation_attempt_binding(scope, invalid_attempt)
            .await
            .unwrap()
            .is_none()
    );
    assert!(
        store
            .attempt(scope, invalid_attempt)
            .await
            .unwrap()
            .is_none()
    );
    store.revoke_key(scope, key.id).await.unwrap();
    assert!(
        store
            .set_evaluation_definition(&principal, &updated)
            .await
            .is_err()
    );
}
