use crate::{Store, StoreError};
use serde::{Deserialize, Serialize};
use sqlx::Row;
use uuid::Uuid;

#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct RoutePoolCandidate {
    pub alias: String,
    pub priority: i32,
    pub weight: u32,
    pub enabled: bool,
}

#[derive(Clone, Deserialize, Serialize)]
pub struct ModelRoutePool {
    pub alias: String,
    pub organization_id: Option<Uuid>,
    pub enabled: bool,
    pub revision: i64,
    pub candidates: Vec<RoutePoolCandidate>,
}

impl Store {
    pub async fn model_route_pool(
        &self,
        alias: &str,
    ) -> Result<Option<ModelRoutePool>, StoreError> {
        let value: Option<serde_json::Value> =
            sqlx::query_scalar("SELECT to_jsonb(p) FROM model_route_pools p WHERE alias=$1")
                .bind(alias)
                .fetch_optional(&self.pool)
                .await?;
        value
            .map(serde_json::from_value)
            .transpose()
            .map_err(|_| StoreError::Conflict)
    }

    pub async fn model_route_pools(&self) -> Result<Vec<ModelRoutePool>, StoreError> {
        let values: Vec<serde_json::Value> = sqlx::query_scalar(
            "SELECT to_jsonb(p) FROM model_route_pools p ORDER BY alias LIMIT 1000",
        )
        .fetch_all(&self.pool)
        .await?;
        values
            .into_iter()
            .map(|v| serde_json::from_value(v).map_err(|_| StoreError::Conflict))
            .collect()
    }

    /// Bounded keyset page; the extra row tells the caller whether another page exists.
    pub async fn model_route_pool_page(
        &self,
        after: Option<&str>,
        limit: i64,
    ) -> Result<Vec<ModelRoutePool>, StoreError> {
        if !(1..=100).contains(&limit) {
            return Err(StoreError::InvalidPrice);
        }
        let values: Vec<serde_json::Value> = sqlx::query_scalar(
            "SELECT to_jsonb(p) FROM model_route_pools p WHERE ($1::text IS NULL OR alias>$1) ORDER BY alias LIMIT $2",
        )
        .bind(after)
        .bind(limit + 1)
        .fetch_all(&self.pool)
        .await?;
        values
            .into_iter()
            .map(|value| serde_json::from_value(value).map_err(|_| StoreError::Conflict))
            .collect()
    }

    pub async fn set_model_route_pool(&self, input: &ModelRoutePool) -> Result<i64, StoreError> {
        if input.alias.is_empty()
            || input.alias.len() > 200
            || !input.alias.bytes().all(|c| c.is_ascii_graphic())
            || input.alias.starts_with("codex/")
            || input.revision < 0
            || input.revision >= 9_007_199_254_740_991
            || input.candidates.is_empty()
            || input.candidates.len() > 64
        {
            return Err(StoreError::InvalidVendor);
        }
        let mut aliases = std::collections::BTreeSet::new();
        for c in &input.candidates {
            if !aliases.insert(c.alias.clone())
                || c.alias.is_empty()
                || c.alias.len() > 200
                || !(-1000..=1000).contains(&c.priority)
                || !(1..=10000).contains(&c.weight)
            {
                return Err(StoreError::InvalidVendor);
            }
        }
        let mut tx = self.pool.begin().await?;
        // Serialize creation as well as revision changes of this alias.
        sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended('niu-route-pool:'||$1,0))")
            .bind(&input.alias)
            .execute(&mut *tx)
            .await?;
        let prior: Option<(i64, Option<Uuid>)> = sqlx::query_as(
            "SELECT revision,organization_id FROM model_route_pools WHERE alias=$1 FOR UPDATE",
        )
        .bind(&input.alias)
        .fetch_optional(&mut *tx)
        .await?;
        if prior.as_ref().map_or(0, |v| v.0) != input.revision
            || prior.is_some_and(|v| v.1 != input.organization_id)
        {
            return Err(StoreError::Conflict);
        }
        for alias in aliases {
            let row=sqlx::query("SELECT m.capabilities,m.pricing,o.organization_id FROM vendor_models m JOIN vendors v ON v.id=m.vendor_id LEFT JOIN personal_vendor_ownership o ON o.vendor_id=v.id WHERE m.alias=$1 FOR SHARE OF v,m")
                .bind(&alias).fetch_optional(&mut *tx).await?.ok_or(StoreError::InvalidVendor)?;
            let owner: Option<Uuid> = row.get("organization_id");
            let caps: serde_json::Value = row.get("capabilities");
            let pricing: Option<serde_json::Value> = row.get("pricing");
            // Video job recovery remains pinned to its original mapping.
            // Shared pools require a bounded route price; personal pools never bill retail.
            if owner != input.organization_id
                || caps.get("video_schema").is_some()
                || (owner.is_none() && pricing.is_none())
            {
                return Err(StoreError::InvalidVendor);
            }
        }
        let revision = input.revision + 1;
        let candidates =
            serde_json::to_value(&input.candidates).map_err(|_| StoreError::InvalidVendor)?;
        if prior.is_none() {
            sqlx::query("INSERT INTO model_route_pools(alias,organization_id,enabled,revision,candidates) VALUES($1,$2,$3,$4,$5)")
                .bind(&input.alias).bind(input.organization_id).bind(input.enabled).bind(revision).bind(&candidates).execute(&mut *tx).await?;
        } else {
            sqlx::query(
                "UPDATE model_route_pools SET enabled=$2,revision=$3,candidates=$4 WHERE alias=$1",
            )
            .bind(&input.alias)
            .bind(input.enabled)
            .bind(revision)
            .bind(&candidates)
            .execute(&mut *tx)
            .await?;
        }
        sqlx::query("INSERT INTO model_route_pool_history(alias,revision,organization_id,enabled,candidates) VALUES($1,$2,$3,$4,$5)")
            .bind(&input.alias).bind(revision).bind(input.organization_id).bind(input.enabled).bind(candidates).execute(&mut *tx).await?;
        tx.commit().await?;
        Ok(revision)
    }

    pub async fn model_route_pool_history(
        &self,
        alias: &str,
        before: Option<i64>,
    ) -> Result<Vec<serde_json::Value>, StoreError> {
        if before.is_some_and(|v| v <= 0) {
            return Err(StoreError::InvalidVendor);
        }
        Ok(sqlx::query_scalar("SELECT to_jsonb(h) FROM model_route_pool_history h WHERE alias=$1 AND ($2::bigint IS NULL OR revision<$2) ORDER BY revision DESC LIMIT 100")
            .bind(alias).bind(before).fetch_all(&self.pool).await?)
    }
}
