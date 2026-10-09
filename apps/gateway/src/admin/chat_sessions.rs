use super::{
    AdminPermission, ApiError, AppState, HeaderMap, Json, Path, State, TenantScope, Uuid, Value,
    authorize, json,
};
use crate::state::AdminAuthorization;

fn safe_nonnegative_integer(value: &Value) -> bool {
    value.as_u64().is_some_and(|n| n <= 9_007_199_254_740_991)
}

fn valid_results(payload: &Value) -> bool {
    payload
        .get("results")
        .and_then(Value::as_array)
        .is_some_and(|results| {
            let mut models = std::collections::HashSet::new();
            results.len() <= 4
                && results.iter().all(|result| {
                    result
                        .get("model")
                        .and_then(Value::as_str)
                        .is_some_and(|model| !model.trim().is_empty() && models.insert(model))
                        && result.get("content").and_then(Value::as_str).is_some()
                        && result
                            .get("elapsedMs")
                            .is_some_and(safe_nonnegative_integer)
                        && ["promptTokens", "completionTokens", "totalTokens"]
                            .iter()
                            .all(|key| {
                                result
                                    .get(*key)
                                    .is_none_or(|v| v.is_null() || safe_nonnegative_integer(v))
                            })
                        && result
                            .get("phase")
                            .and_then(Value::as_str)
                            .is_some_and(|phase| {
                                ["connecting", "streaming", "complete", "failed", "cancelled"]
                                    .contains(&phase)
                            })
                })
        })
}

fn sanitize_results(results: &mut Value) {
    for result in results.as_array_mut().unwrap() {
        result.as_object_mut().unwrap().retain(|key, _| {
            [
                "model",
                "content",
                "elapsedMs",
                "phase",
                "promptTokens",
                "completionTokens",
                "totalTokens",
                "attemptId",
                "error",
            ]
            .contains(&key.as_str())
        });
    }
}

fn sanitize_attachments(payload: &mut Value) -> Result<(), ApiError> {
    if let Some(attachments) = payload.get_mut("attachments") {
        let attachments = attachments
            .as_array_mut()
            .ok_or_else(|| ApiError::invalid_request("Invalid chat attachments"))?;
        for attachment in attachments {
            let attachment = attachment
                .as_object_mut()
                .ok_or_else(|| ApiError::invalid_request("Invalid chat attachment"))?;
            attachment.retain(|key, _| ["name", "type", "content"].contains(&key.as_str()));
            if !["name", "type", "content"]
                .iter()
                .all(|key| attachment.get(*key).is_some_and(Value::is_string))
            {
                return Err(ApiError::invalid_request("Invalid chat attachment"));
            }
        }
    }
    Ok(())
}

async fn owner(
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
        AdminAuthorization::Operator(operator) => format!("operator:{}", operator.id),
        // Installation credentials represent one installation administrator.
        AdminAuthorization::Installation => "installation".to_owned(),
    })
}

#[derive(serde::Deserialize, serde::Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct DraftSettings {
    system_prompt: String,
    max_tokens: u64,
    temperature: f64,
    log_payloads: bool,
}

#[derive(serde::Deserialize, serde::Serialize)]
#[serde(deny_unknown_fields)]
pub struct DraftAttachment {
    name: String,
    #[serde(rename = "type")]
    kind: String,
    content: String,
}

#[derive(serde::Deserialize, serde::Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct DraftPayload {
    session_id: Option<Uuid>,
    prompt: String,
    models: Vec<String>,
    attachments: Vec<DraftAttachment>,
    settings: DraftSettings,
}

#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DraftInput {
    expected_revision: i64,
    payload: Option<DraftPayload>,
}

pub async fn draft(
    State(state): State<AppState>,
    Path((organization_id, project_id)): Path<(Uuid, Uuid)>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    let scope = TenantScope {
        organization_id,
        project_id,
    };
    let owner = owner(&state, &headers, scope, AdminPermission::Read).await?;
    let (payload, revision) = state
        .store
        .chat_draft(scope, &owner)
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(
        json!({"data":{"payload":payload,"revision":revision}}),
    ))
}

