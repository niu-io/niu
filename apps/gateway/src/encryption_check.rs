//! Read-only offline authentication; no bootstrap, migrations or listeners.
use std::env;

pub(crate) async fn run() -> Result<(), Box<dyn std::error::Error>> {
    let url = env::var("NIU_DATABASE_URL").map_err(|_| "NIU_DATABASE_URL is required")?;
    let cipher = env::var("NIU_VENDOR_ENCRYPTION_KEY")
        .ok()
        .map(|key| crate::vendors::crypto::CredentialCipher::new(&key))
        .transpose()?;
    let store = niu_storage::Store::connect_read_only(&url)
        .await
        .map_err(|_| "Cannot open encryption inspection database")?;
    crate::vendors::validate_saved_codex_credentials(&store, cipher.as_ref()).await?;
    crate::vendors::validate_saved_credentials(&store, cipher.as_ref()).await?;
    crate::payments::validate_saved_configuration(&store, cipher.as_ref()).await?;
    crate::vendors::validate_retained_content(&store, cipher.as_ref()).await?;
    println!(
        "Retained encrypted data authenticated. No migration, bootstrap, cleanup or upstream request was performed."
    );
    Ok(())
}
