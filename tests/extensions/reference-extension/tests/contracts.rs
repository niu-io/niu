use niu_extension_api::{
    BoundPolicyDecision, ContractError, EncodedProviderRequest, ExtensionCapability,
    ExtensionManifest, FailureMode, HttpMethod, IdentityAssertion, IdentityAssurance,
    IdentityFederation, IdentityInput, MeteringAck, MeteringEvent, MeteringEventKind,
    MeteringObserver, NiuExtension, NormalizedStreamEvent, NormalizedStreamFrame, PolicyDecision,
    PolicyFailureDisposition, PolicyHook, Protocol, ProviderAdapter, ProviderRequest,
    ProviderResponse, ProviderStreamFrame, ProviderStreamValidator, RouteCandidate, RouteSelection,
    RouteSelector, TaskAdapter, TaskRunInput, apply_policy_redactions, policy_failure_disposition,
    validate_identity_assertion, validate_metering_ack, validate_normalized_stream_frame,
    validate_policy_decision, validate_provider_request, validate_route_selection,
    validate_task_output,
};
use niu_reference_extension::{
    ReferenceExtension, sample_policy_input, test_context, valid_task_input,
};
use serde_json::json;
use uuid::Uuid;

#[tokio::test]
async fn reference_extension_implements_each_v1_capability() {
    let extension = ReferenceExtension::new();
    let context = test_context();
    extension.manifest().validate().unwrap();
    assert_eq!(extension.manifest().api_version, "niu.extension.v1");

    let input = IdentityInput {
        issuer: "https://id.example".into(),
        subject: "subject-1".into(),
        groups: vec!["engineering".into()],
        email: Some("person@example.com".into()),
        email_verified: true,
        auth_time_unix_ms: Some(1),
        assurance: IdentityAssurance::MultiFactor,
    };
    let assertion = extension.resolve(input.clone(), &context).await.unwrap();
    validate_identity_assertion(&input, &assertion).unwrap();

    let policy_input = sample_policy_input(Some(json!({"messages":[{"content":"private"}]})));
    let policy = extension
        .evaluate(policy_input.clone(), &context)
        .await
        .unwrap();
    validate_policy_decision(&policy_input, &policy, 2).unwrap();

    let capabilities = extension.capabilities();
    let request = ProviderRequest {
        protocol: Protocol::OpenAiChatV1,
        upstream_model: "model-a".into(),
        body: json!({"model":"model-a","messages":[]}),
        stream: true,
    };
    validate_provider_request(&capabilities, &request).unwrap();
    let encoded = extension.encode(request, &context).await.unwrap();
    encoded.validate_core_transport().unwrap();
    let decoded = extension
        .decode(
            ProviderResponse {
                status_code: 200,
                headers: vec![],
                body: br#"{"usage":{"prompt_tokens":1,"completion_tokens":2}}"#.to_vec(),
            },
            &context,
        )
        .await
        .unwrap();
    assert_eq!(decoded.prompt_tokens, Some(1));
    let stream_frame = extension
        .decode_stream_frame(
            ProviderStreamFrame {
                event: None,
                data: br#"{"choices":[{"delta":{"content":"hello"}}]}"#.to_vec(),
            },
            &context,
        )
        .await
        .unwrap();
    validate_normalized_stream_frame(&stream_frame).unwrap();
    assert!(matches!(
        stream_frame.events.first(),
        Some(NormalizedStreamEvent::TextDelta { text, .. }) if text == "hello"
    ));

    let task_input = valid_task_input();
    task_input.validate().unwrap();
    let task_output = extension.run(task_input.clone(), &context).await.unwrap();
    validate_task_output(extension.manifest(), &task_input, &task_output).unwrap();

    let candidates = vec![candidate("provider-a", 100), candidate("provider-b", 200)];
    let route = extension
        .select(candidates.clone(), &context)
        .await
        .unwrap();
    validate_route_selection(&candidates, &route).unwrap();

    let event = MeteringEvent {
        event_id: Uuid::new_v4(),
        kind: MeteringEventKind::CostSettled,
        organization_id: Uuid::new_v4(),
        project_id: Uuid::new_v4(),
        operation_id: Uuid::new_v4(),
        attempt_id: Uuid::new_v4(),
        resource_id: "provider-a".into(),
        offer_revision: "rev-1".into(),
        currency: Some("USD".into()),
        api_equivalent_nanos: Some("120".into()),
        cash_nanos: Some("80".into()),
        capacity_unit: Some("tokens".into()),
        capacity_quantity: Some("42".into()),
        occurred_at_unix_ms: 10,
    };
    event.validate().unwrap();
    let acknowledgement = extension.consume(&event, &context).await.unwrap();
    validate_metering_ack(&event, &acknowledgement).unwrap();
    assert_eq!(acknowledgement.event_id, event.event_id);
    assert_eq!(
        validate_metering_ack(
            &event,
            &MeteringAck {
                event_id: Uuid::new_v4(),
            }
        ),
        Err(ContractError::MeteringAcknowledgement)
    );
    assert_eq!(event.cash_nanos.as_deref(), Some("80"));
}

