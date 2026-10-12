use crate::{Store, StoreError, TenantScope};
use serde_json::Value;
use uuid::Uuid;

// Bound saved JSON materialization before payloads cross the database connection.
const CHAT_HISTORY_PAYLOAD_BYTES: i64 = 32 * 1024 * 1024;

fn visit_results(payload: &mut Value, mut visit: impl FnMut(&mut Value)) {
    if let Some(results) = payload.get_mut("results").and_then(Value::as_array_mut) {
        for result in results {
            visit(result);
        }
    }
    if let Some(turns) = payload.get_mut("turns").and_then(Value::as_array_mut) {
        for turn in turns {
            if let Some(results) = turn.get_mut("results").and_then(Value::as_array_mut) {
                for result in results {
                    visit(result);
                }
            }
        }
    }
}

impl Store {
    pub async fn chat_draft(
        &self,
        scope: TenantScope,
        owner: &str,
    ) -> Result<(Option<Value>, i64), StoreError> {
        Ok(sqlx::query_as("SELECT payload,revision FROM chat_drafts WHERE organization_id=$1 AND project_id=$2 AND owner=$3")
            .bind(scope.organization_id).bind(scope.project_id).bind(owner)
            .fetch_optional(&self.pool).await?.unwrap_or((None,0)))
    }

    /// Compare-and-swap prevents another tab from silently replacing a newer draft.
    /// A cleared draft retains its revision so stale writes cannot recreate it.
    pub async fn save_chat_draft(
        &self,
        scope: TenantScope,
        owner: &str,
        payload: Option<&Value>,
        expected_revision: i64,
    ) -> Result<i64, StoreError> {
        if expected_revision < 0 {
            return Err(StoreError::Conflict);
        }
        let revision = sqlx::query_scalar("INSERT INTO chat_drafts(organization_id,project_id,owner,payload) SELECT $1,$2,$3,$4 WHERE $5=0 OR EXISTS(SELECT 1 FROM chat_drafts WHERE organization_id=$1 AND project_id=$2 AND owner=$3) ON CONFLICT(organization_id,project_id,owner) DO UPDATE SET payload=EXCLUDED.payload,revision=chat_drafts.revision+1,updated_at=clock_timestamp() WHERE chat_drafts.revision=$5 RETURNING revision")
            .bind(scope.organization_id).bind(scope.project_id).bind(owner).bind(payload).bind(expected_revision)
            .fetch_optional(&self.pool).await?;
        revision.ok_or(StoreError::Conflict)
    }
    /// Fetch one durable conversation within its workspace and personal owner.
    pub async fn chat_session(
        &self,
        scope: TenantScope,
        owner: &str,
        id: Uuid,
    ) -> Result<Option<Value>, StoreError> {
        Ok(sqlx::query_scalar("SELECT payload FROM chat_sessions WHERE organization_id=$1 AND project_id=$2 AND owner=$3 AND id=$4")
            .bind(scope.organization_id).bind(scope.project_id).bind(owner).bind(id)
            .fetch_optional(&self.pool).await?)
    }

    pub async fn delete_chat_session(
        &self,
        scope: TenantScope,
        owner: &str,
        id: Uuid,
    ) -> Result<(), StoreError> {
        sqlx::query("DELETE FROM chat_sessions WHERE organization_id=$1 AND project_id=$2 AND owner=$3 AND id=$4")
            .bind(scope.organization_id).bind(scope.project_id).bind(owner).bind(id)
            .execute(&self.pool).await?;
        Ok(())
    }
    /// Archive state is separate from client payload and survives later saves.
    pub async fn set_chat_session_archived(
        &self,
        scope: TenantScope,
        owner: &str,
        id: Uuid,
        archived: bool,
    ) -> Result<bool, StoreError> {
        let result = sqlx::query("UPDATE chat_sessions SET archived=$5 WHERE organization_id=$1 AND project_id=$2 AND owner=$3 AND id=$4")
            .bind(scope.organization_id).bind(scope.project_id).bind(owner).bind(id).bind(archived)
            .execute(&self.pool).await?;
        Ok(result.rows_affected() == 1)
    }

    pub async fn chat_sessions(
        &self,
        scope: TenantScope,
        owner: &str,
    ) -> Result<Vec<Value>, StoreError> {
        self.chat_sessions_by_archive(scope, owner, false).await
    }

