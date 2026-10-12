//! NIU domain mapping for FastRouter actions. Provider references and verification
//! capabilities stay private; these objects are not workspace authorization or
//! evidence of processing readiness beyond the actual returned status.
use crate::fastrouter_actions::{FastRouterAction, FastRouterActionResponse};
use serde::Serialize;
use serde_json::{Value, json};
use url::Url;

#[derive(Debug)]
pub enum FastRouterDomainError {
    InvalidRequest,
    InvalidResponse,
}
#[derive(Clone, Copy, Serialize, PartialEq, Eq, Debug)]
#[serde(rename_all = "snake_case")]
pub enum FastRouterGroupKind {
    Generated,
    Person,
}
impl FastRouterGroupKind {
    fn wire(self) -> &'static str {
        match self {
            Self::Generated => "AIGC",
            Self::Person => "LivenessFace",
        }
    }
}
#[derive(Clone, Copy, Serialize, PartialEq, Eq, Debug)]
#[serde(rename_all = "snake_case")]
pub enum FastRouterAssetKind {
    Image,
    Video,
    Audio,
}
impl FastRouterAssetKind {
    fn wire(self) -> &'static str {
        match self {
            Self::Image => "Image",
            Self::Video => "Video",
            Self::Audio => "Audio",
        }
    }
}
#[derive(Clone, Copy, Serialize, PartialEq, Eq, Debug)]
#[serde(rename_all = "snake_case")]
pub enum FastRouterAssetStatus {
    Processing,
    Active,
    Failed,
}
#[derive(Clone, Copy, Serialize, PartialEq, Eq, Debug)]
#[serde(rename_all = "snake_case")]
pub enum FastRouterVerificationStatus {
    WaitingUser,
    Processing,
    Verified,
    Failed,
    Expired,
}

