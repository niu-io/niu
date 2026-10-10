use super::{
    AdminPermission, ApiError, AppState, HeaderMap, Json, Path, State, TenantScope, Uuid, Value,
    authorize, json,
};
use crate::guardrails::{EffectiveAccess, PolicyDraft};
use serde::Deserialize;

async fn validate_policy(
    state: &AppState,
    scope: TenantScope,
    policy: &PolicyDraft,
    message: &'static str,
) -> Result<(), ApiError> {
    policy
        .validate_shape()
        .map_err(|_| ApiError::invalid_request(message))?;
    for binding in &policy.input_detectors {
        if !state
            .detectors
            .get(&binding.detector)
            .is_some_and(|runtime| runtime.permits_live(scope.project_id, binding))
        {
            return Err(ApiError::invalid_request(
                "Detector requires workspace authorization, current processing consent and declared unmetered service",
            ));
        }
    }
    for binding in &policy.image_detectors {
        if !state
            .image_detectors
            .get(&binding.detector)
            .is_some_and(|runtime| {
                runtime.permits(&scope.project_id.to_string(), &binding.consent())
            })
        {
            return Err(ApiError::invalid_request(
                "Image detector requires workspace authorization, current image consent and declared unmetered service",
            ));
        }
    }
    if policy.input_rules.is_empty() && policy.output.is_none() {
        return Ok(());
    }
    let policy = policy.clone();
    crate::guardrails::input::run_bounded(INPUT_TEST_SLOTS.clone(), move || policy.validate())
        .await
        .map_err(|_| ApiError::unavailable())?
        .map_err(|_| ApiError::invalid_request(message))
}

async fn authorized(
    state: &AppState,
    headers: &HeaderMap,
    scope: TenantScope,
    permission: AdminPermission,
) -> Result<String, ApiError> {
    let authorization = authorize(state, headers, permission).await?;
    if !authorization.permits_project(scope) {
        return Err(ApiError::forbidden());
    }
    Ok(match authorization {
        crate::state::AdminAuthorization::Installation => "installation".to_string(),
        crate::state::AdminAuthorization::Operator(operator) => format!("operator:{}", operator.id),
    })
}

pub async fn read(
    State(state): State<AppState>,
    Path((organization_id, project_id)): Path<(Uuid, Uuid)>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    let scope = TenantScope {
        organization_id,
        project_id,
    };
    authorized(&state, &headers, scope, AdminPermission::Read).await?;
    Ok(Json(
        json!({"data":state.store.workspace_guardrail(scope).await.map_err(ApiError::from_store)?}),
    ))
}

pub async fn read_revision(
    State(state): State<AppState>,
    Path((organization_id, project_id, revision)): Path<(Uuid, Uuid, i64)>,
    headers: HeaderMap,
) -> Result<([(&'static str, &'static str); 1], Json<Value>), ApiError> {
    let scope = TenantScope {
        organization_id,
        project_id,
    };
    authorized(&state, &headers, scope, AdminPermission::Read).await?;
    if revision < 1 {
        return Err(ApiError::invalid_request("Invalid policy revision"));
    }
    let policy = state
        .store
        .workspace_guardrail_revision(scope, revision)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::not_found)?;
    Ok((
        [("cache-control", "no-store")],
        Json(json!({"data":{"revision":revision,"policy":policy}})),
    ))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct WorkspaceHistoryQuery {
    before_revision: Option<i64>,
}

