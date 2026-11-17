use niu_storage::{
    CreditConversion, CustomerUnitDefinitionInput, CustomerUnitGrantInput,
    CustomerUnitPurchaseRuleInput, CustomerUnitTextPrice, CustomerUnitTextTariffInput,
    GatewayActivityFilter, GatewayActivitySort, GatewayAdmission, GatewayCompletion,
    GatewayDeliveryFilter, GatewayReservation, GatewayTokenUsageCapabilities, MIGRATOR,
    OperatorAuditActor, PriceInput, RequestFailure, RequestFailureKind, RequestTimingRecord,
    RequestTokenCategories, Store, TokenRates,
};
use serde_json::json;
use sqlx::{PgPool, postgres::PgPoolOptions};
use std::future::Future;
use std::task::{Context, Waker};
use uuid::Uuid;

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn dropped_store_snapshot_reads_leave_single_pool_writable(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let single = PgPoolOptions::new()
        .max_connections(1)
        .connect_with(pool.connect_options().as_ref().clone())
        .await
        .unwrap();
    let store = Store::from_pool(single.clone());
    let scope = store.default_workspace().await.unwrap();
    let key = store
        .issue_key(scope, "Cancel probe key", &["*".into()], 3600)
        .await
        .unwrap();

    for _ in 0..12 {
        let mut detail_fut = Box::pin(store.key_detail(scope, key.id));
        let mut cx = Context::from_waker(Waker::noop());
        if detail_fut.as_mut().poll(&mut cx).is_pending() {
            drop(detail_fut);
        }

        let empty_filter = GatewayActivityFilter::default();
        let mut summary_fut = Box::pin(store.gateway_activity_summary(scope, &empty_filter));
        if summary_fut.as_mut().poll(&mut cx).is_pending() {
            drop(summary_fut);
        }

        let org_id = store
            .create_prepaid_organization("Writable After Read Drop", "USD")
            .await
            .unwrap();
        assert_ne!(org_id, Uuid::nil());
    }

    single.close().await;
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn enrich_key_views_matches_sql_committed_and_capacity_functions(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let company = store
        .create_prepaid_organization("Key View Parity Co", "USD")
        .await
        .unwrap();
    let scope = store
        .create_project(company, "Parity Workspace")
        .await
        .unwrap();
    store.configure_platform_currency("USD").await.unwrap();
    store
        .record_settled_customer_funding(company, "USD", 500_000_000, "test", "fund-key-parity")
        .await
        .unwrap();
    store
        .create_budget(scope, "USD", 100_000_000)
        .await
        .unwrap();

    let price_id = store
        .publish_price(
            scope,
            PriceInput {
                resource_id: "fast",
                offer_revision: "rev-1",
                currency: "USD",
                api_equivalent: TokenRates {
                    prompt: 1_000_000,
                    completion: 2_000_000,
                },
                cash: TokenRates {
                    prompt: 1_000_000,
                    completion: 2_000_000,
                },
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
                prompt_rate: "3000000".into(),
                completion_rate: "5000000".into(),
                expected_revision: None,
            },
        )
        .await
        .unwrap();

    let key1 = store
        .issue_key(scope, "Key lineage root", &["*".into()], 3600)
        .await
        .unwrap();
    let other_key = store
        .issue_key(scope, "Independent key", &["fast".into()], 3600)
        .await
        .unwrap();
    store
        .set_customer_key_spending_limit(
            scope,
            key1.id,
            "USD",
            Some(50_000),
            0,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    store
        .set_key_ip_policy(
            scope,
            key1.id,
            Some(vec!["10.0.0.0/8".into()]),
            0,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    store
        .set_key_request_rate_policy(
            scope,
            key1.id,
            Some(40),
            0,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    store
        .set_key_concurrency_policy(
            scope,
            key1.id,
            Some(10),
            0,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let tpm_rev = store
        .set_key_token_rate_policy(
            scope,
            key1.id,
            Some(2500),
            0,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();

    let p1 = store.authenticate(&key1.token).await.unwrap();
    let reservation = GatewayReservation {
        price_revision_id: price_id,
        resource_id: "fast".into(),
        offer_revision: "rev-1".into(),
        prompt_bound: 1000,
        completion_bound: 500,
        token_usage: GatewayTokenUsageCapabilities {
            cached_input: true,
            cache_write_input: true,
            reasoning_output: true,
        },
    };
    let make_admission = |key_id: Uuid, token_bound: Option<i64>| GatewayAdmission {
        evaluation: None,
        route_generation: None,
        managed_route: None,
        token_bound,
        token_bound_estimator: Default::default(),
        inspected_guardrails: None,
        operation_id: Uuid::new_v4(),
        attempt_id: Uuid::new_v4(),
        scope,
        key_id,
        model: "fast".into(),
        upstream_model: "fast".into(),
        dispatch_provider: "openai".into(),
        api_base: None,
        task_id: None,
        revision: "rev-1".into(),
    };

    // Attempt 1 on key1: completed & accrued, then partially refunded.
    let a1 = make_admission(key1.id, Some(1500));
    let a1_id = a1.attempt_id;
    store
        .admit_priced_gateway(&p1, a1, &reservation)
        .await
        .unwrap();
    store
        .complete_and_accrue_gateway_batch(vec![GatewayCompletion {
            finish_reasons: None,
            token_categories: Some(RequestTokenCategories {
                cache_write_input_tokens: None,
                cached_input_tokens: Some(0),
                reasoning_output_tokens: Some(0),
            }),
            scope,
            attempt_id: a1_id,
            usage: Some((1000, 500)),
            provider_model: Some("gpt-test".into()),
        }])
        .await
        .unwrap();
    let charge_entry: Uuid = sqlx::query_scalar(
        "SELECT id FROM customer_balance_entries WHERE attempt_id=$1 AND kind='charge'",
    )
    .bind(a1_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    store
        .reverse_customer_balance_entry(company, charge_entry, 1500, Uuid::new_v4())
        .await
        .unwrap();

    // Rotate key1 -> key2 (shares spending_root_id and policies).
    let key2 = store.rotate_key(scope, key1.id).await.unwrap();
    let p2 = store.authenticate(&key2.token).await.unwrap();

    // Attempt 2 on rotated key2: still pending (unresolved reservation + active request + bounded TPM).
    let a2 = make_admission(key2.id, Some(300));
    let a2_id = a2.attempt_id;
    store
        .admit_priced_gateway(&p2, a2, &reservation)
        .await
        .unwrap();

    // Attempt 3 on key2: HTTP 429 failure releases both concurrency and TPM immediately,
    // while conservatively retaining its held financial reservation until resolved.
    let a3 = make_admission(key2.id, Some(400));
    let a3_id = a3.attempt_id;
    store
        .admit_priced_gateway(&p2, a3, &reservation)
        .await
        .unwrap();
    store
        .save_request_failure(
            scope,
            a3_id,
            RequestFailure {
                kind: RequestFailureKind::UpstreamHttpError,
                upstream_http_status: Some(429),
                transport_phase: None,
            },
        )
        .await
        .unwrap();

    // Attempt 4 on key2: temporarily clear TPM limit so an in-flight unbounded attempt can be
    // admitted, then re-enable TPM limit so unbounded_requests = 1 and committed_tokens = NULL.
    let cleared_rev = store
        .set_key_token_rate_policy(
            scope,
            key2.id,
            None,
            tpm_rev,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let a4 = make_admission(key2.id, None);
    let a4_id = a4.attempt_id;
    store
        .admit_priced_gateway(&p2, a4, &reservation)
        .await
        .unwrap();
    store
        .set_key_token_rate_policy(
            scope,
            key2.id,
            Some(2500),
            cleared_rev,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();

    // Compare enrich_key_views via list_key_details & key_detail against SQL source functions.
    let list = store.list_key_details(scope).await.unwrap();
    assert_eq!(list.len(), 3);
    let key2_view = store.key_detail(scope, key2.id).await.unwrap().unwrap();
    let key2_from_list = list
        .iter()
        .find(|item| item["id"].as_str() == Some(key2.id.to_string().as_str()))
        .unwrap();
    assert_eq!(
        key2_view["spending_limits"],
        key2_from_list["spending_limits"]
    );
    assert_eq!(
        key2_view["concurrency_limit"],
        key2_from_list["concurrency_limit"]
    );
    assert_eq!(
        key2_view["token_rate_limit"]["known_tokens"],
        key2_from_list["token_rate_limit"]["known_tokens"]
    );
    assert_eq!(
        key2_view["token_rate_limit"]["reserved_tokens"],
        key2_from_list["token_rate_limit"]["reserved_tokens"]
    );

    let (root_id, account_id): (Uuid, Uuid) = sqlx::query_as(
        "SELECT k.spending_root_id, a.id FROM api_keys k JOIN customer_balance_accounts a ON a.organization_id=k.organization_id WHERE k.id=$1 AND a.currency='USD'",
    )
    .bind(key2.id)
    .fetch_one(&pool)
    .await
    .unwrap();

    let expected_committed: String =
        sqlx::query_scalar("SELECT niu_customer_key_committed($1, $2)::text")
            .bind(root_id)
            .bind(account_id)
            .fetch_one(&pool)
            .await
            .unwrap();
    let limits = key2_view["spending_limits"].as_array().unwrap();
    let usd_limit = limits.iter().find(|l| l["currency"] == "USD").unwrap();
    assert_eq!(usd_limit["committed_nanos"], expected_committed);
    // Charge (5500) - partial refund (1500) + pending max reservation for a2 (5500) + a3 (5500) + a4 (5500) = 20500
    assert_eq!(usd_limit["committed_nanos"], "20500");
    assert_eq!(usd_limit["remaining_nanos"], "29500");
    assert_eq!(usd_limit["limit_nanos"], "50000");

    // Check independent key has 0 committed
    let other_view = list
        .iter()
        .find(|item| item["id"].as_str() == Some(other_key.id.to_string().as_str()))
        .unwrap();
    assert_eq!(other_view["spending_limits"][0]["committed_nanos"], "0");

    // Verify concurrency matches key_concurrency_policy
    let conc_policy = store
        .key_concurrency_policy(scope, key2.id)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(
        key2_view["concurrency_limit"]["active_requests"],
        conc_policy["active_requests"]
    );
    assert_eq!(conc_policy["active_requests"], 2);

    // Verify token rate limit matches key_token_rate_policy (a2 bounded + a4 unbounded, a3 released)
    let tpm_policy = store
        .key_token_rate_policy(scope, key2.id)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(
        key2_view["token_rate_limit"]["known_tokens"],
        tpm_policy["known_tokens"]
    );
    assert_eq!(
        key2_view["token_rate_limit"]["reserved_tokens"],
        tpm_policy["reserved_tokens"]
    );
    assert_eq!(
        key2_view["token_rate_limit"]["unbounded_requests"],
        tpm_policy["unbounded_requests"]
    );
    assert_eq!(tpm_policy["known_tokens"], "1500");
    assert_eq!(tpm_policy["reserved_tokens"], "300");
    assert_eq!(tpm_policy["unbounded_requests"], 1);
    assert!(key2_view["token_rate_limit"]["committed_tokens"].is_null());

    // Keep unused variable warning away if needed
    assert_ne!(a2_id, a4_id);
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn enrich_key_views_matches_credits_committed_and_restorations(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let company = store
        .create_prepaid_organization("Credits Key Parity Co", "USD")
        .await
        .unwrap();
    let scope = store
        .create_project(company, "Credits Parity WS")
        .await
        .unwrap();
    store.configure_platform_currency("USD").await.unwrap();
    store
        .create_budget(scope, "USD", 100_000_000)
        .await
        .unwrap();
    let price_id = store
        .publish_price(
            scope,
            PriceInput {
                resource_id: "credits-fast",
                offer_revision: "rev-c1",
                currency: "USD",
                api_equivalent: TokenRates {
                    prompt: 1000,
                    completion: 2000,
                },
                cash: TokenRates {
                    prompt: 1000,
                    completion: 2000,
                },
            },
        )
        .await
        .unwrap();

    store
        .publish_customer_unit_definition(
            CustomerUnitDefinitionInput {
                name: "Credits",
                display_precision: 2,
                expected_revision: 0,
                idempotency_key: Uuid::new_v4(),
            },
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    store
        .publish_customer_unit_purchase_rule(
            CustomerUnitPurchaseRuleInput {
                definition_revision: 1,
                payment_currency: "USD",
                conversion: CreditConversion::new(1, 1).unwrap(),
                expected_revision: 1,
                idempotency_key: Uuid::new_v4(),
            },
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let preview = store
        .prepare_customer_unit_mode(
            "credits",
            2,
            Uuid::new_v4(),
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let preview_id = Uuid::parse_str(preview["id"].as_str().unwrap()).unwrap();
    store
        .publish_customer_unit_mode(
            preview_id,
            2,
            Uuid::new_v4(),
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();

    store
        .issue_customer_unit_grant(
            company,
            CustomerUnitGrantInput {
                definition_revision: 1,
                credit_atoms: 1_000_000,
                provenance: "promotional",
                reason: "Parity test grant",
                expires_at_ms: None,
                idempotency_key: Uuid::new_v4(),
            },
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();

    store
        .publish_customer_unit_text_tariff(
            CustomerUnitTextTariffInput {
                model_alias: "credits-fast",
                definition_revision: 1,
                expected_revision: 3,
                idempotency_key: Uuid::new_v4(),
                price: CustomerUnitTextPrice {
                    prompt_rate: "2000".into(),
                    completion_rate: "4000".into(),
                    cached_prompt_rate: None,
                    cache_write_prompt_rate: None,
                    reasoning_completion_rate: None,
                    request_fee_atoms: "0".into(),
                    minimum_charge_atoms: "0".into(),
                    context_tiers: vec![],
                },
            },
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();

    let key1 = store
        .issue_key(scope, "Credits root key", &["*".into()], 3600)
        .await
        .unwrap();
    store
        .set_customer_unit_key_spending_limit(
            scope,
            key1.id,
            Some(50_000),
            0,
            Uuid::new_v4(),
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();

    let p1 = store.authenticate(&key1.token).await.unwrap();
    let reservation = GatewayReservation {
        price_revision_id: price_id,
        resource_id: "credits-fast".into(),
        offer_revision: "rev-c1".into(),
        prompt_bound: 1000,
        completion_bound: 500,
        token_usage: GatewayTokenUsageCapabilities {
            cached_input: false,
            cache_write_input: false,
            reasoning_output: false,
        },
    };
    let a1 = GatewayAdmission {
        evaluation: None,
        route_generation: None,
        managed_route: None,
        token_bound: Some(1500),
        token_bound_estimator: Default::default(),
        inspected_guardrails: None,
        operation_id: Uuid::new_v4(),
        attempt_id: Uuid::new_v4(),
        scope,
        key_id: key1.id,
        model: "credits-fast".into(),
        upstream_model: "credits-fast".into(),
        dispatch_provider: "openai".into(),
        api_base: None,
        task_id: None,
        revision: "rev-c1".into(),
    };
    let a1_id = a1.attempt_id;
    store
        .admit_priced_gateway(&p1, a1, &reservation)
        .await
        .unwrap();
    store
        .complete_and_accrue_gateway_batch(vec![GatewayCompletion {
            finish_reasons: None,
            token_categories: None,
            scope,
            attempt_id: a1_id,
            usage: Some((1000, 500)),
            provider_model: None,
        }])
        .await
        .unwrap();
    // Charge = 1000*2 + 500*4 = 4000 milliatoms => exact ceil: (1000*2000 + 500*4000)/1_000_000 = 4 atoms! Wait: 4_000_000/1_000_000 = 4 atoms.
    store
        .refund_customer_unit_charge(
            company,
            a1_id,
            1,
            "Partial credit restoration",
            Uuid::new_v4(),
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();

    let key2 = store.rotate_key(scope, key1.id).await.unwrap();
    let p2 = store.authenticate(&key2.token).await.unwrap();
    let a2 = GatewayAdmission {
        evaluation: None,
        route_generation: None,
        managed_route: None,
        token_bound: Some(1500),
        token_bound_estimator: Default::default(),
        inspected_guardrails: None,
        operation_id: Uuid::new_v4(),
        attempt_id: Uuid::new_v4(),
        scope,
        key_id: key2.id,
        model: "credits-fast".into(),
        upstream_model: "credits-fast".into(),
        dispatch_provider: "openai".into(),
        api_base: None,
        task_id: None,
        revision: "rev-c1".into(),
    };
    store
        .admit_priced_gateway(&p2, a2, &reservation)
        .await
        .unwrap();

    let detail = store.key_detail(scope, key2.id).await.unwrap().unwrap();
    let direct_limit = store
        .customer_unit_key_spending_limit(scope, key2.id)
        .await
        .unwrap()
        .unwrap();
    let root_id: Uuid = sqlx::query_scalar("SELECT spending_root_id FROM api_keys WHERE id=$1")
        .bind(key2.id)
        .fetch_one(&pool)
        .await
        .unwrap();
    let expected_committed: String =
        sqlx::query_scalar("SELECT niu_customer_unit_key_committed($1, $2, $3, NULL)::text")
            .bind(company)
            .bind(scope.project_id)
            .bind(root_id)
            .fetch_one(&pool)
            .await
            .unwrap();

    assert_eq!(
        detail["unit_spending_limit"]["committed_atoms"],
        expected_committed
    );
    assert_eq!(
        detail["unit_spending_limit"]["committed_atoms"],
        direct_limit["committed_atoms"]
    );
    assert_eq!(
        detail["unit_spending_limit"]["remaining_atoms"],
        direct_limit["remaining_atoms"]
    );
    assert_eq!(detail["unit_spending_limit"]["unit"]["name"], "Credits");
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn gateway_activity_summary_and_export_preserve_exact_aggregates_and_empty_scope(
    pool: PgPool,
) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let company = store
        .create_prepaid_organization("Summary Parity Co", "USD")
        .await
        .unwrap();
    let scope = store.create_project(company, "Summary WS").await.unwrap();
    store.configure_platform_currency("USD").await.unwrap();
    store
        .record_settled_customer_funding(company, "USD", 500_000_000, "test", "fund-summary")
        .await
        .unwrap();
    store
        .create_budget(scope, "USD", 100_000_000)
        .await
        .unwrap();

    // Verify empty workspace returns clean zeroed summary before any attempts exist.
    let empty = store
        .gateway_activity_summary(scope, &GatewayActivityFilter::default())
        .await
        .unwrap();
    assert_eq!(empty.request_count, 0);
    assert_eq!(empty.usage_count, 0);
    assert_eq!(empty.prompt_tokens, "0");
    assert_eq!(empty.completion_tokens, "0");
    assert!(empty.customer_charges.is_empty());
    assert!(empty.usage_by_model.is_empty());
    assert!(empty.usage_by_key.is_empty());
    assert!(empty.request_histogram.is_empty());

    for alias in ["alpha", "beta"] {
        store
            .publish_price(
                scope,
                PriceInput {
                    resource_id: alias,
                    offer_revision: "rev-s1",
                    currency: "USD",
                    api_equivalent: TokenRates {
                        prompt: 1_000_000,
                        completion: 2_000_000,
                    },
                    cash: TokenRates {
                        prompt: 1_000_000,
                        completion: 2_000_000,
                    },
                },
            )
            .await
            .unwrap();
        store
            .publish_customer_tariff(
                scope,
                &niu_storage::ProviderOfferInput {
                    model_alias: alias.into(),
                    currency: "USD".into(),
                    prompt_rate: "2000000".into(),
                    completion_rate: "4000000".into(),
                    expected_revision: None,
                },
            )
            .await
            .unwrap();
    }

    let k1 = store
        .issue_key(scope, "Key Alpha", &["*".into()], 3600)
        .await
        .unwrap();
    let k2 = store
        .issue_key(scope, "Key Beta", &["*".into()], 3600)
        .await
        .unwrap();
    let p1 = store.authenticate(&k1.token).await.unwrap();
    let p2 = store.authenticate(&k2.token).await.unwrap();

    // Request 1: alpha via k1, completed + timing + HTTP 200
    let r1 = GatewayReservation {
        price_revision_id: sqlx::query_scalar(
            "SELECT id FROM price_revisions WHERE resource_id='alpha' ORDER BY created_at DESC LIMIT 1",
        )
        .fetch_one(&pool)
        .await
        .unwrap(),
        resource_id: "alpha".into(),
        offer_revision: "rev-s1".into(),
        prompt_bound: 1000,
        completion_bound: 500,
        token_usage: GatewayTokenUsageCapabilities {
            cached_input: true,
            cache_write_input: false,
            reasoning_output: true,
        },
    };
    let a1_id = Uuid::new_v4();
    store
        .admit_priced_gateway(
            &p1,
            GatewayAdmission {
                evaluation: None,
                route_generation: None,
                managed_route: None,
                token_bound: Some(1500),
                token_bound_estimator: Default::default(),
                inspected_guardrails: None,
                operation_id: Uuid::new_v4(),
                attempt_id: a1_id,
                scope,
                key_id: k1.id,
                model: "alpha".into(),
                upstream_model: "alpha".into(),
                dispatch_provider: "openai".into(),
                api_base: None,
                task_id: None,
                revision: "rev-s1".into(),
            },
            &r1,
        )
        .await
        .unwrap();
    store
        .complete_and_accrue_gateway_batch(vec![GatewayCompletion {
            finish_reasons: None,
            token_categories: Some(RequestTokenCategories {
                cache_write_input_tokens: None,
                cached_input_tokens: Some(100),
                reasoning_output_tokens: Some(50),
            }),
            scope,
            attempt_id: a1_id,
            usage: Some((1000, 500)),
            provider_model: Some("upstream-alpha".into()),
        }])
        .await
        .unwrap();
    store
        .save_request_timing(RequestTimingRecord {
            attempt: a1_id,
            dispatch_ms: Some(15),
            headers_ms: Some(40),
            first_output_ms: Some(60),
            total_ms: 120,
            complete: true,
            http_status: Some(200),
        })
        .await
        .unwrap();

    // Request 2: beta via k2, unresolved failed request (HTTP 502)
    let r2_price_id: Uuid = sqlx::query_scalar(
        "SELECT id FROM price_revisions WHERE resource_id='beta' ORDER BY created_at DESC LIMIT 1",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    let r2 = GatewayReservation {
        price_revision_id: r2_price_id,
        resource_id: "beta".into(),
        offer_revision: "rev-s1".into(),
        prompt_bound: 100,
        completion_bound: 100,
        token_usage: GatewayTokenUsageCapabilities {
            cached_input: false,
            cache_write_input: false,
            reasoning_output: false,
        },
    };
    let a2_id = Uuid::new_v4();
    store
        .admit_priced_gateway(
            &p2,
            GatewayAdmission {
                evaluation: None,
                route_generation: None,
                managed_route: None,
                token_bound: Some(200),
                token_bound_estimator: Default::default(),
                inspected_guardrails: None,
                operation_id: Uuid::new_v4(),
                attempt_id: a2_id,
                scope,
                key_id: k2.id,
                model: "beta".into(),
                upstream_model: "beta".into(),
                dispatch_provider: "openai".into(),
                api_base: None,
                task_id: None,
                revision: "rev-s1".into(),
            },
            &r2,
        )
        .await
        .unwrap();
    store
        .save_request_timing(RequestTimingRecord {
            attempt: a2_id,
            dispatch_ms: Some(10),
            headers_ms: None,
            first_output_ms: None,
            total_ms: 250,
            complete: true,
            http_status: Some(502),
        })
        .await
        .unwrap();

    // Request 3: alpha via k2, marked confirmed_not_executed (not_charged)
    let a3_id = Uuid::new_v4();
    store
        .admit_priced_gateway(
            &p2,
            GatewayAdmission {
                evaluation: None,
                route_generation: None,
                managed_route: None,
                token_bound: Some(200),
                token_bound_estimator: Default::default(),
                inspected_guardrails: None,
                operation_id: Uuid::new_v4(),
                attempt_id: a3_id,
                scope,
                key_id: k2.id,
                model: "alpha".into(),
                upstream_model: "alpha".into(),
                dispatch_provider: "openai".into(),
                api_base: None,
                task_id: None,
                revision: "rev-s1".into(),
            },
            &r1,
        )
        .await
        .unwrap();
    store
        .save_request_failure(
            scope,
            a3_id,
            RequestFailure {
                kind: RequestFailureKind::UpstreamHttpError,
                upstream_http_status: Some(429),
                transport_phase: None,
            },
        )
        .await
        .unwrap();
    sqlx::query(
        "UPDATE attempts SET execution='confirmed_not_executed', completed_at=now() WHERE id=$1",
    )
    .bind(a3_id)
    .execute(&pool)
    .await
    .unwrap();

    let summary = store
        .gateway_activity_summary(scope, &GatewayActivityFilter::default())
        .await
        .unwrap();
    assert_eq!(summary.request_count, 3);
    assert_eq!(summary.usage_count, 1);
    assert_eq!(summary.prompt_tokens, "1000");
    assert_eq!(summary.completion_tokens, "500");
    assert_eq!(summary.timing_count, 2);
    assert_eq!(summary.average_duration_ms, Some(185));
    assert_eq!(summary.unresolved_customer_charge_count, 1);
    assert_eq!(summary.unpriced_request_count, 0);
    assert_eq!(summary.customer_charges.len(), 1);
    assert_eq!(summary.customer_charges[0].currency, "USD");
    assert_eq!(summary.customer_charges[0].charged_requests, 1);
    // alpha cost = (1000*2M + 500*4M) / 1M = 4000 nanounits
    assert_eq!(summary.customer_charges[0].amount_nanos, "4000");
    assert_eq!(summary.usage_by_model.len(), 2);
    assert_eq!(summary.usage_by_key.len(), 2);
    assert_eq!(summary.delivery_statuses.len(), 3); // 200, 502, null
    assert_eq!(summary.token_categories["cached_input_tokens"], "100");
    assert_eq!(summary.token_categories["reasoning_output_tokens"], "50");
    assert_eq!(summary.latency_percentiles["sample_count"], 2);
    let hist_total: i64 = summary
        .request_histogram
        .iter()
        .map(|b| b["request_count"].as_i64().unwrap())
        .sum();
    assert_eq!(hist_total, 3);

    // Filtered summary (HTTP 502 only) matches export length & breakdown
    let filter_502 = GatewayActivityFilter {
        delivery_status: Some(GatewayDeliveryFilter::HttpStatus(502)),
        sort: GatewayActivitySort::Newest,
        ..Default::default()
    };
    let filtered = store
        .gateway_activity_summary(scope, &filter_502)
        .await
        .unwrap();
    assert_eq!(filtered.request_count, 1);
    assert_eq!(filtered.unresolved_customer_charge_count, 1);
    assert_eq!(filtered.usage_by_model[0].model_alias, "beta");
    let exported = store
        .gateway_activity_export(scope, &filter_502)
        .await
        .unwrap();
    assert_eq!(exported.len(), 1);
    assert_eq!(exported[0].model, "beta");
    assert_eq!(exported[0].http_status, Some(502));
    assert_eq!(
        summary.charges_by_model[0],
        json!({
            "model_alias": "alpha",
            "currency": "USD",
            "amount_nanos": "4000",
            "request_count": 1,
            "charged_requests": 1,
            "unit_charged_requests": 0,
            "unresolved_requests": 0,
            "owner_funded_requests": 0,
            "unpriced_requests": 0,
            "not_charged_requests": 0
        })
    );
}
