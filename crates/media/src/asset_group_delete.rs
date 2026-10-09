//! Fixed ordinary-group deletion transport, not a customer mutation API.
//! Deletes all assets in the group irreversibly. Callers must separately establish
//! destructive consent, current rights, original account and a durable one-shot
//! claim. Neither validation nor an acknowledgement establishes reconciliation.
use crate::{
    asset_read::{OrdinaryGroupRead, ReadError, signed_read},
    asset_signing::AssetManagementSigner,
};
use serde::Deserialize;
use serde_json::Value;
use std::time::Duration;

const ENDPOINT: &str =
    "https://ark.cn-beijing.volcengineapi.com/?Action=DeleteAssetGroup&Version=2024-01-01";

/// Private scope has no Debug implementation. Construction does not authorize
/// deleting an ordinary group or prove that it is not a real-person group.
pub struct OrdinaryGroupDelete {
    original: OrdinaryGroupRead,
}
impl OrdinaryGroupDelete {
    pub fn new(original: OrdinaryGroupRead) -> Self {
        Self { original }
    }
    pub(crate) fn body(&self) -> Value {
        self.original.body()
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "PascalCase")]
struct Envelope {
    response_metadata: Metadata,
    result: std::collections::BTreeMap<String, Value>,
    error: Option<Value>,
}
#[derive(Deserialize)]
#[serde(rename_all = "PascalCase")]
struct Metadata {
    action: String,
    version: String,
    service: String,
    region: String,
    error: Option<Value>,
}
fn decode(bytes: &[u8]) -> Result<(), ReadError> {
    let envelope: Envelope =
        serde_json::from_slice(bytes).map_err(|_| ReadError::InvalidResponse)?;
    let metadata = envelope.response_metadata;
    if !envelope.result.is_empty()
        || envelope.error.is_some()
        || metadata.error.is_some()
        || metadata.action != "DeleteAssetGroup"
        || metadata.version != "2024-01-01"
        || metadata.service != "ark"
        || metadata.region != "cn-beijing"
    {
        return Err(ReadError::InvalidResponse);
    }
    Ok(())
}

/// One bounded signed POST, without redirects, ambient proxies or retries.
/// Any unacknowledged dispatch remains uncertain, including not-found errors;
/// callers must never turn uncertainty into automatic resubmission or success.
pub async fn delete_group_now(
    signer: &AssetManagementSigner,
    request: &OrdinaryGroupDelete,
    maximum_bytes: usize,
    timeout: Duration,
) -> Result<(), ReadError> {
    if !(1..=1024 * 1024).contains(&maximum_bytes)
        || timeout.is_zero()
        || timeout > Duration::from_secs(30)
    {
        return Err(ReadError::InvalidConfiguration);
    }
    let timestamp = chrono::DateTime::<chrono::Utc>::from(std::time::SystemTime::now())
        .format("%Y%m%dT%H%M%SZ")
        .to_string();
    let signed = signer
        .sign_delete_group(&timestamp, request)
        .map_err(|_| ReadError::InvalidConfiguration)?;
    decode(&signed_read(ENDPOINT, signed, maximum_bytes, timeout).await?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    fn request(id: &str, project: &str) -> OrdinaryGroupDelete {
        OrdinaryGroupDelete::new(OrdinaryGroupRead::new(id.into(), project.into()).unwrap())
    }
    fn acknowledgement() -> Value {
        json!({"ResponseMetadata":{"Action":"DeleteAssetGroup","Version":"2024-01-01","Service":"ark","Region":"cn-beijing"},"Result":{}})
    }
    #[test]
    fn acknowledgement_requires_exact_action_metadata_and_empty_result() {
        let valid = acknowledgement();
        assert!(decode(&serde_json::to_vec(&valid).unwrap()).is_ok());
        for pointer in [
            "/ResponseMetadata/Action",
            "/ResponseMetadata/Version",
            "/ResponseMetadata/Service",
            "/ResponseMetadata/Region",
        ] {
            let mut invalid = valid.clone();
            *invalid.pointer_mut(pointer).unwrap() = json!("wrong");
            assert_eq!(
                decode(&serde_json::to_vec(&invalid).unwrap()),
                Err(ReadError::InvalidResponse)
            );
        }
        for result in [
            Value::Null,
            json!([]),
            json!({"Id":"group-other"}),
            json!(true),
        ] {
            let mut invalid = valid.clone();
            invalid["Result"] = result;
            assert!(decode(&serde_json::to_vec(&invalid).unwrap()).is_err());
        }
        for nested in [false, true] {
            let mut invalid = valid.clone();
            if nested {
                invalid["ResponseMetadata"]["Error"] = json!({"Code":"NotFound"});
            } else {
                invalid["Error"] = json!({"Message":"private upstream failure"});
            }
            assert!(decode(&serde_json::to_vec(&invalid).unwrap()).is_err());
        }
        for bytes in [b"{}".as_slice(), b"null", b"{", b""] {
            assert!(decode(bytes).is_err());
        }
        let duplicate = serde_json::to_string(&valid)
            .unwrap()
            .replace("\"Result\":{}", "\"Result\":{},\"Result\":{}");
        assert!(decode(duplicate.as_bytes()).is_err());
    }
    #[test]
    fn signature_binds_original_identity_project_and_delete_action() {
        let signer =
            AssetManagementSigner::new("AKEXAMPLE".into(), "fixture-secret".into()).unwrap();
        let original = request("group-original", "original-project");
        let signed = signer
            .sign_delete_group("20261009T000000Z", &original)
            .unwrap();
        assert_eq!(
            serde_json::from_slice::<Value>(&signed.body).unwrap(),
            json!({"Id":"group-original","ProjectName":"original-project"})
        );
        for changed in [
            request("group-other", "original-project"),
            request("group-original", "other-project"),
        ] {
            let other = signer
                .sign_delete_group("20261009T000000Z", &changed)
                .unwrap();
            assert_ne!(
                signed.headers["authorization"],
                other.headers["authorization"]
            );
        }
        let read = signer
            .sign_get_group("20261009T000000Z", &original.original)
            .unwrap();
        assert_ne!(
            signed.headers["authorization"],
            read.headers["authorization"]
        );
        assert!(signer.sign_delete_group("invalid", &original).is_err());
    }
    #[tokio::test]
    async fn invalid_bounds_never_dispatch() {
        let signer =
            AssetManagementSigner::new("AKEXAMPLE".into(), "fixture-secret".into()).unwrap();
        for (maximum, timeout) in [
            (0, Duration::from_secs(1)),
            (1024 * 1024 + 1, Duration::from_secs(1)),
            (1, Duration::ZERO),
            (1, Duration::from_secs(31)),
        ] {
            assert_eq!(
                delete_group_now(
                    &signer,
                    &request("group-original", "default"),
                    maximum,
                    timeout
                )
                .await,
                Err(ReadError::InvalidConfiguration)
            );
        }
    }
}
