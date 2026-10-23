use super::*;

const ADMIN: &str = "niu-test-admin-token-that-is-long-1234";

async fn call(
    app: &Router,
    method: &str,
    path: &str,
    token: &str,
    body: Option<Value>,
) -> (StatusCode, Value) {
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method(method)
                .uri(path)
                .header("authorization", format!("Bearer {token}"))
                .header("content-type", "application/json")
                .body(axum::body::Body::from(
                    body.map(|value| value.to_string()).unwrap_or_default(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    let status = response.status();
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    (
        status,
        serde_json::from_slice(&bytes).unwrap_or(Value::Null),
    )
}

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires isolated PostgreSQL"]
async fn session_aliases_preserve_identity_replay_owner_and_workspace(pool: PgPool) {
    use niu_storage::{OperatorAuditActor, OperatorRole, OperatorScope};
    let state = test_state(None, pool);
    let org = state
        .store
        .create_organization("API migration")
        .await
        .unwrap();
    let scope = state.store.create_project(org, "First").await.unwrap();
    let sibling = state.store.create_project(org, "Second").await.unwrap();
    let owner = state
        .store
        .create_operator(
            OperatorScope {
                organization_id: org,
                project_id: Some(scope.project_id),
            },
            "Owner",
            OperatorRole::Owner,
            3600,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let viewer = state
        .store
        .create_operator(
            OperatorScope {
                organization_id: org,
                project_id: Some(scope.project_id),
            },
            "Viewer",
            OperatorRole::Viewer,
            3600,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let key = state
        .store
        .issue_key(scope, "Inference", &["fast".into()], 3600)
        .await
        .unwrap();
    let id = Uuid::new_v4();
    // Deliberately collide across category-specific stores.
    state
        .store
        .save_chat_session(
            scope,
            "installation",
            id,
            &json!({
                "id":id.to_string(),"title":"Chat with same UUID","createdAt":1,"results":[]
            }),
        )
        .await
        .unwrap();
    let app = router(state);
    let legacy = format!(
        "/api/v1/organizations/{org}/projects/{}/generations/{id}",
        scope.project_id
    );
    let canonical = format!("/api/v1/workspaces/{}/sessions/{id}", scope.project_id);
    let input = json!({"expected_revision":"0","title":"Video"});
    assert_eq!(
        call(
            &app,
            "PUT",
            &format!("{canonical}?category=video"),
            &viewer.token,
            Some(input.clone())
        )
        .await
        .0,
        StatusCode::FORBIDDEN
    );
    let (status, created) = call(&app, "PUT", &legacy, ADMIN, Some(input.clone())).await;
    assert_eq!(status, StatusCode::OK, "{created}");
    let (status, replay) = call(
        &app,
        "PUT",
        &format!("{canonical}?category=video"),
        ADMIN,
        Some(input),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{replay}");
    assert_eq!(replay, created);
    let (status, video) = call(
        &app,
        "GET",
        &format!("{canonical}?category=video"),
        ADMIN,
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(video, created);
    let (status, chat) = call(
        &app,
        "GET",
        &format!("{canonical}?category=chat"),
        ADMIN,
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{chat}");
    assert_eq!(chat["data"]["category"], "chat");
    assert_eq!(chat["data"]["id"], video["data"]["id"]);
    for query in ["", "?category=other", "?category=chat&category=video"] {
        assert_eq!(
            call(&app, "GET", &format!("{canonical}{query}"), ADMIN, None)
                .await
                .0,
            StatusCode::BAD_REQUEST
        );
    }
    assert_eq!(
        call(
            &app,
            "PATCH",
            &format!("{canonical}?category=chat"),
            ADMIN,
            Some(json!({"expected_revision":"1","title":"Must not change Video","archived":false}))
        )
        .await
        .0,
        StatusCode::BAD_REQUEST
    );
    assert_eq!(
        call(
            &app,
            "PUT",
            &format!("{canonical}?category=video"),
            ADMIN,
            Some(json!({"expected_revision":"0","title":"Changed retry"}))
        )
        .await
        .0,
        StatusCode::CONFLICT
    );
    assert_eq!(
        call(
            &app,
            "GET",
            &format!("{canonical}?category=video"),
            &owner.token,
            None
        )
        .await
        .0,
        StatusCode::NOT_FOUND
    );
    assert_eq!(
        call(
            &app,
            "GET",
            &format!(
                "/api/v1/workspaces/{}/sessions?category=video",
                sibling.project_id
            ),
            &owner.token,
            None
        )
        .await
        .0,
        StatusCode::NOT_FOUND
    );
    assert_eq!(
        call(
            &app,
            "GET",
            &format!("{canonical}?category=video"),
            &key.token,
            None
        )
        .await
        .0,
        StatusCode::UNAUTHORIZED
    );
    let old_chat = format!(
        "/api/v1/organizations/{org}/projects/{}/chats/{id}",
        scope.project_id
    );
    let new_chat = format!("/api/v1/workspaces/{}/chats/{id}", scope.project_id);
    assert_eq!(
        call(&app, "GET", &old_chat, ADMIN, None).await,
        call(&app, "GET", &new_chat, ADMIN, None).await
    );
    let old_revision = call(&app, "GET", &old_chat, ADMIN, None).await.1["revision"].clone();
    let chat_update = json!({
        "prompt":"Follow-up", "title":"Saved Chat", "createdAt":1, "results":[],
        "expectedRevision":old_revision,
        "turns":[{"prompt":"Compare","results":[
            {"model":"first","content":"First answer","elapsedMs":1,"phase":"complete"},
            {"model":"second","content":"Second answer","elapsedMs":2,"phase":"complete"}
        ]}]
    });
    assert_eq!(
        call(&app, "PUT", &new_chat, ADMIN, Some(chat_update.clone()))
            .await
            .0,
        StatusCode::OK
    );
    assert_eq!(
        call(&app, "PUT", &old_chat, ADMIN, Some(chat_update))
            .await
            .0,
        StatusCode::CONFLICT
    );
    assert_eq!(
        call(&app, "GET", &new_chat, ADMIN, None).await,
        call(&app, "GET", &old_chat, ADMIN, None).await
    );
    assert_eq!(
        call(
            &app,
            "PUT",
            &format!("{new_chat}/archive"),
            ADMIN,
            Some(json!({"archived":true}))
        )
        .await
        .0,
        StatusCode::NO_CONTENT
    );
    assert_eq!(
        call(&app, "GET", &old_chat, ADMIN, None).await.1["archived"],
        true
    );
    assert_eq!(
        call(&app, "GET", &format!("{new_chat}/export"), ADMIN, None).await,
        call(&app, "GET", &format!("{old_chat}/export"), ADMIN, None).await
    );
    assert_eq!(
        call(&app, "DELETE", &new_chat, ADMIN, None).await.0,
        StatusCode::NO_CONTENT
    );
    assert_eq!(
        call(&app, "DELETE", &old_chat, ADMIN, None).await.0,
        StatusCode::NO_CONTENT
    );
    assert_eq!(
        call(
            &app,
            "GET",
            &format!("{canonical}?category=video"),
            ADMIN,
            None
        )
        .await
        .1,
        created
    );
}

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires isolated PostgreSQL"]
async fn pool_collection_and_encoded_members_preserve_legacy_contract(pool: PgPool) {
    use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
    let aliases = ["vendor/model", "a%2Fb?x=#&+", "history", "index"];
    for alias in aliases {
        sqlx::query(
            "INSERT INTO model_route_pools(alias,enabled,revision,candidates) VALUES($1,true,1,$2)",
        )
        .bind(alias)
        .bind(json!([{"alias":"fixture","priority":0,"weight":1,"enabled":true}]))
        .execute(&pool)
        .await
        .unwrap();
    }
    let state = test_state(None, pool);
    let org = state
        .store
        .create_organization("Pool customer")
        .await
        .unwrap();
    let customer = state
        .store
        .create_operator(
            niu_storage::OperatorScope {
                organization_id: org,
                project_id: None,
            },
            "Customer owner",
            niu_storage::OperatorRole::Owner,
            3600,
            niu_storage::OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let app = router(state);
    for path in [
        "/api/v1/pools",
        "/api/v1/pools/aW5kZXg",
        "/api/v1/pools/aW5kZXg/history",
    ] {
        assert_eq!(
            call(&app, "GET", path, &customer.token, None).await.0,
            StatusCode::FORBIDDEN
        );
    }
    let (status, page) = call(&app, "GET", "/api/v1/pools?limit=1", ADMIN, None).await;
    assert_eq!(status, StatusCode::OK, "{page}");
    assert_eq!(page["data"].as_array().unwrap().len(), 1);
    assert_eq!(page["has_more"], true);
    assert_eq!(
        call(&app, "GET", "/api/v1/pools/index?limit=1", ADMIN, None)
            .await
            .1,
        page
    );
    let mut seen = vec![page["data"][0]["alias"].as_str().unwrap().to_owned()];
    let mut cursor = page["next_after"].as_str().unwrap().to_owned();
    loop {
        let query = url::form_urlencoded::Serializer::new(String::new())
            .append_pair("after", &cursor)
            .append_pair("limit", "1")
            .finish();
        let (status, page) =
            call(&app, "GET", &format!("/api/v1/pools?{query}"), ADMIN, None).await;
        assert_eq!(status, StatusCode::OK);
        seen.extend(
            page["data"]
                .as_array()
                .unwrap()
                .iter()
                .map(|p| p["alias"].as_str().unwrap().to_owned()),
        );
        if page["has_more"] == false {
            break;
        }
        cursor = page["next_after"].as_str().unwrap().to_owned();
    }
    assert_eq!(seen.len(), aliases.len());
    for alias in aliases {
        let encoded = URL_SAFE_NO_PAD.encode(alias);
        let query = url::form_urlencoded::Serializer::new(String::new())
            .append_pair("alias", alias)
            .finish();
        let legacy = call(&app, "GET", &format!("/api/v1/pools?{query}"), ADMIN, None).await;
        let member = call(
            &app,
            "GET",
            &format!("/api/v1/pools/{encoded}"),
            ADMIN,
            None,
        )
        .await;
        assert_eq!(member.0, StatusCode::OK, "{}", member.1);
        assert_eq!(legacy, member);
        assert_eq!(member.1["data"]["alias"], alias);
        assert_eq!(
            call(
                &app,
                "GET",
                &format!("/api/v1/pools/{encoded}/history"),
                ADMIN,
                None
            )
            .await,
            call(
                &app,
                "GET",
                &format!("/api/v1/pools/history?{query}"),
                ADMIN,
                None
            )
            .await
        );
    }
    for reference in ["YQ==", "YQ%3D%3D", "Yg%252F", "a", "IA", "w6k"] {
        assert_eq!(
            call(
                &app,
                "GET",
                &format!("/api/v1/pools/{reference}"),
                ADMIN,
                None
            )
            .await
            .0,
            StatusCode::BAD_REQUEST
        );
    }
    assert_eq!(
        call(
            &app,
            "GET",
            "/api/v1/pools?alias=index&limit=1",
            ADMIN,
            None
        )
        .await
        .0,
        StatusCode::BAD_REQUEST
    );
    assert_eq!(
        call(&app, "GET", "/api/v1/pools", "invalid", None).await.0,
        StatusCode::UNAUTHORIZED
    );
    // Verify the reference through an HTTP forwarding hop as well as Axum.
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let gateway_address = listener.local_addr().unwrap();
    let gateway = tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
    let proxy = Router::new().fallback(move |uri: axum::http::Uri| async move {
        let response = reqwest::Client::new()
            .get(format!("http://{gateway_address}{uri}"))
            .bearer_auth(ADMIN)
            .send()
            .await
            .unwrap();
        (response.status(), response.bytes().await.unwrap())
    });
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let proxy_address = listener.local_addr().unwrap();
    let forwarding = tokio::spawn(async move { axum::serve(listener, proxy).await.unwrap() });
    for alias in aliases {
        let response = reqwest::Client::new()
            .get(format!(
                "http://{proxy_address}/api/v1/pools/{}",
                URL_SAFE_NO_PAD.encode(alias),
            ))
            .send()
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(
            response.json::<Value>().await.unwrap()["data"]["alias"],
            alias
        );
    }
    forwarding.abort();
    gateway.abort();
}

pub(super) fn validate_response(path: &str, method: &str, status: &str, value: &Value) {
    let spec: Value = serde_json::from_str(include_str!(
        "../../../../../contracts/generated/handler-operations.json"
    ))
    .unwrap();
    let mut schema =
        spec["paths"][path][method]["responses"][status]["content"]["application/json"]["schema"]
            .clone();
    assert!(
        schema.is_object(),
        "Missing response schema: {method} {path} {status}"
    );
    schema["components"] = spec["components"].clone();
    let validator = jsonschema::validator_for(&schema).unwrap();
    let errors: Vec<String> = validator
        .iter_errors(value)
        .map(|error| error.to_string())
        .collect();
    assert!(
        errors.is_empty(),
        "{method} {path}: {errors:?}; response={value}"
    );
}

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires isolated PostgreSQL"]
async fn workspace_key_responses_match_schemas_without_disclosing_tokens(pool: PgPool) {
    let state = test_state(None, pool);
    let org = state
        .store
        .create_prepaid_organization("Key contracts", "USD")
        .await
        .unwrap();
    let scope = state.store.create_project(org, "Keys").await.unwrap();
    let app = router(state);
    let path = format!("/api/v1/workspaces/{}/keys", scope.project_id);
    let template = "/api/v1/workspaces/{workspace}/keys";
    let (status, created) = call(
        &app,
        "POST",
        &path,
        ADMIN,
        Some(json!({
            "name":"Contract key", "allowed_models":["fast"], "ttl_seconds":3600,
            "spending_limit":{"currency":"USD","limit_nanos":"9007199254740993"},
            "allowed_cidrs":[]
        })),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{created}");
    validate_response(template, "post", "201", &created);
    let token = created["token"].as_str().expect("one-time token");
    let (status, listed) = call(&app, "GET", &format!("{path}?limit=1"), ADMIN, None).await;
    assert_eq!(status, StatusCode::OK, "{listed}");
    validate_response(template, "get", "200", &listed);
    assert!(!listed.to_string().contains(token));
    let key_id = created["key"]["id"].as_str().unwrap();
    let (status, detail) = call(&app, "GET", &format!("{path}/{key_id}"), ADMIN, None).await;
    assert_eq!(status, StatusCode::OK, "{detail}");
    validate_response(
        "/api/v1/workspaces/{workspace}/keys/{key}",
        "get",
        "200",
        &detail,
    );
    assert!(!detail.to_string().contains(token));
    assert!(detail.to_string().contains("9007199254740993"));
    let (status, invalid) = call(&app, "POST", &path, ADMIN, Some(json!({"name":"Invalid"}))).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    validate_response(template, "post", "400", &invalid);
}

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires isolated PostgreSQL"]
async fn workspace_creation_replays_across_api_and_admin_aliases(pool: PgPool) {
    let state = test_state(None, pool);
    let org = state
        .store
        .create_organization("Creation aliases")
        .await
        .unwrap();
    let app = router(state);
    let mut first = None;
    for (path, name, expected) in [
        ("/api/v1/workspaces", "Workspace", StatusCode::CREATED),
        ("/admin/v1/workspaces", "Workspace", StatusCode::CREATED),
        ("/api/v1/workspaces", "Changed", StatusCode::CONFLICT),
    ] {
        let response = app
            .clone()
            .oneshot(
                Request::post(path)
                    .header("authorization", format!("Bearer {ADMIN}"))
                    .header("idempotency-key", "api-migration-workspace")
                    .header("content-type", "application/json")
                    .body(axum::body::Body::from(
                        json!({"organization_id":org,"name":name}).to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), expected);
        let body: Value =
            serde_json::from_slice(&response.into_body().collect().await.unwrap().to_bytes())
                .unwrap();
        if expected == StatusCode::CREATED {
            if let Some(original) = &first {
                assert_eq!(&body, original);
            } else {
                first = Some(body);
            }
        }
    }
    let response = app
        .oneshot(
            Request::post("/v1/chat/completions")
                .header("content-type", "application/json")
                .body(axum::body::Body::from(
                    json!({"model":"fast","messages":[{"role":"user","content":"No key"}]})
                        .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    assert!(!response.headers().contains_key("x-niu-attempt-id"));
    assert!(!response.headers().contains_key("x-niu-operation-id"));
}

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn video_session_public_references_preserve_private_scope(pool: PgPool) {
    let mut state = test_state(None, pool.clone());
    crate::payments::readiness::configure_test_gateway(&mut state).await;
    state.store.configure_platform_currency("USD").await.unwrap();
    let scope = state.store.default_workspace().await.unwrap();
    let id = Uuid::new_v4();
    state.store.create_generations_session(scope, "installation", id, "Saved Video").await.unwrap();
    let saved = state.store.generations_session(scope, "installation", id).await.unwrap().unwrap();
    let reference = saved["reference"].as_str().unwrap();
    assert!(reference.starts_with("video-"));
    assert_eq!(state.store.generations_session_id_by_reference(scope, "installation", reference).await.unwrap(), Some(id));
    assert!(state.store.generations_session_id_by_reference(scope, "other-owner", reference).await.unwrap().is_none());
    let app = router(state.clone());
    for identity in [id.to_string(), reference.to_owned()] {
        let response = app.clone().oneshot(Request::get(format!("/api/v1/workspaces/{}/sessions/{identity}?category=video",scope.project_id))
            .header("authorization", "Bearer niu-test-admin-token-that-is-long-1234")
            .body(axum::body::Body::empty()).unwrap()).await.unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let body: Value = serde_json::from_slice(&response.into_body().collect().await.unwrap().to_bytes()).unwrap();
        assert_eq!(body["data"], saved);
    }
    assert!(sqlx::query("UPDATE generations_sessions SET public_reference='video-999' WHERE id=$1").bind(id).execute(&pool).await.is_err());
}

#[sqlx::test(migrations = "../../crates/storage/migrations")]
#[ignore = "requires PostgreSQL"]
async fn video_input_public_reference_preserves_dispatch_identity(pool: PgPool) {
    let mut state=test_state(None,pool.clone());
    crate::payments::readiness::configure_test_gateway(&mut state).await;
    state.store.configure_platform_currency("USD").await.unwrap();
    let scope=state.store.default_workspace().await.unwrap();
    let key=state.store.issue_key(scope,"Input fixture", &["fast".into()],3600).await.unwrap();
    let id=Uuid::new_v4();
    let request=json!({"model":"fast","content":[{"type":"text","text":"Private fixture prompt"}]});
    state.store.save_video_intent(scope,"installation",niu_storage::VideoIntentInput{id,key_id:key.id,model:"fast",owner_funded:true,request:&request,request_digest:&[1;32]}).await.unwrap();
    let session_id=Uuid::new_v4();let turn_id=Uuid::new_v4();
    state.store.create_generations_session(scope,"installation",session_id,"Input timeline").await.unwrap();
    state.store.append_generations_turn(scope,"installation",session_id,turn_id,1,&json!({"kind":"video","prompt":"Private fixture prompt"})).await.unwrap();
    state.store.bind_generations_intent(scope,"installation",session_id,turn_id,2,id).await.unwrap();
    let before=state.store.video_intent(scope,"installation",id).await.unwrap().unwrap();
    assert!(before.reference.starts_with("input-"));
    assert!(!before.reference.contains("Private"));
    assert!(state.store.video_intent_id_by_reference(scope,"other-owner",&before.reference).await.unwrap().is_none());
    let app=router(state.clone());
    let mut responses=Vec::new();
    for identity in [id.to_string(),before.reference.clone()] {
        let (status,body)=call(&app,"GET",&format!("/api/v1/workspaces/{}/video/intents/{identity}",scope.project_id),ADMIN,None).await;
        assert_eq!(status,StatusCode::OK,"{body}");responses.push(body);
    }
    assert_eq!(responses[0],responses[1]);
    assert_eq!(responses[0]["data"]["reference"],before.reference);
    assert_eq!(responses[0]["data"]["session_binding"],json!({"session_id":session_id,"turn_id":turn_id}));
    let timeline=state.store.generations_session(scope,"installation",session_id).await.unwrap().unwrap();
    assert_eq!(timeline["turns"][0]["intent"]["reference"],before.reference);
    let after=state.store.video_intent(scope,"installation",id).await.unwrap().unwrap();
    assert_eq!(before.submission_key,after.submission_key);
    assert_eq!(before.request_digest,after.request_digest);
    assert!(sqlx::query("UPDATE video_submission_intents SET public_reference='input-999' WHERE id=$1").bind(id).execute(&pool).await.is_err());
}
