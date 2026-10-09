use ring::{
    aead,
    rand::{SecureRandom, SystemRandom},
};
use sha2::{Digest, Sha256};
use uuid::Uuid;

/// Encryption material is supplied by the deployment, never the database.
/// Do not derive Debug or Serialize for this type.
pub struct CredentialCipher(aead::LessSafeKey);

impl CredentialCipher {
    pub fn new(master_secret: &str) -> Result<Self, &'static str> {
        if master_secret.len() < 32
            || master_secret.trim() != master_secret
            || master_secret.starts_with("replace-")
            || master_secret.chars().any(char::is_control)
        {
            return Err(
                "NIU_VENDOR_ENCRYPTION_KEY must be a high-entropy secret of at least 32 characters",
            );
        }
        let key = Sha256::digest(master_secret.as_bytes());
        let unbound = aead::UnboundKey::new(&aead::AES_256_GCM, &key)
            .map_err(|_| "vendor encryption is unavailable")?;
        Ok(Self(aead::LessSafeKey::new(unbound)))
    }

    /// Separate domain and exact revision/project binding from inference keys.
    pub fn seal_asset_management(
        &self,
        vendor: Uuid,
        revision: i64,
        project: &str,
        access_key: &str,
        secret_key: &str,
    ) -> Result<Vec<u8>, &'static str> {
        niu_media::asset_signing::AssetManagementSigner::new(access_key.into(), secret_key.into())
            .map_err(|_| "invalid asset management credentials")?;
        let aad = Self::asset_management_aad(vendor, revision, project)?;
        let record = serde_json::json!({"access_key":access_key,"secret_key":secret_key});
        let record =
            serde_json::to_string(&record).map_err(|_| "asset credential encryption failed")?;
        let ciphertext = self.seal_with_aad(&aad, &record)?;
        self.open_asset_management(vendor, revision, project, &ciphertext)?;
        Ok(ciphertext)
    }

    /// Decode only the exact management domain and binding into a non-debuggable
    /// signer. No inference-key fallback and no plaintext credential response.
    pub fn open_asset_management(
        &self,
        vendor: Uuid,
        revision: i64,
        project: &str,
        ciphertext: &[u8],
    ) -> Result<niu_media::asset_signing::AssetManagementSigner, &'static str> {
        #[derive(serde::Deserialize)]
        #[serde(deny_unknown_fields)]
        struct Record {
            access_key: String,
            secret_key: String,
        }
        let aad = Self::asset_management_aad(vendor, revision, project)?;
        let plaintext = self
            .open_with_aad(&aad, ciphertext)
            .map_err(|_| "asset credential decoding failed")?;
        let record: Record =
            serde_json::from_str(&plaintext).map_err(|_| "asset credential decoding failed")?;
        niu_media::asset_signing::AssetManagementSigner::new(record.access_key, record.secret_key)
            .map_err(|_| "asset credential decoding failed")
    }

    fn asset_management_aad(
        vendor: Uuid,
        revision: i64,
        project: &str,
    ) -> Result<Vec<u8>, &'static str> {
        if revision <= 0
            || project.is_empty()
            || project.trim() != project
            || project.chars().count() > 1024
            || project.chars().any(char::is_control)
        {
            return Err("invalid asset management binding");
        }
        let mut aad = b"niu.asset-management-credentials.v1".to_vec();
        aad.extend_from_slice(vendor.as_bytes());
        aad.extend_from_slice(&revision.to_be_bytes());
        aad.extend_from_slice(project.as_bytes());
        Ok(aad)
    }

    #[cfg(test)]
    pub(crate) fn open_asset_management_fixture(
        &self,
        vendor: Uuid,
        revision: i64,
        project: &str,
        ciphertext: &[u8],
    ) -> Result<serde_json::Value, &'static str> {
        let aad = Self::asset_management_aad(vendor, revision, project)?;
        let value = self.open_with_aad(&aad, ciphertext)?;
        serde_json::from_str(&value).map_err(|_| "asset credential decoding failed")
    }

    pub(crate) fn seal_payment_configuration(&self, value: &str) -> Result<Vec<u8>, &'static str> {
        if value.len() > 16384 {
            return Err("Payment configuration is too large");
        }
        self.seal_with_aad(b"niu.payment-configuration.epay.v1", value)
    }
    pub(crate) fn open_payment_configuration(&self, value: &[u8]) -> Result<String, &'static str> {
        self.open_with_aad(b"niu.payment-configuration.epay.v1", value)
    }

    pub fn seal(&self, vendor: Uuid, credential: &str) -> Result<Vec<u8>, &'static str> {
        self.seal_bounded(vendor, credential, 8192)
    }

    pub(crate) fn seal_asset_listing_result(
        &self,
        scope: niu_storage::TenantScope,
        listing: Uuid,
        value: &str,
    ) -> Result<Vec<u8>, &'static str> {
        if value.is_empty() || value.len() > 128000 {
            return Err("asset listing encryption failed");
        }
        self.seal_with_aad(&Self::asset_listing_aad(scope, listing), value)
    }
    pub(crate) fn open_asset_listing_result(
        &self,
        scope: niu_storage::TenantScope,
        listing: Uuid,
        value: &[u8],
    ) -> Result<String, &'static str> {
        if !(30..=131072).contains(&value.len()) {
            return Err("asset listing decoding failed");
        }
        self.open_with_aad(&Self::asset_listing_aad(scope, listing), value)
            .map_err(|_| "asset listing decoding failed")
    }
    fn asset_listing_aad(scope: niu_storage::TenantScope, listing: Uuid) -> Vec<u8> {
        let mut aad = b"niu.asset-listing-result.v1".to_vec();
        aad.extend_from_slice(scope.organization_id.as_bytes());
        aad.extend_from_slice(scope.project_id.as_bytes());
        aad.extend_from_slice(listing.as_bytes());
        aad
    }
    pub(crate) fn seal_asset_lookup_result(
        &self,
        scope: niu_storage::TenantScope,
        lookup: Uuid,
        value: &str,
    ) -> Result<Vec<u8>, &'static str> {
        if value.is_empty() || value.len() > 128000 {
            return Err("asset lookup encryption failed");
        }
        self.seal_with_aad(&Self::asset_lookup_aad(scope, lookup), value)
    }
    pub(crate) fn open_asset_lookup_result(
        &self,
        scope: niu_storage::TenantScope,
        lookup: Uuid,
        value: &[u8],
    ) -> Result<String, &'static str> {
        if !(30..=131072).contains(&value.len()) {
            return Err("asset lookup decoding failed");
        }
        self.open_with_aad(&Self::asset_lookup_aad(scope, lookup), value)
            .map_err(|_| "asset lookup decoding failed")
    }
    fn asset_lookup_aad(scope: niu_storage::TenantScope, lookup: Uuid) -> Vec<u8> {
        let mut aad = b"niu.asset-lookup-result.v1".to_vec();
        aad.extend_from_slice(scope.organization_id.as_bytes());
        aad.extend_from_slice(scope.project_id.as_bytes());
        aad.extend_from_slice(lookup.as_bytes());
        aad
    }

    pub(crate) fn seal_asset_update_patch(
        &self,
        scope: niu_storage::TenantScope,
        update: Uuid,
        value: &str,
    ) -> Result<Vec<u8>, &'static str> {
        if value.is_empty() || value.len() > 8000 {
            return Err("asset update encryption failed");
        }
        let encrypted = self.seal_with_aad(&Self::asset_update_aad(scope, update), value)?;
        self.open_asset_update_patch(scope, update, &encrypted)?;
        Ok(encrypted)
    }
    pub(crate) fn open_asset_update_patch(
        &self,
        scope: niu_storage::TenantScope,
        update: Uuid,
        value: &[u8],
    ) -> Result<String, &'static str> {
        if !(30..=8192).contains(&value.len()) {
            return Err("asset update decoding failed");
        }
        self.open_with_aad(&Self::asset_update_aad(scope, update), value)
            .map_err(|_| "asset update decoding failed")
    }
    fn asset_update_aad(scope: niu_storage::TenantScope, update: Uuid) -> Vec<u8> {
        let mut aad = b"niu.asset-group-update-patch.v1".to_vec();
        aad.extend_from_slice(scope.organization_id.as_bytes());
        aad.extend_from_slice(scope.project_id.as_bytes());
        aad.extend_from_slice(update.as_bytes());
        aad
    }

    pub(crate) fn seal_asset_read_result(
        &self,
        scope: niu_storage::TenantScope,
        read: Uuid,
        value: &str,
    ) -> Result<Vec<u8>, &'static str> {
        if value.is_empty() || value.len() > 8000 {
            return Err("asset read result encryption failed");
        }
        self.seal_with_aad(&Self::asset_read_aad(scope, read), value)
    }
    pub(crate) fn open_asset_read_result(
        &self,
        scope: niu_storage::TenantScope,
        read: Uuid,
        value: &[u8],
    ) -> Result<String, &'static str> {
        self.open_with_aad(&Self::asset_read_aad(scope, read), value)
            .map_err(|_| "asset read result decoding failed")
    }
    fn asset_read_aad(scope: niu_storage::TenantScope, read: Uuid) -> Vec<u8> {
        let mut aad = b"niu.asset-read-result.v1".to_vec();
        aad.extend_from_slice(scope.organization_id.as_bytes());
        aad.extend_from_slice(scope.project_id.as_bytes());
        aad.extend_from_slice(read.as_bytes());
        aad
    }

    pub(crate) fn seal_media_result(
        &self,
        scope: niu_storage::TenantScope,
        job: Uuid,
        kind: niu_storage::MediaResultKind,
        url: &str,
    ) -> Result<Vec<u8>, &'static str> {
        if url.is_empty()
            || url.len() > 8192
            || url.trim() != url
            || url.chars().any(char::is_control)
        {
            return Err("media result encryption failed");
        }
        self.seal_with_aad(&Self::media_aad(scope, job, kind), url)
    }
    pub fn open_media_result(
        &self,
        scope: niu_storage::TenantScope,
        job: Uuid,
        kind: niu_storage::MediaResultKind,
        value: &[u8],
    ) -> Result<String, &'static str> {
        self.open_with_aad(&Self::media_aad(scope, job, kind), value)
            .map_err(|_| "media result could not be decrypted")
    }
    fn media_aad(
        scope: niu_storage::TenantScope,
        job: Uuid,
        kind: niu_storage::MediaResultKind,
    ) -> Vec<u8> {
        let mut aad = b"niu.media-result.v1".to_vec();
        aad.extend_from_slice(scope.organization_id.as_bytes());
        aad.extend_from_slice(scope.project_id.as_bytes());
        aad.extend_from_slice(job.as_bytes());
        aad.extend_from_slice(kind.as_str().as_bytes());
        aad
    }

    /// A protected OAuth record contains several tokens, not a single API key.
    pub(crate) fn seal_oauth(&self, account: Uuid, record: &str) -> Result<Vec<u8>, &'static str> {
        self.seal_bounded(account, record, 64 * 1024)
    }

    fn seal_bounded(
        &self,
        vendor: Uuid,
        credential: &str,
        limit: usize,
    ) -> Result<Vec<u8>, &'static str> {
        if credential.is_empty()
            || credential.len() > limit
            || credential.chars().any(char::is_control)
            || credential.trim() != credential
        {
            return Err(
                "vendor credential must be nonempty and contain no whitespace padding or control characters",
            );
        }
        self.seal_with_aad(vendor.as_bytes(), credential)
    }

    fn seal_with_aad(&self, aad: &[u8], credential: &str) -> Result<Vec<u8>, &'static str> {
        self.seal_bytes_with_aad(aad, credential.as_bytes())
    }

    /// Binary content uses the same versioned authenticated envelope. Callers
    /// supply a domain-separated binding and enforce their own content bounds.
    pub(crate) fn seal_bytes_with_aad(
        &self,
        aad: &[u8],
        bytes: &[u8],
    ) -> Result<Vec<u8>, &'static str> {
        let mut nonce = [0_u8; 12];
        SystemRandom::new()
            .fill(&mut nonce)
            .map_err(|_| "credential encryption failed")?;
        let mut encrypted = bytes.to_vec();
        self.0
            .seal_in_place_append_tag(
                aead::Nonce::assume_unique_for_key(nonce),
                aead::Aad::from(aad),
                &mut encrypted,
            )
            .map_err(|_| "credential encryption failed")?;
        let mut result = Vec::with_capacity(13 + encrypted.len());
        result.push(1);
        result.extend_from_slice(&nonce);
        result.extend_from_slice(&encrypted);
        Ok(result)
    }

    pub fn open(&self, vendor: Uuid, value: &[u8]) -> Result<String, &'static str> {
        self.open_with_aad(vendor.as_bytes(), value)
    }

    fn open_with_aad(&self, aad: &[u8], value: &[u8]) -> Result<String, &'static str> {
        String::from_utf8(self.open_bytes_with_aad(aad, value)?)
            .map_err(|_| "vendor credential could not be decrypted")
    }

    /// Authentication must complete before any decrypted binary bytes escape.
    pub(crate) fn open_bytes_with_aad(
        &self,
        aad: &[u8],
        value: &[u8],
    ) -> Result<Vec<u8>, &'static str> {
        if value.len() < 30 || value[0] != 1 {
            return Err("vendor credential could not be decrypted");
        }
        let nonce: [u8; 12] = value[1..13]
            .try_into()
            .map_err(|_| "vendor credential could not be decrypted")?;
        let mut encrypted = value[13..].to_vec();
        let plaintext = self
            .0
            .open_in_place(
                aead::Nonce::assume_unique_for_key(nonce),
                aead::Aad::from(aad),
                &mut encrypted,
            )
            .map_err(|_| "vendor credential could not be decrypted")?;
        Ok(plaintext.to_vec())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn binary_source_envelope_is_randomized_and_scope_bound() {
        let cipher =
            CredentialCipher::new("a-test-only-master-key-with-at-least-32-characters").unwrap();
        let binding = |organization, workspace, key, source| {
            niu_storage::inspected_image_source_aad(
                niu_storage::TenantScope {
                    organization_id: organization,
                    project_id: workspace,
                },
                key,
                source,
            )
        };
        let organization = Uuid::new_v4();
        let workspace = Uuid::new_v4();
        let key = Uuid::new_v4();
        let source = Uuid::new_v4();
        let aad = binding(organization, workspace, key, source);
        let bytes = [0, 255, 128, 1, 0, 42, 250];
        let first = cipher.seal_bytes_with_aad(&aad, &bytes).unwrap();
        let second = cipher.seal_bytes_with_aad(&aad, &bytes).unwrap();
        assert_ne!(first, second);
        assert_eq!(cipher.open_bytes_with_aad(&aad, &first).unwrap(), bytes);
        assert!(cipher.open_with_aad(&aad, &first).is_err());
        for changed in [
            binding(Uuid::new_v4(), workspace, key, source),
            binding(organization, Uuid::new_v4(), key, source),
            binding(organization, workspace, Uuid::new_v4(), source),
            binding(organization, workspace, key, Uuid::new_v4()),
            b"niu.other-content.v1".to_vec(),
        ] {
            assert!(cipher.open_bytes_with_aad(&changed, &first).is_err());
        }
        let other =
            CredentialCipher::new("another-test-master-key-of-32-or-more-characters").unwrap();
        assert!(other.open_bytes_with_aad(&aad, &first).is_err());
        let mut tampered = first.clone();
        *tampered.last_mut().unwrap() ^= 1;
        assert!(cipher.open_bytes_with_aad(&aad, &tampered).is_err());
        for malformed in [&first[..12], &first[..first.len() - 1], &[2u8; 30][..]] {
            assert!(cipher.open_bytes_with_aad(&aad, malformed).is_err());
        }
    }

    #[test]
    fn asset_signer_decoding_rejects_conflicting_or_unexpected_records() {
        let cipher =
            CredentialCipher::new("a-test-only-master-key-with-at-least-32-characters").unwrap();
        let vendor = Uuid::new_v4();
        let aad = CredentialCipher::asset_management_aad(vendor, 1, "default").unwrap();
        let encrypted = cipher
            .seal_asset_management(vendor, 1, "default", "AKEXAMPLE", "fixture-secret")
            .unwrap();
        assert!(
            cipher
                .open_asset_management(vendor, 1, "default", &encrypted)
                .is_ok()
        );
        assert!(
            cipher
                .open_asset_management(vendor, 2, "default", &encrypted)
                .is_err()
        );
        assert!(
            cipher
                .open_asset_management(vendor, 1, "other", &encrypted)
                .is_err()
        );
        assert!(
            cipher
                .open_asset_management(Uuid::new_v4(), 1, "default", &encrypted)
                .is_err()
        );
        for record in [
            r#"{"access_key":"AKEXAMPLE","secret_key":"fixture","extra":true}"#,
            r#"{"access_key":"AKEXAMPLE","access_key":"OTHER","secret_key":"fixture"}"#,
            r#"{"access_key":"AKEXAMPLE","secret_key":""}"#,
            r#"{"access_key":null,"secret_key":"fixture"}"#,
        ] {
            let encrypted = cipher.seal_with_aad(&aad, record).unwrap();
            assert!(matches!(
                cipher.open_asset_management(vendor, 1, "default", &encrypted),
                Err("asset credential decoding failed")
            ));
        }
        let bearer = cipher.seal(vendor, "fixture-bearer").unwrap();
        assert!(
            cipher
                .open_asset_management(vendor, 1, "default", &bearer)
                .is_err()
        );
    }

    #[test]
    fn media_results_are_bound_to_tenant_job_kind_and_separate_from_credentials() {
        let cipher =
            CredentialCipher::new("a-test-only-master-key-with-at-least-32-characters").unwrap();
        let scope = niu_storage::TenantScope {
            organization_id: Uuid::new_v4(),
            project_id: Uuid::new_v4(),
        };
        let job = Uuid::new_v4();
        let kind = niu_storage::MediaResultKind::Video;
        let url = "https://media.example/video.mp4?signature=private";
        let encrypted = cipher.seal_media_result(scope, job, kind, url).unwrap();
        assert_eq!(
            cipher
                .open_media_result(scope, job, kind, &encrypted)
                .unwrap(),
            url
        );
        assert!(cipher.open(job, &encrypted).is_err());
        assert!(
            cipher
                .open_media_result(scope, Uuid::new_v4(), kind, &encrypted)
                .is_err()
        );
        assert!(
            cipher
                .open_media_result(
                    scope,
                    job,
                    niu_storage::MediaResultKind::LastFrame,
                    &encrypted
                )
                .is_err()
        );
        assert!(
            cipher
                .open_media_result(
                    niu_storage::TenantScope {
                        project_id: Uuid::new_v4(),
                        ..scope
                    },
                    job,
                    kind,
                    &encrypted
                )
                .is_err()
        );
        assert!(
            cipher
                .open_media_result(
                    niu_storage::TenantScope {
                        organization_id: Uuid::new_v4(),
                        ..scope
                    },
                    job,
                    kind,
                    &encrypted
                )
                .is_err()
        );
        assert!(
            !encrypted
                .windows(url.len())
                .any(|value| value == url.as_bytes())
        );
        let mut tampered = encrypted;
        *tampered.last_mut().unwrap() ^= 1;
        assert!(
            cipher
                .open_media_result(scope, job, kind, &tampered)
                .is_err()
        );
    }

    #[test]
    fn credentials_are_randomized_authenticated_and_bound_to_the_vendor() {
        let cipher =
            CredentialCipher::new("a-test-only-master-key-with-at-least-32-characters").unwrap();
        let id = Uuid::new_v4();
        let first = cipher.seal(id, "test-upstream-key").unwrap();
        let second = cipher.seal(id, "test-upstream-key").unwrap();
        assert_ne!(first, second);
        assert!(
            !first
                .windows(b"test-upstream-key".len())
                .any(|value| value == b"test-upstream-key")
        );
        assert_eq!(cipher.open(id, &first).unwrap(), "test-upstream-key");
        assert!(cipher.open(Uuid::new_v4(), &first).is_err());
        let wrong =
            CredentialCipher::new("another-test-master-key-of-32-or-more-characters").unwrap();
        assert!(wrong.open(id, &first).is_err());
        let mut tampered = first;
        *tampered.last_mut().unwrap() ^= 1;
        assert!(cipher.open(id, &tampered).is_err());
        assert!(cipher.open(id, &[1, 2]).is_err());
        assert!(CredentialCipher::new("short").is_err());
        assert!(cipher.seal(id, "key\n").is_err());
    }
}
