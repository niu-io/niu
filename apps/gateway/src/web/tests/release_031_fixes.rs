use super::*;
use axum::{
    body::{Body, to_bytes},
    http::Method,
    response::IntoResponse,
};
use base64::Engine as _;
use niu_storage::{OperatorAuditActor, OperatorRole, OperatorScope};
use std::sync::Arc;
use tokio::net::TcpListener;

const ADMIN: &str = "niu-test-admin-token-that-is-long-1234";
const MASTER_A: &str = "release-031-master-secret-alpha-32-chars-minimum";
const MASTER_B: &str = "release-031-master-secret-bravo-32-chars-minimum";

async fn json_call(
    app: &Router,
    method: Method,
    path: &str,
    token: Option<&str>,
    body: Option<Value>,
) -> (StatusCode, HeaderMap, Value) {
    let mut builder = Request::builder().method(method).uri(path);
    if let Some(token) = token {
        builder = builder.header("authorization", format!("Bearer {token}"));
    }
    let body = if let Some(value) = body {
        builder = builder.header("content-type", "application/json");
        Body::from(value.to_string())
    } else {
        Body::empty()
    };
    let response = app
        .clone()
        .oneshot(builder.body(body).unwrap())
        .await
        .unwrap();
    let status = response.status();
    let headers = response.headers().clone();
    let bytes = to_bytes(response.into_body(), 1_048_576).await.unwrap();
    let value = if bytes.is_empty() {
        Value::Null
    } else {
        serde_json::from_slice(&bytes)
            .unwrap_or_else(|_| Value::String(String::from_utf8_lossy(&bytes).into_owned()))
    };
    (status, headers, value)
}

