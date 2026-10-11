//! Transactional publication authority. Compiler implementations must be pure:
//! no credentials, network operations or reads outside the supplied input.
use crate::{RouteRegistryInputs, Store, StoreError};
use serde_json::Value;
use sqlx::{Postgres, Transaction};
use std::sync::Arc;

pub trait RouteRegistryCompiler: Send + Sync {
    fn static_identity(&self) -> &str;
    fn compile(&self, inputs: RouteRegistryInputs) -> Result<Value, StoreError>;
}

/// Server-only serialized compilation. It contains no credential material.
/// Endpoint and procurement metadata must never be projected directly to clients.
pub struct RouteRegistryPublication {
    pub generation: i64,
    pub static_identity: String,
    pub compiled: Value,
}

impl Store {
    /// Install before bootstrap, mutation handlers or dispatch workers are cloned.
    pub fn with_route_compiler(mut self, compiler: Arc<dyn RouteRegistryCompiler>) -> Self {
        self.route_compiler = Some(compiler);
        self
    }

    pub(crate) async fn begin_route_write(&self) -> Result<Transaction<'_, Postgres>, StoreError> {
        let mut tx = self.pool.begin().await?;
        // Must precede every domain row lock to establish one lock ordering.
        sqlx::query("SELECT pg_advisory_xact_lock(716554)")
            .execute(&mut *tx)
            .await?;
        let active_identity: Option<String> = sqlx::query_scalar(
            "SELECT g.static_identity FROM routing_registry_active a JOIN routing_registry_generations g ON g.generation=a.generation"
        ).fetch_optional(&mut *tx).await?;
        if let Some(identity) = active_identity {
            let compiler = self.route_compiler.as_ref().ok_or(StoreError::Conflict)?;
            if identity != compiler.static_identity() {
                return Err(StoreError::Conflict);
            }
        }
        sqlx::query("SELECT set_config('niu.registry_writer','v1',true)")
            .execute(&mut *tx)
            .await?;
        Ok(tx)
    }

    pub(crate) async fn commit_route_write(
        &self,
        mut tx: Transaction<'_, Postgres>,
    ) -> Result<(), StoreError> {
        if let Some(compiler) = &self.route_compiler {
            let current: Option<String> = sqlx::query_scalar(
                "SELECT g.static_identity FROM routing_registry_active a JOIN routing_registry_generations g ON g.generation=a.generation"
            ).fetch_optional(&mut *tx).await?;
            if current
                .as_deref()
                .is_some_and(|identity| identity != compiler.static_identity())
            {
                return Err(StoreError::Conflict);
            }
            let compiled = compiler.compile(Self::routing_registry_inputs_in_tx(&mut tx).await?)?;
            Self::publish_compilation(&mut tx, compiler.as_ref(), compiled).await?;
        }
        sqlx::query("SELECT set_config('niu.registry_dirty','0',true)")
            .execute(&mut *tx)
            .await?;
        tx.commit().await?;
        Ok(())
    }

    async fn publish_compilation(
        tx: &mut Transaction<'_, Postgres>,
        compiler: &dyn RouteRegistryCompiler,
        compiled: Value,
    ) -> Result<(), StoreError> {
        if !compiled.is_object() || compiled.to_string().len() > 16 * 1024 * 1024 {
            return Err(StoreError::InvalidVendor);
        }
        let generation: i64 = sqlx::query_scalar(
            "INSERT INTO routing_registry_generations(static_identity,compiled) VALUES($1,$2) RETURNING generation"
        ).bind(compiler.static_identity()).bind(compiled).fetch_one(&mut **tx).await?;
        sqlx::query("INSERT INTO routing_registry_active(singleton,generation) VALUES(true,$1) ON CONFLICT(singleton) DO UPDATE SET generation=EXCLUDED.generation")
            .bind(generation).execute(&mut **tx).await?;
        sqlx::query("SELECT set_config('niu.registry_dirty','0',true)")
            .execute(&mut **tx)
            .await?;
        Ok(())
    }

    /// All initial imports and static configuration become visible together.
    /// Existing configurations are never overwritten. Replacing static inputs
    /// requires the operator's expected current generation; matching restarts
    /// remain idempotent even when that one-time expectation is still supplied.
    pub async fn bootstrap_route_registry(
        &self,
        seeds: Vec<(crate::VendorInput, Vec<crate::VendorModelInput>)>,
        expected_generation: Option<i64>,
    ) -> Result<(), StoreError> {
        let compiler = self.route_compiler.as_ref().ok_or(StoreError::Conflict)?;
        let mut tx = self.pool.begin().await?;
        sqlx::query("SELECT pg_advisory_xact_lock(716554)")
            .execute(&mut *tx)
            .await?;
        let active: Option<(i64, String, Value)> = sqlx::query_as(
            "SELECT a.generation,g.static_identity,g.compiled FROM routing_registry_active a JOIN routing_registry_generations g ON g.generation=a.generation"
        ).fetch_optional(&mut *tx).await?;
        if let Some((generation, identity, _)) = &active {
            if identity != compiler.static_identity() && Some(*generation) != expected_generation {
                return Err(StoreError::Conflict);
            }
        } else if expected_generation.is_some() {
            return Err(StoreError::Conflict);
        }
        sqlx::query("SELECT set_config('niu.registry_writer','v1',true)")
            .execute(&mut *tx)
            .await?;
        let mut changed = false;
        for (input, models) in seeds {
            changed |= Self::seed_vendor_in_tx(&mut tx, input, models).await?;
        }
        // Validate before either publication or an idempotent restart succeeds.
        // The pure compiler also validates required static credential references.
        let compiled = compiler.compile(Self::routing_registry_inputs_in_tx(&mut tx).await?)?;
        if changed
            || active.as_ref().is_none_or(|(_, identity, prior)| {
                identity != compiler.static_identity() || prior != &compiled
            })
        {
            Self::publish_compilation(&mut tx, compiler.as_ref(), compiled).await?;
        }
        tx.commit().await?;
        Ok(())
    }

    /// Persist the selected video generation with its new durable attempt.
    pub async fn prepare_gateway_attempt_with_generation(
        &self,
        scope: crate::TenantScope,
        model: &str,
        task_id: Option<&str>,
        revision: &str,
        generation: Option<i64>,
    ) -> Result<(uuid::Uuid, uuid::Uuid), StoreError> {
        let mut tx = self.pool.begin().await?;
        let operation = uuid::Uuid::new_v4();
        let attempt = uuid::Uuid::new_v4();
        Self::insert_gateway_attempt(
            &mut *tx, scope, operation, attempt, model, task_id, revision,
        )
        .await?;
        Self::insert_route_generation(&mut *tx, attempt, generation).await?;
        tx.commit().await?;
        Ok((operation, attempt))
    }

    pub(crate) async fn insert_route_generation<'e>(
        executor: impl sqlx::Executor<'e, Database = Postgres>,
        attempt: uuid::Uuid,
        generation: Option<i64>,
    ) -> Result<(), StoreError> {
        if let Some(generation) = generation {
            sqlx::query(
                "INSERT INTO attempt_route_generations(attempt_id,generation) VALUES($1,$2)",
            )
            .bind(attempt)
            .bind(generation)
            .execute(executor)
            .await?;
        }
        Ok(())
    }

    pub(crate) async fn validate_published_offer_binding(
        tx: &mut Transaction<'_, Postgres>,
        attempt: uuid::Uuid,
        alias: &str,
    ) -> Result<(), StoreError> {
        let matches: bool = sqlx::query_scalar(
            "SELECT NOT EXISTS(SELECT 1 FROM attempt_route_generations b JOIN routing_registry_generations g ON g.generation=b.generation LEFT JOIN provider_attempt_offers o ON o.attempt_id=b.attempt_id WHERE b.attempt_id=$1 AND (g.compiled->'offers'->$2->>'current_revision') IS DISTINCT FROM o.revision_id::text)"
        ).bind(attempt).bind(alias).fetch_one(&mut **tx).await?;
        if !matches {
            return Err(StoreError::ManagedRouteChanged);
        }
        Ok(())
    }

    pub fn route_registry_static_identity(&self) -> Option<&str> {
        self.route_compiler
            .as_ref()
            .map(|compiler| compiler.static_identity())
    }

    /// Only clock-dependent or revocable exclusions; no route definitions.
    pub async fn route_registry_live_eligibility(
        &self,
    ) -> Result<
        (
            std::collections::BTreeSet<String>,
            std::collections::BTreeSet<uuid::Uuid>,
        ),
        StoreError,
    > {
        let row: (Vec<String>, Vec<uuid::Uuid>) = sqlx::query_as(
            "SELECT ARRAY(SELECT model_alias FROM provider_offers WHERE NOT niu_supplier_model_route_available(model_alias)), ARRAY(SELECT vendor_id FROM vendor_cooldowns WHERE cooldown_until>statement_timestamp())"
        ).fetch_one(&self.pool).await?;
        Ok((row.0.into_iter().collect(), row.1.into_iter().collect()))
    }

    pub async fn route_registry_generation(&self) -> Result<Option<i64>, StoreError> {
        Ok(
            sqlx::query_scalar("SELECT generation FROM routing_registry_active")
                .fetch_optional(&self.pool)
                .await?,
        )
    }

    pub async fn route_registry_publication(
        &self,
        generation: i64,
    ) -> Result<RouteRegistryPublication, StoreError> {
        let row: (String, Value) = sqlx::query_as(
            "SELECT static_identity,compiled FROM routing_registry_generations WHERE generation=$1",
        )
        .bind(generation)
        .fetch_one(&self.pool)
        .await?;
        Ok(RouteRegistryPublication {
            generation,
            static_identity: row.0,
            compiled: row.1,
        })
    }
}
