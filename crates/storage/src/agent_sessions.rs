//! Immutable event receipts with a bounded, ordered session trace projection.
use crate::{PersonalAgentTraceInput, Store, StoreError};
use niu_execution::observation::{ExecutionRecord, ExternalUsage, SpanKind, SpanStatus};
use serde_json::Value;
use sqlx::{Postgres, Transaction};
use std::collections::BTreeMap;
use uuid::Uuid;

fn sum(a: &Option<String>, b: &Option<String>) -> Result<Option<String>, StoreError> {
    match (a, b) {
        (Some(a), Some(b)) => {
            let value = a
                .parse::<i64>()
                .map_err(|_| StoreError::InvalidObservation)?
                .checked_add(
                    b.parse::<i64>()
                        .map_err(|_| StoreError::InvalidObservation)?,
                )
                .ok_or(StoreError::InvalidObservation)?;
            Ok(Some(value.to_string()))
        }
        _ => Ok(None),
    }
}
fn usage(a: &mut ExternalUsage, b: &ExternalUsage) -> Result<(), StoreError> {
    a.request_count = a
        .request_count
        .checked_add(b.request_count)
        .ok_or(StoreError::InvalidObservation)?;
    a.retry_count = a
        .retry_count
        .checked_add(b.retry_count)
        .ok_or(StoreError::InvalidObservation)?;
    a.input_tokens = sum(&a.input_tokens, &b.input_tokens)?;
    a.output_tokens = sum(&a.output_tokens, &b.output_tokens)?;
    a.cache_read_tokens = sum(&a.cache_read_tokens, &b.cache_read_tokens)?;
    a.cache_creation_tokens = sum(&a.cache_creation_tokens, &b.cache_creation_tokens)?;
    // Usage is source-reported. Never synthesize customer charges or supplier costs.
    a.cost_nanos = None;
    a.currency = None;
    if a.agent_version != b.agent_version {
        a.agent_version = None;
    }
    Ok(())
}
fn merge(
    previous: &PersonalAgentTraceInput,
    next: &PersonalAgentTraceInput,
) -> Result<PersonalAgentTraceInput, StoreError> {
    if previous.session_key != next.session_key
        || previous.record.task_id != next.record.task_id
        || previous.record.source != next.record.source
        || previous.name != next.name
    {
        return Err(StoreError::Conflict);
    }
    let mut record = previous.record.clone();
    // Earlier native adapters interpreted OTLP's unset timestamp (zero) as epoch.
    // Keep immutable receipts, but never present that sentinel as execution timing.
    if record.source == "codex" {
        for span in &mut record.spans {
            if span.started_at_ms == Some(0) {
                span.started_at_ms = None;
            }
            if span.ended_at_ms == Some(0) {
                span.ended_at_ms = None;
            }
        }
    }
    let mut names = previous.span_names.clone();
    let mut nodes: BTreeMap<_, _> = record
        .spans
        .iter()
        .map(|s| (s.id.clone(), s.clone()))
        .collect();
    for node in &next.record.spans {
        if node.id == record.task_id {
            let root = nodes
                .get_mut(&node.id)
                .ok_or(StoreError::InvalidObservation)?;
            root.started_at_ms = root
                .started_at_ms
                .into_iter()
                .chain(node.started_at_ms)
                .min();
            root.ended_at_ms = root.ended_at_ms.into_iter().chain(node.ended_at_ms).max();
            // Activity does not prove task acceptance or session completion.
            root.status = Some(SpanStatus::Unknown);
        } else if let Some(old) = nodes.get(&node.id) {
            if old != node || names.get(&node.id) != next.span_names.get(&node.id) {
                return Err(StoreError::Conflict);
            }
        } else {
            nodes.insert(node.id.clone(), node.clone());
        }
    }
    names.extend(next.span_names.clone());
    // Rebuild the observed window from all retained steps after legacy timing repair.
    // A completion can establish activity time, but never a model start duration.
    let observed_start = nodes
        .values()
        .filter_map(|s| s.started_at_ms.or(s.ended_at_ms))
        .min();
    let observed_end = nodes
        .values()
        .filter_map(|s| s.ended_at_ms.or(s.started_at_ms))
        .max();
    if let Some(root) = nodes.get_mut(&record.task_id) {
        root.started_at_ms = observed_start;
        root.ended_at_ms = observed_end;
    }
    record.spans = nodes.into_values().collect();
    record.spans.sort_by_key(|s| {
        (
            s.id != record.task_id,
            s.started_at_ms.or(s.ended_at_ms).unwrap_or(i64::MAX),
            s.id.clone(),
        )
    });
    for edge in &next.record.links {
        if !record.links.contains(edge) {
            record.links.push(edge.clone());
        }
    }
    let positions: BTreeMap<_, _> = record
        .spans
        .iter()
        .enumerate()
        .map(|(index, span)| (span.id.clone(), index))
        .collect();
    record.links.sort_by_key(|link| {
        (
            positions.get(&link.from).copied(),
            positions.get(&link.to).copied(),
            link.kind.clone(),
        )
    });
    for outcome in &next.record.outcomes {
        if !record.outcomes.contains(outcome) {
            record.outcomes.push(outcome.clone());
        }
    }
    match (&mut record.external_usage, &next.record.external_usage) {
        (Some(a), Some(b)) => usage(a, b)?,
        (a @ None, Some(b)) => *a = Some(b.clone()),
        _ => {}
    }
    record.coverage = niu_execution::observation::Coverage::Partial;
    Ok(PersonalAgentTraceInput {
        name: previous.name.clone(),
        record,
        span_names: names,
        session_key: next.session_key.clone(),
    })
}

