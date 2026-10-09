//! Original bounded signing for fixed Ark ordinary-asset management actions.
//! Protocol reference: Volcengine SDK signv4.py, commit
//! 629d09880eff23a283a2af1dd98b65294776e614. No upstream source is embedded.
use crate::asset_group::OrdinaryAssetGroupCreate;
use hmac::{Hmac, Mac};
use reqwest::header::{AUTHORIZATION, CONTENT_TYPE, HOST, HeaderMap, HeaderValue};
use sha2::{Digest, Sha256};

const HOSTNAME: &str = "ark.cn-beijing.volcengineapi.com";
const SIGNED_HEADERS: &str = "content-type;host;x-content-sha256;x-date";
pub const CREATE_GROUP_URL: &str =
    "https://ark.cn-beijing.volcengineapi.com/?Action=CreateAssetGroup&Version=2024-01-01";

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct SigningError;

/// Deliberately has no Debug implementation: credentials must not enter logs.
pub struct AssetManagementSigner {
    access_key: String,
    secret_key: String,
}

/// Authorization and the asset description must not enter diagnostic logs.
pub struct SignedGroupCreate {
    pub headers: HeaderMap,
    pub body: Vec<u8>,
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn mac(key: &[u8], message: &[u8]) -> Result<Vec<u8>, SigningError> {
    let mut mac = Hmac::<Sha256>::new_from_slice(key).map_err(|_| SigningError)?;
    mac.update(message);
    Ok(mac.finalize().into_bytes().to_vec())
}

impl AssetManagementSigner {
    pub fn new(access_key: String, secret_key: String) -> Result<Self, SigningError> {
        if access_key.is_empty()
            || access_key.len() > 256
            || !access_key
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
            || secret_key.is_empty()
            || secret_key.len() > 4096
            || secret_key.chars().any(char::is_control)
        {
            return Err(SigningError);
        }
        Ok(Self {
            access_key,
            secret_key,
        })
    }

    /// Signs only the validated ordinary-group body, fixed endpoint and action.
    /// The caller supplies a fresh UTC timestamp; this function does not dispatch.
    pub fn sign_create_group(
        &self,
        timestamp: &str,
        request: &OrdinaryAssetGroupCreate,
        upstream_project: &str,
    ) -> Result<SignedGroupCreate, SigningError> {
        self.sign_body(
            timestamp,
            "CreateAssetGroup",
            request.body(upstream_project).map_err(|_| SigningError)?,
        )
    }

    /// Fixed read action; callers must authorize the saved original group/account.
    pub fn sign_get_group(
        &self,
        timestamp: &str,
        request: &crate::asset_read::OrdinaryGroupRead,
    ) -> Result<SignedGroupCreate, SigningError> {
        self.sign_body(timestamp, "GetAssetGroup", request.body())
    }

    /// Fixed listing action, restricted to one ordinary group and original project.
    pub fn sign_list_assets(
        &self,
        timestamp: &str,
        request: &crate::asset_list::OrdinaryAssetList,
    ) -> Result<SignedGroupCreate, SigningError> {
        self.sign_body(timestamp, "ListAssets", request.body())
    }

    /// Fixed asset lookup; qualification and original-account handoff are caller-owned.
    pub fn sign_get_asset(
        &self,
        timestamp: &str,
        request: &crate::asset_lookup::OrdinaryAssetRead,
    ) -> Result<SignedGroupCreate, SigningError> {
        self.sign_body(timestamp, "GetAsset", request.body())
    }

    /// Fixed metadata-only action; caller owns original-account qualification.
    pub fn sign_update_group(
        &self,
        timestamp: &str,
        request: &crate::asset_group_update::OrdinaryGroupUpdate,
    ) -> Result<SignedGroupCreate, SigningError> {
        self.sign_body(timestamp, "UpdateAssetGroup", request.body())
    }

    /// Irreversible cascading deletion. Caller must authorize this exact action,
    /// ordinary group, original account and an explicit destructive confirmation.
    pub fn sign_delete_group(
        &self,
        timestamp: &str,
        request: &crate::asset_group_delete::OrdinaryGroupDelete,
    ) -> Result<SignedGroupCreate, SigningError> {
        self.sign_body(timestamp, "DeleteAssetGroup", request.body())
    }

    /// Fixed CreateAsset action; validation alone does not authorize dispatch.
    pub fn sign_create_asset(
        &self,
        timestamp: &str,
        request: &crate::asset_create::OrdinaryAssetCreate,
    ) -> Result<SignedGroupCreate, SigningError> {
        self.sign_body(timestamp, "CreateAsset", request.body())
    }

