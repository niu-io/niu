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

/// A correct Supplier key alone does not prove that retained content uses it.
/// Authenticate exact stored domain bindings before any listener or cleanup starts.
pub(crate) async fn validate_retained_content(
    store: &Store,
    cipher: Option<&CredentialCipher>,
) -> Result<(), Box<dyn std::error::Error>> {
    use niu_storage::EncryptedContentDomain as Domain;
    for domain in Domain::ALL {
        let mut after = None;
        loop {
            let page = store
                .retained_encrypted_content_page(domain, after.take())
                .await
                .map_err(|_| "Cannot read retained encrypted content")?;
            if page.is_empty() {
                break;
            }
            let cipher = cipher
                .ok_or("NIU_VENDOR_ENCRYPTION_KEY is required for retained encrypted content")?;
            for content in page {
                let result = match domain {
                    Domain::MediaResult => {
                        let kind = match content.discriminator.as_str() {
                            "video" => niu_storage::MediaResultKind::Video,
                            "last_frame" => niu_storage::MediaResultKind::LastFrame,
                            _ => return Err("Invalid retained media result binding".into()),
                        };
                        cipher
                            .open_media_result(content.scope, content.id, kind, &content.ciphertext)
                            .map(|_| ())
                    }
                    Domain::AssetListing => cipher
                        .open_asset_listing_result(content.scope, content.id, &content.ciphertext)
                        .map(|_| ()),
                    Domain::AssetLookup => cipher
                        .open_asset_lookup_result(content.scope, content.id, &content.ciphertext)
                        .map(|_| ()),
                    Domain::AssetRead => cipher
                        .open_asset_read_result(content.scope, content.id, &content.ciphertext)
                        .map(|_| ()),
                    Domain::AssetPatch => cipher
                        .open_asset_update_patch(content.scope, content.id, &content.ciphertext)
                        .map(|_| ()),
                    Domain::InspectedImage => {
                        let key = content
                            .key_id
                            .ok_or("Invalid retained image source binding")?;
                        let aad =
                            niu_storage::inspected_image_source_aad(content.scope, key, content.id);
                        cipher
                            .open_bytes_with_aad(&aad, &content.ciphertext)
                            .map(|_| ())
                    }
                };
                result.map_err(|_| "Cannot decrypt retained encrypted content with the configured encryption key")?;
                after = Some((content.id, content.discriminator));
            }
        }
    }
    Ok(())
}
