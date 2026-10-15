//! Read-only bridge of existing Chat comparison branches into Generations.
//! Legacy writes and retention remain owned by the existing Chat contract.
use crate::{Store, StoreError, TenantScope};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use uuid::Uuid;

struct Sha256Writer<'a>(&'a mut Sha256);

impl std::io::Write for Sha256Writer<'_> {
    fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
        self.0.update(buf);
        Ok(buf.len())
    }

    fn flush(&mut self) -> std::io::Result<()> {
        Ok(())
    }
}

fn project_generations_chat_session(
    scope: TenantScope,
    owner: &str,
    id: Uuid,
    mut summary: Value,
    mut payload: Value,
    attempts: HashMap<(Uuid, String), String>,
) -> Result<Value, StoreError> {
    // A saved turns array already represents the entire conversation. Only
    // legacy single-turn payloads without that array use the top-level turn.
    let saved: Vec<Value> = match payload.as_object_mut().and_then(|obj| obj.remove("turns")) {
        Some(Value::Array(turns)) => turns,
        Some(other) => {
            if let Some(obj) = payload.as_object_mut() {
                obj.insert("turns".into(), other);
            }
            vec![payload]
        }
        None => vec![payload],
    };
    let mut turns = Vec::with_capacity(saved.len());
    for (index, mut turn) in saved.into_iter().enumerate() {
        let turn_obj = turn.as_object_mut();
        let prompt = turn_obj
            .as_deref()
            .and_then(|obj| obj.get("prompt"))
            .and_then(Value::as_str)
            .map(str::to_owned);
        let instruction = prompt.map(|prompt| {
            let mut value = json!({"kind":"chat","prompt":prompt});
            if let Some(Value::Array(attachments)) = turn
                .as_object_mut()
                .and_then(|obj| obj.remove("attachments"))
            {
                value["attachments"] = Value::Array(
                    attachments
                        .into_iter()
                        .filter_map(|mut attachment| {
                            let obj = attachment.as_object_mut()?;
                            let name = match obj.remove("name")? {
                                Value::String(s) => Value::String(s),
                                _ => return None,
                            };
                            let kind = match obj.remove("type")? {
                                Value::String(s) => Value::String(s),
                                _ => return None,
                            };
                            let content = match obj.remove("content")? {
                                Value::String(s) => Value::String(s),
                                _ => return None,
                            };
                            let mut item = serde_json::Map::with_capacity(3);
                            item.insert("name".into(), name);
                            item.insert("type".into(), kind);
                            item.insert("content".into(), content);
                            Some(Value::Object(item))
                        })
                        .collect(),
                );
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
        serde_json::to_writer(Sha256Writer(&mut identity), &instruction)
            .map_err(|_| StoreError::InvalidGenerationsInput)?;
        let reference = format!("chat-turn:{:x}", identity.finalize());
        let results = turn
            .as_object_mut()
            .and_then(|obj| obj.remove("results"))
            .and_then(|v| match v {
                Value::Array(arr) => Some(arr),
                _ => None,
            })
            .unwrap_or_default();
        let mut branches = Vec::with_capacity(results.len());
        for mut branch in results {
            let mut projected = serde_json::Map::new();
            let attempt_and_model = branch
                .get("attemptId")
                .and_then(Value::as_str)
                .and_then(|value| Uuid::parse_str(value).ok())
                .zip(
                    branch
                        .get("model")
                        .and_then(Value::as_str)
                        .map(str::to_owned),
                );
            // Saved comparison phase is client content, never an execution
            // claim. The independent task field requires ledger identity.
            if let Some(branch_obj) = branch.as_object_mut() {
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
                    if let Some(value) = branch_obj.remove(key) {
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
                            projected.insert(key.into(), value);
                        }
                    }
                }
            }
            let task = attempt_and_model.and_then(|(attempt, model)| {
                attempts
                    .get(&(attempt, model.clone()))
                    .map(|execution| json!({"id":attempt,"kind":"chat","model":model,"execution":execution}))
            });
            projected.insert("task".into(), task.unwrap_or(Value::Null));
            branches.push(Value::Object(projected));
        }
        turns.push(json!({"id":reference,"kind":"chat","sequence":(index+1).to_string(),"created_at":null,"content_state":if instruction.is_some(){"retained"}else{"missing"},"instruction":instruction,"content_expires_at":null,"branches":branches}));
    }
    summary["turns"] = Value::Array(turns);
    Ok(summary)
}

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
        let Some((summary, bytes)) = metadata else {
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
        let (mut payloads, attempts) =
            Self::hydrate_chat_charges_and_executions(&mut tx, scope, payloads).await?;
        let Some(payload) = payloads.pop() else {
            return Err(StoreError::Conflict);
        };
        tx.commit().await?;
        let projected = if bytes >= 64 * 1024 {
            let owner = owner.to_owned();
            tokio::task::spawn_blocking(move || {
                project_generations_chat_session(scope, &owner, id, summary, payload, attempts)
            })
            .await
            .map_err(|_| StoreError::Conflict)??
        } else {
            project_generations_chat_session(scope, owner, id, summary, payload, attempts)?
        };
        Ok(Some(projected))
    }
}
