//! Explicit, immutable Credits-denominated text prices. Purchase conversion and
//! Provider procurement prices never participate in consumption calculation.
use crate::{ContextPriceTier, OperatorAuditActor, Store, StoreError, TokenRates};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use uuid::Uuid;

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct CustomerUnitTextPrice {
    pub prompt_rate: String,
    pub completion_rate: String,
    pub cached_prompt_rate: Option<String>,
    pub cache_write_prompt_rate: Option<String>,
    pub reasoning_completion_rate: Option<String>,
    pub request_fee_atoms: String,
    pub minimum_charge_atoms: String,
    pub context_tiers: Vec<ContextPriceTier>,
}

impl CustomerUnitTextPrice {
    pub fn normalize(&mut self) -> Result<(), StoreError> {
        fn rate(value: &mut String) -> Result<(), StoreError> {
            *value = crate::pricing::parse_token_rate(value)?.to_string();
            Ok(())
        }
        fn optional(value: &mut Option<String>) -> Result<(), StoreError> {
            if let Some(value) = value {
                rate(value)?;
            }
            Ok(())
        }
        rate(&mut self.prompt_rate)?;
        rate(&mut self.completion_rate)?;
        optional(&mut self.cached_prompt_rate)?;
        optional(&mut self.cache_write_prompt_rate)?;
        optional(&mut self.reasoning_completion_rate)?;
        rate(&mut self.request_fee_atoms)?;
        rate(&mut self.minimum_charge_atoms)?;
        crate::normalize_context_tiers(&mut self.context_tiers)?;
        for tier in &mut self.context_tiers {
            rate(&mut tier.prompt_rate)?;
            rate(&mut tier.completion_rate)?;
            optional(&mut tier.cached_prompt_rate)?;
            optional(&mut tier.cache_write_prompt_rate)?;
            optional(&mut tier.reasoning_completion_rate)?;
        }
        Ok(())
    }

    /// Exact atom bound across every reachable whole-request context schedule.
    /// Caller must independently qualify the token bounds before dispatch.
    pub fn reservation_atoms(&self, input: i64, output: i64) -> Result<i64, StoreError> {
        let prompt = crate::pricing::parse_token_rate(&self.prompt_rate)?;
        let completion = crate::pricing::parse_token_rate(&self.completion_rate)?;
        let optional = |value: &Option<String>, fallback| {
            value
                .as_deref()
                .map(crate::pricing::parse_token_rate)
                .transpose()
                .map(|r| r.unwrap_or(fallback))
        };
        let rates = TokenRates {
            prompt: prompt
                .max(optional(&self.cached_prompt_rate, prompt)?)
                .max(optional(&self.cache_write_prompt_rate, prompt)?),
            completion: completion.max(optional(&self.reasoning_completion_rate, completion)?),
        };
        crate::pricing::customer_charge_with_fixed(
            crate::context_token_reservation(
                rates.charge(input, output)?,
                &self.context_tiers,
                input,
                output,
            )?,
            crate::pricing::parse_token_rate(&self.request_fee_atoms)?,
            crate::pricing::parse_token_rate(&self.minimum_charge_atoms)?,
        )
    }

    /// Reported subsets must be supplied when the selected price distinguishes
    /// them. Missing categories remain unresolved, never silently free or flat.
    pub fn charge_atoms(
        &self,
        input: i64,
        output: i64,
        cached: Option<i64>,
        written: Option<i64>,
        reasoning: Option<i64>,
    ) -> Result<i64, StoreError> {
        let selected = crate::select_context_tier(&self.context_tiers, input)?;
        let rates = match selected {
            Some(tier) => tier.ordinary,
            None => TokenRates {
                prompt: crate::pricing::parse_token_rate(&self.prompt_rate)?,
                completion: crate::pricing::parse_token_rate(&self.completion_rate)?,
            },
        };
        let base_optional = |value: &Option<String>| {
            value
                .as_deref()
                .map(crate::pricing::parse_token_rate)
                .transpose()
        };
        let category =
            |rate: Option<i64>, tokens: Option<i64>| -> Result<Option<(i64, i64)>, StoreError> {
                rate.map(|rate| {
                    tokens
                        .map(|tokens| (tokens, rate))
                        .ok_or(StoreError::Unresolved)
                })
                .transpose()
            };
        let (cached_rate, written_rate, reasoning_rate) = match selected {
            Some(tier) => (
                tier.cached_prompt,
                tier.cache_write_prompt,
                tier.reasoning_completion,
            ),
            None => (
                base_optional(&self.cached_prompt_rate)?,
                base_optional(&self.cache_write_prompt_rate)?,
                base_optional(&self.reasoning_completion_rate)?,
            ),
        };
        crate::pricing::customer_charge_with_fixed(
            rates.charge_with_cache_write(
                input,
                output,
                category(cached_rate, cached)?,
                category(written_rate, written)?,
                category(reasoning_rate, reasoning)?,
            )?,
            crate::pricing::parse_token_rate(&self.request_fee_atoms)?,
            crate::pricing::parse_token_rate(&self.minimum_charge_atoms)?,
        )
    }
}