#[test]
fn core_rejects_identity_elevation_and_unsafe_policy_output() {
    let input = IdentityInput {
        issuer: "https://id.example".into(),
        subject: "subject-1".into(),
        groups: vec![],
        email: None,
        email_verified: false,
        auth_time_unix_ms: None,
        assurance: IdentityAssurance::Verified,
    };
    let elevated = IdentityAssertion {
        issuer: input.issuer.clone(),
        subject: input.subject.clone(),
        groups: vec![],
        email: None,
        email_verified: false,
        assurance: IdentityAssurance::MultiFactor,
    };
    assert_eq!(
        validate_identity_assertion(&input, &elevated),
        Err(ContractError::IdentityAssertion)
    );

    let no_content = sample_policy_input(None);
    assert_eq!(
        validate_policy_decision(
            &no_content,
            &BoundPolicyDecision {
                binding: no_content.binding.clone(),
                decision: PolicyDecision::Redact {
                    reason_code: "redacted".into(),
                    json_pointers: vec!["/prompt".into()],
                },
            },
            2,
        ),
        Err(ContractError::PolicyDecision)
    );
}

#[test]
fn policy_results_are_revision_content_stage_and_expiry_bound() {
    let mut input = sample_policy_input(Some(json!({"messages":[{"content":"sensitive"}]})));
    let result = BoundPolicyDecision {
        binding: input.binding.clone(),
        decision: PolicyDecision::Redact {
            reason_code: "sensitive_content".into(),
            json_pointers: vec!["/messages/0/content".into()],
        },
    };
    validate_policy_decision(&input, &result, 2).unwrap();

    let mut stale = result.clone();
    stale.binding.revision = "revision-0".into();
    assert_eq!(
        validate_policy_decision(&input, &stale, 2),
        Err(ContractError::PolicyDecision)
    );
    assert_eq!(
        validate_policy_decision(&input, &result, 30_000),
        Err(ContractError::PolicyDecision)
    );

    let mut changed_model = input.clone();
    changed_model.model_alias = "model-b".into();
    assert_eq!(
        validate_policy_decision(&changed_model, &result, 2),
        Err(ContractError::PolicyDecision)
    );

    input.content = Some(json!({"messages":[{"content":"changed"}]}));
    assert_eq!(
        validate_policy_decision(&input, &result, 2),
        Err(ContractError::PolicyDecision)
    );
}

#[test]
fn redaction_resolves_all_targets_before_mutating_and_failure_mode_respects_required_hooks() {
    let original = json!({"messages":[{"content":"private","role":"user"}]});
    let mut redacted = original.clone();
    apply_policy_redactions(&mut redacted, &["/messages/0/content".into()]).unwrap();
    assert_eq!(
        redacted.pointer("/messages/0/content"),
        Some(&serde_json::Value::Null)
    );
    assert_eq!(
        original
            .pointer("/messages/0/content")
            .and_then(serde_json::Value::as_str),
        Some("private")
    );

    let mut unchanged = original.clone();
    assert_eq!(
        apply_policy_redactions(
            &mut unchanged,
            &["/messages/0/content".into(), "/messages/0/missing".into()]
        ),
        Err(ContractError::Redaction)
    );
    assert_eq!(unchanged, original);
    assert_eq!(
        apply_policy_redactions(
            &mut unchanged,
            &["/messages".into(), "/messages/0/content".into()]
        ),
        Err(ContractError::Redaction)
    );

    assert_eq!(
        policy_failure_disposition(true, FailureMode::FailOpen),
        PolicyFailureDisposition::Deny
    );
    assert_eq!(
        policy_failure_disposition(false, FailureMode::FailClosed),
        PolicyFailureDisposition::Deny
    );
    assert_eq!(
        policy_failure_disposition(false, FailureMode::FailOpen),
        PolicyFailureDisposition::AllowAndAudit
    );
}