pub async fn history(
    State(state): State<AppState>,
    Path((organization_id, project_id)): Path<(Uuid, Uuid)>,
    headers: HeaderMap,
    query: Result<
        axum::extract::Query<WorkspaceHistoryQuery>,
        axum::extract::rejection::QueryRejection,
    >,
) -> Result<([(&'static str, &'static str); 1], Json<Value>), ApiError> {
    let scope = TenantScope {
        organization_id,
        project_id,
    };
    authorized(&state, &headers, scope, AdminPermission::Read).await?;
    let axum::extract::Query(query) =
        query.map_err(|_| ApiError::invalid_request("Invalid policy history cursor"))?;
    if query.before_revision.is_some_and(|revision| revision < 1) {
        return Err(ApiError::invalid_request("Invalid policy history cursor"));
    }
    let mut events = state
        .store
        .workspace_guardrail_history(scope, query.before_revision)
        .await
        .map_err(ApiError::from_store)?;
    let next_cursor = if events.len() > 100 {
        events.truncate(100);
        events.last().and_then(|event| event["revision"].as_i64())
    } else {
        None
    };
    Ok((
        [("cache-control", "no-store")],
        Json(json!({"data":events,"next_cursor":next_cursor})),
    ))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Activate {
    expected_revision: i64,
    policy: PolicyDraft,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Rollback {
    expected_revision: i64,
    target_revision: i64,
}

pub async fn rollback(
    State(state): State<AppState>,
    Path((organization_id, project_id)): Path<(Uuid, Uuid)>,
    headers: HeaderMap,
    input: Result<Json<Rollback>, axum::extract::rejection::JsonRejection>,
) -> Result<Json<Value>, ApiError> {
    let scope = TenantScope {
        organization_id,
        project_id,
    };
    let actor = authorized(&state, &headers, scope, AdminPermission::Write).await?;
    let Json(input) = input.map_err(|_| ApiError::invalid_request("Invalid rollback request"))?;
    if input.target_revision < 1 || input.target_revision > input.expected_revision {
        return Err(ApiError::invalid_request("Invalid rollback revision"));
    }
    let policy = state
        .store
        .workspace_guardrail_revision(scope, input.target_revision)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::not_found)?;
    let parsed: PolicyDraft = serde_json::from_value(policy.clone())
        .map_err(|_| ApiError::invalid_request("Stored revision is unsupported"))?;
    validate_policy(&state, scope, &parsed, "Stored revision is unsupported").await?;
    let revision = state
        .store
        .activate_workspace_guardrail_as(
            scope,
            input.expected_revision,
            &policy,
            &actor,
            Some(input.target_revision),
        )
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(
        json!({"revision":revision,"restored_from_revision":input.target_revision}),
    ))
}

pub async fn activate(
    State(state): State<AppState>,
    Path((organization_id, project_id)): Path<(Uuid, Uuid)>,
    headers: HeaderMap,
    input: Result<Json<Activate>, axum::extract::rejection::JsonRejection>,
) -> Result<Json<Value>, ApiError> {
    let scope = TenantScope {
        organization_id,
        project_id,
    };
    let actor = authorized(&state, &headers, scope, AdminPermission::Write).await?;
    let Json(input) = input.map_err(|_| ApiError::invalid_request("Invalid guardrail policy"))?;
    validate_policy(&state, scope, &input.policy, "Invalid guardrail policy").await?;
    let policy = serde_json::to_value(input.policy)
        .map_err(|_| ApiError::invalid_request("Invalid guardrail policy"))?;
    let revision = state
        .store
        .activate_workspace_guardrail_as(scope, input.expected_revision, &policy, &actor, None)
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({"revision":revision})))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Preview {
    policy: PolicyDraft,
    model: String,
    provider: String,
}

