use std::collections::HashSet;

use axum::http::Method;
use semver::Version;
use serde::Deserialize;

pub(super) const HEALTH_LIVE_PATH: &str = "/_niu/enterprise/v1/health/live";
pub(super) const HEALTH_READY_PATH: &str = "/_niu/enterprise/v1/health/ready";

#[derive(Debug, thiserror::Error)]
#[error("{0}")]
pub(crate) struct EnterpriseError(pub(super) String);

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct ReleaseManifest {
    pub(super) contract: String,
    pub(super) niu_core: CoreRelease,
    pub(super) modules: Vec<ModuleDeclaration>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct CoreRelease {
    pub(super) git_commit: String,
    pub(super) api_version: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct ModuleDeclaration {
    pub(super) module_id: String,
    module_version: String,
    module_api_version: String,
    core_api: ApiRange,
    pub(super) required: bool,
    pub(super) socket_path: String,
    pub(super) health: HealthPaths,
    pub(super) routes: Vec<RouteDeclaration>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct ApiRange {
    minimum: String,
    maximum_exclusive: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct HealthPaths {
    pub(super) live_path: String,
    pub(super) ready_path: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct RouteDeclaration {
    pub(super) path_prefix: String,
    pub(super) methods: Vec<RouteMethod>,
    pub(super) permission: RoutePermission,
    pub(super) timeout_ms: u64,
    pub(super) max_request_bytes: usize,
    pub(super) max_response_bytes: usize,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, Hash, PartialEq)]
#[serde(rename_all = "UPPERCASE")]
pub(super) enum RouteMethod {
    Get,
    Post,
    Put,
    Patch,
    Delete,
}

impl RouteMethod {
    pub(super) fn as_str(self) -> &'static str {
        match self {
            Self::Get => "GET",
            Self::Post => "POST",
            Self::Put => "PUT",
            Self::Patch => "PATCH",
            Self::Delete => "DELETE",
        }
    }

    pub(super) fn matches(self, method: &Method) -> bool {
        method.as_str() == self.as_str()
    }
}

pub(super) fn route_allows_method(methods: &[RouteMethod], method: &Method) -> bool {
    methods.iter().any(|allowed| allowed.matches(method))
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq)]
#[serde(rename_all = "snake_case")]
pub(super) enum RoutePermission {
    Read,
    Write,
    ManageOperators,
}

impl RoutePermission {
    pub(super) fn as_str(self) -> &'static str {
        match self {
            Self::Read => "read",
            Self::Write => "write",
            Self::ManageOperators => "manage_operators",
        }
    }

    pub(super) fn permits(self, role: niu_storage::OperatorRole) -> bool {
        match self {
            Self::Read => true,
            Self::Write => matches!(
                role,
                niu_storage::OperatorRole::Owner | niu_storage::OperatorRole::Admin
            ),
            Self::ManageOperators => role == niu_storage::OperatorRole::Owner,
        }
    }
}

pub(super) fn validate_manifest(
    manifest: &ReleaseManifest,
    core_version: &str,
    expected_commit: &str,
) -> Result<(), EnterpriseError> {
    if manifest.contract != "niu.enterprise.release-manifest.v1" {
        return invalid("contract must be niu.enterprise.release-manifest.v1");
    }
    if !is_commit(&manifest.niu_core.git_commit) {
        return invalid("niu_core.git_commit must be a full lowercase 40-character Git SHA");
    }
    if !is_commit(expected_commit) || manifest.niu_core.git_commit != expected_commit {
        return invalid("manifest core commit does not match the Gateway build commit");
    }
    let core_version = parse_version(core_version, "Gateway API version")?;
    let manifest_core_version =
        parse_version(&manifest.niu_core.api_version, "niu_core.api_version")?;
    if core_version != manifest_core_version {
        return invalid("manifest core API version does not match the Gateway build version");
    }
    if manifest.modules.is_empty() {
        return invalid("modules must contain at least one module");
    }

    let mut module_ids = HashSet::new();
    let mut sockets = HashSet::new();
    let mut route_paths: Vec<&str> = Vec::new();
    for module in &manifest.modules {
        if !valid_module_id(&module.module_id) || module.module_id.len() > 80 {
            return invalid("module_id is invalid");
        }
        if !module_ids.insert(module.module_id.as_str()) {
            return invalid("module IDs must be unique");
        }
        parse_version(&module.module_version, "module_version")?;
        if module.module_api_version != "niu.enterprise.service.v1" {
            return invalid("module_api_version must be niu.enterprise.service.v1");
        }
        let minimum = parse_version(&module.core_api.minimum, "core_api.minimum")?;
        let maximum = parse_version(
            &module.core_api.maximum_exclusive,
            "core_api.maximum_exclusive",
        )?;
        if minimum >= maximum || core_version < minimum || core_version >= maximum {
            return invalid("module core_api range does not include the Gateway API version");
        }
        if !valid_socket_path(&module.socket_path) || module.socket_path.len() > 107 {
            return invalid("socket_path must be at most 107 bytes under /run/niu/modules");
        }
        if !sockets.insert(module.socket_path.as_str()) {
            return invalid("module socket paths must be unique");
        }
        if module.health.live_path != HEALTH_LIVE_PATH
            || module.health.ready_path != HEALTH_READY_PATH
        {
            return invalid("module health paths do not match the v1 health contract");
        }
        if module.routes.is_empty() {
            return invalid("each module must declare at least one route");
        }
        for route in &module.routes {
            if !valid_route_path(&route.path_prefix) || route.path_prefix.len() > 200 {
                return invalid("route path_prefix is invalid");
            }
            let path_module_id = route.path_prefix.split('/').nth(4).unwrap_or_default();
            if path_module_id != module.module_id {
                return invalid("route path_prefix namespace must match its module_id");
            }
            if route.methods.is_empty() {
                return invalid("route methods must not be empty");
            }
            let mut methods = HashSet::new();
            for method in &route.methods {
                if !methods.insert(*method) {
                    return invalid("route methods must be unique");
                }
                if matches!(
                    method,
                    RouteMethod::Post | RouteMethod::Put | RouteMethod::Patch | RouteMethod::Delete
                ) && route.permission == RoutePermission::Read
                {
                    return invalid(
                        "mutating route methods require write or manage_operators permission",
                    );
                }
            }
            if !(1..=30_000).contains(&route.timeout_ms) {
                return invalid("route timeout_ms must be between 1 and 30000");
            }
            if route.max_request_bytes > 1_048_576 {
                return invalid("route max_request_bytes must not exceed 1048576");
            }
            if !(1..=8_388_608).contains(&route.max_response_bytes) {
                return invalid("route max_response_bytes must be between 1 and 8388608");
            }
            for core_path in CORE_ROUTE_PREFIXES {
                if path_patterns_overlap(&route.path_prefix, core_path) {
                    return invalid("module route overlaps a Niu core route");
                }
            }
            for registered in &route_paths {
                if path_patterns_overlap(&route.path_prefix, registered) {
                    return invalid("module route prefixes must not overlap");
                }
            }
            route_paths.push(route.path_prefix.as_str());
        }
    }
    Ok(())
}

fn invalid(message: &str) -> Result<(), EnterpriseError> {
    Err(EnterpriseError(format!(
        "invalid Enterprise release manifest: {message}"
    )))
}

fn parse_version(value: &str, field: &str) -> Result<Version, EnterpriseError> {
    if value.len() > 100 {
        return Err(EnterpriseError(format!(
            "invalid Enterprise release manifest: {field} must not exceed 100 bytes"
        )));
    }
    Version::parse(value).map_err(|_| {
        EnterpriseError(format!(
            "invalid Enterprise release manifest: {field} must be a semantic version"
        ))
    })
}

fn is_commit(value: &str) -> bool {
    value.len() == 40
        && value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
}

fn valid_module_id(value: &str) -> bool {
    let segments = value.split(['.', '-']);
    !value.is_empty()
        && value.as_bytes()[0].is_ascii_lowercase()
        && segments.clone().all(|segment| {
            !segment.is_empty()
                && segment
                    .bytes()
                    .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit())
        })
}