/// niu-nnkd.1: Revealable workspace API key secrets are encrypted at rest with
/// CredentialCipher (tenant+key-ID AAD), audited on single-key reveal, purged on
/// expiry/revocation/rotation, rejected on bulk list, omitted without cipher,
/// rotated via EncryptionRewrapTarget::ApiKeySecret, and never stored for
/// one-time agent authorization credentials.
#[sqlx::test(migrator = "niu_storage::MIGRATOR")]
#[ignore = "requires PostgreSQL"]
async fn api_key_secrets_are_encrypted_audited_scoped_rewrappable_and_purged(pool: PgPool) {
    let mut state = test_state(None, pool.clone());
    let cipher_a = Arc::new(crate::vendors::crypto::CredentialCipher::new(MASTER_A).unwrap());
    let cipher_b = Arc::new(crate::vendors::crypto::CredentialCipher::new(MASTER_B).unwrap());
    state.vendor_cipher = Some(cipher_a.clone());
    state
        .store
        .configure_platform_currency("USD")
        .await
        .unwrap();
    crate::payments::readiness::configure_test_gateway(&mut state).await;
    let scope = state.store.default_workspace().await.unwrap();
    let viewer = state
        .store
        .create_operator(
            OperatorScope {
                organization_id: scope.organization_id,
                project_id: Some(scope.project_id),
            },
            "Key Viewer",
            OperatorRole::Viewer,
            3600,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let admin = state
        .store
        .create_operator(
            OperatorScope {
                organization_id: scope.organization_id,
                project_id: Some(scope.project_id),
            },
            "Key Admin",
            OperatorRole::Admin,
            3600,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let app = router(state.clone());

    // Create a workspace API key via the workspace alias route.
    let create_path = format!("/api/v1/workspaces/{}/keys", scope.project_id);
    let (status, _, created) = json_call(
        &app,
        Method::POST,
        &create_path,
        Some(&admin.token),
        Some(json!({"name": "Encrypted Secret Key", "allowed_models": ["*"], "ttl_seconds": 3600})),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{created}");
    let key_id: Uuid = created["id"].as_str().unwrap().parse().unwrap();
    let raw_token = created["token"].as_str().unwrap().to_owned();

    // Verify ciphertext in Postgres is AEAD envelope (version byte 1) and never plaintext.
    let ciphertext: Option<Vec<u8>> =
        sqlx::query_scalar("SELECT token_secret_ciphertext FROM api_keys WHERE id = $1")
            .bind(key_id)
            .fetch_one(&pool)
            .await
            .unwrap();
    let ciphertext = ciphertext.expect("encrypted secret must be persisted");
    assert_eq!(ciphertext.first(), Some(&1));
    assert!(!String::from_utf8_lossy(&ciphertext).contains("niu_"));
    assert_eq!(
        cipher_a
            .open_api_key_secret(scope, key_id, &ciphertext)
            .unwrap(),
        raw_token
    );
    // Wrong key ID AAD must fail authentication.
    assert!(
        cipher_a
            .open_api_key_secret(scope, Uuid::new_v4(), &ciphertext)
            .is_err()
    );

    // Startup/offline encryption validation must pass with cipher_a and fail with None / cipher_b.
    crate::admin::validate_saved_api_key_secrets(&state.store, Some(&cipher_a))
        .await
        .unwrap();
    assert!(
        crate::admin::validate_saved_api_key_secrets(&state.store, None)
            .await
            .is_err()
    );
    assert!(
        crate::admin::validate_saved_api_key_secrets(&state.store, Some(&cipher_b))
            .await
            .is_err()
    );

    // Bulk list_keys?reveal=true MUST be rejected with 400 Bad Request.
    let (status, _, _) = json_call(
        &app,
        Method::GET,
        &format!("{create_path}?reveal=true"),
        Some(&admin.token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);

    // Single-key reveal requires Write permission (Viewer -> 403).
    let single_path = format!("{create_path}/{key_id}?reveal=true");
    let (status, _, _) =
        json_call(&app, Method::GET, &single_path, Some(&viewer.token), None).await;
    assert_eq!(status, StatusCode::FORBIDDEN);

    // Single-key reveal with Write permission returns secret + Cache-Control: no-store + audit row.
    let (status, headers, revealed) =
        json_call(&app, Method::GET, &single_path, Some(&admin.token), None).await;
    assert_eq!(status, StatusCode::OK, "{revealed}");
    assert_eq!(
        headers
            .get(axum::http::header::CACHE_CONTROL)
            .and_then(|v| v.to_str().ok()),
        Some("no-store")
    );
    assert_eq!(revealed["token"], raw_token);
    assert!(
        revealed["token_preview"]
            .as_str()
            .unwrap()
            .starts_with("niu_")
    );

    let audit_actor: String = sqlx::query_scalar(
        "SELECT actor FROM key_audit_events WHERE key_id = $1 AND action = 'revealed'",
    )
    .bind(key_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(audit_actor, format!("operator:{}", admin.operator_id));

    // Offline encryption key rotation rewraps api_keys.token_secret_ciphertext cleanly.
    let op = Uuid::new_v4();
    let rotation = state
        .store
        .begin_encryption_rotation(op, [0xAA; 32], [0xBB; 32])
        .await
        .unwrap();
    let replacement_ct = cipher_b
        .seal_api_key_secret(scope, key_id, &raw_token)
        .unwrap();
    state
        .store
        .replace_encrypted_envelope(
            &rotation,
            niu_storage::EncryptionRewrapTarget::ApiKeySecret(key_id),
            &ciphertext,
            &replacement_ct,
        )
        .await
        .unwrap();
    state
        .store
        .complete_encryption_rotation(&rotation)
        .await
        .unwrap();
    crate::admin::validate_saved_api_key_secrets(&state.store, Some(&cipher_b))
        .await
        .unwrap();

    // Expired key secret is purged by background cleanup.
    sqlx::query(
        "UPDATE api_keys SET expires_at = clock_timestamp() - interval '1 second' WHERE id = $1",
    )
    .bind(key_id)
    .execute(&pool)
    .await
    .unwrap();
    let purged = state.store.purge_expired_key_secrets().await.unwrap();
    assert_eq!(purged, 1);
    let remaining: Option<Vec<u8>> =
        sqlx::query_scalar("SELECT token_secret_ciphertext FROM api_keys WHERE id = $1")
            .bind(key_id)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert!(remaining.is_none());

    // Without vendor_cipher, newly created keys store no revealable secret and reveal omits token.
    let mut no_cipher_state = test_state(None, pool.clone());
    no_cipher_state.vendor_cipher = None;
    crate::payments::readiness::configure_test_gateway(&mut no_cipher_state).await;
    let no_cipher_app = router(no_cipher_state);
    let (status, _, created_no_cipher) = json_call(
        &no_cipher_app,
        Method::POST,
        &create_path,
        Some(&admin.token),
        Some(json!({"name": "No Cipher Key", "allowed_models": ["*"], "ttl_seconds": 3600})),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED);
    let no_cipher_id: Uuid = created_no_cipher["id"].as_str().unwrap().parse().unwrap();
    let (status, _, no_cipher_revealed) = json_call(
        &no_cipher_app,
        Method::GET,
        &format!("{create_path}/{no_cipher_id}?reveal=true"),
        Some(&admin.token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert!(no_cipher_revealed.get("token").is_none());
    assert!(no_cipher_revealed.get("token_preview").is_none());

    // One-time agent authorization credentials must not persist a revealable secret.
    let pending = state
        .store
        .create_agent_authorization("Codex")
        .await
        .unwrap();
    state
        .store
        .approve_agent_authorization(
            &pending.user_code,
            scope,
            admin.operator_id,
            &["*".to_owned()],
            3600,
        )
        .await
        .unwrap();
    sqlx::query(
        "UPDATE agent_authorizations SET next_poll_at = clock_timestamp() - interval '10 seconds'",
    )
    .execute(&pool)
    .await
    .unwrap();
    let agent_key = state
        .store
        .exchange_agent_authorization(&pending.device_secret)
        .await
        .unwrap()
        .expect("approved agent key");
    let agent_ct: Option<Vec<u8>> =
        sqlx::query_scalar("SELECT token_secret_ciphertext FROM api_keys WHERE id = $1")
            .bind(agent_key.id)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert!(agent_ct.is_none());
}

/// niu-nnkd.5 & niu-nnkd.19:
/// 1. Under default capture settings (DefaultOn), >1 MiB multimodal base64
///    image/PDF payloads on /v1/responses, /v1/messages, and /v1beta/models/*
///    pass request_payloads::capture without HTTP 413 (while >1 MiB on
///    /v1/chat/completions still returns 413).
/// 2. /v1/responses with `"store": false` persists ZERO request_payloads rows,
///    while omitting `"store"` persists a payload row under DefaultOn.
#[sqlx::test(migrator = "niu_storage::MIGRATOR")]
#[ignore = "requires PostgreSQL"]
async fn multimodal_capture_allows_1_to_8_mib_and_responses_honors_store_false(pool: PgPool) {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let api_base = format!("http://{}/v1", listener.local_addr().unwrap());
    let upstream = Router::new()
        .route(
            "/v1/responses",
            axum::routing::post(|| async {
                Json(json!({
                    "id": "resp_test_1",
                    "object": "response",
                    "status": "completed",
                    "model": "upstream-multimodal",
                    "output": [{
                        "type": "message",
                        "id": "msg_out_1",
                        "role": "assistant",
                        "status": "completed",
                        "content": [{"type": "output_text", "text": "ok", "annotations": []}]
                    }],
                    "usage": {"input_tokens": 12, "output_tokens": 3, "total_tokens": 15}
                }))
            }),
        )
        .route(
            "/v1/messages",
            axum::routing::post(|| async {
                Json(json!({
                    "id": "msg_test_1",
                    "type": "message",
                    "role": "assistant",
                    "model": "upstream-multimodal",
                    "content": [{"type": "text", "text": "ok"}],
                    "stop_reason": "end_turn",
                    "stop_sequence": null,
                    "usage": {"input_tokens": 12, "output_tokens": 3}
                }))
            }),
        )
        .route(
            "/v1/models/{model_action}",
            axum::routing::post(|| async {
                Json(json!({
                    "candidates": [{
                        "content": {"role": "model", "parts": [{"text": "ok"}]},
                        "finishReason": "STOP"
                    }],
                    "usageMetadata": {
                        "promptTokenCount": 12,
                        "candidatesTokenCount": 3,
                        "totalTokenCount": 15
                    }
                }))
            }),
        );
    let server = tokio::spawn(async move {
        axum::serve(listener, upstream).await.unwrap();
    });

    let mut state = test_state(Some(api_base.clone()), pool.clone());
    let cipher = Arc::new(crate::vendors::crypto::CredentialCipher::new(MASTER_A).unwrap());
    state.vendor_cipher = Some(cipher.clone());
    state
        .store
        .configure_platform_currency("USD")
        .await
        .unwrap();
    crate::payments::readiness::configure_test_gateway(&mut state).await;
    let scope = state.store.default_workspace().await.unwrap();
    // Create owner-funded personal routes for each protocol so unpriced multimodal tests run cleanly.
    for (alias, adapter, caps) in [
        (
            "mm-responses",
            "openai",
            json!({
                "supports_responses": true,
                "catalog": {"input_modalities": ["text", "image"], "output_modalities": ["text"]}
            }),
        ),
        (
            "mm-messages",
            "anthropic",
            json!({
                "supports_messages": true,
                "catalog": {"input_modalities": ["text", "image", "file"], "output_modalities": ["text"]}
            }),
        ),
        (
            "mm-gemini",
            "gemini",
            json!({
                "supports_generate_content": true,
                "catalog": {"input_modalities": ["text", "image", "file"], "output_modalities": ["text"]}
            }),
        ),
    ] {
        let vid = Uuid::new_v4();
        state
            .store
            .create_vendor(niu_storage::VendorInput {
                id: vid,
                name: format!("Vendor {alias}"),
                adapter: adapter.into(),
                api_base: api_base.clone(),
                enabled: true,
                credential_ciphertext: cipher.seal(vid, "upstream-key-123").unwrap(),
            })
            .await
            .unwrap();
        state
            .store
            .assign_personal_vendor_owner(vid, scope.organization_id, 1)
            .await
            .unwrap();
        state
            .store
            .upsert_vendor_model(
                vid,
                niu_storage::VendorModelInput {
                    alias: alias.into(),
                    upstream_model: "upstream-multimodal".into(),
                    public_catalog: false,
                    enabled: true,
                    capabilities: caps,
                    pricing: None,
                    expected_revision: None,
                },
            )
            .await
            .unwrap();
    }

    let key = state
        .store
        .issue_key(scope, "Multimodal key", &["*".into()], 3600)
        .await
        .unwrap();
    let app = router(state.clone());

    // 1. Construct valid >1 MiB base64 payloads (~1.4 MiB JSON body each).
    let raw_bytes = vec![0x25_u8; 1_050_000]; // 1.05 MB raw -> ~1.4 MB base64
    let b64 = base64::engine::general_purpose::STANDARD.encode(&raw_bytes);
    assert!(b64.len() > 1_048_576);

    // 1a. /v1/responses with >1 MiB base64 image under default capture (no opt-out header).
    let resp_body = json!({
        "model": "mm-responses",
        "input": [{
            "role": "user",
            "content": [
                {"type": "input_text", "text": "Describe"},
                {"type": "input_image", "image_url": format!("data:image/png;base64,{b64}")}
            ]
        }]
    });
    let (status, _, body) = json_call(
        &app,
        Method::POST,
        "/v1/responses",
        Some(&key.token),
        Some(resp_body),
    )
    .await;
    assert_ne!(
        status,
        StatusCode::PAYLOAD_TOO_LARGE,
        "must not return 413: {body}"
    );
    assert_eq!(status, StatusCode::OK, "{body}");

    // 1b. /v1/messages with >1 MiB base64 PDF under default capture.
    let msg_body = json!({
        "model": "mm-messages",
        "max_tokens": 16,
        "messages": [{
            "role": "user",
            "content": [
                {"type": "document", "source": {"type": "base64", "media_type": "application/pdf", "data": b64}},
                {"type": "text", "text": "Summarize"}
            ]
        }]
    });
    let (status, _, body) = json_call(
        &app,
        Method::POST,
        "/v1/messages",
        Some(&key.token),
        Some(msg_body),
    )
    .await;
    assert_ne!(
        status,
        StatusCode::PAYLOAD_TOO_LARGE,
        "must not return 413: {body}"
    );
    assert_eq!(status, StatusCode::OK, "{body}");

    // 1c. /v1beta/models/mm-gemini:generateContent with >1 MiB base64 PDF under default capture.
    let gem_body = json!({
        "contents": [{
            "role": "user",
            "parts": [
                {"inlineData": {"mimeType": "application/pdf", "data": b64}},
                {"text": "Summarize"}
            ]
        }]
    });
    let (status, _, body) = json_call(
        &app,
        Method::POST,
        "/v1beta/models/mm-gemini:generateContent",
        Some(&key.token),
        Some(gem_body),
    )
    .await;
    assert_ne!(
        status,
        StatusCode::PAYLOAD_TOO_LARGE,
        "must not return 413: {body}"
    );
    assert_eq!(status, StatusCode::OK, "{body}");

    // 1d. /v1/chat/completions STILL enforces the 1 MiB limit with HTTP 413.
    let chat_oversized = json!({
        "model": "fast",
        "messages": [{"role": "user", "content": b64}]
    });
    let (status, _, _) = json_call(
        &app,
        Method::POST,
        "/v1/chat/completions",
        Some(&key.token),
        Some(chat_oversized),
    )
    .await;
    assert_eq!(status, StatusCode::PAYLOAD_TOO_LARGE);

    // 2. niu-nnkd.19: /v1/responses with `"store": false` persists ZERO request_payloads rows.
    let (status, headers, body) = json_call(
        &app,
        Method::POST,
        "/v1/responses",
        Some(&key.token),
        Some(json!({
            "model": "mm-responses",
            "store": false,
            "input": "do not persist this prompt"
        })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    let no_store_attempt: Uuid = headers
        .get("x-niu-attempt-id")
        .unwrap()
        .to_str()
        .unwrap()
        .parse()
        .unwrap();

    // Control: /v1/responses WITHOUT `"store": false` persists a request_payloads row.
    let (status, headers, body) = json_call(
        &app,
        Method::POST,
        "/v1/responses",
        Some(&key.token),
        Some(json!({
            "model": "mm-responses",
            "input": "persist this prompt"
        })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    let stored_attempt: Uuid = headers
        .get("x-niu-attempt-id")
        .unwrap()
        .to_str()
        .unwrap()
        .parse()
        .unwrap();

    state.diagnostic_writes.close();
    state.diagnostic_writes.wait().await;

    let no_store_count: i64 =
        sqlx::query_scalar("SELECT count(*) FROM request_payloads WHERE attempt_id = $1")
            .bind(no_store_attempt)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(
        no_store_count, 0,
        "store: false on /v1/responses must not persist payload"
    );

    let stored_count: i64 =
        sqlx::query_scalar("SELECT count(*) FROM request_payloads WHERE attempt_id = $1")
            .bind(stored_attempt)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(
        stored_count, 1,
        "default capture on /v1/responses should persist payload"
    );

    server.abort();
}

/// niu-nnkd.20: /v1/messages accepts document.citations.enabled = true and
/// projects sanitized citations in both buffered and streaming responses (HTTP 200).
#[sqlx::test(migrator = "niu_storage::MIGRATOR")]
#[ignore = "requires PostgreSQL"]
async fn messages_projects_document_citations_in_buffered_and_streaming_paths(pool: PgPool) {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let api_base = format!("http://{}/v1", listener.local_addr().unwrap());
    let upstream = Router::new().route(
        "/v1/messages",
        axum::routing::post(|Json(body): Json<Value>| async move {
            if body.get("stream").and_then(Value::as_bool) == Some(true) {
                let sse = concat!(
                    "event: message_start\n",
                    "data: {\"type\":\"message_start\",\"message\":{\"id\":\"msg_s1\",\"type\":\"message\",\"role\":\"assistant\",\"model\":\"claude-fixture\",\"content\":[],\"stop_reason\":null,\"stop_sequence\":null,\"usage\":{\"input_tokens\":20,\"output_tokens\":1}}}\n\n",
                    "event: content_block_start\n",
                    "data: {\"type\":\"content_block_start\",\"index\":0,\"content_block\":{\"type\":\"text\",\"text\":\"\"}}\n\n",
                    "event: content_block_delta\n",
                    "data: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"citations_delta\",\"citation\":{\"type\":\"char_location\",\"cited_text\":\"Grass is green.\",\"document_index\":0,\"document_title\":\"Facts\",\"start_char_index\":0,\"end_char_index\":15}}}\n\n",
                    "event: content_block_delta\n",
                    "data: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"text_delta\",\"text\":\"Grass is green.\"}}\n\n",
                    "event: content_block_stop\n",
                    "data: {\"type\":\"content_block_stop\",\"index\":0}\n\n",
                    "event: message_delta\n",
                    "data: {\"type\":\"message_delta\",\"delta\":{\"stop_reason\":\"end_turn\",\"stop_sequence\":null},\"usage\":{\"output_tokens\":5}}\n\n",
                    "event: message_stop\n",
                    "data: {\"type\":\"message_stop\"}\n\n"
                );
                (
                    [(axum::http::header::CONTENT_TYPE, "text/event-stream")],
                    sse,
                )
                    .into_response()
            } else {
                Json(json!({
                    "id": "msg_b1",
                    "type": "message",
                    "role": "assistant",
                    "model": "claude-fixture",
                    "content": [{
                        "type": "text",
                        "text": "Grass is green.",
                        "citations": [{
                            "type": "char_location",
                            "cited_text": "Grass is green.",
                            "document_index": 0,
                            "document_title": "Facts",
                            "start_char_index": 0,
                            "end_char_index": 15
                        }]
                    }],
                    "stop_reason": "end_turn",
                    "stop_sequence": null,
                    "usage": {"input_tokens": 20, "output_tokens": 5}
                }))
                .into_response()
            }
        }),
    );
    let server = tokio::spawn(async move {
        axum::serve(listener, upstream).await.unwrap();
    });

    let mut state = test_state(Some(api_base.clone()), pool.clone());
    let cipher = Arc::new(crate::vendors::crypto::CredentialCipher::new(MASTER_A).unwrap());
    state.vendor_cipher = Some(cipher.clone());
    state
        .store
        .configure_platform_currency("USD")
        .await
        .unwrap();
    crate::payments::readiness::configure_test_gateway(&mut state).await;
    let scope = state.store.default_workspace().await.unwrap();
    let vid = Uuid::new_v4();
    state
        .store
        .create_vendor(niu_storage::VendorInput {
            id: vid,
            name: "Anthropic Citations".into(),
            adapter: "anthropic".into(),
            api_base,
            enabled: true,
            credential_ciphertext: cipher.seal(vid, "anthropic-key").unwrap(),
        })
        .await
        .unwrap();
    state
        .store
        .assign_personal_vendor_owner(vid, scope.organization_id, 1)
        .await
        .unwrap();
    state
        .store
        .upsert_vendor_model(
            vid,
            niu_storage::VendorModelInput {
                alias: "claude-cite".into(),
                upstream_model: "claude-fixture".into(),
                public_catalog: false,
                enabled: true,
                capabilities: json!({
                    "supports_messages": true,
                    "supports_messages_streaming": true
                }),
                pricing: None,
                expected_revision: None,
            },
        )
        .await
        .unwrap();
    let key = state
        .store
        .issue_key(scope, "Citations key", &["*".into()], 3600)
        .await
        .unwrap();
    let app = router(state);

    let base_request = |stream: bool| {
        json!({
            "model": "claude-cite",
            "max_tokens": 32,
            "stream": stream,
            "messages": [{
                "role": "user",
                "content": [
                    {
                        "type": "document",
                        "title": "Facts",
                        "citations": {"enabled": true},
                        "source": {"type": "text", "media_type": "text/plain", "data": "Grass is green."}
                    },
                    {"type": "text", "text": "What color is grass?"}
                ]
            }]
        })
    };

    // Buffered response projects sanitized citations with HTTP 200.
    let (status, _, buffered) = json_call(
        &app,
        Method::POST,
        "/v1/messages",
        Some(&key.token),
        Some(base_request(false)),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{buffered}");
    assert_eq!(buffered["content"][0]["text"], "Grass is green.");
    assert_eq!(
        buffered["content"][0]["citations"][0]["type"],
        "char_location"
    );
    assert_eq!(
        buffered["content"][0]["citations"][0]["cited_text"],
        "Grass is green."
    );

    // Streaming response projects sanitized citations_delta without mid-stream error.
    let response = app
        .clone()
        .oneshot(
            Request::post("/v1/messages")
                .header("authorization", format!("Bearer {}", key.token))
                .header("content-type", "application/json")
                .body(Body::from(base_request(true).to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let sse_text = String::from_utf8(
        to_bytes(response.into_body(), 65536)
            .await
            .unwrap()
            .to_vec(),
    )
    .unwrap();
    assert!(
        sse_text.contains("\"type\":\"citations_delta\""),
        "{sse_text}"
    );
    assert!(
        sse_text.contains("\"type\":\"char_location\""),
        "{sse_text}"
    );
    assert!(sse_text.contains("event: message_stop"), "{sse_text}");
    assert!(!sse_text.contains("event: error"), "{sse_text}");

    server.abort();
}

/// niu-nnkd.21: passwords::login returns HTTP 400 (not 429) for malformed email
/// syntax, allows >5 distinct users from the same client IP, and increments the
/// global bucket once per login attempt.
#[sqlx::test(migrator = "niu_storage::MIGRATOR")]
#[ignore = "requires PostgreSQL"]
async fn password_login_rejects_malformed_email_with_400_and_counts_global_once_per_attempt(
    pool: PgPool,
) {
    let mut state = test_state(None, pool.clone());
    state.password_auth = Some(Arc::new(
        crate::admin::passwords::Runtime::new("https://niu.example.test")
            .await
            .unwrap(),
    ));
    let app = router(state);

    // Malformed email syntax must return 400 Bad Request, never 429 Too Many Requests.
    let response = app
        .clone()
        .oneshot(
            Request::post("/api/v1/auth/login")
                .header("origin", "https://niu.example.test")
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({"email": "not-an-email", "password": "a valid length passphrase"})
                        .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    assert!(response.headers().get("retry-after").is_none());

    // 6 distinct users behind the same NAT IP all get 401 (not 429) and
    // increment the global bucket exactly 6 times (not 12).
    let peer = std::net::SocketAddr::from(([198, 51, 100, 42], 12345));
    for index in 0..6 {
        let mut req = Request::post("/api/v1/auth/login")
            .header("origin", "https://niu.example.test")
            .header("content-type", "application/json")
            .body(Body::from(
                json!({
                    "email": format!("nat-member-{index}@example.test"),
                    "password": "a valid length passphrase"
                })
                .to_string(),
            ))
            .unwrap();
        req.extensions_mut()
            .insert(axum::extract::ConnectInfo(peer));
        let response = app.clone().oneshot(req).await.unwrap();
        assert_eq!(
            response.status(),
            StatusCode::UNAUTHORIZED,
            "shared NAT IP login {index} should not be rate-limited at 5/min"
        );
    }
    let global_attempts: i32 =
        sqlx::query_scalar("SELECT attempts FROM password_login_admission WHERE kind = 'global'")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(
        global_attempts, 6,
        "global login bucket must increment once per attempt"
    );
}

/// niu-nnkd.6: Approving a Limited Preview registration and deleting its empty
/// initial workspace via HTTP DELETE /api/v1/workspaces/{workspace} succeeds.
#[sqlx::test(migrator = "niu_storage::MIGRATOR")]
#[ignore = "requires PostgreSQL"]
async fn limited_preview_approved_empty_workspace_deletes_via_http(pool: PgPool) {
    let mut state = test_state(None, pool.clone());
    state.password_auth = Some(Arc::new(
        crate::admin::passwords::Runtime::new("https://niu.example.test")
            .await
            .unwrap(),
    ));
    let app = router(state.clone());

    let submit = app
        .clone()
        .oneshot(
            Request::post("/api/v1/auth/registrations")
                .header("origin", "https://niu.example.test")
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({
                        "email": "delete-ws@example.test",
                        "name": "Grace Hopper",
                        "organization_name": "Compiler Works",
                        "workspace_name": "Initial Empty Workspace",
                        "password": "synthetic preview passphrase 1"
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(submit.status(), StatusCode::ACCEPTED);

    let (status, _, queue) = json_call(
        &app,
        Method::GET,
        "/api/v1/admin/registrations?status=pending",
        Some(ADMIN),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{queue}");
    let request_id = queue["data"][0]["id"].as_str().unwrap();

    let (status, _, approved) = json_call(
        &app,
        Method::POST,
        &format!("/api/v1/admin/registrations/{request_id}/approve"),
        Some(ADMIN),
        Some(json!({"expected_revision": "1"})),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{approved}");

    let project_id: Uuid = sqlx::query_scalar(
        "SELECT approved_project_id FROM account_registration_requests WHERE id = $1::uuid",
    )
    .bind(request_id)
    .fetch_one(&pool)
    .await
    .unwrap();

    // Sign in as the approved owner and delete their empty initial workspace.
    let login = app
        .clone()
        .oneshot(
            Request::post("/api/v1/auth/login")
                .header("origin", "https://niu.example.test")
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({
                        "email": "delete-ws@example.test",
                        "password": "synthetic preview passphrase 1"
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(login.status(), StatusCode::OK);
    let login_json: Value =
        serde_json::from_slice(&to_bytes(login.into_body(), 16384).await.unwrap()).unwrap();
    let owner_token = login_json["token"].as_str().unwrap();

    let (status, _, delete_body) = json_call(
        &app,
        Method::DELETE,
        &format!("/api/v1/workspaces/{project_id}"),
        Some(owner_token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::NO_CONTENT, "{delete_body}");
}

/// niu-nnkd.4: An already-running gateway (simulating a v0.3.0 replica with an
/// active route registry compiler) continues serving /catalog/v1/models with
/// HTTP 200 immediately after migration 0435 runs, without returning 503.
#[sqlx::test(migrations = false)]
#[ignore = "requires PostgreSQL"]
async fn running_gateway_serves_without_503_immediately_after_migration_0435(pool: PgPool) {
    let before_0435: Vec<_> = niu_storage::MIGRATOR
        .migrations
        .iter()
        .filter(|m| m.version < 435)
        .cloned()
        .collect();
    sqlx::migrate::Migrator {
        migrations: std::borrow::Cow::Owned(before_0435),
        ignore_missing: false,
        locking: true,
        no_tx: false,
    }
    .run(&pool)
    .await
    .unwrap();

    let mut state = test_state(None, pool.clone());
    Arc::make_mut(&mut state.config).models.clear();
    let cipher = Arc::new(crate::vendors::crypto::CredentialCipher::new(MASTER_A).unwrap());
    state.vendor_cipher = Some(cipher.clone());
    let compiler = Arc::new(
        crate::vendors::publication::Compiler::new(
            state.config.models.clone(),
            std::collections::BTreeSet::new(),
        )
        .unwrap(),
    );
    state.store = state.store.with_route_compiler(compiler);
    state
        .store
        .bootstrap_route_registry(vec![], None)
        .await
        .unwrap();
    state
        .store
        .configure_platform_currency("USD")
        .await
        .unwrap();

    let vid = Uuid::new_v4();
    state
        .store
        .create_vendor(niu_storage::VendorInput {
            id: vid,
            name: "Rolling Upgrade Vendor".into(),
            adapter: "openai".into(),
            api_base: "https://rolling.example.invalid/v1".into(),
            enabled: true,
            credential_ciphertext: cipher.seal(vid, "secret-key").unwrap(),
        })
        .await
        .unwrap();
    state
        .store
        .upsert_vendor_model(
            vid,
            niu_storage::VendorModelInput {
                alias: "comm/rolling".into(),
                upstream_model: "upstream/rolling".into(),
                public_catalog: false,
                enabled: true,
                capabilities: json!({}),
                pricing: Some(json!({
                    "currency": "USD",
                    "api_prompt_rate": 100,
                    "api_completion_rate": 200,
                    "cash_prompt_rate": 100,
                    "cash_completion_rate": 200,
                    "max_input_tokens": 1024,
                    "max_output_tokens": 512
                })),
                expected_revision: None,
            },
        )
        .await
        .unwrap();
    state
        .store
        .publish_retail_standard(
            niu_storage::RetailStandardPublication {
                model_alias: "comm/rolling".into(),
                currency: "USD".into(),
                schedule: niu_storage::RetailSchedule::Text(niu_storage::TextRetailSchedule {
                    prompt_rate: "500".into(),
                    completion_rate: "1000".into(),
                    cached_prompt_rate: None,
                    cache_write_prompt_rate: None,
                    reasoning_completion_rate: None,
                    minimum_charge_nanos: "0".into(),
                    request_fee_nanos: "0".into(),
                    context_tiers: vec![],
                }),
                expected_version: "0".into(),
                idempotency_key: Uuid::new_v4(),
                reason: "Rolling upgrade test".into(),
            },
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();

    let running_app = router(state.clone());
    // Warm the running replica's cached snapshot before migration.
    let (status, _, before) =
        json_call(&running_app, Method::GET, "/catalog/v1/models", None, None).await;
    assert_eq!(status, StatusCode::OK, "{before}");
    assert!(before["data"].as_array().unwrap().is_empty());

    // Apply migration 0435..=latest via production compatibility runner while the existing replica is running.
    niu_storage::run_migrations(&pool).await.unwrap();

    // Clear the 100ms in-memory check cache so the running replica hits DB immediately.
    *state.route_registry.write().await = None;

    // Immediately after migrating (with NO new replica bootstrap!), the running
    // replica MUST continue serving 200 OK (never 503!) and observe public_catalog=true.
    let (status, _, after) =
        json_call(&running_app, Method::GET, "/catalog/v1/models", None, None).await;
    assert_eq!(
        status,
        StatusCode::OK,
        "must not return 503 after migration 0435: {after}"
    );
    assert_eq!(after["data"].as_array().unwrap().len(), 1);
    assert_eq!(after["data"][0]["id"], "comm/rolling");
}

/// niu-nnkd.35: In resale mode, unpriced commercial models are hidden from
/// /catalog/v1/models, /v1/models, and workspace /api/v1/models by default,
/// while admins can inspect readiness_issues and internal/own_api_key routes
/// remain callable without selling prices.
#[sqlx::test(migrator = "niu_storage::MIGRATOR")]
#[ignore = "requires PostgreSQL"]
async fn unpriced_commercial_models_are_gated_in_resale_catalogs_and_visible_when_priced(
    pool: PgPool,
) {
    let mut state = test_state(None, pool.clone());
    Arc::make_mut(&mut state.config).models.clear();
    let cipher = Arc::new(crate::vendors::crypto::CredentialCipher::new(MASTER_A).unwrap());
    state.vendor_cipher = Some(cipher.clone());
    state
        .store
        .configure_platform_currency("USD")
        .await
        .unwrap();
    crate::payments::readiness::configure_test_gateway(&mut state).await;
    let scope = state.store.default_workspace().await.unwrap();
    let key = state
        .store
        .issue_key(scope, "Catalog key", &["*".into()], 3600)
        .await
        .unwrap();
    let member = state
        .store
        .create_operator(
            OperatorScope {
                organization_id: scope.organization_id,
                project_id: Some(scope.project_id),
            },
            "Catalog Member",
            OperatorRole::Viewer,
            3600,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let app = router(state.clone());

    // Create a commercial vendor + model WITHOUT procurement pricing and WITHOUT selling price.
    let vid = Uuid::new_v4();
    state
        .store
        .create_vendor(niu_storage::VendorInput {
            id: vid,
            name: "Commercial Vendor".into(),
            adapter: "openai".into(),
            api_base: "https://comm.example.invalid/v1".into(),
            enabled: true,
            credential_ciphertext: cipher.seal(vid, "secret-key").unwrap(),
        })
        .await
        .unwrap();
    state
        .store
        .upsert_vendor_model(
            vid,
            niu_storage::VendorModelInput {
                alias: "comm/unpriced".into(),
                upstream_model: "upstream/unpriced".into(),
                public_catalog: true,
                enabled: true,
                capabilities: json!({}),
                pricing: None,
                expected_revision: None,
            },
        )
        .await
        .unwrap();

    // Hidden from /catalog/v1/models, /v1/models, and workspace /api/v1/models.
    let (status, _, pub_cat) = json_call(&app, Method::GET, "/catalog/v1/models", None, None).await;
    assert_eq!(status, StatusCode::OK);
    assert!(pub_cat["data"].as_array().unwrap().is_empty(), "{pub_cat}");

    let (status, _, api_cat) =
        json_call(&app, Method::GET, "/v1/models", Some(&key.token), None).await;
    assert_eq!(status, StatusCode::OK);
    assert!(api_cat["data"].as_array().unwrap().is_empty(), "{api_cat}");

    let ws_models_path = format!(
        "/api/v1/models?organization_id={}&project_id={}",
        scope.organization_id, scope.project_id
    );
    let (status, _, ws_cat) = json_call(
        &app,
        Method::GET,
        &ws_models_path,
        Some(&member.token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert!(ws_cat["data"].as_array().unwrap().is_empty(), "{ws_cat}");

    // Installation admin inspecting /api/v1/models sees explicit callable=false & readiness_issues.
    let (status, _, admin_cat) =
        json_call(&app, Method::GET, "/api/v1/models", Some(ADMIN), None).await;
    assert_eq!(status, StatusCode::OK);
    let unpriced_entry = admin_cat["data"]
        .as_array()
        .unwrap()
        .iter()
        .find(|m| m["id"] == "comm/unpriced")
        .unwrap();
    assert_eq!(unpriced_entry["callable"], false);
    assert_eq!(
        unpriced_entry["readiness_issues"],
        json!(["procurement_pricing_missing", "selling_price_missing"])
    );

    // Add procurement pricing, still no customer selling price -> STILL hidden from customer catalogs.
    state
        .store
        .upsert_vendor_model(
            vid,
            niu_storage::VendorModelInput {
                alias: "comm/unpriced".into(),
                upstream_model: "upstream/unpriced".into(),
                public_catalog: true,
                enabled: true,
                capabilities: json!({}),
                pricing: Some(json!({
                    "currency": "USD",
                    "api_prompt_rate": 100,
                    "api_completion_rate": 200,
                    "cash_prompt_rate": 100,
                    "cash_completion_rate": 200,
                    "max_input_tokens": 1024,
                    "max_output_tokens": 512
                })),
                expected_revision: Some(1),
            },
        )
        .await
        .unwrap();
    let (_, _, pub_cat) = json_call(&app, Method::GET, "/catalog/v1/models", None, None).await;
    assert!(pub_cat["data"].as_array().unwrap().is_empty());
    let (_, _, api_cat) = json_call(&app, Method::GET, "/v1/models", Some(&key.token), None).await;
    assert!(api_cat["data"].as_array().unwrap().is_empty());

    // Publish platform retail selling price -> NOW visible and callable everywhere!
    state
        .store
        .publish_retail_standard(
            niu_storage::RetailStandardPublication {
                model_alias: "comm/unpriced".into(),
                currency: "USD".into(),
                schedule: niu_storage::RetailSchedule::Text(niu_storage::TextRetailSchedule {
                    prompt_rate: "500".into(),
                    completion_rate: "1000".into(),
                    cached_prompt_rate: None,
                    cache_write_prompt_rate: None,
                    reasoning_completion_rate: None,
                    minimum_charge_nanos: "0".into(),
                    request_fee_nanos: "0".into(),
                    context_tiers: vec![],
                }),
                expected_version: "0".into(),
                idempotency_key: Uuid::new_v4(),
                reason: "Publish selling price".into(),
            },
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();

    let (_, _, pub_cat) = json_call(&app, Method::GET, "/catalog/v1/models", None, None).await;
    assert_eq!(pub_cat["data"].as_array().unwrap().len(), 1);
    assert_eq!(pub_cat["data"][0]["id"], "comm/unpriced");
    assert_eq!(pub_cat["data"][0]["callable"], true);

    let (_, _, api_cat) = json_call(&app, Method::GET, "/v1/models", Some(&key.token), None).await;
    assert_eq!(api_cat["data"].as_array().unwrap().len(), 1);
    assert_eq!(api_cat["data"][0]["id"], "comm/unpriced");
    assert_eq!(api_cat["data"][0]["callable"], true);

    let (_, _, ws_cat) = json_call(
        &app,
        Method::GET,
        &ws_models_path,
        Some(&member.token),
        None,
    )
    .await;
    assert_eq!(ws_cat["data"].as_array().unwrap().len(), 1);
    assert_eq!(ws_cat["data"][0]["callable"], true);
    assert_eq!(ws_cat["data"][0]["readiness_issues"], json!([]));

    // Internal mode: internal-shared routes remain callable without selling prices.
    let mut internal_state = test_state(None, pool.clone());
    Arc::make_mut(&mut internal_state.config).models.clear();
    internal_state.operating_mode = crate::state::OperatingMode::Internal;
    internal_state.vendor_cipher = Some(cipher.clone());
    let ivid = Uuid::new_v4();
    internal_state
        .store
        .create_vendor_with_access_scope(
            niu_storage::VendorInput {
                id: ivid,
                name: "Internal Shared".into(),
                adapter: "openai".into(),
                api_base: "https://internal.example.invalid/v1".into(),
                enabled: true,
                credential_ciphertext: cipher.seal(ivid, "internal-key").unwrap(),
            },
            false,
            None,
            Some(scope.organization_id),
            niu_storage::VendorAccessScope::Internal,
        )
        .await
        .unwrap();
    internal_state
        .store
        .upsert_vendor_model(
            ivid,
            niu_storage::VendorModelInput {
                alias: "internal/shared".into(),
                upstream_model: "upstream/internal".into(),
                public_catalog: true,
                enabled: true,
                capabilities: json!({}),
                pricing: None,
                expected_revision: None,
            },
        )
        .await
        .unwrap();
    let internal_app = router(internal_state);
    let (_, _, internal_pub) =
        json_call(&internal_app, Method::GET, "/catalog/v1/models", None, None).await;
    assert!(
        internal_pub["data"]
            .as_array()
            .unwrap()
            .iter()
            .any(|m| m["id"] == "internal/shared" && m["callable"] == true),
        "{internal_pub}"
    );
}

/// End-to-end regression for the 3-step Provider commercial workflow:
/// - A commercial model configured with `vendor_models.pricing = NULL`, an active
///   qualified `provider_offers` row ($0.80 / $2.40 per 1M), and a platform standard
///   selling price ($1.00 / $3.00 per 1M) must appear as `callable: true` across
///   `/catalog/v1/models`, `/v1/models`, and `/api/v1/models`.
/// - A newly onboarded prepaid customer organization + workspace (with a funded
///   `customer_balance_accounts` row and NO legacy `project_budgets` row) must be
///   rejected with 402 when unfunded, succeed with 200 once topped up, deduct the
///   exact customer charge ($0.0025), and accrue the exact provider payable ($0.0020)
///   without leaking procurement costs into customer projections.
#[sqlx::test(migrator = "niu_storage::MIGRATOR")]
#[ignore = "requires PostgreSQL"]
async fn provider_offer_and_prepaid_workspace_dispatch_without_legacy_budget(pool: PgPool) {
    let upstream = axum::Router::new().route(
        "/v1/chat/completions",
        axum::routing::post(|| async {
            Json(json!({
                "id": "chatcmpl-e2e-reg",
                "object": "chat.completion",
                "created": 1_700_000_000,
                "model": "acme/fast-chat",
                "choices": [{
                    "index": 0,
                    "message": { "role": "assistant", "content": "Hello from Acme" },
                    "finish_reason": "stop"
                }],
                "usage": {
                    "prompt_tokens": 1000,
                    "completion_tokens": 500,
                    "total_tokens": 1500
                }
            }))
        }),
    );
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    tokio::spawn(async move { axum::serve(listener, upstream).await.unwrap() });

    let mut state = test_state(None, pool.clone());
    Arc::make_mut(&mut state.config).models.clear();
    let cipher = Arc::new(crate::vendors::crypto::CredentialCipher::new(MASTER_A).unwrap());
    state.vendor_cipher = Some(cipher.clone());
    state
        .store
        .configure_platform_currency("USD")
        .await
        .unwrap();
    crate::payments::readiness::configure_test_gateway(&mut state).await;
    let app = router(state.clone());

    // 1. Create Provider business, API key connection, and model route WITHOUT legacy pricing.
    let (status, _, provider) = json_call(
        &app,
        Method::POST,
        "/api/v1/admin/providers",
        Some(ADMIN),
        Some(json!({ "name": "Acme Upstream" })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{provider}");
    let provider_id = provider["data"]["id"].as_str().unwrap();

    let (status, _, conn) = json_call(
        &app,
        Method::POST,
        "/api/v1/admin/providers/connections",
        Some(ADMIN),
        Some(json!({
            "name": "Acme Primary Key",
            "adapter": "openai",
            "api_base": format!("http://{addr}/v1"),
            "api_key": "sk-upstream-test",
            "enabled": true,
            "supplier_id": provider_id
        })),
    )
    .await;
    assert!(status == StatusCode::OK || status == StatusCode::CREATED, "{status} {conn}");
    let conn_id = conn["data"]["id"].as_str().unwrap();

    let (status, _, route) = json_call(
        &app,
        Method::POST,
        &format!("/api/v1/admin/providers/connections/{conn_id}/models"),
        Some(ADMIN),
        Some(json!({
            "alias": "acme-primary/fast-chat",
            "upstream_model": "acme/fast-chat",
            "public_catalog": true,
            "enabled": true,
            "capabilities": {}
        })),
    )
    .await;
    assert!(status == StatusCode::OK || status == StatusCode::CREATED, "{status} {route}");

    // 2. Publish & activate Provider offer ($0.80 / $2.40 per 1M) + Standard selling price ($1.00 / $3.00 per 1M).
    let (status, _, offer) = json_call(
        &app,
        Method::POST,
        &format!("/api/v1/admin/providers/{provider_id}/offers"),
        Some(ADMIN),
        Some(json!({
            "model_alias": "acme-primary/fast-chat",
            "currency": "USD",
            "prompt_rate": "800000000",
            "completion_rate": "2400000000",
            "activate": true
        })),
    )
    .await;
    assert!(status == StatusCode::OK || status == StatusCode::CREATED, "{status} {offer}");

    let (status, _, retail) = json_call(
        &app,
        Method::POST,
        "/api/v1/admin/pricing/standard-prices",
        Some(ADMIN),
        Some(json!({
            "model_alias": "acme-primary/fast-chat",
            "currency": "USD",
            "schedule": {
                "kind": "text",
                "prompt_rate": "1000000000",
                "completion_rate": "3000000000",
                "cached_prompt_rate": null,
                "cache_write_prompt_rate": null,
                "reasoning_completion_rate": null,
                "request_fee_nanos": "0",
                "minimum_charge_nanos": "0",
                "context_tiers": []
            },
            "expected_version": "0",
            "idempotency_key": Uuid::new_v4(),
            "reason": "Initialized from Provider standard price"
        })),
    )
    .await;
    assert!(status == StatusCode::OK || status == StatusCode::CREATED, "{status} {retail}");

    // 3. Create prepaid customer organization + workspace + API key (NO legacy project_budgets row!).
    let org = state.store.create_organization("Demo Corp").await.unwrap();
    let scope = state.store.create_project(org, "Default").await.unwrap();
    sqlx::query(
        "INSERT INTO customer_balance_accounts(id, organization_id, currency) VALUES ($1, $2, 'USD')",
    )
    .bind(Uuid::new_v4())
    .bind(org)
    .execute(&pool)
    .await
    .unwrap();
    let key = state
        .store
        .issue_key(scope, "E2E Prod Key", &["*".into()], 3600)
        .await
        .unwrap();

    // Verify zero legacy project_budgets rows exist before dispatch.
    let budget_rows: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM project_budgets WHERE organization_id=$1 AND project_id=$2",
    )
    .bind(scope.organization_id)
    .bind(scope.project_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(budget_rows, 0);

    // 4. Verify all three model discovery surfaces show callable=true with customer selling price only.
    let (status, _, pub_cat) = json_call(&app, Method::GET, "/catalog/v1/models", None, None).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(pub_cat["data"].as_array().unwrap().len(), 1, "{pub_cat}");
    assert_eq!(pub_cat["data"][0]["id"], "acme-primary/fast-chat");
    assert_eq!(pub_cat["data"][0]["callable"], true);

    let (status, _, api_cat) =
        json_call(&app, Method::GET, "/v1/models", Some(&key.token), None).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(api_cat["data"].as_array().unwrap().len(), 1, "{api_cat}");
    assert_eq!(api_cat["data"][0]["id"], "acme-primary/fast-chat");
    assert_eq!(api_cat["data"][0]["callable"], true);
    assert_eq!(
        api_cat["data"][0]["customer_pricing"]["prompt_rate"],
        "1000000000"
    );
    assert_eq!(
        api_cat["data"][0]["customer_pricing"]["completion_rate"],
        "3000000000"
    );
    assert!(!api_cat.to_string().contains("800000000"));
    assert!(!api_cat.to_string().contains("2400000000"));

    let (status, _, ws_cat) = json_call(
        &app,
        Method::GET,
        &format!(
            "/api/v1/models?organization_id={}&project_id={}",
            scope.organization_id, scope.project_id
        ),
        Some(ADMIN),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(ws_cat["data"].as_array().unwrap().len(), 1, "{ws_cat}");
    assert_eq!(ws_cat["data"][0]["callable"], true);
    assert_eq!(ws_cat["data"][0]["readiness_issues"], json!([]));

    // 5. Unfunded customer ($0.00 balance) must be rejected with 402 Payment Required.
    let (status, _, unfunded) = json_call(
        &app,
        Method::POST,
        "/v1/chat/completions",
        Some(&key.token),
        Some(json!({
            "model": "acme-primary/fast-chat",
            "messages": [{ "role": "user", "content": "hi" }]
        })),
    )
    .await;
    assert_eq!(status, StatusCode::PAYMENT_REQUIRED, "{unfunded}");

    // 6. Top up $10.00 USD -> chat completion succeeds with HTTP 200!
    state
        .store
        .record_settled_customer_funding(
            org,
            "USD",
            10_000_000_000,
            "e2e-topup",
            &Uuid::new_v4().to_string(),
        )
        .await
        .unwrap();

    let (status, _, reply) = json_call(
        &app,
        Method::POST,
        "/v1/chat/completions",
        Some(&key.token),
        Some(json!({
            "model": "acme-primary/fast-chat",
            "messages": [{ "role": "user", "content": "hi" }]
        })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{reply}");
    assert_eq!(
        reply["choices"][0]["message"]["content"],
        "Hello from Acme"
    );

    // 7. Verify exact customer balance deduction ($10.00 - $0.0025 = $9.9975)
    //    and exact provider payable accrual ($0.0020).
    let balance_nanos: i64 = sqlx::query_scalar(
        "SELECT posted_balance_nanos::bigint FROM customer_balance_accounts WHERE organization_id=$1 AND currency='USD'",
    )
    .bind(org)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(balance_nanos, 10_000_000_000 - 2_500_000);

    let provider_earned_nanos: i64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(amount_nanos), 0)::bigint FROM provider_earnings WHERE provider_id=$1::uuid AND currency='USD'",
    )
    .bind(provider_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(provider_earned_nanos, 2_000_000);
}

/// Commercial Route Pools built exclusively from 3-step Provider models
/// (`vendor_models.pricing = NULL` + active `provider_offers`) must:
/// 1. Pass pool creation (`PUT /api/v1/admin/routing`) and routing preview;
/// 2. Appear as `callable: true` across `/catalog/v1/models`, `/v1/models`, and
///    `/api/v1/models` once a pool selling price is published (without leaking
///    provider offer rates);
/// 3. Dispatch `POST /v1/chat/completions` to the highest-priority candidate,
///    bill the customer at the unified pool tariff, and accrue exact provider
///    earnings to the winning candidate's provider;
/// 4. Fail over seamlessly to the standby candidate when the primary candidate
///    is disabled, accruing exact earnings to the backup provider and reporting
///    exact P&L in `GET /api/v1/admin/routing/{ref}/audit`.
#[sqlx::test(migrator = "niu_storage::MIGRATOR")]
#[ignore = "requires PostgreSQL"]
async fn commercial_route_pool_with_provider_offers_dispatches_bills_and_fails_over(pool: PgPool) {
    let upstream = axum::Router::new().route(
        "/v1/chat/completions",
        axum::routing::post(|Json(body): Json<Value>| async move {
            let model = body["model"].as_str().unwrap_or("unknown").to_owned();
            let text = if model.contains("beta") {
                "Hello from Beta Backup"
            } else {
                "Hello from Acme Primary"
            };
            Json(json!({
                "id": "chatcmpl-pool-reg",
                "object": "chat.completion",
                "created": 1_700_000_000,
                "model": model,
                "choices": [{
                    "index": 0,
                    "message": { "role": "assistant", "content": text },
                    "finish_reason": "stop"
                }],
                "usage": {
                    "prompt_tokens": 1000,
                    "completion_tokens": 500,
                    "total_tokens": 1500
                }
            }))
        }),
    );
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    tokio::spawn(async move { axum::serve(listener, upstream).await.unwrap() });

    let mut state = test_state(None, pool.clone());
    Arc::make_mut(&mut state.config).models.clear();
    let cipher = Arc::new(crate::vendors::crypto::CredentialCipher::new(MASTER_A).unwrap());
    state.vendor_cipher = Some(cipher);
    state
        .store
        .configure_platform_currency("USD")
        .await
        .unwrap();
    crate::payments::readiness::configure_test_gateway(&mut state).await;
    let app = router(state.clone());

    // 1. Onboard two Providers (Acme Primary & Beta Backup) with vendor_models.pricing = NULL.
    let mut provider_ids = Vec::new();
    for (pname, cname, alias, upstream_model, prompt_rate, completion_rate) in [
        (
            "Acme Primary",
            "Acme Key",
            "acme-key/fast-chat",
            "acme/fast-chat",
            "800000000",
            "2400000000",
        ),
        (
            "Beta Backup",
            "Beta Key",
            "beta-key/fast-chat",
            "beta/fast-chat",
            "900000000",
            "2700000000",
        ),
    ] {
        let (status, _, provider) = json_call(
            &app,
            Method::POST,
            "/api/v1/admin/providers",
            Some(ADMIN),
            Some(json!({ "name": pname })),
        )
        .await;
        assert_eq!(status, StatusCode::OK, "{provider}");
        let pid = provider["data"]["id"].as_str().unwrap().to_owned();

        let (status, _, conn) = json_call(
            &app,
            Method::POST,
            "/api/v1/admin/providers/connections",
            Some(ADMIN),
            Some(json!({
                "name": cname,
                "adapter": "openai",
                "api_base": format!("http://{addr}/v1"),
                "api_key": "sk-upstream-pool-test",
                "enabled": true,
                "supplier_id": pid
            })),
        )
        .await;
        assert!(status == StatusCode::OK || status == StatusCode::CREATED, "{status} {conn}");
        let cid = conn["data"]["id"].as_str().unwrap();

        let (status, _, route) = json_call(
            &app,
            Method::POST,
            &format!("/api/v1/admin/providers/connections/{cid}/models"),
            Some(ADMIN),
            Some(json!({
                "alias": alias,
                "upstream_model": upstream_model,
                "public_catalog": false,
                "enabled": true,
                "capabilities": {}
            })),
        )
        .await;
        assert!(status == StatusCode::OK || status == StatusCode::CREATED, "{status} {route}");

        let (status, _, offer) = json_call(
            &app,
            Method::POST,
            &format!("/api/v1/admin/providers/{pid}/offers"),
            Some(ADMIN),
            Some(json!({
                "model_alias": alias,
                "currency": "USD",
                "prompt_rate": prompt_rate,
                "completion_rate": completion_rate,
                "activate": true
            })),
        )
        .await;
        assert!(status == StatusCode::OK || status == StatusCode::CREATED, "{status} {offer}");
        provider_ids.push(pid);
    }

    // 2. Create commercial Route Pool `smart-chat` (pool_tariff, public_catalog: true).
    let (status, _, saved_pool) = json_call(
        &app,
        Method::PUT,
        "/api/v1/admin/routing",
        Some(ADMIN),
        Some(json!({
            "alias": "smart-chat",
            "display_name": "Smart Chat Router",
            "organization_id": null,
            "public_catalog": true,
            "billing_mode": "pool_tariff",
            "enabled": true,
            "expected_revision": 0,
            "candidates": [
                { "alias": "acme-key/fast-chat", "priority": 100, "weight": 1000, "enabled": true },
                { "alias": "beta-key/fast-chat", "priority": 50, "weight": 1000, "enabled": true }
            ]
        })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{saved_pool}");

    // 3. Preview confirms both candidates are eligible and primary wins 100%.
    let pool_ref = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode("smart-chat");
    let (status, _, preview) = json_call(
        &app,
        Method::POST,
        &format!("/api/v1/admin/routing/{pool_ref}/preview"),
        Some(ADMIN),
        Some(json!({ "protocol": "chat" })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{preview}");
    assert_eq!(preview["data"]["routable"], true, "{preview}");
    assert_eq!(
        preview["data"]["eligible_candidates"].as_array().unwrap().len(),
        2,
        "{preview}"
    );
    assert!(
        preview["data"]["ineligible_candidates"].as_array().unwrap().is_empty(),
        "{preview}"
    );

    // 4. Publish unified pool selling price ($1.20 / $3.60 per 1M).
    let (status, _, retail) = json_call(
        &app,
        Method::POST,
        "/api/v1/admin/pricing/standard-prices",
        Some(ADMIN),
        Some(json!({
            "model_alias": "smart-chat",
            "currency": "USD",
            "schedule": {
                "kind": "text",
                "prompt_rate": "1200000000",
                "completion_rate": "3600000000",
                "cached_prompt_rate": null,
                "cache_write_prompt_rate": null,
                "reasoning_completion_rate": null,
                "request_fee_nanos": "0",
                "minimum_charge_nanos": "0",
                "context_tiers": []
            },
            "expected_version": "0",
            "idempotency_key": Uuid::new_v4(),
            "reason": "Unified selling price for smart-chat pool"
        })),
    )
    .await;
    assert!(status == StatusCode::OK || status == StatusCode::CREATED, "{status} {retail}");

    // 5. Onboard funded prepaid customer workspace & API key.
    let org = state.store.create_organization("Pool Customer").await.unwrap();
    let scope = state.store.create_project(org, "Prod").await.unwrap();
    sqlx::query(
        "INSERT INTO customer_balance_accounts(id, organization_id, currency) VALUES ($1, $2, 'USD')",
    )
    .bind(Uuid::new_v4())
    .bind(org)
    .execute(&pool)
    .await
    .unwrap();
    state
        .store
        .record_settled_customer_funding(
            org,
            "USD",
            10_000_000_000,
            "pool-topup",
            &Uuid::new_v4().to_string(),
        )
        .await
        .unwrap();
    let key = state
        .store
        .issue_key(scope, "Pool Key", &["*".into()], 3600)
        .await
        .unwrap();

    // 6. Verify smart-chat is callable across public, API, and workspace catalogs without leaking offer rates.
    let (status, _, pub_cat) = json_call(&app, Method::GET, "/catalog/v1/models", None, None).await;
    assert_eq!(status, StatusCode::OK);
    assert!(
        pub_cat["data"]
            .as_array()
            .unwrap()
            .iter()
            .any(|m| m["id"] == "smart-chat" && m["callable"] == true),
        "{pub_cat}"
    );

    let (status, _, api_cat) =
        json_call(&app, Method::GET, "/v1/models", Some(&key.token), None).await;
    assert_eq!(status, StatusCode::OK);
    let pool_entry = api_cat["data"]
        .as_array()
        .unwrap()
        .iter()
        .find(|m| m["id"] == "smart-chat")
        .expect("smart-chat must be listed in /v1/models");
    assert_eq!(pool_entry["callable"], true);
    assert_eq!(pool_entry["customer_pricing"]["prompt_rate"], "1200000000");
    assert!(!api_cat.to_string().contains("800000000"));
    assert!(!api_cat.to_string().contains("900000000"));

    // 7. Dispatch #1 -> hits Acme Primary ($0.0030 customer charge, $0.0020 Acme earning).
    let (status, _, reply1) = json_call(
        &app,
        Method::POST,
        "/v1/chat/completions",
        Some(&key.token),
        Some(json!({
            "model": "smart-chat",
            "messages": [{ "role": "user", "content": "hello primary" }]
        })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{reply1}");
    assert_eq!(
        reply1["choices"][0]["message"]["content"],
        "Hello from Acme Primary"
    );

    // 8. Disable primary candidate -> Dispatch #2 seamlessly fails over to Beta Backup ($0.0030 charge, $0.00225 Beta earning).
    let (status, _, updated_pool) = json_call(
        &app,
        Method::PUT,
        "/api/v1/admin/routing",
        Some(ADMIN),
        Some(json!({
            "alias": "smart-chat",
            "display_name": "Smart Chat Router",
            "organization_id": null,
            "public_catalog": true,
            "billing_mode": "pool_tariff",
            "enabled": true,
            "expected_revision": 1,
            "candidates": [
                { "alias": "acme-key/fast-chat", "priority": 100, "weight": 1000, "enabled": false },
                { "alias": "beta-key/fast-chat", "priority": 50, "weight": 1000, "enabled": true }
            ]
        })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{updated_pool}");

    let (status, _, reply2) = json_call(
        &app,
        Method::POST,
        "/v1/chat/completions",
        Some(&key.token),
        Some(json!({
            "model": "smart-chat",
            "messages": [{ "role": "user", "content": "hello backup" }]
        })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{reply2}");
    assert_eq!(
        reply2["choices"][0]["message"]["content"],
        "Hello from Beta Backup"
    );

    // 9. Verify exact customer deduction ($0.0060 total) and per-provider accruals ($0.0020 Acme, $0.00225 Beta).
    let balance_nanos: i64 = sqlx::query_scalar(
        "SELECT posted_balance_nanos::bigint FROM customer_balance_accounts WHERE organization_id=$1 AND currency='USD'",
    )
    .bind(org)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(balance_nanos, 10_000_000_000 - 6_000_000);

    let acme_earned: i64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(amount_nanos), 0)::bigint FROM provider_earnings WHERE provider_id=$1::uuid AND currency='USD'",
    )
    .bind(&provider_ids[0])
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(acme_earned, 2_000_000);

    let beta_earned: i64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(amount_nanos), 0)::bigint FROM provider_earnings WHERE provider_id=$1::uuid AND currency='USD'",
    )
    .bind(&provider_ids[1])
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(beta_earned, 2_250_000);

    // 10. Strategy & Billing Audit reflects exact traffic, revenue, cost, and net margin.
    let (status, _, audit) = json_call(
        &app,
        Method::GET,
        &format!("/api/v1/admin/routing/{pool_ref}/audit?days=30"),
        Some(ADMIN),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{audit}");
    assert_eq!(audit["data"]["totals"]["observed_attempts"], 2, "{audit}");
    assert_eq!(audit["data"]["totals"]["customer_charge_nanos"], "6000000", "{audit}");
    assert_eq!(audit["data"]["totals"]["supplier_cost_nanos"], "4250000", "{audit}");
    assert_eq!(audit["data"]["totals"]["net_margin_nanos"], "1750000", "{audit}");
}