pub async fn save_draft(
    State(state): State<AppState>,
    Path((organization_id, project_id)): Path<(Uuid, Uuid)>,
    headers: HeaderMap,
    input: Result<Json<DraftInput>, axum::extract::rejection::JsonRejection>,
) -> Result<Json<Value>, ApiError> {
    let scope = TenantScope {
        organization_id,
        project_id,
    };
    let owner = owner(&state, &headers, scope, AdminPermission::Write).await?;
    if let Some(runtime) = state.password_auth.as_ref() {
        let browser = !headers.contains_key("authorization")
            || headers
                .get("authorization")
                .and_then(|value| value.to_str().ok())
                == Some("Bearer niu-browser-member-session");
        if browser {
            runtime.require_origin(&headers)?;
        } else {
            runtime.check_origin(&headers)?;
        }
    }
    let Json(input) = input.map_err(|_| ApiError::invalid_request("Invalid chat draft update"))?;
    let payload = if let Some(payload) = input.payload {
        let settings = &payload.settings;
        let mut models = std::collections::HashSet::new();
        if payload.prompt.chars().count() > 12000
            || settings.system_prompt.chars().count() > 12000
            || settings.max_tokens == 0
            || settings.max_tokens > 9_007_199_254_740_991
            || !settings.temperature.is_finite()
            || !(0.0..=2.0).contains(&settings.temperature)
            || payload.models.len() > 4
            || payload
                .models
                .iter()
                .any(|model| model.trim().is_empty() || model.len() > 512 || !models.insert(model))
            || payload.attachments.len() > 4
            || payload.attachments.iter().any(|file| {
                file.name.is_empty()
                    || file.name.len() > 1024
                    || !["image", "text"].contains(&file.kind.as_str())
                    || file.content.len() > 6 * 1024 * 1024
            })
        {
            return Err(ApiError::invalid_request("Invalid chat draft"));
        }
        if let Some(id) = payload.session_id
            && state
                .store
                .chat_session(scope, &owner, id)
                .await
                .map_err(ApiError::from_store)?
                .is_none()
        {
            return Err(ApiError::invalid_request(
                "The draft conversation is unavailable",
            ));
        }
        Some(
            serde_json::to_value(payload)
                .map_err(|_| ApiError::invalid_request("Invalid chat draft"))?,
        )
    } else {
        None
    };
    let revision = state
        .store
        .save_chat_draft(scope, &owner, payload.as_ref(), input.expected_revision)
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(
        json!({"data":{"payload":payload,"revision":revision}}),
    ))
}

#[derive(serde::Deserialize, Default)]
#[serde(deny_unknown_fields)]
pub struct HistoryQuery {
    #[serde(default)]
    archived: bool,
}

#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ArchiveInput {
    archived: bool,
}

pub async fn archive(
    State(state): State<AppState>,
    Path((organization_id, project_id, id)): Path<(Uuid, Uuid, Uuid)>,
    headers: HeaderMap,
    Json(input): Json<ArchiveInput>,
) -> Result<axum::http::StatusCode, ApiError> {
    let scope = TenantScope {
        organization_id,
        project_id,
    };
    let owner = owner(&state, &headers, scope, AdminPermission::Write).await?;
    if !state
        .store
        .set_chat_session_archived(scope, &owner, id, input.archived)
        .await
        .map_err(ApiError::from_store)?
    {
        return Err(ApiError::not_found());
    }
    Ok(axum::http::StatusCode::NO_CONTENT)
}

pub async fn list(
    State(state): State<AppState>,
    Path((organization_id, project_id)): Path<(Uuid, Uuid)>,
    headers: HeaderMap,
    axum::extract::Query(query): axum::extract::Query<HistoryQuery>,
) -> Result<Json<Value>, ApiError> {
    let scope = TenantScope {
        organization_id,
        project_id,
    };
    let owner = owner(&state, &headers, scope, AdminPermission::Read).await?;
    let data = state
        .store
        .chat_sessions_by_archive(scope, &owner, query.archived)
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({"data": data})))
}

pub async fn delete(
    State(state): State<AppState>,
    Path((organization_id, project_id, id)): Path<(Uuid, Uuid, Uuid)>,
    headers: HeaderMap,
) -> Result<axum::http::StatusCode, ApiError> {
    let scope = TenantScope {
        organization_id,
        project_id,
    };
    let owner = owner(&state, &headers, scope, AdminPermission::Write).await?;
    state
        .store
        .delete_chat_session(scope, &owner, id)
        .await
        .map_err(ApiError::from_store)?;
    Ok(axum::http::StatusCode::NO_CONTENT)
}

/// Conversation content only: no routing IDs, saved accounting or diagnostic errors.
fn conversation_export(mut payload: Value) -> Value {
    fn turn(value: &mut Value) {
        if let Some(object) = value.as_object_mut() {
            object.retain(|key, _| ["prompt", "results", "attachments"].contains(&key.as_str()));
        }
        if let Some(results) = value.get_mut("results").and_then(Value::as_array_mut) {
            for result in results {
                if let Some(object) = result.as_object_mut() {
                    object.retain(|key, _| ["model", "content", "phase"].contains(&key.as_str()));
                }
            }
        }
        if let Some(attachments) = value.get_mut("attachments").and_then(Value::as_array_mut) {
            for attachment in attachments {
                if let Some(object) = attachment.as_object_mut() {
                    object.retain(|key, _| ["name", "type", "content"].contains(&key.as_str()));
                }
            }
        }
    }
    let title = payload.get("title").filter(|v| v.is_string()).cloned();
    let created_at = payload
        .get("createdAt")
        .filter(|v| safe_nonnegative_integer(v))
        .cloned();
    let mut turns = payload
        .get_mut("turns")
        .and_then(Value::as_array_mut)
        .filter(|turns| !turns.is_empty())
        .cloned()
        .unwrap_or_else(|| vec![payload]);
    for value in &mut turns {
        turn(value);
    }
    let mut output = json!({"format":"niu-chat", "version":1, "turns":turns});
    if let Some(title) = title {
        output["title"] = title;
    }
    if let Some(created_at) = created_at {
        output["createdAt"] = created_at;
    }
    output
}