    pub async fn chat_sessions_by_archive(
        &self,
        scope: TenantScope,
        owner: &str,
        archived: bool,
    ) -> Result<Vec<Value>, StoreError> {
        let mut snapshot = self.begin_bounded_read_snapshot().await?;
        let rows: Vec<(Uuid, i64)> = sqlx::query_as("SELECT id,octet_length(payload::text)::bigint FROM chat_sessions WHERE organization_id=$1 AND project_id=$2 AND owner=$3 AND archived=$4 ORDER BY updated_at DESC,id DESC LIMIT 100")
            .bind(scope.organization_id).bind(scope.project_id).bind(owner).bind(archived)
            .fetch_all(&mut *snapshot).await?;
        if rows.iter().map(|(_, bytes)| bytes).sum::<i64>() > CHAT_HISTORY_PAYLOAD_BYTES {
            return Err(StoreError::ChatHistoryCapacityExceeded);
        }
        let sessions = Self::load_chat_payloads(
            &mut snapshot,
            scope,
            owner,
            archived,
            rows.into_iter().map(|(id, _)| id).collect(),
        )
        .await?;
        let sessions = Self::hydrate_chat_charges(&mut snapshot, scope, sessions).await?;
        snapshot.commit().await?;
        Ok(sessions)
    }

    /// Seek over recent saved conversations within one personal owner and archive.
    /// The cursor fingerprints its update time; a changed/deleted cursor returns
    /// conflict rather than silently seeking from a different position. New
    /// fingerprints use epoch values, independent of session time zone. Accept
    /// the previous UTC-text fingerprints so existing pages can still continue.
    pub async fn chat_session_page(
        &self,
        scope: TenantScope,
        owner: &str,
        archived: bool,
        after: Option<&str>,
        limit: u16,
    ) -> Result<Value, StoreError> {
        if !(1..=100).contains(&limit) {
            return Err(StoreError::Conflict);
        }
        let parsed = after
            .map(|cursor| {
                let (id, revision) = cursor.split_once(':').ok_or(StoreError::Conflict)?;
                if revision.len() != 64 || !revision.bytes().all(|b| b.is_ascii_hexdigit()) {
                    return Err(StoreError::Conflict);
                }
                Ok((
                    Uuid::parse_str(id).map_err(|_| StoreError::Conflict)?,
                    revision.to_ascii_lowercase(),
                ))
            })
            .transpose()?;
        let mut snapshot = self.begin_bounded_read_snapshot().await?;
        let cursor: Option<(Uuid, String)> = if let Some((id, revision)) = parsed {
            let timestamp: String = sqlx::query_scalar("SELECT updated_at::text FROM chat_sessions WHERE organization_id=$1 AND project_id=$2 AND owner=$3 AND archived=$4 AND id=$5 AND (encode(sha256(convert_to(extract(epoch FROM updated_at)::text,'UTF8')),'hex')=$6 OR encode(sha256(convert_to((updated_at AT TIME ZONE 'UTC')::text||'+00','UTF8')),'hex')=$6)")
                .bind(scope.organization_id).bind(scope.project_id).bind(owner).bind(archived).bind(id).bind(revision)
                .fetch_optional(&mut *snapshot).await?.ok_or(StoreError::Conflict)?;
            Some((id, timestamp))
        } else {
            None
        };
        let mut query = sqlx::QueryBuilder::<sqlx::Postgres>::new(
            "SELECT id,encode(sha256(convert_to(extract(epoch FROM updated_at)::text,'UTF8')),'hex') AS revision,octet_length(payload::text)::bigint AS bytes FROM chat_sessions WHERE organization_id=",
        );
        query
            .push_bind(scope.organization_id)
            .push(" AND project_id=")
            .push_bind(scope.project_id)
            .push(" AND owner=")
            .push_bind(owner)
            .push(" AND archived=")
            .push_bind(archived);
        if let Some((id, timestamp)) = cursor {
            query
                .push(" AND (updated_at,id)<(")
                .push_bind(timestamp)
                .push("::timestamptz,")
                .push_bind(id)
                .push(")");
        }
        query
            .push(" ORDER BY updated_at DESC,id DESC LIMIT ")
            .push_bind(i64::from(limit) + 1);
        let candidates: Vec<(Uuid, String, i64)> =
            query.build_query_as().fetch_all(&mut *snapshot).await?;
        let mut selected = Vec::new();
        let mut bytes = 0_i64;
        for (id, revision, size) in &candidates {
            if selected.len() == usize::from(limit) || bytes + size > CHAT_HISTORY_PAYLOAD_BYTES {
                break;
            }
            bytes += size;
            selected.push((*id, revision));
        }
        if selected.is_empty() && !candidates.is_empty() {
            return Err(StoreError::ChatHistoryCapacityExceeded);
        }
        let more = selected.len() < candidates.len();
        let next = if more {
            selected
                .last()
                .map(|(id, revision)| format!("{id}:{revision}"))
        } else {
            None
        };
        let payloads = Self::load_chat_payloads(
            &mut snapshot,
            scope,
            owner,
            archived,
            selected.into_iter().map(|(id, _)| id).collect(),
        )
        .await?;
        let data = Self::hydrate_chat_charges(&mut snapshot, scope, payloads).await?;
        snapshot.commit().await?;
        Ok(serde_json::json!({"data":data,"next_cursor":next}))
    }