pub async fn preview(
    State(state): State<AppState>,
    Path((organization_id, project_id)): Path<(Uuid, Uuid)>,
    headers: HeaderMap,
    input: Result<Json<Preview>, axum::extract::rejection::JsonRejection>,
) -> Result<Json<Value>, ApiError> {
    let scope = TenantScope {
        organization_id,
        project_id,
    };
    authorized(&state, &headers, scope, AdminPermission::Read).await?;
    let Json(input) = input.map_err(|_| ApiError::invalid_request("Invalid guardrail preview"))?;
    validate_policy(&state, scope, &input.policy, "Invalid guardrail policy").await?;
    if input.model.trim().is_empty()
        || input.provider.trim().is_empty()
        || input.model.len() > 200
        || input.provider.len() > 200
    {
        return Err(ApiError::invalid_request("Model and Provider are required"));
    }
    let allowed = EffectiveAccess::compose([input.policy.models]).permits(&input.model)
        && EffectiveAccess::compose([input.policy.providers]).permits(&input.provider);
    Ok(Json(
        json!({"allowed":allowed,"coverage":"model_provider_access","route_availability_checked":false}),
    ))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct KeyAssignment {
    #[serde(deserialize_with = "deserialize_policy_revision")]
    policy_revision: Option<i64>,
    expected_assignment_revision: i64,
}

fn deserialize_policy_revision<'de, D: serde::Deserializer<'de>>(
    deserializer: D,
) -> Result<Option<i64>, D::Error> {
    Option::<i64>::deserialize(deserializer)
}

pub async fn read_key_assignment(
    State(state): State<AppState>,
    Path((organization_id, project_id, key)): Path<(Uuid, Uuid, Uuid)>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    let scope = TenantScope {
        organization_id,
        project_id,
    };
    authorized(&state, &headers, scope, AdminPermission::Read).await?;
    let assignment = state
        .store
        .key_guardrail_assignment(scope, key)
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({"data":assignment})))
}

