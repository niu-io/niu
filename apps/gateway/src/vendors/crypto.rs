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

    pub fn seal(&self, vendor: Uuid, credential: &str) -> Result<Vec<u8>, &'static str> {
        if credential.is_empty()
            || credential.len() > 8192
            || credential.chars().any(char::is_control)
            || credential.trim() != credential
        {
            return Err(
                "vendor credential must be nonempty and contain no whitespace padding or control characters",
            );
        }
        let mut nonce = [0_u8; 12];
        SystemRandom::new()
            .fill(&mut nonce)
            .map_err(|_| "credential encryption failed")?;
        let mut encrypted = credential.as_bytes().to_vec();
        self.0
            .seal_in_place_append_tag(
                aead::Nonce::assume_unique_for_key(nonce),
                aead::Aad::from(vendor.as_bytes()),
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
                aead::Aad::from(vendor.as_bytes()),
                &mut encrypted,
            )
            .map_err(|_| "vendor credential could not be decrypted")?;
        String::from_utf8(plaintext.to_vec())
            .map_err(|_| "vendor credential could not be decrypted")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

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
