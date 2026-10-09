//! Durable payment intent. Authentication and independent payment verification
//! remain caller obligations; browser return URLs are never payment evidence.
use crate::{Store, StoreError};
use sqlx::FromRow;
use uuid::Uuid;

pub struct TopupInput<'a> {
    pub currency: &'a str,
    pub amount_nanos: i64,
    pub aggregator: &'a str,
    pub merchant: &'a str,
    pub payment_method: &'a str,
    pub idempotency_key: Uuid,
}

/// Internal integration metadata; not a customer API serialization contract.
#[derive(Clone, Debug, FromRow, PartialEq, Eq)]
pub struct TopupOrder {
    pub id: Uuid,
    pub organization_id: Uuid,
    pub account_id: Uuid,
    pub currency: String,
    pub amount_nanos: i64,
    pub aggregator: String,
    pub merchant: String,
    pub payment_method: String,
    pub idempotency_key: Uuid,
}
fn alphanumeric(value: &str, maximum: usize) -> bool {
    !value.is_empty() && value.len() <= maximum && value.bytes().all(|b| b.is_ascii_alphanumeric())
}
impl Store {
    /// Customer-safe saved checkout history. Internal references remain API
    /// routing/cursor values, never display labels. No merchant/procurement data.
    pub async fn customer_topup_history(
        &self,
        organization: Uuid,
        before: Option<Uuid>,
    ) -> Result<(Vec<serde_json::Value>, Option<Uuid>), StoreError> {
        let cursor: Option<(String, Uuid)> = if let Some(id) = before {
            Some(sqlx::query_as("SELECT created_at::text,id FROM customer_topup_orders WHERE organization_id=$1 AND id=$2").bind(organization).bind(id).fetch_optional(&self.pool).await?.ok_or(StoreError::Conflict)?)
        } else {
            None
        };
        let mut rows: Vec<serde_json::Value> = sqlx::query_scalar("SELECT jsonb_build_object('id',o.id,'currency',o.currency,'amount_nanos',o.amount_nanos::text,'payment_method',o.payment_method,'created_at',o.created_at,'status',CASE WHEN s.order_id IS NOT NULL THEN 'paid' WHEN c.order_id IS NOT NULL THEN 'closed' WHEN h.order_id IS NOT NULL THEN 'pending' ELSE 'reconciliation_required' END,'checkout_url',CASE WHEN s.order_id IS NULL AND c.order_id IS NULL THEN h.checkout_url ELSE NULL END) FROM customer_topup_orders o LEFT JOIN customer_topup_settlements s ON s.order_id=o.id LEFT JOIN customer_topup_closures c ON c.order_id=o.id LEFT JOIN customer_topup_checkout h ON h.order_id=o.id WHERE o.organization_id=$1 AND ($2::text IS NULL OR (o.created_at,o.id)<($2::text::timestamptz,$3)) ORDER BY o.created_at DESC,o.id DESC LIMIT 101")
            .bind(organization).bind(cursor.as_ref().map(|value| value.0.as_str())).bind(cursor.as_ref().map(|value| value.1)).fetch_all(&self.pool).await?;
        let next = if rows.len() > 100 {
            rows.truncate(100);
            rows.last()
                .and_then(|row| row["id"].as_str())
                .and_then(|id| Uuid::parse_str(id).ok())
        } else {
            None
        };
        Ok((rows, next))
    }
    pub async fn customer_topup_closed(
        &self,
        organization: Uuid,
        order: Uuid,
    ) -> Result<Option<bool>, StoreError> {
        Ok(sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM customer_topup_closures c WHERE c.order_id=o.id) FROM customer_topup_orders o WHERE o.organization_id=$1 AND o.id=$2").bind(organization).bind(order).fetch_optional(&self.pool).await?)
    }