pub async fn assign_key(
    State(state): State<AppState>,
    Path((organization_id, project_id, key)): Path<(Uuid, Uuid, Uuid)>,
    headers: HeaderMap,
    input: Result<Json<KeyAssignment>, axum::extract::rejection::JsonRejection>,
) -> Result<Json<Value>, ApiError> {
    let scope = TenantScope {
        organization_id,
        project_id,
    };
    let actor = authorized(&state, &headers, scope, AdminPermission::Write).await?;
    let Json(input) =
        input.map_err(|_| ApiError::invalid_request("Invalid key guardrail assignment"))?;
    if input.policy_revision.is_some_and(|revision| revision < 1)
        || input.expected_assignment_revision < 0
    {
        return Err(ApiError::invalid_request(
            "Invalid policy or assignment revision",
        ));
    }
    let revision = if let Some(policy_revision) = input.policy_revision {
        let policy = state
            .store
            .workspace_guardrail_revision(scope, policy_revision)
            .await
            .map_err(ApiError::from_store)?
            .ok_or_else(ApiError::not_found)?;
        let policy: PolicyDraft = serde_json::from_value(policy)
            .map_err(|_| ApiError::invalid_request("Stored revision is unsupported"))?;
        validate_policy(&state, scope, &policy, "Stored revision is unsupported").await?;
        state
            .store
            .assign_key_guardrail_as(
                scope,
                key,
                policy_revision,
                input.expected_assignment_revision,
                &actor,
            )
            .await
    } else {
        state
            .store
            .clear_key_guardrail_as(scope, key, input.expected_assignment_revision, &actor)
            .await
    }
    .map_err(ApiError::from_store)?;
    Ok(Json(json!({"assignment_revision":revision})))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct HistoryQuery {
    before_assignment_revision: Option<i64>,
}

pub async fn key_history(
    State(state): State<AppState>,
    Path((organization_id, project_id, key)): Path<(Uuid, Uuid, Uuid)>,
    headers: HeaderMap,
    axum::extract::Query(query): axum::extract::Query<HistoryQuery>,
) -> Result<([(&'static str, &'static str); 1], Json<Value>), ApiError> {
    let scope = TenantScope {
        organization_id,
        project_id,
    };
    authorized(&state, &headers, scope, AdminPermission::Read).await?;
    if query
        .before_assignment_revision
        .is_some_and(|revision| revision < 1)
    {
        return Err(ApiError::invalid_request(
            "Invalid assignment history cursor",
        ));
    }
    let mut events = state
        .store
        .key_guardrail_history(scope, key, query.before_assignment_revision)
        .await
        .map_err(ApiError::from_store)?;
    let next_cursor = if events.len() > 100 {
        events.truncate(100);
        events
            .last()
            .and_then(|event| event["assignment_revision"].as_i64())
    } else {
        None
    };
    Ok((
        [("cache-control", "no-store")],
        Json(json!({"data":events,"next_cursor":next_cursor})),
    ))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct InputPreview {
    protocol: crate::guardrails::input::Protocol,
    rules: Vec<crate::guardrails::input::RuleConfig>,
    request: Value,
}

static INPUT_TEST_SLOTS: std::sync::LazyLock<std::sync::Arc<tokio::sync::Semaphore>> =
    std::sync::LazyLock::new(|| std::sync::Arc::new(tokio::sync::Semaphore::new(4)));

pub async fn input_preview(
    State(state): State<AppState>,
    Path((organization_id, project_id)): Path<(Uuid, Uuid)>,
    headers: HeaderMap,
    input: Result<Json<InputPreview>, axum::extract::rejection::JsonRejection>,
) -> Result<([(&'static str, &'static str); 1], Json<Value>), ApiError> {
    use crate::guardrails::input::{CompiledInputPolicy, InspectionError};
    authorized(
        &state,
        &headers,
        TenantScope {
            organization_id,
            project_id,
        },
        AdminPermission::Read,
    )
    .await?;
    let Json(input) =
        input.map_err(|_| ApiError::invalid_request("Invalid synthetic input test request"))?;
    if input.rules.len() > 32 {
        return Err(ApiError::invalid_request(
            "At most 32 input rules are supported",
        ));
    }
    let result = crate::guardrails::input::run_bounded(INPUT_TEST_SLOTS.clone(), move || {
        let policy = CompiledInputPolicy::compile(&input.rules)
            .map_err(|_| ApiError::invalid_request("Invalid or oversized input rule"))?;
        let inspected = policy.inspect(input.protocol, &input.request);
        Ok::<_, ApiError>(inspected.map(|transformed| transformed != input.request))
    })
    .await
    .map_err(|_| ApiError::unavailable())??;
    let (outcome, reason, changed) = match result {
        Ok(changed) => ("allowed", "inspected_text", changed),
        Err(InspectionError::Blocked) => ("blocked", "pattern_denial", false),
        Err(InspectionError::UnsupportedContent) => ("indeterminate", "unsupported_content", false),
        Err(InspectionError::ResourceLimit) => ("indeterminate", "resource_limit", false),
        Err(InspectionError::InvalidPattern) => ("indeterminate", "invalid_pattern", false),
    };
    Ok((
        [("cache-control", "no-store")],
        Json(
            json!({"outcome":outcome,"reason":reason,"redacted":changed,"synthetic":true,"enforcement":false}),
        ),
    ))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct OutputPreview {
    #[serde(default = "default_output_preview_mode")]
    mode: crate::guardrails::OutputMode,
    protocol: crate::guardrails::input::Protocol,
    rules: Vec<crate::guardrails::input::RuleConfig>,
    response: Value,
}

fn default_output_preview_mode() -> crate::guardrails::OutputMode {
    crate::guardrails::OutputMode::BufferedFull
}

pub async fn output_preview(
    State(state): State<AppState>,
    Path((organization_id, project_id)): Path<(Uuid, Uuid)>,
    headers: HeaderMap,
    input: Result<Json<OutputPreview>, axum::extract::rejection::JsonRejection>,
) -> Result<([(&'static str, &'static str); 1], Json<Value>), ApiError> {
    use crate::guardrails::input::{CompiledInputPolicy, InspectionError};
    authorized(
        &state,
        &headers,
        TenantScope {
            organization_id,
            project_id,
        },
        AdminPermission::Read,
    )
    .await?;
    let Json(input) =
        input.map_err(|_| ApiError::invalid_request("Invalid synthetic output test response"))?;
    if input.rules.is_empty()
        || input.rules.len() > 32
        || input.protocol == crate::guardrails::input::Protocol::Embeddings
    {
        return Err(ApiError::invalid_request(
            "Output preview requires Chat or Responses and 1–32 rules",
        ));
    }
    let mode = input.mode;
    let result = crate::guardrails::input::run_bounded(INPUT_TEST_SLOTS.clone(), move || {
        let policy = CompiledInputPolicy::compile(&input.rules)
            .map_err(|_| ApiError::invalid_request("Invalid or oversized output rule"))?;
        let inspected = policy.inspect_output(input.protocol, &input.response);
        Ok::<_, ApiError>(inspected.map(|transformed| transformed != input.response))
    })
    .await
    .map_err(|_| ApiError::unavailable())??;
    let (outcome, reason, changed) = match result {
        Ok(changed) => ("allowed", "inspected_text", changed),
        Err(InspectionError::Blocked) => ("blocked", "pattern_denial", false),
        Err(InspectionError::UnsupportedContent) => ("indeterminate", "unsupported_content", false),
        Err(InspectionError::ResourceLimit) => ("indeterminate", "resource_limit", false),
        Err(InspectionError::InvalidPattern) => ("indeterminate", "invalid_pattern", false),
    };
    let (outcome, reason, changed) = if mode == crate::guardrails::OutputMode::ObserveOnly {
        match (outcome, changed) {
            ("allowed", false) => ("clear", reason, false),
            ("allowed", true) | ("blocked", _) => ("matched", "pattern_match", false),
            _ => (outcome, reason, false),
        }
    } else {
        (outcome, reason, changed)
    };
    Ok((
        [("cache-control", "no-store")],
        Json(
            json!({"outcome":outcome,"reason":reason,"redacted":changed,"synthetic":true,"enforcement":false,"mode":mode,"coverage":"local_text"}),
        ),
    ))
}

pub async fn dispatch_decision(
    State(state): State<AppState>,
    Path((organization_id, project_id, attempt)): Path<(Uuid, Uuid, Uuid)>,
    headers: HeaderMap,
) -> Result<([(&'static str, &'static str); 1], Json<Value>), ApiError> {
    let scope = TenantScope {
        organization_id,
        project_id,
    };
    authorized(&state, &headers, scope, AdminPermission::Read).await?;
    let data = state
        .store
        .dispatch_guardrail_decision(scope, attempt)
        .await
        .map_err(ApiError::from_store)?;
    Ok(([("cache-control", "no-store")], Json(json!({"data":data}))))
}

/// ```openapi
/// {
///   "path": "/admin/v1/organizations/{organization}/projects/{project}/guardrails/denials",
///   "method": "get",
///   "operation": {
///     "operationId": "listGuardrailPreparationDenials",
///     "summary": "Read latest 100 workspace preparation refusals",
///     "description": "Workspace read access required. Safe immutable metadata for pre-dispatch model/Provider access, local input inspection, output configuration and external input detector refusals. No request content, matched patterns, detector responses, credentials or internal event/key identifiers. Does not cover dispatch-time races or post-dispatch output inspection. Latest 100 only, newest first; not a complete audit export. Policy names and revisions identify the saved decision. Cache-Control no-store. Inference credentials cannot read these diagnostics.",
///     "x-niu-implementation": "implemented",
///     "security": [
///       {
///         "bearerAuth": []
///       },
///       {
///         "niuApiKeyAuth": []
///       }
///     ],
///     "parameters": [
///       {
///         "name": "organization",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       },
///       {
///         "name": "project",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       }
///     ],
///     "responses": {
///       "200": {
///         "description": "Latest 100 preparation refusals",
///         "headers": {
///           "Cache-Control": {
///             "schema": {
///               "type": "string",
///               "const": "no-store"
///             }
///           }
///         },
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "required": [
///                 "data",
///                 "coverage"
///               ],
///               "properties": {
///                 "coverage": {
///                   "const": "latest_100_preparation_denials"
///                 },
///                 "data": {
///                   "type": "array",
///                   "maxItems": 100,
///                   "items": {
///                     "type": "object",
///                     "required": [
///                       "stage",
///                       "outcome",
///                       "coverage",
///                       "enforcer_version",
///                       "reason",
///                       "key_name",
///                       "workspace_policy_name",
///                       "key_policy_name",
///                       "workspace_revision",
///                       "key_policy_revision",
///                       "key_assignment_revision",
///                       "recorded_at"
///                     ],
///                     "properties": {
///                       "stage": {
///                         "const": "preparation"
///                       },
///                       "outcome": {
///                         "const": "blocked"
///                       },
///                       "coverage": {
///                         "enum": [
///                           "model_provider_access",
///                           "local_input",
///                           "output_configuration",
///                           "external_input"
///                         ]
///                       },
///                       "enforcer_version": {
///                         "enum": [
///                           "access-v1",
///                           "local-input-v1",
///                           "buffer-mode-v1",
///                           "external-input-v1"
///                         ]
///                       },
///                       "reason": {
///                         "enum": [
///                           "model_denied",
///                           "provider_denied",
///                           "unsupported_policy",
///                           "input_blocked",
///                           "input_unsupported",
///                           "input_resource_limit",
///                           "input_unavailable",
///                           "output_incompatible",
///                           "detector_blocked",
///                           "detector_unsupported",
///                           "detector_unavailable"
///                         ]
///                       },
///                       "key_name": {
///                         "type": "string"
///                       },
///                       "workspace_policy_name": {
///                         "type": [
///                           "string",
///                           "null"
///                         ]
///                       },
///                       "key_policy_name": {
///                         "type": [
///                           "string",
///                           "null"
///                         ]
///                       },
///                       "workspace_revision": {
///                         "type": [
///                           "integer",
///                           "null"
///                         ]
///                       },
///                       "key_policy_revision": {
///                         "type": [
///                           "integer",
///                           "null"
///                         ]
///                       },
///                       "key_assignment_revision": {
///                         "type": [
///                           "integer",
///                           "null"
///                         ]
///                       },
///                       "recorded_at": {
///                         "type": "string",
///                         "format": "date-time"
///                       }
///                     }
///                   }
///                 }
///               }
///             }
///           }
///         }
///       },
///       "401": {
///         "description": "Invalid management credential; inference keys cannot read decisions"
///       },
///       "403": {
///         "description": "Workspace outside authorized scope"
///       },
///       "503": {
///         "description": "Durable storage unavailable"
///       }
///     }
///   }
/// }
/// ```
pub async fn preparation_denials(
    State(state): State<AppState>,
    Path((organization_id, project_id)): Path<(Uuid, Uuid)>,
    headers: HeaderMap,
) -> Result<([(&'static str, &'static str); 1], Json<Value>), ApiError> {
    let scope = TenantScope {
        organization_id,
        project_id,
    };
    authorized(&state, &headers, scope, AdminPermission::Read).await?;
    let data = state
        .store
        .guardrail_preparation_denials(scope)
        .await
        .map_err(ApiError::from_store)?;
    Ok((
        [("cache-control", "no-store")],
        Json(json!({"data":data,"coverage":"latest_100_preparation_denials"})),
    ))
}

pub async fn dispatch_denials(
    State(state): State<AppState>,
    Path((organization_id, project_id)): Path<(Uuid, Uuid)>,
    headers: HeaderMap,
) -> Result<([(&'static str, &'static str); 1], Json<Value>), ApiError> {
    let scope = TenantScope {
        organization_id,
        project_id,
    };
    authorized(&state, &headers, scope, AdminPermission::Read).await?;
    let data = state
        .store
        .guardrail_dispatch_denials(scope)
        .await
        .map_err(ApiError::from_store)?;
    Ok((
        [("cache-control", "no-store")],
        Json(json!({"data":data,"coverage":"latest_100_dispatch_policy_exceptions"})),
    ))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DetectorPreview {
    configuration_fingerprint: String,
    text: String,
    consent_to_external_processing: bool,
}

/// Installation-only synthetic transport check; does not activate a detector.
pub async fn detector_preview(
    State(state): State<AppState>,
    Path(detector): Path<String>,
    headers: HeaderMap,
    input: Result<Json<DetectorPreview>, axum::extract::rejection::JsonRejection>,
) -> Result<([(&'static str, &'static str); 1], Json<Value>), ApiError> {
    if !matches!(
        authorize(&state, &headers, AdminPermission::Read).await?,
        crate::state::AdminAuthorization::Installation
    ) {
        return Err(ApiError::forbidden());
    }
    let Json(input) = input.map_err(|_| ApiError::invalid_request("Invalid detector test"))?;
    if !input.consent_to_external_processing {
        return Err(ApiError::invalid_request(
            "External processing consent is required",
        ));
    }
    let runtime = state
        .detectors
        .get(&detector)
        .ok_or_else(ApiError::not_found)?;
    if input.configuration_fingerprint != runtime.fingerprint() {
        return Err(ApiError::invalid_request(
            "Detector processing configuration changed; review it before consenting",
        ));
    }
    let result = runtime.inspect(&input.text).await;
    Ok((
        [("cache-control", "no-store")],
        Json(
            json!({"outcome":result.outcome,"reason":result.reason,"synthetic":true,"enforcement":false}),
        ),
    ))
}

/// Declared processing conditions for explicit synthetic-test consent.
pub async fn detector_description(
    State(state): State<AppState>,
    Path(detector): Path<String>,
    headers: HeaderMap,
) -> Result<([(&'static str, &'static str); 1], Json<Value>), ApiError> {
    if !matches!(
        authorize(&state, &headers, AdminPermission::Read).await?,
        crate::state::AdminAuthorization::Installation
    ) {
        return Err(ApiError::forbidden());
    }
    let runtime = state
        .detectors
        .get(&detector)
        .ok_or_else(ApiError::not_found)?;
    Ok(([("cache-control", "no-store")], Json(runtime.description())))
}

/// Metadata-only audit for authorized workspace readers, including pre-admission denials.
pub async fn detector_decisions(
    State(state): State<AppState>,
    Path((organization_id, project_id)): Path<(Uuid, Uuid)>,
    headers: HeaderMap,
) -> Result<([(&'static str, &'static str); 1], Json<Value>), ApiError> {
    let scope = TenantScope {
        organization_id,
        project_id,
    };
    authorized(&state, &headers, scope, AdminPermission::Read).await?;
    let data = state
        .store
        .input_detector_decisions(scope)
        .await
        .map_err(ApiError::from_store)?;
    Ok((
        [("cache-control", "no-store")],
        Json(json!({"data":data,"coverage":"latest_100_input_detector_decisions"})),
    ))
}

/// Processing declarations visible only within explicitly authorized workspaces.
pub async fn workspace_detectors(
    State(state): State<AppState>,
    Path((organization_id, project_id)): Path<(Uuid, Uuid)>,
    headers: HeaderMap,
) -> Result<([(&'static str, &'static str); 1], Json<Value>), ApiError> {
    let scope = TenantScope {
        organization_id,
        project_id,
    };
    authorized(&state, &headers, scope, AdminPermission::Read).await?;
    if state
        .store
        .workspaces(Some(organization_id), Some(project_id))
        .await
        .map_err(ApiError::from_store)?
        .is_empty()
    {
        return Err(ApiError::not_found());
    }
    let mut data: Vec<Value> = state
        .detectors
        .iter()
        .filter(|(_, runtime)| runtime.authorized_workspace(project_id))
        .map(|(name, runtime)| {
            let mut description = runtime.description();
            description["detector"] = json!(name);
            description["content_sent"] = json!("request_text_after_local_redaction");
            description
        })
        .collect();
    data.sort_by(|a, b| a["detector"].as_str().cmp(&b["detector"].as_str()));
    Ok(([("cache-control", "no-store")], Json(json!({"data":data}))))
}

/// Separate image-processing discovery; no policy activation or content dispatch.
pub async fn workspace_image_detectors(
    State(state): State<AppState>,
    Path((organization_id, project_id)): Path<(Uuid, Uuid)>,
    headers: HeaderMap,
) -> Result<([(&'static str, &'static str); 1], Json<Value>), ApiError> {
    let scope = TenantScope {
        organization_id,
        project_id,
    };
    authorized(&state, &headers, scope, AdminPermission::Read).await?;
    if state
        .store
        .workspaces(Some(organization_id), Some(project_id))
        .await
        .map_err(ApiError::from_store)?
        .is_empty()
    {
        return Err(ApiError::not_found());
    }
    let mut data: Vec<Value> = state
        .image_detectors
        .iter()
        .filter(|(_, runtime)| runtime.authorized_workspace(&project_id.to_string()))
        .map(|(name, runtime)| {
            let mut description = runtime.description();
            description["detector"] = json!(name);
            description
        })
        .collect();
    data.sort_by(|a, b| a["detector"].as_str().cmp(&b["detector"].as_str()));
    Ok(([("cache-control", "no-store")], Json(json!({"data":data}))))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ImageDetectorPreview {
    consent: niu_media::image_detector::Consent,
    image: String,
}

/// Explicitly consented synthetic image processing. Never grants dispatch access.
pub async fn image_detector_preview(
    State(state): State<AppState>,
    Path((organization_id, project_id, detector)): Path<(Uuid, Uuid, String)>,
    headers: HeaderMap,
    input: Result<Json<ImageDetectorPreview>, axum::extract::rejection::JsonRejection>,
) -> Result<([(&'static str, &'static str); 1], Json<Value>), ApiError> {
    use niu_media::{image_detector::RuntimeError, image_inspection::InspectionError};
    let scope = TenantScope {
        organization_id,
        project_id,
    };
    authorized(&state, &headers, scope, AdminPermission::Write).await?;
    let Json(input) =
        input.map_err(|_| ApiError::invalid_request("Invalid image inspection test"))?;
    if state
        .store
        .workspaces(Some(organization_id), Some(project_id))
        .await
        .map_err(ApiError::from_store)?
        .is_empty()
    {
        return Err(ApiError::not_found());
    }
    let runtime = state
        .image_detectors
        .get(&detector)
        .ok_or_else(ApiError::not_found)?;
    if !runtime.permits(&project_id.to_string(), &input.consent) {
        return Err(ApiError::invalid_request(
            "Image processing requires workspace authorization, current explicit consent and declared unmetered service",
        ));
    }
    let (outcome, reason) = match runtime
        .inspect_inline(&project_id.to_string(), &input.consent, &input.image)
        .await
    {
        Ok(_) => ("clear", "inspected_image"),
        Err(RuntimeError::Decode(
            niu_media::image_input::DecodeError::Busy
            | niu_media::image_input::DecodeError::WorkerFailed,
        )) => return Err(ApiError::unavailable()),
        Err(RuntimeError::Decode(_)) => {
            return Err(ApiError::invalid_request(
                "Invalid or oversized PNG, JPEG or WebP image",
            ));
        }
        Err(RuntimeError::Unauthorized) => return Err(ApiError::forbidden()),
        Err(RuntimeError::Inspection(InspectionError::Matched)) => ("matched", "image_match"),
        Err(_) => ("indeterminate", "inspection_unavailable"),
    };
    Ok((
        [("cache-control", "no-store")],
        Json(json!({
            "outcome":outcome,"reason":reason,"synthetic":true,"enforcement":false,"policy_activation":false
        })),
    ))
}
