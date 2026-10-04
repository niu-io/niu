use niu_execution::observation::{ExecutionRecord, SpanStatus};
use niu_storage::{
    MIGRATOR, OperatorAuditActor, OperatorRole, OperatorScope, PersonalAgentConnectionInput,
    PersonalAgentTraceInput, PersonalAgentTraceQuery, Store, StoreError,
};
use sqlx::PgPool;
fn input() -> PersonalAgentTraceInput {
    let mut record: ExecutionRecord = serde_json::from_str(include_str!(
        "../../../contracts/fixtures/parallel-task.v1.json"
    ))
    .unwrap();
    for span in &mut record.spans {
        span.charge_ref = None;
    }
    record.spans[0].status = Some(SpanStatus::Completed);
    record
        .spans
        .iter_mut()
        .find(|s| s.kind == niu_execution::observation::SpanKind::ToolInvocation)
        .unwrap()
        .status = Some(SpanStatus::Failed);
    PersonalAgentTraceInput {
        name: "Metadata verification".into(),
        record,
        span_names: Default::default(),
        session_key: None,
    }
}
#[test]
fn metadata_schema_rejects_content_ledger_references_and_internal_display_names() {
    let mut value = serde_json::to_value(input()).unwrap();
    value["prompt"] = serde_json::json!("must not persist");
    assert!(serde_json::from_value::<PersonalAgentTraceInput>(value).is_err());
    let mut record = input();
    record.record.spans[0].charge_ref = Some("niu:attempt:private".into());
    assert!(record.validate().is_err());
    record = input();
    record.name = uuid::Uuid::new_v4().to_string();
    assert!(record.validate().is_err());
}
#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn personal_traces_are_durable_scoped_idempotent_and_revocable(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let workspace = store.default_workspace().await.unwrap();
    let a = store
        .create_operator(
            OperatorScope {
                organization_id: workspace.organization_id,
                project_id: None,
            },
            "Trace user A",
            OperatorRole::Viewer,
            3600,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let b = store
        .create_operator(
            OperatorScope {
                organization_id: workspace.organization_id,
                project_id: None,
            },
            "Trace user B",
            OperatorRole::Viewer,
            3600,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let owner = store.authenticate_operator(&a.token).await.unwrap().id;
    let other = store.authenticate_operator(&b.token).await.unwrap().id;
    let key = store
        .issue_personal_agent_connection(
            owner,
            &PersonalAgentConnectionInput {
                name: "Custom source".into(),
                source: "synthetic".into(),
                client_version: "fixture-v1".into(),
                consent_version: "agent-trace-metadata-v1".into(),
            },
        )
        .await
        .unwrap();
    assert!(store.authenticate_operator(&key.token).await.is_err());
    let record = input();
    let (id, created) = store
        .append_personal_agent_trace(&key.token, &record)
        .await
        .unwrap();
    assert!(created);
    assert_eq!(
        store
            .append_personal_agent_trace(&key.token, &record)
            .await
            .unwrap(),
        (id, false)
    );
    let mut conflict = input();
    conflict.name = "Changed label".into();
    assert!(matches!(
        store
            .append_personal_agent_trace(&key.token, &conflict)
            .await,
        Err(StoreError::Conflict)
    ));
    let mut wrong_source = input();
    wrong_source.record.source = "unrelated".into();
    assert!(
        store
            .append_personal_agent_trace(&key.token, &wrong_source)
            .await
            .is_err()
    );
    let reconnected = Store::from_pool(
        PgPool::connect_with((*pool.connect_options()).clone())
            .await
            .unwrap(),
    );
    let saved = reconnected
        .personal_agent_trace(owner, id)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(saved["status"], "completed");
    assert!(saved["error_count"].as_u64().unwrap() > 0);
    assert_eq!(saved["duration_ms"], 100);
    assert!(
        reconnected
            .personal_agent_trace(other, id)
            .await
            .unwrap()
            .is_none()
    );
    assert!(
        reconnected
            .delete_personal_agent_trace(other, id)
            .await
            .is_err()
    );
    let query = PersonalAgentTraceQuery {
        include_unassembled: false,
        from_ms: 0,
        to_ms: 200,
        source: None,
        search: None,
        status: None,
        offset: 25,
        limit: 25,
    };
    let report = store
        .personal_agent_trace_report(owner, &query)
        .await
        .unwrap();
    assert_eq!(report["summary"]["trace_count"], "1");
    assert_eq!(report["rows"].as_array().unwrap().len(), 0);
    assert_eq!(report["summary"]["completed"], "1");
    assert_eq!(report["summary"]["failed"], "0");
    assert_eq!(report["by_day"].as_array().unwrap().len(), 1);
    assert_eq!(
        store
            .personal_agent_trace_report(other, &query)
            .await
            .unwrap()["summary"]["trace_count"],
        "0"
    );
    let excluded = PersonalAgentTraceQuery {
        from_ms: 100,
        to_ms: 200,
        ..query
    };
    assert_eq!(
        store
            .personal_agent_trace_report(owner, &excluded)
            .await
            .unwrap()["summary"]["trace_count"],
        "0"
    );
    assert!(
        store
            .update_personal_agent_connection(other, key.id, true, None)
            .await
            .is_err()
    );
    store
        .update_personal_agent_connection(owner, key.id, true, None)
        .await
        .unwrap();
    assert!(
        store
            .append_personal_agent_trace(&key.token, &record)
            .await
            .is_err()
    );
    assert!(
        store
            .update_personal_agent_connection(owner, key.id, false, None)
            .await
            .is_err()
    );
    store
        .update_personal_agent_connection(owner, key.id, false, Some("agent-trace-metadata-v1"))
        .await
        .unwrap();
    store
        .revoke_personal_agent_connection(owner, key.id)
        .await
        .unwrap();
    assert!(
        store
            .append_personal_agent_trace(&key.token, &record)
            .await
            .is_err()
    );
    store.delete_personal_agent_trace(owner, id).await.unwrap();
    assert!(
        store
            .personal_agent_trace(owner, id)
            .await
            .unwrap()
            .is_none()
    );
}

fn session_event(event: &str, time: i64) -> PersonalAgentTraceInput {
    let key="a".repeat(64);
    let root=format!("session-{key}");
    serde_json::from_value(serde_json::json!({"name":"Codex session","session_key":key,"span_names":{&root:"Codex session",event:"Model response"},"record":{
        "schema_version":1,"source":"codex","record_id":event,"task_id":root,"coverage":"partial",
        "spans":[{"id":root,"kind":"task","status":"unknown","started_at_ms":time,"ended_at_ms":time,"requested_model":null,"reported_model":null,"charge_ref":null},
            {"id":event,"kind":"model_invocation","status":"completed","started_at_ms":null,"ended_at_ms":time,"requested_model":"test-model","reported_model":null,"charge_ref":null}],
        "links":[{"from":root,"to":event,"kind":"contains"}],"outcomes":[],
        "external_usage":{"authority":"agent_reported_estimate","agent_version":"test","request_count":1,"retry_count":0,"input_tokens":"10","output_tokens":"2","cache_read_tokens":null,"cache_creation_tokens":null,"cost_nanos":null,"currency":null}}})).unwrap()
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn native_sessions_merge_concurrent_steps_and_keep_receipts_immutable(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store=Store::from_pool(pool.clone());
    let owner=store.local_observation_owner(&[9;32]).await.unwrap();
    let key=store.issue_personal_agent_connection(owner,&PersonalAgentConnectionInput {
        name:"Codex connection".into(),source:"codex".into(),client_version:"test".into(),consent_version:"agent-trace-metadata-v1".into()
    }).await.unwrap();
    let a=session_event("later",200);
    let b=session_event("earlier",100);
    let (one,two)=tokio::join!(store.append_personal_agent_trace(&key.token,&a),store.append_personal_agent_trace(&key.token,&b));
    let id=one.unwrap().0;
    assert_eq!(two.unwrap().0,id);
    let saved=store.personal_agent_trace(owner,id).await.unwrap().unwrap();
    assert_eq!(saved["model_calls"],2);
    assert_eq!(saved["span_count"],3);
    assert_eq!(saved["duration_ms"],100);
    assert_eq!(saved["record"]["spans"][1]["id"],"earlier");
    assert_eq!(saved["record"]["external_usage"]["input_tokens"],"20");
    assert_eq!(store.append_personal_agent_trace(&key.token,&a).await.unwrap(),(id,false));
    assert_eq!(store.personal_agent_trace(owner,id).await.unwrap().unwrap()["record"],saved["record"]);
    let mut conflicting=session_event("later",201);
    assert!(matches!(store.append_personal_agent_trace(&key.token,&conflicting).await,Err(StoreError::Conflict)));
    conflicting.session_key=Some("b".repeat(64));
    assert!(store.append_personal_agent_trace(&key.token,&conflicting).await.is_err());
    let other=store.local_observation_owner(&[8;32]).await.unwrap();
    assert!(store.personal_agent_trace(other,id).await.unwrap().is_none());
    let mut large=session_event("large",300);
    let template=large.record.spans[1].clone();
    for index in 0..998 {
        let mut step=template.clone();step.id=format!("bulk-{index}");large.record.spans.push(step.clone());
        large.record.links.push(niu_execution::observation::Link{from:large.record.task_id.clone(),to:step.id,kind:niu_execution::observation::LinkKind::Contains});
    }
    large.validate().unwrap();
    let part_two=store.append_personal_agent_trace(&key.token,&large).await.unwrap().0;
    assert_ne!(part_two,id);
    assert_eq!(store.personal_agent_trace(owner,part_two).await.unwrap().unwrap()["name"],"Codex session · part 2");
    assert_eq!(store.append_personal_agent_trace(&key.token,&a).await.unwrap(),(id,false));
    let part_three=store.append_personal_agent_trace(&key.token,&session_event("after-limit",400)).await.unwrap().0;
    assert_ne!(part_three,part_two);
    assert_eq!(store.personal_agent_trace(owner,part_three).await.unwrap().unwrap()["name"],"Codex session · part 3");
    // Delete the projection and its immutable receipts together; no orphaned private evidence.
    store.delete_personal_agent_trace(owner,id).await.unwrap();
    let count:i64=sqlx::query_scalar("SELECT count(*) FROM personal_agent_trace_events WHERE trace_id=$1").bind(id).fetch_one(&pool).await.unwrap();
    assert_eq!(count,0);
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn legacy_native_fragments_are_retained_without_inflating_session_reports(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store=Store::from_pool(pool);
    let owner=store.local_observation_owner(&[7;32]).await.unwrap();
    let key=store.issue_personal_agent_connection(owner,&PersonalAgentConnectionInput {
        name:"Codex connection".into(),source:"codex".into(),client_version:"test".into(),consent_version:"agent-trace-metadata-v1".into()
    }).await.unwrap();
    let identity="c".repeat(64);
    let mut fragment=session_event(&identity,100);
    fragment.session_key=None;
    fragment.name="Codex response completion".into();
    let old_root=fragment.record.task_id.clone();
    let root=format!("task-{identity}");
    fragment.record.task_id=root.clone();
    fragment.record.spans[0].id=root.clone();
    fragment.record.links[0].from=root.clone();
    fragment.span_names.remove(&old_root);
    fragment.span_names.insert(root,"Codex response completion".into());
    let old_id=store.append_personal_agent_trace(&key.token,&fragment).await.unwrap().0;
    assert_eq!(store.personal_agent_trace(owner,old_id).await.unwrap().unwrap()["unassembled_event"],true);
    let mut query=PersonalAgentTraceQuery {from_ms:0,to_ms:1000,source:None,search:None,status:None,offset:0,limit:25,include_unassembled:false};
    assert_eq!(store.personal_agent_trace_report(owner,&query).await.unwrap()["summary"]["trace_count"],"0");
    query.include_unassembled=true;
    assert_eq!(store.personal_agent_trace_report(owner,&query).await.unwrap()["summary"]["trace_count"],"1");
    // Same immutable child evidence can acquire known correlation during upgrade.
    let new_id=store.append_personal_agent_trace(&key.token,&session_event(&identity,100)).await.unwrap().0;
    assert_ne!(new_id,old_id);
    assert!(store.personal_agent_trace(owner,old_id).await.unwrap().is_some());
    let report=store.personal_agent_trace_report(owner,&query).await.unwrap();
    assert_eq!(report["summary"]["trace_count"],"1");
    assert_eq!(report["summary"]["model_calls"],"1");
    assert_eq!(report["rows"][0]["id"],new_id.to_string());
}
