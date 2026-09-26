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
    let before = vendors(&client, &base).await;
    let vendor = &before[0];
    let id = vendor["id"].as_str().unwrap();
    let updated = client.put(format!("{base}/admin/v1/vendors/{id}")).bearer_auth(ADMIN)
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
