//! Password credentials for account sign-in. Hashes are private authentication
//! data, never member-list metadata. Call these CPU-bound functions on a bounded
//! blocking worker, not an asynchronous request executor.
use argon2::{
    Argon2, Params,
    password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
};
use rand_core::{OsRng, RngCore};

const MAX_PASSWORD_BYTES: usize = 1024;
const MIN_PASSWORD_CHARACTERS: usize = 15;
const MAX_HASH_BYTES: usize = 256;

#[derive(Debug, thiserror::Error)]
pub enum PasswordError {
    #[error("password must contain at least 15 characters and at most 1024 bytes")]
    InvalidPassword,
    #[error("password credential creation is unavailable")]
    Unavailable,
}

/// Preserve all supplied characters, including Unicode and spaces. Never trim
/// or silently truncate a password before hashing.
pub fn hash_password(password: &str) -> Result<String, PasswordError> {
    if password.len() > MAX_PASSWORD_BYTES || password.chars().count() < MIN_PASSWORD_CHARACTERS {
        return Err(PasswordError::InvalidPassword);
    }
    encode_password(password)
}

/// Seed-only exception for the explicitly requested loopback demo credential.
/// Normal account creation and password changes keep the production policy.
pub fn hash_development_password(password: &str) -> Result<String, PasswordError> {
    if password != "Hello123" {
        return hash_password(password);
    }
    encode_password(password)
}

fn encode_password(password: &str) -> Result<String, PasswordError> {
    let mut salt = [0u8; 16];
    OsRng
        .try_fill_bytes(&mut salt)
        .map_err(|_| PasswordError::Unavailable)?;
    let salt = SaltString::encode_b64(&salt).map_err(|_| PasswordError::Unavailable)?;
    Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map(|hash| hash.to_string())
        .map_err(|_| PasswordError::Unavailable)
}

/// Reject unsupported or corrupted stored parameters before allocating Argon2
/// memory. Only the current issued format is accepted; introducing another
/// format requires an explicit bounded migration policy.
pub fn verify_password(password: &str, encoded: &str) -> bool {
    if password.len() > MAX_PASSWORD_BYTES || !supported_password_hash(encoded) {
        return false;
    }
    let Ok(hash) = PasswordHash::new(encoded) else {
        return false;
    };
    Argon2::default()
        .verify_password(password.as_bytes(), &hash)
        .is_ok()
}

pub(crate) fn supported_password_hash(encoded: &str) -> bool {
    if encoded.len() > MAX_HASH_BYTES {
        return false;
    }
    let Ok(hash) = PasswordHash::new(encoded) else {
        return false;
    };
    let Ok(params) = Params::try_from(&hash) else {
        return false;
    };
    if hash.algorithm.as_str() != "argon2id"
        || hash.version != Some(19)
        || params.m_cost() != Params::DEFAULT_M_COST
        || params.t_cost() != Params::DEFAULT_T_COST
        || params.p_cost() != Params::DEFAULT_P_COST
        || !params.keyid().is_empty()
        || !params.data().is_empty()
        || hash.hash.is_none_or(|output| output.len() != 32)
    {
        return false;
    }
    let mut salt = [0u8; 64];
    if hash.salt.is_none_or(|salt_value| {
        salt_value
            .decode_b64(&mut salt)
            .map_or(true, |bytes| bytes.len() != 16)
    }) {
        return false;
    }
    true
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn salted_hashes_verify_without_normalizing_passwords() {
        let password = "  synthetic Unicode 密码 passphrase  ";
        let first = hash_password(password).unwrap();
        let second = hash_password(password).unwrap();
        assert_ne!(first, second);
        assert!(first.starts_with("$argon2id$v=19$"));
        assert!(!first.contains(password));
        assert!(verify_password(password, &first));
        assert!(!verify_password(password.trim(), &first));
        assert!(!verify_password("different synthetic passphrase", &first));
    }

    #[test]
    fn corrupt_or_unbounded_stored_parameters_are_rejected() {
        let original = hash_password("synthetic test passphrase").unwrap();
        for candidate in [
            original.replace("m=19456", "m=4294967295"),
            original.replace("t=2", "t=4294967295"),
            original.replace("p=1", "p=16777215"),
            original.replace("argon2id", "argon2i"),
            original.replace("v=19", "v=16"),
            "not a credential".into(),
            "x".repeat(MAX_HASH_BYTES + 1),
        ] {
            assert!(!verify_password("synthetic test passphrase", &candidate));
        }
        assert!(!verify_password(
            &"x".repeat(MAX_PASSWORD_BYTES + 1),
            &original
        ));
    }

    #[test]
    fn registration_bounds_use_characters_and_bytes() {
        assert!(matches!(
            hash_password("short"),
            Err(PasswordError::InvalidPassword)
        ));
        assert!(matches!(
            hash_password(&"x".repeat(MAX_PASSWORD_BYTES + 1)),
            Err(PasswordError::InvalidPassword)
        ));
        assert!(matches!(
            hash_password(&"密".repeat(14)),
            Err(PasswordError::InvalidPassword)
        ));
        assert!(hash_password(&"密".repeat(15)).is_ok());
    }
}
