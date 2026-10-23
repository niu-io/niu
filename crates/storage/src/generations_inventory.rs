//! Saved-history projections. No key secret, inference grant or Provider calls.
use crate::{Store, StoreError, TenantScope};
use serde_json::{Value, json};
use uuid::Uuid;
const CTE: &str = include_str!("generations_inventory.sql");
const TASK: &str = "jsonb_build_object('id',i.id,'reference',i.public_reference,'kind','video','model',i.model,'model_display_name',i.model_display_name,'model_display_name_source',i.model_display_name_source,'execution_context',i.execution_context,'created_at',i.created_at,'updated_at',i.updated_at,'state',i.state,'source',i.source,'session_id',i.session_id,'turn_id',i.turn_id,'artifacts',coalesce((SELECT jsonb_agg(jsonb_build_object('kind',r.kind,'availability',CASE WHEN r.expires_at<=clock_timestamp() THEN 'expired' WHEN r.deleted_at IS NOT NULL THEN 'deleted' WHEN i.state<>'succeeded' OR r.ciphertext IS NULL THEN 'unavailable' ELSE 'available' END,'capture',(SELECT jsonb_build_object('id',capture.id,'task_id',capture.task_id,'kind',capture.kind,'status',capture.state,'asset_id',capture.asset_id,'availability',CASE WHEN capture.state<>'stored' THEN 'not_stored' WHEN library.deleted_at IS NOT NULL THEN 'deleted' ELSE 'retained' END,'failure_code',capture.failure_category,'created_at',capture.created_at,'updated_at',capture.updated_at) FROM generations_artifact_captures capture LEFT JOIN workspace_asset_library library ON library.organization_id=capture.organization_id AND library.project_id=capture.project_id AND library.id=capture.asset_id WHERE capture.organization_id=$1 AND capture.project_id=$2 AND capture.task_id=i.id AND capture.kind=r.kind ORDER BY CASE WHEN capture.state IN ('stored','preparing') THEN 0 ELSE 1 END,capture.created_at DESC,capture.id DESC LIMIT 1)) ORDER BY r.kind) FROM media_result_references r WHERE r.attempt_id=i.id),'[]'::jsonb))";
const OUTPUT: &str = "jsonb_build_object('task_id',i.id,'kind',i.kind,'name',CASE i.kind WHEN 'video' THEN 'Generated video' ELSE 'Last frame' END,'created_at',i.output_created_at,'content_type',i.content_type,'availability',i.availability,'capture',i.capture,'session_id',i.session_id,'turn_id',i.turn_id,'workspace_id',$2)";
pub struct GenerationsInventoryQuery<'a> {
    pub state: Option<&'a str>,
    pub session_id: Option<Uuid>,
    pub cursor: Option<&'a str>,
    pub limit: i64,
}