/// Original opaque provider identity, never a workspace routing ID or UI label.
/// No Debug/Serialize. Prefixes do not establish ownership or group privileges.
pub struct FastRouterProviderReference(String);
impl FastRouterProviderReference {
    pub fn parse(value: &str) -> Result<Self, FastRouterDomainError> {
        if value.is_empty()
            || value.len() > 256
            || !value
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b"_-.:".contains(&b))
        {
            return Err(FastRouterDomainError::InvalidResponse);
        }
        Ok(Self(value.to_owned()))
    }
    pub fn private_ref(&self) -> &str {
        &self.0
    }
}
fn text(value: &str, maximum: usize) -> bool {
    !value.trim().is_empty()
        && value.trim() == value
        && value.chars().count() <= maximum
        && !value.chars().any(char::is_control)
}
fn optional_description(value: Option<&str>) -> bool {
    value.is_none_or(|v| {
        v.chars().count() <= 300
            && !v
                .chars()
                .any(|c| c.is_control() && !matches!(c, '\n' | '\t' | '\r'))
    })
}
fn https(value: &str) -> bool {
    value.len() <= 8192
        && Url::parse(value).is_ok_and(|u| {
            u.scheme() == "https"
                && u.host_str().is_some()
                && u.username().is_empty()
                && u.password().is_none()
                && u.fragment().is_none()
        })
}
/// No Person constructor: a genuine successful verification supplies that group.
pub struct FastRouterGroupCreate {
    pub name: String,
    pub description: Option<String>,
}
impl FastRouterGroupCreate {
    pub fn body(&self) -> Result<Value, FastRouterDomainError> {
        if !text(&self.name, 64) || !optional_description(self.description.as_deref()) {
            return Err(FastRouterDomainError::InvalidRequest);
        }
        let mut body = json!({"Name":self.name,"GroupType":"AIGC"});
        if let Some(description) = &self.description {
            body["Description"] = json!(description)
        }
        Ok(body)
    }
}
pub struct FastRouterGroupUpdate<'a> {
    pub reference: &'a FastRouterProviderReference,
    pub name: Option<String>,
    pub description: Option<String>,
}
impl FastRouterGroupUpdate<'_> {
    pub fn body(&self) -> Result<Value, FastRouterDomainError> {
        if self.name.is_none() && self.description.is_none()
            || self.name.as_ref().is_some_and(|v| !text(v, 64))
            || !optional_description(self.description.as_deref())
        {
            return Err(FastRouterDomainError::InvalidRequest);
        }
        let mut body = json!({"Id":self.reference.private_ref()});
        if let Some(name) = &self.name {
            body["Name"] = json!(name)
        }
        if let Some(description) = &self.description {
            body["Description"] = json!(description)
        }
        Ok(body)
    }
}
pub struct FastRouterAssetCreate<'a> {
    pub group_reference: &'a FastRouterProviderReference,
    pub url: String,
    pub name: Option<String>,
    pub kind: FastRouterAssetKind,
}
impl FastRouterAssetCreate<'_> {
    pub fn body(&self) -> Result<Value, FastRouterDomainError> {
        if !https(&self.url) || self.name.as_ref().is_some_and(|v| !text(v, 64)) {
            return Err(FastRouterDomainError::InvalidRequest);
        }
        let mut body = json!({"GroupId":self.group_reference.private_ref(),"URL":self.url,"AssetType":self.kind.wire()});
        if let Some(name) = &self.name {
            body["Name"] = json!(name)
        }
        Ok(body)
    }
}
pub struct FastRouterAssetRename<'a> {
    pub reference: &'a FastRouterProviderReference,
    pub name: String,
}
impl FastRouterAssetRename<'_> {
    pub fn body(&self) -> Result<Value, FastRouterDomainError> {
        if !text(&self.name, 64) {
            return Err(FastRouterDomainError::InvalidRequest);
        }
        Ok(json!({"Id":self.reference.private_ref(),"Name":self.name}))
    }
}
pub fn reference_body(reference: &FastRouterProviderReference) -> Value {
    json!({"Id":reference.private_ref()})
}
#[derive(Clone, Copy)]
pub enum FastRouterSortOrder {
    Ascending,
    Descending,
}
impl FastRouterSortOrder {
    fn wire(self) -> &'static str {
        match self {
            Self::Ascending => "Asc",
            Self::Descending => "Desc",
        }
    }
}
#[derive(Clone, Copy)]
pub enum FastRouterSortBy {
    Created,
    Updated,
    Group,
}
impl FastRouterSortBy {
    fn wire(self) -> &'static str {
        match self {
            Self::Created => "CreateTime",
            Self::Updated => "UpdateTime",
            Self::Group => "GroupId",
        }
    }
}
pub struct FastRouterPageRequest {
    pub page_number: u32,
    pub page_size: u16,
    pub sort_by: Option<FastRouterSortBy>,
    pub sort_order: Option<FastRouterSortOrder>,
}
impl FastRouterPageRequest {
    fn body(&self, group: bool) -> Result<Value, FastRouterDomainError> {
        if self.page_number == 0
            || !(1..=100).contains(&self.page_size)
            || group && matches!(self.sort_by, Some(FastRouterSortBy::Group))
        {
            return Err(FastRouterDomainError::InvalidRequest);
        }
        let mut body = json!({"PageNumber":self.page_number,"PageSize":self.page_size});
        if let Some(sort) = self.sort_by {
            body["SortBy"] = json!(sort.wire())
        }
        if let Some(sort) = self.sort_order {
            body["SortOrder"] = json!(sort.wire())
        }
        Ok(body)
    }
}
pub struct FastRouterGroupList<'a> {
    pub kind: FastRouterGroupKind,
    pub references: &'a [&'a FastRouterProviderReference],
    pub name: Option<String>,
    pub page: FastRouterPageRequest,
}
impl FastRouterGroupList<'_> {
    pub fn body(&self) -> Result<Value, FastRouterDomainError> {
        if self.references.len() > 100 || self.name.as_ref().is_some_and(|v| !text(v, 64)) {
            return Err(FastRouterDomainError::InvalidRequest);
        }
        let mut body = self.page.body(true)?;
        let mut filter = json!({"GroupType":self.kind.wire()});
        if !self.references.is_empty() {
            filter["GroupIds"] = json!(
                self.references
                    .iter()
                    .map(|r| r.private_ref())
                    .collect::<Vec<_>>()
            )
        }
        if let Some(name) = &self.name {
            filter["Name"] = json!(name)
        }
        body["Filter"] = filter;
        Ok(body)
    }
}
pub struct FastRouterAssetList<'a> {
    pub group_references: &'a [&'a FastRouterProviderReference],
    pub group_kind: Option<FastRouterGroupKind>,
    pub statuses: &'a [FastRouterAssetStatus],
    pub name: Option<String>,
    pub page: FastRouterPageRequest,
}
impl FastRouterAssetList<'_> {
    pub fn body(&self) -> Result<Value, FastRouterDomainError> {
        if self.group_references.len() > 100
            || self.statuses.len() > 3
            || self.name.as_ref().is_some_and(|v| !text(v, 64))
        {
            return Err(FastRouterDomainError::InvalidRequest);
        }
        let mut body = self.page.body(false)?;
        let mut filter = json!({});
        if !self.group_references.is_empty() {
            filter["GroupIds"] = json!(
                self.group_references
                    .iter()
                    .map(|r| r.private_ref())
                    .collect::<Vec<_>>()
            )
        }
        if let Some(kind) = self.group_kind {
            filter["GroupType"] = json!(kind.wire())
        }
        if !self.statuses.is_empty() {
            filter["Statuses"] = json!(
                self.statuses
                    .iter()
                    .map(|s| match s {
                        FastRouterAssetStatus::Processing => "Processing",
                        FastRouterAssetStatus::Active => "Active",
                        FastRouterAssetStatus::Failed => "Failed",
                    })
                    .collect::<Vec<_>>()
            )
        }
        if let Some(name) = &self.name {
            filter["Name"] = json!(name)
        }
        if filter.as_object().is_some_and(|v| !v.is_empty()) {
            body["Filter"] = filter
        }
        Ok(body)
    }
}
/// Explicit adapter configuration for the documented flat-form channel. This
/// changes payload shape only; it never infers permissions from an ID prefix.
fn flat_filter(mut body: Value) -> Value {
    if let Some(Value::Object(filter)) = body
        .as_object_mut()
        .and_then(|value| value.remove("Filter"))
        && let Some(fields) = body.as_object_mut()
    {
        fields.extend(filter);
    }
    body
}
impl FastRouterGroupList<'_> {
    pub fn flat_channel_body(&self) -> Result<Value, FastRouterDomainError> {
        self.body().map(flat_filter)
    }
}
impl FastRouterAssetList<'_> {
    pub fn flat_channel_body(&self) -> Result<Value, FastRouterDomainError> {
        self.body().map(flat_filter)
    }
}

