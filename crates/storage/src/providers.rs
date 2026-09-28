//! Provider earnings are an independent liability ledger, never derived from customer cost.
use crate::{Store, StoreError, TenantScope, TokenRates};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sqlx::Row;
use uuid::Uuid;

#[derive(Serialize, sqlx::FromRow)]
pub struct ProviderMembership {
    pub id: Uuid,
    pub name: String,
    pub role: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ProviderOfferInput {
    pub model_alias: String,
    pub currency: String,
    // Decimal integer strings avoid losing nanounits in browser JSON numbers.
    pub prompt_rate: String,
    pub completion_rate: String,
    pub expected_revision: Option<Uuid>,
}

fn valid_text(value: &str, max: usize) -> bool {
    !value.trim().is_empty() && value.len() <= max && !value.chars().any(char::is_control)
}

impl Store {
    pub async fn provider_businesses(&self) -> Result<Vec<Value>, StoreError> {
        Ok(sqlx::query_scalar("SELECT jsonb_build_object('id',p.id,'name',p.name,'members',(SELECT COUNT(*) FROM provider_memberships m WHERE m.provider_id=p.id AND m.active)) FROM provider_businesses p ORDER BY p.name,p.id LIMIT 1000").fetch_all(&self.pool).await?)
    }

    pub async fn provider_memberships(
        &self,
        operator: Uuid,
    ) -> Result<Vec<ProviderMembership>, StoreError> {
        Ok(sqlx::query_as("SELECT p.id,p.name,m.role FROM provider_businesses p JOIN provider_memberships m ON m.provider_id=p.id JOIN admin_operators a ON a.id=m.operator_id WHERE m.operator_id=$1 AND m.active AND a.revoked_at IS NULL ORDER BY p.name,p.id LIMIT 100")
            .bind(operator).fetch_all(&self.pool).await?)
    }

    pub async fn provider_member(
        &self,
        provider: Uuid,
        operator: Uuid,
        write: bool,
    ) -> Result<bool, StoreError> {
        Ok(sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM provider_memberships m JOIN admin_operators a ON a.id=m.operator_id WHERE m.provider_id=$1 AND m.operator_id=$2 AND m.active AND a.revoked_at IS NULL AND (NOT $3 OR m.role='manager'))")
            .bind(provider).bind(operator).bind(write).fetch_one(&self.pool).await?)
    }

    pub async fn create_provider_business(&self, name: &str) -> Result<Uuid, StoreError> {
        if !valid_text(name, 100) {
            return Err(StoreError::InvalidAccount);
        }
        let id = Uuid::new_v4();
        let mut tx = self.pool.begin().await?;
        sqlx::query("INSERT INTO provider_businesses(id,name) VALUES($1,$2)")
            .bind(id)
            .bind(name.trim())
            .execute(&mut *tx)
            .await?;
        sqlx::query("INSERT INTO provider_audit_events(provider_id,action,resource_id) VALUES($1,'provider_created',$1)").bind(id).execute(&mut *tx).await?;
        tx.commit().await?;
        Ok(id)
    }

    pub async fn set_provider_member(
        &self,
        provider: Uuid,
        operator: Uuid,
        role: &str,
        active: bool,
    ) -> Result<(), StoreError> {
        if !matches!(role, "manager" | "viewer") {
            return Err(StoreError::InvalidOperator);
        }
        let mut tx = self.pool.begin().await?;
        sqlx::query("SELECT id FROM provider_businesses WHERE id=$1 FOR UPDATE")
            .bind(provider)
            .fetch_optional(&mut *tx)
            .await?
            .ok_or(StoreError::Conflict)?;
        sqlx::query("SELECT id FROM admin_operators WHERE id=$1 AND revoked_at IS NULL FOR SHARE")
            .bind(operator)
            .fetch_optional(&mut *tx)
            .await?
            .ok_or(StoreError::Conflict)?;
        sqlx::query("INSERT INTO provider_memberships(provider_id,operator_id,role,active) VALUES($1,$2,$3,$4) ON CONFLICT(provider_id,operator_id) DO UPDATE SET role=EXCLUDED.role,active=EXCLUDED.active")
            .bind(provider).bind(operator).bind(role).bind(active).execute(&mut *tx).await?;
        sqlx::query(
            "INSERT INTO provider_audit_events(provider_id,action,resource_id) VALUES($1,$2,$3)",
        )
        .bind(provider)
        .bind(format!(
            "membership_{}_{}",
            role,
            if active { "granted" } else { "revoked" }
        ))
        .bind(operator)
        .execute(&mut *tx)
        .await?;
        tx.commit().await?;
        Ok(())
    }

