use crate::{Store, StoreError};
use serde::{Deserialize, Serialize};
use serde_json::json;
use sqlx::Row;
use uuid::Uuid;

#[derive(Clone, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct RoutePoolCandidate {
    pub alias: String,
    pub priority: i32,
    pub weight: u32,
    pub enabled: bool,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct RoutePoolRuleConditions {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub protocol: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub streaming: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub vision: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tools: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub structured_output: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reasoning: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub min_input_tokens: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_input_tokens: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub min_output_tokens: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_output_tokens: Option<u64>,
}

impl RoutePoolRuleConditions {
    pub fn is_empty(&self) -> bool {
        self.protocol.is_none()
            && self.streaming.is_none()
            && self.vision.is_none()
            && self.tools.is_none()
            && self.structured_output.is_none()
            && self.reasoning.is_none()
            && self.min_input_tokens.is_none()
            && self.max_input_tokens.is_none()
            && self.min_output_tokens.is_none()
            && self.max_output_tokens.is_none()
    }

    pub fn is_valid(&self) -> bool {
        if self.is_empty() {
            return false;
        }
        if let Some(protocol) = &self.protocol
            && !matches!(protocol.as_str(), "chat" | "responses" | "messages")
        {
            return false;
        }
        if let (Some(min), Some(max)) = (self.min_input_tokens, self.max_input_tokens)
            && min > max
        {
            return false;
        }
        if let (Some(min), Some(max)) = (self.min_output_tokens, self.max_output_tokens)
            && min > max
        {
            return false;
        }
        if self.min_input_tokens.is_some_and(|v| v > 10_000_000)
            || self
                .max_input_tokens
                .is_some_and(|v| v == 0 || v > 10_000_000)
            || self.min_output_tokens.is_some_and(|v| v > 10_000_000)
            || self
                .max_output_tokens
                .is_some_and(|v| v == 0 || v > 10_000_000)
        {
            return false;
        }
        true
    }
}

fn default_rule_enabled() -> bool {
    true
}

#[derive(Clone, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct RoutePoolRule {
    pub id: String,
    pub name: String,
    #[serde(default = "default_rule_enabled")]
    pub enabled: bool,
    #[serde(default)]
    pub conditions: RoutePoolRuleConditions,
    pub candidates: Vec<RoutePoolCandidate>,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum RoutePoolDefaultAction {
    #[default]
    Candidates,
    Reject,
}

impl RoutePoolDefaultAction {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Candidates => "candidates",
            Self::Reject => "reject",
        }
    }
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum RoutePoolBillingMode {
    #[default]
    PoolTariff,
    CandidateTariff,
}

impl RoutePoolBillingMode {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::PoolTariff => "pool_tariff",
            Self::CandidateTariff => "candidate_tariff",
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Deserialize, Serialize)]
pub struct ModelRoutePool {
    pub alias: String,
    #[serde(default)]
    pub organization_id: Option<Uuid>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub project_id: Option<Uuid>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub display_name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub slug: Option<String>,
    #[serde(default)]
    pub public_catalog: bool,
    #[serde(default)]
    pub billing_mode: RoutePoolBillingMode,
    pub enabled: bool,
    pub revision: i64,
    pub candidates: Vec<RoutePoolCandidate>,
    #[serde(default)]
    pub rules: Vec<RoutePoolRule>,
    #[serde(default)]
    pub default_action: RoutePoolDefaultAction,
}

pub fn is_valid_pool_slug(slug: &str) -> bool {
    if slug.is_empty()
        || slug.len() > 80
        || matches!(slug, "index" | "history" | "preview" | "audit" | "new")
        || slug.starts_with('-')
        || slug.ends_with('-')
        || slug.contains("--")
    {
        return false;
    }
    slug.bytes()
        .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
}

