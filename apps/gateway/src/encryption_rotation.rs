//! Explicit offline maintenance. No listeners, migrations, bootstrap or upstream calls.
use crate::vendors::crypto::CredentialCipher;
use niu_storage::{
    EncryptedContentDomain as Domain, EncryptionRewrapTarget as Target, EncryptionRotation, Store,
};
use uuid::Uuid;

type Failure = Box<dyn std::error::Error>;

#[derive(Clone, Copy)]
enum Phase {
    Preflight,
    Replace,
    Verify,
}

struct Inventory<'a> {
    store: &'a Store,
    source: &'a CredentialCipher,
    target: &'a CredentialCipher,
    rotation: Option<&'a EncryptionRotation>,
    lease: &'a mut niu_storage::EncryptionRotationLease,
    phase: Phase,
    replaced: usize,
}

impl Inventory<'_> {
    async fn record(
        &mut self,
        target: Target,
        aad: &[u8],
        ciphertext: &[u8],
    ) -> Result<(), Failure> {
        self.lease
            .ensure_connected()
            .await
            .map_err(|_| "Encryption maintenance ownership connection was lost")?;
        if self.target.open_bytes_with_aad(aad, ciphertext).is_ok() {
            return Ok(());
        }
        if matches!(self.phase, Phase::Verify) {
            return Err("Destination key cannot authenticate all retained encrypted data".into());
        }
        let plaintext = self
            .source
            .open_bytes_with_aad(aad, ciphertext)
            .map_err(|_| "Neither supplied key authenticates retained encrypted data")?;
        if matches!(self.phase, Phase::Replace) {
            let replacement = self
                .target
                .seal_bytes_with_aad(aad, &plaintext)
                .map_err(|_| "Cannot create replacement envelope")?;
            let verified = self
                .target
                .open_bytes_with_aad(aad, &replacement)
                .map_err(|_| "Cannot authenticate replacement envelope")?;
            if verified != plaintext {
                return Err("Replacement verification failed".into());
            }
            self.store.replace_encrypted_envelope(self.rotation.ok_or("Missing encryption transition authority")?, target, ciphertext, &replacement)
                .await.map_err(|_| "Envelope replacement failed; retain both keys and resume offline maintenance")?;
            self.replaced += 1;
        }
        Ok(())
    }

    async fn scan(&mut self) -> Result<(), Failure> {
        let mut after = None;
        loop {
            let page = self
                .store
                .vendor_credential_page(after)
                .await
                .map_err(|_| "Cannot inventory Supplier credentials")?;
            if page.is_empty() {
                break;
            }
            for (id, ciphertext) in page {
                self.record(Target::Vendor(id), id.as_bytes(), &ciphertext)
                    .await?;
                after = Some(id);
            }
        }
        let mut after = None;
        loop {
            let page = self
                .store
                .codex_credential_page(after)
                .await
                .map_err(|_| "Cannot inventory retained legacy credentials")?;
            if page.is_empty() {
                break;
            }
            for (id, ciphertext) in page {
                self.record(Target::CodexConnection(id), id.as_bytes(), &ciphertext)
                    .await?;
                after = Some(id);
            }
        }
        let mut after = None;
        loop {
            let page = self
                .store
                .asset_management_credential_page(after)
                .await
                .map_err(|_| "Cannot inventory asset management credentials")?;
            if page.is_empty() {
                break;
            }
            for row in page {
                let aad = CredentialCipher::asset_management_aad(
                    row.vendor_id,
                    row.revision,
                    &row.upstream_project,
                )?;
                self.record(
                    Target::AssetManagement {
                        vendor: row.vendor_id,
                        revision: row.revision,
                    },
                    &aad,
                    &row.credential_ciphertext,
                )
                .await?;
                after = Some((row.vendor_id, row.revision));
            }
        }
        if let Some((_, ciphertext)) = self
            .store
            .payment_gateway_configuration()
            .await
            .map_err(|_| "Cannot inventory payment configuration")?
        {
            self.record(
                Target::PaymentConfiguration,
                b"niu.payment-configuration.epay.v1",
                &ciphertext,
            )
            .await?;
        }
        for domain in Domain::ALL {
            let mut after = None;
            loop {
                let page = self
                    .store
                    .retained_encrypted_content_page(domain, after.take())
                    .await
                    .map_err(|_| "Cannot inventory retained encrypted content")?;
                if page.is_empty() {
                    break;
                }
                for content in page {
                    let aad = CredentialCipher::retained_content_aad(domain, &content)?;
                    let target = match domain {
                        Domain::MediaResult => Target::MediaResult {
                            attempt: content.id,
                            kind: match content.discriminator.as_str() {
                                "video" => niu_storage::MediaResultKind::Video,
                                "last_frame" => niu_storage::MediaResultKind::LastFrame,
                                _ => return Err("Invalid retained media result binding".into()),
                            },
                        },
                        Domain::AssetListing => Target::AssetListing(content.id),
                        Domain::AssetLookup => Target::AssetLookup(content.id),
                        Domain::AssetRead => Target::AssetRead(content.id),
                        Domain::AssetPatch => Target::AssetPatch(content.id),
                        Domain::InspectedImage => Target::InspectedImage(content.id),
                    };
                    self.record(target, &aad, &content.ciphertext).await?;
                    after = Some((content.id, content.discriminator));
                }
            }
        }
        Ok(())
    }
}

