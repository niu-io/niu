//! Credits text admission and usage-derived settlement. Upstream procurement
//! remains monetary; a Credits request never debits a monetary customer wallet.
use crate::{CustomerUnitTextPrice, GatewayReservation, Store, StoreError, TenantScope};
use serde_json::{Value, json};
use sqlx::{Acquire, Postgres, Row, Transaction};
use uuid::Uuid;

impl Store {
    pub(crate) async fn bind_customer_unit_text_in_tx(
        tx: &mut Transaction<'_, Postgres>,
        scope: TenantScope,
        attempt: Uuid,
        alias: &str,
    ) -> Result<(), StoreError> {
        // Caller holds installation -> operation -> workspace locks. Retrying
        // the same operation retains the original revision, never the live head.
        let operation: Uuid = sqlx::query_scalar("SELECT operation_id FROM attempts WHERE id=$1 AND organization_id=$2 AND project_id=$3 AND execution='not_sent'")
            .bind(attempt).bind(scope.organization_id).bind(scope.project_id).fetch_one(&mut **tx).await?;
        let pinned: Option<i64> = sqlx::query_scalar(
            "SELECT revision FROM customer_unit_operation_tariffs WHERE operation_id=$1",
        )
        .bind(operation)
        .fetch_optional(&mut **tx)
        .await?;
        let revision = match pinned {
            Some(revision) => revision,
            None => {
                let monetary: bool = sqlx::query_scalar(
                    "SELECT EXISTS(SELECT 1 FROM customer_operation_tariffs WHERE operation_id=$1)",
                )
                .bind(operation)
                .fetch_one(&mut **tx)
                .await?;
                if monetary {
                    return Err(StoreError::Conflict);
                }
                let revision: i64 = sqlx::query_scalar("SELECT revision FROM customer_unit_text_tariffs WHERE model_alias=$1 ORDER BY revision DESC LIMIT 1")
                    .bind(alias).fetch_optional(&mut **tx).await?.ok_or(StoreError::ProcurementUnavailable)?;
                sqlx::query("INSERT INTO customer_unit_operation_tariffs(operation_id,revision) VALUES($1,$2)")
                    .bind(operation).bind(revision).execute(&mut **tx).await?;
                revision
            }
        };
        sqlx::query("INSERT INTO customer_unit_attempt_tariffs(attempt_id,operation_id,revision) VALUES($1,$2,$3) ON CONFLICT(attempt_id) DO NOTHING")
            .bind(attempt).bind(operation).bind(revision).execute(&mut **tx).await?;
        Ok(())
    }

