//! Customer-facing hold inspection, independent from procurement accounting.
use crate::{Store, StoreError};
use serde::Deserialize;
use serde_json::Value;
use uuid::Uuid;

// Internal statement-snapshot inputs. They are removed before returning a
// customer row; only the names of missing quantities cross this boundary.
#[derive(Deserialize)]
struct CategoryDiagnosticInput {
    prompt_tokens: i64,
    cached_input_tokens: Option<i64>,
    cache_write_input_tokens: Option<i64>,
    reasoning_output_tokens: Option<i64>,
    cached_prompt_rate: Option<i64>,
    cache_write_prompt_rate: Option<i64>,
    reasoning_completion_rate: Option<i64>,
    context_tiers: Vec<crate::ContextPriceTier>,
}

impl CategoryDiagnosticInput {
    fn missing(self) -> Result<Value, StoreError> {
        // Reuse settlement's tier selector. A null tier rate does not inherit
        // the base rate, and an explicit zero rate still requires evidence.
        let tier = crate::select_context_tier(&self.context_tiers, self.prompt_tokens)?;
        let categories = [
            (
                "cached_input_tokens",
                self.cached_input_tokens,
                tier.map_or(self.cached_prompt_rate, |tier| tier.cached_prompt),
            ),
            (
                "cache_write_input_tokens",
                self.cache_write_input_tokens,
                tier.map_or(self.cache_write_prompt_rate, |tier| tier.cache_write_prompt),
            ),
            (
                "reasoning_output_tokens",
                self.reasoning_output_tokens,
                tier.map_or(self.reasoning_completion_rate, |tier| {
                    tier.reasoning_completion
                }),
            ),
        ];
        Ok(Value::Array(
            categories
                .into_iter()
                .filter(|(_, quantity, rate)| quantity.is_none() && rate.is_some())
                .map(|(name, _, _)| Value::String(name.into()))
                .collect(),
        ))
    }
}

impl Store {
    /// One statement snapshot per page. A released cursor remains usable because
    /// settlement between reads must not invalidate traversal of older holds.
    pub async fn customer_balance_reservation_page(
        &self,
        organization: Uuid,
        before: Option<Uuid>,
        currency: Option<&str>,
        limit: u32,
    ) -> Result<(Vec<Value>, Option<Uuid>), StoreError> {
        if !(1..=100).contains(&limit)
            || currency.is_some_and(|v| v.len() != 3 || !v.bytes().all(|b| b.is_ascii_uppercase()))
        {
            return Err(StoreError::InvalidPrice);
        }
        let (valid_cursor, rows): (bool, Value) =
            sqlx::query_as(include_str!("balance_reservations.sql"))
                .bind(organization)
                .bind(before)
                .bind(currency)
                .bind(i64::from(limit) + 1)
                .fetch_one(&self.pool)
                .await?;
        if !valid_cursor {
            return Err(StoreError::Conflict);
        }
        let mut entries = rows.as_array().ok_or(StoreError::Conflict)?.clone();
        for entry in &mut entries {
            let fields = entry.as_object_mut().ok_or(StoreError::Conflict)?;
            let diagnostic = fields
                .remove("category_diagnostic_input")
                .ok_or(StoreError::Conflict)?;
            let missing = if diagnostic.is_null() {
                Value::Null
            } else {
                serde_json::from_value::<CategoryDiagnosticInput>(diagnostic)
                    .map_err(|_| StoreError::InvalidPrice)?
                    .missing()?
            };
            fields.insert("missing_usage_categories".into(), missing);
        }
        let next = if entries.len() > limit as usize {
            entries.truncate(limit as usize);
            Some(
                Uuid::parse_str(
                    entries.last().ok_or(StoreError::Conflict)?["attempt_id"]
                        .as_str()
                        .ok_or(StoreError::Conflict)?,
                )
                .map_err(|_| StoreError::Conflict)?,
            )
        } else {
            None
        };
        Ok((entries, next))
    }
}