    pub async fn publish_provider_offer(
        &self,
        provider: Uuid,
        input: &ProviderOfferInput,
    ) -> Result<Uuid, StoreError> {
        let prompt = input
            .prompt_rate
            .parse::<i64>()
            .map_err(|_| StoreError::InvalidPrice)?;
        let completion = input
            .completion_rate
            .parse::<i64>()
            .map_err(|_| StoreError::InvalidPrice)?;
        if input.currency.len() != 3
            || !input.currency.bytes().all(|b| b.is_ascii_uppercase())
            || [prompt, completion]
                .iter()
                .any(|n| !(0..=1_000_000_000_000_000).contains(n))
        {
            return Err(StoreError::InvalidPrice);
        }
        let mut tx = self.pool.begin().await?;
        sqlx::query("SELECT id FROM provider_businesses WHERE id=$1 FOR UPDATE")
            .bind(provider)
            .fetch_optional(&mut *tx)
            .await?
            .ok_or(StoreError::Conflict)?;
        let vendor: Uuid =
            sqlx::query_scalar("SELECT vendor_id FROM vendor_models WHERE alias=$1 FOR SHARE")
                .bind(&input.model_alias)
                .fetch_optional(&mut *tx)
                .await?
                .ok_or(StoreError::Conflict)?;
        let existing: Option<(Uuid, Uuid, Uuid, Uuid)> = sqlx::query_as("SELECT id,provider_id,current_revision,vendor_id FROM provider_offers WHERE model_alias=$1 FOR UPDATE").bind(&input.model_alias).fetch_optional(&mut *tx).await?;
        let offer = match existing {
            Some((id, owner, revision, bound_vendor)) => {
                if owner != provider
                    || input.expected_revision != Some(revision)
                    || bound_vendor != vendor
                {
                    return Err(StoreError::Conflict);
                }
                id
            }
            None => {
                if input.expected_revision.is_some() {
                    return Err(StoreError::Conflict);
                }
                let id = Uuid::new_v4();
                sqlx::query("INSERT INTO provider_offers(id,provider_id,model_alias,vendor_id) VALUES($1,$2,$3,$4)").bind(id).bind(provider).bind(&input.model_alias).bind(vendor).execute(&mut *tx).await?;
                id
            }
        };
        let revision = Uuid::new_v4();
        sqlx::query("INSERT INTO provider_offer_revisions(id,offer_id,currency,prompt_rate,completion_rate) VALUES($1,$2,$3,$4,$5)").bind(revision).bind(offer).bind(&input.currency).bind(prompt).bind(completion).execute(&mut *tx).await?;
        sqlx::query("UPDATE provider_offers SET current_revision=$2 WHERE id=$1")
            .bind(offer)
            .bind(revision)
            .execute(&mut *tx)
            .await?;
        sqlx::query("INSERT INTO provider_audit_events(provider_id,action,resource_id) VALUES($1,'offer_priced',$2)").bind(provider).bind(revision).execute(&mut *tx).await?;
        tx.commit().await?;
        Ok(revision)
    }