pub async fn export(
    State(state): State<AppState>,
    Path((organization_id, project_id, id)): Path<(Uuid, Uuid, Uuid)>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    let scope = TenantScope {
        organization_id,
        project_id,
    };
    let owner = owner(&state, &headers, scope, AdminPermission::Read).await?;
    let payload = state
        .store
        .chat_session(scope, &owner, id)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::not_found)?;
    Ok(Json(conversation_export(payload)))
}

pub async fn save(
    State(state): State<AppState>,
    Path((organization_id, project_id, id)): Path<(Uuid, Uuid, Uuid)>,
    headers: HeaderMap,
    Json(mut payload): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    let scope = TenantScope {
        organization_id,
        project_id,
    };
    let owner = owner(&state, &headers, scope, AdminPermission::Write).await?;
    if !payload.is_object()
        || payload.get("prompt").and_then(Value::as_str).is_none()
        || !valid_results(&payload)
        || !payload
            .get("createdAt")
            .is_some_and(safe_nonnegative_integer)
    {
        return Err(ApiError::invalid_request("Invalid chat session"));
    }
    // Only conversation fields are stored. Credentials must never be persisted.
    let permitted = [
        "id",
        "title",
        "prompt",
        "results",
        "createdAt",
        "attachments",
        "settings",
        "turns",
    ];
    payload
        .as_object_mut()
        .unwrap()
        .retain(|key, _| permitted.contains(&key.as_str()));
    sanitize_results(&mut payload["results"]);
    if let Some(turns) = payload.get_mut("turns") {
        let turns = turns
            .as_array_mut()
            .ok_or_else(|| ApiError::invalid_request("Invalid chat turns"))?;
        if turns.len() > 100
            || turns.iter().any(|turn| {
                !turn.is_object()
                    || !turn.get("prompt").is_some_and(Value::is_string)
                    || !valid_results(turn)
            })
        {
            return Err(ApiError::invalid_request("Invalid chat turns"));
        }
        for turn in turns {
            turn.as_object_mut()
                .unwrap()
                .retain(|key, _| ["prompt", "results", "attachments"].contains(&key.as_str()));
            sanitize_results(&mut turn["results"]);
            sanitize_attachments(turn)?;
        }
    }
    if let Some(settings) = payload.get_mut("settings") {
        let settings = settings
            .as_object_mut()
            .ok_or_else(|| ApiError::invalid_request("Invalid chat settings"))?;
        settings.retain(|key, _| {
            ["systemPrompt", "maxTokens", "temperature", "logPayloads"].contains(&key.as_str())
        });
        if settings.get("systemPrompt").is_some_and(|v| !v.is_string())
            || settings
                .get("maxTokens")
                .is_some_and(|v| !v.as_u64().is_some_and(|n| n > 0))
            || settings
                .get("temperature")
                .is_some_and(|v| !v.as_f64().is_some_and(|n| (0.0..=2.0).contains(&n)))
            || settings.get("logPayloads").is_some_and(|v| !v.is_boolean())
        {
            return Err(ApiError::invalid_request("Invalid chat settings"));
        }
    }
    sanitize_attachments(&mut payload)?;
    payload["id"] = json!(id);
    state
        .store
        .save_chat_session(scope, &owner, id, &payload)
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({"saved": true})))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn conversation_export_excludes_legacy_metadata_and_preserves_branches() {
        let metadata = json!({"model":"fast","content":"Saved response","phase":"complete","attemptId":"private-id","cashNanos":"private-cost","customerChargeNanos":"private-cost","error":"private-error","apiKey":"private-key"});
        for turns in [
            None,
            Some(json!([])),
            Some(json!([
                {"prompt":"First","results":[metadata.clone()],"attachments":[{"name":"note.txt","type":"text","content":"Saved context","token":"private-key"}],"id":"private-id"},
                {"prompt":"Second","results":[metadata.clone(),{"model":"other","content":"Other branch","phase":"cancelled"}]}
            ])),
        ] {
            let mut saved = json!({"id":"private-id","owner":"private-owner","title":"Conversation","createdAt":1,"prompt":"Legacy prompt","results":[metadata.clone()],"settings":{"token":"private-key"}});
            if let Some(turns) = turns {
                saved["turns"] = turns;
            }
            let exported = conversation_export(saved);
            assert_eq!(exported["title"], "Conversation");
            assert_eq!(exported["version"], 1);
            assert!(!exported.to_string().contains("private-"));
            let turns = exported["turns"].as_array().unwrap();
            assert_eq!(turns[0]["results"][0]["content"], "Saved response");
            if turns.len() == 2 {
                assert_eq!(turns[1]["results"][1]["model"], "other");
                assert_eq!(turns[0]["attachments"][0]["content"], "Saved context");
            } else {
                assert_eq!(turns[0]["prompt"], "Legacy prompt");
            }
        }
    }
}
