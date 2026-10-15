use sha2::{Digest, Sha256};
use sqlx::Row;
use uuid::Uuid;

use crate::{Store, StoreError, TenantScope};

#[derive(sqlx::FromRow, serde::Serialize)]
pub struct KeyView {
    pub id: Uuid,
    pub revision: i64,
    pub name: String,
    pub allowed_models: Vec<String>,
    pub expires_at_ms: Option<i64>,
    /// Latest durable dispatch intent; absent does not establish that a key was never authenticated.
    pub last_used_at_ms: Option<i64>,
    pub revoked: bool,
    pub expired: bool,
}

/// The secret is returned exactly once. Deliberately no Debug/Serialize impl.
pub struct IssuedKey {
    pub id: Uuid,
    pub token: String,
}

/// Constructed only by successful database authentication. Every dispatch
/// revalidates expiry, revocation and model permission in its transaction.
#[derive(Clone)]
pub struct Principal {
    key_id: Uuid,
    scope: TenantScope,
    allowed_models: Vec<String>,
}

impl Principal {
    pub fn allows_model(&self, model: &str) -> bool {
        self.allowed_models
            .iter()
            .any(|allowed| allowed == "*" || allowed == model)
    }

    pub fn allowed_models(&self) -> &[String] {
        &self.allowed_models
    }

    pub fn scope(&self) -> TenantScope {
        self.scope
    }
    pub fn key_id(&self) -> Uuid {
        self.key_id
    }
}

impl Store {
    pub async fn issue_key(
        &self,
        scope: TenantScope,
        name: &str,
        models: &[String],
        ttl_seconds: i64,
    ) -> Result<IssuedKey, StoreError> {
        self.issue_key_with_expiry(scope, name, models, Some(ttl_seconds))
            .await
    }

    /// An explicit absent lifetime means no automatic expiration. Revocation,
    /// grants and shared lineage policies still apply to every request.
    pub async fn issue_key_with_expiry(
        &self,
        scope: TenantScope,
        name: &str,
        models: &[String],
        ttl_seconds: Option<i64>,
    ) -> Result<IssuedKey, StoreError> {
        if name.trim().is_empty()
            || name.len() > 200
            || models.is_empty()
            || (models.iter().any(|m| m == "*") && models.len() != 1)
            || models.iter().any(|m| m.is_empty() || m.len() > 200)
            || ttl_seconds.is_some_and(|ttl| !(1..=31_536_000).contains(&ttl))
        {
            return Err(StoreError::InvalidKey);
        }
        let id = Uuid::new_v4();
        // Two independent random UUIDs provide 244 random bits. The key id is
        // separate from the secret and is safe to expose for administration.
        let token = format!("niu_{}{}", Uuid::new_v4().simple(), Uuid::new_v4().simple());
        let hash = Sha256::digest(token.as_bytes()).to_vec();
        // Issuance and its audit record commit together; bound contention on
        // either write so a failed request never leaves an undisclosed key.
        let mut tx = self.begin_bounded_recording().await?;
        sqlx::query("INSERT INTO api_keys (id, organization_id, project_id, name, token_hash, allowed_models, expires_at) VALUES ($1,$2,$3,$4,$5,$6,CASE WHEN $7::double precision IS NULL THEN 'infinity'::timestamptz ELSE clock_timestamp() + $7 * interval '1 second' END)")
            .bind(id).bind(scope.organization_id).bind(scope.project_id).bind(name).bind(hash).bind(models).bind(ttl_seconds.map(|ttl| ttl as f64))
            .execute(&mut *tx).await?;
        sqlx::query("INSERT INTO key_audit_events (id,organization_id,project_id,key_id,action) VALUES ($1,$2,$3,$4,'issued')")
            .bind(Uuid::new_v4()).bind(scope.organization_id).bind(scope.project_id).bind(id).execute(&mut *tx).await?;
        tx.commit().await?;
        Ok(IssuedKey { id, token })
    }

    pub async fn authenticate(&self, token: &str) -> Result<Principal, StoreError> {
        if token.len() != 68 || !token.starts_with("niu_") {
            return Err(StoreError::Unauthorized);
        }
        let hash = Sha256::digest(token.as_bytes()).to_vec();
        let mut snapshot = self.begin_bounded_read_snapshot().await?;
        let row = sqlx::query("SELECT id, organization_id, project_id, allowed_models FROM api_keys WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > clock_timestamp()")
            .bind(hash).fetch_optional(&mut *snapshot).await?;
        snapshot.commit().await?;
        let row = row.ok_or(StoreError::Unauthorized)?;
        Ok(Principal {
            allowed_models: row.get("allowed_models"),
            key_id: row.get("id"),
            scope: TenantScope {
                organization_id: row.get("organization_id"),
                project_id: row.get("project_id"),
            },
        })
    }

