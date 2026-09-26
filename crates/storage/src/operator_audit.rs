use serde::Serialize;
use sqlx::FromRow;
use uuid::Uuid;

use crate::{OperatorScope, Store, StoreError};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum OperatorAuditActor {
    Installation,
    Operator(Uuid),
}

impl OperatorAuditActor {
    fn kind_and_id(self) -> (&'static str, Option<Uuid>) {
        match self {
            Self::Installation => ("installation", None),
            Self::Operator(id) => ("operator", Some(id)),
        }
    }
}

#[derive(Clone, Debug, Serialize)]
pub struct OperatorAuditEvent {
    pub id: Uuid,
    pub action: String,
    pub actor_kind: String,
    pub actor_operator_id: Option<Uuid>,
    pub target_operator_id: Uuid,
    pub target_session_id: Option<Uuid>,
    pub organization_id: Uuid,
    pub project_id: Option<Uuid>,
    pub created_at: String,
}

#[derive(Clone, Debug, Serialize)]
pub struct OperatorAuditPage {
    pub data: Vec<OperatorAuditEvent>,
    pub next_cursor: Option<Uuid>,
}

#[derive(FromRow)]
struct AuditEventRow {
    id: Uuid,
    action: String,
    actor_kind: String,
    actor_operator_id: Option<Uuid>,
    target_operator_id: Uuid,
    target_session_id: Option<Uuid>,
    organization_id: Uuid,
    project_id: Option<Uuid>,
    created_at: String,
}

impl From<AuditEventRow> for OperatorAuditEvent {
    fn from(row: AuditEventRow) -> Self {
        Self {
            id: row.id,
            action: row.action,
            actor_kind: row.actor_kind,
            actor_operator_id: row.actor_operator_id,
            target_operator_id: row.target_operator_id,
            target_session_id: row.target_session_id,
            organization_id: row.organization_id,
            project_id: row.project_id,
            created_at: row.created_at,
        }
    }
}

impl Store {
    pub async fn operator_audit_events(
        &self,
        target_operator_id: Uuid,
        cursor: Option<Uuid>,
        limit: i64,
    ) -> Result<OperatorAuditPage, StoreError> {
        if !(1..=100).contains(&limit) {
            return Err(StoreError::InvalidOperatorAuditQuery);
        }
        if let Some(cursor) = cursor {
            let belongs: bool = sqlx::query_scalar(
                "SELECT EXISTS(SELECT 1 FROM operator_audit_events WHERE id=$1 AND target_operator_id=$2)",
            )
            .bind(cursor)
            .bind(target_operator_id)
            .fetch_one(&self.pool)
            .await?;
            if !belongs {
                return Err(StoreError::InvalidOperatorAuditQuery);
            }
        }

        let rows: Vec<AuditEventRow> = sqlx::query_as(
            "SELECT e.id, e.action, e.actor_kind, e.actor_operator_id, e.target_operator_id, \
             e.target_session_id, e.organization_id, e.project_id, \
             to_char(e.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') AS created_at \
             FROM operator_audit_events e WHERE e.target_operator_id=$1 \
             AND ($2::uuid IS NULL OR EXISTS (SELECT 1 FROM operator_audit_events c \
                 WHERE c.id=$2 AND c.target_operator_id=$1 \
                 AND (e.created_at,e.id)<(c.created_at,c.id))) \
             ORDER BY e.created_at DESC, e.id DESC LIMIT $3",
        )
        .bind(target_operator_id)
        .bind(cursor)
        .bind(limit + 1)
        .fetch_all(&self.pool)
        .await?;
        let mut data = rows
            .into_iter()
            .map(OperatorAuditEvent::from)
            .collect::<Vec<_>>();
        let has_more = data.len() > limit as usize;
        if has_more {
            data.pop();
        }
        let next_cursor = has_more
            .then(|| data.last().map(|event| event.id))
            .flatten();
        Ok(OperatorAuditPage { data, next_cursor })
    }
}

pub(super) async fn insert_operator_audit_event(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    actor: OperatorAuditActor,
    action: &'static str,
    target_operator_id: Uuid,
    target_session_id: Option<Uuid>,
    scope: OperatorScope,
) -> Result<(), StoreError> {
    let (actor_kind, actor_operator_id) = actor.kind_and_id();
    sqlx::query(
        "INSERT INTO operator_audit_events \
         (id,action,actor_kind,actor_operator_id,target_operator_id,target_session_id,organization_id,project_id) \
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
    )
    .bind(Uuid::new_v4())
    .bind(action)
    .bind(actor_kind)
    .bind(actor_operator_id)
    .bind(target_operator_id)
    .bind(target_session_id)
    .bind(scope.organization_id)
    .bind(scope.project_id)
    .execute(&mut **tx)
    .await?;
    Ok(())
}
