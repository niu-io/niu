use super::{
    api::ModelInput,
    crypto::CredentialCipher,
    models::{make_model, validate_model},
};
use serde::Deserialize;
use uuid::Uuid;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Bootstrap {
    vendors: Vec<SeedVendor>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct SeedVendor {
    name: String,
    adapter: String,
    api_base: String,
    credential_env: String,
    models: Vec<ModelInput>,
}

/// Seeds an absent vendor once; persisted administrator changes always win.
pub(crate) async fn seed_from_env(
    store: &niu_storage::Store,
    cipher: Option<&CredentialCipher>,
) -> Result<(), Box<dyn std::error::Error>> {
    let Some(path) = std::env::var_os("NIU_VENDOR_BOOTSTRAP_FILE") else {
        return Ok(());
    };
    let bytes = std::fs::read(path).map_err(|_| "Cannot read vendor bootstrap file")?;
    if bytes.len() > 1_048_576 {
        return Err("Vendor bootstrap file is too large".into());
    }
    seed_bytes(store, cipher, &bytes, |name| std::env::var(name).ok()).await
}

pub(super) async fn seed_bytes(
    store: &niu_storage::Store,
    cipher: Option<&CredentialCipher>,
    bytes: &[u8],
    credential: impl Fn(&str) -> Option<String>,
) -> Result<(), Box<dyn std::error::Error>> {
    let bootstrap: Bootstrap =
        serde_json::from_slice(bytes).map_err(|_| "Invalid vendor bootstrap file")?;
    if bootstrap.vendors.len() > 100 {
        return Err("Too many bootstrap vendors".into());
    }
    for vendor in bootstrap.vendors {
        if store
            .vendor_by_name(&vendor.name)
            .await
            .map_err(|_| "Cannot read vendor registry")?
            .is_some()
        {
            continue;
        }
        let cipher = cipher.ok_or("NIU_VENDOR_ENCRYPTION_KEY is required to initialize vendors")?;
        if vendor.models.len() > 1000 {
            return Err("Too many bootstrap models".into());
        }
        let model = make_model(
            &vendor.adapter,
            &vendor.api_base,
            "validation",
            serde_json::json!({}),
            None,
        )
        .map_err(|_| "Invalid bootstrap vendor")?;
        validate_model("validation", model).map_err(|_| "Invalid bootstrap vendor")?;
        for model in &vendor.models {
            if model.expected_revision.is_some() {
                return Err("Bootstrap models must not specify revisions".into());
            }
            let config = make_model(
                &vendor.adapter,
                &vendor.api_base,
                &model.upstream_model,
                model.capabilities.clone(),
                model.pricing.clone().flatten(),
            )
            .map_err(|_| "Invalid bootstrap model")?;
            validate_model(&model.alias, config).map_err(|_| "Invalid bootstrap model")?;
        }
        let credential =
            credential(&vendor.credential_env).ok_or("Bootstrap vendor credential is missing")?;
        let id = Uuid::new_v4();
        let ciphertext = cipher.seal(id, &credential)?;
        store
            .seed_vendor(
                niu_storage::VendorInput {
                    id,
                    name: vendor.name,
                    adapter: vendor.adapter,
                    api_base: vendor.api_base,
                    enabled: true,
                    credential_ciphertext: ciphertext,
                },
                vendor.models.into_iter().map(ModelInput::storage).collect(),
            )
            .await
            .map_err(|_| "Cannot initialize vendor registry")?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[sqlx::test(migrations = "../../crates/storage/migrations")]
    #[ignore = "requires PostgreSQL"]
    async fn bootstrap_preserves_database_edits_without_original_environment_secret(
        pool: sqlx::PgPool,
    ) {
        let store = niu_storage::Store::from_pool(pool);
        let cipher =
            CredentialCipher::new("test-bootstrap-master-key-at-least-32-characters").unwrap();
        let seed = serde_json::json!({"vendors":[{"name":"OpenRouter","adapter":"openrouter","api_base":"https://openrouter.ai/api/v1","credential_env":"TEST_BOOTSTRAP_SECRET","models":[{"alias":"fast","upstream_model":"maker/model","enabled":true}]}]}).to_string();
        seed_bytes(&store, Some(&cipher), seed.as_bytes(), |_| {
            Some("test-secret".into())
        })
        .await
        .unwrap();
        let vendor = store.vendor_by_name("OpenRouter").await.unwrap().unwrap();
        store
            .update_vendor(
                vendor.id,
                niu_storage::VendorUpdate {
                    name: "Renamed vendor".into(),
                    api_base: vendor.api_base,
                    enabled: false,
                    expected_revision: vendor.revision,
                    credential_ciphertext: None,
                },
            )
            .await
            .unwrap();
        seed_bytes(&store, Some(&cipher), seed.as_bytes(), |_| {
            panic!("persisted vendors must not read bootstrap credentials")
        })
        .await
        .unwrap();
        let current = store.vendor(vendor.id).await.unwrap().unwrap();
        assert!(!current.enabled);
        assert_eq!(current.name, "Renamed vendor");
        assert_eq!(store.vendors().await.unwrap().len(), 1);
        assert_eq!(store.vendor_models(vendor.id).await.unwrap().len(), 1);
    }
}
