//! Personal, metadata-only execution evidence. Never resolves procurement or ledger data.
use crate::{IssuedKey, Store, StoreError};
use niu_execution::observation::{ExecutionRecord, SpanKind, SpanStatus};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use uuid::Uuid;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PersonalAgentConnectionInput {
    pub name: String,
    pub source: String,
    pub client_version: String,
    pub consent_version: String,
}
#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct PersonalAgentTraceInput {
    pub name: String,
    pub record: ExecutionRecord,
    /// Hash of the source session correlation. Raw session identifiers are never accepted.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub session_key: Option<String>,
    #[serde(default)]
    pub span_names: BTreeMap<String, String>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PersonalAgentTraceQuery {
    #[serde(default)]
    pub include_unassembled: bool,
    pub from_ms: i64,
    pub to_ms: i64,
    #[serde(default)]
    pub source: Option<String>,
    #[serde(default)]
    pub search: Option<String>,
    #[serde(default)]
    pub status: Option<String>,
    #[serde(default)]
    pub offset: i64,
    #[serde(default = "page_size")]
    pub limit: i64,
}
fn page_size() -> i64 {
    25
}
fn label(value: &str) -> bool {
    !value.trim().is_empty()
        && value.len() <= 120
        && !value.chars().any(char::is_control)
        && Uuid::parse_str(value).is_err()
}
impl PersonalAgentTraceQuery {
    pub fn validate(&self) -> Result<(), StoreError> {
        if self.from_ms < 0
            || self.to_ms <= self.from_ms
            || self.to_ms - self.from_ms > 366 * 86_400_000
            || !(1..=100).contains(&self.limit)
            || !(0..=100_000).contains(&self.offset)
            || self.source.as_ref().is_some_and(|s| !label(s))
            || self.search.as_ref().is_some_and(|s| s.len() > 120)
            || self.status.as_ref().is_some_and(|s| {
                !matches!(
                    s.as_str(),
                    "running" | "completed" | "failed" | "cancelled" | "unknown"
                )
            })
        {
            return Err(StoreError::InvalidObservation);
        }
        Ok(())
    }
}
impl PersonalAgentTraceInput {
    pub fn validate(&self) -> Result<(), StoreError> {
        self.record
            .validate()
            .map_err(|_| StoreError::InvalidObservation)?;
        if !label(&self.name)
            || self.session_key.as_ref().is_some_and(|key| {
                key.len() != 64
                    || !key
                        .bytes()
                        .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
                    || self.record.task_id != format!("session-{key}")
            })
            || self.record.spans.len() > 1000
            || self.record.spans.iter().any(|s| s.charge_ref.is_some())
            || self
                .span_names
                .iter()
                .any(|(id, name)| !label(name) || !self.record.spans.iter().any(|s| &s.id == id))
            || serde_json::to_vec(self)
                .map_err(|_| StoreError::InvalidObservation)?
                .len()
                > 1_048_576
        {
            return Err(StoreError::InvalidObservation);
        }
        Ok(())
    }
}
impl Store {
    /// Stable personal identity for the authenticated, single-user loopback login.
    /// No operator session is issued and installation tokens cannot select it.
    pub async fn local_observation_owner(
        &self,
        credential_hash: &[u8],
    ) -> Result<Uuid, StoreError> {
        let digest =
            Sha256::digest([b"niu-personal-local-owner-v1".as_slice(), credential_hash].concat());
        let mut bytes = [0u8; 16];
        bytes.copy_from_slice(&digest[..16]);
        let id = Uuid::from_bytes(bytes);
        let workspace = self.default_workspace().await?;
        sqlx::query("INSERT INTO admin_operators(id,name,role,organization_id,project_id) VALUES($1,'Local development account','viewer',$2,NULL) ON CONFLICT(id) DO NOTHING")
            .bind(id).bind(workspace.organization_id).execute(&self.pool).await?;
        Ok(id)
    }
    pub async fn issue_personal_agent_connection(
        &self,
        owner: Uuid,
        input: &PersonalAgentConnectionInput,
    ) -> Result<IssuedKey, StoreError> {
        if !label(&input.name)
            || !label(&input.source)
            || !label(&input.client_version)
            || input.source.len() > 64
            || !input
                .source
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b"._-".contains(&b))
            || input.consent_version != "agent-trace-metadata-v1"
        {
            return Err(StoreError::InvalidObservation);
        }
        let id = Uuid::new_v4();
        let token = format!(
            "niu_agent_{}{}",
            Uuid::new_v4().simple(),
            Uuid::new_v4().simple()
        );
        sqlx::query("INSERT INTO personal_agent_connections(id,owner_id,name,source,client_version,consent_version,token_hash,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,now()+interval '90 days')")
            .bind(id).bind(owner).bind(&input.name).bind(&input.source).bind(&input.client_version).bind(&input.consent_version).bind(Sha256::digest(token.as_bytes()).to_vec()).execute(&self.pool).await?;
        Ok(IssuedKey { id, token })
    }
    pub async fn personal_agent_connections(&self, owner: Uuid) -> Result<Vec<Value>, StoreError> {
        Ok(sqlx::query_scalar("SELECT jsonb_build_object('id',id,'name',name,'source',source,'client_version',client_version,'paused',paused,'revoked',revoked,'expired',expires_at<=now(),'created_at',created_at,'expires_at',expires_at,'last_received_at',last_received_at) FROM personal_agent_connections WHERE owner_id=$1 ORDER BY created_at DESC,id DESC")
            .bind(owner).fetch_all(&self.pool).await?)
    }
    pub async fn update_personal_agent_connection(
        &self,
        owner: Uuid,
        id: Uuid,
        paused: bool,
        consent: Option<&str>,
    ) -> Result<(), StoreError> {
        if !paused && consent != Some("agent-trace-metadata-v1") {
            return Err(StoreError::InvalidObservation);
        }
        let changed = sqlx::query("UPDATE personal_agent_connections SET paused=$3 WHERE owner_id=$1 AND id=$2 AND NOT revoked AND expires_at>now()")
            .bind(owner).bind(id).bind(paused).execute(&self.pool).await?.rows_affected();
        if changed == 0 {
            return Err(StoreError::Conflict);
        }
        Ok(())
    }
    pub async fn revoke_personal_agent_connection(
        &self,
        owner: Uuid,
        id: Uuid,
    ) -> Result<(), StoreError> {
        let changed = sqlx::query(
            "UPDATE personal_agent_connections SET revoked=TRUE WHERE owner_id=$1 AND id=$2",
        )
        .bind(owner)
        .bind(id)
        .execute(&self.pool)
        .await?
        .rows_affected();
        if changed == 0 {
            return Err(StoreError::Conflict);
        }
        Ok(())
    }
    pub async fn append_personal_agent_trace(
        &self,
        token: &str,
        input: &PersonalAgentTraceInput,
    ) -> Result<(Uuid, bool), StoreError> {
        input.validate()?;
        let mut tx = self.pool.begin().await?;
        let connection: Option<(Uuid,Uuid,String)> = sqlx::query_as("SELECT id,owner_id,source FROM personal_agent_connections WHERE token_hash=$1 AND NOT paused AND NOT revoked AND expires_at>now() FOR UPDATE")
            .bind(Sha256::digest(token.as_bytes()).to_vec()).fetch_optional(&mut *tx).await?;
        let (connection, owner, source) = connection.ok_or(StoreError::Unauthorized)?;
        if input.record.source != source {
            return Err(StoreError::InvalidObservation);
        }
        if input.session_key.is_some() {
            return self
                .append_personal_agent_session_event(tx, owner, connection, input)
                .await;
        }
        let grouped_event: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM personal_agent_trace_events WHERE owner_id=$1 AND connection_id=$2 AND event_id=$3)")
            .bind(owner).bind(connection).bind(&input.record.record_id).fetch_one(&mut *tx).await?;
        if grouped_event {
            return Err(StoreError::Conflict);
        }
        let root = input
            .record
            .spans
            .iter()
            .find(|s| s.id == input.record.task_id)
            .ok_or(StoreError::InvalidObservation)?;
        let status = match root.status.as_ref() {
            Some(SpanStatus::Running) => "running",
            Some(SpanStatus::Completed) => "completed",
            Some(SpanStatus::Failed) => "failed",
            Some(SpanStatus::Cancelled) => "cancelled",
            _ => "unknown",
        };
        let duration = root.started_at_ms.zip(root.ended_at_ms).map(|(a, b)| b - a);
        let coverage = serde_json::to_value(&input.record.coverage)
            .map_err(|_| StoreError::InvalidObservation)?;
        let record =
            serde_json::to_value(&input.record).map_err(|_| StoreError::InvalidObservation)?;
        let names =
            serde_json::to_value(&input.span_names).map_err(|_| StoreError::InvalidObservation)?;
        let id = Uuid::new_v4();
        let inserted = sqlx::query("INSERT INTO personal_agent_traces(id,owner_id,connection_id,source,record_id,name,occurred_at,time_basis,status,coverage,duration_ms,span_count,error_count,model_calls,tool_calls,record,span_names) VALUES($1,$2,$3,$4,$5,$6,COALESCE(to_timestamp($7::double precision/1000),now()),CASE WHEN $7::bigint IS NULL THEN 'received' ELSE 'observed' END,$8,$9,$10,$11,$12,$13,$14,$15,$16) ON CONFLICT(owner_id,connection_id,record_id) DO NOTHING")
            .bind(id).bind(owner).bind(connection).bind(&source).bind(&input.record.record_id).bind(&input.name).bind(root.started_at_ms).bind(status).bind(coverage.as_str().unwrap_or("unknown")).bind(duration)
            .bind(input.record.spans.len() as i64).bind(input.record.spans.iter().filter(|s|s.status==Some(SpanStatus::Failed)).count() as i64)
            .bind(input.record.spans.iter().filter(|s|s.kind==SpanKind::ModelInvocation).count() as i64).bind(input.record.spans.iter().filter(|s|s.kind==SpanKind::ToolInvocation).count() as i64)
            .bind(&record).bind(&names).execute(&mut *tx).await?.rows_affected();
        let actual_id = if inserted == 0 {
            let existing: (Uuid,String,Value,Value) = sqlx::query_as("SELECT id,name,record,span_names FROM personal_agent_traces WHERE owner_id=$1 AND connection_id=$2 AND record_id=$3")
                .bind(owner).bind(connection).bind(&input.record.record_id).fetch_one(&mut *tx).await?;
            if existing.1 != input.name || existing.2 != record || existing.3 != names {
                return Err(StoreError::Conflict);
            }
            existing.0
        } else {
            id
        };
        if source == "codex"
            && input.record.task_id == format!("task-{}", input.record.record_id)
            && matches!(
                input.name.as_str(),
                "Codex API request" | "Codex response completion" | "Codex tool"
            )
        {
            sqlx::query("UPDATE personal_agent_traces SET unassembled_event=TRUE WHERE id=$1")
                .bind(actual_id)
                .execute(&mut *tx)
                .await?;
        }
        sqlx::query("UPDATE personal_agent_connections SET last_received_at=now() WHERE id=$1")
            .bind(connection)
            .execute(&mut *tx)
            .await?;
        tx.commit().await?;
        Ok((actual_id, inserted > 0))
    }
    pub async fn personal_agent_trace(
        &self,
        owner: Uuid,
        id: Uuid,
    ) -> Result<Option<Value>, StoreError> {
        Ok(sqlx::query_scalar("SELECT jsonb_build_object('id',id,'name',name,'source',source,'occurred_at',occurred_at,'received_at',received_at,'time_basis',time_basis,'unassembled_event',unassembled_event,'status',status,'coverage',coverage,'duration_ms',duration_ms,'span_count',span_count,'error_count',error_count,'model_calls',model_calls,'tool_calls',tool_calls,'record',record,'span_names',span_names) FROM personal_agent_traces WHERE owner_id=$1 AND id=$2")
            .bind(owner).bind(id).fetch_optional(&self.pool).await?)
    }
    pub async fn delete_personal_agent_trace(
        &self,
        owner: Uuid,
        id: Uuid,
    ) -> Result<(), StoreError> {
        let changed = sqlx::query("DELETE FROM personal_agent_traces WHERE owner_id=$1 AND id=$2")
            .bind(owner)
            .bind(id)
            .execute(&self.pool)
            .await?
            .rows_affected();
        if changed == 0 {
            return Err(StoreError::Conflict);
        }
        Ok(())
    }
    pub async fn personal_agent_trace_report(
        &self,
        owner: Uuid,
        q: &PersonalAgentTraceQuery,
    ) -> Result<Value, StoreError> {
        q.validate()?;
        let mut tx = self.pool.begin().await?;
        sqlx::query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
            .execute(&mut *tx)
            .await?;
        let filter = format!(
            "owner_id=$1 AND superseded_by IS NULL {} AND occurred_at>=to_timestamp($2::double precision/1000) AND occurred_at<to_timestamp($3::double precision/1000) AND ($4::text IS NULL OR source=$4) AND ($5::text IS NULL OR strpos(lower(name),lower($5))>0) AND ($6::text IS NULL OR status=$6)",
            if q.include_unassembled {
                ""
            } else {
                "AND NOT unassembled_event"
            }
        );
        let rows: Vec<Value>=sqlx::query_scalar(&format!("SELECT jsonb_build_object('id',id,'name',name,'source',source,'occurred_at',occurred_at,'time_basis',time_basis,'unassembled_event',unassembled_event,'status',status,'coverage',coverage,'duration_ms',duration_ms,'span_count',span_count,'error_count',error_count,'model_calls',model_calls,'tool_calls',tool_calls) FROM personal_agent_traces WHERE {filter} ORDER BY occurred_at DESC,id DESC LIMIT $7 OFFSET $8"))
            .bind(owner).bind(q.from_ms).bind(q.to_ms).bind(&q.source).bind(&q.search).bind(&q.status).bind(q.limit).bind(q.offset).fetch_all(&mut *tx).await?;
        let summary: Value=sqlx::query_scalar(&format!("SELECT jsonb_build_object('trace_count',count(*)::text,'completed',count(*) FILTER(WHERE status='completed')::text,'failed',count(*) FILTER(WHERE status='failed')::text,'unknown_status',count(*) FILTER(WHERE status='unknown')::text,'partial',count(*) FILTER(WHERE coverage<>'complete')::text,'untimed',count(*) FILTER(WHERE duration_ms IS NULL)::text,'span_count',COALESCE(sum(span_count),0)::text,'error_count',COALESCE(sum(error_count),0)::text,'model_calls',COALESCE(sum(model_calls),0)::text,'tool_calls',COALESCE(sum(tool_calls),0)::text,'p50_duration_ms',percentile_cont(0.5) WITHIN GROUP(ORDER BY duration_ms),'p95_duration_ms',percentile_cont(0.95) WITHIN GROUP(ORDER BY duration_ms)) FROM personal_agent_traces WHERE {filter}"))
            .bind(owner).bind(q.from_ms).bind(q.to_ms).bind(&q.source).bind(&q.search).bind(&q.status).fetch_one(&mut *tx).await?;
        let by_day:Vec<Value>=sqlx::query_scalar(&format!("SELECT jsonb_build_object('day',to_char(occurred_at AT TIME ZONE 'UTC','YYYY-MM-DD'),'trace_count',count(*)::text,'failed',count(*) FILTER(WHERE status='failed')::text) FROM personal_agent_traces WHERE {filter} GROUP BY to_char(occurred_at AT TIME ZONE 'UTC','YYYY-MM-DD') ORDER BY to_char(occurred_at AT TIME ZONE 'UTC','YYYY-MM-DD')"))
            .bind(owner).bind(q.from_ms).bind(q.to_ms).bind(&q.source).bind(&q.search).bind(&q.status).fetch_all(&mut *tx).await?;
        tx.commit().await?;
        Ok(json!({"rows":rows,"summary":summary,"by_day":by_day,"offset":q.offset,"limit":q.limit}))
    }
}