pub fn validate_pool_candidates_and_rules(
    candidates: &[RoutePoolCandidate],
    rules: &[RoutePoolRule],
) -> Result<std::collections::BTreeSet<String>, StoreError> {
    if candidates.is_empty() || candidates.len() > 64 || rules.len() > 32 {
        return Err(StoreError::InvalidVendor);
    }
    let mut aliases = std::collections::BTreeSet::new();
    for c in candidates {
        if !aliases.insert(c.alias.clone())
            || c.alias.is_empty()
            || c.alias.len() > 200
            || !(-1000..=1000).contains(&c.priority)
            || !(1..=10000).contains(&c.weight)
        {
            return Err(StoreError::InvalidVendor);
        }
    }
    let mut rule_ids = std::collections::BTreeSet::new();
    for rule in rules {
        let trimmed_id = rule.id.trim();
        let trimmed_name = rule.name.trim();
        if trimmed_id.is_empty()
            || trimmed_id != rule.id
            || rule.id.len() > 100
            || !rule
                .id
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b'.' | b':'))
            || !rule_ids.insert(rule.id.clone())
            || trimmed_name.is_empty()
            || rule.name.len() > 200
            || rule.candidates.is_empty()
            || rule.candidates.len() > 64
            || !rule.conditions.is_valid()
        {
            return Err(StoreError::InvalidVendor);
        }
        let mut rule_aliases = std::collections::BTreeSet::new();
        for rc in &rule.candidates {
            if !aliases.contains(&rc.alias)
                || !rule_aliases.insert(rc.alias.clone())
                || !(-1000..=1000).contains(&rc.priority)
                || !(1..=10000).contains(&rc.weight)
            {
                return Err(StoreError::InvalidVendor);
            }
        }
    }
    Ok(aliases)
}

