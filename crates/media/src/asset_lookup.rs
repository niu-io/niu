//! Individual reads retain a validated listing's identity/scope, never reuse rights.
use crate::{
    asset_list::{AssetType, Item, OrdinaryAsset},
    asset_read::{OrdinaryGroupRead, ReadError, signed_read},
    asset_signing::AssetManagementSigner,
};
use serde::Deserialize;
use serde_json::{Value, json};
use std::time::Duration;

const ENDPOINT: &str =
    "https://ark.cn-beijing.volcengineapi.com/?Action=GetAsset&Version=2024-01-01";

/// Private upstream identity, original group/project and expected media type.
/// Callers must obtain the listing from authorized retained content and recheck
/// current original-account credentials and operation-specific authorization.
#[derive(Clone)]
pub struct OrdinaryAssetRead {
    id: String,
    group: OrdinaryGroupRead,
    asset_type: AssetType,
}
impl OrdinaryAssetRead {
    /// Bind a persisted accepted image creation to its original ordinary group.
    /// This validates identity only; storage must establish provenance, current
    /// key/account authorization and a separately reviewed GetAsset permission.
    pub fn created_image(id: String, group: OrdinaryGroupRead) -> Result<Self, ReadError> {
        if !id.starts_with("asset-")
            || !(7..=128).contains(&id.len())
            || !id
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_'))
        {
            return Err(ReadError::InvalidConfiguration);
        }
        Ok(Self {
            id,
            group,
            asset_type: AssetType::Image,
        })
    }