#[test]
fn core_rejects_manifest_and_provider_transport_escape_attempts() {
    let invalid_manifest = ExtensionManifest {
        id: "idp".into(),
        version: "1".into(),
        api_version: "niu.extension.v1".into(),
        capabilities: vec![ExtensionCapability::IdentityFederation],
        deadline_ms: 100,
        failure_mode: FailureMode::FailOpen,
    };
    assert_eq!(invalid_manifest.validate(), Err(ContractError::Manifest));

    let request = EncodedProviderRequest {
        path: "//attacker.example/collect".into(),
        method: HttpMethod::Post,
        query: vec![],
        headers: vec![("authorization".into(), "Bearer stolen".into())],
        body: vec![],
    };
    assert_eq!(
        request.validate_core_transport(),
        Err(ContractError::TransportBoundary)
    );
    let query_credential = EncodedProviderRequest {
        path: "/v1/chat/completions".into(),
        method: HttpMethod::Post,
        query: vec![("access_token".into(), "not-allowed".into())],
        headers: vec![],
        body: vec![],
    };
    assert_eq!(
        query_credential.validate_core_transport(),
        Err(ContractError::TransportBoundary)
    );
}

#[test]
fn core_rejects_encoded_path_traversal_and_stream_events_after_terminal() {
    let request = EncodedProviderRequest {
        path: "/v1/%2e%2e/admin".into(),
        method: HttpMethod::Post,
        query: vec![],
        headers: vec![],
        body: vec![],
    };
    assert_eq!(
        request.validate_core_transport(),
        Err(ContractError::TransportBoundary)
    );
    let events = NormalizedStreamFrame {
        events: vec![
            NormalizedStreamEvent::Completed {
                reason_code: "stop".into(),
            },
            NormalizedStreamEvent::TextDelta {
                output_index: 0,
                content_index: 0,
                text: "too late".into(),
            },
        ],
    };
    assert_eq!(
        validate_normalized_stream_frame(&events),
        Err(ContractError::ProviderStream)
    );

    let mut stream = ProviderStreamValidator::default();
    stream
        .validate_next(&NormalizedStreamFrame {
            events: vec![NormalizedStreamEvent::TextDelta {
                output_index: 0,
                content_index: 0,
                text: "before terminal".into(),
            }],
        })
        .unwrap();
    assert!(!stream.is_terminal());
    stream
        .validate_next(&NormalizedStreamFrame {
            events: vec![NormalizedStreamEvent::Completed {
                reason_code: "stop".into(),
            }],
        })
        .unwrap();
    assert!(stream.is_terminal());
    assert_eq!(
        stream.validate_next(&NormalizedStreamFrame { events: vec![] }),
        Err(ContractError::ProviderStream)
    );
}

#[tokio::test]
async fn core_revalidates_route_output_and_task_evidence() {
    let candidates = vec![candidate("provider-a", 100)];
    let invented = RouteSelection {
        candidate_ids: vec![Uuid::new_v4()],
        reason_code: "preferred".into(),
    };
    assert_eq!(
        validate_route_selection(&candidates, &invented),
        Err(ContractError::RouteSelection)
    );

    let mut input: TaskRunInput = valid_task_input();
    input.repetition = 0;
    assert_eq!(input.validate(), Err(ContractError::TaskInput));

    let extension = ReferenceExtension::new();
    let valid_input = valid_task_input();
    let output = extension
        .run(valid_input.clone(), &test_context())
        .await
        .unwrap();
    let mut output = output;
    output.execution.task_id = "different-task".into();
    assert_eq!(
        validate_task_output(extension.manifest(), &valid_input, &output),
        Err(ContractError::TaskEvidence)
    );
}

#[test]
fn provider_capability_claims_are_enforced_before_encoding() {
    let extension = ReferenceExtension::new();
    let request = ProviderRequest {
        protocol: Protocol::AnthropicMessagesV1,
        upstream_model: "model-a".into(),
        body: json!({}),
        stream: false,
    };
    assert_eq!(
        validate_provider_request(&extension.capabilities(), &request),
        Err(ContractError::ProviderCapabilities)
    );
}

fn candidate(id: &str, cash: u64) -> RouteCandidate {
    RouteCandidate {
        id: Uuid::new_v4(),
        model_alias: id.into(),
        offer_revision: "rev-1".into(),
        max_cash_nanos: cash.to_string(),
        required_protocol: Protocol::OpenAiChatV1,
    }
}