fn valid_socket_path(value: &str) -> bool {
    let Some(name) = value.strip_prefix("/run/niu/modules/") else {
        return false;
    };
    let Some(module_id) = name.strip_suffix(".sock") else {
        return false;
    };
    valid_module_id(module_id)
}

fn valid_route_path(value: &str) -> bool {
    let Some(path) = value.strip_prefix("/enterprise/api/v1/") else {
        return false;
    };
    !path.is_empty()
        && path.split('/').all(|segment| {
            if segment.is_empty() {
                return false;
            }
            if segment.starts_with('{') || segment.ends_with('}') {
                let Some(name) = segment
                    .strip_prefix('{')
                    .and_then(|name| name.strip_suffix('}'))
                else {
                    return false;
                };
                return !name.is_empty()
                    && name.bytes().all(|byte| {
                        byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'.' | b'-')
                    });
            }
            segment
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'.' | b'-'))
        })
}

pub(super) const CORE_ROUTE_PREFIXES: &[&str] = &[
    "/",
    "/healthz",
    "/readyz",
    "/enterprise/readyz",
    "/v1",
    "/catalog/v1",
    "/admin/v1",
    "/docs",
    "/models",
    "/workspaces",
    "/_astro",
    "/site-assets",
    "/_catalog",
    "/catalog-assets",
    "/assets",
    "/favicon.ico",
    "/robots.txt",
    "/sitemap.xml",
];

fn path_patterns_overlap(left: &str, right: &str) -> bool {
    let left_segments: Vec<_> = left.trim_matches('/').split('/').collect();
    let right_segments: Vec<_> = right.trim_matches('/').split('/').collect();
    for (left, right) in left_segments.iter().zip(&right_segments) {
        if *left == "*" || *right == "*" || is_parameter(left) || is_parameter(right) {
            continue;
        }
        if left != right {
            return false;
        }
    }
    true
}

fn is_parameter(segment: &str) -> bool {
    segment.starts_with('{') && segment.ends_with('}')
}