    pub(crate) async fn reserve_customer_unit_text_in_tx(
        tx: &mut Transaction<'_, Postgres>,
        scope: TenantScope,
        attempt: Uuid,
        reservation: &GatewayReservation,
    ) -> Result<bool, StoreError> {
        let bound: Option<(i64,Value)> = sqlx::query_as("SELECT p.definition_revision,p.price FROM customer_unit_attempt_tariffs b JOIN customer_unit_text_tariffs p USING(revision) WHERE b.attempt_id=$1")
            .bind(attempt).fetch_optional(&mut **tx).await?;
        let Some((definition, price)) = bound else {
            return Ok(false);
        };
        let price: CustomerUnitTextPrice =
            serde_json::from_value(price).map_err(|_| StoreError::InvalidPrice)?;
        let usage = reservation.token_usage;
        let unsupported = |cached: bool, written: bool, reasoning: bool| {
            (!usage.cached_input && cached)
                || (!usage.cache_write_input && written)
                || (!usage.reasoning_output && reasoning)
        };
        if unsupported(
            price.cached_prompt_rate.is_some(),
            price.cache_write_prompt_rate.is_some(),
            price.reasoning_completion_rate.is_some(),
        ) {
            return Err(StoreError::UnsupportedTokenPricing);
        }
        for tier in &price.context_tiers {
            let tier = tier.rates()?;
            if tier.minimum_input_tokens <= reservation.prompt_bound
                && unsupported(
                    tier.cached_prompt.is_some(),
                    tier.cache_write_prompt.is_some(),
                    tier.reasoning_completion.is_some(),
                )
            {
                return Err(StoreError::UnsupportedTokenPricing);
            }
        }
        // Monetary caps cannot be silently reinterpreted as Credits. Guarded
        // mode migration and the separate unit-limit surface resolve this.
        let monetary_limits: bool=sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM customer_workspace_spending_limits WHERE organization_id=$1 AND project_id=$2) OR EXISTS(SELECT 1 FROM customer_key_spending_limits WHERE spending_root_id=niu_customer_attempt_spending_root($3) AND limit_nanos IS NOT NULL)")
            .bind(scope.organization_id).bind(scope.project_id).bind(attempt).fetch_one(&mut **tx).await?;
        if monetary_limits {
            return Err(StoreError::Conflict);
        }
        Self::lock_customer_unit_attempt(tx, scope, attempt).await?;
        let pending: bool=sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM customer_unit_text_charges c JOIN customer_unit_reservations r USING(attempt_id) WHERE r.organization_id=$1 AND NOT EXISTS(SELECT 1 FROM customer_unit_resolutions s WHERE s.attempt_id=c.attempt_id))")
            .bind(scope.organization_id).fetch_one(&mut **tx).await?;
        if pending {
            return Err(StoreError::BudgetExceeded);
        }
        let maximum =
            price.reservation_atoms(reservation.prompt_bound, reservation.completion_bound)?;
        Self::reserve_customer_unit_ranges_in_tx(tx, scope, attempt, definition, maximum).await?;
        Ok(true)
    }

    pub(crate) async fn accrue_customer_unit_text_in_tx(
        tx: &mut Transaction<'_, Postgres>,
        attempt: Uuid,
    ) -> Result<bool, StoreError> {
        let scope: Option<(Uuid,Uuid)> = sqlx::query_as("SELECT a.organization_id,a.project_id FROM attempts a JOIN customer_unit_attempt_tariffs b ON b.attempt_id=a.id WHERE a.id=$1")
            .bind(attempt).fetch_optional(&mut **tx).await?;
        let Some((organization_id, project_id)) = scope else {
            return Ok(false);
        };
        let scope = TenantScope {
            organization_id,
            project_id,
        };
        Self::lock_customer_unit_attempt(tx, scope, attempt).await?;
        let row=sqlx::query("SELECT b.revision,p.price,a.prompt_tokens,a.completion_tokens,d.cached_input_tokens,d.cache_write_input_tokens,d.reasoning_output_tokens FROM attempts a JOIN customer_unit_attempt_tariffs b ON b.attempt_id=a.id JOIN customer_unit_text_tariffs p USING(revision) LEFT JOIN request_token_categories d ON d.attempt_id=a.id WHERE a.id=$1 AND a.execution='confirmed_completed' AND a.usage_confidence='provider_reported'")
            .bind(attempt).fetch_optional(&mut **tx).await?.ok_or(StoreError::Unresolved)?;
        let price: CustomerUnitTextPrice =
            serde_json::from_value(row.get("price")).map_err(|_| StoreError::InvalidPrice)?;
        let input: i64 = row.get("prompt_tokens");
        let output: i64 = row.get("completion_tokens");
        let cached: Option<i64> = row.get("cached_input_tokens");
        let written: Option<i64> = row.get("cache_write_input_tokens");
        let reasoning: Option<i64> = row.get("reasoning_output_tokens");
        let amount = price.charge_atoms(input, output, cached, written, reasoning)?;
        let revision: i64 = row.get("revision");
        let usage = json!({"input_tokens":input.to_string(),"output_tokens":output.to_string(),
            "cached_input_tokens":cached.map(|n|n.to_string()),"cache_write_input_tokens":written.map(|n|n.to_string()),
            "reasoning_output_tokens":reasoning.map(|n|n.to_string())});
        let previous:Option<(i64,i64,Value)>=sqlx::query_as("SELECT revision,charged_atoms,usage FROM customer_unit_text_charges WHERE attempt_id=$1")
            .bind(attempt).fetch_optional(&mut **tx).await?;
        if let Some(previous) = previous {
            if previous != (revision, amount, usage.clone()) {
                return Err(StoreError::Conflict);
            }
        } else {
            sqlx::query("INSERT INTO customer_unit_text_charges(attempt_id,revision,charged_atoms,usage) VALUES($1,$2,$3,$4)")
                .bind(attempt).bind(revision).bind(amount).bind(usage).execute(&mut **tx).await?;
        }
        let maximum: i64 = sqlx::query_scalar(
            "SELECT maximum_atoms FROM customer_unit_reservations WHERE attempt_id=$1",
        )
        .bind(attempt)
        .fetch_one(&mut **tx)
        .await?;
        if amount > maximum {
            let extended:bool=sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM customer_unit_reservation_extensions WHERE attempt_id=$1)")
                .bind(attempt).fetch_one(&mut **tx).await?;
            if !extended {
                // Roll back only attempted extra allocation on insufficient
                // funding. The known immutable liability survives for recovery.
                let mut extension = tx.begin().await?;
                sqlx::query("INSERT INTO customer_unit_reservation_extensions(attempt_id,additional_atoms) VALUES($1,$2)")
                    .bind(attempt).bind(amount-maximum).execute(&mut *extension).await?;
                match Self::allocate_customer_unit_ranges_in_tx(
                    &mut extension,
                    scope,
                    attempt,
                    amount - maximum,
                )
                .await
                {
                    Ok(()) => extension.commit().await?,
                    Err(error) => {
                        extension.rollback().await?;
                        return Err(error);
                    }
                }
            }
        }
        Self::resolve_customer_unit_ranges_in_tx(tx, scope, attempt, Some(amount)).await?;
        Ok(true)
    }

    pub(crate) async fn release_customer_unit_nonexecuted_in_tx(
        tx: &mut Transaction<'_, Postgres>,
        scope: TenantScope,
        attempt: Uuid,
    ) -> Result<bool, StoreError> {
        let bound:bool=sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM customer_unit_reservations WHERE attempt_id=$1 AND organization_id=$2 AND project_id=$3)")
            .bind(attempt).bind(scope.organization_id).bind(scope.project_id).fetch_one(&mut **tx).await?;
        if !bound {
            return Ok(false);
        }
        Self::lock_customer_unit_attempt(tx, scope, attempt).await?;
        let execution: String = sqlx::query_scalar("SELECT execution FROM attempts WHERE id=$1")
            .bind(attempt)
            .fetch_one(&mut **tx)
            .await?;
        if !matches!(execution.as_str(), "not_sent" | "confirmed_not_executed") {
            return Err(StoreError::Unresolved);
        }
        Self::resolve_customer_unit_ranges_in_tx(tx, scope, attempt, None).await?;
        Ok(true)
    }
}
