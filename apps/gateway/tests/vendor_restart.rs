//! Exercises process replacement against real PostgreSQL using synthetic secrets.
use serde_json::{Value, json};
use std::{path::PathBuf, process::Stdio, time::Duration};
use tokio::process::{Child, Command};

const ADMIN: &str = "test-only-installation-admin-secret-at-least-32-characters";
const MASTER: &str = "test-only-vendor-encryption-secret-at-least-32-characters";

struct Fixture(PathBuf);
impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

fn command(
    fixture: &Fixture,
    database: &str,
    port: u16,
    master: Option<&str>,
    seed: bool,
) -> Command {
    let mut command = Command::new(env!("CARGO_BIN_EXE_niu-gateway"));
    command
        .env_clear()
        .kill_on_drop(true)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .env("NIU_CONFIG_FILE", fixture.0.join("niu.toml"))
        .env("NIU_VENDOR_BOOTSTRAP_FILE", fixture.0.join("vendors.json"))
        .env("NIU_DATABASE_URL", database)
        .env("NIU_ADMIN_TOKENS", ADMIN)
        .env("NIU_BIND", format!("127.0.0.1:{port}"));
    if let Some(master) = master {
        command.env("NIU_VENDOR_ENCRYPTION_KEY", master);
    }
    if seed {
        command.env("NIU_TEST_VENDOR_KEY", "test-only-initial-credential");
    }
    command
}

async fn ready(child: &mut Child, client: &reqwest::Client, base: &str) {
    for _ in 0..100 {
        assert!(
            child.try_wait().unwrap().is_none(),
            "gateway exited before readiness"
        );
        if client
            .get(format!("{base}/readyz"))
            .send()
            .await
            .is_ok_and(|response| response.status().is_success())
        {
            return;
        }
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
    panic!("gateway readiness deadline elapsed");
}

async fn vendors(client: &reqwest::Client, base: &str) -> Value {
    client
        .get(format!("{base}/admin/v1/vendors"))
        .bearer_auth(ADMIN)
        .send()
        .await
        .unwrap()
        .error_for_status()
        .unwrap()
        .json::<Value>()
        .await
        .unwrap()["data"]
        .clone()
}

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn vendor_configuration_survives_process_replacement_without_seed_credentials(
    pool: sqlx::PgPool,
) {
    let fixture =
        Fixture(std::env::temp_dir().join(format!("niu-vendor-restart-{}", uuid::Uuid::new_v4())));
    std::fs::create_dir(&fixture.0).unwrap();
    std::fs::write(fixture.0.join("niu.toml"), "[models]\n").unwrap();
    std::fs::write(fixture.0.join("vendors.json"), json!({"vendors":[{
        "name":"OpenRouter", "adapter":"openrouter", "api_base":"https://openrouter.ai/api/v1",
        "credential_env":"NIU_TEST_VENDOR_KEY", "models":[{"alias":"fast","upstream_model":"maker/model","public_catalog":true}]
    }]}).to_string()).unwrap();
    let mut database = url::Url::parse(&std::env::var("DATABASE_URL").unwrap()).unwrap();
    database.set_path(pool.connect_options().get_database().unwrap());
    let socket = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let port = socket.local_addr().unwrap().port();
    drop(socket);
    let base = format!("http://127.0.0.1:{port}");
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(2))
        .build()
        .unwrap();
    let mut child = command(&fixture, database.as_str(), port, Some(MASTER), true)
        .spawn()
        .unwrap();
    ready(&mut child, &client, &base).await;
    let seeded = vendors(&client, &base).await;
    let store = niu_storage::Store::from_pool(pool.clone());
    let supplier = store
        .create_provider_business("Restart Supplier")
        .await
        .unwrap();
    store
        .associate_vendor_supplier(
            uuid::Uuid::parse_str(seeded[0]["id"].as_str().unwrap()).unwrap(),
            supplier,
            seeded[0]["revision"].as_i64().unwrap(),
        )
        .await
        .unwrap();
    let before = vendors(&client, &base).await;
    assert_eq!(
        before[0]["supplier"],
        json!({"id":supplier,"name":"Restart Supplier"})
    );
    let vendor = &before[0];
    let id = vendor["id"].as_str().unwrap();
    let mut updated = client.put(format!("{base}/admin/v1/vendors/{id}")).bearer_auth(ADMIN)
        .json(&json!({"name":"Renamed OpenRouter","api_base":vendor["api_base"],"enabled":false,"expected_revision":vendor["revision"],"api_key":"test-only-rotated-credential"}))
        .send().await.unwrap().error_for_status().unwrap().json::<Value>().await.unwrap()["data"].clone();
    let ciphertext: Vec<u8> =
        sqlx::query_scalar("SELECT credential_ciphertext FROM vendors WHERE id=$1")
            .bind(uuid::Uuid::parse_str(id).unwrap())
            .fetch_one(&pool)
            .await
            .unwrap();
    assert!(
        !ciphertext
            .windows(b"test-only-rotated-credential".len())
            .any(|v| v == b"test-only-rotated-credential")
    );
    child.kill().await.unwrap();
    let mut replacement = command(&fixture, database.as_str(), port, Some(MASTER), false)
        .spawn()
        .unwrap();
    ready(&mut replacement, &client, &base).await;
    updated["supplier"] = before[0]["supplier"].clone();
    assert_eq!(before[0]["owner_funded"], false);
    assert_eq!(updated["owner_funded"], false);
    assert_eq!(vendors(&client, &base).await, json!([updated]));
    let catalog: Value = client
        .get(format!("{base}/catalog/v1/models"))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(catalog["data"], json!([]));
    replacement.kill().await.unwrap();
    for master in [
        None,
        Some("a-different-test-master-secret-at-least-32-characters"),
    ] {
        let mut invalid = command(&fixture, database.as_str(), port, master, false)
            .spawn()
            .unwrap();
        let status = tokio::time::timeout(Duration::from_secs(10), invalid.wait())
            .await
            .unwrap()
            .unwrap();
        assert!(
            !status.success(),
            "missing or incompatible master key must fail startup"
        );
    }
}

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn video_polling_survives_process_replacement_without_resubmission(pool: sqlx::PgPool) {
    video_process_replacement(pool, false, false).await;
}

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn video_polling_rechecks_revoked_key_after_process_replacement(pool: sqlx::PgPool) {
    video_process_replacement(pool, true, false).await;
}

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn video_polling_prepaid_settlement_survives_process_replacement(pool: sqlx::PgPool) {
    video_process_replacement(pool, false, true).await;
}

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn video_polling_prepaid_revocation_preserves_liability_without_egress(pool: sqlx::PgPool) {
    video_process_replacement(pool, true, true).await;
}