pub(super) fn route_matches_path(prefix: &str, path: &str) -> bool {
    let prefix_segments: Vec<_> = prefix.trim_matches('/').split('/').collect();
    let path_segments: Vec<_> = path.trim_matches('/').split('/').collect();
    if path_segments.len() < prefix_segments.len() {
        return false;
    }
    prefix_segments
        .iter()
        .zip(path_segments)
        .all(|(prefix, segment)| {
            if is_parameter(prefix) {
                !segment.is_empty()
            } else {
                *prefix == segment
            }
        })
}

#[cfg(test)]
mod tests {
    use super::{
        CORE_ROUTE_PREFIXES, ReleaseManifest, RouteMethod, RoutePermission, path_patterns_overlap,
        route_allows_method, route_matches_path, valid_route_path, validate_manifest,
    };
    use axum::http::Method;
    use serde_json::json;

    const COMMIT: &str = "0123456789abcdef0123456789abcdef01234567";

    fn manifest() -> ReleaseManifest {
        serde_json::from_value(json!({
            "contract":"niu.enterprise.release-manifest.v1",
            "niu_core":{"git_commit":COMMIT,"api_version":"0.1.0"},
            "modules":[{
                "module_id":"experiments",
                "module_version":"1.2.3",
                "module_api_version":"niu.enterprise.service.v1",
                "core_api":{"minimum":"0.1.0","maximum_exclusive":"0.2.0"},
                "required":true,
                "socket_path":"/run/niu/modules/experiments.sock",
                "health":{"live_path":"/_niu/enterprise/v1/health/live","ready_path":"/_niu/enterprise/v1/health/ready"},
                "routes":[{
                    "path_prefix":"/enterprise/api/v1/experiments/runs/{run_id}",
                    "methods":["GET"],"permission":"read","timeout_ms":1000,"max_request_bytes":4096,"max_response_bytes":1048576
                }]
            }]
        }))
        .unwrap()
    }

    #[test]
    fn validates_core_pins_compatibility_and_module_route_namespace() {
        let manifest = manifest();
        validate_manifest(&manifest, "0.1.0", COMMIT).unwrap();
        assert!(
            validate_manifest(
                &manifest,
                "0.1.0",
                "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
            )
            .is_err()
        );
        assert!(validate_manifest(&manifest, "0.2.0", COMMIT).is_err());
        assert!(
            validate_manifest(&manifest, &format!("0.1.0+{}", "a".repeat(100)), COMMIT).is_err()
        );

        let mut mismatched = manifest;
        mismatched.modules[0].routes[0].path_prefix =
            "/enterprise/api/v1/other/runs/{run_id}".into();
        assert!(validate_manifest(&mismatched, "0.1.0", COMMIT).is_err());
    }

    #[test]
    fn rejects_duplicate_module_ids_and_overlapping_or_core_routes() {
        let mut duplicate_module = manifest();
        duplicate_module
            .modules
            .push(duplicate_module.modules[0].clone());
        assert!(validate_manifest(&duplicate_module, "0.1.0", COMMIT).is_err());

        let mut overlapping = manifest();
        let duplicate_route = overlapping.modules[0].routes[0].clone();
        overlapping.modules[0].routes.push(duplicate_route);
        assert!(validate_manifest(&overlapping, "0.1.0", COMMIT).is_err());
        assert!(
            CORE_ROUTE_PREFIXES
                .iter()
                .any(|core| path_patterns_overlap("/admin/v1/organizations/{id}", core))
        );
        assert!(path_patterns_overlap(
            "/enterprise/api/v1/experiments/{id}",
            "/enterprise/api/v1/experiments/active"
        ));
        assert!(!path_patterns_overlap(
            "/enterprise/api/v1/experiments",
            "/enterprise/api/v1/audit"
        ));
        let mut oversized_module_id = manifest();
        oversized_module_id.modules[0].module_id = format!("a{}", "b".repeat(80));
        assert!(validate_manifest(&oversized_module_id, "0.1.0", COMMIT).is_err());
    }

    #[test]
    fn route_matcher_observes_namespace_boundaries_and_template_segments() {
        let prefix = "/enterprise/api/v1/experiments/runs/{run_id}";
        assert!(valid_route_path(prefix));
        assert!(route_matches_path(
            prefix,
            "/enterprise/api/v1/experiments/runs/abc/events"
        ));
        assert!(!route_matches_path(
            "/enterprise/api/v1/experiments",
            "/enterprise/api/v1/experiments-extra"
        ));
        assert!(!route_matches_path(
            prefix,
            "/enterprise/api/v1/experiments/runs/"
        ));
        assert!(!valid_route_path("/admin/v1/organizations/{id}"));
        assert!(route_allows_method(&[RouteMethod::Get], &Method::GET));
        assert!(!route_allows_method(&[RouteMethod::Get], &Method::POST));
        assert_eq!(RoutePermission::Read.as_str(), "read");
        assert!(!RoutePermission::Write.permits(niu_storage::OperatorRole::Viewer));
        assert_eq!(Method::GET.as_str(), "GET");
    }
}