    pub async fn authenticate_with_ip(
        &self,
        token: &str,
        source: Option<std::net::IpAddr>,
    ) -> Result<Principal, StoreError> {
        if token.len() != 68 || !token.starts_with("niu_") {
            return Err(StoreError::Unauthorized);
        }
        let hash = Sha256::digest(token.as_bytes()).to_vec();
        let mut snapshot = self.begin_bounded_read_snapshot().await?;
        let row = sqlx::query(
            "SELECT k.id, k.organization_id, k.project_id, k.allowed_models, \
             CASE WHEN p.revision IS NULL OR p.allowed_cidrs IS NULL THEN true \
                  WHEN $2::text IS NULL THEN false \
                  ELSE EXISTS(SELECT 1 FROM unnest(p.allowed_cidrs) n WHERE $2::text::inet <<= n::cidr) \
             END AS ip_allowed \
             FROM api_keys k \
             LEFT JOIN key_ip_policies p ON p.spending_root_id = k.spending_root_id \
             WHERE k.token_hash = $1 AND k.revoked_at IS NULL AND k.expires_at > clock_timestamp()",
        )
        .bind(hash)
        .bind(source.map(|ip| ip.to_string()))
        .fetch_optional(&mut *snapshot)
        .await?;
        snapshot.commit().await?;
        let row = row.ok_or(StoreError::Unauthorized)?;
        let ip_allowed: bool = row.get("ip_allowed");
        if !ip_allowed {
            return Err(StoreError::KeyIpDenied);
        }
        Ok(Principal {
            allowed_models: row.get("allowed_models"),
            key_id: row.get("id"),
            scope: TenantScope {
                organization_id: row.get("organization_id"),
                project_id: row.get("project_id"),
            },
        })
    }

    /// Resolve a selected key only after the caller authorizes administrative
    /// access to this exact tenant. Write access is required for inference; reads
    /// may use read access. Inference still revalidates at dispatch.
    pub async fn dashboard_key(
        &self,
        scope: TenantScope,
        id: Uuid,
    ) -> Result<Principal, StoreError> {
        let mut snapshot = self.begin_bounded_read_snapshot().await?;
        let row = sqlx::query("SELECT allowed_models FROM api_keys WHERE organization_id=$1 AND project_id=$2 AND id=$3 AND revoked_at IS NULL AND expires_at > clock_timestamp()")
            .bind(scope.organization_id).bind(scope.project_id).bind(id)
            .fetch_optional(&mut *snapshot).await?;
        snapshot.commit().await?;
        let row = row.ok_or(StoreError::Unauthorized)?;
        Ok(Principal {
            key_id: id,
            scope,
            allowed_models: row.get("allowed_models"),
        })
    }

    pub async fn dashboard_key_with_ip(
        &self,
        scope: TenantScope,
        id: Uuid,
        source: Option<std::net::IpAddr>,
    ) -> Result<Principal, StoreError> {
        let mut snapshot = self.begin_bounded_read_snapshot().await?;
        let row = sqlx::query(
            "SELECT k.allowed_models, \
             CASE WHEN p.revision IS NULL OR p.allowed_cidrs IS NULL THEN true \
                  WHEN $4::text IS NULL THEN false \
                  ELSE EXISTS(SELECT 1 FROM unnest(p.allowed_cidrs) n WHERE $4::text::inet <<= n::cidr) \
             END AS ip_allowed \
             FROM api_keys k \
             LEFT JOIN key_ip_policies p ON p.spending_root_id = k.spending_root_id \
             WHERE k.organization_id=$1 AND k.project_id=$2 AND k.id=$3 AND k.revoked_at IS NULL AND k.expires_at > clock_timestamp()",
        )
        .bind(scope.organization_id)
        .bind(scope.project_id)
        .bind(id)
        .bind(source.map(|ip| ip.to_string()))
        .fetch_optional(&mut *snapshot)
        .await?;
        snapshot.commit().await?;
        let row = row.ok_or(StoreError::Unauthorized)?;
        let ip_allowed: bool = row.get("ip_allowed");
        if !ip_allowed {
            return Err(StoreError::KeyIpDenied);
        }
        Ok(Principal {
            key_id: id,
            scope,
            allowed_models: row.get("allowed_models"),
        })
    }

    /// Look up an active key by its ID so a console session passing `X-Niu-Key-Id`
    /// on `/v1/*` can resolve the key's workspace scope before checking operator permissions.
    pub async fn dashboard_key_by_id(&self, id: Uuid) -> Result<Principal, StoreError> {
        let (principal, _) = self.dashboard_key_by_id_with_ip(id, None).await?;
        Ok(principal)
    }

    pub async fn dashboard_key_by_id_with_ip(
        &self,
        id: Uuid,
        source: Option<std::net::IpAddr>,
    ) -> Result<(Principal, bool), StoreError> {
        let mut snapshot = self.begin_bounded_read_snapshot().await?;
        let row = sqlx::query(
            "SELECT k.organization_id, k.project_id, k.allowed_models, \
             CASE WHEN p.revision IS NULL OR p.allowed_cidrs IS NULL THEN true \
                  WHEN $2::text IS NULL THEN false \
                  ELSE EXISTS(SELECT 1 FROM unnest(p.allowed_cidrs) n WHERE $2::text::inet <<= n::cidr) \
             END AS ip_allowed \
             FROM api_keys k \
             LEFT JOIN key_ip_policies p ON p.spending_root_id = k.spending_root_id \
             WHERE k.id=$1 AND k.revoked_at IS NULL AND k.expires_at > clock_timestamp()",
        )
        .bind(id)
        .bind(source.map(|ip| ip.to_string()))
        .fetch_optional(&mut *snapshot)
        .await?;
        snapshot.commit().await?;
        let row = row.ok_or(StoreError::Unauthorized)?;
        let ip_allowed: bool = row.get("ip_allowed");
        Ok((
            Principal {
                key_id: id,
                scope: TenantScope {
                    organization_id: row.get("organization_id"),
                    project_id: row.get("project_id"),
                },
                allowed_models: row.get("allowed_models"),
            },
            ip_allowed,
        ))
    }

