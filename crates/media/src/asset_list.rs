//! One original-group asset page. No qualification, readiness grant or URL handoff.
use crate::{
    asset_read::{OrdinaryGroupRead, ReadError, signed_read},
    asset_signing::AssetManagementSigner,
};
use serde::Deserialize;
use serde_json::{Value, json};
use std::{collections::HashSet, time::Duration};
const ENDPOINT: &str =
    "https://ark.cn-beijing.volcengineapi.com/?Action=ListAssets&Version=2024-01-01";

/// Private scope and cursor cannot be serialized or printed. Subsequent pages
/// can only be obtained from a validated response, retaining the original scope.
#[derive(Clone)]
pub struct OrdinaryAssetList {
    group: OrdinaryGroupRead,
    maximum_items: u8,
    cursor: Option<String>,
}
impl OrdinaryAssetList {
    pub fn first_page(
        group: String,
        project: String,
        maximum_items: u8,
    ) -> Result<Self, ReadError> {
        if !(1..=100).contains(&maximum_items) {
            return Err(ReadError::InvalidConfiguration);
        }
        Ok(Self {
            group: OrdinaryGroupRead::new(group, project)?,
            maximum_items,
            cursor: None,
        })
    }
    pub fn maximum_items(&self) -> u8 {
        self.maximum_items
    }
    pub fn is_continuation(&self) -> bool {
        self.cursor.is_some()
    }
    pub fn same_scope(&self, other: &Self) -> bool {
        self.group.id == other.group.id
            && self.group.project == other.group.project
            && self.maximum_items == other.maximum_items
    }
    pub(crate) fn body(&self) -> Value {
        let mut body = json!({"Filter":{"GroupType":"AIGC","GroupIds":[self.group.id]},
            "ProjectName":self.group.project,"MaxResults":self.maximum_items,"SortBy":"CreateTime","SortOrder":"Desc"});
        if let Some(cursor) = &self.cursor {
            body["NextToken"] = json!(cursor);
        }
        body
    }
}
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum AssetStatus {
    Active,
    Processing,
    Failed,
}
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum AssetType {
    Image,
    Video,
    Audio,
}
/// Private upstream identity is for later scoped storage only, never a UI label.
/// No URL, moderation payload or raw upstream error survives decoding.
pub struct OrdinaryAsset {
    upstream_id: String,
    group: OrdinaryGroupRead,
    pub name: String,
    pub status: AssetStatus,
    pub asset_type: AssetType,
    pub created_at: String,
    pub updated_at: String,
    pub last_inference_at: Option<String>,
}
impl OrdinaryAsset {
    pub fn upstream_id(&self) -> &str {
        &self.upstream_id
    }
    /// Validated identity/scope only; not proof of provenance or permission.
    pub fn read_request(&self) -> crate::asset_lookup::OrdinaryAssetRead {
        crate::asset_lookup::OrdinaryAssetRead::listed(
            self.upstream_id.clone(),
            self.group.clone(),
            self.asset_type,
        )
    }
}
pub struct OrdinaryAssetPage {
    pub items: Vec<OrdinaryAsset>,
    pub next_request: Option<OrdinaryAssetList>,
}
impl OrdinaryAssetPage {
    /// Private validated snapshot only; callers must encrypt it before retention.
    pub fn encode_private(&self, request: &OrdinaryAssetList) -> Result<Vec<u8>, ReadError> {
        if self.items.iter().any(|item| {
            item.group.id != request.group.id || item.group.project != request.group.project
        }) {
            return Err(ReadError::InvalidResponse);
        }
        if self.next_request.as_ref().is_some_and(|next| {
            next.group.id != request.group.id
                || next.group.project != request.group.project
                || next.maximum_items != request.maximum_items
                || next.cursor.is_none()
        }) {
            return Err(ReadError::InvalidResponse);
        }
        let items:Vec<_> = self.items.iter().map(|item| json!({"Id":item.upstream_id,
            "GroupId":request.group.id,"ProjectName":request.group.project,"Name":item.name,
            "AssetType":item.asset_type.as_str(),"Status":item.status.as_str(),
            "CreateTime":item.created_at,"UpdateTime":item.updated_at,"LastInferenceTime":item.last_inference_at})).collect();
        let value = json!({"ResponseMetadata":{"Action":"ListAssets","Version":"2024-01-01","Service":"ark","Region":"cn-beijing"},
            "Result":{"Items":items,"NextToken":self.next_request.as_ref().and_then(|next| next.cursor.as_ref())}});
        let bytes = serde_json::to_vec(&value).map_err(|_| ReadError::InvalidResponse)?;
        Self::restore_private(&bytes, request)?;
        Ok(bytes)
    }
    /// Recovery revalidates the exact original group/project/page limits.
    pub fn restore_private(bytes: &[u8], request: &OrdinaryAssetList) -> Result<Self, ReadError> {
        if bytes.is_empty() || bytes.len() > 128000 {
            return Err(ReadError::InvalidResponse);
        }
        decode(bytes, request)
    }
}
impl AssetStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Active => "Active",
            Self::Processing => "Processing",
            Self::Failed => "Failed",
        }
    }
}
impl AssetType {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Image => "Image",
            Self::Video => "Video",
            Self::Audio => "Audio",
        }
    }
}
#[derive(Deserialize)]
#[serde(rename_all = "PascalCase")]
struct Envelope {
    response_metadata: Metadata,
    result: Page,
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
struct Page {
    items: Vec<Item>,
    next_token: Option<String>,
}
#[derive(Deserialize)]
#[serde(rename_all = "PascalCase")]
pub(crate) struct Item {
    id: String,
    group_id: String,
    project_name: String,
    name: String,
    asset_type: String,
    status: String,
    create_time: String,
    update_time: String,
    last_inference_time: Option<String>,
}
impl Item {
    pub(crate) fn validate(self, group: &OrdinaryGroupRead) -> Result<OrdinaryAsset, ReadError> {
        if self.group_id != group.id
            || self.project_name != group.project
            || !self.id.starts_with("asset-")
            || self.id.len() <= 6
            || self.id.len() > 128
            || !self
                .id
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_'))
            || self.name.chars().count() > 64
            || self.name.chars().any(char::is_control)
            || !timestamp(&self.create_time)
            || !timestamp(&self.update_time)
            || self
                .last_inference_time
                .as_ref()
                .is_some_and(|v| !timestamp(v))
        {
            return Err(ReadError::InvalidResponse);
        }
        let status = match self.status.as_str() {
            "Active" => AssetStatus::Active,
            "Processing" => AssetStatus::Processing,
            "Failed" => AssetStatus::Failed,
            _ => return Err(ReadError::InvalidResponse),
        };
        let asset_type = match self.asset_type.as_str() {
            "Image" => AssetType::Image,
            "Video" => AssetType::Video,
            "Audio" => AssetType::Audio,
            _ => return Err(ReadError::InvalidResponse),
        };
        Ok(OrdinaryAsset {
            upstream_id: self.id,
            group: group.clone(),
            name: self.name,
            status,
            asset_type,
            created_at: self.create_time,
            updated_at: self.update_time,
            last_inference_at: self.last_inference_time,
        })
    }
}
fn timestamp(value: &str) -> bool {
    chrono::DateTime::parse_from_rfc3339(value).is_ok()
}
fn decode(bytes: &[u8], request: &OrdinaryAssetList) -> Result<OrdinaryAssetPage, ReadError> {
    let envelope: Envelope =
        serde_json::from_slice(bytes).map_err(|_| ReadError::InvalidResponse)?;
    let meta = envelope.response_metadata;
    if envelope.error.is_some()
        || meta.error.is_some()
        || meta.action != "ListAssets"
        || meta.version != "2024-01-01"
        || meta.service != "ark"
        || meta.region != "cn-beijing"
        || envelope.result.items.len() > usize::from(request.maximum_items)
    {
        return Err(ReadError::InvalidResponse);
    }
    let cursor = envelope.result.next_token;
    if cursor.as_ref().is_some_and(|v| {
        v.is_empty()
            || v.len() > 4096
            || !v.is_ascii()
            || v.chars().any(char::is_control)
            || request.cursor.as_ref() == Some(v)
    }) {
        return Err(ReadError::InvalidResponse);
    }
    let mut seen = HashSet::new();
    let mut items = Vec::new();
    for item in envelope.result.items {
        let asset = item.validate(&request.group)?;
        if !seen.insert(asset.upstream_id.clone()) {
            return Err(ReadError::InvalidResponse);
        }
        items.push(asset);
    }
    let next_request = cursor.map(|cursor| OrdinaryAssetList {
        group: OrdinaryGroupRead {
            id: request.group.id.clone(),
            project: request.group.project.clone(),
        },
        maximum_items: request.maximum_items,
        cursor: Some(cursor),
    });
    Ok(OrdinaryAssetPage {
        items,
        next_request,
    })
}
/// One fixed signed POST with the shared 1 MiB / 30-second maximum, public DNS
/// pinning, no redirect/proxy/retry. Callers must authorize ListAssets separately.
pub async fn list_assets_now(
    signer: &AssetManagementSigner,
    request: &OrdinaryAssetList,
    maximum_bytes: usize,
    timeout: Duration,
) -> Result<OrdinaryAssetPage, ReadError> {
    let timestamp = chrono::DateTime::<chrono::Utc>::from(std::time::SystemTime::now())
        .format("%Y%m%dT%H%M%SZ")
        .to_string();
    let signed = signer
        .sign_list_assets(&timestamp, request)
        .map_err(|_| ReadError::InvalidConfiguration)?;
    decode(
        &signed_read(ENDPOINT, signed, maximum_bytes, timeout).await?,
        request,
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    fn request() -> OrdinaryAssetList {
        OrdinaryAssetList::first_page("group-original".into(), "original-project".into(), 2)
            .unwrap()
    }
    fn fixture() -> Value {
        json!({"ResponseMetadata":{"Action":"ListAssets","Version":"2024-01-01","Service":"ark","Region":"cn-beijing"},
            "Result":{"Items":[{"Id":"asset-one","GroupId":"group-original","ProjectName":"original-project",
                "Name":"","Status":"Processing","AssetType":"Image","CreateTime":"2026-10-08T00:00:00Z",
                "UpdateTime":"2026-10-08T00:00:01Z","URL":"https://private.invalid/signed?secret=never-forward",
                "Error":{"Code":"PrivateFailure","Message":"Never expose"}}],"NextToken":"opaque-original-page"}})
    }
    fn read(value: &Value, request: &OrdinaryAssetList) -> Result<OrdinaryAssetPage, ReadError> {
        decode(&serde_json::to_vec(value).unwrap(), request)
    }
    #[test]
    fn pages_preserve_original_group_project_and_page_size_without_raw_content() {
        let first = request();
        let page = read(&fixture(), &first).unwrap();
        assert_eq!(page.items.len(), 1);
        assert_eq!(page.items[0].upstream_id(), "asset-one");
        assert_eq!(page.items[0].status, AssetStatus::Processing);
        assert_eq!(page.items[0].asset_type, AssetType::Image);
        assert_eq!(page.items[0].name, "");
        assert!(page.items[0].last_inference_at.is_none());
        let next = page.next_request.unwrap();
        let mut expected = first.body();
        expected["NextToken"] = json!("opaque-original-page");
        assert_eq!(next.body(), expected);
        // A repeated cursor is invalid even when the returned page is otherwise valid.
        assert_eq!(
            read(&fixture(), &next).err(),
            Some(ReadError::InvalidResponse)
        );
        let empty = json!({"ResponseMetadata":fixture()["ResponseMetadata"],"Result":{"Items":[]}});
        let page = read(&empty, &next).unwrap();
        assert!(page.items.is_empty() && page.next_request.is_none());
    }
    #[test]
    fn reject_cross_scope_bad_metadata_duplicates_oversized_pages_and_invalid_fields() {
        for (field, value) in [
            ("GroupId", json!("group-other")),
            ("ProjectName", json!("other")),
            ("Id", json!("invalid")),
            ("Status", json!("Unknown")),
            ("AssetType", json!("Other")),
            ("CreateTime", json!("invalid")),
            ("UpdateTime", json!("invalid")),
            ("LastInferenceTime", json!("invalid")),
            ("Name", json!("x".repeat(65))),
        ] {
            let mut body = fixture();
            body["Result"]["Items"][0][field] = value;
            assert_eq!(
                read(&body, &request()).err(),
                Some(ReadError::InvalidResponse),
                "{field}"
            );
        }
        for field in ["Action", "Version", "Service", "Region"] {
            let mut body = fixture();
            body["ResponseMetadata"][field] = json!("other");
            assert_eq!(
                read(&body, &request()).err(),
                Some(ReadError::InvalidResponse)
            );
        }
        let mut body = fixture();
        body["ResponseMetadata"]["Error"] = json!({"Message":"secret"});
        assert_eq!(
            read(&body, &request()).err(),
            Some(ReadError::InvalidResponse)
        );
        let mut body = fixture();
        body["Result"]["Items"] = json!([body["Result"]["Items"][0], body["Result"]["Items"][0]]);
        assert_eq!(
            read(&body, &request()).err(),
            Some(ReadError::InvalidResponse)
        );
        let mut body = fixture();
        let second = body["Result"]["Items"][0].clone();
        body["Result"]["Items"].as_array_mut().unwrap().push(second);
        body["Result"]["Items"][1]["Id"] = json!("asset-two");
        let one =
            OrdinaryAssetList::first_page("group-original".into(), "original-project".into(), 1)
                .unwrap();
        assert_eq!(read(&body, &one).err(), Some(ReadError::InvalidResponse));
        let duplicate = serde_json::to_string(&fixture())
            .unwrap()
            .replace("\"GroupId\":", "\"GroupId\":\"group-other\",\"GroupId\":");
        assert_eq!(
            decode(duplicate.as_bytes(), &request()).err(),
            Some(ReadError::InvalidResponse)
        );
    }
    #[test]
    fn private_snapshots_roundtrip_and_drop_urls_errors_without_weakening_scope() {
        let request = request();
        let page = read(&fixture(), &request).unwrap();
        let encoded = page.encode_private(&request).unwrap();
        let text = std::str::from_utf8(&encoded).unwrap();
        for private in ["https://", "secret=", "PrivateFailure", "Never expose"] {
            assert!(!text.contains(private));
        }
        let restored = OrdinaryAssetPage::restore_private(&encoded, &request).unwrap();
        assert_eq!(restored.items[0].upstream_id(), "asset-one");
        assert!(restored.next_request.is_some());
        let other =
            OrdinaryAssetList::first_page("group-other".into(), "original-project".into(), 2)
                .unwrap();
        assert!(OrdinaryAssetPage::restore_private(&encoded, &other).is_err());
        assert!(page.encode_private(&other).is_err());
        let mut invalid = read(&fixture(), &request).unwrap();
        invalid.next_request = Some(request.clone());
        assert!(invalid.encode_private(&request).is_err());
        assert!(OrdinaryAssetPage::restore_private(&vec![b' '; 128001], &request).is_err());
    }
    #[test]
    fn cursor_and_request_bounds_fail_closed() {
        for max in [0, 101, 255] {
            assert!(
                OrdinaryAssetList::first_page("group-original".into(), "original".into(), max)
                    .is_err()
            );
        }
        assert!(OrdinaryAssetList::first_page("group-".into(), "original".into(), 1).is_err());
        assert!(OrdinaryAssetList::first_page("group-original".into(), "".into(), 1).is_err());
        for cursor in [
            "".into(),
            "x".repeat(4097),
            "line\nbreak".into(),
            "非ASCII".into(),
        ] {
            let mut body = fixture();
            body["Result"]["NextToken"] = json!(cursor);
            assert_eq!(
                read(&body, &request()).err(),
                Some(ReadError::InvalidResponse)
            );
        }
    }
    #[test]
    fn signature_binds_group_project_cursor_page_size_and_list_action() {
        let signer =
            AssetManagementSigner::new("AKEXAMPLE".into(), "fixture-secret".into()).unwrap();
        let first = request();
        let signed = signer.sign_list_assets("20261008T000000Z", &first).unwrap();
        assert!(signed.headers["authorization"].is_sensitive());
        let body: Value = serde_json::from_slice(&signed.body).unwrap();
        assert_eq!(body, first.body());
        for changed in [
            OrdinaryAssetList::first_page("group-other".into(), "original-project".into(), 2)
                .unwrap(),
            OrdinaryAssetList::first_page("group-original".into(), "other".into(), 2).unwrap(),
            OrdinaryAssetList::first_page("group-original".into(), "original-project".into(), 1)
                .unwrap(),
            read(&fixture(), &first).unwrap().next_request.unwrap(),
        ] {
            assert_ne!(
                signed.headers["authorization"],
                signer
                    .sign_list_assets("20261008T000000Z", &changed)
                    .unwrap()
                    .headers["authorization"]
            );
        }
        let mut same_body = signer
            .sign_get_group("20261008T000000Z", &first.group)
            .unwrap();
        assert_ne!(
            signed.headers["authorization"],
            same_body.headers.remove("authorization").unwrap()
        );
    }
}