fn key_check(secret: &str, operation: Uuid, role: &str) -> [u8; 32] {
    let key = ring::hmac::Key::new(ring::hmac::HMAC_SHA256, secret.as_bytes());
    let mut message = format!("niu.encryption-rotation.{role}.v1").into_bytes();
    message.extend_from_slice(operation.as_bytes());
    let tag = ring::hmac::sign(&key, &message);
    let mut result = [0; 32];
    result.copy_from_slice(tag.as_ref());
    result
}

pub(crate) async fn run() -> Result<(), Failure> {
    if std::env::var("NIU_ENCRYPTION_MAINTENANCE_OFFLINE").as_deref() != Ok("1") {
        return Err(
            "Stop all Gateway writers and set NIU_ENCRYPTION_MAINTENANCE_OFFLINE=1 before rotation"
                .into(),
        );
    }
    let source_secret = std::env::var("NIU_VENDOR_ENCRYPTION_KEY")
        .map_err(|_| "Source encryption key is required")?;
    let target_secret = std::env::var("NIU_VENDOR_ENCRYPTION_KEY_NEXT")
        .map_err(|_| "Destination encryption key is required")?;
    if source_secret == target_secret {
        return Err("Source and destination keys must differ".into());
    }
    let source = CredentialCipher::new(&source_secret)?;
    let target = CredentialCipher::new(&target_secret)?;
    let database = std::env::var("NIU_DATABASE_URL").map_err(|_| "NIU_DATABASE_URL is required")?;
    let store = Store::connect_encryption_maintenance(&database)
        .await
        .map_err(|_| "Cannot open matching maintenance schema; use the matching migrated binary")?;
    let mut lease = store
        .claim_encryption_rotation()
        .await
        .map_err(|_| "Another encryption maintenance command owns this database")?;
    let operation = store
        .unfinished_encryption_rotation()
        .await
        .map_err(|_| "Cannot inspect unfinished encryption maintenance")?
        .unwrap_or_else(Uuid::new_v4);
    let mut inventory = Inventory {
        store: &store,
        source: &source,
        target: &target,
        rotation: None,
        lease: &mut lease,
        phase: Phase::Preflight,
        replaced: 0,
    };
    inventory.scan().await?;
    let rotation = store.begin_encryption_rotation(operation,
        key_check(&source_secret, operation, "source"), key_check(&target_secret, operation, "target"))
        .await.map_err(|_| "Cannot resume this key transition; retain the original source and destination keys")?;
    inventory.rotation = Some(&rotation);
    inventory.phase = Phase::Replace;
    inventory.scan().await?;
    inventory.phase = Phase::Verify;
    inventory.scan().await?;
    crate::vendors::validate_saved_codex_credentials(&store, Some(&target)).await?;
    crate::vendors::validate_saved_credentials(&store, Some(&target)).await?;
    crate::payments::validate_saved_configuration(&store, Some(&target)).await?;
    crate::vendors::validate_retained_content(&store, Some(&target)).await?;
    inventory
        .lease
        .ensure_connected()
        .await
        .map_err(|_| "Encryption maintenance ownership connection was lost")?;
    store
        .complete_encryption_rotation(&rotation)
        .await
        .map_err(|_| "Cannot commit encryption maintenance completion; retain both keys")?;
    println!(
        "Encryption rotation completed; {} envelopes replaced in this invocation. Configure only the destination key before starting the Gateway. Retain the source key with backups that still require it.",
        inventory.replaced
    );
    Ok(())
}
