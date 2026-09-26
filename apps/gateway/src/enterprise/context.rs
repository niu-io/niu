use std::{
    env,
    sync::Arc,
    time::{SystemTime, UNIX_EPOCH},
};

use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use ring::signature::Ed25519KeyPair;
use serde_json::json;
use sha2::{Digest, Sha256};
use uuid::Uuid;

use super::manifest::{EnterpriseError, RoutePermission};

const SIGNING_KEY_ENV: &str = "NIU_ENTERPRISE_SIGNING_KEY";
const SIGNING_KID_ENV: &str = "NIU_ENTERPRISE_SIGNING_KEY_ID";
const ISSUER: &str = "https://niu.io";
const CONTEXT_TTL_SECONDS: u64 = 60;

pub(super) struct SignedRequestContext<'a> {
    pub(super) audience: &'a str,
    pub(super) operator: niu_storage::OperatorPrincipal,
    pub(super) permission: RoutePermission,
    pub(super) method: &'a axum::http::Method,
    pub(super) path: &'a str,
    pub(super) request_id: &'a str,
    pub(super) body: &'a [u8],
}

pub(super) struct ContextSigner {
    key: Arc<Ed25519KeyPair>,
    kid: String,
}

impl ContextSigner {
    pub(super) fn from_env() -> Result<Self, EnterpriseError> {
        let encoded_seed = env::var(SIGNING_KEY_ENV).map_err(|_| {
            EnterpriseError(format!(
                "{SIGNING_KEY_ENV} must contain a base64url Ed25519 seed when an Enterprise manifest is configured"
            ))
        })?;
        let seed = URL_SAFE_NO_PAD.decode(encoded_seed.as_bytes()).map_err(|_| {
            EnterpriseError(format!(
                "{SIGNING_KEY_ENV} must be unpadded base64url encoding of a 32-byte Ed25519 seed"
            ))
        })?;
        if seed.len() != 32 {
            return Err(EnterpriseError(format!(
                "{SIGNING_KEY_ENV} must decode to exactly 32 bytes"
            )));
        }
        let key = Ed25519KeyPair::from_seed_unchecked(&seed).map_err(|_| {
            EnterpriseError(format!("{SIGNING_KEY_ENV} is not a valid Ed25519 seed"))
        })?;
        let kid = env::var(SIGNING_KID_ENV).map_err(|_| {
            EnterpriseError(format!(
                "{SIGNING_KID_ENV} is required when an Enterprise manifest is configured"
            ))
        })?;
        validate_kid(&kid)?;
        Ok(Self {
            key: Arc::new(key),
            kid,
        })
    }

    #[cfg(test)]
    pub(super) fn from_seed(seed: &[u8; 32], kid: String) -> Self {
        Self {
            key: Arc::new(Ed25519KeyPair::from_seed_unchecked(seed).unwrap()),
            kid,
        }
    }

    pub(super) fn sign(&self, context: SignedRequestContext<'_>) -> Result<String, ()> {
        let iat = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|_| ())?
            .as_secs();
        let header = json!({"alg":"EdDSA", "kid":self.kid, "typ":"JWT"});
        let mut payload = json!({
            "iss": ISSUER,
            "aud": context.audience,
            "sub": context.operator.id.to_string(),
            "iat": iat,
            "exp": iat + CONTEXT_TTL_SECONDS,
            "jti": Uuid::new_v4().to_string(),
            "niu": {
                "organization_id": context.operator.scope.organization_id.to_string(),
                "role": match context.operator.role {
                    niu_storage::OperatorRole::Owner => "owner",
                    niu_storage::OperatorRole::Admin => "admin",
                    niu_storage::OperatorRole::Viewer => "viewer",
                },
                "permission": context.permission.as_str(),
                "method": context.method.as_str(),
                "path": context.path,
                "request_id": context.request_id,
                "body_sha256": hex_digest(context.body),
            }
        });
        if let Some(project_id) = context.operator.scope.project_id {
            payload["niu"]["project_id"] = json!(project_id.to_string());
        }
        let encoded_header = URL_SAFE_NO_PAD.encode(serde_json::to_vec(&header).map_err(|_| ())?);
        let encoded_payload = URL_SAFE_NO_PAD.encode(serde_json::to_vec(&payload).map_err(|_| ())?);
        let signing_input = format!("{encoded_header}.{encoded_payload}");
        let signature = self.key.sign(signing_input.as_bytes());
        Ok(format!(
            "{signing_input}.{}",
            URL_SAFE_NO_PAD.encode(signature.as_ref())
        ))
    }
}

fn validate_kid(kid: &str) -> Result<(), EnterpriseError> {
    if kid.is_empty()
        || kid.len() > 100
        || !kid
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'.' | b'-'))
    {
        return Err(EnterpriseError(format!(
            "{SIGNING_KID_ENV} must be 1 to 100 alphanumeric, dot, underscore, or hyphen characters"
        )));
    }
    Ok(())
}

fn hex_digest(body: &[u8]) -> String {
    let digest = Sha256::digest(body);
    digest.iter().map(|byte| format!("{byte:02x}")).collect()
}
