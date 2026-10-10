//! Buffer the documented subscription SSE transport behind Niu's text API.
use super::common::*;
use crate::{codex, error::ApiError, state::AppState};
use axum::{
    Json,
    http::HeaderMap,
    response::{IntoResponse, Response},
};
use serde_json::{Value, json};
use uuid::Uuid;

#[derive(Clone, Copy)]
pub(super) enum Protocol {
    Chat,
    Responses,
}

pub(super) async fn infer(
    state: AppState,
    headers: HeaderMap,
    mut body: Value,
    principal: niu_storage::Principal,
    protocol: Protocol,
) -> Result<Response, ApiError> {
    let alias = body
        .get("model")
        .and_then(Value::as_str)
        .ok_or_else(ApiError::not_found)?
        .to_owned();
    let slug = alias
        .strip_prefix("codex/")
        .filter(|s| codex::valid_slug(s))
        .ok_or_else(ApiError::not_found)?;
    if !codex::private_models(&state, principal.scope())
        .await?
        .contains_key(&alias)
    {
        return Err(ApiError::not_found());
    }
    let model = codex::model(slug);
    let guard_protocol = match protocol {
        Protocol::Chat => crate::guardrails::input::Protocol::Chat,
        Protocol::Responses => crate::guardrails::input::Protocol::Responses,
    };
    let snapshot = inspect_request_input(
        &state,
        &principal,
        &alias,
        &model,
        guard_protocol,
        &mut body,
    )
    .await?;
    let request = upstream_body(&body, slug, protocol)?;
    let task_id = request_task_id(&headers)?;
    let timeout = std::time::Duration::from_secs(state.config.server.request_timeout_seconds);
    let endpoint = format!("{}/responses", codex::inference_base(&state));
    let client = crate::upstream::client_for_endpoint(&endpoint, timeout)
        .await
        .map_err(ApiError::from_endpoint)?;
    let scope = principal.scope();
    let owner = Uuid::new_v4();
    let secret = state
        .store
        .claim_codex_connection(scope, slug, owner)
        .await
        .map_err(ApiError::from_store)?;
    let credentials = match codex::decrypt(&state, &secret) {
        Ok(credentials) => credentials,
        Err(error) => {
            state
                .store
                .finish_codex_lease(scope, secret.account_id, owner, "authentication_expired", 0)
                .await
                .map_err(ApiError::from_store)?;
            return Err(error);
        }
    };
    let credentials = codex::refresh(&state, scope, &secret, owner, credentials).await?;
    let dispatch = match begin_attempt(
        &state,
        &principal,
        AttemptRequest {
            managed_route: None,
            personal_route: None,
            public_model: &alias,
            model: &model,
            completion_bound: None,
            task_id: task_id.as_deref(),
            snapshot,
            request_body: &body,
            protocol: guard_protocol,
        },
    )
    .await
    {
        Ok(dispatch) => dispatch,
        Err(error) => {
            // Admission failed before any upstream execution was initiated.
            state
                .store
                .finish_codex_lease(scope, secret.account_id, owner, "ready", 0)
                .await
                .map_err(ApiError::from_store)?;
            return Err(error);
        }
    };
    state
        .requests
        .fetch_add(1, std::sync::atomic::Ordering::Relaxed);
    if let Err(error) = state
        .store
        .bind_codex_attempt(scope, secret.account_id, owner, dispatch.attempt)
        .await
    {
        state
            .store
            .finish_codex_lease(scope, secret.account_id, owner, "ready", 0)
            .await
            .map_err(ApiError::from_store)?;
        return Ok(finalize_response(&state, dispatch, Err(ApiError::from_store(error))).await);
    }
    let usage_attempt = state.usage.begin();
    let result=async {
        // No retries or fallback after dispatch: completion may be uncertain.
        let upstream=client.post(endpoint).bearer_auth(&credentials.access_token).timeout(timeout).json(&request).send().await.map_err(|_| ApiError::upstream())?;
        if upstream.status().is_client_error() {
            let health=if upstream.status()==reqwest::StatusCode::UNAUTHORIZED || upstream.status()==reqwest::StatusCode::FORBIDDEN {"authentication_expired"} else if upstream.status()==reqwest::StatusCode::TOO_MANY_REQUESTS {"cooldown"} else {"ready"};
            let cooldown=if health=="cooldown" {upstream.headers().get("retry-after").and_then(|v| v.to_str().ok()).and_then(|v| v.parse::<i32>().ok()).unwrap_or(60).clamp(1,86400)} else {0};
            state.store.finish_codex_lease(scope,secret.account_id,owner,health,cooldown).await.map_err(ApiError::from_store)?;
            return Err(ApiError::upstream());
        }
        if !upstream.status().is_success() || !upstream.headers().get("content-type").and_then(|v| v.to_str().ok()).is_some_and(|v| v.starts_with("text/event-stream")) {return Err(ApiError::upstream());}
        let terminal=read_terminal(upstream).await?;
        // A well-formed terminal event proves provider execution ended.
        let (health,cooldown)=if terminal.limit {("cooldown",60)} else {("ready",0)};
        state.store.finish_codex_lease(scope,secret.account_id,owner,health,cooldown).await.map_err(ApiError::from_store)?;
        let mut response=terminal.response.ok_or_else(ApiError::upstream)?;
        if !super::responses::valid_responses_response(&response) || response["status"]!="completed" {return Err(ApiError::upstream());}
        let provider_model=provider_reported_model(&response);
        let usage=super::responses::responses_usage(&response);
        if let Some((input,output))=usage {usage_attempt.report(&json!({"prompt_tokens":input,"completion_tokens":output}));}
        let token_categories=usage.and_then(|totals| niu_storage::RequestTokenCategories::from_responses_usage(&response["usage"],totals));
        response["model"]=json!(alias);
        let mut value=match protocol {
            Protocol::Responses=>response,
            Protocol::Chat=>{
                let text=response["output"].as_array().unwrap().iter().filter_map(|item| item.get("content").and_then(Value::as_array)).flatten().filter_map(|part| part.get("text").or_else(|| part.get("refusal")).and_then(Value::as_str)).collect::<String>();
                let mut chat=json!({"id":format!("chatcmpl-{}",Uuid::new_v4()),"object":"chat.completion","created":codex::now(),"model":alias,"choices":[{"index":0,"message":{"role":"assistant","content":text},"finish_reason":"stop"}]});
                if let Some((input,output))=usage {chat["usage"]=json!({"prompt_tokens":input,"completion_tokens":output,"total_tokens":input+output});}
                chat
            }
        };
        crate::customer_response::sanitize(&mut value);
        Ok(ProviderResponse{finish_reasons:None,response:Json(value).into_response(),completed:true,usage,provider_model,token_categories})
    }.await;
    if result.is_err() {
        state
            .failures
            .fetch_add(1, std::sync::atomic::Ordering::Relaxed);
    }
    Ok(finalize_response(&state, dispatch, result).await)
}