    fn sign_body(
        &self,
        timestamp: &str,
        action: &str,
        value: serde_json::Value,
    ) -> Result<SignedGroupCreate, SigningError> {
        if timestamp.len() != 16
            || !timestamp
                .bytes()
                .enumerate()
                .all(|(index, byte)| match index {
                    8 => byte == b'T',
                    15 => byte == b'Z',
                    _ => byte.is_ascii_digit(),
                })
        {
            return Err(SigningError);
        }
        // A correctly shaped header can still contain an impossible date/time.
        chrono::NaiveDateTime::parse_from_str(timestamp, "%Y%m%dT%H%M%SZ")
            .map_err(|_| SigningError)?;
        // Keep serialized bytes stable even when another crate enables
        // serde_json's preserve_order feature through dependency unification.
        let fields: std::collections::BTreeMap<_, _> =
            value.as_object().ok_or(SigningError)?.iter().collect();
        let body = serde_json::to_vec(&fields).map_err(|_| SigningError)?;
        let body_hash = hex(&Sha256::digest(&body));
        let canonical_headers = format!(
            "content-type:application/json\nhost:{HOSTNAME}\nx-content-sha256:{body_hash}\nx-date:{timestamp}\n"
        );
        let canonical = format!(
            "POST\n/\nAction={action}&Version=2024-01-01\n{canonical_headers}\n{SIGNED_HEADERS}\n{body_hash}"
        );
        let date = &timestamp[..8];
        let scope = format!("{date}/cn-beijing/ark/request");
        let to_sign = format!(
            "HMAC-SHA256\n{timestamp}\n{scope}\n{}",
            hex(&Sha256::digest(canonical.as_bytes()))
        );
        let mut key = self.secret_key.as_bytes().to_vec();
        for component in [date, "cn-beijing", "ark", "request"] {
            key = mac(&key, component.as_bytes())?;
        }
        let signature = hex(&mac(&key, to_sign.as_bytes())?);
        let mut authorization = HeaderValue::from_str(&format!("HMAC-SHA256 Credential={}/{scope}, SignedHeaders={SIGNED_HEADERS}, Signature={signature}", self.access_key)).map_err(|_| SigningError)?;
        authorization.set_sensitive(true);
        let mut headers = HeaderMap::new();
        headers.insert(AUTHORIZATION, authorization);
        headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
        headers.insert(HOST, HeaderValue::from_static(HOSTNAME));
        headers.insert(
            "x-date",
            HeaderValue::from_str(timestamp).map_err(|_| SigningError)?,
        );
        headers.insert(
            "x-content-sha256",
            HeaderValue::from_str(&body_hash).map_err(|_| SigningError)?,
        );
        Ok(SignedGroupCreate { headers, body })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn signer() -> AssetManagementSigner {
        AssetManagementSigner::new("AKEXAMPLE".into(), "fixture-secret-not-a-credential".into())
            .unwrap()
    }

    #[test]
    fn signature_matches_official_sdk_fixture() {
        let request = OrdinaryAssetGroupCreate::new("fixture".into(), None).unwrap();
        let signed = signer()
            .sign_create_group("20261007T120000Z", &request, "default")
            .unwrap();
        assert_eq!(
            signed.body,
            br#"{"GroupType":"AIGC","Name":"fixture","ProjectName":"default"}"#
        );
        assert_eq!(
            signed.headers["x-content-sha256"],
            "96937d358b6766ea86676b1f93ea01462fa12b19457eea975a835c6e4750eefb"
        );
        assert_eq!(
            signed.headers[AUTHORIZATION],
            "HMAC-SHA256 Credential=AKEXAMPLE/20261007/cn-beijing/ark/request, SignedHeaders=content-type;host;x-content-sha256;x-date, Signature=4e8057129af0bbc35f108f38006f0a921b68d7af198bca0f7375cba1541bdb35"
        );
        assert!(signed.headers[AUTHORIZATION].is_sensitive());
        assert!(!format!("{:?}", signed.headers).contains("AKEXAMPLE"));
    }

    #[test]
    fn invalid_timestamp_and_project_cannot_be_signed() {
        let request = OrdinaryAssetGroupCreate::new("fixture".into(), None).unwrap();
        for timestamp in [
            "",
            "20261007T120000Z\n",
            "20261007t120000Z",
            "２０２６1007T120000Z",
        ] {
            assert!(
                signer()
                    .sign_create_group(timestamp, &request, "default")
                    .is_err()
            );
        }
        assert!(
            signer()
                .sign_create_group("20261007T120000Z", &request, "")
                .is_err()
        );
    }

    #[test]
    fn impossible_calendar_values_are_rejected_before_signing() {
        let request = OrdinaryAssetGroupCreate::new("fixture".into(), None).unwrap();
        for timestamp in [
            "20260229T120000Z",
            "20261301T120000Z",
            "20260431T120000Z",
            "20261007T240000Z",
            "20261007T126000Z",
            "20261000T120000Z",
        ] {
            assert!(
                signer()
                    .sign_create_group(timestamp, &request, "default")
                    .is_err()
            );
        }
        assert!(
            signer()
                .sign_create_group("20240229T235959Z", &request, "default")
                .is_ok()
        );
    }

    #[test]
    fn signing_binds_body_and_project() {
        let request = OrdinaryAssetGroupCreate::new("fixture".into(), None).unwrap();
        let first = signer()
            .sign_create_group("20261007T120000Z", &request, "first")
            .unwrap();
        let second = signer()
            .sign_create_group("20261007T120000Z", &request, "second")
            .unwrap();
        assert_ne!(first.headers[AUTHORIZATION], second.headers[AUTHORIZATION]);
        assert!(AssetManagementSigner::new("bad/key".into(), "fixture".into()).is_err());
        assert!(AssetManagementSigner::new("AKEXAMPLE".into(), "".into()).is_err());
    }
}