    pub(crate) fn listed(id: String, group: OrdinaryGroupRead, asset_type: AssetType) -> Self {
        Self {
            id,
            group,
            asset_type,
        }
    }
    /// Private single-item snapshot, bound to the exact dispatched identity/type.
    /// Callers must encrypt before retention; no temporary access URL is included.
    pub fn encode_private_result(&self, asset: OrdinaryAsset) -> Result<Vec<u8>, ReadError> {
        let observed = asset.read_request();
        if observed.id != self.id
            || observed.asset_type != self.asset_type
            || observed.group.id != self.group.id
            || observed.group.project != self.group.project
        {
            return Err(ReadError::InvalidResponse);
        }
        let scope = crate::asset_list::OrdinaryAssetList::first_page(
            self.group.id.clone(),
            self.group.project.clone(),
            1,
        )?;
        crate::asset_list::OrdinaryAssetPage {
            items: vec![asset],
            next_request: None,
        }
        .encode_private(&scope)
    }
    pub(crate) fn body(&self) -> Value {
        json!({"Id":self.id,"ProjectName":self.group.project})
    }
}
#[derive(Deserialize)]
#[serde(rename_all = "PascalCase")]
struct Envelope {
    response_metadata: Metadata,
    result: Item,
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
fn decode(bytes: &[u8], request: &OrdinaryAssetRead) -> Result<OrdinaryAsset, ReadError> {
    let envelope: Envelope =
        serde_json::from_slice(bytes).map_err(|_| ReadError::InvalidResponse)?;
    let metadata = envelope.response_metadata;
    if envelope.error.is_some()
        || metadata.error.is_some()
        || metadata.action != "GetAsset"
        || metadata.version != "2024-01-01"
        || metadata.service != "ark"
        || metadata.region != "cn-beijing"
    {
        return Err(ReadError::InvalidResponse);
    }
    let asset = envelope.result.validate(&request.group)?;
    if asset.upstream_id() != request.id || asset.asset_type != request.asset_type {
        return Err(ReadError::InvalidResponse);
    }
    Ok(asset)
}
/// One signed fixed-endpoint POST, at most 1 MiB and 30 seconds including DNS/body.
/// No redirect, proxy or retry. Does not establish readiness or authorize reuse.
pub async fn get_asset_now(
    signer: &AssetManagementSigner,
    request: &OrdinaryAssetRead,
    maximum_bytes: usize,
    timeout: Duration,
) -> Result<OrdinaryAsset, ReadError> {
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
        .sign_get_asset(&timestamp, request)
        .map_err(|_| ReadError::InvalidConfiguration)?;
    decode(
        &signed_read(ENDPOINT, signed, maximum_bytes, timeout).await?,
        request,
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::asset_list::{AssetStatus, OrdinaryAssetList, OrdinaryAssetPage};
    fn fixture() -> Value {
        json!({"ResponseMetadata":{"Action":"GetAsset","Version":"2024-01-01","Service":"ark","Region":"cn-beijing"},
            "Result":{"Id":"asset-original","GroupId":"group-original","ProjectName":"original-project",
            "Name":"Character","AssetType":"Image","Status":"Processing","CreateTime":"2026-10-08T00:00:00Z",
            "UpdateTime":"2026-10-08T00:00:01Z","LastInferenceTime":null,
            "URL":"https://private.invalid/signed?secret=discard","Error":{"Code":"Private","Message":"Raw secret"},
            "Moderation":{"Strategy":"Default"}}})
    }
    fn request() -> OrdinaryAssetRead {
        let source = fixture();
        let listing = json!({"ResponseMetadata":{"Action":"ListAssets","Version":"2024-01-01","Service":"ark","Region":"cn-beijing"},
            "Result":{"Items":[source["Result"].clone()]}});
        let scope =
            OrdinaryAssetList::first_page("group-original".into(), "original-project".into(), 1)
                .unwrap();
        OrdinaryAssetPage::restore_private(&serde_json::to_vec(&listing).unwrap(), &scope)
            .unwrap()
            .items[0]
            .read_request()
    }
    fn read(value: &Value, request: &OrdinaryAssetRead) -> Result<OrdinaryAsset, ReadError> {
        decode(&serde_json::to_vec(value).unwrap(), request)
    }
    #[test]
    fn retained_result_is_single_item_and_exactly_bound() {
        let request = request();
        let asset = read(&fixture(), &request).unwrap();
        let bytes = request.encode_private_result(asset).unwrap();
        assert!(!String::from_utf8_lossy(&bytes).contains("https://"));
        let scope =
            OrdinaryAssetList::first_page("group-original".into(), "original-project".into(), 1)
                .unwrap();
        let page = OrdinaryAssetPage::restore_private(&bytes, &scope).unwrap();
        assert_eq!(page.items.len(), 1);
        assert!(page.next_request.is_none());
        let other = OrdinaryAssetRead::listed(
            "asset-other".into(),
            request.group.clone(),
            AssetType::Image,
        );
        assert!(
            other
                .encode_private_result(read(&fixture(), &request).unwrap())
                .is_err()
        );
        let other =
            OrdinaryAssetRead::listed(request.id.clone(), request.group.clone(), AssetType::Video);
        assert!(
            other
                .encode_private_result(read(&fixture(), &request).unwrap())
                .is_err()
        );
    }
    #[test]
    fn statuses_are_observations_and_private_urls_errors_are_discarded() {
        let request = request();
        for (status, expected) in [
            ("Processing", AssetStatus::Processing),
            ("Active", AssetStatus::Active),
            ("Failed", AssetStatus::Failed),
        ] {
            let mut value = fixture();
            value["Result"]["Status"] = json!(status);
            let asset = read(&value, &request).unwrap();
            assert_eq!(asset.status, expected);
            assert_eq!(asset.name, "Character");
            assert_eq!(
                asset.read_request().body(),
                json!({"Id":"asset-original","ProjectName":"original-project"})
            );
        }
        let mut value = fixture();
        value["Result"]["Name"] = json!("");
        value["Result"].as_object_mut().unwrap().remove("URL");
        assert!(read(&value, &request).unwrap().name.is_empty());
    }
    #[test]
    fn exact_identity_scope_type_metadata_and_bounded_fields_are_required() {
        let request = request();
        for (field, bad) in [
            ("Id", json!("asset-other")),
            ("GroupId", json!("group-other")),
            ("ProjectName", json!("other-project")),
            ("AssetType", json!("Video")),
            ("Status", json!("Unknown")),
            ("Name", json!("a".repeat(65))),
            ("Name", json!("control\nname")),
            ("CreateTime", json!("invalid")),
            ("UpdateTime", json!("invalid")),
            ("LastInferenceTime", json!("invalid")),
        ] {
            let mut value = fixture();
            value["Result"][field] = bad;
            assert!(
                matches!(read(&value, &request), Err(ReadError::InvalidResponse)),
                "{field}"
            );
        }
        for (field, bad) in [
            ("Action", "ListAssets"),
            ("Version", "future"),
            ("Service", "other"),
            ("Region", "other"),
        ] {
            let mut value = fixture();
            value["ResponseMetadata"][field] = json!(bad);
            assert!(matches!(
                read(&value, &request),
                Err(ReadError::InvalidResponse)
            ));
        }
        for location in ["Error", "ResponseMetadata"] {
            let mut value = fixture();
            if location == "Error" {
                value["Error"] = json!({"Message":"private"});
            } else {
                value["ResponseMetadata"]["Error"] = json!({"Message":"private"});
            }
            assert!(matches!(
                read(&value, &request),
                Err(ReadError::InvalidResponse)
            ));
        }
        let repeated = serde_json::to_string(&fixture()).unwrap().replacen(
            "\"Id\":",
            "\"Id\":\"asset-other\",\"Id\":",
            1,
        );
        assert!(matches!(
            decode(repeated.as_bytes(), &request),
            Err(ReadError::InvalidResponse)
        ));
    }
    #[test]
    fn signature_binds_the_fixed_lookup_action_identity_and_original_project() {
        let signer =
            AssetManagementSigner::new("AKEXAMPLE".into(), "fixture-secret".into()).unwrap();
        let request = request();
        let timestamp = "20261008T000000Z";
        let signed = signer.sign_get_asset(timestamp, &request).unwrap();
        assert_eq!(
            serde_json::from_slice::<Value>(&signed.body).unwrap(),
            request.body()
        );
        assert_eq!(signed.headers["host"], "ark.cn-beijing.volcengineapi.com");
        for changed in [
            OrdinaryAssetRead::listed(
                "asset-other".into(),
                request.group.clone(),
                AssetType::Image,
            ),
            OrdinaryAssetRead::listed(
                request.id.clone(),
                OrdinaryGroupRead::new("group-original".into(), "another-project".into()).unwrap(),
                AssetType::Image,
            ),
        ] {
            let other = signer.sign_get_asset(timestamp, &changed).unwrap();
            assert_ne!(
                signed.headers["authorization"],
                other.headers["authorization"]
            );
        }
        let group = signer.sign_get_group(timestamp, &request.group).unwrap();
        assert_ne!(
            signed.headers["authorization"],
            group.headers["authorization"]
        );
        assert!(signer.sign_get_asset("20260230T000000Z", &request).is_err());
    }
    #[test]
    fn retained_assets_cannot_be_rebound_to_another_group_or_project() {
        let asset = read(&fixture(), &request()).unwrap();
        let page = OrdinaryAssetPage {
            items: vec![asset],
            next_request: None,
        };
        for (group, project) in [
            ("group-other", "original-project"),
            ("group-original", "other-project"),
        ] {
            let scope = OrdinaryAssetList::first_page(group.into(), project.into(), 1).unwrap();
            assert!(matches!(
                page.encode_private(&scope),
                Err(ReadError::InvalidResponse)
            ));
        }
    }

    #[tokio::test]
    async fn invalid_bounds_fail_before_network_work() {
        let signer =
            AssetManagementSigner::new("AKEXAMPLE".into(), "fixture-secret".into()).unwrap();
        let request = request();
        for (bytes, timeout) in [
            (0, Duration::from_secs(1)),
            (1024 * 1024 + 1, Duration::from_secs(1)),
            (100, Duration::ZERO),
            (100, Duration::from_secs(31)),
        ] {
            assert!(matches!(
                get_asset_now(&signer, &request, bytes, timeout).await,
                Err(ReadError::InvalidConfiguration)
            ));
        }
    }
}