    pub async fn set_provider_offer_active(
        &self,
        provider: Uuid,
        offer: Uuid,
        operator: Uuid,
        active: bool,
    ) -> Result<(), StoreError> {
        let mut tx = self.pool.begin().await?;
        sqlx::query("SELECT provider_id FROM provider_memberships WHERE provider_id=$1 AND operator_id=$2 AND active AND role='manager' FOR SHARE").bind(provider).bind(operator).fetch_optional(&mut *tx).await?.ok_or(StoreError::Unauthorized)?;
        let changed =
            sqlx::query("UPDATE provider_offers SET active=$3 WHERE provider_id=$1 AND id=$2")
                .bind(provider)
                .bind(offer)
                .bind(active)
                .execute(&mut *tx)
                .await?
                .rows_affected();
        if changed != 1 {
            return Err(StoreError::Conflict);
        }
        sqlx::query("INSERT INTO provider_audit_events(provider_id,actor_operator_id,action,resource_id) VALUES($1,$2,$3,$4)").bind(provider).bind(operator).bind(if active {"offer_resumed"} else {"offer_paused"}).bind(offer).execute(&mut *tx).await?;
        tx.commit().await?;
        Ok(())
    }

    /// Snapshot the agreed rate before dispatch. Route changes cannot assign another vendor's work.
    pub async fn bind_provider_offer(
        &self,
        scope: TenantScope,
        attempt: Uuid,
        alias: &str,
        upstream: &str,
        endpoint: Option<&str>,
    ) -> Result<(), StoreError> {
        let mut tx = self.pool.begin().await?;
        let offer=sqlx::query("SELECT o.id,o.provider_id,o.current_revision,o.active,o.vendor_id,m.vendor_id AS route_vendor,m.upstream_model,v.api_base FROM provider_offers o JOIN vendor_models m ON m.alias=o.model_alias JOIN vendors v ON v.id=m.vendor_id WHERE o.model_alias=$1 FOR SHARE OF o,m,v")
            .bind(alias).fetch_optional(&mut *tx).await?;
        if let Some(row) = offer {
            if !row.get::<bool, _>("active")
                || row.get::<Uuid, _>("vendor_id") != row.get::<Uuid, _>("route_vendor")
                || row.get::<String, _>("upstream_model") != upstream
                || endpoint != Some(row.get::<String, _>("api_base").as_str())
            {
                return Err(StoreError::AccountUnavailable);
            }
            sqlx::query("SELECT id FROM attempts WHERE id=$1 AND organization_id=$2 AND project_id=$3 AND execution='not_sent' FOR UPDATE").bind(attempt).bind(scope.organization_id).bind(scope.project_id).fetch_optional(&mut *tx).await?.ok_or(StoreError::Conflict)?;
            sqlx::query("INSERT INTO provider_attempt_offers(attempt_id,provider_id,offer_id,revision_id) VALUES($1,$2,$3,$4)").bind(attempt).bind(row.get::<Uuid,_>("provider_id")).bind(row.get::<Uuid,_>("id")).bind(row.get::<Uuid,_>("current_revision")).execute(&mut *tx).await?;
        }
        tx.commit().await?;
        Ok(())
    }

    /// Idempotent accrual only from confirmed execution and complete trusted usage.
    pub async fn accrue_provider_earning(&self, attempt: Uuid) -> Result<(), StoreError> {
        let mut tx = self.pool.begin().await?;
        let row=sqlx::query("SELECT b.provider_id,b.revision_id,r.currency,r.prompt_rate,r.completion_rate,a.prompt_tokens,a.completion_tokens FROM provider_attempt_offers b JOIN attempts a ON a.id=b.attempt_id JOIN provider_offer_revisions r ON r.id=b.revision_id WHERE a.id=$1 AND a.execution='confirmed_completed' AND a.usage_confidence='provider_reported'")
            .bind(attempt).fetch_optional(&mut *tx).await?;
        if let Some(row) = row {
            let prompt: i64 = row.get("prompt_tokens");
            let completion: i64 = row.get("completion_tokens");
            let amount = TokenRates {
                prompt: row.get("prompt_rate"),
                completion: row.get("completion_rate"),
            }
            .charge(prompt, completion)?;
            sqlx::query("INSERT INTO provider_earnings(attempt_id,provider_id,revision_id,currency,amount_nanos,prompt_tokens,completion_tokens) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(attempt_id) DO NOTHING")
                .bind(attempt).bind(row.get::<Uuid,_>("provider_id")).bind(row.get::<Uuid,_>("revision_id")).bind(row.get::<String,_>("currency")).bind(amount).bind(prompt).bind(completion).execute(&mut *tx).await?;
        }
        tx.commit().await?;
        Ok(())
    }