fn upstream_body(body: &Value, slug: &str, protocol: Protocol) -> Result<Value, ApiError> {
    let object = body
        .as_object()
        .ok_or_else(|| ApiError::invalid_request("The request body must be a JSON object"))?;
    let allowed: &[&str] = match protocol {
        Protocol::Chat => &["model", "messages", "stream"],
        Protocol::Responses => &["model", "input", "instructions", "stream", "store"],
    };
    if object.keys().any(|k| !allowed.contains(&k.as_str())) {
        return Err(ApiError::unsupported_message(
            "Codex subscriptions currently support buffered text requests. Sampling, token limits and tools are not supported by this connection.",
        ));
    }
    if body.get("stream").is_some_and(|v| v != false) {
        return Err(ApiError::unsupported_message(
            "This Codex connection currently returns buffered responses. Set stream to false.",
        ));
    }
    if body.get("store").is_some_and(|v| v != false) {
        return Err(ApiError::invalid_request(
            "Codex subscription requests require store: false.",
        ));
    }
    let mut request = json!({"model":slug,"store":false,"stream":true});
    match protocol {
        Protocol::Responses => {
            let input = body
                .get("input")
                .and_then(Value::as_str)
                .filter(|s| !s.is_empty())
                .ok_or_else(|| {
                    ApiError::invalid_request("input must be a non-empty text string")
                })?;
            request["input"] = json!([{ "role":"user","content":input }]);
            if let Some(instructions) = body.get("instructions") {
                if !instructions.is_string() {
                    return Err(ApiError::invalid_request("instructions must be a string"));
                }
                request["instructions"] = instructions.clone();
            }
        }
        Protocol::Chat => {
            let messages = body
                .get("messages")
                .and_then(Value::as_array)
                .filter(|a| !a.is_empty())
                .ok_or_else(|| {
                    ApiError::invalid_request("messages must contain at least one message")
                })?;
            let mut input = Vec::new();
            for message in messages {
                let role = message
                    .get("role")
                    .and_then(Value::as_str)
                    .filter(|r| matches!(*r, "system" | "developer" | "user" | "assistant"))
                    .ok_or_else(|| {
                        ApiError::invalid_request("Codex text messages require a supported role")
                    })?;
                let content = message
                    .get("content")
                    .and_then(Value::as_str)
                    .ok_or_else(|| {
                        ApiError::invalid_request("Codex messages currently require text content")
                    })?;
                if message
                    .as_object()
                    .is_none_or(|m| m.keys().any(|k| !["role", "content"].contains(&k.as_str())))
                {
                    return Err(ApiError::invalid_request(
                        "Unsupported field in Codex text message",
                    ));
                }
                input.push(
                    json!({"role":if role=="system" {"developer"} else {role},"content":content}),
                );
            }
            request["input"] = json!(input);
        }
    }
    Ok(request)
}

