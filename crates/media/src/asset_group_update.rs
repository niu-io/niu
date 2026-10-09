//! Fixed ordinary-group metadata update. Validation is not authorization.
//! Dispatch errors do not establish that a mutation was not applied.
use crate::{
    asset_read::{OrdinaryGroupRead, ReadError, signed_read},
    asset_signing::AssetManagementSigner,
};
use serde::Deserialize;
use serde_json::{Value, json};
use std::time::Duration;
const ENDPOINT: &str =
    "https://ark.cn-beijing.volcengineapi.com/?Action=UpdateAssetGroup&Version=2024-01-01";
/// Only mutable metadata; original identity/project are retained privately.
/// Caller must establish an authorized saved ordinary group and current rights.
pub struct OrdinaryGroupUpdate {
    original: OrdinaryGroupRead,
    name: Option<String>,
    description: Option<String>,
}
impl OrdinaryGroupUpdate {
    pub fn new(
        original: OrdinaryGroupRead,
        name: Option<String>,
        description: Option<String>,
    ) -> Result<Self, ReadError> {
        if name.is_none() && description.is_none() {
            return Err(ReadError::InvalidConfiguration);
        }
        if name.as_ref().is_some_and(|v| {
            v.trim().is_empty() || v.chars().count() > 64 || v.chars().any(char::is_control)
        }) || description.as_ref().is_some_and(|v| {
            v.chars().count() > 300
                || v.chars()
                    .any(|c| c.is_control() && !matches!(c, '\n' | '\r' | '\t'))
        }) {
            return Err(ReadError::InvalidConfiguration);
        }
        Ok(Self {
            original,
            name,
            description,
        })
    }
    /// Private patch snapshot; encrypt before retention.
    pub fn encode_private(&self) -> Result<Vec<u8>, ReadError> {
        serde_json::to_vec(&self.body()).map_err(|_| ReadError::InvalidConfiguration)
    }
    /// Exact saved original scope and mutable fields only; duplicates/nulls rejected.
    pub fn restore_private(bytes: &[u8], original: OrdinaryGroupRead) -> Result<Self, ReadError> {
        #[derive(Deserialize)]
        #[serde(rename_all = "PascalCase", deny_unknown_fields)]
        struct Saved {
            id: String,
            project_name: String,
            name: Option<String>,
            description: Option<String>,
        }
        if bytes.is_empty() || bytes.len() > 8192 {
            return Err(ReadError::InvalidConfiguration);
        }
        let saved: Saved =
            serde_json::from_slice(bytes).map_err(|_| ReadError::InvalidConfiguration)?;
        if saved.id != original.id || saved.project_name != original.project {
            return Err(ReadError::InvalidConfiguration);
        }
        let request = Self::new(original, saved.name, saved.description)?;
        let value: Value =
            serde_json::from_slice(bytes).map_err(|_| ReadError::InvalidConfiguration)?;
        if request.body() != value {
            return Err(ReadError::InvalidConfiguration);
        }
        Ok(request)
    }
    /// Compare a bounded GetAssetGroup response with this exact saved patch.
    /// Omitted fields remain unconstrained; explicit empty values require an
    /// explicit matching value. This validates content, not read provenance,
    /// freshness, permission or completion of an uncertain mutation.
    pub fn verify_readback(&self, bytes: &[u8]) -> Result<(), ReadError> {
        if bytes.is_empty() || bytes.len() > 1024 * 1024 {
            return Err(ReadError::InvalidResponse);
        }
        let observed = crate::asset_read::decode(bytes, &self.original)?;
        self.verify_metadata(&observed)
    }
    /// Compare fields from an independently authorized, original-group read.
    /// Caller establishes durable identity, freshness and authenticated storage.
    pub fn verify_metadata(
        &self,
        observed: &crate::asset_read::OrdinaryGroupDetails,
    ) -> Result<(), ReadError> {
        if self
            .name
            .as_ref()
            .is_some_and(|name| name != &observed.name)
            || self
                .description
                .as_ref()
                .is_some_and(|description| observed.description.as_ref() != Some(description))
        {
            return Err(ReadError::InvalidResponse);
        }
        Ok(())
    }
    pub(crate) fn body(&self) -> Value {
        let mut value = json!({"Id":self.original.id,"ProjectName":self.original.project});
        if let Some(name) = &self.name {
            value["Name"] = json!(name);
        }
        if let Some(description) = &self.description {
            value["Description"] = json!(description);
        }
        value
    }
}
#[derive(Deserialize)]
#[serde(rename_all = "PascalCase")]
struct Envelope {
    response_metadata: Metadata,
    result: Acknowledgement,
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
struct Acknowledgement {
    id: String,
}
fn decode(bytes: &[u8], request: &OrdinaryGroupUpdate) -> Result<(), ReadError> {
    let envelope: Envelope =
        serde_json::from_slice(bytes).map_err(|_| ReadError::InvalidResponse)?;
    let metadata = envelope.response_metadata;
    if envelope.error.is_some()
        || metadata.error.is_some()
        || metadata.action != "UpdateAssetGroup"
        || metadata.version != "2024-01-01"
        || metadata.service != "ark"
        || metadata.region != "cn-beijing"
        || envelope.result.id != request.original.id
    {
        return Err(ReadError::InvalidResponse);
    }
    Ok(())
}
/// One bounded signed POST. No redirect/proxy/retry. Acknowledgement is not
/// read-back verification; any unacknowledged dispatch requires reconciliation.
pub async fn update_group_now(
    signer: &AssetManagementSigner,
    request: &OrdinaryGroupUpdate,
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
        .sign_update_group(&timestamp, request)
        .map_err(|_| ReadError::InvalidConfiguration)?;
    decode(
        &signed_read(ENDPOINT, signed, maximum_bytes, timeout).await?,
        request,
    )
}
#[cfg(test)]
mod tests {
    use super::*;
    fn original(project: &str) -> OrdinaryGroupRead {
        OrdinaryGroupRead::new("group-original".into(), project.into()).unwrap()
    }
    fn request() -> OrdinaryGroupUpdate {
        OrdinaryGroupUpdate::new(original("original-project"), Some("Renamed".into()), None)
            .unwrap()
    }
    fn acknowledgement() -> Value {
        json!({"ResponseMetadata":{"Action":"UpdateAssetGroup","Version":"2024-01-01","Service":"ark","Region":"cn-beijing"},"Result":{"Id":"group-original"}})
    }
    #[test]
    fn private_snapshot_preserves_patch_and_rejects_scope_field_or_shape_changes() {
        let bytes = request().encode_private().unwrap();
        assert_eq!(
            OrdinaryGroupUpdate::restore_private(&bytes, original("original-project"))
                .unwrap()
                .body(),
            request().body()
        );
        assert!(OrdinaryGroupUpdate::restore_private(&bytes, original("other-project")).is_err());
        for (field, value) in [
            ("Id", json!("group-other")),
            ("ProjectName", json!("other")),
            ("GroupType", json!("LivenessFace")),
            ("Description", Value::Null),
            ("Name", Value::Null),
        ] {
            let mut changed = request().body();
            changed[field] = value;
            assert!(
                OrdinaryGroupUpdate::restore_private(
                    &serde_json::to_vec(&changed).unwrap(),
                    original("original-project")
                )
                .is_err()
            );
        }
        let duplicate = String::from_utf8(bytes).unwrap().replace(
            "\"Name\":\"Renamed\"",
            "\"Name\":\"Renamed\",\"Name\":\"Renamed\"",
        );
        assert!(
            OrdinaryGroupUpdate::restore_private(
                duplicate.as_bytes(),
                original("original-project")
            )
            .is_err()
        );
        assert!(
            OrdinaryGroupUpdate::restore_private(&vec![b' '; 8193], original("original-project"))
                .is_err()
        );
    }
    #[test]
    fn readback_matches_requested_fields_and_exact_original_response_scope() {
        let response = json!({"ResponseMetadata":{"Action":"GetAssetGroup","Version":"2024-01-01","Service":"ark","Region":"cn-beijing"},"Result":{"Id":"group-original","ProjectName":"original-project","GroupType":"AIGC","Name":"Renamed","Description":"Unchanged","CreateTime":"2026-10-08T00:00:00Z","UpdateTime":"2026-10-08T00:00:01Z"}});
        let encode = |v: &Value| serde_json::to_vec(v).unwrap();
        assert!(request().verify_readback(&encode(&response)).is_ok());
        for pointer in [
            "/Result/Id",
            "/Result/ProjectName",
            "/Result/GroupType",
            "/Result/Name",
            "/ResponseMetadata/Action",
            "/Result/UpdateTime",
        ] {
            let mut changed = response.clone();
            *changed.pointer_mut(pointer).unwrap() = json!("wrong");
            assert!(request().verify_readback(&encode(&changed)).is_err());
        }
        let clear =
            OrdinaryGroupUpdate::new(original("original-project"), None, Some(String::new()))
                .unwrap();
        assert!(clear.verify_readback(&encode(&response)).is_err());
        let mut cleared = response.clone();
        cleared["Result"]["Description"] = json!("");
        assert!(clear.verify_readback(&encode(&cleared)).is_ok());
        cleared["Result"]["Description"] = Value::Null;
        assert!(clear.verify_readback(&encode(&cleared)).is_err());
        cleared["Result"]
            .as_object_mut()
            .unwrap()
            .remove("Description");
        assert!(clear.verify_readback(&encode(&cleared)).is_err());
        let both = OrdinaryGroupUpdate::new(
            original("original-project"),
            Some("Renamed".into()),
            Some("Unchanged".into()),
        )
        .unwrap();
        assert!(both.verify_readback(&encode(&response)).is_ok());
        let duplicate = String::from_utf8(encode(&response)).unwrap().replace(
            "\"Name\":\"Renamed\"",
            "\"Name\":\"Renamed\",\"Name\":\"Renamed\"",
        );
        assert!(both.verify_readback(duplicate.as_bytes()).is_err());
        assert!(both.verify_readback(&vec![b' '; 1024 * 1024 + 1]).is_err());
        assert!(both.verify_readback(b"{}").is_err());
    }
    #[test]
    fn patch_preserves_scope_omission_and_explicit_description_clear() {
        let name =
            OrdinaryGroupUpdate::new(original("original-project"), Some("元".repeat(64)), None)
                .unwrap()
                .body();
        assert_eq!(name["Id"], "group-original");
        assert_eq!(name["ProjectName"], "original-project");
        assert!(name.get("Description").is_none());
        assert!(name.get("GroupType").is_none());
        let description =
            OrdinaryGroupUpdate::new(original("original-project"), None, Some(String::new()))
                .unwrap()
                .body();
        assert!(description.get("Name").is_none());
        assert_eq!(description["Description"], "");
        assert!(
            OrdinaryGroupUpdate::new(original("original-project"), None, Some("元".repeat(300)))
                .is_ok()
        );
        assert!(
            OrdinaryGroupUpdate::new(
                original("original-project"),
                None,
                Some("line\nline\ttext".into())
            )
            .is_ok()
        );
    }
    #[test]
    fn empty_patches_oversized_metadata_and_controls_are_rejected() {
        for (name, description) in [
            (None, None),
            (Some(" ".into()), None),
            (Some("元".repeat(65)), None),
            (Some("bad\nname".into()), None),
            (None, Some("元".repeat(301))),
            (None, Some("bad\0description".into())),
        ] {
            assert!(
                OrdinaryGroupUpdate::new(original("original-project"), name, description).is_err()
            );
        }
    }
    #[test]
    fn acknowledgement_requires_exact_action_metadata_and_original_identity() {
        let request = request();
        let value = acknowledgement();
        assert!(decode(&serde_json::to_vec(&value).unwrap(), &request).is_ok());
        for pointer in [
            "/ResponseMetadata/Action",
            "/ResponseMetadata/Version",
            "/ResponseMetadata/Service",
            "/ResponseMetadata/Region",
            "/Result/Id",
        ] {
            let mut invalid = value.clone();
            *invalid.pointer_mut(pointer).unwrap() = json!("wrong");
            assert!(decode(&serde_json::to_vec(&invalid).unwrap(), &request).is_err());
        }
        for pointer in ["Error", "ResponseMetadata"] {
            let mut invalid = value.clone();
            if pointer == "Error" {
                invalid["Error"] = json!({"Message":"private"});
            } else {
                invalid["ResponseMetadata"]["Error"] = json!({"Message":"private"});
            }
            assert!(decode(&serde_json::to_vec(&invalid).unwrap(), &request).is_err());
        }
        let duplicate = serde_json::to_string(&value).unwrap().replace(
            "\"Id\":\"group-original\"",
            "\"Id\":\"group-original\",\"Id\":\"group-original\"",
        );
        assert!(decode(duplicate.as_bytes(), &request).is_err());
        assert!(decode(b"{}", &request).is_err());
    }
    #[test]
    fn signature_binds_exact_metadata_scope_and_action() {
        let signer =
            AssetManagementSigner::new("AKEXAMPLE".into(), "fixture-secret".into()).unwrap();
        let signed = signer
            .sign_update_group("20261008T000000Z", &request())
            .unwrap();
        assert_eq!(
            serde_json::from_slice::<Value>(&signed.body).unwrap(),
            request().body()
        );
        for changed in [
            OrdinaryGroupUpdate::new(original("another-project"), Some("Renamed".into()), None)
                .unwrap(),
            OrdinaryGroupUpdate::new(original("original-project"), Some("Changed".into()), None)
                .unwrap(),
        ] {
            let other = signer
                .sign_update_group("20261008T000000Z", &changed)
                .unwrap();
            assert_ne!(
                signed.headers["authorization"],
                other.headers["authorization"]
            );
        }
        let read = signer
            .sign_get_group("20261008T000000Z", &original("original-project"))
            .unwrap();
        assert_ne!(
            signed.headers["authorization"],
            read.headers["authorization"]
        );
        assert!(signer.sign_update_group("invalid", &request()).is_err());
    }
    #[tokio::test]
    async fn invalid_bounds_fail_before_network() {
        let signer =
            AssetManagementSigner::new("AKEXAMPLE".into(), "fixture-secret".into()).unwrap();
        for (maximum, timeout) in [
            (0, Duration::from_secs(1)),
            (1024 * 1024 + 1, Duration::from_secs(1)),
            (1, Duration::ZERO),
            (1, Duration::from_secs(31)),
        ] {
            assert_eq!(
                update_group_now(&signer, &request(), maximum, timeout).await,
                Err(ReadError::InvalidConfiguration)
            );
        }
    }
}