    pub async fn recover_provider_earnings(
        &self,
        after: Option<Uuid>,
    ) -> Result<(Option<Uuid>, usize), StoreError> {
        let ids:Vec<Uuid>=sqlx::query_scalar("SELECT a.id FROM attempts a JOIN provider_attempt_offers b ON b.attempt_id=a.id LEFT JOIN provider_earnings e ON e.attempt_id=a.id WHERE e.attempt_id IS NULL AND a.execution='confirmed_completed' AND a.usage_confidence='provider_reported' AND ($1::uuid IS NULL OR a.id>$1) ORDER BY a.id LIMIT 100").bind(after).fetch_all(&self.pool).await?;
        let next = if ids.len() == 100 {
            ids.last().copied()
        } else {
            None
        };
        let mut failed = 0;
        for id in ids {
            if self.accrue_provider_earning(id).await.is_err() {
                failed += 1;
            }
        }
        Ok((next, failed))
    }

    /// Record payment of explicit earned entries, serialized per supplier and replay-safe.
    pub async fn record_provider_settlement(
        &self,
        provider: Uuid,
        key: Uuid,
        reference: &str,
        attempts: &[Uuid],
    ) -> Result<Uuid, StoreError> {
        if !valid_text(reference, 200) || attempts.is_empty() || attempts.len() > 1000 {
            return Err(StoreError::InvalidPrice);
        }
        let mut sorted = attempts.to_vec();
        sorted.sort();
        sorted.dedup();
        if sorted.len() != attempts.len() {
            return Err(StoreError::InvalidPrice);
        }
        let mut tx = self.pool.begin().await?;
        sqlx::query("SELECT id FROM provider_businesses WHERE id=$1 FOR UPDATE")
            .bind(provider)
            .fetch_optional(&mut *tx)
            .await?
            .ok_or(StoreError::Conflict)?;
        if let Some((id,prior))=sqlx::query_as::<_,(Uuid,String)>("SELECT id,payment_reference FROM provider_settlements WHERE provider_id=$1 AND idempotency_key=$2").bind(provider).bind(key).fetch_optional(&mut *tx).await? {
            let entries:Vec<Uuid>=sqlx::query_scalar("SELECT attempt_id FROM provider_settlement_entries WHERE settlement_id=$1 ORDER BY attempt_id").bind(id).fetch_all(&mut *tx).await?;
            if prior!=reference || entries!=sorted {return Err(StoreError::Conflict);}
            return Ok(id);
        }
        let rows=sqlx::query("SELECT e.attempt_id,e.currency,e.amount_nanos FROM provider_earnings e WHERE e.provider_id=$1 AND e.attempt_id=ANY($2) AND NOT EXISTS(SELECT 1 FROM provider_settlement_entries s WHERE s.attempt_id=e.attempt_id)").bind(provider).bind(&sorted).fetch_all(&mut *tx).await?;
        if rows.len() != sorted.len() {
            return Err(StoreError::Conflict);
        }
        let currency: String = rows[0].get("currency");
        let mut amount = 0i64;
        for row in &rows {
            if row.get::<String, _>("currency") != currency {
                return Err(StoreError::InvalidPrice);
            }
            amount = amount
                .checked_add(row.get("amount_nanos"))
                .ok_or(StoreError::AggregateOverflow)?;
        }
        if amount == 0 {
            return Err(StoreError::InvalidPrice);
        }
        let duplicate:bool=sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM provider_settlements WHERE provider_id=$1 AND payment_reference=$2)").bind(provider).bind(reference).fetch_one(&mut *tx).await?;
        if duplicate {
            return Err(StoreError::Conflict);
        }
        let id = Uuid::new_v4();
        sqlx::query("INSERT INTO provider_settlements(id,provider_id,currency,amount_nanos,payment_reference,idempotency_key) VALUES($1,$2,$3,$4,$5,$6)").bind(id).bind(provider).bind(currency).bind(amount).bind(reference).bind(key).execute(&mut *tx).await?;
        sqlx::query("INSERT INTO provider_settlement_entries(provider_id,settlement_id,attempt_id) SELECT $1,$2,unnest($3::uuid[])").bind(provider).bind(id).bind(sorted).execute(&mut *tx).await?;
        sqlx::query("INSERT INTO provider_audit_events(provider_id,action,resource_id) VALUES($1,'external_payment_recorded',$2)").bind(provider).bind(id).execute(&mut *tx).await?;
        tx.commit().await?;
        Ok(id)
    }

    pub async fn provider_dashboard(&self, provider: Uuid, days: i32) -> Result<Value, StoreError> {
        if ![7, 30, 90].contains(&days) {
            return Err(StoreError::InvalidPrice);
        }
        let mut tx = self.pool.begin().await?;
        sqlx::query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY")
            .execute(&mut *tx)
            .await?;
        let name: String = sqlx::query_scalar("SELECT name FROM provider_businesses WHERE id=$1")
            .bind(provider)
            .fetch_optional(&mut *tx)
            .await?
            .ok_or(StoreError::Conflict)?;
        let balances:Vec<Value>=sqlx::query_scalar("SELECT jsonb_build_object('currency',e.currency,'earned_nanos',SUM(e.amount_nanos)::text,'unpaid_nanos',SUM(CASE WHEN s.attempt_id IS NULL THEN e.amount_nanos ELSE 0 END)::text,'paid_nanos',SUM(CASE WHEN s.attempt_id IS NOT NULL THEN e.amount_nanos ELSE 0 END)::text,'period_nanos',COALESCE(SUM(e.amount_nanos) FILTER(WHERE e.created_at>=now()-make_interval(days=>$2)),0)::text) FROM provider_earnings e LEFT JOIN provider_settlement_entries s ON s.attempt_id=e.attempt_id WHERE e.provider_id=$1 GROUP BY e.currency ORDER BY e.currency").bind(provider).bind(days).fetch_all(&mut *tx).await?;
        let traffic:Value=sqlx::query_scalar("SELECT jsonb_build_object('requests',COUNT(*)::text,'completed',COUNT(*) FILTER(WHERE a.execution='confirmed_completed')::text,'unresolved',COUNT(*) FILTER(WHERE e.attempt_id IS NULL)::text,'prompt_tokens',COALESCE(SUM(a.prompt_tokens),0)::text,'completion_tokens',COALESCE(SUM(a.completion_tokens),0)::text) FROM provider_attempt_offers b JOIN attempts a ON a.id=b.attempt_id LEFT JOIN provider_earnings e ON e.attempt_id=a.id WHERE b.provider_id=$1 AND a.dispatched_at>=now()-make_interval(days=>$2)").bind(provider).bind(days).fetch_one(&mut *tx).await?;
        let daily:Vec<Value>=sqlx::query_scalar("SELECT jsonb_build_object('day',to_char(e.created_at AT TIME ZONE 'UTC','YYYY-MM-DD'),'currency',currency,'amount_nanos',SUM(amount_nanos)::text) FROM provider_earnings e WHERE provider_id=$1 AND created_at>=now()-make_interval(days=>$2) GROUP BY currency, to_char(e.created_at AT TIME ZONE 'UTC','YYYY-MM-DD') ORDER BY to_char(e.created_at AT TIME ZONE 'UTC','YYYY-MM-DD')")
            .bind(provider).bind(days).fetch_all(&mut *tx).await?;
        let offers:Vec<Value>=sqlx::query_scalar("SELECT jsonb_build_object('id',o.id,'model_alias',o.model_alias,'active',o.active,'revision',r.id,'currency',r.currency,'prompt_rate',r.prompt_rate::text,'completion_rate',r.completion_rate::text,'route_ready',m.enabled AND v.enabled AND m.vendor_id=o.vendor_id) FROM provider_offers o JOIN provider_offer_revisions r ON r.id=o.current_revision JOIN vendor_models m ON m.alias=o.model_alias JOIN vendors v ON v.id=m.vendor_id WHERE o.provider_id=$1 ORDER BY o.model_alias LIMIT 1000").bind(provider).fetch_all(&mut *tx).await?;
        let earnings:Vec<Value>=sqlx::query_scalar("SELECT jsonb_build_object('id',e.attempt_id,'model_alias',o.model_alias,'currency',e.currency,'amount_nanos',e.amount_nanos::text,'prompt_tokens',e.prompt_tokens::text,'completion_tokens',e.completion_tokens::text,'created_at',e.created_at,'status',CASE WHEN s.attempt_id IS NULL THEN 'accrued' ELSE 'paid' END) FROM provider_earnings e JOIN provider_attempt_offers b ON b.attempt_id=e.attempt_id JOIN provider_offers o ON o.id=b.offer_id LEFT JOIN provider_settlement_entries s ON s.attempt_id=e.attempt_id WHERE e.provider_id=$1 AND e.created_at>=now()-make_interval(days=>$2) ORDER BY e.created_at DESC,e.attempt_id LIMIT 100").bind(provider).bind(days).fetch_all(&mut *tx).await?;
        let settlements:Vec<Value>=sqlx::query_scalar("SELECT jsonb_build_object('id',id,'currency',currency,'amount_nanos',amount_nanos::text,'payment_reference',payment_reference,'created_at',created_at) FROM provider_settlements WHERE provider_id=$1 ORDER BY created_at DESC,id LIMIT 100").bind(provider).fetch_all(&mut *tx).await?;
        let consumption:Vec<Value>=sqlx::query_scalar("SELECT jsonb_build_object('model_alias',o.model_alias,'revision',r.id,'currency',e.currency,'prompt_rate',r.prompt_rate::text,'completion_rate',r.completion_rate::text,'requests',COUNT(*)::text,'prompt_tokens',SUM(e.prompt_tokens)::text,'completion_tokens',SUM(e.completion_tokens)::text,'amount_nanos',SUM(e.amount_nanos)::text,'unpaid_nanos',SUM(CASE WHEN s.attempt_id IS NULL THEN e.amount_nanos ELSE 0 END)::text) FROM provider_earnings e JOIN provider_attempt_offers b ON b.attempt_id=e.attempt_id JOIN provider_offers o ON o.id=b.offer_id JOIN provider_offer_revisions r ON r.id=e.revision_id LEFT JOIN provider_settlement_entries s ON s.attempt_id=e.attempt_id WHERE e.provider_id=$1 AND e.created_at>=now()-make_interval(days=>$2) GROUP BY o.model_alias,r.id,r.prompt_rate,r.completion_rate,e.currency ORDER BY o.model_alias,r.id").bind(provider).bind(days).fetch_all(&mut *tx).await?;
        tx.commit().await?;
        Ok(
            json!({"id":provider,"name":name,"days":days,"balances":balances,"traffic":traffic,"daily":daily,"offers":offers,"earnings":earnings,"consumption":consumption,"settlements":settlements}),
        )
    }
}