    /// Self-introspection for `GET /v1/key`. Exposes key label, model grants,
    /// expiration, spending limits, and rate/concurrency limits without internal UUIDs.
    pub async fn key_introspection(
        &self,
        principal: &Principal,
    ) -> Result<serde_json::Value, StoreError> {
        let scope = principal.scope;
        let id = principal.key_id;
        let key: KeyView = sqlx::query_as(
            "SELECT k.id,k.revision,k.name,k.allowed_models,CASE WHEN isfinite(k.expires_at) THEN floor(extract(epoch FROM k.expires_at)*1000)::bigint END AS expires_at_ms,(SELECT floor(extract(epoch FROM a.dispatched_at)*1000)::bigint FROM attempts a WHERE a.organization_id=k.organization_id AND a.project_id=k.project_id AND a.api_key_id=k.id AND a.dispatched_at IS NOT NULL ORDER BY a.dispatched_at DESC LIMIT 1) AS last_used_at_ms,k.revoked_at IS NOT NULL AS revoked,k.expires_at <= clock_timestamp() AS expired FROM api_keys k WHERE k.organization_id=$1 AND k.project_id=$2 AND k.id=$3",
        )
        .bind(scope.organization_id)
        .bind(scope.project_id)
        .bind(id)
        .fetch_optional(&self.pool)
        .await?
        .ok_or(StoreError::Unauthorized)?;

        let mut enriched = self
            .enrich_key_views(scope, vec![key])
            .await?
            .into_iter()
            .next()
            .ok_or(StoreError::Unauthorized)?;
        let obj = enriched.as_object_mut().ok_or(StoreError::Unauthorized)?;
        let name = obj.remove("name").unwrap_or(serde_json::Value::Null);
        let allowed_models = obj
            .remove("allowed_models")
            .unwrap_or(serde_json::Value::Null);
        let expires_at_ms = obj
            .remove("expires_at_ms")
            .unwrap_or(serde_json::Value::Null);
        let last_used_at_ms = obj
            .remove("last_used_at_ms")
            .unwrap_or(serde_json::Value::Null);
        let revoked = obj.remove("revoked").unwrap_or(serde_json::Value::Null);
        let expired = obj.remove("expired").unwrap_or(serde_json::Value::Null);
        let spending_limits: Vec<serde_json::Value> = obj
            .remove("spending_limits")
            .and_then(|v| v.as_array().cloned())
            .unwrap_or_default()
            .into_iter()
            .map(|mut item| {
                if let Some(item_obj) = item.as_object_mut() {
                    item_obj.remove("revision");
                }
                item
            })
            .collect();
        let rpm_policy = obj.remove("request_rate_limit");
        let tpm_policy = obj.remove("token_rate_limit");
        let concurrency_policy = obj.remove("concurrency_limit");
        let usage_window = obj
            .remove("token_usage_window")
            .unwrap_or(serde_json::Value::Null);
        let ip_policy = obj.remove("ip_policy");

        let requests_per_minute = rpm_policy
            .as_ref()
            .and_then(|v| v.get("requests_per_minute"))
            .cloned()
            .unwrap_or(serde_json::Value::Null);
        let tokens_per_minute = tpm_policy
            .as_ref()
            .and_then(|v| v.get("tokens_per_minute"))
            .cloned()
            .unwrap_or(serde_json::Value::Null);
        let max_concurrent_requests = concurrency_policy
            .as_ref()
            .and_then(|v| v.get("max_concurrent_requests"))
            .cloned()
            .unwrap_or(serde_json::Value::Null);
        let active_requests = concurrency_policy
            .as_ref()
            .and_then(|v| v.get("active_requests"))
            .cloned()
            .unwrap_or_else(|| serde_json::json!(0));
        let allowed_cidrs = ip_policy
            .as_ref()
            .and_then(|v| v.get("allowed_cidrs"))
            .cloned()
            .unwrap_or(serde_json::Value::Null);

        Ok(serde_json::json!({
            "object": "api_key",
            "label": name,
            "allowed_models": allowed_models,
            "expires_at_ms": expires_at_ms,
            "last_used_at_ms": last_used_at_ms,
            "revoked": revoked,
            "expired": expired,
            "spending_limits": spending_limits,
            "rate_limits": {
                "requests_per_minute": requests_per_minute,
                "tokens_per_minute": tokens_per_minute,
                "max_concurrent_requests": max_concurrent_requests,
                "active_requests": active_requests,
            },
            "usage_window": usage_window,
            "allowed_cidrs": allowed_cidrs,
        }))
    }

