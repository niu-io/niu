//! Platform-owned upstream operational incidents and verified recovery evidence.
use super::{AdminPermission, ApiError, AppState, HeaderMap, Json, Path, State, Uuid};
use axum::extract::Query;
use axum::response::IntoResponse;
use serde::Deserialize;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct IncidentQuery {
    before: Option<String>,
}

/// ```openapi
/// {
///   "path": "/api/v1/vendors/{vendor}/incidents",
///   "method": "get",
///   "operation": {
///     "operationId": "listVendorIncidents",
///     "summary": "Read upstream connection incidents and recovery evidence",
///     "description": "Requires platform administration. Returns adapter-qualified refusals grouped by connection and model, with durable references, occurrence counts and evidence-based recovery times. Covers recognized account restrictions and qualified OpenRouter authentication refusals. Unknown HTTP refusals do not establish an account restriction. Recovery requires a later confirmed complete successful request under the current connection revision. This read performs no upstream request, retries, routing changes or financial mutations. No request content, raw upstream bodies, credentials, procurement prices or tenant identities are returned. Pages contain at most 50 records, newest incident first. Follow next_before; a null cursor ends the current view.",
///     "security": [{"bearerAuth": []}],
///     "parameters": [
///       {"name":"vendor","in":"path","required":true,"schema":{"type":"string","format":"uuid"}},
///       {"name":"before","in":"query","required":false,"schema":{"type":"string","pattern":"^incident-[1-9][0-9]*$"},"description":"Durable incident reference from next_before."}
///     ],
///     "responses": {
///       "200": {"description":"Sanitized operational incidents","content":{"application/json":{"schema":{
///         "type":"object","required":["data","next_before"],"properties":{
///           "data":{"type":"array","maxItems":50,"items":{
///             "type":"object","required":["reference","model","cause","status","first_observed_at","last_observed_at","observations","recovered_at"],
///             "properties":{
///               "reference":{"type":"string"},"model":{"type":"string"},
///               "cause":{"type":"string","enum":["account_restricted","authentication_rejected"]},
///               "status":{"type":"string","enum":["active","resolved"]},
///               "first_observed_at":{"type":"string","format":"date-time"},
///               "last_observed_at":{"type":"string","format":"date-time"},
///               "observations":{"type":"string","pattern":"^[1-9][0-9]*$"},
///               "recovered_at":{"type":["string","null"],"format":"date-time"}
///             }
///           }},
///           "next_before":{"type":["string","null"]}
///         }
///       }}}},
///       "400":{"description":"Invalid cursor"},
///       "401":{"description":"Authentication required"},
///       "403":{"description":"Platform administration required"},
///       "404":{"description":"Connection unavailable"},
///       "503":{"description":"Operational evidence unavailable"}
///     },
///     "x-niu-implementation":"implemented"
///   }
/// }
/// ```
pub async fn list(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(vendor): Path<Uuid>,
    Query(query): Query<IncidentQuery>,
) -> Result<axum::response::Response, ApiError> {
    let auth = state
        .authorize_admin_headers(&headers, AdminPermission::Read)
        .await?;
    if !auth.can_manage_platform() {
        return Err(ApiError::forbidden());
    }
    let before = incident_cursor(query.before)?;
    state
        .store
        .vendor(vendor)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::not_found)?;
    let mut response = Json(
        state
            .store
            .connection_incidents(vendor, before)
            .await
            .map_err(ApiError::from_store)?,
    )
    .into_response();
    response.headers_mut().insert(
        axum::http::header::CACHE_CONTROL,
        axum::http::HeaderValue::from_static("no-store"),
    );
    Ok(response)
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PlatformIncidentQuery {
    before: Option<String>,
    status: Option<String>,
}

/// ```openapi
/// {
///   "path":"/api/v1/incidents","method":"get",
///   "operation":{
///     "operationId":"listConnectionIncidents",
///     "summary":"Read platform upstream connection incidents",
///     "description":"Platform administration only. Reads recognized model-scoped upstream incidents across connections, with their meaningful connection name and optional Provider name/slug. Includes sanitized incident evidence only. Filter active or resolved and follow next_before for at most 50 results per page. No upstream calls, configuration changes or financial mutations. Cache-Control no-store. An empty result means no covered incidents are recorded, not proof of healthy supply.",
///     "security":[{"bearerAuth":[]}],
///     "parameters":[
///       {"name":"status","in":"query","schema":{"type":"string","enum":["active","resolved"]}},
///       {"name":"before","in":"query","schema":{"type":"string","pattern":"^incident-[1-9][0-9]*$"}}
///     ],
///     "responses":{
///       "200":{"description":"Sanitized connection incident page","content":{"application/json":{"schema":{
///         "type":"object","required":["data","next_before"],"properties":{
///           "next_before":{"type":["string","null"]},
///           "data":{"type":"array","maxItems":50,"items":{
///             "type":"object","required":["reference","model","cause","status","first_observed_at","last_observed_at","observations","recovered_at","connection_name","provider"],
///             "properties":{
///               "reference":{"type":"string"},"model":{"type":"string"},"connection_name":{"type":"string"},
///               "cause":{"type":"string","enum":["account_restricted","authentication_rejected"]},
///               "status":{"type":"string","enum":["active","resolved"]},
///               "first_observed_at":{"type":"string","format":"date-time"},"last_observed_at":{"type":"string","format":"date-time"},
///               "observations":{"type":"string","pattern":"^[1-9][0-9]*$"},"recovered_at":{"type":["string","null"],"format":"date-time"},
///               "provider":{"type":["object","null"],"required":["name","slug"],"properties":{"name":{"type":"string"},"slug":{"type":"string"}}}
///             }
///           }}
///         }
///       }}}},
///       "400":{"description":"Invalid filter or cursor"},"401":{"description":"Authentication required"},
///       "403":{"description":"Platform administration required"},"503":{"description":"Incident evidence unavailable"}
///     },"x-niu-implementation":"implemented"
///   }
/// }
/// ```
pub async fn platform_list(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<PlatformIncidentQuery>,
) -> Result<axum::response::Response, ApiError> {
    let auth = state
        .authorize_admin_headers(&headers, AdminPermission::Read)
        .await?;
    if !auth.can_manage_platform() {
        return Err(ApiError::forbidden());
    }
    if query
        .status
        .as_ref()
        .is_some_and(|status| !matches!(status.as_str(), "active" | "resolved"))
    {
        return Err(ApiError::invalid_request(
            "Choose active or resolved incidents",
        ));
    }
    let before = incident_cursor(query.before)?;
    let mut response = Json(
        state
            .store
            .platform_connection_incidents(None, query.status.as_deref(), before)
            .await
            .map_err(ApiError::from_store)?,
    )
    .into_response();
    response.headers_mut().insert(
        axum::http::header::CACHE_CONTROL,
        axum::http::HeaderValue::from_static("no-store"),
    );
    Ok(response)
}

fn incident_cursor(before: Option<String>) -> Result<Option<i64>, ApiError> {
    before
        .map(|value| {
            value
                .strip_prefix("incident-")
                .filter(|suffix| {
                    !suffix.starts_with('0') && suffix.bytes().all(|byte| byte.is_ascii_digit())
                })
                .and_then(|value| value.parse::<i64>().ok())
                .filter(|value| *value > 0)
                .ok_or_else(|| {
                    ApiError::invalid_request(
                        "Use the incident reference from the next page cursor",
                    )
                })
        })
        .transpose()
}