struct Terminal {
    response: Option<Value>,
    limit: bool,
}
#[derive(Default)]
struct Events {
    line: Vec<u8>,
    data: Vec<u8>,
    total: usize,
}
impl Events {
    fn feed(&mut self, bytes: &[u8]) -> Result<Option<Terminal>, ApiError> {
        self.total = self
            .total
            .checked_add(bytes.len())
            .filter(|size| *size <= 32 * 1024 * 1024)
            .ok_or_else(ApiError::upstream)?;
        for &byte in bytes {
            if byte != b'\n' {
                self.line.push(byte);
                if self.line.len() > 16 * 1024 * 1024 {
                    return Err(ApiError::upstream());
                }
                continue;
            }
            if self.line.last() == Some(&b'\r') {
                self.line.pop();
            }
            if self.line.is_empty() {
                if self.data.is_empty() {
                    continue;
                }
                let event: Value =
                    serde_json::from_slice(&self.data).map_err(|_| ApiError::upstream())?;
                self.data.clear();
                match event.get("type").and_then(Value::as_str) {
                    Some("response.completed") => {
                        let response = event
                            .get("response")
                            .filter(|r| r["object"] == "response" && r["status"] == "completed")
                            .cloned()
                            .ok_or_else(ApiError::upstream)?;
                        return Ok(Some(Terminal {
                            response: Some(response),
                            limit: false,
                        }));
                    }
                    Some("response.failed" | "response.incomplete") => {
                        let status = if event["type"] == "response.failed" {
                            "failed"
                        } else {
                            "incomplete"
                        };
                        if event["response"]["object"] != "response"
                            || event["response"]["status"] != status
                        {
                            return Err(ApiError::upstream());
                        }
                        let code = event
                            .pointer("/response/error/code")
                            .and_then(Value::as_str);
                        return Ok(Some(Terminal {
                            response: None,
                            limit: matches!(
                                code,
                                Some(
                                    "subscription_sharing_usage_limit_exceeded"
                                        | "subscription_sharing_usage_unavailable"
                                )
                            ),
                        }));
                    }
                    Some("error") => return Err(ApiError::upstream()),
                    _ => {}
                }
            } else if let Some(data) = self.line.strip_prefix(b"data:") {
                let data = data.strip_prefix(b" ").unwrap_or(data);
                if !self.data.is_empty() {
                    self.data.push(b'\n');
                }
                if self.data.len() + data.len() > 16 * 1024 * 1024 {
                    return Err(ApiError::upstream());
                }
                self.data.extend_from_slice(data);
            }
            self.line.clear();
        }
        Ok(None)
    }
}
async fn read_terminal(mut upstream: reqwest::Response) -> Result<Terminal, ApiError> {
    let mut events = Events::default();
    while let Some(chunk) = upstream.chunk().await.map_err(|_| ApiError::upstream())? {
        if let Some(terminal) = events.feed(&chunk)? {
            return Ok(terminal);
        }
    }
    Err(ApiError::upstream())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn terminal_parser_handles_fragmented_unicode_and_crlf() {
        let response = json!({"type":"response.completed","response":{"object":"response","status":"completed","output":[{"text":"你好"}]}});
        let bytes = format!("event: response.completed\r\ndata: {response}\r\n\r\n").into_bytes();
        for split in 0..bytes.len() {
            let mut events = Events::default();
            assert!(events.feed(&bytes[..split]).unwrap().is_none());
            assert!(
                events
                    .feed(&bytes[split..])
                    .unwrap()
                    .unwrap()
                    .response
                    .is_some()
            );
        }
        assert!(Events::default().feed(b"data: {broken}\n\n").is_err());
        assert!(
            Events::default()
                .feed(b"data: {\"type\":\"response.output_text.delta\",\"delta\":\"hi\"}\n\n")
                .unwrap()
                .is_none()
        );
    }
    #[test]
    fn maps_text_without_silently_discarding_unsupported_options() {
        let body = json!({"model":"codex/test","messages":[{"role":"system","content":"Be brief"},{"role":"user","content":"Hi"}]});
        let upstream = upstream_body(&body, "test", Protocol::Chat).unwrap();
        assert_eq!(upstream["input"][0]["role"], "developer");
        assert_eq!(upstream["stream"], true);
        assert_eq!(upstream["store"], false);
        for field in ["temperature", "max_tokens", "tools", "api_base"] {
            let mut unsupported = body.clone();
            unsupported[field] = json!(1);
            assert!(upstream_body(&unsupported, "test", Protocol::Chat).is_err());
        }
    }
}
