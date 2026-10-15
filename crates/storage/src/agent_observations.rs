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
        struct PreparedObservation<'a> {
            input: &'a AgentObservationInput,
            response_key: Vec<u8>,
            snapshot: Option<serde_json::Value>,
            fingerprint: Vec<u8>,
            estimate_nanos: Option<i64>,
        }
        let mut prepared = Vec::with_capacity(inputs.len());
        let mut seen: std::collections::HashMap<Vec<u8>, Vec<u8>> =
            std::collections::HashMap::with_capacity(inputs.len());
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
            let response_key = r.response_hash();
            match seen.entry(response_key.clone()) {
                std::collections::hash_map::Entry::Occupied(existing) => {
                    if existing.get() != &fingerprint {
                        return Err(StoreError::Conflict);
                    }
                }
                std::collections::hash_map::Entry::Vacant(vacant) => {
                    vacant.insert(fingerprint.clone());
                    prepared.push(PreparedObservation {
                        input,
                        response_key,
                        snapshot,
                        fingerprint,
                        estimate_nanos: r.estimate_usd_nanos(),
                    });
                }
            }
        }
        let mut tx = self.begin_bounded_recording().await?;
        // Lock consent while receiving a batch so pause/delete cannot race ingestion.
        let source = sqlx::query("SELECT client_version,consent_version FROM agent_observation_sources WHERE owner_id=$1 AND source='codex' AND NOT paused FOR UPDATE")
            .bind(owner).fetch_optional(&mut *tx).await?.ok_or(StoreError::Conflict)?;
        let client: String = source.try_get("client_version")?;
        let consent: String = source.try_get("consent_version")?;
        let inserted = if prepared.is_empty() {
            0u64
        } else {
            let mut builder = sqlx::QueryBuilder::<sqlx::Postgres>::new(
                "INSERT INTO agent_observations(owner_id,source,response_key,occurred_at,model_provider,model,billing_mode,input_tokens,cached_input_tokens,cache_write_input_tokens,output_tokens,reasoning_output_tokens,api_equivalent_usd_nanos,rate_snapshot,client_version,consent_version,response_fingerprint) ",
            );
            builder.push_values(&prepared, |mut b, item| {
                let r = &item.input.response;
                b.push_bind(owner)
                    .push("'codex'")
                    .push_bind(&item.response_key)
                    .push("to_timestamp(")
                    .push_bind_unseparated(r.occurred_at_ms)
                    .push_unseparated("::double precision/1000)")
                    .push_bind(&r.model_provider)
                    .push_bind(&r.model)
                    .push_bind(&item.input.billing_mode)
                    .push_bind(r.usage.input_tokens)
                    .push_bind(r.usage.cached_input_tokens)
                    .push_bind(r.usage.cache_write_input_tokens)
                    .push_bind(r.usage.output_tokens)
                    .push_bind(r.usage.reasoning_output_tokens)
                    .push_bind(item.estimate_nanos)
                    .push_bind(&item.snapshot)
                    .push_bind(&client)
                    .push_bind(&consent)
                    .push_bind(&item.fingerprint);
            });
            builder.push(" ON CONFLICT(owner_id,source,response_key) DO NOTHING RETURNING response_key");
            let inserted_keys: Vec<Vec<u8>> = builder
                .build_query_scalar()
                .fetch_all(&mut *tx)
                .await?;
            if inserted_keys.len() < prepared.len() {
                let inserted_set: std::collections::HashSet<&[u8]> =
                    inserted_keys.iter().map(Vec::as_slice).collect();
                let conflict_keys: Vec<Vec<u8>> = prepared
                    .iter()
                    .filter(|item| !inserted_set.contains(item.response_key.as_slice()))
                    .map(|item| item.response_key.clone())
                    .collect();
                let existing_rows: Vec<(Vec<u8>, Vec<u8>)> = sqlx::query_as(
                    "SELECT response_key,response_fingerprint FROM agent_observations WHERE owner_id=$1 AND source='codex' AND response_key = ANY($2)",
                )
                .bind(owner)
                .bind(&conflict_keys)
                .fetch_all(&mut *tx)
                .await?;
                if existing_rows.len() != conflict_keys.len() {
                    return Err(StoreError::Conflict);
                }
                for (key, previous) in existing_rows {
                    if seen.get(&key) != Some(&previous) {
                        return Err(StoreError::Conflict);
                    }
                }
            }
            inserted_keys.len() as u64
        };
        tx.commit().await?;
        Ok((inserted, inputs.len() as u64 - inserted))
    }
    pub async fn delete_agent_observations(&self, owner: Uuid) -> Result<(), StoreError> {
        let mut tx = self.begin_bounded_recording().await?;
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
        let mut tx = self.begin_bounded_read_snapshot().await?;
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
