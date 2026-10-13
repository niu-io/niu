//! Read-only bridge of existing Chat comparison branches into Generations.
//! Legacy writes and retention remain owned by the existing Chat contract.
use crate::{Store, StoreError, TenantScope};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use uuid::Uuid;

impl Store {
    pub async fn generations_chat_session_page(
        &self,
        scope: TenantScope,
        owner: &str,
        before: Option<Uuid>,
        limit: i64,
        archived: bool,
    ) -> Result<Vec<Value>, StoreError> {
        if !(1..=100).contains(&limit) {
            return Err(StoreError::InvalidGenerationsInput);
        }
        let mut tx = self.begin_bounded_read_snapshot().await?;
        if let Some(id) = before {
            let exists:bool=sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM chat_sessions WHERE organization_id=$1 AND project_id=$2 AND owner=$3 AND id=$4)")
                .bind(scope.organization_id).bind(scope.project_id).bind(owner).bind(id).fetch_one(&mut *tx).await?;
            if !exists {
                return Err(StoreError::InvalidGenerationsInput);
            }
        }
        let data = sqlx::query_scalar(include_str!("generations_chat_session_page.sql"))
            .bind(scope.organization_id)
            .bind(scope.project_id)
            .bind(owner)
            .bind(archived)
            .bind(before)
            .bind(limit + 1)
            .fetch_all(&mut *tx)
            .await?;
        tx.commit().await?;
        Ok(data)
    }
    pub async fn generations_chat_session(
        &self,
        scope: TenantScope,
        owner: &str,
        id: Uuid,
    ) -> Result<Option<Value>, StoreError> {
        let mut tx = self.begin_bounded_read_snapshot().await?;
        let metadata: Option<(Value, i64)> =
            sqlx::query_as(include_str!("generations_chat_sessions.sql"))
                .bind(scope.organization_id)
                .bind(scope.project_id)
                .bind(owner)
                .bind(id)
                .fetch_optional(&mut *tx)
                .await?;
        let Some((mut summary, bytes)) = metadata else {
            tx.commit().await?;
            return Ok(None);
        };
        if bytes > 32 * 1024 * 1024 {
            return Err(StoreError::ChatHistoryCapacityExceeded);
        }
        let archived = summary["archived"]
            .as_bool()
            .ok_or(StoreError::InvalidGenerationsInput)?;
        let payloads = Self::load_chat_payloads(&mut tx, scope, owner, archived, vec![id]).await?;
        let mut payloads = Self::hydrate_chat_charges(&mut tx, scope, payloads).await?;
        let Some(payload) = payloads.pop() else {
            return Err(StoreError::Conflict);
        };
        // A saved turns array already represents the entire conversation. Only
        // legacy single-turn payloads without that array use the top-level turn.
        let saved: Vec<&Value> = match payload.get("turns").and_then(Value::as_array) {
            Some(turns) => turns.iter().collect(),
            None => vec![&payload],
        };
        let attempt_ids: Vec<Uuid> = saved
            .iter()
            .flat_map(|turn| {
                turn.get("results")
                    .and_then(Value::as_array)
                    .into_iter()
                    .flatten()
            })
            .filter_map(|branch| {
                branch
                    .get("attemptId")
                    .and_then(Value::as_str)
                    .and_then(|value| Uuid::parse_str(value).ok())
            })
            .collect();
        let attempts:Vec<(Uuid,String,String)>=sqlx::query_as("SELECT a.id,o.model_alias,a.execution FROM attempts a JOIN operations o ON o.id=a.operation_id AND o.organization_id=a.organization_id AND o.project_id=a.project_id WHERE a.organization_id=$1 AND a.project_id=$2 AND a.id=ANY($3)")
            .bind(scope.organization_id).bind(scope.project_id).bind(attempt_ids).fetch_all(&mut *tx).await?;
        let attempts: HashMap<_, _> = attempts
            .into_iter()
            .map(|(id, model, execution)| ((id, model), execution))
            .collect();
        let mut turns = Vec::with_capacity(saved.len());
        for (index, turn) in saved.iter().enumerate() {
            let prompt = turn.get("prompt").and_then(Value::as_str);
            let instruction=prompt.map(|prompt|{
                let mut value=json!({"kind":"chat","prompt":prompt});
                if let Some(attachments)=turn.get("attachments").and_then(Value::as_array){
                    value["attachments"]=json!(attachments.iter().filter_map(|attachment|{
                        Some(json!({"name":attachment.get("name")?.as_str()?,"type":attachment.get("type")?.as_str()?,"content":attachment.get("content")?.as_str()?}))
                    }).collect::<Vec<_>>());
                }
                value
            });
            // Derived references are read-only, not identities for mutable Chat
            // turns. Comparison output updates do not change this reference.
            let mut identity = Sha256::new();
            identity.update(scope.organization_id.as_bytes());
            identity.update(scope.project_id.as_bytes());
            identity.update(owner.as_bytes());
            identity.update(id.as_bytes());
            identity.update((index as u64 + 1).to_be_bytes());
            identity.update(
                serde_json::to_vec(&instruction)
                    .map_err(|_| StoreError::InvalidGenerationsInput)?,
            );
            let reference = format!("chat-turn:{:x}", identity.finalize());
            let mut branches = Vec::new();
            for branch in turn
                .get("results")
                .and_then(Value::as_array)
                .into_iter()
                .flatten()
            {
                let mut projected = serde_json::Map::new();
                // Saved comparison phase is client content, never an execution
                // claim. The independent task field requires ledger identity.
                for key in [
                    "model",
                    "content",
                    "elapsedMs",
                    "phase",
                    "promptTokens",
                    "completionTokens",
                    "totalTokens",
                    "error",
                    "customerChargeNanos",
                    "customerChargeCurrency",
                    "customerChargeStatus",
                ] {
                    if let Some(value) = branch.get(key) {
                        // Legacy writes did not validate every optional field.
                        // Keep only declared scalars, never arbitrary nested data.
                        let valid = match key {
                            "model" | "content" => value.is_string(),
                            "elapsedMs" => value.is_number(),
                            "promptTokens" | "completionTokens" | "totalTokens" => {
                                value.is_null() || value.is_number()
                            }
                            "phase" => value.as_str().is_some_and(|phase| {
                                ["connecting", "streaming", "complete", "failed", "cancelled"]
                                    .contains(&phase)
                            }),
                            "customerChargeStatus" => value.as_str().is_some_and(|status| {
                                [
                                    "charged",
                                    "owner_funded",
                                    "pending",
                                    "unpriced",
                                    "not_charged",
                                    "unknown",
                                ]
                                .contains(&status)
                            }),
                            _ => value.is_null() || value.is_string(),
                        };
                        if valid {
                            projected.insert(key.into(), value.clone());
                        }
                    }
                }
                let task = branch
                    .get("attemptId")
                    .and_then(Value::as_str)
                    .and_then(|value| Uuid::parse_str(value).ok())
                    .zip(branch.get("model").and_then(Value::as_str));
                let task=task.and_then(|(attempt,model)|attempts.get(&(attempt,model.to_owned())).map(|execution|json!({"id":attempt,"kind":"chat","model":model,"execution":execution})));
                projected.insert("task".into(), task.unwrap_or(Value::Null));
                branches.push(Value::Object(projected));
            }
            turns.push(json!({"id":reference,"kind":"chat","sequence":(index+1).to_string(),"created_at":null,"content_state":if instruction.is_some(){"retained"}else{"missing"},"instruction":instruction,"content_expires_at":null,"branches":branches}));
        }
        summary["turns"] = json!(turns);
        tx.commit().await?;
        Ok(Some(summary))
    }
}