pub struct CustomerUnitTextTariffInput<'a> {
    pub model_alias: &'a str,
    pub definition_revision: i64,
    pub expected_revision: i64,
    pub idempotency_key: Uuid,
    pub price: CustomerUnitTextPrice,
}

impl Store {
    pub async fn customer_unit_text_tariff(
        &self,
        model: &str,
    ) -> Result<Option<Value>, StoreError> {
        Ok(
            sqlx::query_scalar(include_str!("customer_unit_text_tariff.sql"))
                .bind(model)
                .fetch_optional(&self.pool)
                .await?,
        )
    }

    pub async fn publish_customer_unit_text_tariff(
        &self,
        mut input: CustomerUnitTextTariffInput<'_>,
        actor: OperatorAuditActor,
    ) -> Result<Value, StoreError> {
        if input.model_alias.is_empty()
            || input.model_alias.chars().count() > 200
            || input.model_alias.trim() != input.model_alias
            || input.model_alias.chars().any(char::is_control)
            || input.definition_revision <= 0
            || input.expected_revision < 0
        {
            return Err(StoreError::InvalidCustomerUnit);
        }
        input.price.normalize()?;
        let price = serde_json::to_value(&input.price).map_err(|_| StoreError::InvalidPrice)?;
        let mut tx = self.begin_bounded_recording().await?;
        let current: i64 = sqlx::query_scalar(
            "SELECT revision FROM customer_unit_configuration WHERE singleton FOR UPDATE",
        )
        .fetch_one(&mut *tx)
        .await?;
        if let OperatorAuditActor::Operator(id) = actor {
            sqlx::query("SELECT id FROM admin_operators WHERE id=$1 AND platform_admin AND revoked_at IS NULL FOR SHARE")
                .bind(id).fetch_optional(&mut *tx).await?.ok_or(StoreError::Unauthorized)?;
        }
        let previous: Option<(i64,i64,i64,String,Value)> = sqlx::query_as("SELECT revision,expected_revision,definition_revision,model_alias,price FROM customer_unit_text_tariffs WHERE idempotency_key=$1")
            .bind(input.idempotency_key).fetch_optional(&mut *tx).await?;
        if let Some((revision, expected, definition, model, old_price)) = previous {
            if expected != input.expected_revision
                || definition != input.definition_revision
                || model != input.model_alias
                || old_price != price
            {
                return Err(StoreError::Conflict);
            }
            return Ok(
                json!({"revision":revision.to_string(),"definition_revision":definition.to_string(),"model_alias":model,"price":old_price}),
            );
        }
        let latest: Option<i64> =
            sqlx::query_scalar("SELECT max(revision) FROM customer_unit_definitions")
                .fetch_one(&mut *tx)
                .await?;
        if current != input.expected_revision || latest != Some(input.definition_revision) {
            return Err(StoreError::Conflict);
        }
        let next = current.checked_add(1).ok_or(StoreError::Conflict)?;
        let (kind, operator) = actor.kind_and_id();
        sqlx::query("INSERT INTO customer_unit_text_tariffs(revision,expected_revision,definition_revision,model_alias,price,idempotency_key,actor_kind,actor_operator_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)")
            .bind(next).bind(current).bind(input.definition_revision).bind(input.model_alias).bind(&price)
            .bind(input.idempotency_key).bind(kind).bind(operator).execute(&mut *tx).await?;
        sqlx::query("UPDATE customer_unit_configuration SET revision=$1 WHERE singleton")
            .bind(next)
            .execute(&mut *tx)
            .await?;
        tx.commit().await?;
        Ok(
            json!({"revision":next.to_string(),"definition_revision":input.definition_revision.to_string(),"model_alias":input.model_alias,"price":price}),
        )
    }
}
