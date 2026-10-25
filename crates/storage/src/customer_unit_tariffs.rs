//! Explicit, immutable Credits-denominated text and media prices. Purchase conversion and
//! Provider procurement prices never participate in consumption calculation.
use crate::{ContextPriceTier, OperatorAuditActor, Store, StoreError, TokenRates};
use niu_metered_cost::{Dimensions, Quantity, Receipt, Rounding, Tariff, Usage};
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

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct CustomerUnitMediaPrice {
    pub dimensions: Dimensions,
    pub meter: String,
    pub amount_atoms: String,
    pub per_quantity: Quantity,
    pub minimum_quantity: Quantity,
    pub rounding: Rounding,
}

impl CustomerUnitMediaPrice {
    pub fn parsed_amount(&self) -> Result<u64, StoreError> {
        if self.amount_atoms.is_empty() || !self.amount_atoms.bytes().all(|b| b.is_ascii_digit()) {
            return Err(StoreError::InvalidPrice);
        }
        let amount: u64 = self
            .amount_atoms
            .parse()
            .map_err(|_| StoreError::InvalidPrice)?;
        i64::try_from(amount).map_err(|_| StoreError::InvalidPrice)?;
        Ok(amount)
    }

    pub fn to_tariff(&self, revision: &str) -> Result<Tariff, StoreError> {
        if self.meter != "video_tokens" {
            return Err(StoreError::InvalidPrice);
        }
        let tariff = Tariff {
            revision: revision.into(),
            dimensions: self.dimensions.clone(),
            meter: self.meter.clone(),
            currency: "CRD".into(),
            decimal_places: 9,
            amount_units: self.parsed_amount()?,
            per_quantity: self.per_quantity,
            minimum_quantity: self.minimum_quantity,
            rounding: self.rounding,
            effective_from: 0,
            effective_until: None,
        };
        tariff.validate().map_err(|_| StoreError::InvalidPrice)?;
        Ok(tariff)
    }

    pub fn normalize(&mut self) -> Result<(), StoreError> {
        self.to_tariff("validation")?;
        self.amount_atoms = self.parsed_amount()?.to_string();
        Ok(())
    }

    pub fn calculate_atoms(
        &self,
        revision: &str,
        usage: &Usage,
    ) -> Result<(i64, Receipt), StoreError> {
        let tariff = self.to_tariff(revision)?;
        let receipt =
            niu_metered_cost::calculate(&tariff, usage).map_err(|_| StoreError::InvalidPrice)?;
        let atoms = i64::try_from(receipt.amount_units).map_err(|_| StoreError::InvalidPrice)?;
        Ok((atoms, receipt))
    }
}

