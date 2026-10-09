use niu_storage::{
    AgentObservationConsent, AgentObservationInput, CodexUsageResponseInput, CodexUsageTokens,
    MIGRATOR, OperatorAuditActor, OperatorRole, OperatorScope, Store,
};
use sqlx::PgPool;

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn personal_observations_require_consent_and_isolate_users_through_pause_and_reconnect(
    pool: PgPool,
) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let workspace = store.default_workspace().await.unwrap();
    let scope = OperatorScope {
        organization_id: workspace.organization_id,
        project_id: None,
    };
    let a = store
        .create_operator(
            scope,
            "Observer A",
            OperatorRole::Viewer,
            3600,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let b = store
        .create_operator(
            scope,
            "Observer B",
            OperatorRole::Viewer,
            3600,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let owner = store.authenticate_operator(&a.token).await.unwrap().id;
    let other = store.authenticate_operator(&b.token).await.unwrap().id;
    let record = AgentObservationInput {
        billing_mode: "unknown".into(),
        response: CodexUsageResponseInput {
            response_id: "private-response".into(),
            occurred_at_ms: 1000,
            model_provider: None,
            model: None,
            usage: CodexUsageTokens {
                input_tokens: 12,
                cached_input_tokens: 2,
                cache_write_input_tokens: None,
                output_tokens: 3,
                reasoning_output_tokens: None,
            },
            rate_snapshot: None,
        },
    };
    assert!(
        store
            .append_agent_observations(owner, &[record])
            .await
            .is_err()
    );
    store
        .consent_agent_observations(
            owner,
            &AgentObservationConsent {
                client_version: "test-fixture".into(),
                consent_version: "agent-token-observation-v1".into(),
            },
        )
        .await
        .unwrap();
    let record = || AgentObservationInput {
        billing_mode: "unknown".into(),
        response: CodexUsageResponseInput {
            response_id: "private-response".into(),
            occurred_at_ms: 1000,
            model_provider: None,
            model: None,
            usage: CodexUsageTokens {
                input_tokens: 12,
                cached_input_tokens: 2,
                cache_write_input_tokens: None,
                output_tokens: 3,
                reasoning_output_tokens: None,
            },
            rate_snapshot: None,
        },
    };
    assert_eq!(
        store
            .append_agent_observations(owner, &[record()])
            .await
            .unwrap(),
        (1, 0)
    );
    assert_eq!(
        store
            .append_agent_observations(owner, &[record()])
            .await
            .unwrap(),
        (0, 1)
    );
    let mut conflicting = record();
    conflicting.response.usage.input_tokens += 1;
    let mut before_conflict = record();
    before_conflict.response.response_id = "must-roll-back".into();
    assert!(
        store
            .append_agent_observations(owner, &[before_conflict, conflicting])
            .await
            .is_err()
    );
    let reopened = Store::from_pool(pool);
    let report = reopened
        .personal_agent_observations(owner, 0, 2000)
        .await
        .unwrap();
    assert_eq!(report["summary"]["response_count"], "1");
    assert_eq!(report["summary"]["input_tokens"], "12");
    assert_eq!(report["summary"]["unknown_value_count"], "1");
    assert_eq!(report["summary"]["unknown_billing_count"], "1");
    for section in ["by_model", "by_day"] {
        assert!(report[section][0]["cache_write_input_tokens"].is_null());
        assert!(report[section][0]["reasoning_output_tokens"].is_null());
        assert_eq!(report[section][0]["unknown_cache_write_count"], "1");
        assert_eq!(report[section][0]["unknown_reasoning_count"], "1");
    }
    assert!(!report.to_string().contains("private-response"));
    assert_eq!(
        reopened
            .personal_agent_observations(other, 0, 2000)
            .await
            .unwrap()["summary"]["response_count"],
        "0"
    );
    reopened.pause_agent_observations(owner).await.unwrap();
    assert!(
        reopened
            .append_agent_observations(owner, &[record()])
            .await
            .is_err()
    );
    assert_eq!(
        reopened
            .personal_agent_observations(owner, 0, 2000)
            .await
            .unwrap()["sources"][0]["paused"],
        true
    );
    reopened
        .consent_agent_observations(
            owner,
            &AgentObservationConsent {
                client_version: "test-reconnected".into(),
                consent_version: "agent-token-observation-v1".into(),
            },
        )
        .await
        .unwrap();
    assert_eq!(
        reopened
            .append_agent_observations(owner, &[record()])
            .await
            .unwrap(),
        (0, 1)
    );
    let resumed = reopened
        .personal_agent_observations(owner, 0, 2000)
        .await
        .unwrap();
    assert_eq!(resumed["sources"][0]["paused"], false);
    assert_eq!(resumed["sources"][0]["client_version"], "test-reconnected");
    reopened.delete_agent_observations(other).await.unwrap();
    assert_eq!(
        reopened
            .personal_agent_observations(owner, 0, 2000)
            .await
            .unwrap()["summary"]["response_count"],
        "1"
    );
    reopened.delete_agent_observations(owner).await.unwrap();
    assert_eq!(
        reopened
            .personal_agent_observations(owner, 0, 2000)
            .await
            .unwrap()["summary"]["response_count"],
        "0"
    );
    assert!(
        reopened
            .append_agent_observations(owner, &[record()])
            .await
            .is_err()
    );
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn personal_report_compares_only_subscription_usage_and_exact_fee_period(pool: PgPool) {
    use niu_storage::{AgentObservationFeeSettings, CodexRateSnapshot};
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let workspace = store.default_workspace().await.unwrap();
    let user = store
        .create_operator(
            OperatorScope {
                organization_id: workspace.organization_id,
                project_id: None,
            },
            "Fee observer",
            OperatorRole::Viewer,
            3600,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap()
        .operator_id;
    store
        .consent_agent_observations(
            user,
            &AgentObservationConsent {
                client_version: "fixture".into(),
                consent_version: "agent-token-observation-v1".into(),
            },
        )
        .await
        .unwrap();
    let record = |id: &str, mode: &str| AgentObservationInput {
        billing_mode: mode.into(),
        response: CodexUsageResponseInput {
            response_id: id.into(),
            occurred_at_ms: 1000,
            model_provider: Some("openai".into()),
            model: Some("test-model".into()),
            usage: CodexUsageTokens {
                input_tokens: 1,
                cached_input_tokens: 0,
                cache_write_input_tokens: Some(0),
                output_tokens: 1,
                reasoning_output_tokens: Some(1),
            },
            rate_snapshot: Some(CodexRateSnapshot {
                source: "openrouter".into(),
                model_id: "openai/test-model".into(),
                observed_at_ms: 1000,
                prompt: "1".into(),
                completion: "1".into(),
                input_cache_read: None,
                input_cache_write: None,
                overrides: vec![],
            }),
        },
    };
    store
        .append_agent_observations(
            user,
            &[record("subscription", "subscription"), record("api", "api")],
        )
        .await
        .unwrap();
    let mut boundary = record("next-period", "subscription");
    boundary.response.occurred_at_ms = 2000;
    store
        .append_agent_observations(user, &[boundary])
        .await
        .unwrap();
    assert_eq!(
        store
            .personal_agent_observations(user, 2000, 3000)
            .await
            .unwrap()["summary"]["response_count"],
        "1"
    );
    assert_eq!(
        store
            .personal_agent_observations(user, 1001, 2000)
            .await
            .unwrap()["summary"]["response_count"],
        "0"
    );
    let fee = |from, to, amount| AgentObservationFeeSettings {
        from_ms: from,
        to_ms: to,
        subscription_fee_usd_cents: amount,
        paid_overflow_usd_cents: Some(500),
    };
    store
        .save_personal_agent_fees(user, &fee(0, 2000, Some(100)))
        .await
        .unwrap();
    let report = store
        .personal_agent_observations(user, 0, 2000)
        .await
        .unwrap();
    assert_eq!(report["summary"]["priced_value_usd_nanos"], "4000000000");
    assert_eq!(
        report["comparison"]["subscription_api_equivalent_usd_nanos"],
        "2000000000"
    );
    assert_eq!(report["comparison"]["value_multiple"], "2.000000");
    assert_eq!(report["fees"]["paid_overflow_usd_cents"], 500);
    assert_eq!(report["by_model"].as_array().unwrap().len(), 2);
    assert_eq!(report["by_day"].as_array().unwrap().len(), 2);
    for section in ["by_model", "by_day"] {
        assert_eq!(report[section][0]["cache_write_input_tokens"], "0");
        assert_eq!(report[section][0]["reasoning_output_tokens"], "1");
        assert_eq!(report[section][0]["unknown_cache_write_count"], "0");
    }
    assert!(
        store
            .personal_agent_observations(user, 0, 1500)
            .await
            .unwrap()["comparison"]["value_multiple"]
            .is_null()
    );
    store
        .save_personal_agent_fees(user, &fee(0, 2000, Some(0)))
        .await
        .unwrap();
    assert!(
        store
            .personal_agent_observations(user, 0, 2000)
            .await
            .unwrap()["comparison"]["value_multiple"]
            .is_null()
    );
    store
        .save_personal_agent_fees(user, &fee(0, 2000, None))
        .await
        .unwrap();
    assert!(
        store
            .personal_agent_observations(user, 0, 2000)
            .await
            .unwrap()["comparison"]["value_multiple"]
            .is_null()
    );
    store
        .save_personal_agent_fees(user, &fee(0, 2000, Some(100)))
        .await
        .unwrap();
    store
        .append_agent_observations(user, &[record("unknown", "unknown")])
        .await
        .unwrap();
    assert!(
        store
            .personal_agent_observations(user, 0, 2000)
            .await
            .unwrap()["comparison"]["value_multiple"]
            .is_null()
    );
    let reopened = Store::from_pool(pool);
    assert_eq!(
        reopened
            .personal_agent_observations(user, 0, 2000)
            .await
            .unwrap()["fees"]["subscription_fee_usd_cents"],
        100
    );
    reopened.delete_agent_observations(user).await.unwrap();
    assert!(
        reopened
            .personal_agent_observations(user, 0, 2000)
            .await
            .unwrap()["fees"]
            .is_null()
    );
}