async fn video_process_replacement(pool: sqlx::PgPool, revoke: bool, prepaid: bool) {
    use axum::{
        Json, Router,
        http::HeaderMap,
        routing::{get, post},
    };
    use std::sync::{
        Arc,
        atomic::{AtomicUsize, Ordering},
    };
    let creates = Arc::new(AtomicUsize::new(0));
    let queries = Arc::new(AtomicUsize::new(0));
    let create_count = creates.clone();
    let query_count = queries.clone();
    let upstream = Router::new()
        .route("/contents/generations/tasks", post(move |headers: HeaderMap, Json(body): Json<Value>| {
            let count = create_count.clone();
            async move {
                assert_eq!(headers["authorization"], "Bearer test-only-video-token");
                assert_eq!(body["model"], "private-video-model");
                count.fetch_add(1, Ordering::SeqCst);
                Json(json!({"id":"private-video-job"}))
            }
        }))
        .route("/contents/generations/tasks/{job}", get(move |headers: HeaderMap, axum::extract::Path(job): axum::extract::Path<String>| {
            let count = query_count.clone();
            async move {
                assert_eq!(headers["authorization"], "Bearer test-only-video-token");
                assert_eq!(job, "private-video-job");
                count.fetch_add(1, Ordering::SeqCst);
                Json(json!({"id":job,"model":"private-video-model","status":"succeeded","usage":{"completion_tokens":200000},"content":{"video_url":"https://fixture.example/private-video.mp4"}}))
            }
        }));
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let upstream_address = listener.local_addr().unwrap();
    let server = tokio::spawn(async move { axum::serve(listener, upstream).await.unwrap() });
    let fixture =
        Fixture(std::env::temp_dir().join(format!("niu-video-restart-{}", uuid::Uuid::new_v4())));
    std::fs::create_dir(&fixture.0).unwrap();
    std::fs::write(fixture.0.join("niu.toml"), "[models]\n").unwrap();
    std::fs::write(fixture.0.join("vendors.json"), "{\"vendors\":[]}").unwrap();
    let mut database = url::Url::parse(&std::env::var("DATABASE_URL").unwrap()).unwrap();
    database.set_path(pool.connect_options().get_database().unwrap());
    let socket = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let port = socket.local_addr().unwrap().port();
    drop(socket);
    let base = format!("http://127.0.0.1:{port}");
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(2))
        .build()
        .unwrap();
    let mut child = command(&fixture, database.as_str(), port, Some(MASTER), false)
        .spawn()
        .unwrap();
    ready(&mut child, &client, &base).await;
    let response = client.post(format!("{base}/admin/v1/vendors")).bearer_auth(ADMIN)
        .json(&json!({"name":"Restart video fixture","adapter":"openai","api_base":format!("http://{upstream_address}"),"api_key":"test-only-video-token","enabled":true}))
        .send().await.unwrap().error_for_status().unwrap().json::<Value>().await.unwrap();
    let vendor = &response["data"];
    let vendor_id = uuid::Uuid::parse_str(vendor["id"].as_str().unwrap()).unwrap();
    let store = niu_storage::Store::from_pool(pool.clone());
    let scope = if prepaid {
        let organization = store
            .create_prepaid_organization("Restart video customer", "CNY")
            .await
            .unwrap();
        store
            .create_project(organization, "Restart video workspace")
            .await
            .unwrap()
    } else {
        let scope = store.default_workspace().await.unwrap();
        store
            .assign_personal_vendor_owner(
                vendor_id,
                scope.organization_id,
                vendor["revision"].as_i64().unwrap(),
            )
            .await
            .unwrap();
        scope
    };
    let schema = json!({"version":1,"revision":"restart-schema","model_alias":"fixture-video","upstream_model":"private-video-model","channel":"ark-direct-v1","maximum_body_bytes":1024,"maximum_content_items":1,"inputs":{"text":{"maximum_items":1,"maximum_bytes":256,"https":false,"data_mime_types":[],"roles":[],"role_required":false}},"controls":{"resolution":{"kind":"choice","values":["720p"],"default":"720p"}},"required_controls":[],"exclusive_controls":[],"callbacks_qualified":false});
    let model = store
        .upsert_vendor_model(
            vendor_id,
            niu_storage::VendorModelInput {
                alias: "fixture-video".into(),
                upstream_model: "private-video-model".into(),
                public_catalog: false,
                enabled: true,
                capabilities: json!({"video_schema":schema}),
                pricing: None,
                expected_revision: None,
            },
        )
        .await
        .unwrap();
    if prepaid {
        let supplier = store
            .create_provider_business("Restart video Supplier")
            .await
            .unwrap();
        store
            .associate_vendor_supplier(vendor_id, supplier, vendor["revision"].as_i64().unwrap())
            .await
            .unwrap();
        let current_vendor = store.vendor(vendor_id).await.unwrap().unwrap();
        let revision = store
            .publish_supplier_media_offer(
                supplier,
                &niu_storage::SupplierMediaOfferInput {
                    revision: uuid::Uuid::new_v4(),
                    model_alias: "fixture-video".into(),
                    vendor_id,
                    vendor_revision: current_vendor.revision,
                    model_revision: model.revision,
                    schema_revision: "restart-schema".into(),
                    expected_revision: None,
                },
            )
            .await
            .unwrap();
        let offer: uuid::Uuid = sqlx::query_scalar(
            "SELECT id FROM provider_offers WHERE provider_id=$1 AND model_alias='fixture-video'",
        )
        .bind(supplier)
        .fetch_one(&pool)
        .await
        .unwrap();
        let expires = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis() as i64
            + 3600000;
        store
            .qualify_provider_business(
                supplier,
                &niu_storage::ProviderQualificationInput {
                    supply_rights_sha256: "a".repeat(64),
                    supply_capability_sha256: "b".repeat(64),
                    data_handling_sha256: "c".repeat(64),
                    valid_until_ms: expires,
                },
            )
            .await
            .unwrap();
        store
            .qualify_provider_offer(
                supplier,
                offer,
                &niu_storage::ProviderOfferQualificationInput {
                    rate_revision: revision,
                    model_identity_sha256: "d".repeat(64),
                    protocol_matrix_sha256: "e".repeat(64),
                    protocol_matrix_version: "native-video-fixture-v1".into(),
                    data_handling_sha256: "f".repeat(64),
                    availability_sha256: "1".repeat(64),
                    agreed_rates_sha256: "2".repeat(64),
                    valid_until_ms: expires,
                },
            )
            .await
            .unwrap();
        let actor = store
            .create_operator(
                niu_storage::OperatorScope {
                    organization_id: scope.organization_id,
                    project_id: None,
                },
                "Restart Supplier manager",
                niu_storage::OperatorRole::Owner,
                3600,
                niu_storage::OperatorAuditActor::Installation,
            )
            .await
            .unwrap();
        store
            .set_provider_member(supplier, actor.operator_id, "manager", true)
            .await
            .unwrap();
        store
            .set_provider_offer_active(supplier, offer, actor.operator_id, true)
            .await
            .unwrap();
        let current = store.vendor(vendor_id).await.unwrap().unwrap();
        let q = |n: &str| json!({"numerator":n,"denominator":"1"});
        let published=client.post(format!("{base}/admin/v1/organizations/{}/billing/media-rates",scope.organization_id)).bearer_auth(ADMIN)
            .json(&json!({"revision":"native-selling-1","vendor_id":vendor_id,"vendor_revision":current.revision,"model_revision":model.revision,"schema_revision":"restart-schema","offer_revision":revision.to_string(),"tariff":{"revision":"native-tariff-1","dimensions":{"model":"fixture-video","channel":"ark-direct-v1","resolution":"720p","reference_video":false},"meter":"video_tokens","currency":"CNY","decimal_places":9,"amount_units":100,"per_quantity":q("1000000"),"minimum_quantity":q("0"),"rounding":"Up","effective_from":0,"effective_until":null},"discounts":[],"maximum_quantity":q("200000"),"liability_qualification_revision":"synthetic-native-bound"}))
            .send().await.unwrap();
        assert_eq!(published.status(), reqwest::StatusCode::OK);
        let purchase=client.post(format!("{base}/admin/v1/providers/{supplier}/media-rates")).bearer_auth(ADMIN)
            .json(&json!({"revision":"native-purchase-1","offer_revision":revision,"vendor_revision":current.revision,"model_revision":model.revision,"schema_revision":"restart-schema","tariff":{"revision":"native-purchase-tariff","dimensions":{"model":"fixture-video","channel":"ark-direct-v1","resolution":"720p","reference_video":false},"meter":"video_tokens","currency":"CNY","decimal_places":9,"amount_units":40,"per_quantity":q("1000000"),"minimum_quantity":q("0"),"rounding":"Up","effective_from":0,"effective_until":null},"discounts":[]}))
            .send().await.unwrap();
        assert_eq!(purchase.status(), reqwest::StatusCode::OK);

        store
            .record_settled_customer_funding(
                scope.organization_id,
                "CNY",
                40,
                "synthetic-bank",
                "native-video-funding",
            )
            .await
            .unwrap();
    }
    let key = store
        .issue_key(scope, "Restart video key", &["fixture-video".into()], 3600)
        .await
        .unwrap();
    let response = client.post(format!("{base}/v1/video/jobs")).bearer_auth(&key.token)
        .json(&json!({"model":"fixture-video","content":[{"type":"text","text":"Generate a landscape"}]}))
        .send().await.unwrap();
    assert_eq!(response.status(), reqwest::StatusCode::ACCEPTED);
    let job = response.json::<Value>().await.unwrap();
    assert_eq!(job["status"], "unknown");
    let id = uuid::Uuid::parse_str(job["id"].as_str().unwrap()).unwrap();
    assert_eq!(creates.load(Ordering::SeqCst), 1);
    assert_eq!(queries.load(Ordering::SeqCst), 0);
    if prepaid {
        let reserved:i64=sqlx::query_scalar("SELECT amount_nanos FROM customer_balance_reservations WHERE attempt_id=$1 AND released_at IS NULL").bind(id).fetch_one(&pool).await.unwrap();
        assert_eq!(reserved, 20);
    }
    if revoke {
        store.revoke_key(scope, key.id).await.unwrap();
    }
    child.kill().await.unwrap();
    let mut replacement = command(&fixture, database.as_str(), port, Some(MASTER), false)
        .env("NIU_VIDEO_POLLING", "true")
        .spawn()
        .unwrap();
    ready(&mut replacement, &client, &base).await;
    if revoke {
        tokio::time::timeout(Duration::from_secs(10), async {
            loop {
                let stopped: Option<bool> = sqlx::query_scalar(
                    "SELECT stopped FROM media_query_schedule WHERE attempt_id=$1",
                )
                .bind(id)
                .fetch_optional(&pool)
                .await
                .unwrap();
                if stopped == Some(true) {
                    break;
                }
                tokio::time::sleep(Duration::from_millis(50)).await;
            }
        })
        .await
        .expect("revoked job must leave automatic recovery without egress");
        let denied = client
            .get(format!("{base}/v1/video/jobs/{id}"))
            .bearer_auth(&key.token)
            .send()
            .await
            .unwrap();
        assert_eq!(denied.status(), reqwest::StatusCode::UNAUTHORIZED);
        assert_eq!(creates.load(Ordering::SeqCst), 1);
        assert_eq!(
            queries.load(Ordering::SeqCst),
            0,
            "a revoked original key must not authorize recovery egress"
        );
        assert_eq!(
            store.media_job_status(scope, id).await.unwrap(),
            Some(niu_storage::MediaJobStatus::Unknown)
        );
        if prepaid {
            let held:i64=sqlx::query_scalar("SELECT amount_nanos FROM customer_balance_reservations WHERE attempt_id=$1 AND released_at IS NULL").bind(id).fetch_one(&pool).await.unwrap();
            assert_eq!(
                held, 20,
                "revocation cannot release uncertain prepaid liability"
            );
            let charges:i64=sqlx::query_scalar("SELECT count(*) FROM customer_balance_entries WHERE attempt_id=$1 AND kind='charge'").bind(id).fetch_one(&pool).await.unwrap();
            assert_eq!(
                charges, 0,
                "unknown generation cannot invent a settled debit"
            );
        }
        replacement.kill().await.unwrap();
        server.abort();
        return;
    }
    let recovered = tokio::time::timeout(Duration::from_secs(10), async {
        loop {
            let state = client
                .get(format!("{base}/v1/video/jobs/{id}"))
                .bearer_auth(&key.token)
                .send()
                .await
                .unwrap()
                .error_for_status()
                .unwrap()
                .json::<Value>()
                .await
                .unwrap();
            let stopped: Option<bool> =
                sqlx::query_scalar("SELECT stopped FROM media_query_schedule WHERE attempt_id=$1")
                    .bind(id)
                    .fetch_optional(&pool)
                    .await
                    .unwrap();
            if state["status"] == "succeeded" && stopped == Some(true) {
                break state;
            }
            tokio::time::sleep(Duration::from_millis(50)).await;
        }
    })
    .await
    .expect("replacement must recover the original persisted job");
    assert_eq!(recovered.as_object().unwrap().len(), 4);
    assert!(!recovered.to_string().contains("private-"));
    assert_eq!(
        creates.load(Ordering::SeqCst),
        1,
        "restart must never repeat paid creation"
    );
    assert_eq!(queries.load(Ordering::SeqCst), 1);
    let stopped: bool =
        sqlx::query_scalar("SELECT stopped FROM media_query_schedule WHERE attempt_id=$1")
            .bind(id)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert!(stopped);
    let receipts: i64 =
        sqlx::query_scalar("SELECT count(*) FROM media_query_evidence WHERE attempt_id=$1")
            .bind(id)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(receipts, 1);
    if prepaid {
        let charges:Vec<i64>=sqlx::query_scalar("SELECT amount_nanos FROM customer_balance_entries WHERE attempt_id=$1 AND kind='charge'").bind(id).fetch_all(&pool).await.unwrap();
        assert_eq!(charges, vec![-20]);
        let earnings: Vec<i64> =
            sqlx::query_scalar("SELECT amount_nanos FROM provider_earnings WHERE attempt_id=$1")
                .bind(id)
                .fetch_all(&pool)
                .await
                .unwrap();
        assert_eq!(earnings, vec![8]);

        let released: bool = sqlx::query_scalar(
            "SELECT released_at IS NOT NULL FROM customer_balance_reservations WHERE attempt_id=$1",
        )
        .bind(id)
        .fetch_one(&pool)
        .await
        .unwrap();
        assert!(released);
        let balance:i64=sqlx::query_scalar("SELECT sum(amount_nanos)::bigint FROM customer_balance_entries WHERE organization_id=$1").bind(scope.organization_id).fetch_one(&pool).await.unwrap();
        assert_eq!(balance, 20);
    }
    replacement.kill().await.unwrap();
    server.abort();
}