pub struct FastRouterVerificationCreate {
    pub return_url: Option<String>,
    pub subject_name: Option<String>,
}
impl FastRouterVerificationCreate {
    pub fn body(&self) -> Result<Value, FastRouterDomainError> {
        if self.return_url.as_ref().is_some_and(|v| !https(v))
            || self.subject_name.as_ref().is_some_and(|v| !text(v, 32))
        {
            return Err(FastRouterDomainError::InvalidRequest);
        }
        let mut body = json!({});
        if let Some(url) = &self.return_url {
            body["ReturnUrl"] = json!(url)
        }
        if let Some(name) = &self.subject_name {
            body["ArtistName"] = json!(name)
        }
        Ok(body)
    }
}
/// One private session. Neither the provider token nor raw result is serialized.
pub struct FastRouterVerificationSession {
    token: String,
    h5_url: String,
    expires_at: Option<String>,
}
impl FastRouterVerificationSession {
    pub fn private_h5_url(&self) -> &str {
        &self.h5_url
    }
    pub fn expires_at(&self) -> Option<&str> {
        self.expires_at.as_deref()
    }
    /// Backend-only encrypted persistence; never a customer response field.
    pub fn private_session_token(&self) -> &str {
        &self.token
    }
    pub fn query_body(&self) -> Value {
        json!({"BytedToken":self.token})
    }
}
#[derive(Serialize)]
pub struct FastRouterGroup {
    #[serde(skip)]
    reference: FastRouterProviderReference,
    pub name: Option<String>,
    pub description: Option<String>,
    pub kind: FastRouterGroupKind,
}
impl FastRouterGroup {
    pub fn private_reference(&self) -> &FastRouterProviderReference {
        &self.reference
    }
}
#[derive(Serialize)]
pub struct FastRouterAsset {
    #[serde(skip)]
    reference: FastRouterProviderReference,
    #[serde(skip)]
    group_reference: FastRouterProviderReference,
    pub name: Option<String>,
    pub kind: FastRouterAssetKind,
    pub status: FastRouterAssetStatus,
}
impl FastRouterAsset {
    pub fn private_reference(&self) -> &FastRouterProviderReference {
        &self.reference
    }
    pub fn private_group_reference(&self) -> &FastRouterProviderReference {
        &self.group_reference
    }
}
#[derive(Serialize)]
pub struct FastRouterDomainPage<T: Serialize> {
    pub items: Vec<T>,
    pub total: u64,
    pub page_number: u32,
    pub page_size: u16,
}
#[derive(Serialize)]
pub struct FastRouterVerificationResult {
    pub status: FastRouterVerificationStatus,
    #[serde(skip)]
    group_reference: Option<FastRouterProviderReference>,
}
impl FastRouterVerificationResult {
    pub fn private_group_reference(&self) -> Option<&FastRouterProviderReference> {
        self.group_reference.as_ref()
    }
}
fn result(
    response: &FastRouterActionResponse,
    action: FastRouterAction,
) -> Result<&Value, FastRouterDomainError> {
    if response.action() != action {
        return Err(FastRouterDomainError::InvalidResponse);
    }
    Ok(response.result())
}
fn reference(
    value: &Value,
    key: &str,
) -> Result<FastRouterProviderReference, FastRouterDomainError> {
    FastRouterProviderReference::parse(
        value[key]
            .as_str()
            .ok_or(FastRouterDomainError::InvalidResponse)?,
    )
}
fn optional_text(
    value: &Value,
    key: &str,
    maximum: usize,
) -> Result<Option<String>, FastRouterDomainError> {
    match value.get(key) {
        None | Some(Value::Null) => Ok(None),
        Some(Value::String(v))
            if v.chars().count() <= maximum
                && !v.chars().any(|c| {
                    c.is_control() && !(key == "Description" && matches!(c, '\n' | '\t' | '\r'))
                }) =>
        {
            Ok(Some(v.clone()))
        }
        _ => Err(FastRouterDomainError::InvalidResponse),
    }
}
fn group(value: &Value) -> Result<FastRouterGroup, FastRouterDomainError> {
    let kind = match value["GroupType"].as_str() {
        Some("AIGC") => FastRouterGroupKind::Generated,
        Some("LivenessFace") => FastRouterGroupKind::Person,
        _ => return Err(FastRouterDomainError::InvalidResponse),
    };
    Ok(FastRouterGroup {
        reference: reference(value, "Id")?,
        name: optional_text(value, "Name", 64)?,
        description: optional_text(value, "Description", 300)?,
        kind,
    })
}
fn asset(value: &Value) -> Result<FastRouterAsset, FastRouterDomainError> {
    let kind = match value["AssetType"].as_str() {
        Some("Image") => FastRouterAssetKind::Image,
        Some("Video") => FastRouterAssetKind::Video,
        Some("Audio") => FastRouterAssetKind::Audio,
        _ => return Err(FastRouterDomainError::InvalidResponse),
    };
    let status = match value["Status"].as_str() {
        Some("Processing") => FastRouterAssetStatus::Processing,
        Some("Active") => FastRouterAssetStatus::Active,
        Some("Failed") => FastRouterAssetStatus::Failed,
        _ => return Err(FastRouterDomainError::InvalidResponse),
    };
    Ok(FastRouterAsset {
        reference: reference(value, "Id")?,
        group_reference: reference(value, "GroupId")?,
        name: optional_text(value, "Name", 64)?,
        kind,
        status,
    })
}
pub fn decode_created_reference(
    response: &FastRouterActionResponse,
) -> Result<FastRouterProviderReference, FastRouterDomainError> {
    if !matches!(
        response.action(),
        FastRouterAction::CreateAssetGroup | FastRouterAction::CreateAsset
    ) {
        return Err(FastRouterDomainError::InvalidResponse);
    }
    reference(response.result(), "Id")
}
pub fn decode_group(
    response: &FastRouterActionResponse,
) -> Result<FastRouterGroup, FastRouterDomainError> {
    group(result(response, FastRouterAction::GetAssetGroup)?)
}
pub fn decode_asset(
    response: &FastRouterActionResponse,
) -> Result<FastRouterAsset, FastRouterDomainError> {
    asset(result(response, FastRouterAction::GetAsset)?)
}
fn page<T: Serialize>(
    value: &Value,
    decode: fn(&Value) -> Result<T, FastRouterDomainError>,
) -> Result<FastRouterDomainPage<T>, FastRouterDomainError> {
    let total = value["TotalCount"]
        .as_u64()
        .ok_or(FastRouterDomainError::InvalidResponse)?;
    let number = value["PageNumber"]
        .as_u64()
        .and_then(|v| u32::try_from(v).ok())
        .filter(|v| *v > 0)
        .ok_or(FastRouterDomainError::InvalidResponse)?;
    let size = value["PageSize"]
        .as_u64()
        .and_then(|v| u16::try_from(v).ok())
        .filter(|v| (1..=100).contains(v))
        .ok_or(FastRouterDomainError::InvalidResponse)?;
    let items = value["Items"]
        .as_array()
        .filter(|items| items.len() <= usize::from(size))
        .ok_or(FastRouterDomainError::InvalidResponse)?;
    if items.len() as u64 > total {
        return Err(FastRouterDomainError::InvalidResponse);
    }
    Ok(FastRouterDomainPage {
        items: items.iter().map(decode).collect::<Result<_, _>>()?,
        total,
        page_number: number,
        page_size: size,
    })
}
pub fn decode_group_page(
    response: &FastRouterActionResponse,
) -> Result<FastRouterDomainPage<FastRouterGroup>, FastRouterDomainError> {
    page(result(response, FastRouterAction::ListAssetGroups)?, group)
}
pub fn decode_asset_page(
    response: &FastRouterActionResponse,
) -> Result<FastRouterDomainPage<FastRouterAsset>, FastRouterDomainError> {
    page(result(response, FastRouterAction::ListAssets)?, asset)
}
pub fn decode_verification_session(
    response: &FastRouterActionResponse,
) -> Result<FastRouterVerificationSession, FastRouterDomainError> {
    let value = result(response, FastRouterAction::CreateVisualValidateSession)?;
    let h5 = value["H5Link"]
        .as_str()
        .filter(|v| https(v))
        .ok_or(FastRouterDomainError::InvalidResponse)?;
    let token = value["BytedToken"]
        .as_str()
        .filter(|v| {
            !v.is_empty() && v.len() <= 8192 && v.trim() == *v && !v.chars().any(char::is_control)
        })
        .ok_or(FastRouterDomainError::InvalidResponse)?;
    let expires_at = optional_text(value, "ExpiresAt", 128)?;
    if expires_at
        .as_ref()
        .is_some_and(|v| chrono::DateTime::parse_from_rfc3339(v).is_err())
    {
        return Err(FastRouterDomainError::InvalidResponse);
    }
    Ok(FastRouterVerificationSession {
        token: token.to_owned(),
        h5_url: h5.to_owned(),
        expires_at,
    })
}
pub fn decode_verification_result(
    response: &FastRouterActionResponse,
) -> Result<FastRouterVerificationResult, FastRouterDomainError> {
    let value = result(response, FastRouterAction::GetVisualValidateResult)?;
    let group_reference = match value.get("GroupId") {
        None => None,
        Some(Value::String(v)) => Some(FastRouterProviderReference::parse(v)?),
        _ => return Err(FastRouterDomainError::InvalidResponse),
    };
    let status = match value.get("Status") {
        None if group_reference.is_some() => FastRouterVerificationStatus::Verified,
        None => FastRouterVerificationStatus::Processing,
        Some(Value::String(v)) => match v.as_str() {
            "waiting_user" => FastRouterVerificationStatus::WaitingUser,
            "callback_received" | "resolving" => FastRouterVerificationStatus::Processing,
            "verified" => FastRouterVerificationStatus::Verified,
            "failed" => FastRouterVerificationStatus::Failed,
            "expired" => FastRouterVerificationStatus::Expired,
            _ => return Err(FastRouterDomainError::InvalidResponse),
        },
        _ => return Err(FastRouterDomainError::InvalidResponse),
    };
    if (status == FastRouterVerificationStatus::Verified) != group_reference.is_some() {
        return Err(FastRouterDomainError::InvalidResponse);
    }
    Ok(FastRouterVerificationResult {
        status,
        group_reference,
    })
}
