//! Volcengine Ark video and asset-management protocol definitions and adapters.

use url::Url;

pub const MODULE_ID: &str = "volcengine";
pub const VIDEO_CHANNEL_ARK_DIRECT_V1: &str = "ark-direct-v1";
pub const ARK_HOSTNAME: &str = "ark.cn-beijing.volcengineapi.com";
pub const ARK_DIRECT_V3_API_BASE: &str = "https://ark.cn-beijing.volcengineapi.com/api/v3";
pub const ARK_DIRECT_V3_API_BASE_TRAILING_SLASH: &str =
    "https://ark.cn-beijing.volcengineapi.com/api/v3/";

pub const CREATE_ASSET_GROUP_ENDPOINT: &str =
    "https://ark.cn-beijing.volcengineapi.com/?Action=CreateAssetGroup&Version=2024-01-01";
pub const GET_ASSET_GROUP_ENDPOINT: &str =
    "https://ark.cn-beijing.volcengineapi.com/?Action=GetAssetGroup&Version=2024-01-01";
pub const UPDATE_ASSET_GROUP_ENDPOINT: &str =
    "https://ark.cn-beijing.volcengineapi.com/?Action=UpdateAssetGroup&Version=2024-01-01";
pub const DELETE_ASSET_GROUP_ENDPOINT: &str =
    "https://ark.cn-beijing.volcengineapi.com/?Action=DeleteAssetGroup&Version=2024-01-01";
pub const CREATE_ASSET_ENDPOINT: &str =
    "https://ark.cn-beijing.volcengineapi.com/?Action=CreateAsset&Version=2024-01-01";
pub const GET_ASSET_ENDPOINT: &str =
    "https://ark.cn-beijing.volcengineapi.com/?Action=GetAsset&Version=2024-01-01";
pub const LIST_ASSETS_ENDPOINT: &str =
    "https://ark.cn-beijing.volcengineapi.com/?Action=ListAssets&Version=2024-01-01";

/// Returns whether the configured API base matches the direct Volcengine Ark v3 endpoint.
pub fn is_direct_ark_v3_api_base(api_base: &str) -> bool {
    api_base == ARK_DIRECT_V3_API_BASE || api_base == ARK_DIRECT_V3_API_BASE_TRAILING_SLASH
}

/// Returns whether a parsed URL targets the canonical HTTPS Volcengine Ark origin.
pub fn is_direct_ark_https_origin(origin: &Url) -> bool {
    origin.scheme() == "https"
        && origin.host_str() == Some(ARK_HOSTNAME)
        && origin.port_or_known_default() == Some(443)
}

pub use crate::{
    asset_create, asset_group, asset_group_delete, asset_group_update, asset_list, asset_lookup,
    asset_read, asset_signing, asset_transport,
};
