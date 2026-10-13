//! Saved-history projections. No key secret, inference grant or Provider calls.
use crate::{Store, StoreError, TenantScope};
use serde_json::{Value, json};
use uuid::Uuid;
const CTE: &str = include_str!("generations_inventory.sql");
const TASK: &str = "jsonb_build_object('id',i.id,'kind','video','model',i.model,'model_display_name',i.model_display_name,'model_display_name_source',i.model_display_name_source,'execution_context',i.execution_context,'created_at',i.created_at,'updated_at',i.updated_at,'state',i.state,'source',i.source,'session_id',i.session_id,'turn_id',i.turn_id,'artifacts',coalesce((SELECT jsonb_agg(jsonb_build_object('kind',kind,'availability',availability) ORDER BY kind) FROM outputs WHERE id=i.id),'[]'::jsonb))";
const OUTPUT: &str = "jsonb_build_object('task_id',i.id,'kind',i.kind,'name',CASE i.kind WHEN 'video' THEN 'Generated video' ELSE 'Last frame' END,'created_at',i.output_created_at,'content_type',NULL,'availability',i.availability,'session_id',i.session_id,'turn_id',i.turn_id,'workspace_id',$2)";
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
        if let Some(id) = before {
            let sql = format!(
                "{CTE} SELECT EXISTS(SELECT 1 FROM {} WHERE id=$6 {})",
                if outputs { "all_outputs" } else { "inventory" },
                if outputs {
                    "AND kind=$7"
                } else {
                    "AND $7::text IS NULL"
                }
            );
            let valid: bool = sqlx::query_scalar(&sql)
                .bind(scope.organization_id)
                .bind(scope.project_id)
                .bind(owner)
                .bind(state)
                .bind(session)
                .bind(id)
                .bind(kind)
                .fetch_one(&mut *tx)
                .await?;
            if !valid {
                return Err(StoreError::InvalidMediaQuery);
            }
        }
        let sql = if outputs {
            format!(
                "{CTE} SELECT {OUTPUT} FROM outputs i WHERE ($6::uuid IS NULL OR (i.output_created_at,i.id,i.kind)<(SELECT output_created_at,id,kind FROM all_outputs WHERE id=$6 AND kind=$7)) ORDER BY i.output_created_at DESC,i.id DESC,i.kind DESC LIMIT $8"
            )
        } else {
            format!(
                "{CTE} SELECT {TASK} FROM filtered i WHERE ($6::uuid IS NULL OR (i.created_at,i.id)<(SELECT created_at,id FROM inventory WHERE id=$6)) AND $7::text IS NULL ORDER BY i.created_at DESC,i.id DESC LIMIT $8"
            )
        };
        let mut data: Vec<Value> = sqlx::query_scalar(&sql)
            .bind(scope.organization_id)
            .bind(scope.project_id)
            .bind(owner)
            .bind(state)
            .bind(session)
            .bind(before)
            .bind(kind)
            .bind(limit + 1)
            .fetch_all(&mut *tx)
            .await?;
        tx.commit().await?;
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