    /// Trusted integration only, after independently querying a closed state
    /// matching saved intent and binding its immutable provider identity.
    pub async fn close_verified_customer_topup(
        &self,
        organization: Uuid,
        order: Uuid,
        platform_reference: &str,
    ) -> Result<(), StoreError> {
        let mut tx = self.pool.begin().await?;
        sqlx::query("SELECT id FROM organizations WHERE id=$1 FOR UPDATE")
            .bind(organization)
            .fetch_optional(&mut *tx)
            .await?
            .ok_or(StoreError::Conflict)?;
        sqlx::query(
            "SELECT id FROM customer_topup_orders WHERE organization_id=$1 AND id=$2 FOR UPDATE",
        )
        .bind(organization)
        .bind(order)
        .fetch_optional(&mut *tx)
        .await?
        .ok_or(StoreError::Conflict)?;
        let bound: Option<String> = sqlx::query_scalar(
            "SELECT platform_reference FROM customer_topup_provider_orders WHERE order_id=$1",
        )
        .bind(order)
        .fetch_optional(&mut *tx)
        .await?;
        if bound.as_deref() != Some(platform_reference) {
            return Err(StoreError::Conflict);
        }
        let paid: bool = sqlx::query_scalar(
            "SELECT EXISTS(SELECT 1 FROM customer_topup_settlements WHERE order_id=$1)",
        )
        .bind(order)
        .fetch_one(&mut *tx)
        .await?;
        if paid {
            return Err(StoreError::Conflict);
        }
        sqlx::query("INSERT INTO customer_topup_closures(order_id,platform_reference) VALUES($1,$2) ON CONFLICT DO NOTHING").bind(order).bind(platform_reference).execute(&mut *tx).await?;
        tx.commit().await?;
        Ok(())
    }

