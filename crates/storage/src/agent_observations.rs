//! Personal observations are owned by a user, independently of workspace access.
use crate::{CodexUsageResponseInput, Store, StoreError};
use serde::Deserialize;
use sha2::{Digest, Sha256};
use sqlx::Row;
use uuid::Uuid;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AgentObservationConsent {
    pub client_version: String,
    pub consent_version: String,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AgentObservationInput {
    pub billing_mode: String,
    pub response: CodexUsageResponseInput,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AgentObservationFeeSettings {
    pub from_ms: i64,
    pub to_ms: i64,
    pub subscription_fee_usd_cents: Option<i64>,
    pub paid_overflow_usd_cents: Option<i64>,
}
impl Store {
    pub async fn save_personal_agent_fees(
        &self,
        owner: Uuid,
        input: &AgentObservationFeeSettings,
    ) -> Result<(), StoreError> {
        if input.from_ms < 0
            || input.to_ms <= input.from_ms
            || input.to_ms - input.from_ms > 366 * 24 * 60 * 60 * 1000
            || input
                .subscription_fee_usd_cents
                .is_some_and(|v| !(0..=100_000_000).contains(&v))
            || input
                .paid_overflow_usd_cents
                .is_some_and(|v| !(0..=100_000_000).contains(&v))
        {
            return Err(StoreError::InvalidPrice);
        }
        sqlx::query("INSERT INTO agent_observation_fee_settings(owner_id,period_from_ms,period_to_ms,subscription_fee_usd_cents,paid_overflow_usd_cents) VALUES($1,$2,$3,$4,$5) ON CONFLICT(owner_id) DO UPDATE SET period_from_ms=EXCLUDED.period_from_ms,period_to_ms=EXCLUDED.period_to_ms,subscription_fee_usd_cents=EXCLUDED.subscription_fee_usd_cents,paid_overflow_usd_cents=EXCLUDED.paid_overflow_usd_cents,updated_at=now()")
            .bind(owner).bind(input.from_ms).bind(input.to_ms).bind(input.subscription_fee_usd_cents).bind(input.paid_overflow_usd_cents).execute(&self.pool).await?;
        Ok(())
    }

    pub async fn consent_agent_observations(
        &self,
        owner: Uuid,
        input: &AgentObservationConsent,
    ) -> Result<(), StoreError> {
        if input.consent_version != "agent-token-observation-v1"
            || input.client_version.is_empty()
            || input.client_version.len() > 64
            || input.client_version.chars().any(char::is_control)
        {
            return Err(StoreError::InvalidObservation);
        }
        sqlx::query("INSERT INTO agent_observation_sources(owner_id,source,client_version,consent_version) VALUES($1,'codex',$2,$3) ON CONFLICT(owner_id,source) DO UPDATE SET client_version=EXCLUDED.client_version,consent_version=EXCLUDED.consent_version,consented_at=now(),paused=FALSE")
            .bind(owner).bind(&input.client_version).bind(&input.consent_version).execute(&self.pool).await?;
        Ok(())
    }
    pub async fn pause_agent_observations(&self, owner: Uuid) -> Result<(), StoreError> {
        sqlx::query("UPDATE agent_observation_sources SET paused=TRUE WHERE owner_id=$1")
            .bind(owner)
            .execute(&self.pool)
            .await?;
        Ok(())
    }
    pub async fn append_agent_observations(
        &self,
        owner: Uuid,
        inputs: &[AgentObservationInput],
    ) -> Result<(u64, u64), StoreError> {
        if inputs.len() > 200 {
            return Err(StoreError::InvalidObservation);
        }
        let mut tx = self.pool.begin().await?;
        // Lock consent while receiving a batch so pause/delete cannot race ingestion.
        let source = sqlx::query("SELECT client_version,consent_version FROM agent_observation_sources WHERE owner_id=$1 AND source='codex' AND NOT paused FOR UPDATE")
            .bind(owner).fetch_optional(&mut *tx).await?.ok_or(StoreError::Conflict)?;
        let client: String = source.try_get("client_version")?;
        let consent: String = source.try_get("consent_version")?;
        let mut inserted = 0;
        for input in inputs {
            if !matches!(
                input.billing_mode.as_str(),
                "subscription" | "api" | "unknown"
            ) {
                return Err(StoreError::InvalidObservation);
            }
            let r = &input.response;
            r.validate()?;
            let snapshot = r
                .rate_snapshot
                .as_ref()
                .map(serde_json::to_value)
                .transpose()
                .map_err(|_| StoreError::InvalidObservation)?;
            let fingerprint = Sha256::digest(
                serde_json::to_vec(
                    &serde_json::json!({"billing_mode": input.billing_mode, "response": r}),
                )
                .map_err(|_| StoreError::InvalidObservation)?,
            )
            .to_vec();
            let changed = sqlx::query("INSERT INTO agent_observations(owner_id,source,response_key,occurred_at,model_provider,model,billing_mode,input_tokens,cached_input_tokens,cache_write_input_tokens,output_tokens,reasoning_output_tokens,api_equivalent_usd_nanos,rate_snapshot,client_version,consent_version,response_fingerprint) VALUES($1,'codex',$2,to_timestamp($3::double precision/1000),$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) ON CONFLICT(owner_id,source,response_key) DO NOTHING")
                .bind(owner).bind(r.response_hash()).bind(r.occurred_at_ms).bind(&r.model_provider).bind(&r.model).bind(&input.billing_mode)
                .bind(r.usage.input_tokens).bind(r.usage.cached_input_tokens).bind(r.usage.cache_write_input_tokens).bind(r.usage.output_tokens).bind(r.usage.reasoning_output_tokens)
                .bind(r.estimate_usd_nanos()).bind(snapshot).bind(&client).bind(&consent).bind(&fingerprint).execute(&mut *tx).await?.rows_affected();
            if changed == 0 {
                let previous: Vec<u8> = sqlx::query_scalar("SELECT response_fingerprint FROM agent_observations WHERE owner_id=$1 AND source='codex' AND response_key=$2")
                    .bind(owner).bind(r.response_hash()).fetch_one(&mut *tx).await?;
                if previous != fingerprint {
                    return Err(StoreError::Conflict);
                }
            }
            inserted += changed;
        }
        tx.commit().await?;
        Ok((inserted, inputs.len() as u64 - inserted))
    }
    pub async fn delete_agent_observations(&self, owner: Uuid) -> Result<(), StoreError> {
        let mut tx = self.pool.begin().await?;
        sqlx::query("DELETE FROM agent_observation_sources WHERE owner_id=$1")
            .bind(owner)
            .execute(&mut *tx)
            .await?;
        sqlx::query("DELETE FROM agent_observation_fee_settings WHERE owner_id=$1")
            .bind(owner)
            .execute(&mut *tx)
            .await?;
        tx.commit().await?;
        Ok(())
    }
    pub async fn personal_agent_observations(
        &self,
        owner: Uuid,
        from: i64,
        to: i64,
    ) -> Result<serde_json::Value, StoreError> {
        if from < 0 || to <= from || to - from > 366 * 24 * 60 * 60 * 1000 {
            return Err(StoreError::InvalidObservation);
        }
        // All sections must describe the same persisted snapshot during ingestion.
        let mut tx = self.pool.begin().await?;
        sqlx::query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
            .execute(&mut *tx)
            .await?;
        let summary: serde_json::Value = sqlx::query_scalar("SELECT jsonb_build_object('response_count',count(*)::text,'input_tokens',coalesce(sum(input_tokens),0)::text,'cached_input_tokens',coalesce(sum(cached_input_tokens),0)::text,'output_tokens',coalesce(sum(output_tokens),0)::text,'cache_write_input_tokens',sum(cache_write_input_tokens)::text,'unknown_cache_write_count',count(*) FILTER(WHERE cache_write_input_tokens IS NULL)::text,'reasoning_output_tokens',sum(reasoning_output_tokens)::text,'unknown_reasoning_count',count(*) FILTER(WHERE reasoning_output_tokens IS NULL)::text,'unknown_value_count',count(*) FILTER(WHERE api_equivalent_usd_nanos IS NULL)::text,'priced_value_usd_nanos',coalesce(sum(api_equivalent_usd_nanos),0)::text,'unknown_billing_count',count(*) FILTER(WHERE billing_mode='unknown')::text,'subscription_response_count',count(*) FILTER(WHERE billing_mode='subscription')::text,'api_response_count',count(*) FILTER(WHERE billing_mode='api')::text) FROM agent_observations WHERE owner_id=$1 AND occurred_at>=to_timestamp($2::double precision/1000) AND occurred_at<to_timestamp($3::double precision/1000)")
            .bind(owner).bind(from).bind(to).fetch_one(&mut *tx).await?;
        let sources: Vec<serde_json::Value> = sqlx::query_scalar("SELECT jsonb_build_object('source',source,'client_version',client_version,'consent_version',consent_version,'consented_at',consented_at,'paused',paused) FROM agent_observation_sources WHERE owner_id=$1 ORDER BY source")
            .bind(owner).fetch_all(&mut *tx).await?;
        let by_model: Vec<serde_json::Value> = sqlx::query_scalar("SELECT jsonb_build_object('model',coalesce(model,'Unknown model'),'model_provider',model_provider,'billing_mode',billing_mode,'response_count',count(*)::text,'input_tokens',sum(input_tokens)::text,'cached_input_tokens',sum(cached_input_tokens)::text,'output_tokens',sum(output_tokens)::text,'cache_write_input_tokens',sum(cache_write_input_tokens)::text,'reasoning_output_tokens',sum(reasoning_output_tokens)::text,'unknown_reasoning_count',count(*) FILTER(WHERE reasoning_output_tokens IS NULL)::text,'unknown_cache_write_count',count(*) FILTER(WHERE cache_write_input_tokens IS NULL)::text,'unknown_value_count',count(*) FILTER(WHERE api_equivalent_usd_nanos IS NULL)::text,'priced_value_usd_nanos',coalesce(sum(api_equivalent_usd_nanos),0)::text) FROM agent_observations WHERE owner_id=$1 AND occurred_at>=to_timestamp($2::double precision/1000) AND occurred_at<to_timestamp($3::double precision/1000) GROUP BY model_provider,model,billing_mode ORDER BY sum(input_tokens::numeric+output_tokens::numeric) DESC,model_provider,model,billing_mode")
            .bind(owner).bind(from).bind(to).fetch_all(&mut *tx).await?;
        let by_day: Vec<serde_json::Value> = sqlx::query_scalar("SELECT jsonb_build_object('day',to_char(occurred_at AT TIME ZONE 'UTC','YYYY-MM-DD'),'billing_mode',billing_mode,'response_count',count(*)::text,'input_tokens',sum(input_tokens)::text,'cached_input_tokens',sum(cached_input_tokens)::text,'output_tokens',sum(output_tokens)::text,'cache_write_input_tokens',sum(cache_write_input_tokens)::text,'reasoning_output_tokens',sum(reasoning_output_tokens)::text,'unknown_cache_write_count',count(*) FILTER(WHERE cache_write_input_tokens IS NULL)::text,'unknown_reasoning_count',count(*) FILTER(WHERE reasoning_output_tokens IS NULL)::text,'unknown_value_count',count(*) FILTER(WHERE api_equivalent_usd_nanos IS NULL)::text,'priced_value_usd_nanos',coalesce(sum(api_equivalent_usd_nanos),0)::text) FROM agent_observations WHERE owner_id=$1 AND occurred_at>=to_timestamp($2::double precision/1000) AND occurred_at<to_timestamp($3::double precision/1000) GROUP BY billing_mode, to_char(occurred_at AT TIME ZONE 'UTC','YYYY-MM-DD') ORDER BY to_char(occurred_at AT TIME ZONE 'UTC','YYYY-MM-DD'),billing_mode")
            .bind(owner).bind(from).bind(to).fetch_all(&mut *tx).await?;
        let fees: Option<serde_json::Value> = sqlx::query_scalar("SELECT jsonb_build_object('from_ms',period_from_ms,'to_ms',period_to_ms,'subscription_fee_usd_cents',subscription_fee_usd_cents,'paid_overflow_usd_cents',paid_overflow_usd_cents) FROM agent_observation_fee_settings WHERE owner_id=$1")
            .bind(owner).fetch_optional(&mut *tx).await?;
        let comparison: serde_json::Value = sqlx::query_scalar("WITH measured AS (SELECT count(*) FILTER(WHERE billing_mode='subscription') AS subscription_count,count(*) FILTER(WHERE billing_mode='subscription' AND api_equivalent_usd_nanos IS NOT NULL) AS subscription_priced_count,count(*) FILTER(WHERE billing_mode='subscription' AND api_equivalent_usd_nanos IS NULL) AS subscription_unknown_count,count(*) FILTER(WHERE billing_mode='unknown' OR billing_mode='subscription' AND api_equivalent_usd_nanos IS NULL) AS unknown_count,coalesce(sum(api_equivalent_usd_nanos) FILTER(WHERE billing_mode='subscription'),0) AS subscription_value FROM agent_observations WHERE owner_id=$1 AND occurred_at>=to_timestamp($2::double precision/1000) AND occurred_at<to_timestamp($3::double precision/1000)) SELECT jsonb_build_object('subscription_priced_count',m.subscription_priced_count::text,'subscription_unknown_count',m.subscription_unknown_count::text,'subscription_api_equivalent_usd_nanos',m.subscription_value::text,'value_multiple',CASE WHEN m.subscription_count>0 AND m.unknown_count=0 AND f.period_from_ms=$2 AND f.period_to_ms=$3 AND f.subscription_fee_usd_cents>0 THEN round(m.subscription_value::numeric/(f.subscription_fee_usd_cents::numeric*10000000),6)::text ELSE NULL END,'coverage','observed_only') FROM measured m LEFT JOIN agent_observation_fee_settings f ON f.owner_id=$1")
            .bind(owner).bind(from).bind(to).fetch_one(&mut *tx).await?;
        tx.commit().await?;
        Ok(
            serde_json::json!({"summary":summary,"sources":sources,"by_model":by_model,"by_day":by_day,"fees":fees,"comparison":comparison,"range":{"from_ms":from,"to_ms":to},"coverage":"observed_only"}),
        )
    }
}