fn normalize_optional_text(
    input: &Option<String>,
    max_len: usize,
    require_non_empty: bool,
) -> Result<Option<String>, StoreError> {
    let Some(raw) = input else {
        return Ok(None);
    };
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return if require_non_empty {
            Err(StoreError::InvalidVendor)
        } else {
            Ok(None)
        };
    }
    if trimmed.len() > max_len || trimmed.chars().any(char::is_control) {
        return Err(StoreError::InvalidVendor);
    }
    Ok(Some(trimmed.to_owned()))
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

    pub async fn model_route_pool_by_slug(
        &self,
        slug: &str,
    ) -> Result<Option<ModelRoutePool>, StoreError> {
        let value: Option<serde_json::Value> =
            sqlx::query_scalar("SELECT to_jsonb(p) FROM model_route_pools p WHERE slug=$1")
                .bind(slug)
                .fetch_optional(&self.pool)
                .await?;
        value
            .map(serde_json::from_value)
            .transpose()
            .map_err(|_| StoreError::Conflict)
    }

    /// Compatibility model discovery returns every pool, not an arbitrary prefix.
    /// Bound each database fetch while retaining the complete response inventory.
    pub async fn model_route_pools(&self) -> Result<Vec<ModelRoutePool>, StoreError> {
        let mut pools = Vec::new();
        let mut after = None;
        loop {
            let mut page = self.model_route_pool_page(after.as_deref(), 100).await?;
            let has_more = page.len() > 100;
            page.truncate(100);
            after = page.last().map(|pool| pool.alias.clone());
            pools.extend(page);
            if !has_more {
                return Ok(pools);
            }
        }
    }

    /// Bounded keyset page; the extra row tells the caller whether another page exists.
    pub async fn model_route_pool_page(
        &self,
        after: Option<&str>,
        limit: i64,
    ) -> Result<Vec<ModelRoutePool>, StoreError> {
        self.model_route_pool_page_scoped(None, None, after, limit)
            .await
    }

    pub async fn model_route_pool_page_scoped(
        &self,
        organization_id: Option<Uuid>,
        project_id: Option<Uuid>,
        after: Option<&str>,
        limit: i64,
    ) -> Result<Vec<ModelRoutePool>, StoreError> {
        if !(1..=100).contains(&limit) {
            return Err(StoreError::InvalidPrice);
        }
        let values: Vec<serde_json::Value> = match (organization_id, project_id) {
            (None, None) => {
                sqlx::query_scalar(
                    "SELECT to_jsonb(p) FROM model_route_pools p WHERE ($1::text IS NULL OR alias>$1) ORDER BY alias LIMIT $2",
                )
                .bind(after)
                .bind(limit + 1)
                .fetch_all(&self.pool)
                .await?
            }
            (Some(org_id), None) => {
                sqlx::query_scalar(
                    "SELECT to_jsonb(p) FROM model_route_pools p WHERE organization_id=$1 AND ($2::text IS NULL OR alias>$2) ORDER BY alias LIMIT $3",
                )
                .bind(org_id)
                .bind(after)
                .bind(limit + 1)
                .fetch_all(&self.pool)
                .await?
            }
            (Some(org_id), Some(proj_id)) => {
                sqlx::query_scalar(
                    "SELECT to_jsonb(p) FROM model_route_pools p WHERE organization_id=$1 AND project_id=$2 AND ($3::text IS NULL OR alias>$3) ORDER BY alias LIMIT $4",
                )
                .bind(org_id)
                .bind(proj_id)
                .bind(after)
                .bind(limit + 1)
                .fetch_all(&self.pool)
                .await?
            }
            (None, Some(_)) => return Err(StoreError::InvalidVendor),
        };
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
            || (input.project_id.is_some() && input.organization_id.is_none())
            || (input.public_catalog && input.organization_id.is_some())
        {
            return Err(StoreError::InvalidVendor);
        }
        let display_name = normalize_optional_text(&input.display_name, 200, false)?;
        let description = normalize_optional_text(&input.description, 4000, false)?;
        let explicit_slug = match &input.slug {
            Some(s) if !s.trim().is_empty() => {
                let s = s.trim();
                if !is_valid_pool_slug(s) {
                    return Err(StoreError::InvalidVendor);
                }
                Some(s.to_owned())
            }
            _ => None,
        };
        let aliases = validate_pool_candidates_and_rules(&input.candidates, &input.rules)?;
        let mut tx = self.begin_route_write().await?;
        // Serialize creation as well as revision changes of this alias.
        sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended('niu-route-pool:'||$1,0))")
            .bind(&input.alias)
            .execute(&mut *tx)
            .await?;
        let prior: Option<(i64, Option<Uuid>, Option<Uuid>, Option<String>)> = sqlx::query_as(
            "SELECT revision,organization_id,project_id,slug FROM model_route_pools WHERE alias=$1 FOR UPDATE",
        )
        .bind(&input.alias)
        .fetch_optional(&mut *tx)
        .await?;
        if prior.as_ref().map_or(0, |v| v.0) != input.revision
            || prior
                .as_ref()
                .is_some_and(|v| v.1 != input.organization_id || v.2 != input.project_id)
        {
            return Err(StoreError::Conflict);
        }
        if let (Some(org_id), Some(proj_id)) = (input.organization_id, input.project_id) {
            let exists: bool = sqlx::query_scalar(
                "SELECT EXISTS(SELECT 1 FROM projects WHERE id=$1 AND organization_id=$2)",
            )
            .bind(proj_id)
            .bind(org_id)
            .fetch_one(&mut *tx)
            .await?;
            if !exists {
                return Err(StoreError::InvalidVendor);
            }
        }
        let alias_list: Vec<String> = aliases.into_iter().collect();
        let rows = sqlx::query(
            "SELECT m.capabilities,m.pricing,o.organization_id \
             FROM vendor_models m JOIN vendors v ON v.id=m.vendor_id \
             LEFT JOIN personal_vendor_ownership o ON o.vendor_id=v.id \
             WHERE m.alias = ANY($1) ORDER BY v.id, m.alias FOR SHARE OF v,m",
        )
        .bind(&alias_list)
        .fetch_all(&mut *tx)
        .await?;
        if rows.len() != alias_list.len() {
            return Err(StoreError::InvalidVendor);
        }
        for row in rows {
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
        let rules = serde_json::to_value(&input.rules).map_err(|_| StoreError::InvalidVendor)?;
        let default_action = input.default_action.as_str();
        let billing_mode = input.billing_mode.as_str();
        let slug_seed = explicit_slug.or_else(|| {
            prior
                .as_ref()
                .and_then(|p| p.3.clone())
                .or_else(|| {
                    Some(crate::workspace_creation::workspace_slug_from_name(
                        display_name.as_deref().unwrap_or(&input.alias),
                    ))
                })
        });
        let saved_slug: Option<String> = if prior.is_none() {
            sqlx::query_scalar(
                "INSERT INTO model_route_pools(alias,organization_id,project_id,display_name,description,slug,public_catalog,billing_mode,enabled,revision,candidates,rules,default_action) \
                 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING slug",
            )
            .bind(&input.alias)
            .bind(input.organization_id)
            .bind(input.project_id)
            .bind(&display_name)
            .bind(&description)
            .bind(&slug_seed)
            .bind(input.public_catalog)
            .bind(billing_mode)
            .bind(input.enabled)
            .bind(revision)
            .bind(&candidates)
            .bind(&rules)
            .bind(default_action)
            .fetch_one(&mut *tx)
            .await?
        } else {
            sqlx::query_scalar(
                "UPDATE model_route_pools \
                 SET display_name=$2,description=$3,slug=$4,public_catalog=$5,billing_mode=$6,enabled=$7,revision=$8,candidates=$9,rules=$10,default_action=$11 \
                 WHERE alias=$1 RETURNING slug",
            )
            .bind(&input.alias)
            .bind(&display_name)
            .bind(&description)
            .bind(&slug_seed)
            .bind(input.public_catalog)
            .bind(billing_mode)
            .bind(input.enabled)
            .bind(revision)
            .bind(&candidates)
            .bind(&rules)
            .bind(default_action)
            .fetch_one(&mut *tx)
            .await?
        };
        sqlx::query(
            "INSERT INTO model_route_pool_history(alias,revision,organization_id,project_id,display_name,description,slug,public_catalog,billing_mode,enabled,candidates,rules,default_action) \
             VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)",
        )
        .bind(&input.alias)
        .bind(revision)
        .bind(input.organization_id)
        .bind(input.project_id)
        .bind(&display_name)
        .bind(&description)
        .bind(&saved_slug)
        .bind(input.public_catalog)
        .bind(billing_mode)
        .bind(input.enabled)
        .bind(candidates)
        .bind(rules)
        .bind(default_action)
        .execute(&mut *tx)
        .await?;
        self.commit_route_write(tx).await?;
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

    /// Audit a Model Pool's routing and billing strategy across its configured
    /// candidates, published retail tariffs, supplier readiness, and observed traffic.
    pub async fn model_route_pool_audit(
        &self,
        alias: &str,
        days: i32,
    ) -> Result<serde_json::Value, StoreError> {
        if !(1..=365).contains(&days) {
            return Err(StoreError::InvalidPrice);
        }
        let pool = self
            .model_route_pool(alias)
            .await?
            .ok_or(StoreError::Conflict)?;

        let winning_priority = pool
            .candidates
            .iter()
            .filter(|c| c.enabled)
            .map(|c| c.priority)
            .max();
        let total_winning_weight: u64 = winning_priority.map_or(0, |prio| {
            pool.candidates
                .iter()
                .filter(|c| c.enabled && c.priority == prio)
                .map(|c| u64::from(c.weight))
                .sum()
        });

        let candidate_aliases: Vec<String> =
            pool.candidates.iter().map(|c| c.alias.clone()).collect();
        let mut all_price_aliases = candidate_aliases.clone();
        all_price_aliases.push(pool.alias.clone());

        // Check retail price heads / standard revisions and Credits tariffs for the pool and candidates.
        let retail_rows = sqlx::query(
            "SELECT h.model_alias, h.currency, s.schedule \
             FROM platform_retail_price_heads h \
             JOIN platform_retail_standard_revisions s ON s.head_id = h.id AND s.id = h.current_revision \
             WHERE h.model_alias = ANY($1) AND h.rate_kind = 'text'",
        )
        .bind(&all_price_aliases)
        .fetch_all(&self.pool)
        .await?;
        let mut retail_by_alias: std::collections::BTreeMap<
            String,
            (String, Option<i64>, Option<i64>),
        > = std::collections::BTreeMap::new();
        for row in retail_rows {
            let model_alias: String = row.get("model_alias");
            let currency: String = row.get("currency");
            let schedule: serde_json::Value = row.get("schedule");
            let prompt_rate = schedule
                .get("prompt_rate")
                .and_then(|v| v.as_str().and_then(|s| s.parse::<i64>().ok()).or_else(|| v.as_i64()));
            let completion_rate = schedule
                .get("completion_rate")
                .and_then(|v| v.as_str().and_then(|s| s.parse::<i64>().ok()).or_else(|| v.as_i64()));
            retail_by_alias.insert(model_alias, (currency, prompt_rate, completion_rate));
        }

        let unit_priced_aliases: Vec<String> = sqlx::query_scalar(
            "SELECT DISTINCT model_alias FROM customer_unit_text_tariffs WHERE model_alias = ANY($1)",
        )
        .bind(&all_price_aliases)
        .fetch_all(&self.pool)
        .await?;
        let unit_priced_set: std::collections::BTreeSet<String> =
            unit_priced_aliases.into_iter().collect();

        // Check route readiness and upstream pricing for each candidate.
        let route_rows = sqlx::query(
            "SELECT m.alias, m.enabled AS model_enabled, v.enabled AS vendor_enabled, \
                    EXISTS(SELECT 1 FROM vendor_cooldowns c WHERE c.vendor_id = v.id AND c.cooldown_until > statement_timestamp()) AS cooling_down, \
                    CASE WHEN $2::uuid IS NOT NULL THEN TRUE ELSE niu_supplier_model_route_available(m.alias) END AS supplier_available, \
                    COALESCE(r.currency, m.pricing->>'currency') AS upstream_currency, \
                    COALESCE(r.prompt_rate, (m.pricing->>'cash_prompt_rate')::bigint) AS upstream_prompt_rate, \
                    COALESCE(r.completion_rate, (m.pricing->>'cash_completion_rate')::bigint) AS upstream_completion_rate \
             FROM vendor_models m \
             JOIN vendors v ON v.id = m.vendor_id \
             LEFT JOIN provider_offers o ON o.model_alias = m.alias AND o.vendor_id = m.vendor_id \
             LEFT JOIN provider_offer_revisions r ON r.id = o.current_revision \
             WHERE m.alias = ANY($1)",
        )
        .bind(&candidate_aliases)
        .bind(pool.organization_id)
        .fetch_all(&self.pool)
        .await?;
        let mut route_info_by_alias = std::collections::BTreeMap::new();
        for row in route_rows {
            let candidate_alias: String = row.get("alias");
            route_info_by_alias.insert(
                candidate_alias,
                (
                    row.get::<bool, _>("model_enabled"),
                    row.get::<bool, _>("vendor_enabled"),
                    row.get::<bool, _>("cooling_down"),
                    row.get::<bool, _>("supplier_available"),
                    row.get::<Option<String>, _>("upstream_currency"),
                    row.get::<Option<i64>, _>("upstream_prompt_rate"),
                    row.get::<Option<i64>, _>("upstream_completion_rate"),
                ),
            );
        }

        // Observed traffic per candidate from managed_attempt_routes over the window.
        let traffic_rows = sqlx::query(
            "SELECT mar.model_alias, \
                    COUNT(*)::bigint AS observed_requests, \
                    COUNT(*) FILTER (WHERE a.execution = 'confirmed_completed')::bigint AS completed_requests, \
                    COUNT(*) FILTER (WHERE a.execution <> 'confirmed_completed' AND a.execution <> 'not_sent')::bigint AS failed_requests, \
                    COALESCE(SUM(a.prompt_tokens) FILTER (WHERE a.usage_confidence = 'provider_reported'), 0)::bigint AS prompt_tokens, \
                    COALESCE(SUM(a.completion_tokens) FILTER (WHERE a.usage_confidence = 'provider_reported'), 0)::bigint AS completion_tokens, \
                    ROUND(AVG(t.total_ms::numeric) FILTER (WHERE t.complete))::bigint AS avg_latency_ms, \
                    percentile_disc(0.95) WITHIN GROUP (ORDER BY t.total_ms) FILTER (WHERE t.complete)::bigint AS p95_latency_ms, \
                    COALESCE(SUM(cc.amount_nanos), 0)::bigint AS customer_revenue_nanos, \
                    COALESCE(SUM(COALESCE(pe.amount_nanos, ce.cash_nanos)), 0)::bigint AS upstream_cost_nanos \
             FROM managed_attempt_routes mar \
             JOIN attempts a ON a.id = mar.attempt_id \
             LEFT JOIN request_timings t ON t.attempt_id = a.id \
             LEFT JOIN customer_charges cc ON cc.attempt_id = a.id \
             LEFT JOIN provider_earnings pe ON pe.attempt_id = a.id \
             LEFT JOIN cost_entries ce ON ce.attempt_id = a.id \
             WHERE mar.pool_alias = $1 \
               AND a.created_at >= statement_timestamp() - make_interval(days => $2) \
             GROUP BY mar.model_alias",
        )
        .bind(&pool.alias)
        .bind(days)
        .fetch_all(&self.pool)
        .await?;

        let mut traffic_by_alias = std::collections::BTreeMap::new();
        let mut total_requests: i64 = 0;
        let mut total_completed: i64 = 0;
        let mut total_failed: i64 = 0;
        let mut total_prompt_tokens: i64 = 0;
        let mut total_completion_tokens: i64 = 0;
        let mut total_revenue_nanos: i64 = 0;
        let mut total_cost_nanos: i64 = 0;

        for row in traffic_rows {
            let model_alias: String = row.get("model_alias");
            let observed: i64 = row.get("observed_requests");
            let completed: i64 = row.get("completed_requests");
            let failed: i64 = row.get("failed_requests");
            let prompt_tokens: i64 = row.get("prompt_tokens");
            let completion_tokens: i64 = row.get("completion_tokens");
            let avg_latency_ms: Option<i64> = row.get("avg_latency_ms");
            let p95_latency_ms: Option<i64> = row.get("p95_latency_ms");
            let revenue_nanos: i64 = row.get("customer_revenue_nanos");
            let cost_nanos: i64 = row.get("upstream_cost_nanos");

            total_requests += observed;
            total_completed += completed;
            total_failed += failed;
            total_prompt_tokens += prompt_tokens;
            total_completion_tokens += completion_tokens;
            total_revenue_nanos += revenue_nanos;
            total_cost_nanos += cost_nanos;

            traffic_by_alias.insert(
                model_alias,
                (
                    observed,
                    completed,
                    failed,
                    prompt_tokens,
                    completion_tokens,
                    avg_latency_ms,
                    p95_latency_ms,
                    revenue_nanos,
                    cost_nanos,
                ),
            );
        }

        let pool_retail = retail_by_alias.get(&pool.alias).cloned();
        let pool_has_retail_tariff = pool_retail.is_some();
        let pool_has_credits_tariff = unit_priced_set.contains(&pool.alias);
        let pool_has_tariff = pool_has_retail_tariff || pool_has_credits_tariff;

        let mut findings = Vec::new();
        if pool.organization_id.is_none()
            && pool.billing_mode == RoutePoolBillingMode::PoolTariff
            && !pool_has_tariff
        {
            findings.push(json!({
                "code": "unpriced_pool_tariff",
                "severity": "warning",
                "candidate_alias": null,
                "message": "Pool billing_mode is pool_tariff, but no platform retail price or Credits tariff is published for the pool alias."
            }));
        }

        let mut candidate_audits = Vec::with_capacity(pool.candidates.len());
        for c in &pool.candidates {
            let winning_tier = c.enabled && Some(c.priority) == winning_priority;
            let configured_share_percent = if winning_tier && total_winning_weight > 0 {
                ((f64::from(c.weight) * 10000.0) / (total_winning_weight as f64)).round() / 100.0
            } else {
                0.0
            };
            let (
                model_enabled,
                vendor_enabled,
                cooling_down,
                supplier_available,
                upstream_currency,
                upstream_prompt_rate,
                upstream_completion_rate,
            ) = route_info_by_alias.get(&c.alias).cloned().unwrap_or((
                false, false, false, false, None, None, None,
            ));
            let ready = c.enabled
                && model_enabled
                && vendor_enabled
                && !cooling_down
                && supplier_available;

            if winning_tier && !ready {
                findings.push(json!({
                    "code": "unavailable_primary_candidate",
                    "severity": "warning",
                    "candidate_alias": c.alias,
                    "message": format!("Primary candidate '{}' is currently unavailable due to route, credential, cooldown, or supplier readiness.", c.alias)
                }));
            }

            let candidate_retail = retail_by_alias.get(&c.alias).cloned();
            let has_retail_tariff = candidate_retail.is_some();
            let has_credits_tariff = unit_priced_set.contains(&c.alias);
            let candidate_has_tariff = has_retail_tariff || has_credits_tariff;

            if pool.organization_id.is_none()
                && pool.billing_mode == RoutePoolBillingMode::CandidateTariff
                && c.enabled
                && !candidate_has_tariff
            {
                findings.push(json!({
                    "code": "unpriced_candidate_tariff",
                    "severity": "warning",
                    "candidate_alias": c.alias,
                    "message": format!("Candidate '{}' is enabled under candidate_tariff mode without a published platform retail price or Credits tariff.", c.alias)
                }));
            }

            // Check margin inversion when billing_mode is pool_tariff and currencies match.
            let mut margin_inversion = false;
            if pool.organization_id.is_none()
                && pool.billing_mode == RoutePoolBillingMode::PoolTariff
                && let Some((ref p_curr, Some(p_prompt), Some(p_comp))) = pool_retail
                && upstream_currency.as_deref() == Some(p_curr.as_str())
                && (upstream_prompt_rate.is_some_and(|u| u > p_prompt)
                    || upstream_completion_rate.is_some_and(|u| u > p_comp))
            {
                margin_inversion = true;
                findings.push(json!({
                    "code": "negative_margin_candidate",
                    "severity": "critical",
                    "candidate_alias": c.alias,
                    "message": format!("Candidate '{}' upstream token rate exceeds the pool's unified retail selling rate.", c.alias)
                }));
            }

            let tariff_configured = if pool.billing_mode == RoutePoolBillingMode::PoolTariff {
                pool_has_tariff
            } else {
                candidate_has_tariff
            };
            let margin_status = if margin_inversion {
                "inverted_margin"
            } else if !tariff_configured && pool.organization_id.is_none() {
                "unpriced_customer"
            } else if !supplier_available && pool.organization_id.is_none() {
                "no_qualified_supply"
            } else {
                "healthy"
            };

            let (
                observed_requests,
                completed_requests,
                failed_requests,
                prompt_tokens,
                completion_tokens,
                avg_latency_ms,
                p95_latency_ms,
                revenue_nanos,
                cost_nanos,
            ) = traffic_by_alias
                .get(&c.alias)
                .copied()
                .unwrap_or((0, 0, 0, 0, 0, None, None, 0, 0));

            let observed_share_percent = if total_requests > 0 {
                ((observed_requests as f64 * 10000.0) / (total_requests as f64)).round() / 100.0
            } else {
                0.0
            };

            let (retail_currency, retail_prompt_rate, retail_completion_rate) = match &candidate_retail {
                Some((curr, p, comp)) => (
                    Some(curr.clone()),
                    p.map(|v| v.to_string()),
                    comp.map(|v| v.to_string()),
                ),
                None => (None, None, None),
            };

            candidate_audits.push(json!({
                "alias": c.alias,
                "priority": c.priority,
                "weight": c.weight,
                "enabled": c.enabled,
                "winning_tier": winning_tier,
                "ready": ready,
                "cooling_down": cooling_down,
                "supplier_available": supplier_available,
                "tariff_configured": tariff_configured,
                "has_retail_tariff": has_retail_tariff,
                "retail_currency": retail_currency,
                "retail_prompt_rate": retail_prompt_rate,
                "retail_completion_rate": retail_completion_rate,
                "has_credits_tariff": has_credits_tariff,
                "qualified_offer_count": i32::from(supplier_available),
                "min_supplier_prompt_rate": upstream_prompt_rate.map(|v| v.to_string()),
                "min_supplier_completion_rate": upstream_completion_rate.map(|v| v.to_string()),
                "margin_status": margin_status,
                "margin_inversion": margin_inversion,
                "configured_share_percent": configured_share_percent,
                "observed_requests": observed_requests,
                "observed_attempts": observed_requests,
                "observed_share_percent": observed_share_percent,
                "completed_requests": completed_requests,
                "completed_attempts": completed_requests,
                "failed_requests": failed_requests,
                "failed_attempts": failed_requests,
                "prompt_tokens": prompt_tokens,
                "completion_tokens": completion_tokens,
                "average_latency_ms": avg_latency_ms,
                "avg_duration_ms": avg_latency_ms,
                "p95_latency_ms": p95_latency_ms,
                "p95_duration_ms": p95_latency_ms,
                "customer_revenue_nanos": revenue_nanos.to_string(),
                "customer_charge_nanos": revenue_nanos.to_string(),
                "upstream_cost_nanos": cost_nanos.to_string(),
                "supplier_cost_nanos": cost_nanos.to_string(),
                "net_margin_nanos": (revenue_nanos - cost_nanos).to_string(),
            }));
        }

        if findings.is_empty() {
            findings.push(json!({
                "code": "strategy_healthy",
                "severity": "healthy",
                "candidate_alias": null,
                "message": "Pool routing and billing configuration passed all checks."
            }));
        }

        let (pool_currency, pool_prompt_rate, pool_completion_rate) = match &pool_retail {
            Some((curr, p, comp)) => (
                Some(curr.clone()),
                p.map(|v| v.to_string()),
                comp.map(|v| v.to_string()),
            ),
            None => (None, None, None),
        };
        let (from, until): (String, String) = sqlx::query_as(
            "SELECT to_char(statement_timestamp() AT TIME ZONE 'UTC' - make_interval(days => $1), 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"'), \
                    to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"')",
        )
        .bind(days)
        .fetch_one(&self.pool)
        .await?;

        Ok(json!({
            "alias": pool.alias,
            "display_name": pool.display_name,
            "slug": pool.slug.unwrap_or_else(|| crate::workspace_creation::workspace_slug_from_name(&pool.alias)),
            "billing_mode": pool.billing_mode,
            "public_catalog": pool.public_catalog,
            "enabled": pool.enabled,
            "revision": pool.revision,
            "rules_count": pool.rules.len(),
            "days": days,
            "window_days": days,
            "from": from,
            "until": until,
            "pool_tariff_configured": pool_has_tariff,
            "pool_tariff": {
                "has_retail_tariff": pool_has_retail_tariff,
                "currency": pool_currency,
                "prompt_rate": pool_prompt_rate,
                "completion_rate": pool_completion_rate,
                "has_credits_tariff": pool_has_credits_tariff,
            },
            "totals": {
                "observed_attempts": total_requests,
                "completed_attempts": total_completed,
                "failed_attempts": total_failed,
                "customer_charge_nanos": total_revenue_nanos.to_string(),
                "supplier_cost_nanos": total_cost_nanos.to_string(),
                "net_margin_nanos": (total_revenue_nanos - total_cost_nanos).to_string(),
            },
            "summary": {
                "total_requests": total_requests,
                "completed_requests": total_completed,
                "failed_requests": total_failed,
                "prompt_tokens": total_prompt_tokens,
                "completion_tokens": total_completion_tokens,
                "customer_revenue_nanos": total_revenue_nanos,
                "upstream_cost_nanos": total_cost_nanos,
                "net_margin_nanos": total_revenue_nanos - total_cost_nanos,
            },
            "findings": findings,
            "candidates": candidate_audits,
        }))
    }
}