    async fn load_chat_payloads(
        connection: &mut sqlx::PgConnection,
        scope: TenantScope,
        owner: &str,
        archived: bool,
        ids: Vec<Uuid>,
    ) -> Result<Vec<Value>, StoreError> {
        if ids.is_empty() {
            return Ok(Vec::new());
        }
        Ok(sqlx::query_scalar("SELECT payload FROM chat_sessions WHERE organization_id=$1 AND project_id=$2 AND owner=$3 AND archived=$4 AND id=ANY($5) ORDER BY updated_at DESC,id DESC")
            .bind(scope.organization_id).bind(scope.project_id).bind(owner).bind(archived).bind(ids)
            .fetch_all(connection).await?)
    }

    async fn hydrate_chat_charges(
        connection: &mut sqlx::PgConnection,
        scope: TenantScope,
        mut sessions: Vec<Value>,
    ) -> Result<Vec<Value>, StoreError> {
        let mut attempts = std::collections::HashSet::new();
        for session in &mut sessions {
            visit_results(session, |result| {
                if let Some(object) = result.as_object_mut() {
                    // Saved browser accounting is not authoritative, including legacy Supplier costs.
                    for field in [
                        "cashNanos",
                        "apiEquivalentNanos",
                        "currency",
                        "customerChargeNanos",
                        "customerChargeCurrency",
                        "customerChargeStatus",
                    ] {
                        object.remove(field);
                    }
                    if let Some(id) = object
                        .get("attemptId")
                        .and_then(Value::as_str)
                        .and_then(|id| Uuid::parse_str(id).ok())
                    {
                        attempts.insert(id);
                    }
                }
            });
        }
        if attempts.is_empty() {
            return Ok(sessions);
        }
        let charges: Vec<(Uuid, String, Value)> = sqlx::query_as(
            "SELECT a.id,o.model_alias,jsonb_build_object('customerChargeNanos',c.amount_nanos::text,'customerChargeCurrency',c.currency,'customerChargeStatus',CASE WHEN c.attempt_id IS NOT NULL THEN 'charged' WHEN a.dispatched_at IS NULL OR a.execution='confirmed_not_executed' THEN 'not_charged' WHEN EXISTS(SELECT 1 FROM personal_attempt_routes personal WHERE personal.attempt_id=a.id) THEN 'owner_funded' WHEN EXISTS(SELECT 1 FROM customer_attempt_tariffs t WHERE t.attempt_id=a.id) THEN 'pending' ELSE 'unpriced' END) FROM attempts a JOIN operations o ON o.id=a.operation_id AND o.organization_id=a.organization_id AND o.project_id=a.project_id LEFT JOIN customer_charges c ON c.attempt_id=a.id AND c.organization_id=a.organization_id AND c.project_id=a.project_id WHERE a.organization_id=$1 AND a.project_id=$2 AND a.id=ANY($3)")
            .bind(scope.organization_id).bind(scope.project_id).bind(attempts.into_iter().collect::<Vec<_>>())
            .fetch_all(&mut *connection).await?;
        let charges: std::collections::HashMap<_, _> = charges
            .into_iter()
            .map(|(id, model, value)| ((id, model), value))
            .collect();
        for session in &mut sessions {
            visit_results(session, |result| {
                let id = result
                    .get("attemptId")
                    .and_then(Value::as_str)
                    .and_then(|id| Uuid::parse_str(id).ok());
                let model = result.get("model").and_then(Value::as_str);
                if let (Some(id), Some(model)) = (id, model)
                    && let Some(charge) = charges.get(&(id, model.to_owned()))
                {
                    let fields = charge.as_object().unwrap().clone();
                    if let Some(object) = result.as_object_mut() {
                        object.extend(fields);
                    }
                }
            });
        }
        Ok(sessions)
    }

    pub async fn save_chat_session(
        &self,
        scope: TenantScope,
        owner: &str,
        id: Uuid,
        payload: &Value,
    ) -> Result<(), StoreError> {
        sqlx::query("INSERT INTO chat_sessions (id,organization_id,project_id,owner,payload) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (organization_id,project_id,owner,id) DO UPDATE SET payload=EXCLUDED.payload,updated_at=now()")
            .bind(id).bind(scope.organization_id).bind(scope.project_id).bind(owner).bind(payload)
            .execute(&self.pool).await?;
        Ok(())
    }
}