impl Store {
    pub async fn generations_inventory(
        &self,
        scope: TenantScope,
        owner: &str,
        query: GenerationsInventoryQuery<'_>,
        outputs: bool,
    ) -> Result<Value, StoreError> {
        let GenerationsInventoryQuery {
            state,
            session_id: session,
            cursor,
            limit,
        } = query;
        if !(1..=100).contains(&limit)
            || state.is_some_and(|s| {
                ![
                    "queued",
                    "running",
                    "succeeded",
                    "failed",
                    "unknown",
                    "submission_unknown",
                    "reconciliation_required",
                ]
                .contains(&s)
            })
        {
            return Err(StoreError::InvalidMediaQuery);
        }
        let (before, kind) = match cursor {
            None => (None, None),
            Some(c) => {
                let (id, k) = if outputs {
                    let (id, k) = c.split_once(':').ok_or(StoreError::InvalidMediaQuery)?;
                    if !["video", "last_frame"].contains(&k) {
                        return Err(StoreError::InvalidMediaQuery);
                    }
                    (id, Some(k))
                } else {
                    (c, None)
                };
                (
                    Some(Uuid::parse_str(id).map_err(|_| StoreError::InvalidMediaQuery)?),
                    k,
                )
            }
        };
        let mut tx = self.begin_bounded_read_snapshot().await?;
        let sql = if outputs {
            format!(
                "{CTE} SELECT ($6::uuid IS NULL OR EXISTS(SELECT 1 FROM all_outputs WHERE id=$6 AND kind=$7)), \
                 ARRAY(SELECT {OUTPUT} FROM outputs i WHERE ($6::uuid IS NULL OR (i.output_created_at,i.id,i.kind)<(SELECT output_created_at,id,kind FROM all_outputs WHERE id=$6 AND kind=$7)) ORDER BY i.output_created_at DESC,i.id DESC,i.kind DESC LIMIT $8)"
            )
        } else {
            format!(
                "{CTE} SELECT ($6::uuid IS NULL OR EXISTS(SELECT 1 FROM inventory WHERE id=$6 AND $7::text IS NULL)), \
                 ARRAY(SELECT {TASK} FROM filtered i WHERE ($6::uuid IS NULL OR (i.created_at,i.id)<(SELECT created_at,id FROM inventory WHERE id=$6)) AND $7::text IS NULL ORDER BY i.created_at DESC,i.id DESC LIMIT $8)"
            )
        };
        let (valid, mut data): (bool, Vec<Value>) = sqlx::query_as(&sql)
            .bind(scope.organization_id)
            .bind(scope.project_id)
            .bind(owner)
            .bind(state)
            .bind(session)
            .bind(before)
            .bind(kind)
            .bind(limit + 1)
            .fetch_one(&mut *tx)
            .await?;
        tx.commit().await?;
        if !valid {
            return Err(StoreError::InvalidMediaQuery);
        }
        let more = data.len() > limit as usize;
        data.truncate(limit as usize);
        // The cursor is derived only from the page's explicit typed identity.
        // A malformed storage projection must fail rather than panic or restart a page.
        let next = if more {
            let row = data.last().ok_or(StoreError::InvalidMediaQuery)?;
            let id = row[if outputs { "task_id" } else { "id" }]
                .as_str()
                .ok_or(StoreError::InvalidMediaQuery)?;
            Some(if outputs {
                let kind = row["kind"].as_str().ok_or(StoreError::InvalidMediaQuery)?;
                format!("{id}:{kind}")
            } else {
                id.to_owned()
            })
        } else {
            None
        };
        Ok(
            json!({"data":data,"has_more":more,"next_cursor":next,"supported_kinds":["video"],"complete":true}),
        )
    }
    /// Resolves only within the authorized workspace; generation_task performs
    /// the same actor-private visibility check as UUID-based saved-history reads.
    pub async fn generation_task_by_reference(
        &self,
        scope: TenantScope,
        owner: &str,
        reference: &str,
    ) -> Result<Option<Value>, StoreError> {
        let id: Option<Uuid> = sqlx::query_scalar("SELECT id FROM attempts WHERE organization_id=$1 AND project_id=$2 AND public_reference=$3")
            .bind(scope.organization_id).bind(scope.project_id).bind(reference)
            .fetch_optional(&self.pool).await?;
        match id {
            Some(id) => self.generation_task(scope, owner, id).await,
            None => Ok(None),
        }
    }

    /// A workspace-readable saved copy does not make its actor-private source public.
    pub async fn workspace_asset_sources(
        &self,
        scope: TenantScope,
        owner: &str,
        assets: &[Uuid],
    ) -> Result<std::collections::HashMap<Uuid, Value>, StoreError> {
        if assets.is_empty() {
            return Ok(std::collections::HashMap::new());
        }
        let sql = format!(
            "{CTE} SELECT c.asset_id, jsonb_build_object('reference',i.public_reference,'kind','video','output',c.kind,'model',i.model,'created_at',i.created_at) FROM generations_artifact_captures c JOIN filtered i ON i.id=c.task_id WHERE c.organization_id=$1 AND c.project_id=$2 AND c.state='stored' AND c.asset_id=ANY($6)"
        );
        let rows: Vec<(Uuid, Value)> = sqlx::query_as(&sql)
            .bind(scope.organization_id)
            .bind(scope.project_id)
            .bind(owner)
            .bind(None::<String>)
            .bind(None::<Uuid>)
            .bind(assets)
            .fetch_all(&self.pool)
            .await?;
        Ok(rows.into_iter().collect())
    }

    pub async fn generation_task(
        &self,
        scope: TenantScope,
        owner: &str,
        id: Uuid,
    ) -> Result<Option<Value>, StoreError> {
        let sql = format!("{CTE} SELECT {TASK} FROM filtered i WHERE i.id=$6");
        let mut tx = self.begin_bounded_read_snapshot().await?;
        let result = sqlx::query_scalar(&sql)
            .bind(scope.organization_id)
            .bind(scope.project_id)
            .bind(owner)
            .bind(None::<String>)
            .bind(None::<Uuid>)
            .bind(id)
            .fetch_optional(&mut *tx)
            .await?;
        tx.commit().await?;
        Ok(result)
    }
    pub async fn generation_artifact(
        &self,
        scope: TenantScope,
        owner: &str,
        id: Uuid,
        kind: &str,
    ) -> Result<Option<Value>, StoreError> {
        if !["video", "last_frame"].contains(&kind) {
            return Err(StoreError::InvalidMediaQuery);
        }
        let sql = format!("{CTE} SELECT {OUTPUT} FROM outputs i WHERE i.id=$6 AND i.kind=$7");
        let mut tx = self.begin_bounded_read_snapshot().await?;
        let result = sqlx::query_scalar(&sql)
            .bind(scope.organization_id)
            .bind(scope.project_id)
            .bind(owner)
            .bind(None::<String>)
            .bind(None::<Uuid>)
            .bind(id)
            .bind(kind)
            .fetch_optional(&mut *tx)
            .await?;
        tx.commit().await?;
        Ok(result)
    }
}
