use crate::{Store, StoreError, TenantScope};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use sqlx::Row;
use uuid::Uuid;

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct CodexUsageTokens {
    pub input_tokens: i64,
    pub cached_input_tokens: i64,
    pub cache_write_input_tokens: Option<i64>,
    pub output_tokens: i64,
    pub reasoning_output_tokens: Option<i64>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct CodexRateOverride {
    pub min_prompt_tokens: i64,
    pub prompt: String,
    pub completion: String,
    pub input_cache_read: Option<String>,
    pub input_cache_write: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct CodexRateSnapshot {
    pub source: String,
    pub model_id: String,
    pub observed_at_ms: i64,
    pub prompt: String,
    pub completion: String,
    pub input_cache_read: Option<String>,
    pub input_cache_write: Option<String>,
    #[serde(default)]
    pub overrides: Vec<CodexRateOverride>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct CodexUsageResponseInput {
    pub response_id: String,
    pub occurred_at_ms: i64,
    pub model_provider: Option<String>,
    pub model: Option<String>,
    pub usage: CodexUsageTokens,
    pub rate_snapshot: Option<CodexRateSnapshot>,
}

// Preserve decimal USD/token rates exactly to 18 places, then round the summed
// response estimate once to nanodollars. No token count passes through f64.
const RATE_SCALE: i128 = 1_000_000_000_000_000_000;
fn valid_rate(value: &str) -> Option<i128> {
    if value.is_empty() || value.len() > 64 {
        return None;
    }
    let value = value.strip_prefix('+').unwrap_or(value);
    let mut parts = value.split('.');
    let whole = parts.next()?;
    let fraction = parts.next().unwrap_or("");
    if parts.next().is_some()
        || whole.is_empty() && fraction.is_empty()
        || !whole.bytes().all(|b| b.is_ascii_digit())
        || !fraction.bytes().all(|b| b.is_ascii_digit())
        || fraction.len() > 18
    {
        return None;
    }
    let whole = if whole.is_empty() {
        0
    } else {
        whole.parse::<i128>().ok()?
    };
    let fractional = if fraction.is_empty() {
        0
    } else {
        fraction.parse::<i128>().ok()?
    };
    whole
        .checked_mul(RATE_SCALE)?
        .checked_add(fractional.checked_mul(10_i128.pow(18 - fraction.len() as u32))?)
}

impl CodexUsageResponseInput {
    pub fn validate(&self) -> Result<(), StoreError> {
        if self.response_id.is_empty()
            || self.response_id.len() > 200
            || !self.response_id.bytes().all(|byte| byte.is_ascii_graphic())
            || self.occurred_at_ms < 0
            || self.model.as_ref().is_some_and(|model| {
                model.is_empty() || model.len() > 200 || model.chars().any(char::is_control)
            })
            || self.model_provider.as_ref().is_some_and(|provider| {
                provider.is_empty()
                    || provider.len() > 100
                    || provider.chars().any(char::is_control)
            })
        {
            return Err(StoreError::InvalidObservation);
        }

        let usage = &self.usage;
        if usage.input_tokens < 0
            || usage.cached_input_tokens < 0
            || usage.cached_input_tokens > usage.input_tokens
            || usage.output_tokens < 0
            || usage.cache_write_input_tokens.is_some_and(|value| {
                value < 0 || value > usage.input_tokens - usage.cached_input_tokens
            })
            || usage
                .reasoning_output_tokens
                .is_some_and(|value| value < 0 || value > usage.output_tokens)
        {
            return Err(StoreError::InvalidObservation);
        }

        if let Some(rates) = &self.rate_snapshot
            && (rates.source != "openrouter"
                || rates.model_id.len() > 200
                || rates.model_id.is_empty()
                || rates.observed_at_ms < 0
                || self.model_provider.as_deref() != Some("openai")
                || self
                    .model
                    .as_deref()
                    .is_none_or(|model| rates.model_id != format!("openai/{model}"))
                || rates.overrides.len() > 16
                || valid_rate(&rates.prompt).is_none()
                || valid_rate(&rates.completion).is_none()
                || rates
                    .input_cache_read
                    .as_deref()
                    .is_some_and(|value| valid_rate(value).is_none())
                || rates
                    .input_cache_write
                    .as_deref()
                    .is_some_and(|value| valid_rate(value).is_none())
                || rates.overrides.iter().any(|item| {
                    item.min_prompt_tokens < 0
                        || valid_rate(&item.prompt).is_none()
                        || valid_rate(&item.completion).is_none()
                        || item
                            .input_cache_read
                            .as_deref()
                            .is_some_and(|value| valid_rate(value).is_none())
                        || item
                            .input_cache_write
                            .as_deref()
                            .is_some_and(|value| valid_rate(value).is_none())
                }))
        {
            return Err(StoreError::InvalidObservation);
        }
        Ok(())
    }

    pub(crate) fn response_hash(&self) -> Vec<u8> {
        Sha256::digest(self.response_id.as_bytes()).to_vec()
    }

    pub(crate) fn estimate_usd_nanos(&self) -> Option<i64> {
        let snapshot = self.rate_snapshot.as_ref()?;
        let selected = snapshot
            .overrides
            .iter()
            .filter(|item| item.min_prompt_tokens <= self.usage.input_tokens)
            .max_by_key(|item| item.min_prompt_tokens);
        let prompt = selected.map_or(&snapshot.prompt, |item| &item.prompt);
        let completion = selected.map_or(&snapshot.completion, |item| &item.completion);
        let cache_read = selected
            .and_then(|item| item.input_cache_read.as_ref())
            .or(snapshot.input_cache_read.as_ref());
        let cache_write = selected
            .and_then(|item| item.input_cache_write.as_ref())
            .or(snapshot.input_cache_write.as_ref());

        let cached = self.usage.cached_input_tokens;
        let writes = self.usage.cache_write_input_tokens.unwrap_or(0);
        if cached > 0 && cache_read.is_none()
            || writes > 0 && cache_write.is_none()
            || self.usage.cache_write_input_tokens.is_none()
                && cache_write
                    .and_then(|rate| valid_rate(rate))
                    .is_some_and(|rate| rate > 0)
        {
            return None;
        }
        let prompt_tokens = self
            .usage
            .input_tokens
            .checked_sub(cached)?
            .checked_sub(writes)?;
        let categories = [
            (prompt_tokens, Some(valid_rate(prompt)?)),
            (cached, cache_read.and_then(|rate| valid_rate(rate))),
            (writes, cache_write.and_then(|rate| valid_rate(rate))),
            (self.usage.output_tokens, Some(valid_rate(completion)?)),
        ];
        let total = categories
            .into_iter()
            .try_fold(0_i128, |sum, (tokens, rate)| {
                let rate = if tokens == 0 { 0 } else { rate? };
                sum.checked_add(i128::from(tokens).checked_mul(rate)?)
            })?;
        let nanos = total.checked_add(500_000_000)? / 1_000_000_000;
        i64::try_from(nanos).ok()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn response() -> CodexUsageResponseInput {
        CodexUsageResponseInput {
            response_id: "response-private-id".into(),
            occurred_at_ms: 1_800_000_000_000,
            model_provider: Some("openai".into()),
            model: Some("gpt-5.6-codex".into()),
            usage: CodexUsageTokens {
                input_tokens: 1_000,
                cached_input_tokens: 200,
                cache_write_input_tokens: Some(100),
                output_tokens: 300,
                reasoning_output_tokens: Some(120),
            },
            rate_snapshot: Some(CodexRateSnapshot {
                source: "openrouter".into(),
                model_id: "openai/gpt-5.6-codex".into(),
                observed_at_ms: 1_800_000_000_000,
                prompt: "0.000001".into(),
                completion: "0.000002".into(),
                input_cache_read: Some("0.0000001".into()),
                input_cache_write: Some("0.0000005".into()),
                overrides: vec![],
            }),
        }
    }

    #[test]
    fn api_equivalent_uses_each_input_category_once_and_prices_reasoning_as_output() {
        let record = response();
        record.validate().unwrap();
        // 700 uncached input + 200 cached input + 100 cache writes + 300 output.
        assert_eq!(record.estimate_usd_nanos(), Some(1_370_000));
    }

    #[test]
    fn unavailable_cache_write_telemetry_keeps_the_api_equivalent_unknown() {
        let mut record = response();
        record.usage.cache_write_input_tokens = None;
        assert_eq!(record.estimate_usd_nanos(), None);
    }

    #[test]
    fn prompt_threshold_override_is_selected_and_unlisted_categories_inherit() {
        let mut record = response();
        record.usage.input_tokens = 300;
        record.usage.cached_input_tokens = 0;
        record.usage.cache_write_input_tokens = Some(0);
        record.usage.output_tokens = 100;
        record
            .rate_snapshot
            .as_mut()
            .unwrap()
            .overrides
            .push(CodexRateOverride {
                min_prompt_tokens: 256,
                prompt: "0.000002".into(),
                completion: "0.000003".into(),
                input_cache_read: None,
                input_cache_write: None,
            });
        assert_eq!(record.estimate_usd_nanos(), Some(900_000));
    }

    #[test]
    fn exact_decimal_estimate_preserves_token_counts_above_f64_integer_precision() {
        let mut record = response();
        record.usage.input_tokens = 9_007_199_254_740_993;
        record.usage.cached_input_tokens = 0;
        record.usage.cache_write_input_tokens = Some(0);
        record.usage.output_tokens = 0;
        let rates = record.rate_snapshot.as_mut().unwrap();
        rates.prompt = "0.000000001".into();
        assert_eq!(record.estimate_usd_nanos(), Some(9_007_199_254_740_993));
    }

    #[test]
    fn rounds_once_after_summing_categories_and_keeps_overflow_unknown() {
        let mut record = response();
        record.usage.input_tokens = 1;
        record.usage.cached_input_tokens = 0;
        record.usage.cache_write_input_tokens = Some(0);
        record.usage.output_tokens = 1;
        let rates = record.rate_snapshot.as_mut().unwrap();
        rates.prompt = "0.00000000025".into();
        rates.completion = "0.00000000025".into();
        assert_eq!(record.estimate_usd_nanos(), Some(1));
        record.usage.input_tokens = i64::MAX;
        record.rate_snapshot.as_mut().unwrap().prompt = "1".into();
        assert_eq!(record.estimate_usd_nanos(), None);
    }

    #[test]
    fn malformed_or_overprecise_rates_are_rejected_without_rounding() {
        for value in ["", "-1", "NaN", "1e-6", "1.2.3", "0.0000000000000000001"] {
            assert!(valid_rate(value).is_none(), "{value}");
        }
        assert_eq!(valid_rate("0"), Some(0));
        assert_eq!(valid_rate("0.000000000000000001"), Some(1));
    }

    #[test]
    fn snapshot_cannot_price_an_unrelated_or_custom_model() {
        let mut record = response();
        record.model_provider = Some("custom".into());
        assert!(matches!(
            record.validate(),
            Err(StoreError::InvalidObservation)
        ));
        record.model_provider = Some("openai".into());
        record.rate_snapshot.as_mut().unwrap().model_id = "other/gpt-5.6-codex".into();
        assert!(matches!(
            record.validate(),
            Err(StoreError::InvalidObservation)
        ));
    }
}

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CodexUsageImportStart {
    pub collector_version: String,
    pub codex_versions: Vec<String>,
    pub selected_file_count: i16,
    pub consent_version: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CodexUsageImportFinish {
    pub scanned_line_count: i64,
    pub malformed_line_count: i64,
    pub skipped_usage_count: i64,
    #[serde(default)]
    pub unconfirmed_response_count: i64,
}

impl Store {
    pub async fn start_codex_usage_import(
        &self,
        scope: TenantScope,
        input: &CodexUsageImportStart,
    ) -> Result<Uuid, StoreError> {
        if input.collector_version.is_empty()
            || input.collector_version.len() > 40
            || input.collector_version.chars().any(char::is_control)
            || !(1..=20).contains(&input.selected_file_count)
            || input.codex_versions.len() > 10
            || input.codex_versions.iter().any(|version| {
                version.is_empty() || version.len() > 64 || version.chars().any(char::is_control)
            })
            || input.consent_version != "codex-rollout-import-v1"
        {
            return Err(StoreError::InvalidObservation);
        }
        let id = Uuid::new_v4();
        sqlx::query(
            "INSERT INTO codex_usage_imports(id,organization_id,project_id,source_format,collector_version,codex_versions,selected_file_count,consent_version,consented_at) VALUES($1,$2,$3,'codex-rollout-jsonl-token_usage_record-v1',$4,$5,$6,$7,now())",
        )
        .bind(id)
        .bind(scope.organization_id)
        .bind(scope.project_id)
        .bind(&input.collector_version)
        .bind(&input.codex_versions)
        .bind(input.selected_file_count)
        .bind(&input.consent_version)
        .execute(&self.pool)
        .await?;
        Ok(id)
    }

    pub async fn insert_codex_usage_batch(
        &self,
        scope: TenantScope,
        import_id: Uuid,
        responses: &[CodexUsageResponseInput],
    ) -> Result<(u64, u64), StoreError> {
        if responses.len() > 200 {
            return Err(StoreError::InvalidObservation);
        }
        let mut tx = self.pool.begin().await?;
        let import_exists: bool = sqlx::query_scalar(
            "SELECT EXISTS(SELECT 1 FROM codex_usage_imports WHERE organization_id=$1 AND project_id=$2 AND id=$3 AND state='receiving')",
        )
        .bind(scope.organization_id)
        .bind(scope.project_id)
        .bind(import_id)
        .fetch_one(&mut *tx)
        .await?;
        if !import_exists {
            return Err(StoreError::Conflict);
        }

        let mut inserted = 0u64;
        for response in responses {
            response.validate()?;
            let snapshot = response
                .rate_snapshot
                .as_ref()
                .map(serde_json::to_value)
                .transpose()
                .map_err(|_| StoreError::InvalidObservation)?;
            let result = sqlx::query(
                "INSERT INTO codex_usage_responses(organization_id,project_id,import_id,response_key,occurred_at,model_provider,model,input_tokens,cached_input_tokens,cache_write_input_tokens,output_tokens,reasoning_output_tokens,api_equivalent_usd_nanos,rate_snapshot) VALUES($1,$2,$3,$4,to_timestamp($5::double precision/1000.0),$6,$7,$8,$9,$10,$11,$12,$13,$14) ON CONFLICT(organization_id,project_id,response_key) DO NOTHING",
            )
            .bind(scope.organization_id)
            .bind(scope.project_id)
            .bind(import_id)
            .bind(response.response_hash())
            .bind(response.occurred_at_ms)
            .bind(&response.model_provider)
            .bind(&response.model)
            .bind(response.usage.input_tokens)
            .bind(response.usage.cached_input_tokens)
            .bind(response.usage.cache_write_input_tokens)
            .bind(response.usage.output_tokens)
            .bind(response.usage.reasoning_output_tokens)
            .bind(response.estimate_usd_nanos())
            .bind(snapshot)
            .execute(&mut *tx)
            .await?;
            inserted += result.rows_affected();
        }
        tx.commit().await?;
        Ok((inserted, responses.len() as u64 - inserted))
    }

    pub async fn finish_codex_usage_import(
        &self,
        scope: TenantScope,
        import_id: Uuid,
        input: &CodexUsageImportFinish,
    ) -> Result<(), StoreError> {
        if [
            input.scanned_line_count,
            input.malformed_line_count,
            input.skipped_usage_count,
            input.unconfirmed_response_count,
        ]
        .iter()
        .any(|value| *value < 0 || *value > 100_000_000)
        {
            return Err(StoreError::InvalidObservation);
        }
        let state = if input.malformed_line_count == 0
            && input.skipped_usage_count == 0
            && input.unconfirmed_response_count == 0
        {
            "complete"
        } else {
            "partial"
        };
        let changed = sqlx::query(
            "UPDATE codex_usage_imports SET state=$4,scanned_line_count=$5,malformed_line_count=$6,skipped_usage_count=$7,unconfirmed_response_count=$8,completed_at=now() WHERE organization_id=$1 AND project_id=$2 AND id=$3 AND state='receiving'",
        )
        .bind(scope.organization_id)
        .bind(scope.project_id)
        .bind(import_id)
        .bind(state)
        .bind(input.scanned_line_count)
        .bind(input.malformed_line_count)
        .bind(input.skipped_usage_count)
        .bind(input.unconfirmed_response_count)
        .execute(&self.pool)
        .await?
        .rows_affected();
        if changed == 1 {
            return Ok(());
        }
        let previous = sqlx::query(
            "SELECT state,scanned_line_count,malformed_line_count,skipped_usage_count,unconfirmed_response_count FROM codex_usage_imports WHERE organization_id=$1 AND project_id=$2 AND id=$3",
        )
        .bind(scope.organization_id)
        .bind(scope.project_id)
        .bind(import_id)
        .fetch_optional(&self.pool)
        .await?;
        let Some(previous) = previous else {
            return Err(StoreError::Conflict);
        };
        let already_finished = previous.try_get::<String, _>("state")? == state
            && previous.try_get::<Option<i64>, _>("scanned_line_count")?
                == Some(input.scanned_line_count)
            && previous.try_get::<Option<i64>, _>("malformed_line_count")?
                == Some(input.malformed_line_count)
            && previous.try_get::<Option<i64>, _>("skipped_usage_count")?
                == Some(input.skipped_usage_count)
            && previous.try_get::<i64, _>("unconfirmed_response_count")?
                == input.unconfirmed_response_count;
        if already_finished {
            Ok(())
        } else {
            Err(StoreError::Conflict)
        }
    }

    pub async fn set_codex_usage_fee(
        &self,
        scope: TenantScope,
        from_ms: i64,
        to_ms: i64,
        fee_cents: i64,
        paid_overflow_cents: Option<i64>,
    ) -> Result<(), StoreError> {
        if from_ms < 0
            || to_ms <= from_ms
            || to_ms - from_ms > 366 * 24 * 60 * 60 * 1000
            || !(0..=100_000_000).contains(&fee_cents)
            || paid_overflow_cents.is_some_and(|value| !(0..=100_000_000).contains(&value))
        {
            return Err(StoreError::InvalidPrice);
        }
        sqlx::query(
            "INSERT INTO codex_usage_fee_settings(organization_id,project_id,period_from_ms,period_to_ms,subscription_fee_usd_cents,paid_overflow_usd_cents) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(organization_id,project_id) DO UPDATE SET period_from_ms=EXCLUDED.period_from_ms,period_to_ms=EXCLUDED.period_to_ms,subscription_fee_usd_cents=EXCLUDED.subscription_fee_usd_cents,paid_overflow_usd_cents=EXCLUDED.paid_overflow_usd_cents,updated_at=now()",
        )
        .bind(scope.organization_id)
        .bind(scope.project_id)
        .bind(from_ms)
        .bind(to_ms)
        .bind(fee_cents)
        .bind(paid_overflow_cents)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn codex_usage_report(
        &self,
        scope: TenantScope,
        from_ms: i64,
        to_ms: i64,
    ) -> Result<serde_json::Value, StoreError> {
        let filter = "organization_id=$1 AND project_id=$2 AND occurred_at>=to_timestamp($3::double precision/1000.0) AND occurred_at<to_timestamp($4::double precision/1000.0)";
        let summary_query = format!(
            "SELECT count(*)::text AS response_count, count(*) FILTER (WHERE api_equivalent_usd_nanos IS NULL)::text AS unknown_value_count, COALESCE(sum(api_equivalent_usd_nanos),0)::text AS priced_value_nanos, COALESCE(sum(input_tokens),0)::text AS input_tokens, COALESCE(sum(cached_input_tokens),0)::text AS cached_input_tokens, COALESCE(sum(cache_write_input_tokens),0)::text AS cache_write_input_tokens, count(*) FILTER (WHERE cache_write_input_tokens IS NULL)::text AS unknown_cache_write_count, COALESCE(sum(output_tokens),0)::text AS output_tokens, COALESCE(sum(reasoning_output_tokens),0)::text AS reasoning_output_tokens, count(*) FILTER (WHERE reasoning_output_tokens IS NULL)::text AS unknown_reasoning_count, count(*) FILTER (WHERE model IS NULL)::text AS unknown_model_count FROM codex_usage_responses WHERE {filter}"
        );
        let summary = sqlx::query(&summary_query)
            .bind(scope.organization_id)
            .bind(scope.project_id)
            .bind(from_ms)
            .bind(to_ms)
            .fetch_one(&self.pool)
            .await?;
        let summary_json = serde_json::json!({
            "response_count": summary.try_get::<String,_>("response_count")?,
            "unknown_value_count": summary.try_get::<String,_>("unknown_value_count")?,
            "priced_value_usd_nanos": summary.try_get::<String,_>("priced_value_nanos")?,
            "input_tokens": summary.try_get::<String,_>("input_tokens")?,
            "cached_input_tokens": summary.try_get::<String,_>("cached_input_tokens")?,
            "cache_write_input_tokens": summary.try_get::<String,_>("cache_write_input_tokens")?,
            "unknown_cache_write_count": summary.try_get::<String,_>("unknown_cache_write_count")?,
            "output_tokens": summary.try_get::<String,_>("output_tokens")?,
            "reasoning_output_tokens": summary.try_get::<String,_>("reasoning_output_tokens")?,
            "unknown_reasoning_count": summary.try_get::<String,_>("unknown_reasoning_count")?,
            "unknown_model_count": summary.try_get::<String,_>("unknown_model_count")?,
        });

        let model_query = format!(
            "SELECT COALESCE(model_provider || '/', '') || COALESCE(model, 'Unknown model') AS model, count(*)::text AS response_count, count(*) FILTER (WHERE api_equivalent_usd_nanos IS NULL)::text AS unknown_value_count, COALESCE(sum(api_equivalent_usd_nanos),0)::text AS priced_value_nanos, COALESCE(sum(input_tokens),0)::text AS input_tokens, COALESCE(sum(cached_input_tokens),0)::text AS cached_input_tokens, COALESCE(sum(output_tokens),0)::text AS output_tokens, COALESCE(sum(reasoning_output_tokens),0)::text AS reasoning_output_tokens FROM codex_usage_responses WHERE {filter} GROUP BY 1 ORDER BY sum(input_tokens::numeric + output_tokens::numeric) DESC,1"
        );
        let model_rows = sqlx::query(&model_query)
            .bind(scope.organization_id)
            .bind(scope.project_id)
            .bind(from_ms)
            .bind(to_ms)
            .fetch_all(&self.pool)
            .await?;
        let by_model = model_rows
            .iter()
            .map(|row| -> Result<_, sqlx::Error> {
                Ok(serde_json::json!({
                    "model": row.try_get::<String,_>("model")?,
                    "response_count": row.try_get::<String,_>("response_count")?,
                    "unknown_value_count": row.try_get::<String,_>("unknown_value_count")?,
                    "priced_value_usd_nanos": row.try_get::<String,_>("priced_value_nanos")?,
                    "input_tokens": row.try_get::<String,_>("input_tokens")?,
                    "cached_input_tokens": row.try_get::<String,_>("cached_input_tokens")?,
                    "output_tokens": row.try_get::<String,_>("output_tokens")?,
                    "reasoning_output_tokens": row.try_get::<String,_>("reasoning_output_tokens")?,
                }))
            })
            .collect::<Result<Vec<_>, _>>()?;

        let day_query = format!(
            "SELECT to_char(occurred_at AT TIME ZONE 'UTC','YYYY-MM-DD') AS day, count(*)::text AS response_count, count(*) FILTER (WHERE api_equivalent_usd_nanos IS NULL)::text AS unknown_value_count, COALESCE(sum(api_equivalent_usd_nanos),0)::text AS priced_value_nanos, COALESCE(sum(input_tokens),0)::text AS input_tokens, COALESCE(sum(cached_input_tokens),0)::text AS cached_input_tokens, COALESCE(sum(output_tokens),0)::text AS output_tokens, COALESCE(sum(reasoning_output_tokens),0)::text AS reasoning_output_tokens FROM codex_usage_responses WHERE {filter} GROUP BY 1 ORDER BY 1"
        );
        let day_rows = sqlx::query(&day_query)
            .bind(scope.organization_id)
            .bind(scope.project_id)
            .bind(from_ms)
            .bind(to_ms)
            .fetch_all(&self.pool)
            .await?;
        let by_day = day_rows
            .iter()
            .map(|row| -> Result<_, sqlx::Error> {
                Ok(serde_json::json!({
                    "day": row.try_get::<String,_>("day")?,
                    "response_count": row.try_get::<String,_>("response_count")?,
                    "unknown_value_count": row.try_get::<String,_>("unknown_value_count")?,
                    "priced_value_usd_nanos": row.try_get::<String,_>("priced_value_nanos")?,
                    "input_tokens": row.try_get::<String,_>("input_tokens")?,
                    "cached_input_tokens": row.try_get::<String,_>("cached_input_tokens")?,
                    "output_tokens": row.try_get::<String,_>("output_tokens")?,
                    "reasoning_output_tokens": row.try_get::<String,_>("reasoning_output_tokens")?,
                }))
            })
            .collect::<Result<Vec<_>, _>>()?;

        let imports = sqlx::query(
            "SELECT i.state,i.collector_version,i.codex_versions,i.selected_file_count,i.consent_version,floor(extract(epoch FROM i.consented_at)*1000)::bigint AS consented_at_ms,i.scanned_line_count,i.malformed_line_count,i.skipped_usage_count,i.unconfirmed_response_count,floor(extract(epoch FROM i.started_at)*1000)::bigint AS started_at_ms,floor(extract(epoch FROM i.completed_at)*1000)::bigint AS completed_at_ms,count(r.response_key)::text AS stored_response_count FROM codex_usage_imports i LEFT JOIN codex_usage_responses r ON r.organization_id=i.organization_id AND r.project_id=i.project_id AND r.import_id=i.id WHERE i.organization_id=$1 AND i.project_id=$2 GROUP BY i.id ORDER BY i.started_at DESC LIMIT 20",
        )
        .bind(scope.organization_id)
        .bind(scope.project_id)
        .fetch_all(&self.pool)
        .await?;
        let imports_json = imports
            .iter()
            .map(|row| -> Result<_, sqlx::Error> {
                Ok(serde_json::json!({
                    "state": row.try_get::<String,_>("state")?,
                    "collector_version": row.try_get::<String,_>("collector_version")?,
                    "codex_versions": row.try_get::<Vec<String>,_>("codex_versions")?,
                    "selected_file_count": row.try_get::<i16,_>("selected_file_count")?,
                    "consent_version": row.try_get::<Option<String>,_>("consent_version")?,
                    "consented_at_ms": row.try_get::<Option<i64>,_>("consented_at_ms")?,
                    "scanned_line_count": row.try_get::<Option<i64>,_>("scanned_line_count")?,
                    "malformed_line_count": row.try_get::<Option<i64>,_>("malformed_line_count")?,
                    "skipped_usage_count": row.try_get::<Option<i64>,_>("skipped_usage_count")?,
                    "unconfirmed_response_count": row.try_get::<i64,_>("unconfirmed_response_count")?,
                    "started_at_ms": row.try_get::<i64,_>("started_at_ms")?,
                    "completed_at_ms": row.try_get::<Option<i64>,_>("completed_at_ms")?,
                    "stored_response_count": row.try_get::<String,_>("stored_response_count")?,
                }))
            })
            .collect::<Result<Vec<_>, _>>()?;

        let fee = sqlx::query(
            "SELECT period_from_ms,period_to_ms,subscription_fee_usd_cents::text AS subscription_fee_usd_cents,paid_overflow_usd_cents::text AS paid_overflow_usd_cents FROM codex_usage_fee_settings WHERE organization_id=$1 AND project_id=$2",
        )
        .bind(scope.organization_id)
        .bind(scope.project_id)
        .fetch_optional(&self.pool)
        .await?
        .map(|row| -> Result<_, sqlx::Error> {
            Ok(serde_json::json!({
                "period_from_ms": row.try_get::<i64,_>("period_from_ms")?,
                "period_to_ms": row.try_get::<i64,_>("period_to_ms")?,
                "subscription_fee_usd_cents": row.try_get::<String,_>("subscription_fee_usd_cents")?,
                "paid_overflow_usd_cents": row.try_get::<Option<String>,_>("paid_overflow_usd_cents")?,
            }))
        })
        .transpose()?;

        Ok(serde_json::json!({
            "source_format": "codex-rollout-jsonl-token_usage_record-v1",
            "coverage": "Selected rollout files only; this is not a complete account billing record.",
            "range": {"from_ms": from_ms, "to_ms": to_ms},
            "summary": summary_json,
            "by_model": by_model,
            "by_day": by_day,
            "imports": imports_json,
            "fee": fee,
        }))
    }

    pub async fn delete_codex_usage_report(&self, scope: TenantScope) -> Result<(), StoreError> {
        let mut tx = self.pool.begin().await?;
        sqlx::query("DELETE FROM codex_usage_responses WHERE organization_id=$1 AND project_id=$2")
            .bind(scope.organization_id)
            .bind(scope.project_id)
            .execute(&mut *tx)
            .await?;
        sqlx::query("DELETE FROM codex_usage_imports WHERE organization_id=$1 AND project_id=$2")
            .bind(scope.organization_id)
            .bind(scope.project_id)
            .execute(&mut *tx)
            .await?;
        sqlx::query(
            "DELETE FROM codex_usage_fee_settings WHERE organization_id=$1 AND project_id=$2",
        )
        .bind(scope.organization_id)
        .bind(scope.project_id)
        .execute(&mut *tx)
        .await?;
        tx.commit().await?;
        Ok(())
    }
}