impl Store {
    pub(crate) async fn append_personal_agent_session_event(
        &self,
        mut tx: Transaction<'_, Postgres>,
        owner: Uuid,
        connection: Uuid,
        input: &PersonalAgentTraceInput,
    ) -> Result<(Uuid, bool), StoreError> {
        // The connection row is already locked by ingestion: concurrent delivery cannot lose steps.
        let event = serde_json::to_value(input).map_err(|_| StoreError::InvalidObservation)?;
        let standalone: Option<(Uuid, Value)> = sqlx::query_as("SELECT id,record FROM personal_agent_traces WHERE owner_id=$1 AND connection_id=$2 AND record_id=$3 AND session_key IS NULL")
            .bind(owner).bind(connection).bind(&input.record.record_id).fetch_optional(&mut *tx).await?;
        let legacy = if let Some((id, value)) = standalone {
            let old: ExecutionRecord =
                serde_json::from_value(value).map_err(|_| StoreError::Conflict)?;
            // A retried native batch can recover its session correlation. Accept only the
            // identical native child evidence, never a rewritten standalone/custom run.
            if old.task_id != format!("task-{}", input.record.record_id)
                || old.source != "codex"
                || old.external_usage != input.record.external_usage
                || old
                    .spans
                    .iter()
                    .filter(|s| s.id != old.task_id)
                    .collect::<Vec<_>>()
                    != input
                        .record
                        .spans
                        .iter()
                        .filter(|s| s.id != input.record.task_id)
                        .collect::<Vec<_>>()
            {
                return Err(StoreError::Conflict);
            }
            Some(id)
        } else {
            None
        };
        let prior: Option<(Uuid, Value)> = sqlx::query_as("SELECT trace_id,payload FROM personal_agent_trace_events WHERE owner_id=$1 AND connection_id=$2 AND event_id=$3")
            .bind(owner).bind(connection).bind(&input.record.record_id).fetch_optional(&mut *tx).await?;
        if let Some((id, payload)) = prior {
            if payload != event {
                return Err(StoreError::Conflict);
            }
            tx.commit().await?;
            return Ok((id, false));
        }
        let key = input
            .session_key
            .as_ref()
            .ok_or(StoreError::InvalidObservation)?;
        let latest: Option<(Uuid, i32, Value, Value)> = sqlx::query_as("SELECT id,session_segment,record,span_names FROM personal_agent_traces WHERE owner_id=$1 AND connection_id=$2 AND session_key=$3 ORDER BY session_segment DESC LIMIT 1")
            .bind(owner).bind(connection).bind(key).fetch_optional(&mut *tx).await?;
        let mut id = Uuid::new_v4();
        let mut segment = 1;
        let mut projection = PersonalAgentTraceInput {
            name: input.name.clone(),
            record: input.record.clone(),
            span_names: input.span_names.clone(),
            session_key: input.session_key.clone(),
        };
        if let Some((old_id, old_segment, old_record, old_names)) = latest {
            let previous = PersonalAgentTraceInput {
                name: input.name.clone(),
                record: serde_json::from_value::<ExecutionRecord>(old_record)
                    .map_err(|_| StoreError::InvalidObservation)?,
                span_names: serde_json::from_value(old_names)
                    .map_err(|_| StoreError::InvalidObservation)?,
                session_key: input.session_key.clone(),
            };
            let combined = merge(&previous, input)?;
            // Long conversations continue in another bounded trace instead of losing history.
            if combined.record.spans.len() > 1000
                || serde_json::to_vec(&combined)
                    .map_err(|_| StoreError::InvalidObservation)?
                    .len()
                    > 1_048_576
            {
                segment = old_segment
                    .checked_add(1)
                    .ok_or(StoreError::InvalidObservation)?;
            } else {
                id = old_id;
                segment = old_segment;
                projection = combined;
            }
        }
        projection.record.record_id = format!("session-{key}-{segment}");
        projection.validate()?;
        let root = projection
            .record
            .spans
            .iter()
            .find(|s| s.id == projection.record.task_id)
            .ok_or(StoreError::InvalidObservation)?;
        let duration = root.started_at_ms.zip(root.ended_at_ms).map(|(a, b)| b - a);
        let name = if segment == 1 {
            input.name.clone()
        } else {
            format!("{} · part {segment}", input.name)
        };
        let record =
            serde_json::to_value(&projection.record).map_err(|_| StoreError::InvalidObservation)?;
        let names = serde_json::to_value(&projection.span_names)
            .map_err(|_| StoreError::InvalidObservation)?;
        sqlx::query("INSERT INTO personal_agent_traces(id,owner_id,connection_id,source,record_id,name,occurred_at,time_basis,status,coverage,duration_ms,span_count,error_count,model_calls,tool_calls,record,span_names,session_key,session_segment) VALUES($1,$2,$3,$4,$5,$6,COALESCE(to_timestamp($7::double precision/1000),now()),CASE WHEN $7::bigint IS NULL THEN 'received' ELSE 'observed' END,'unknown','partial',$8,$9,$10,$11,$12,$13,$14,$15,$16) ON CONFLICT(id) DO UPDATE SET occurred_at=EXCLUDED.occurred_at,time_basis=EXCLUDED.time_basis,received_at=now(),duration_ms=EXCLUDED.duration_ms,span_count=EXCLUDED.span_count,error_count=EXCLUDED.error_count,model_calls=EXCLUDED.model_calls,tool_calls=EXCLUDED.tool_calls,record=EXCLUDED.record,span_names=EXCLUDED.span_names")
            .bind(id).bind(owner).bind(connection).bind(&input.record.source).bind(&projection.record.record_id).bind(name).bind(root.started_at_ms).bind(duration)
            .bind(projection.record.spans.len() as i64).bind(projection.record.spans.iter().filter(|s|s.status==Some(SpanStatus::Failed)).count() as i64)
            .bind(projection.record.spans.iter().filter(|s|s.kind==SpanKind::ModelInvocation).count() as i64).bind(projection.record.spans.iter().filter(|s|s.kind==SpanKind::ToolInvocation).count() as i64)
            .bind(record).bind(names).bind(key).bind(segment).execute(&mut *tx).await?;
        sqlx::query("INSERT INTO personal_agent_trace_events(owner_id,connection_id,event_id,trace_id,payload) VALUES($1,$2,$3,$4,$5)")
            .bind(owner).bind(connection).bind(&input.record.record_id).bind(id).bind(event).execute(&mut *tx).await?;
        if let Some(legacy) = legacy {
            sqlx::query("UPDATE personal_agent_traces SET superseded_by=$1 WHERE id=$2 AND owner_id=$3 AND connection_id=$4")
                .bind(id).bind(legacy).bind(owner).bind(connection).execute(&mut *tx).await?;
        }
        sqlx::query("UPDATE personal_agent_connections SET last_received_at=now() WHERE id=$1")
            .bind(connection)
            .execute(&mut *tx)
            .await?;
        tx.commit().await?;
        Ok((id, true))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    fn event(id: &str, time: i64) -> PersonalAgentTraceInput {
        let key = "a".repeat(64);
        let root = format!("session-{key}");
        serde_json::from_value(json!({"name":"Codex session","session_key":key,
            "span_names":{&root:"Codex session",id:"Model response"},
            "record":{"schema_version":1,"source":"codex","record_id":id,"task_id":root,"coverage":"partial",
                "spans":[{"id":root,"kind":"task","status":"unknown","started_at_ms":time,"ended_at_ms":time,"requested_model":null,"reported_model":null,"charge_ref":null},
                    {"id":id,"kind":"model_invocation","status":"completed","started_at_ms":null,"ended_at_ms":time,"requested_model":"test-model","reported_model":null,"charge_ref":null}],
                "links":[{"from":root,"to":id,"kind":"contains"}],"outcomes":[],
                "external_usage":{"authority":"agent_reported_estimate","agent_version":"test","request_count":1,"retry_count":0,"input_tokens":"10","output_tokens":"2","cache_read_tokens":null,"cache_creation_tokens":null,"cost_nanos":null,"currency":null}}})).unwrap()
    }
    #[test]
    fn session_projection_orders_steps_and_sums_only_known_usage() {
        let combined = merge(&event("later", 200), &event("earlier", 100)).unwrap();
        combined.validate().unwrap();
        assert_eq!(combined.record.spans.len(), 3);
        assert_eq!(combined.record.spans[0].started_at_ms, Some(100));
        assert_eq!(combined.record.spans[0].ended_at_ms, Some(200));
        assert_eq!(combined.record.spans[0].status, Some(SpanStatus::Unknown));
        assert_eq!(combined.record.spans[1].id, "earlier");
        assert_eq!(combined.record.links[0].to, "earlier");
        let usage = combined.record.external_usage.unwrap();
        assert_eq!(usage.request_count, 2);
        assert_eq!(usage.input_tokens.as_deref(), Some("20"));
        assert_eq!(usage.cache_read_tokens, None);
        assert_eq!(usage.cost_nanos, None);
    }
    #[test]
    fn repaired_session_window_includes_retained_completion_without_inventing_start() {
        let mut previous = event("retained", 100);
        previous.record.spans[0].started_at_ms = Some(0);
        previous.record.spans[0].ended_at_ms = Some(0);
        let combined = merge(&previous, &event("new", 200)).unwrap();
        assert_eq!(combined.record.spans[0].started_at_ms, Some(100));
        assert_eq!(combined.record.spans[0].ended_at_ms, Some(200));
        assert_eq!(combined.record.spans[1].started_at_ms, None);
        assert_eq!(combined.record.spans[1].ended_at_ms, Some(100));
    }
    #[test]
    fn conflicting_step_and_wrong_session_cannot_rewrite_evidence() {
        let a = event("one", 100);
        let mut b = event("one", 101);
        assert!(merge(&a, &b).is_err());
        b = event("two", 200);
        b.session_key = Some("b".repeat(64));
        assert!(merge(&a, &b).is_err());
        assert!(b.validate().is_err());
    }
}
