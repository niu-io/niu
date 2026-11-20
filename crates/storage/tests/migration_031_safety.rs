use niu_storage::{
    MIGRATOR, OperatorAuditActor, RegistrationSubmissionInput, RoutePoolCandidate,
    RouteRegistryCompiler, RouteRegistryInputs, Store, StoreError, VendorInput, VendorModelInput,
};
use serde_json::json;
use sqlx::{ConnectOptions, PgPool, migrate::Migrator};
use std::borrow::Cow;
use std::sync::Arc;
use uuid::Uuid;

struct StaticTestCompiler(&'static str);

impl RouteRegistryCompiler for StaticTestCompiler {
    fn static_identity(&self) -> &str {
        self.0
    }

    fn compile(&self, inputs: RouteRegistryInputs) -> Result<serde_json::Value, StoreError> {
        let mut routes = serde_json::Map::new();
        for route in inputs.routes {
            let alias = route.model.alias.clone();
            routes.insert(
                alias,
                json!({
                    "metadata": route,
                    "model": {
                        "public_catalog": route.model.public_catalog,
                        "upstream_model": route.model.upstream_model,
                    }
                }),
            );
        }
        let mut pools = serde_json::Map::new();
        for pool in inputs.pools {
            let alias = pool.alias.clone();
            pools.insert(alias, serde_json::to_value(pool).unwrap());
        }
        Ok(json!({
            "version": 1,
            "static_models": {},
            "routes": routes,
            "pools": pools,
            "offers": {}
        }))
    }
}

#[sqlx::test(migrations = false)]
#[ignore = "requires PostgreSQL"]
async fn migration_0435_atomically_publishes_new_generation_without_emptying_active(pool: PgPool) {
    // 1. Run all migrations strictly before 0435 (simulating an already-running v0.3.0/pre-0435 DB).
    let before_0435: Vec<_> = MIGRATOR
        .migrations
        .iter()
        .filter(|m| m.version < 435)
        .cloned()
        .collect();
    Migrator {
        migrations: Cow::Owned(before_0435),
        ignore_missing: false,
        locking: true,
        no_tx: false,
    }
    .run(&pool)
    .await
    .unwrap();

    let identity = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    let store =
        Store::from_pool(pool.clone()).with_route_compiler(Arc::new(StaticTestCompiler(identity)));
    store.bootstrap_route_registry(vec![], None).await.unwrap();

    // Seed one commercial route (public_catalog=false), one personal route (public_catalog=false),
    // and one platform-shared pool (public_catalog=false).
    let scope = store.default_workspace().await.unwrap();
    let comm_vendor_id = Uuid::new_v4();
    store
        .create_vendor(VendorInput {
            id: comm_vendor_id,
            name: "Commercial Provider".into(),
            adapter: "openai".into(),
            api_base: "https://comm.example.invalid/v1".into(),
            enabled: true,
            credential_ciphertext: vec![1; 48],
        })
        .await
        .unwrap();
    store
        .upsert_vendor_model(
            comm_vendor_id,
            VendorModelInput {
                alias: "comm/shared".into(),
                upstream_model: "upstream/shared".into(),
                public_catalog: false,
                enabled: true,
                capabilities: json!({}),
                pricing: Some(json!({
                    "currency": "USD",
                    "api_prompt_rate": 100,
                    "api_completion_rate": 200,
                    "cash_prompt_rate": 100,
                    "cash_completion_rate": 200,
                    "max_input_tokens": 1000,
                    "max_output_tokens": 100
                })),
                expected_revision: None,
            },
        )
        .await
        .unwrap();

    let personal_vendor_id = Uuid::new_v4();
    store
        .create_vendor(VendorInput {
            id: personal_vendor_id,
            name: "Personal Provider".into(),
            adapter: "openai".into(),
            api_base: "https://personal.example.invalid/v1".into(),
            enabled: true,
            credential_ciphertext: vec![1; 48],
        })
        .await
        .unwrap();
    store
        .assign_personal_vendor_owner(personal_vendor_id, scope.organization_id, 1)
        .await
        .unwrap();
    store
        .upsert_vendor_model(
            personal_vendor_id,
            VendorModelInput {
                alias: "priv/personal".into(),
                upstream_model: "upstream/personal".into(),
                public_catalog: false,
                enabled: true,
                capabilities: json!({}),
                pricing: None,
                expected_revision: None,
            },
        )
        .await
        .unwrap();

    store
        .set_model_route_pool(&niu_storage::ModelRoutePool {
            alias: "pool/shared".into(),
            organization_id: None,
            project_id: None,
            display_name: Some("Shared Pool".into()),
            description: None,
            slug: None,
            public_catalog: false,
            billing_mode: niu_storage::RoutePoolBillingMode::PoolTariff,
            enabled: true,
            revision: 0,
            candidates: vec![RoutePoolCandidate {
                alias: "comm/shared".into(),
                priority: 100,
                weight: 100,
                enabled: true,
            }],
            rules: vec![],
            default_action: niu_storage::RoutePoolDefaultAction::Candidates,
        })
        .await
        .unwrap();

    let gen_before = store.route_registry_generation().await.unwrap().unwrap();

    // 2. Now run the remaining migrations via production compatibility runner (0435..=latest).
    niu_storage::run_migrations(&pool).await.unwrap();

    // 3. Immediately after migrating (before any new replica bootstraps),
    // routing_registry_active MUST remain populated with a valid generation!
    let gen_after = store
        .route_registry_generation()
        .await
        .unwrap()
        .expect("routing_registry_active must never be empty after migration 0435");
    assert!(gen_after > gen_before);

    let pub_after = store.route_registry_publication(gen_after).await.unwrap();
    assert_eq!(pub_after.static_identity, identity);
    assert_eq!(
        pub_after.compiled["routes"]["comm/shared"]["metadata"]["model"]["public_catalog"],
        json!(true)
    );
    assert_eq!(
        pub_after.compiled["routes"]["comm/shared"]["model"]["public_catalog"],
        json!(true)
    );
    assert_eq!(
        pub_after.compiled["routes"]["priv/personal"]["metadata"]["model"]["public_catalog"],
        json!(false)
    );
    assert_eq!(
        pub_after.compiled["pools"]["pool/shared"]["public_catalog"],
        json!(true)
    );
    assert_eq!(
        pub_after.compiled["pools"]["pool/shared"]["revision"],
        json!(2)
    );

    // 4. Starting a new replica with NIU_ROUTING_EXPECTED_GENERATION set to the
    // active generation must succeed (no StoreError::Conflict).
    store
        .bootstrap_route_registry(vec![], Some(gen_after))
        .await
        .unwrap();
}

#[sqlx::test(migrations = false)]
#[ignore = "requires PostgreSQL"]
async fn migration_0439_backfills_bank_memo_without_volatile_not_null_add_column(pool: PgPool) {
    let sql_0439 = include_str!("../compatibility/0439_safe.sql");
    assert!(
        !sql_0439.contains("ADD COLUMN bank_memo text NOT NULL"),
        "0439_safe.sql must not use volatile-default ADD COLUMN NOT NULL which forces ACCESS EXCLUSIVE rewrite"
    );

    // Run migrations before 0439 and seed two organizations.
    let before_0439: Vec<_> = MIGRATOR
        .migrations
        .iter()
        .filter(|m| m.version < 439)
        .cloned()
        .collect();
    Migrator {
        migrations: Cow::Owned(before_0439),
        ignore_missing: false,
        locking: true,
        no_tx: false,
    }
    .run(&pool)
    .await
    .unwrap();

    let org_a = Store::from_pool(pool.clone())
        .create_organization("Org Alpha")
        .await
        .unwrap();
    let org_b = Store::from_pool(pool.clone())
        .create_organization("Org Beta")
        .await
        .unwrap();

    // Run remaining migrations including 0439..=latest via production compatibility runner.
    niu_storage::run_migrations(&pool).await.unwrap();

    let memos: Vec<String> =
        sqlx::query_scalar("SELECT bank_memo FROM organizations WHERE id = ANY($1) ORDER BY id")
            .bind(vec![org_a, org_b])
            .fetch_all(&pool)
            .await
            .unwrap();
    assert_eq!(memos.len(), 2);
    assert_ne!(memos[0], memos[1]);
    assert!(memos.iter().all(|m| m.starts_with("NIU-") && m.len() == 16));

    // Newly inserted organizations also automatically get a bank_memo via DEFAULT.
    let org_c = Store::from_pool(pool.clone())
        .create_organization("Org Gamma")
        .await
        .unwrap();
    let memo_c: String = sqlx::query_scalar("SELECT bank_memo FROM organizations WHERE id = $1")
        .bind(org_c)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert!(memo_c.starts_with("NIU-") && memo_c.len() == 16);
}

#[sqlx::test(migrations = false)]
#[ignore = "requires PostgreSQL"]
async fn pre_tag_0435_and_0439_checksums_remain_compatible_on_upgrade(pool: PgPool) {
    // Simulate a v0.3.1 DB that already ran the immutable released 0435 and 0439 SQL.
    let staged: Vec<_> = MIGRATOR
        .migrations
        .iter()
        .filter(|m| m.version <= 439)
        .cloned()
        .collect();
    Migrator {
        migrations: Cow::Owned(staged),
        ignore_missing: false,
        locking: true,
        no_tx: false,
    }
    .run(&pool)
    .await
    .unwrap();

    let url = pool.connect_options().to_url_lossy().to_string();
    let store = Store::connect(&url).await.unwrap();
    store.require_current_inspection_schema().await.unwrap();
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn limited_preview_approved_empty_workspace_can_be_deleted_and_fks_match_immutability(
    pool: PgPool,
) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());

    let hash = niu_storage::passwords::hash_password("synthetic preview passphrase 1").unwrap();
    let submitted = store
        .submit_registration_request(RegistrationSubmissionInput {
            email: "preview-delete@example.test",
            applicant_name: "Ada",
            organization_name: Some("Preview Delete Org"),
            workspace_name: Some("Initial Empty Studio"),
            password_hash: &hash,
            note: None,
        })
        .await
        .unwrap();
    let niu_storage::RegistrationSubmissionOutcome::Created { id: request_id } = submitted else {
        panic!("expected Created");
    };
    let approved = store
        .approve_registration_request(
            request_id,
            1,
            None,
            None,
            Some("Approved for deletion test"),
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();

    let scope: (Uuid, Uuid) = sqlx::query_as(
        "SELECT approved_organization_id, approved_project_id \
         FROM account_registration_requests WHERE id = $1",
    )
    .bind(approved.id)
    .fetch_one(&pool)
    .await
    .unwrap();

    // Deleting the empty initial approved workspace must succeed (no FK 23503 -> WorkspaceNotEmpty).
    let deleted = store
        .delete_empty_workspace(niu_storage::TenantScope {
            organization_id: scope.0,
            project_id: scope.1,
        })
        .await
        .unwrap();
    assert!(deleted);

    // Registration audit record remains readable even after workspace deletion.
    let loaded = store
        .list_registration_requests(Some(niu_storage::RegistrationStatus::Approved), None, 20)
        .await
        .unwrap();
    assert_eq!(loaded.data.len(), 1);
    assert_eq!(loaded.data[0].id, approved.id);
    assert!(loaded.data[0].approved_workspace_slug.is_none());

    // None of the immutable registration tables may carry contradictory ON DELETE SET NULL/CASCADE.
    let bad_fks: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM pg_constraint \
         WHERE conrelid IN ( \
             'account_registration_requests'::regclass, \
             'platform_registration_policy_events'::regclass, \
             'account_registration_review_events'::regclass \
         ) \
           AND contype = 'f' \
           AND confdeltype IN ('n', 'c')",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(bad_fks, 0);
}
