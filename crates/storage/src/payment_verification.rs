//! Configuration-scoped payment evidence, separate from customer orders and balances.
//! Callers authorize checks and derive the digest from the complete effective configuration.
use crate::{Store, StoreError};
use uuid::Uuid;

fn valid_scope(gateway: &str, digest: &[u8], kind: &str) -> bool {
    matches!(gateway, "stripe" | "epay" | "zhifux")
        && digest.len() == 32
        && matches!(kind, "account" | "callback")
}
impl Store {
    /// A scoped, explicit funding arrangement permits self-hosted use without a
    /// merchant. This is setup eligibility, not spendable capacity: exhausting
    /// credits must not hide history/settings. Dispatch retains its own monetary
    /// reservation checks. Empty accounts and arbitrary adjustments do not qualify.
    pub async fn customer_has_funding_arrangement(
        &self,
        organization: Uuid,
        currency: &str,
    ) -> Result<bool, StoreError> {
        Ok(sqlx::query_scalar(
            "SELECT EXISTS(
                SELECT 1 FROM customer_balance_accounts a
                WHERE a.organization_id=$1
                  AND a.currency=$2
                  AND (
                      a.credit_limit_nanos>0
                      OR EXISTS(SELECT 1 FROM customer_balance_entries e WHERE e.account_id=a.id AND e.kind='funding')
                      OR EXISTS(
                          SELECT 1 FROM customer_balance_grants g
                          WHERE g.account_id=a.id
                            AND NOT EXISTS(SELECT 1 FROM customer_balance_grant_corrections c WHERE c.grant_id=g.id)
                      )
                  )
            ) OR EXISTS(
                SELECT 1
                FROM customer_unit_configuration c
                JOIN customer_unit_lots l ON l.organization_id=$1
                WHERE c.singleton AND c.billing_mode='credits'
            )",
        )
        .bind(organization)
        .bind(currency)
        .fetch_one(&self.pool)
        .await?)
    }
    /// Bind only a claimed checkout before any provider response has been saved.
    /// Replays cannot attach today's configuration to a legacy checkout.
    pub async fn bind_payment_checkout_verification(
        &self,
        order: Uuid,
        gateway: &str,
        digest: &[u8],
    ) -> Result<(), StoreError> {
        if !valid_scope(gateway, digest, "callback") {
            return Err(StoreError::Conflict);
        }
        let inserted = sqlx::query("INSERT INTO payment_checkout_verification(order_id,gateway,configuration_digest) SELECT o.id,o.aggregator,$3 FROM customer_topup_orders o JOIN customer_topup_creation_claims c ON c.order_id=o.id WHERE o.id=$1 AND o.aggregator=$2 AND NOT EXISTS(SELECT 1 FROM customer_topup_provider_orders p WHERE p.order_id=o.id) ON CONFLICT(order_id) DO NOTHING")
            .bind(order).bind(gateway).bind(digest).execute(&self.pool).await?.rows_affected();
        if inserted != 1 {
            return Err(StoreError::Conflict);
        }
        Ok(())
    }

    /// Called only after authenticating a paid callback and settling its bound
    /// order. Old/unbound or differently configured orders still settle normally,
    /// but supply no readiness evidence for this configuration.
    pub async fn verify_payment_callback(
        &self,
        order: Uuid,
        gateway: &str,
        digest: &[u8],
    ) -> Result<(), StoreError> {
        if !valid_scope(gateway, digest, "callback") {
            return Err(StoreError::Conflict);
        }
        sqlx::query("INSERT INTO payment_callback_verification(order_id) SELECT b.order_id FROM payment_checkout_verification b JOIN customer_topup_settlements s ON s.order_id=b.order_id WHERE b.order_id=$1 AND b.gateway=$2 AND b.configuration_digest=$3 ON CONFLICT(order_id) DO NOTHING")
            .bind(order).bind(gateway).bind(digest).execute(&self.pool).await?;
        Ok(())
    }

    /// Trusted signed notification, separate from independent settlement. No backfill.
    pub async fn record_payment_signed_notification(
        &self,
        order: Uuid,
        gateway: &str,
        digest: &[u8],
    ) -> Result<(), StoreError> {
        if !valid_scope(gateway, digest, "callback") {
            return Err(StoreError::Conflict);
        }
        sqlx::query("INSERT INTO payment_signed_notifications(order_id) SELECT order_id FROM payment_checkout_verification WHERE order_id=$1 AND gateway=$2 AND configuration_digest=$3 ON CONFLICT DO NOTHING")
            .bind(order).bind(gateway).bind(digest).execute(&self.pool).await?;
        self.verify_payment_notified_settlement(order, gateway, digest)
            .await
    }
    /// May be called after either receipt or settlement; both must exist.
    pub async fn verify_payment_notified_settlement(
        &self,
        order: Uuid,
        gateway: &str,
        digest: &[u8],
    ) -> Result<(), StoreError> {
        if !valid_scope(gateway, digest, "callback") {
            return Err(StoreError::Conflict);
        }
        sqlx::query("INSERT INTO payment_callback_verification(order_id) SELECT b.order_id FROM payment_checkout_verification b JOIN payment_signed_notifications n ON n.order_id=b.order_id JOIN customer_topup_settlements s ON s.order_id=b.order_id WHERE b.order_id=$1 AND b.gateway=$2 AND b.configuration_digest=$3 ON CONFLICT DO NOTHING")
            .bind(order).bind(gateway).bind(digest).execute(&self.pool).await?;
        Ok(())
    }

    /// Integration evidence is configuration-bound and durable; it does not
    /// establish current merchant eligibility (which requires fresh account evidence).
    pub async fn payment_callback_verified(
        &self,
        gateway: &str,
        digest: &[u8],
    ) -> Result<bool, StoreError> {
        if !valid_scope(gateway, digest, "callback") {
            return Err(StoreError::Conflict);
        }
        Ok(sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM payment_checkout_verification b JOIN customer_topup_settlements s ON s.order_id=b.order_id LEFT JOIN payment_callback_verification v ON v.order_id=b.order_id LEFT JOIN payment_signed_notifications n ON n.order_id=b.order_id WHERE b.gateway=$1 AND b.configuration_digest=$2 AND (v.order_id IS NOT NULL OR (b.gateway='zhifux' AND n.order_id IS NOT NULL)))")
            .bind(gateway).bind(digest).fetch_one(&self.pool).await?)
    }
    /// Allocate ordering before contacting the external service. Late results cannot
    /// supersede checks that started later. Mock evidence cannot enter this table.
    pub async fn begin_payment_verification(
        &self,
        gateway: &str,
        digest: &[u8],
        kind: &str,
    ) -> Result<Uuid, StoreError> {
        if !valid_scope(gateway, digest, kind) {
            return Err(StoreError::Conflict);
        }
        Ok(sqlx::query_scalar("INSERT INTO payment_verification_evidence(gateway,configuration_digest,evidence_kind) VALUES($1,$2,$3) RETURNING id")
            .bind(gateway).bind(digest).bind(kind).fetch_one(&self.pool).await?)
    }
    /// Store only a bounded validity decision; merchant payloads stay out of storage.
    /// The caller chooses freshness policy. A failed check has no validity interval.
    pub async fn finish_payment_verification(
        &self,
        id: Uuid,
        valid_for_seconds: Option<i64>,
    ) -> Result<(), StoreError> {
        if valid_for_seconds.is_some_and(|seconds| !(1..=2_592_000).contains(&seconds)) {
            return Err(StoreError::Conflict);
        }
        let affected = sqlx::query("UPDATE payment_verification_evidence SET outcome=CASE WHEN $2::bigint IS NULL THEN 'failed' ELSE 'passed' END, completed_at=statement_timestamp(), expires_at=CASE WHEN $2::bigint IS NULL THEN NULL ELSE statement_timestamp()+($2 * interval '1 second') END WHERE id=$1 AND outcome='pending'")
            .bind(id).bind(valid_for_seconds).execute(&self.pool).await?.rows_affected();
        if affected != 1 {
            return Err(StoreError::Conflict);
        }
        Ok(())
    }
    /// Finish a transiently unavailable check without extending prior evidence.
    pub async fn payment_verification_unavailable(&self, id: Uuid) -> Result<(), StoreError> {
        let affected = sqlx::query("UPDATE payment_verification_evidence SET outcome='unavailable', completed_at=statement_timestamp() WHERE id=$1 AND outcome='pending'")
            .bind(id).execute(&self.pool).await?.rows_affected();
        if affected != 1 {
            return Err(StoreError::Conflict);
        }
        Ok(())
    }
    /// Pending/unavailable attempts never extend prior evidence. A previous
    /// definitive check remains usable only until its original expiry; an explicit
    /// failure revokes it immediately. Unknown initial state is always false.
    /// This is one evidence dimension, not a complete installation-readiness verdict.
    pub async fn payment_verification_valid(
        &self,
        gateway: &str,
        digest: &[u8],
        kind: &str,
    ) -> Result<bool, StoreError> {
        if !valid_scope(gateway, digest, kind) {
            return Err(StoreError::Conflict);
        }
        Ok(sqlx::query_scalar::<_, bool>("SELECT outcome='passed' AND expires_at>statement_timestamp() FROM payment_verification_evidence WHERE gateway=$1 AND configuration_digest=$2 AND evidence_kind=$3 AND outcome IN ('passed','failed') ORDER BY sequence DESC LIMIT 1")
            .bind(gateway).bind(digest).bind(kind).fetch_optional(&self.pool).await?.unwrap_or(false))
    }
}
