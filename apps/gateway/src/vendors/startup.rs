//! Fail closed before listening when retained Supplier secrets cannot be decrypted.
use super::crypto::CredentialCipher;
use niu_storage::Store;

pub(crate) async fn validate_saved_credentials(
    store: &Store,
    cipher: Option<&CredentialCipher>,
) -> Result<(), Box<dyn std::error::Error>> {
    if cipher.is_none()
        && !store
            .vendors()
            .await
            .map_err(|_| "Cannot read vendor registry")?
            .is_empty()
    {
        // Revoked inference credentials can coexist with other encrypted
        // Supplier data; retain the existing missing-key startup guard.
        return Err("NIU_VENDOR_ENCRYPTION_KEY is required for persisted vendors".into());
    }
    // A route-only scan skips credentials with no model mapping. Validate
    // every retained Supplier inference credential before becoming ready.
    let mut after = None;
    loop {
        let credentials = store
            .vendor_credential_page(after)
            .await
            .map_err(|_| "Cannot read vendor credentials")?;
        if credentials.is_empty() {
            break;
        }
        let cipher = cipher
            .as_ref()
            .ok_or("NIU_VENDOR_ENCRYPTION_KEY is required for persisted vendor credentials")?;
        for (vendor, ciphertext) in credentials {
            cipher.open(vendor, &ciphertext)
                    .map_err(|_| "Cannot decrypt persisted vendor credentials with the configured encryption key")?;
            after = Some(vendor);
        }
    }

    let mut after = None;
    loop {
        let credentials = store
            .asset_management_credential_page(after)
            .await
            .map_err(|_| "Cannot read asset management credentials")?;
        if credentials.is_empty() {
            break;
        }
        let cipher = cipher.ok_or(
            "NIU_VENDOR_ENCRYPTION_KEY is required for persisted asset management credentials",
        )?;
        for credential in credentials {
            cipher.open_asset_management(
                credential.vendor_id,
                credential.revision,
                &credential.upstream_project,
                &credential.credential_ciphertext,
            ).map_err(|_| "Cannot decrypt persisted asset management credentials with the configured encryption key")?;
            after = Some((credential.vendor_id, credential.revision));
        }
    }
    Ok(())
}