    /// Trusted integration only, after callback signature/intent verification.
    /// Commit receipt before acknowledging; independent query still gates funding.
    pub async fn record_verified_topup_notification(
        &self,
        organization: Uuid,
        order: Uuid,
    ) -> Result<(), StoreError> {
        let inserted = sqlx::query("INSERT INTO customer_topup_notifications(order_id) SELECT id FROM customer_topup_orders WHERE organization_id=$1 AND id=$2 ON CONFLICT DO NOTHING")
            .bind(organization).bind(order).execute(&self.pool).await?;
        if inserted.rows_affected() == 0 {
            let exists: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM customer_topup_notifications n JOIN customer_topup_orders o ON o.id=n.order_id WHERE o.organization_id=$1 AND o.id=$2)")
                .bind(organization).bind(order).fetch_one(&self.pool).await?;
            if !exists {
                return Err(StoreError::Conflict);
            }
        }
        Ok(())
    }

    pub async fn customer_topup_paid(
        &self,
        organization: Uuid,
        order: Uuid,
    ) -> Result<Option<bool>, StoreError> {
        Ok(sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM customer_topup_settlements s WHERE s.order_id=o.id) FROM customer_topup_orders o WHERE o.organization_id=$1 AND o.id=$2")
            .bind(organization).bind(order).fetch_optional(&self.pool).await?)
    }

    /// Bounded keyset recovery read for a trusted configured integration. Only
    /// claimed or bound orders are eligible; a saved intent alone is not sent.
    pub async fn pending_customer_topup(
        &self,
        aggregator: &str,
        merchant: &str,
        after: Option<Uuid>,
    ) -> Result<Option<TopupOrder>, StoreError> {
        Ok(sqlx::query_as("SELECT o.id,o.organization_id,o.account_id,o.currency,o.amount_nanos,o.aggregator,o.merchant,o.payment_method,o.idempotency_key FROM customer_topup_orders o WHERE o.aggregator=$1 AND o.merchant=$2 AND ($3::uuid IS NULL OR o.id>$3) AND NOT EXISTS(SELECT 1 FROM customer_topup_settlements s WHERE s.order_id=o.id) AND NOT EXISTS(SELECT 1 FROM customer_topup_closures c WHERE c.order_id=o.id) AND (EXISTS(SELECT 1 FROM customer_topup_creation_claims c WHERE c.order_id=o.id) OR EXISTS(SELECT 1 FROM customer_topup_provider_orders p WHERE p.order_id=o.id) OR EXISTS(SELECT 1 FROM customer_topup_notifications n WHERE n.order_id=o.id)) ORDER BY o.id LIMIT 1")
            .bind(aggregator).bind(merchant).bind(after).fetch_optional(&self.pool).await?)
    }

    /// Shared merchant query admission. Database time survives gateway restarts
    /// and coordinates replicas. A failed provider call still consumes its slot.
    pub async fn claim_payment_query(
        &self,
        aggregator: &str,
        merchant: &str,
    ) -> Result<bool, StoreError> {
        if !alphanumeric(aggregator, 32)
            || aggregator.bytes().any(|b| b.is_ascii_uppercase())
            || !alphanumeric(merchant, 64)
        {
            return Err(StoreError::InvalidPrice);
        }
        let result = sqlx::query("INSERT INTO payment_query_limits(aggregator,merchant,next_query_at) VALUES($1,$2,clock_timestamp()+interval '3 seconds') ON CONFLICT(aggregator,merchant) DO UPDATE SET next_query_at=clock_timestamp()+interval '3 seconds' WHERE payment_query_limits.next_query_at<=clock_timestamp()")
            .bind(aggregator).bind(merchant).execute(&self.pool).await?;
        Ok(result.rows_affected() == 1)
    }

    /// Commit once before an external order-creation request. False means an
    /// earlier process may have sent the request: reconcile, do not send again.
    /// A crash between this commit and dispatch intentionally needs recovery.
    pub async fn claim_customer_topup_creation(
        &self,
        organization: Uuid,
        order: Uuid,
    ) -> Result<bool, StoreError> {
        let mut tx = self.pool.begin().await?;
        sqlx::query("SELECT id FROM organizations WHERE id=$1 FOR UPDATE")
            .bind(organization)
            .fetch_optional(&mut *tx)
            .await?
            .ok_or(StoreError::Conflict)?;
        sqlx::query(
            "SELECT id FROM customer_topup_orders WHERE organization_id=$1 AND id=$2 FOR UPDATE",
        )
        .bind(organization)
        .bind(order)
        .fetch_optional(&mut *tx)
        .await?
        .ok_or(StoreError::Conflict)?;
        let bound: bool = sqlx::query_scalar(
            "SELECT EXISTS(SELECT 1 FROM customer_topup_provider_orders WHERE order_id=$1)",
        )
        .bind(order)
        .fetch_one(&mut *tx)
        .await?;
        if bound {
            return Ok(false);
        }
        let result = sqlx::query("INSERT INTO customer_topup_creation_claims(order_id) VALUES($1) ON CONFLICT DO NOTHING")
            .bind(order).execute(&mut *tx).await?;
        tx.commit().await?;
        Ok(result.rows_affected() == 1)
    }

    /// Trusted callback integration only. Merchant scope comes from the configured
    /// integration, never from a browser company identifier. This read grants no
    /// funding authority: signature and independent paid-query checks follow.
    pub async fn customer_topup_for_callback(
        &self,
        aggregator: &str,
        merchant: &str,
        order: Uuid,
    ) -> Result<Option<TopupOrder>, StoreError> {
        Ok(sqlx::query_as("SELECT id,organization_id,account_id,currency,amount_nanos,aggregator,merchant,payment_method,idempotency_key FROM customer_topup_orders WHERE id=$1 AND aggregator=$2 AND merchant=$3")
            .bind(order).bind(aggregator).bind(merchant).fetch_optional(&self.pool).await?)
    }

    /// Read immutable provider identity within an authorized company scope.
    /// Missing intent and an unbound intent both return None.
    pub async fn customer_topup_platform_reference(
        &self,
        organization: Uuid,
        order: Uuid,
    ) -> Result<Option<String>, StoreError> {
        Ok(sqlx::query_scalar("SELECT p.platform_reference FROM customer_topup_orders o JOIN customer_topup_provider_orders p ON p.order_id=o.id WHERE o.organization_id=$1 AND o.id=$2")
            .bind(organization).bind(order).fetch_optional(&self.pool).await?)
    }

    /// Create intent in an existing account. Retried intent must match every field.
    pub async fn create_customer_topup(
        &self,
        organization: Uuid,
        input: &TopupInput<'_>,
    ) -> Result<TopupOrder, StoreError> {
        if input.amount_nanos <= 0
            || input.currency.len() != 3
            || !input.currency.bytes().all(|b| b.is_ascii_uppercase())
            || !alphanumeric(input.aggregator, 32)
            || input.aggregator.bytes().any(|b| b.is_ascii_uppercase())
            || !alphanumeric(input.merchant, 64)
            || input.payment_method.is_empty()
            || input.payment_method.len() > 64
            || !input
                .payment_method
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'.' | b'-'))
        {
            return Err(StoreError::InvalidPrice);
        }
        let mut tx = self.pool.begin().await?;
        sqlx::query("SELECT id FROM organizations WHERE id=$1 FOR UPDATE")
            .bind(organization)
            .fetch_optional(&mut *tx)
            .await?
            .ok_or(StoreError::Conflict)?;
        let account:Uuid=sqlx::query_scalar("SELECT id FROM customer_balance_accounts WHERE organization_id=$1 AND currency=$2 FOR UPDATE").bind(organization).bind(input.currency).fetch_optional(&mut *tx).await?.ok_or(StoreError::Conflict)?;
        let prior:Option<TopupOrder>=sqlx::query_as("SELECT id,organization_id,account_id,currency,amount_nanos,aggregator,merchant,payment_method,idempotency_key FROM customer_topup_orders WHERE organization_id=$1 AND idempotency_key=$2").bind(organization).bind(input.idempotency_key).fetch_optional(&mut *tx).await?;
        if let Some(prior) = prior {
            if prior.account_id != account
                || prior.currency != input.currency
                || prior.amount_nanos != input.amount_nanos
                || prior.aggregator != input.aggregator
                || prior.merchant != input.merchant
                || prior.payment_method != input.payment_method
            {
                return Err(StoreError::Conflict);
            }
            return Ok(prior);
        }
        let order = TopupOrder {
            id: Uuid::new_v4(),
            organization_id: organization,
            account_id: account,
            currency: input.currency.into(),
            amount_nanos: input.amount_nanos,
            aggregator: input.aggregator.into(),
            merchant: input.merchant.into(),
            payment_method: input.payment_method.into(),
            idempotency_key: input.idempotency_key,
        };
        sqlx::query("INSERT INTO customer_topup_orders(id,organization_id,account_id,currency,amount_nanos,aggregator,merchant,payment_method,idempotency_key) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)").bind(order.id).bind(organization).bind(account).bind(&order.currency).bind(order.amount_nanos).bind(&order.aggregator).bind(&order.merchant).bind(&order.payment_method).bind(order.idempotency_key).execute(&mut *tx).await?;
        tx.commit().await?;
        Ok(order)
    }

    /// Read saved intent using authorized company scope, before payment verification.
    pub async fn customer_topup(
        &self,
        organization: Uuid,
        order: Uuid,
    ) -> Result<Option<TopupOrder>, StoreError> {
        Ok(sqlx::query_as("SELECT id,organization_id,account_id,currency,amount_nanos,aggregator,merchant,payment_method,idempotency_key FROM customer_topup_orders WHERE organization_id=$1 AND id=$2").bind(organization).bind(order).fetch_optional(&self.pool).await?)
    }

    /// Save a validated creation response; provider identities cannot be rebound.
    pub async fn bind_customer_topup_provider(
        &self,
        organization: Uuid,
        order: Uuid,
        platform_reference: &str,
    ) -> Result<(), StoreError> {
        self.bind_customer_topup_response(organization, order, platform_reference, None)
            .await
    }

    /// Trusted integration only: transport must validate the configured checkout
    /// origin before this atomic identity/URL write. Neither record grants funds.
    pub async fn bind_customer_topup_checkout(
        &self,
        organization: Uuid,
        order: Uuid,
        platform_reference: &str,
        checkout_url: &str,
    ) -> Result<(), StoreError> {
        self.bind_customer_topup_response(
            organization,
            order,
            platform_reference,
            Some(checkout_url),
        )
        .await
    }

    /// Trusted classic EPay integration: save the validated merchant-order URL
    /// before the provider assigns a payment reference. This grants no funds.
    pub async fn save_epay_merchant_checkout(
        &self,
        organization: Uuid,
        order: Uuid,
        checkout_url: &str,
    ) -> Result<(), StoreError> {
        let url = url::Url::parse(checkout_url).map_err(|_| StoreError::InvalidPrice)?;
        if checkout_url.len() > 2048
            || url.scheme() != "https"
            || url.host_str().is_none()
            || !url.username().is_empty()
            || url.password().is_some()
            || url.fragment().is_some()
            || !url.path().ends_with("/submit.php")
        {
            return Err(StoreError::InvalidPrice);
        }
        let mut tx = self.pool.begin().await?;
        sqlx::query("SELECT id FROM organizations WHERE id=$1 FOR UPDATE")
            .bind(organization)
            .fetch_optional(&mut *tx)
            .await?
            .ok_or(StoreError::Conflict)?;
        let exists: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM customer_topup_orders WHERE id=$1 AND organization_id=$2 AND aggregator='epay' AND currency='CNY')")
            .bind(order).bind(organization).fetch_one(&mut *tx).await?;
        if !exists {
            return Err(StoreError::Conflict);
        }
        sqlx::query("INSERT INTO customer_topup_checkout(order_id,checkout_url) VALUES($1,$2) ON CONFLICT DO NOTHING")
            .bind(order).bind(checkout_url).execute(&mut *tx).await?;
        let saved: String = sqlx::query_scalar(
            "SELECT checkout_url FROM customer_topup_checkout WHERE order_id=$1",
        )
        .bind(order)
        .fetch_one(&mut *tx)
        .await?;
        if saved != checkout_url {
            return Err(StoreError::Conflict);
        }
        tx.commit().await?;
        Ok(())
    }

    pub async fn customer_topup_checkout(
        &self,
        organization: Uuid,
        order: Uuid,
    ) -> Result<Option<String>, StoreError> {
        Ok(sqlx::query_scalar("SELECT c.checkout_url FROM customer_topup_checkout c JOIN customer_topup_orders o ON o.id=c.order_id WHERE o.organization_id=$1 AND o.id=$2")
            .bind(organization).bind(order).fetch_optional(&self.pool).await?)
    }

    async fn bind_customer_topup_response(
        &self,
        organization: Uuid,
        order: Uuid,
        platform_reference: &str,
        checkout_url: Option<&str>,
    ) -> Result<(), StoreError> {
        let mut tx = self.pool.begin().await?;
        sqlx::query("SELECT id FROM organizations WHERE id=$1 FOR UPDATE")
            .bind(organization)
            .fetch_optional(&mut *tx)
            .await?
            .ok_or(StoreError::Conflict)?;
        let (aggregator,merchant):(String,String)=sqlx::query_as("SELECT aggregator,merchant FROM customer_topup_orders WHERE organization_id=$1 AND id=$2 FOR UPDATE").bind(organization).bind(order).fetch_optional(&mut *tx).await?.ok_or(StoreError::Conflict)?;
        if let Some(checkout_url) = checkout_url {
            let url = url::Url::parse(checkout_url).map_err(|_| StoreError::InvalidPrice)?;
            let adapter_valid = if aggregator == "stripe" {
                checkout_url.len() <= 8192
                    && url.host_str() == Some("checkout.stripe.com")
                    && url.port().is_none()
            } else {
                checkout_url.len() <= 2048 && url.fragment().is_none()
            };
            if !adapter_valid
                || url.scheme() != "https"
                || url.host_str().is_none()
                || !url.username().is_empty()
                || url.password().is_some()
            {
                return Err(StoreError::InvalidPrice);
            }
        }
        let valid_reference = if aggregator == "stripe" {
            platform_reference.len() <= 255
                && platform_reference
                    .strip_prefix("cs_")
                    .is_some_and(|suffix| {
                        !suffix.is_empty()
                            && suffix
                                .bytes()
                                .all(|b| b.is_ascii_alphanumeric() || b == b'_')
                    })
        } else if aggregator == "epay" {
            (1..=128).contains(&platform_reference.len())
                && platform_reference
                    .bytes()
                    .all(|byte| byte.is_ascii_alphanumeric() || b"_-".contains(&byte))
        } else {
            alphanumeric(platform_reference, 128)
        };
        if !valid_reference {
            return Err(StoreError::InvalidPrice);
        }
        let prior: Option<String> = sqlx::query_scalar(
            "SELECT platform_reference FROM customer_topup_provider_orders WHERE order_id=$1",
        )
        .bind(order)
        .fetch_optional(&mut *tx)
        .await?;
        if let Some(prior) = prior {
            if prior != platform_reference {
                return Err(StoreError::Conflict);
            }
        } else {
            let result=sqlx::query("INSERT INTO customer_topup_provider_orders(order_id,aggregator,merchant,platform_reference) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING").bind(order).bind(aggregator).bind(merchant).bind(platform_reference).execute(&mut *tx).await?;
            if result.rows_affected() != 1 {
                return Err(StoreError::Conflict);
            }
        }
        if let Some(checkout_url) = checkout_url {
            sqlx::query("INSERT INTO customer_topup_checkout(order_id,checkout_url) VALUES($1,$2) ON CONFLICT DO NOTHING")
                .bind(order).bind(checkout_url).execute(&mut *tx).await?;
            let saved: String = sqlx::query_scalar(
                "SELECT checkout_url FROM customer_topup_checkout WHERE order_id=$1",
            )
            .bind(order)
            .fetch_one(&mut *tx)
            .await?;
            if saved != checkout_url {
                return Err(StoreError::Conflict);
            }
        }
        tx.commit().await?;
        Ok(())
    }

    /// Trusted payment integration only, after independent paid-order verification.
    /// Funding entry, globally unique receipt and order settlement commit together.
    pub async fn settle_verified_customer_topup(
        &self,
        organization: Uuid,
        order: Uuid,
        platform_reference: &str,
        verified_amount_nanos: i64,
    ) -> Result<Uuid, StoreError> {
        let mut tx = self.pool.begin().await?;
        // Same lock order as funding/policy writes: company, order, then account.
        sqlx::query("SELECT id FROM organizations WHERE id=$1 FOR UPDATE")
            .bind(organization)
            .fetch_optional(&mut *tx)
            .await?
            .ok_or(StoreError::Conflict)?;
        let saved:TopupOrder=sqlx::query_as("SELECT id,organization_id,account_id,currency,amount_nanos,aggregator,merchant,payment_method,idempotency_key FROM customer_topup_orders WHERE organization_id=$1 AND id=$2 FOR UPDATE").bind(organization).bind(order).fetch_optional(&mut *tx).await?.ok_or(StoreError::Conflict)?;
        let closed: bool = sqlx::query_scalar(
            "SELECT EXISTS(SELECT 1 FROM customer_topup_closures WHERE order_id=$1)",
        )
        .bind(order)
        .fetch_one(&mut *tx)
        .await?;
        if closed {
            return Err(StoreError::Conflict);
        }
        let bound: Option<String> = sqlx::query_scalar(
            "SELECT platform_reference FROM customer_topup_provider_orders WHERE order_id=$1",
        )
        .bind(order)
        .fetch_optional(&mut *tx)
        .await?;
        if bound.as_deref() != Some(platform_reference)
            || verified_amount_nanos != saved.amount_nanos
        {
            return Err(StoreError::Conflict);
        }
        let prior: Option<Uuid> =
            sqlx::query_scalar("SELECT entry_id FROM customer_topup_settlements WHERE order_id=$1")
                .bind(order)
                .fetch_optional(&mut *tx)
                .await?;
        if let Some(entry) = prior {
            return Ok(entry);
        }
        sqlx::query("SELECT id FROM customer_balance_accounts WHERE id=$1 FOR UPDATE")
            .bind(saved.account_id)
            .fetch_one(&mut *tx)
            .await?;
        let channel = format!("{}:{}", saved.aggregator, saved.merchant);
        let entry = Uuid::new_v4();
        sqlx::query("INSERT INTO customer_balance_entries(id,organization_id,account_id,currency,kind,amount_nanos,idempotency_key) VALUES($1,$2,$3,$4,'funding',$5,$6)").bind(entry).bind(organization).bind(saved.account_id).bind(&saved.currency).bind(saved.amount_nanos).bind(order).execute(&mut *tx).await?;
        let receipt=sqlx::query("INSERT INTO customer_funding_receipts(channel,payment_reference,organization_id,account_id,currency,entry_id,amount_nanos) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING").bind(channel).bind(platform_reference).bind(organization).bind(saved.account_id).bind(&saved.currency).bind(entry).bind(saved.amount_nanos).execute(&mut *tx).await?;
        if receipt.rows_affected() != 1 {
            return Err(StoreError::Conflict);
        }
        sqlx::query("INSERT INTO customer_topup_settlements(order_id,organization_id,account_id,currency,entry_id) VALUES($1,$2,$3,$4,$5)").bind(order).bind(organization).bind(saved.account_id).bind(&saved.currency).bind(entry).execute(&mut *tx).await?;
        tx.commit().await?;
        Ok(entry)
    }
}