    /// Unified console key detail view combining metadata, spending limits,
    /// rate/concurrency limits, token window, and IP policy.
    pub async fn key_detail(
        &self,
        scope: TenantScope,
        id: Uuid,
    ) -> Result<Option<serde_json::Value>, StoreError> {
        let key: Option<KeyView> = sqlx::query_as(
            "SELECT k.id,k.revision,k.name,k.allowed_models,CASE WHEN isfinite(k.expires_at) THEN floor(extract(epoch FROM k.expires_at)*1000)::bigint END AS expires_at_ms,(SELECT floor(extract(epoch FROM a.dispatched_at)*1000)::bigint FROM attempts a WHERE a.organization_id=k.organization_id AND a.project_id=k.project_id AND a.api_key_id=k.id AND a.dispatched_at IS NOT NULL ORDER BY a.dispatched_at DESC LIMIT 1) AS last_used_at_ms,k.revoked_at IS NOT NULL AS revoked,k.expires_at <= clock_timestamp() AS expired FROM api_keys k WHERE k.organization_id=$1 AND k.project_id=$2 AND k.id=$3",
        )
        .bind(scope.organization_id)
        .bind(scope.project_id)
        .bind(id)
        .fetch_optional(&self.pool)
        .await?;
        let Some(key) = key else {
            return Ok(None);
        };
        Ok(self.enrich_key_views(scope, vec![key]).await?.into_iter().next())
    }

    async fn enrich_key_views(
        &self,
        scope: TenantScope,
        keys: Vec<KeyView>,
    ) -> Result<Vec<serde_json::Value>, StoreError> {
        if keys.is_empty() {
            return Ok(Vec::new());
        }
        let key_ids: Vec<Uuid> = keys.iter().map(|k| k.id).collect();
        let mut snapshot = self.begin_bounded_financial_snapshot().await?;
        let rows = sqlx::query(
            "WITH selected_keys AS (
                SELECT sel.ord, k.id, k.spending_root_id, k.organization_id
                FROM unnest($3::uuid[]) WITH ORDINALITY AS sel(id, ord)
                JOIN api_keys k ON k.organization_id=$1 AND k.project_id=$2 AND k.id=sel.id
            ),
            distinct_roots AS MATERIALIZED (
                SELECT DISTINCT spending_root_id, organization_id
                FROM selected_keys
            ),
            root_policies AS MATERIALIZED (
                SELECT
                    r.spending_root_id,
                    COALESCE((
                        SELECT jsonb_agg(
                            jsonb_build_object(
                                'currency', amounts.currency,
                                'limit_nanos', amounts.limit_nanos::text,
                                'revision', amounts.revision::text,
                                'committed_nanos', amounts.committed::text,
                                'remaining_nanos', CASE WHEN amounts.limit_nanos IS NULL THEN NULL ELSE GREATEST(amounts.limit_nanos::numeric-amounts.committed,0)::text END
                            )
                            ORDER BY amounts.currency
                        )
                        FROM (
                            SELECT a.currency, l.limit_nanos, l.revision, niu_customer_key_committed(r.spending_root_id, a.id) AS committed
                            FROM customer_balance_accounts a
                            LEFT JOIN customer_key_spending_limits l ON l.spending_root_id=r.spending_root_id AND l.account_id=a.id
                            WHERE a.organization_id=r.organization_id
                        ) amounts
                    ), '[]'::jsonb) AS spending_limits,
                    jsonb_build_object('allowed_cidrs', ip.allowed_cidrs, 'revision', ip.revision::text) AS ip_policy,
                    jsonb_build_object('requests_per_minute', rpm.requests_per_minute, 'revision', rpm.revision::text) AS request_rate_limit,
                    jsonb_build_object(
                        'max_concurrent_requests', conc.max_concurrent_requests,
                        'revision', conc.revision::text,
                        'active_requests', (
                            SELECT count(*)
                            FROM attempts a
                            JOIN api_keys lineage ON lineage.id=a.api_key_id
                            WHERE lineage.spending_root_id=r.spending_root_id
                              AND a.dispatched_at IS NOT NULL
                              AND a.execution='may_have_executed'
                        )
                    ) AS concurrency_limit,
                    jsonb_build_object(
                        'tokens_per_minute', tpm.tokens_per_minute,
                        'revision', tpm.revision::text,
                        'snapshot_at', statement_timestamp(),
                        'known_tokens', b.known_tokens::text,
                        'reserved_tokens', b.reserved_tokens::text,
                        'unbounded_requests', b.unbounded_requests,
                        'committed_tokens', CASE WHEN b.unbounded_requests=0 THEN (b.known_tokens+b.reserved_tokens)::text END
                    ) AS token_rate_limit,
                    (
                        SELECT jsonb_build_object(
                            'window_seconds', 60,
                            'window_end', statement_timestamp(),
                            'requests', count(a.id),
                            'known_usage_requests', count(a.id) FILTER(WHERE a.usage_confidence='provider_reported' AND a.prompt_tokens IS NOT NULL AND a.completion_tokens IS NOT NULL),
                            'unknown_usage_requests', count(a.id) FILTER(WHERE a.usage_confidence IS DISTINCT FROM 'provider_reported' OR a.prompt_tokens IS NULL OR a.completion_tokens IS NULL),
                            'known_prompt_tokens', COALESCE(sum(a.prompt_tokens) FILTER(WHERE a.usage_confidence='provider_reported' AND a.prompt_tokens IS NOT NULL AND a.completion_tokens IS NOT NULL),0)::text,
                            'known_completion_tokens', COALESCE(sum(a.completion_tokens) FILTER(WHERE a.usage_confidence='provider_reported' AND a.prompt_tokens IS NOT NULL AND a.completion_tokens IS NOT NULL),0)::text
                        )
                        FROM api_keys lineage
                        LEFT JOIN attempts a ON a.api_key_id=lineage.id
                            AND a.dispatched_at>statement_timestamp()-interval '60 seconds'
                            AND a.dispatched_at<=statement_timestamp()
                        WHERE lineage.spending_root_id=r.spending_root_id
                    ) AS token_usage_window
                FROM distinct_roots r
                LEFT JOIN key_ip_policies ip ON ip.spending_root_id=r.spending_root_id
                LEFT JOIN key_request_rate_limits rpm ON rpm.spending_root_id=r.spending_root_id
                LEFT JOIN key_concurrency_limits conc ON conc.spending_root_id=r.spending_root_id
                LEFT JOIN key_token_rate_limits tpm ON tpm.spending_root_id=r.spending_root_id
                CROSS JOIN LATERAL niu_key_token_budget(r.spending_root_id, NULL, statement_timestamp()) b
            )
            SELECT
                sk.id,
                rp.spending_limits,
                rp.ip_policy,
                rp.request_rate_limit,
                rp.concurrency_limit,
                rp.token_rate_limit,
                rp.token_usage_window
            FROM selected_keys sk
            JOIN root_policies rp ON rp.spending_root_id=sk.spending_root_id
            ORDER BY sk.ord",
        )
        .bind(scope.organization_id)
        .bind(scope.project_id)
        .bind(&key_ids)
        .fetch_all(&mut *snapshot)
        .await?;
        snapshot.commit().await?;