pub struct CustomerUnitMediaTariffInput<'a> {
    pub model_alias: &'a str,
    pub definition_revision: i64,
    pub expected_revision: i64,
    pub idempotency_key: Uuid,
    pub price: CustomerUnitMediaPrice,
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

    pub async fn customer_unit_media_tariff(
        &self,
        dimensions: &Dimensions,
    ) -> Result<Option<Value>, StoreError> {
        Ok(sqlx::query_scalar(
            "SELECT jsonb_build_object(
                'revision', revision::text,
                'definition_revision', definition_revision::text,
                'model_alias', model_alias,
                'channel', channel,
                'resolution', resolution,
                'reference_video', reference_video,
                'meter', meter,
                'price', price
            )
            FROM customer_unit_media_tariffs
            WHERE model_alias = $1 AND channel = $2 AND resolution = $3 AND reference_video = $4
            ORDER BY revision DESC
            LIMIT 1",
        )
        .bind(&dimensions.model)
        .bind(&dimensions.channel)
        .bind(&dimensions.resolution)
        .bind(dimensions.reference_video)
        .fetch_optional(&self.pool)
        .await?)
    }

    pub async fn customer_unit_media_tariffs(
        &self,
        model: Option<&str>,
    ) -> Result<Value, StoreError> {
        let rows: Vec<Value> = sqlx::query_scalar(
            "SELECT jsonb_build_object(
                'revision', t.revision::text,
                'definition_revision', t.definition_revision::text,
                'model_alias', t.model_alias,
                'channel', t.channel,
                'resolution', t.resolution,
                'reference_video', t.reference_video,
                'meter', t.meter,
                'price', t.price
            )
            FROM (
                SELECT DISTINCT ON (model_alias, channel, resolution, reference_video)
                    revision, definition_revision, model_alias, channel, resolution, reference_video, meter, price
                FROM customer_unit_media_tariffs
                WHERE ($1::text IS NULL OR model_alias = $1)
                ORDER BY model_alias, channel, resolution, reference_video, revision DESC
            ) t
            ORDER BY t.model_alias, t.channel, t.resolution, t.reference_video",
        )
        .bind(model)
        .fetch_all(&self.pool)
        .await?;
        Ok(json!({ "data": rows }))
    }

    pub async fn publish_customer_unit_media_tariff(
        &self,
        mut input: CustomerUnitMediaTariffInput<'_>,
        actor: OperatorAuditActor,
    ) -> Result<Value, StoreError> {
        if input.model_alias.is_empty()
            || input.model_alias.chars().count() > 200
            || input.model_alias.trim() != input.model_alias
            || input.model_alias.chars().any(char::is_control)
            || input.definition_revision <= 0
            || input.expected_revision < 0
            || input.price.dimensions.model != input.model_alias
            || input.price.dimensions.channel.chars().count() > 200
            || input.price.dimensions.resolution.chars().count() > 200
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
                .bind(id)
                .fetch_optional(&mut *tx)
                .await?
                .ok_or(StoreError::Unauthorized)?;
        }
        let previous: Option<(i64, i64, i64, String, Value)> = sqlx::query_as(
            "SELECT revision, expected_revision, definition_revision, model_alias, price
             FROM customer_unit_media_tariffs
             WHERE idempotency_key = $1",
        )
        .bind(input.idempotency_key)
        .fetch_optional(&mut *tx)
        .await?;
        if let Some((revision, expected, definition, model, old_price)) = previous {
            if expected != input.expected_revision
                || definition != input.definition_revision
                || model != input.model_alias
                || old_price != price
            {
                return Err(StoreError::Conflict);
            }
            return Ok(json!({
                "revision": revision.to_string(),
                "definition_revision": definition.to_string(),
                "model_alias": model,
                "channel": input.price.dimensions.channel,
                "resolution": input.price.dimensions.resolution,
                "reference_video": input.price.dimensions.reference_video,
                "meter": input.price.meter,
                "price": old_price,
            }));
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
        sqlx::query(
            "INSERT INTO customer_unit_media_tariffs(
                revision, expected_revision, definition_revision, model_alias,
                channel, resolution, reference_video, meter, price,
                idempotency_key, actor_kind, actor_operator_id
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)",
        )
        .bind(next)
        .bind(current)
        .bind(input.definition_revision)
        .bind(input.model_alias)
        .bind(&input.price.dimensions.channel)
        .bind(&input.price.dimensions.resolution)
        .bind(input.price.dimensions.reference_video)
        .bind(&input.price.meter)
        .bind(&price)
        .bind(input.idempotency_key)
        .bind(kind)
        .bind(operator)
        .execute(&mut *tx)
        .await?;
        sqlx::query("UPDATE customer_unit_configuration SET revision=$1 WHERE singleton")
            .bind(next)
            .execute(&mut *tx)
            .await?;
        tx.commit().await?;
        Ok(json!({
            "revision": next.to_string(),
            "definition_revision": input.definition_revision.to_string(),
            "model_alias": input.model_alias,
            "channel": input.price.dimensions.channel,
            "resolution": input.price.dimensions.resolution,
            "reference_video": input.price.dimensions.reference_video,
            "meter": input.price.meter,
            "price": price,
        }))
    }

    pub async fn customer_unit_model_prices(
        &self,
    ) -> Result<(String, std::collections::BTreeMap<String, Value>), StoreError> {
        let billing_mode: String = sqlx::query_scalar(
            "SELECT billing_mode FROM customer_unit_configuration WHERE singleton",
        )
        .fetch_one(&self.pool)
        .await?;
        let text_rows: Vec<(String, Value)> = sqlx::query_as(
            "SELECT t.model_alias,
                    t.price || jsonb_build_object(
                        'revision', t.revision::text,
                        'definition_revision', t.definition_revision::text,
                        'unit_name', d.name,
                        'display_precision', d.display_precision,
                        'atoms_per_unit', '1000000000'
                    )
             FROM (
                 SELECT DISTINCT ON (model_alias)
                     revision, definition_revision, model_alias, price
                 FROM customer_unit_text_tariffs
                 ORDER BY model_alias, revision DESC
             ) t
             JOIN customer_unit_definitions d ON d.revision = t.definition_revision",
        )
        .fetch_all(&self.pool)
        .await?;
        let mut map = std::collections::BTreeMap::new();
        for (alias, price) in text_rows {
            map.insert(alias, price);
        }
        let media_rows: Vec<(String, Value)> = sqlx::query_as(
            "SELECT t.model_alias,
                    jsonb_agg(
                        jsonb_build_object(
                            'revision', t.revision::text,
                            'definition_revision', t.definition_revision::text,
                            'unit_name', d.name,
                            'display_precision', d.display_precision,
                            'atoms_per_unit', '1000000000',
                            'channel', t.channel,
                            'resolution', t.resolution,
                            'reference_video', t.reference_video,
                            'meter', t.meter,
                            'price', t.price
                        )
                        ORDER BY t.channel, t.resolution, t.reference_video
                    )
             FROM (
                 SELECT DISTINCT ON (model_alias, channel, resolution, reference_video)
                     revision, definition_revision, model_alias, channel, resolution, reference_video, meter, price
                 FROM customer_unit_media_tariffs
                 ORDER BY model_alias, channel, resolution, reference_video, revision DESC
             ) t
             JOIN customer_unit_definitions d ON d.revision = t.definition_revision
             GROUP BY t.model_alias",
        )
        .fetch_all(&self.pool)
        .await?;
        for (alias, media_tariffs) in media_rows {
            if let Some(existing) = map.get_mut(&alias).and_then(Value::as_object_mut) {
                existing.insert("media_tariffs".to_owned(), media_tariffs);
            } else {
                let first = media_tariffs.as_array().and_then(|arr| arr.first());
                map.insert(
                    alias,
                    json!({
                        "definition_revision": first.and_then(|v| v.get("definition_revision")).cloned().unwrap_or(Value::Null),
                        "unit_name": first.and_then(|v| v.get("unit_name")).cloned().unwrap_or(Value::Null),
                        "display_precision": first.and_then(|v| v.get("display_precision")).cloned().unwrap_or(Value::Null),
                        "atoms_per_unit": "1000000000",
                        "media_tariffs": media_tariffs,
                    }),
                );
            }
        }
        Ok((billing_mode, map))
    }
}
