use std::{
    env,
    sync::Arc,
    time::{SystemTime, UNIX_EPOCH},
};

use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use niu_plugin_api::RouteAuthMode;
use ring::signature::Ed25519KeyPair;
use serde_json::json;
use sha2::{Digest, Sha256};
use uuid::Uuid;

use super::manifest::{EnterpriseError, RoutePermission};

const PLUGIN_SIGNING_KEY_ENV: &str = "NIU_PLUGIN_SIGNING_KEY";
const SIGNING_KEY_ENV: &str = "NIU_ENTERPRISE_SIGNING_KEY";
const PLUGIN_SIGNING_KID_ENV: &str = "NIU_PLUGIN_SIGNING_KEY_ID";
const SIGNING_KID_ENV: &str = "NIU_ENTERPRISE_SIGNING_KEY_ID";
const ISSUER: &str = "https://niu.io";
const CONTEXT_TTL_SECONDS: u64 = 60;

#[derive(Clone, Debug)]
pub(super) enum ContextPrincipal {
    Operator(niu_storage::OperatorPrincipal),
    InstallationAdmin,
    WorkspaceKey {
        key_id: Uuid,
        organization_id: Uuid,
        project_id: Uuid,
    },
    PublicCallback,
    OutboxSystem {
        organization_id: Uuid,
        project_id: Option<Uuid>,
    },
}

pub(super) struct SignedPluginRequestContext<'a> {
    pub(super) audience: &'a str,
    pub(super) principal: ContextPrincipal,
    pub(super) permission: RoutePermission,
    pub(super) auth_mode: RouteAuthMode,
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
        let encoded_seed = env::var(PLUGIN_SIGNING_KEY_ENV)
            .or_else(|_| env::var(SIGNING_KEY_ENV))
            .map_err(|_| {
                EnterpriseError(format!(
                    "{SIGNING_KEY_ENV} (or {PLUGIN_SIGNING_KEY_ENV}) must contain a base64url Ed25519 seed when a Plugin/Enterprise manifest is configured"
                ))
            })?;
        let seed = URL_SAFE_NO_PAD
            .decode(encoded_seed.as_bytes())
            .map_err(|_| {
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
        let kid = env::var(PLUGIN_SIGNING_KID_ENV)
            .or_else(|_| env::var(SIGNING_KID_ENV))
            .map_err(|_| {
                EnterpriseError(format!(
                    "{SIGNING_KID_ENV} (or {PLUGIN_SIGNING_KID_ENV}) is required when a Plugin/Enterprise manifest is configured"
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

    pub(super) fn sign_plugin(
        &self,
        context: SignedPluginRequestContext<'_>,
    ) -> Result<String, ()> {
        let iat = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|_| ())?
            .as_secs();
        let header = json!({"alg":"EdDSA", "kid":self.kid, "typ":"JWT"});

        let (sub, org_id, project_id, role_str) = match &context.principal {
            ContextPrincipal::Operator(op) => (
                op.id.to_string(),
                Some(op.scope.organization_id.to_string()),
                op.scope.project_id.map(|id| id.to_string()),
                match op.role {
                    niu_storage::OperatorRole::Owner => "owner",
                    niu_storage::OperatorRole::Admin => "admin",
                    niu_storage::OperatorRole::Viewer => "viewer",
                },
            ),
            ContextPrincipal::InstallationAdmin => (
                "installation-admin".to_owned(),
                None,
                None,
                "installation_admin",
            ),
            ContextPrincipal::WorkspaceKey {
                key_id,
                organization_id,
                project_id,
            } => (
                key_id.to_string(),
                Some(organization_id.to_string()),
                Some(project_id.to_string()),
                "workspace_key",
            ),
            ContextPrincipal::PublicCallback => {
                ("public-callback".to_owned(), None, None, "public_callback")
            }
            ContextPrincipal::OutboxSystem {
                organization_id,
                project_id,
            } => (
                "niu-outbox".to_owned(),
                Some(organization_id.to_string()),
                project_id.map(|id| id.to_string()),
                "system",
            ),
        };

        let mut payload = json!({
            "iss": ISSUER,
            "aud": context.audience,
            "sub": sub,
            "iat": iat,
            "exp": iat + CONTEXT_TTL_SECONDS,
            "jti": Uuid::new_v4().to_string(),
            "niu": {
                "role": role_str,
                "permission": context.permission.as_str(),
                "auth_mode": context.auth_mode.as_str(),
                "method": context.method.as_str(),
                "path": context.path,
                "request_id": context.request_id,
                "body_sha256": hex_digest(context.body),
            }
        });
        if let Some(org_id) = org_id {
            payload["niu"]["organization_id"] = json!(org_id);
        }
        if let Some(project_id) = project_id {
            payload["niu"]["project_id"] = json!(project_id);
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
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let digest = Sha256::digest(body);
    let mut encoded = String::with_capacity(digest.len() * 2);
    for byte in digest {
        encoded.push(HEX[(byte >> 4) as usize] as char);
        encoded.push(HEX[(byte & 0x0f) as usize] as char);
    }
    encoded
}
