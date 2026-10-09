//! Ordinary asset request binding, not authorization or inspected-content proof.
//! Never dispatch a mutable source URL in place of the exact approved bytes.
use crate::{
    asset_list::AssetType,
    asset_read::{OrdinaryGroupRead, ReadError, signed_read},
    asset_signing::AssetManagementSigner,
};
use serde::Deserialize;
use serde_json::{Value, json};

/// Private source URL and original upstream scope must not enter logs.
/// The caller must establish ordinary-group provenance, current CreateAsset
/// qualification, processing consent and an immutable inspected source before
/// any dispatch. A syntactically public URL does not establish those properties.
pub struct OrdinaryAssetCreate {
    original: OrdinaryGroupRead,
    source: String,
    asset_type: AssetType,
    name: Option<String>,
}
impl OrdinaryAssetCreate {
    pub fn new(
        original: OrdinaryGroupRead,
        source: String,
        asset_type: AssetType,
        name: Option<String>,
    ) -> Result<Self, ReadError> {
        if !crate::public_https(&source, 8192)
            || name.as_ref().is_some_and(|v| {
                v.trim().is_empty() || v.chars().count() > 64 || v.chars().any(char::is_control)
            })
        {
            return Err(ReadError::InvalidConfiguration);
        }
        // Restrict the handoff contract to normal TLS endpoints. URL parsing
        // alone neither resolves DNS nor prevents remote content replacement.
        let url = url::Url::parse(&source).map_err(|_| ReadError::InvalidConfiguration)?;
        if url.port_or_known_default() != Some(443) {
            return Err(ReadError::InvalidConfiguration);
        }
        Ok(Self {
            original,
            source,
            asset_type,
            name,
        })
    }
    /// Exact private snapshot; encrypt before retention, including signed URLs.
    pub fn encode_private(&self) -> Result<Vec<u8>, ReadError> {
        serde_json::to_vec(&self.body()).map_err(|_| ReadError::InvalidConfiguration)
    }
    /// Reconstruct only the exact original group/project and allowed fields.
    /// Null optional names, duplicate fields and moderation overrides are denied.
    pub fn restore_private(bytes: &[u8], original: OrdinaryGroupRead) -> Result<Self, ReadError> {
        #[derive(Deserialize)]
        #[serde(rename_all = "PascalCase", deny_unknown_fields)]
        struct Saved {
            group_id: String,
            project_name: String,
            #[serde(rename = "URL")]
            source: String,
            asset_type: String,
            name: Option<String>,
        }
        if bytes.is_empty() || bytes.len() > 16384 {
            return Err(ReadError::InvalidConfiguration);
        }
        let saved: Saved =
            serde_json::from_slice(bytes).map_err(|_| ReadError::InvalidConfiguration)?;
        if saved.group_id != original.id || saved.project_name != original.project {
            return Err(ReadError::InvalidConfiguration);
        }
        let kind = match saved.asset_type.as_str() {
            "Image" => AssetType::Image,
            "Video" => AssetType::Video,
            "Audio" => AssetType::Audio,
            _ => return Err(ReadError::InvalidConfiguration),
        };
        let request = Self::new(original, saved.source, kind, saved.name)?;
        let value: Value =
            serde_json::from_slice(bytes).map_err(|_| ReadError::InvalidConfiguration)?;
        if request.body() != value {
            return Err(ReadError::InvalidConfiguration);
        }
        Ok(request)
    }
    pub(crate) fn body(&self) -> Value {
        let kind = match self.asset_type {
            AssetType::Image => "Image",
            AssetType::Video => "Video",
            AssetType::Audio => "Audio",
        };
        let mut value = json!({"GroupId": self.original.id, "ProjectName": self.original.project, "URL": self.source, "AssetType":kind});
        if let Some(name) = &self.name {
            value["Name"] = json!(name);
        }
        value
    }
}

