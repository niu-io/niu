//! Customer-over-global selection of explicit prices under one identity lock.
//! Preview callers receive advice; admission must select and pin in its own tx.
use crate::{RetailSchedule, Store, StoreError};
use serde::Serialize;
use serde_json::{Value, json};
use sqlx::{Postgres, Transaction};
use uuid::Uuid;

#[derive(Clone, Serialize)]
pub struct RetailSelection {
    pub price_id: Uuid,
    pub model_alias: String,
    pub currency: String,
    pub version: String,
    pub current_standard_revision: Uuid,
    pub baseline_revision: Uuid,
    pub promotion_revision: Option<Uuid>,
    pub promotion_scope: Option<&'static str>,
    pub selected_at: String,
    pub schedule: RetailSchedule,
}
#[derive(sqlx::FromRow)]
struct Head {
    model_alias: String,
    currency: String,
    version: i64,
    current_revision: Uuid,
    schedule: Value,
}
#[derive(sqlx::FromRow)]
struct Promotion {
    id: Uuid,
    baseline_revision: Uuid,
    customer_organization_id: Option<Uuid>,
    schedule: Value,
}
impl Store {
    pub(crate) async fn select_retail_price_in_tx(
        tx: &mut Transaction<'_, Postgres>,
        head: Uuid,
        customer: Uuid,
    ) -> Result<RetailSelection, StoreError> {
        Self::select_retail_price_at_in_tx(tx, head, customer, None).await
    }
    /// Supplied time must be captured after the caller owns all admission locks.
    pub(crate) async fn select_retail_price_at_in_tx(
        tx: &mut Transaction<'_, Postgres>,
        head: Uuid,
        customer: Uuid,
        at: Option<i64>,
    ) -> Result<RetailSelection, StoreError> {
        let price:Head=sqlx::query_as("SELECT h.model_alias,h.currency,h.version,h.current_revision,s.schedule FROM platform_retail_price_heads h JOIN platform_retail_standard_revisions s ON s.id=h.current_revision WHERE h.id=$1 FOR SHARE OF h")
            .bind(head).fetch_optional(&mut **tx).await?.ok_or(StoreError::Conflict)?;
        // Obtain time after the identity lock, so waiting on publication cannot
        // retain a preview timestamp across an expiry boundary.
        let at = match at {
            Some(at) if at >= 0 => at,
            Some(_) => return Err(StoreError::InvalidPrice),
            None => {
                sqlx::query_scalar("SELECT floor(extract(epoch FROM clock_timestamp()))::bigint")
                    .fetch_one(&mut **tx)
                    .await?
            }
        };
        let promotions:Vec<Promotion>=sqlx::query_as("SELECT p.id,p.baseline_revision,p.customer_organization_id,p.schedule FROM platform_retail_promotions p LEFT JOIN platform_retail_promotion_retirements r ON r.promotion_id=p.id WHERE p.head_id=$1 AND (p.customer_organization_id IS NULL OR p.customer_organization_id=$2) AND p.effective_from<=$3 AND LEAST(p.effective_until,COALESCE(r.effective_until,p.effective_until))>$3 ORDER BY (p.customer_organization_id IS NOT NULL) DESC LIMIT 3")
            .bind(head).bind(customer).bind(at).fetch_all(&mut **tx).await?;
        if promotions
            .iter()
            .filter(|p| p.customer_organization_id.is_some())
            .count()
            > 1
            || promotions
                .iter()
                .filter(|p| p.customer_organization_id.is_none())
                .count()
                > 1
        {
            return Err(StoreError::Conflict);
        }
        let (baseline, promotion, scope, schedule) =
            if let Some(selected) = promotions.into_iter().next() {
                (
                    selected.baseline_revision,
                    Some(selected.id),
                    Some(if selected.customer_organization_id.is_some() {
                        "customer"
                    } else {
                        "global"
                    }),
                    selected.schedule,
                )
            } else {
                (price.current_revision, None, None, price.schedule)
            };
        let schedule: RetailSchedule =
            serde_json::from_value(schedule).map_err(|_| StoreError::InvalidPrice)?;
        schedule.validate()?;
        Ok(RetailSelection {
            price_id: head,
            model_alias: price.model_alias,
            currency: price.currency,
            version: price.version.to_string(),
            current_standard_revision: price.current_revision,
            baseline_revision: baseline,
            promotion_revision: promotion,
            promotion_scope: scope,
            selected_at: at.to_string(),
            schedule,
        })
    }
    pub async fn preview_retail_price(
        &self,
        head: Uuid,
        customer: Uuid,
    ) -> Result<RetailSelection, StoreError> {
        let mut tx = self.begin_bounded_recording().await?;
        let exists: bool =
            sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM organizations WHERE id=$1)")
                .bind(customer)
                .fetch_one(&mut *tx)
                .await?;
        if !exists {
            return Err(StoreError::Conflict);
        }
        let selected = Self::select_retail_price_in_tx(&mut tx, head, customer).await?;
        tx.commit().await?;
        Ok(selected)
    }
    /// Platform management list only. Cursor and rows share a statement snapshot;
    /// no Provider quote, customer charge or credential is read.
    pub async fn platform_retail_prices(
        &self,
        after: Option<Uuid>,
        limit: i64,
    ) -> Result<Value, StoreError> {
        if !(1..=100).contains(&limit) {
            return Err(StoreError::InvalidPrice);
        }
        let (valid,rows):(bool,Vec<Value>)=sqlx::query_as("SELECT ($1::uuid IS NULL OR EXISTS(SELECT 1 FROM platform_retail_price_heads WHERE id=$1)),ARRAY(SELECT jsonb_build_object('price_id',h.id,'model_alias',h.model_alias,'currency',h.currency,'version',h.version::text,'revision',s.id,'schedule',s.schedule,'published_at',c.created_at) FROM platform_retail_price_heads h JOIN platform_retail_standard_revisions s ON s.id=h.current_revision JOIN platform_retail_price_changes c ON c.id=s.id WHERE ($1::uuid IS NULL OR h.id>$1) ORDER BY h.id LIMIT $2)")
            .bind(after).bind(limit+1).fetch_one(&self.pool).await?;
        if !valid {
            return Err(StoreError::Conflict);
        }
        let mut rows = rows;
        let more = rows.len() > limit as usize;
        rows.truncate(limit as usize);
        let next = if more {
            rows.last().and_then(|v| v.get("price_id")).cloned()
        } else {
            None
        };
        Ok(json!({"data":rows,"next_after":next}))
    }
    /// Platform-only temporal promotion state, including all committed cutoffs.
    /// Within-period status is not customer selection, supply or spending authorization.
    pub async fn platform_retail_promotions(
        &self,
        head: Uuid,
        before: Option<i64>,
        limit: i64,
    ) -> Result<Value, StoreError> {
        if !(1..=100).contains(&limit) || before.is_some_and(|v| v <= 0) {
            return Err(StoreError::InvalidPrice);
        }
        let result: Option<(bool, Value)> = sqlx::query_as(include_str!("retail_promotions.sql"))
            .bind(head)
            .bind(before)
            .bind(limit)
            .fetch_optional(&self.pool)
            .await?;
        let (valid, mut result) = result.ok_or(StoreError::Conflict)?;
        if !valid {
            return Err(StoreError::Conflict);
        }
        let rows = result["data"].as_array_mut().ok_or(StoreError::Conflict)?;
        let more = rows.len() > limit as usize;
        rows.truncate(limit as usize);
        let next = if more {
            rows.last().and_then(|r| r.get("version")).cloned()
        } else {
            None
        };
        result["next_before"] = json!(next);
        Ok(result)
    }
    /// Immutable configuration history. Other customers' rules are returned only
    /// to independently authenticated platform administrators.
    pub async fn platform_retail_price_history(
        &self,
        head: Uuid,
        before: Option<i64>,
        limit: i64,
    ) -> Result<Value, StoreError> {
        if !(1..=100).contains(&limit) || before.is_some_and(|v| v <= 0) {
            return Err(StoreError::InvalidPrice);
        }
        let result:Option<(bool,Value)>=sqlx::query_as("SELECT ($2::bigint IS NULL OR EXISTS(SELECT 1 FROM platform_retail_price_changes WHERE head_id=h.id AND version=$2)),jsonb_build_object('price_id',h.id,'model_alias',h.model_alias,'currency',h.currency,'current_version',h.version::text,'current_revision',h.current_revision,'data',(SELECT COALESCE(jsonb_agg(document ORDER BY version DESC),'[]'::jsonb) FROM (SELECT c.version,jsonb_build_object('revision',c.id,'version',c.version::text,'action',c.action,'reason',c.reason,'created_at',c.created_at,'standard_schedule',s.schedule,'promotion',CASE WHEN p.id IS NOT NULL THEN jsonb_build_object('baseline_revision',p.baseline_revision,'scope',CASE WHEN p.customer_organization_id IS NULL THEN 'global' ELSE 'customer' END,'customer_organization_id',p.customer_organization_id,'customer_name',org.name,'effective_from',p.effective_from::text,'effective_until',p.effective_until::text,'schedule',p.schedule) END,'retirement',CASE WHEN r.id IS NOT NULL THEN jsonb_build_object('promotion_revision',r.promotion_id,'effective_until',r.effective_until::text) END) AS document FROM platform_retail_price_changes c LEFT JOIN platform_retail_standard_revisions s ON s.id=c.id LEFT JOIN platform_retail_promotions p ON p.id=c.id LEFT JOIN organizations org ON org.id=p.customer_organization_id LEFT JOIN platform_retail_promotion_retirements r ON r.id=c.id WHERE c.head_id=h.id AND ($2::bigint IS NULL OR c.version<$2) ORDER BY c.version DESC LIMIT $3) page)) FROM platform_retail_price_heads h WHERE h.id=$1")
            .bind(head).bind(before).bind(limit+1).fetch_optional(&self.pool).await?;
        let (valid, mut page) = result.ok_or(StoreError::Conflict)?;
        if !valid {
            return Err(StoreError::Conflict);
        }
        let rows = page["data"].as_array_mut().ok_or(StoreError::Conflict)?;
        let more = rows.len() > limit as usize;
        rows.truncate(limit as usize);
        let next = if more {
            rows.last().and_then(|v| v.get("version")).cloned()
        } else {
            None
        };
        page["next_before"] = json!(next);
        Ok(page)
    }
}