        let mut by_id: std::collections::HashMap<Uuid, sqlx::postgres::PgRow> = rows
            .into_iter()
            .map(|row| (row.get::<Uuid, _>("id"), row))
            .collect();

        let mut details = Vec::with_capacity(keys.len());
        for key in keys {
            let (
                spending_limits,
                ip_policy,
                request_rate_limit,
                concurrency_limit,
                token_rate_limit,
                token_usage_window,
            ) = if let Some(row) = by_id.remove(&key.id) {
                (
                    row.try_get::<serde_json::Value, _>("spending_limits")?,
                    row.try_get::<serde_json::Value, _>("ip_policy")?,
                    row.try_get::<serde_json::Value, _>("request_rate_limit")?,
                    row.try_get::<serde_json::Value, _>("concurrency_limit")?,
                    row.try_get::<serde_json::Value, _>("token_rate_limit")?,
                    row.try_get::<Option<serde_json::Value>, _>("token_usage_window")?
                        .unwrap_or(serde_json::Value::Null),
                )
            } else {
                (
                    serde_json::json!([]),
                    serde_json::json!({"allowed_cidrs": null, "revision": null}),
                    serde_json::json!({"requests_per_minute": null, "revision": null}),
                    serde_json::json!({"max_concurrent_requests": null, "revision": null, "active_requests": 0}),
                    serde_json::json!({"tokens_per_minute": null, "revision": null}),
                    serde_json::Value::Null,
                )
            };
            details.push(serde_json::json!({
                "id": key.id,
                "revision": key.revision,
                "name": key.name,
                "allowed_models": key.allowed_models,
                "expires_at_ms": key.expires_at_ms,
                "last_used_at_ms": key.last_used_at_ms,
                "revoked": key.revoked,
                "expired": key.expired,
                "spending_limits": spending_limits,
                "ip_policy": ip_policy,
                "request_rate_limit": request_rate_limit,
                "concurrency_limit": concurrency_limit,
                "token_rate_limit": token_rate_limit,
                "token_usage_window": token_usage_window,
            }));
        }
        Ok(details)
    }

    /// Resolve current access for a saved video query without reusing a revoked secret.
    /// Only the original rotation lineage, tenant and model grant can authorize recovery.
    pub async fn media_recovery_key(
        &self,
        scope: TenantScope,
        attempt: Uuid,
    ) -> Result<Principal, StoreError> {
        let key: Uuid = sqlx::query_scalar("SELECT current.id FROM attempts a JOIN api_keys original ON original.id=a.api_key_id JOIN api_keys current ON current.spending_root_id=original.spending_root_id AND current.organization_id=a.organization_id AND current.project_id=a.project_id JOIN media_jobs job ON job.attempt_id=a.id WHERE a.organization_id=$1 AND a.project_id=$2 AND a.id=$3 AND a.dispatched_at IS NOT NULL AND current.revoked_at IS NULL AND current.expires_at>clock_timestamp() AND ('*'=ANY(current.allowed_models) OR a.resource_id=ANY(current.allowed_models)) ORDER BY (current.id=original.id) DESC,current.created_at DESC,current.id LIMIT 1")
            .bind(scope.organization_id).bind(scope.project_id).bind(attempt).fetch_optional(&self.pool).await?.ok_or(StoreError::Unauthorized)?;
        self.dashboard_key(scope, key).await
    }

    pub async fn list_keys(&self, scope: TenantScope) -> Result<Vec<KeyView>, StoreError> {
        self.key_directory_selection(scope, None, None).await
    }

    pub async fn list_key_details(
        &self,
        scope: TenantScope,
    ) -> Result<Vec<serde_json::Value>, StoreError> {
        let keys = self.list_keys(scope).await?;
        self.enrich_key_views(scope, keys).await
    }

    pub async fn key_detail_directory_page(
        &self,
        scope: TenantScope,
        after: Option<Uuid>,
        limit: u16,
    ) -> Result<(Vec<serde_json::Value>, Option<Uuid>), StoreError> {
        let (keys, next) = self.key_directory_page(scope, after, limit).await?;
        let details = self.enrich_key_views(scope, keys).await?;
        Ok((details, next))
    }

    /// Bounded keyset page; cursor lookup and rows share a tenant-scoped snapshot.
    pub async fn key_directory_page(
        &self,
        scope: TenantScope,
        after: Option<Uuid>,
        limit: u16,
    ) -> Result<(Vec<KeyView>, Option<Uuid>), StoreError> {
        if !(1..=100).contains(&limit) {
            return Err(StoreError::InvalidKey);
        }
        let mut rows = self
            .key_directory_selection(scope, after, Some(i64::from(limit) + 1))
            .await?;
        let more = rows.len() > usize::from(limit);
        rows.truncate(usize::from(limit));
        let next = if more {
            rows.last().map(|row| row.id)
        } else {
            None
        };
        Ok((rows, next))
    }

    async fn key_directory_selection(
        &self,
        scope: TenantScope,
        after: Option<Uuid>,
        limit: Option<i64>,
    ) -> Result<Vec<KeyView>, StoreError> {
        let mut snapshot = self.begin_bounded_read_snapshot().await?;
        let cursor: Option<(String, Uuid)> = if let Some(id) = after {
            Some(sqlx::query_as("SELECT created_at::text,id FROM api_keys WHERE organization_id=$1 AND project_id=$2 AND id=$3")
                .bind(scope.organization_id).bind(scope.project_id).bind(id)
                .fetch_optional(&mut *snapshot).await?.ok_or(StoreError::Conflict)?)
        } else {
            None
        };
        let mut query = sqlx::QueryBuilder::<sqlx::Postgres>::new(
            "SELECT k.id,k.revision,k.name,k.allowed_models,CASE WHEN isfinite(k.expires_at) THEN floor(extract(epoch FROM k.expires_at)*1000)::bigint END AS expires_at_ms,floor(extract(epoch FROM activity.dispatched_at)*1000)::bigint AS last_used_at_ms,k.revoked_at IS NOT NULL AS revoked,k.expires_at <= clock_timestamp() AS expired FROM (SELECT id,revision,name,allowed_models,expires_at,revoked_at,organization_id,project_id,created_at FROM api_keys k",
        );
        query
            .push(" WHERE k.organization_id=")
            .push_bind(scope.organization_id)
            .push(" AND k.project_id=")
            .push_bind(scope.project_id);
        if let Some((created, id)) = cursor {
            query
                .push(" AND (k.created_at,k.id)>(")
                .push_bind(created)
                .push("::timestamptz,")
                .push_bind(id)
                .push(")");
        }
        query.push(" ORDER BY k.created_at,k.id");
        if let Some(limit) = limit {
            query.push(" LIMIT ").push_bind(limit);
        }
        // Select the page before looking up dispatch activity. Otherwise PostgreSQL
        // can probe attempts for every workspace key before the final sort/limit.
        query.push(") k LEFT JOIN LATERAL (SELECT a.dispatched_at FROM attempts a WHERE a.organization_id=k.organization_id AND a.project_id=k.project_id AND a.api_key_id=k.id AND a.dispatched_at IS NOT NULL ORDER BY a.dispatched_at DESC LIMIT 1) activity ON true ORDER BY k.created_at,k.id");
        let rows = query.build_query_as().fetch_all(&mut *snapshot).await?;
        snapshot.commit().await?;
        Ok(rows)
    }

    /// Edit metadata without replacing the secret or extending its expiration.
    /// The lock also serializes edits with dispatch admission and revocation.
    pub async fn update_key_metadata(
        &self,
        scope: TenantScope,
        id: Uuid,
        name: &str,
        models: &[String],
        expected_revision: i64,
        actor: &str,
    ) -> Result<i64, StoreError> {
        let name = name.trim();
        if name.is_empty()
            || name.len() > 200
            || models.is_empty()
            || models.iter().any(|m| m.is_empty() || m.len() > 200)
            || (models.iter().any(|m| m == "*") && models.len() != 1)
            || expected_revision < 1
        {
            return Err(StoreError::InvalidKey);
        }
        let mut tx = self.begin_bounded_recording().await?;
        let row = sqlx::query("SELECT name,allowed_models,revision FROM api_keys WHERE organization_id=$1 AND project_id=$2 AND id=$3 AND revoked_at IS NULL AND expires_at > clock_timestamp() FOR UPDATE")
            .bind(scope.organization_id).bind(scope.project_id).bind(id)
            .fetch_optional(&mut *tx).await?.ok_or(StoreError::Conflict)?;
        let revision: i64 = row.get("revision");
        if revision != expected_revision {
            return Err(StoreError::Conflict);
        }
        let previous_name: String = row.get("name");
        let previous_models: Vec<String> = row.get("allowed_models");
        if previous_name == name && previous_models == models {
            return Ok(revision);
        }
        sqlx::query(
            "UPDATE api_keys SET name=$1,allowed_models=$2,revision=revision+1 WHERE id=$3",
        )
        .bind(name)
        .bind(models)
        .bind(id)
        .execute(&mut *tx)
        .await?;
        sqlx::query("INSERT INTO key_audit_events (id,organization_id,project_id,key_id,action,actor,previous_metadata,updated_metadata) VALUES ($1,$2,$3,$4,'updated',$5,$6,$7)")
            .bind(Uuid::new_v4()).bind(scope.organization_id).bind(scope.project_id).bind(id).bind(actor)
            .bind(serde_json::json!({"name":previous_name,"allowed_models":previous_models,"revision":revision}))
            .bind(serde_json::json!({"name":name,"allowed_models":models,"revision":revision+1}))
            .execute(&mut *tx).await?;
        tx.commit().await?;
        Ok(revision + 1)
    }
    /// Rotation revokes the old key and creates its replacement atomically.
    /// Permissions and absolute expiry are preserved; only one racer can win.
    pub async fn rotate_key(&self, scope: TenantScope, old: Uuid) -> Result<IssuedKey, StoreError> {
        let id = Uuid::new_v4();
        let token = format!("niu_{}{}", Uuid::new_v4().simple(), Uuid::new_v4().simple());
        let hash = Sha256::digest(token.as_bytes()).to_vec();
        let mut tx = self.begin_bounded_recording().await?;
        let changed = sqlx::query("UPDATE api_keys SET revoked_at=clock_timestamp() WHERE organization_id=$1 AND project_id=$2 AND id=$3 AND revoked_at IS NULL AND expires_at > clock_timestamp()")
            .bind(scope.organization_id).bind(scope.project_id).bind(old).execute(&mut *tx).await?.rows_affected();
        if changed != 1 {
            return Err(StoreError::Conflict);
        }
        sqlx::query("INSERT INTO api_keys (id,organization_id,project_id,name,token_hash,allowed_models,expires_at,spending_root_id) SELECT $1,organization_id,project_id,name,$2,allowed_models,expires_at,spending_root_id FROM api_keys WHERE id=$3")
            .bind(id).bind(hash).bind(old).execute(&mut *tx).await?;
        sqlx::query("INSERT INTO key_guardrail_assignments (organization_id,project_id,key_id,policy_revision,assignment_revision) SELECT organization_id,project_id,$1,policy_revision,assignment_revision FROM key_guardrail_assignments WHERE organization_id=$2 AND project_id=$3 AND key_id=$4")
            .bind(id).bind(scope.organization_id).bind(scope.project_id).bind(old).execute(&mut *tx).await?;
        // Record the replacement's inherited assignment at rotation time. The
        // original key's immutable history remains attached to that key.
        sqlx::query("INSERT INTO key_guardrail_assignment_events (organization_id,project_id,key_id,assignment_revision,policy_revision,actor) SELECT organization_id,project_id,key_id,assignment_revision,policy_revision,'system' FROM key_guardrail_assignments WHERE organization_id=$1 AND project_id=$2 AND key_id=$3")
            .bind(scope.organization_id).bind(scope.project_id).bind(id).execute(&mut *tx).await?;
        sqlx::query("INSERT INTO key_audit_events (id,organization_id,project_id,key_id,action,replacement_key_id) VALUES ($1,$2,$3,$4,'rotated',$5)")
            .bind(Uuid::new_v4()).bind(scope.organization_id).bind(scope.project_id).bind(old).bind(id).execute(&mut *tx).await?;
        tx.commit().await?;
        Ok(IssuedKey { id, token })
    }

    /// Idempotent revocation within a trusted administrative tenant scope.
    pub async fn revoke_key(&self, scope: TenantScope, id: Uuid) -> Result<(), StoreError> {
        let mut tx = self.begin_bounded_recording().await?;
        let revoked: bool = sqlx::query_scalar("SELECT revoked_at IS NOT NULL FROM api_keys WHERE organization_id=$1 AND project_id=$2 AND id=$3 FOR UPDATE")
            .bind(scope.organization_id).bind(scope.project_id).bind(id).fetch_optional(&mut *tx).await?.ok_or(StoreError::Conflict)?;
        if !revoked {
            sqlx::query("UPDATE api_keys SET revoked_at=clock_timestamp() WHERE id=$1")
                .bind(id)
                .execute(&mut *tx)
                .await?;
            sqlx::query("INSERT INTO key_audit_events (id,organization_id,project_id,key_id,action) VALUES ($1,$2,$3,$4,'revoked')")
                .bind(Uuid::new_v4()).bind(scope.organization_id).bind(scope.project_id).bind(id).execute(&mut *tx).await?;
        }
        tx.commit().await?;
        Ok(())
    }

    /// Permission recheck and dispatch intent commit in one transaction. A key
    /// row lock serializes revocation against admission. Revocation prevents
    /// future admissions; it cannot unsend work already admitted upstream.
    pub async fn mark_dispatched(&self, principal: &Principal, id: Uuid) -> Result<(), StoreError> {
        let mut tx = self.pool.begin().await?;
        let mut captured = None;
        let allowed = match Self::mark_dispatched_with_key_capture(
            &mut tx,
            principal,
            id,
            Some(&mut captured),
        )
        .await
        {
            Ok(allowed) => allowed,
            Err(error) => {
                // Only a definitive checked denial is evidence. Commit/transport
                // uncertainty never becomes a denied admission observation.
                let denial_kind = match &error {
                    StoreError::KeyRequestRateDisabled => {
                        Some(crate::GatewayAdmissionDenialKind::KeyRequestRateDisabled)
                    }
                    StoreError::KeyRequestRateExceeded => {
                        Some(crate::GatewayAdmissionDenialKind::KeyRequestRateExceeded)
                    }
                    _ => None,
                };
                let rolled_back = tx.rollback().await.is_ok();
                if rolled_back && let (Some(kind), Some(captured)) = (denial_kind, captured) {
                    // Diagnostic failure must not change the original rejection
                    // or authorize another dispatch / audit writer retry.
                    let _ = self
                        .record_key_request_rate_denial(
                            principal.scope,
                            id,
                            principal.key_id,
                            &captured,
                            kind,
                        )
                        .await;
                }
                return Err(error);
            }
        };
        tx.commit().await?;
        if allowed {
            Ok(())
        } else {
            // The audited denial committed without authorizing transport.
            Err(StoreError::GuardrailAdmissionConflict)
        }
    }

    pub(crate) async fn mark_dispatched_using(
        tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
        principal: &Principal,
        id: Uuid,
    ) -> Result<bool, StoreError> {
        Self::mark_dispatched_with_key_capture(tx, principal, id, None).await
    }

    async fn mark_dispatched_with_key_capture(
        tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
        principal: &Principal,
        id: Uuid,
        capture: Option<&mut Option<crate::gateway_admission_denials::CapturedAdmissionKey>>,
    ) -> Result<bool, StoreError> {
        let scope = principal.scope;

        sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended('niu-guardrails:'||$1::text||':'||$2::text,0))")
            .bind(scope.organization_id).bind(scope.project_id).execute(&mut **tx).await?;

        let key = sqlx::query("SELECT k.id,k.name,k.revision FROM api_keys k JOIN projects p ON p.organization_id=k.organization_id AND p.id=k.project_id WHERE k.id=$1 AND k.organization_id=$2 AND k.project_id=$3 AND k.revoked_at IS NULL AND k.expires_at > clock_timestamp() FOR SHARE OF k, p")
            .bind(principal.key_id).bind(scope.organization_id).bind(scope.project_id).fetch_optional(&mut **tx).await?;
        if key.is_none() {
            // The composite key foreign key guarantees that a valid key also
            // has its project. Locking both rows together keeps key revocation
            // and budget creation ordered with dispatch in a single query.
            return Err(StoreError::Unauthorized);
        }
        if let (Some(capture), Some(key)) = (capture, key.as_ref()) {
            *capture = Some(crate::gateway_admission_denials::CapturedAdmissionKey {
                name: key.try_get("name")?,
                revision: key.try_get("revision")?,
            });
        }
        let account_eligible = sqlx::query_scalar::<_, bool>("SELECT a.health='ready' AND a.refresh_owner IS NULL AND a.credential_revision=s.credential_revision FROM account_assignments s JOIN supplier_accounts a ON a.organization_id=s.organization_id AND a.project_id=s.project_id AND a.id=s.account_id WHERE s.organization_id=$1 AND s.project_id=$2 AND s.attempt_id=$3 FOR SHARE OF a")
            .bind(scope.organization_id).bind(scope.project_id).bind(id).fetch_optional(&mut **tx).await?;
        if account_eligible == Some(false) {
            return Err(StoreError::AccountUnavailable);
        }
        if let Some((offer_id, revision)) = sqlx::query_as::<_, (Uuid, Uuid)>(
            "SELECT offer_id,revision_id FROM provider_attempt_offers WHERE attempt_id=$1",
        )
        .bind(id)
        .fetch_optional(&mut **tx)
        .await?
        {
            sqlx::query("SELECT id FROM provider_offers WHERE id=$1 AND current_revision=$2 AND active FOR SHARE").bind(offer_id).bind(revision).fetch_optional(&mut **tx).await?.ok_or(StoreError::AccountUnavailable)?;
        }
        // Take the attempt lock in a separate statement so the following
        // reservation check observes any release committed while we waited.
        sqlx::query("SELECT id FROM attempts WHERE organization_id=$1 AND project_id=$2 AND id=$3 FOR UPDATE")
            .bind(scope.organization_id).bind(scope.project_id).bind(id).fetch_optional(&mut **tx).await?.ok_or(StoreError::Conflict)?;
        let changed: i64 =
            sqlx::query_scalar("SELECT niu_mark_dispatched_with_guardrail_audit($1,$2,$3,$4)")
                .bind(scope.organization_id)
                .bind(scope.project_id)
                .bind(id)
                .bind(principal.key_id)
                .fetch_one(&mut **tx)
                .await
                .map_err(crate::accounting::map_gateway_admission_error)?;
        if changed == -1 {
            // Commit only the denial audit. Dispatch intent stayed not_sent.
            return Ok(false);
        }
        if changed != 1 {
            return Err(StoreError::Conflict);
        }
        Ok(true)
    }
}