/// Private upstream receipt; acceptance does not imply processing readiness.
/// Deliberately no Debug/Serialize to keep upstream identifiers out of logs/UI.
pub struct AcceptedAsset {
    id: String,
}
impl AcceptedAsset {
    pub fn upstream_id(&self) -> &str {
        &self.id
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "PascalCase")]
struct Envelope {
    response_metadata: Metadata,
    result: Created,
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
#[derive(Deserialize)]
#[serde(rename_all = "PascalCase")]
struct Created {
    id: String,
}
fn decode(bytes: &[u8]) -> Result<AcceptedAsset, ReadError> {
    if bytes.is_empty() || bytes.len() > 1024 * 1024 {
        return Err(ReadError::InvalidResponse);
    }
    let envelope: Envelope =
        serde_json::from_slice(bytes).map_err(|_| ReadError::InvalidResponse)?;
    let metadata = envelope.response_metadata;
    let id = envelope.result.id;
    if envelope.error.is_some()
        || metadata.error.is_some()
        || metadata.action != "CreateAsset"
        || metadata.version != "2024-01-01"
        || metadata.service != "ark"
        || metadata.region != "cn-beijing"
        || !id.starts_with("asset-")
        || id.len() <= 6
        || id.len() > 128
        || !id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_'))
    {
        return Err(ReadError::InvalidResponse);
    }
    Ok(AcceptedAsset { id })
}

/// One fixed bounded signed POST without redirects, ambient proxies or retries.
/// Callers must establish inspected immutable source delivery, current ingestion
/// rights and consent, and a durable one-shot claim before invoking this function.
/// An error after dispatch leaves creation uncertain; never automatically replay.
pub async fn create_asset_now(
    signer: &AssetManagementSigner,
    request: &OrdinaryAssetCreate,
    maximum_bytes: usize,
    timeout: std::time::Duration,
) -> Result<AcceptedAsset, ReadError> {
    if !(1..=1024 * 1024).contains(&maximum_bytes)
        || timeout.is_zero()
        || timeout > std::time::Duration::from_secs(30)
    {
        return Err(ReadError::InvalidConfiguration);
    }
    let timestamp = chrono::DateTime::<chrono::Utc>::from(std::time::SystemTime::now())
        .format("%Y%m%dT%H%M%SZ")
        .to_string();
    let signed = signer
        .sign_create_asset(&timestamp, request)
        .map_err(|_| ReadError::InvalidConfiguration)?;
    decode(
        &signed_read(
            "https://ark.cn-beijing.volcengineapi.com/?Action=CreateAsset&Version=2024-01-01",
            signed,
            maximum_bytes,
            timeout,
        )
        .await?,
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    fn group() -> OrdinaryGroupRead {
        OrdinaryGroupRead::new("group-original".into(), "original-project".into()).unwrap()
    }
    fn acknowledgement() -> Value {
        json!({"ResponseMetadata":{"Action":"CreateAsset","Version":"2024-01-01","Service":"ark","Region":"cn-beijing"},"Result":{"Id":"asset-original"}})
    }
    #[test]
    fn creation_receipt_is_not_a_readiness_result() {
        let valid = acknowledgement();
        assert_eq!(
            decode(&serde_json::to_vec(&valid).unwrap())
                .unwrap()
                .upstream_id(),
            "asset-original"
        );
        for pointer in [
            "/ResponseMetadata/Action",
            "/ResponseMetadata/Version",
            "/ResponseMetadata/Service",
            "/ResponseMetadata/Region",
        ] {
            let mut invalid = valid.clone();
            *invalid.pointer_mut(pointer).unwrap() = json!("wrong");
            assert!(matches!(
                decode(&serde_json::to_vec(&invalid).unwrap()),
                Err(ReadError::InvalidResponse)
            ));
        }
        for id in [
            "",
            "asset-",
            "group-original",
            "asset-a/b",
            "asset-private?token=secret",
            "asset-
private",
        ] {
            let mut invalid = valid.clone();
            invalid["Result"]["Id"] = json!(id);
            assert!(decode(&serde_json::to_vec(&invalid).unwrap()).is_err());
        }
        let mut invalid = valid.clone();
        invalid["Result"]["Id"] = json!(format!("asset-{}", "a".repeat(123)));
        assert!(decode(&serde_json::to_vec(&invalid).unwrap()).is_err());
        for pointer in ["/Error", "/ResponseMetadata/Error"] {
            let mut invalid = valid.clone();
            if pointer == "/Error" {
                invalid["Error"] = json!({"Message":"private upstream error"});
            } else {
                invalid["ResponseMetadata"]["Error"] = json!({"Code":"Rejected"});
            }
            assert!(decode(&serde_json::to_vec(&invalid).unwrap()).is_err());
        }
        for result in [Value::Null, json!({}), json!([]), json!({"Id":true})] {
            let mut invalid = valid.clone();
            invalid["Result"] = result;
            assert!(decode(&serde_json::to_vec(&invalid).unwrap()).is_err());
        }
    }
    #[test]
    fn malformed_duplicate_and_oversized_receipts_fail() {
        for bytes in [b"{}".as_slice(), b"null", b"{", b""] {
            assert!(decode(bytes).is_err());
        }
        let valid = serde_json::to_string(&acknowledgement()).unwrap();
        for (from, to) in [
            (
                "\"Id\":\"asset-original\"",
                "\"Id\":\"asset-original\",\"Id\":\"asset-other\"",
            ),
            (
                "\"Action\":\"CreateAsset\"",
                "\"Action\":\"CreateAsset\",\"Action\":\"CreateAsset\"",
            ),
        ] {
            assert!(decode(valid.replace(from, to).as_bytes()).is_err());
        }
        assert!(decode(&vec![b' '; 1024 * 1024 + 1]).is_err());
    }
    #[tokio::test]
    async fn invalid_transport_limits_fail_without_network() {
        let signer =
            AssetManagementSigner::new("AKEXAMPLE".into(), "fixture-secret".into()).unwrap();
        let request = OrdinaryAssetCreate::new(
            group(),
            "https://media.example.test/a".into(),
            AssetType::Image,
            None,
        )
        .unwrap();
        for (limit, seconds) in [(0, 1), (1024 * 1024 + 1, 1), (1, 0), (1, 31)] {
            assert!(matches!(
                create_asset_now(
                    &signer,
                    &request,
                    limit,
                    std::time::Duration::from_secs(seconds)
                )
                .await,
                Err(ReadError::InvalidConfiguration)
            ));
        }
    }
    #[test]
    fn exact_private_binding_preserves_types_and_optional_name() {
        for kind in [AssetType::Image, AssetType::Video, AssetType::Audio] {
            for name in [None, Some("牛".repeat(64))] {
                let request = OrdinaryAssetCreate::new(
                    group(),
                    "https://media.example.test/a?signature=private".into(),
                    kind,
                    name,
                )
                .unwrap();
                let bytes = request.encode_private().unwrap();
                let restored = OrdinaryAssetCreate::restore_private(&bytes, group()).unwrap();
                assert_eq!(restored.body(), request.body());
                assert_eq!(restored.body()["GroupId"], "group-original");
                assert_eq!(restored.body()["ProjectName"], "original-project");
                assert!(restored.body().get("Moderation").is_none());
            }
        }
    }
    #[test]
    fn unsafe_sources_and_invalid_names_fail_before_signing() {
        for source in [
            "http://media.example.test/a",
            "https://127.0.0.1/a",
            "https://[::1]/a",
            "https://localhost/a",
            "https://host.local/a",
            "https://user:secret@media.example.test/a",
            "https://media.example.test/a#private",
            "https://media.example.test:8443/a",
            "data:image/png;base64,AAAA",
            " https://media.example.test/a",
            "https://media.example.test/a\n",
        ] {
            assert!(
                OrdinaryAssetCreate::new(group(), source.into(), AssetType::Image, None).is_err()
            );
        }
        for name in ["".into(), " ".into(), "牛".repeat(65), "line\nbreak".into()] {
            assert!(
                OrdinaryAssetCreate::new(
                    group(),
                    "https://media.example.test/a".into(),
                    AssetType::Image,
                    Some(name)
                )
                .is_err()
            );
        }
        assert!(
            OrdinaryAssetCreate::new(
                group(),
                format!("https://media.example.test/{}", "x".repeat(8192)),
                AssetType::Image,
                None
            )
            .is_err()
        );
    }
    #[test]
    fn restored_content_cannot_change_scope_or_weaken_inspection() {
        let request = OrdinaryAssetCreate::new(
            group(),
            "https://media.example.test/a".into(),
            AssetType::Image,
            None,
        )
        .unwrap();
        for (field, value) in [
            ("GroupId", json!("group-other")),
            ("ProjectName", json!("default")),
            ("AssetType", json!("Unknown")),
            ("Name", Value::Null),
            ("Moderation", json!({"Strategy":"Skip"})),
            ("GroupType", json!("LivenessFace")),
        ] {
            let mut body = request.body();
            body[field] = value;
            assert!(
                OrdinaryAssetCreate::restore_private(&serde_json::to_vec(&body).unwrap(), group())
                    .is_err()
            );
        }
        let duplicate = br#"{"GroupId":"group-original","GroupId":"group-original","ProjectName":"original-project","URL":"https://media.example.test/a","AssetType":"Image"}"#;
        assert!(OrdinaryAssetCreate::restore_private(duplicate, group()).is_err());
        assert!(OrdinaryAssetCreate::restore_private(&vec![b' '; 16385], group()).is_err());
    }
    #[test]
    fn signing_binds_exact_creation_action_and_original_project() {
        let request = OrdinaryAssetCreate::new(
            group(),
            "https://media.example.test/a".into(),
            AssetType::Image,
            None,
        )
        .unwrap();
        let signer = crate::asset_signing::AssetManagementSigner::new(
            "AKEXAMPLE".into(),
            "fixture-secret".into(),
        )
        .unwrap();
        let signed = signer
            .sign_create_asset("20261009T000000Z", &request)
            .unwrap();
        assert_eq!(
            serde_json::from_slice::<Value>(&signed.body).unwrap(),
            request.body()
        );
        let read = signer.sign_get_group("20261009T000000Z", &group()).unwrap();
        assert_ne!(
            signed.headers["authorization"],
            read.headers["authorization"]
        );
        assert_eq!(signed.headers["host"], "ark.cn-beijing.volcengineapi.com");
        assert!(signer.sign_create_asset("invalid", &request).is_err());
    }
}
