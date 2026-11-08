//! Configuration-scoped payment evidence, separate from customer orders and balances.
//! Callers authorize checks and derive the digest from the complete effective configuration.
use crate::{Store, StoreError};
use serde_json::Value;
use uuid::Uuid;

/// Installation-level readiness facts in one statement. The caller derives
/// configuration digests from the current runtime and matches them here, so a
/// process cache never decides whether a merchant or callback is still valid.
/// Expiry is evaluated by the database clock together with the evidence rows.
#[derive(Clone, Debug, Default)]
pub struct PaymentReadinessFacts {
    pub currency: Option<String>,
    pub epay_configuration: Option<(i64, Vec<u8>)>,
    callback_digests: Vec<(String, [u8; 32])>,
    verification_evidence: Vec<PaymentVerificationEvidence>,
}

#[derive(Clone, Debug)]
struct PaymentVerificationEvidence {
    gateway: String,
    kind: String,
    digest: [u8; 32],
    valid: bool,
}

impl PaymentReadinessFacts {
    pub fn callback_verified(&self, gateway: &str, digest: &[u8; 32]) -> bool {
        self.callback_digests
            .iter()
            .any(|(stored, candidate)| stored == gateway && candidate == digest)
    }

    pub fn verification_valid(&self, gateway: &str, kind: &str, digest: &[u8; 32]) -> bool {
        self.verification_evidence.iter().any(|evidence| {
            evidence.gateway == gateway
                && evidence.kind == kind
                && &evidence.digest == digest
                && evidence.valid
        })
    }
}

fn digest_from_hex(value: &str) -> Option<[u8; 32]> {
    fn nibble(byte: u8) -> Option<u8> {
        match byte {
            b'0'..=b'9' => Some(byte - b'0'),
            b'a'..=b'f' => Some(byte - b'a' + 10),
            b'A'..=b'F' => Some(byte - b'A' + 10),
            _ => None,
        }
    }
    if value.len() != 64 {
        return None;
    }
    let mut digest = [0u8; 32];
    for (index, chunk) in value.as_bytes().as_chunks::<2>().0.iter().enumerate() {
        digest[index] = (nibble(chunk[0])? << 4) | nibble(chunk[1])?;
    }
    Some(digest)
}

#[derive(sqlx::FromRow)]
struct PaymentReadinessRow {
    currency: Option<String>,
    epay_revision: Option<i64>,
    epay_ciphertext: Option<Vec<u8>>,
    callback_digests: Value,
    verification_evidence: Value,
}

fn valid_scope(gateway: &str, digest: &[u8], kind: &str) -> bool {
    matches!(gateway, "stripe" | "epay" | "zhifux")
        && digest.len() == 32
        && matches!(kind, "account" | "callback")
}
impl Store {
    /// One statement supplies installation readiness and currency facts. The
    /// readiness gate must not depend on a TTL cache: callback evidence can be
    /// revoked immediately and account evidence expires on the database clock.
    /// This keeps the authoritative read at one round trip without serving stale
    /// positive state after a configuration revision or evidence change.
    pub async fn payment_readiness_facts(&self) -> Result<PaymentReadinessFacts, StoreError> {
        let row = sqlx::query_as::<_, PaymentReadinessRow>(
            "SELECT \
                (SELECT currency FROM platform_currency WHERE singleton) AS currency, \
                (SELECT revision FROM payment_gateway_configuration WHERE gateway='epay') AS epay_revision, \
                (SELECT ciphertext FROM payment_gateway_configuration WHERE gateway='epay') AS epay_ciphertext, \
                COALESCE(( \
                    SELECT jsonb_agg(jsonb_build_object('gateway', verified.gateway, 'digest', encode(verified.configuration_digest,'hex'))) \
                    FROM payment_verified_callback_digests verified \
                ), '[]'::jsonb) AS callback_digests, \
                COALESCE(( \
                    SELECT jsonb_agg(jsonb_build_object( \
                        'gateway', evidence.gateway, 'kind', evidence.evidence_kind, \
                        'digest', encode(evidence.configuration_digest,'hex'), \
                        'valid', COALESCE(evidence.outcome='passed' AND evidence.expires_at>statement_timestamp(),false))) \
                    FROM (SELECT DISTINCT ON (gateway,configuration_digest,evidence_kind) \
                                 gateway,configuration_digest,evidence_kind,outcome,expires_at,sequence \
                          FROM payment_verification_evidence \
                          WHERE outcome IN ('passed','failed') \
                          ORDER BY gateway,configuration_digest,evidence_kind,sequence DESC) evidence \
                ), '[]'::jsonb) AS verification_evidence",
        )
        .fetch_one(&self.pool)
        .await?;
        let epay_configuration = match (row.epay_revision, row.epay_ciphertext) {
            (Some(revision), Some(ciphertext)) => Some((revision, ciphertext)),
            (None, None) => None,
            _ => return Err(StoreError::Conflict),
        };
        let mut callback_digests = Vec::new();
        for entry in row.callback_digests.as_array().into_iter().flatten() {
            let gateway = entry
                .get("gateway")
                .and_then(Value::as_str)
                .ok_or(StoreError::Conflict)?;
            let digest = entry
                .get("digest")
                .and_then(Value::as_str)
                .and_then(digest_from_hex)
                .ok_or(StoreError::Conflict)?;
            callback_digests.push((gateway.to_owned(), digest));
        }
        let mut verification_evidence = Vec::new();
        for entry in row.verification_evidence.as_array().into_iter().flatten() {
            verification_evidence.push(PaymentVerificationEvidence {
                gateway: entry
                    .get("gateway")
                    .and_then(Value::as_str)
                    .ok_or(StoreError::Conflict)?
                    .to_owned(),
                kind: entry
                    .get("kind")
                    .and_then(Value::as_str)
                    .ok_or(StoreError::Conflict)?
                    .to_owned(),
                digest: entry
                    .get("digest")
                    .and_then(Value::as_str)
                    .and_then(digest_from_hex)
                    .ok_or(StoreError::Conflict)?,
                valid: entry
                    .get("valid")
                    .and_then(Value::as_bool)
                    .ok_or(StoreError::Conflict)?,
            });
        }
        Ok(PaymentReadinessFacts {
            currency: row.currency,
            epay_configuration,
            callback_digests,
            verification_evidence,
        })
    }

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
        self.record_verified_callback_digest(order, gateway, digest)
            .await
    }

    /// Materialize only a configuration-bound callback that actually exists.
    /// Replays cannot refresh the recorded verification time.
    async fn record_verified_callback_digest(
        &self,
        order: Uuid,
        gateway: &str,
        digest: &[u8],
    ) -> Result<(), StoreError> {
        sqlx::query(
            "INSERT INTO payment_verified_callback_digests(gateway,configuration_digest,verified_at) \
             SELECT $1,$2,statement_timestamp() \
             WHERE EXISTS(SELECT 1 FROM payment_callback_verification v \
                          JOIN payment_checkout_verification b ON b.order_id=v.order_id \
                          WHERE v.order_id=$3 AND b.gateway=$1 AND b.configuration_digest=$2) \
             ON CONFLICT (gateway,configuration_digest) DO UPDATE \
             SET verified_at=GREATEST(payment_verified_callback_digests.verified_at,EXCLUDED.verified_at)",
        )
        .bind(gateway).bind(digest).bind(order).execute(&self.pool).await?;
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
        self.record_verified_callback_digest(order, gateway, digest)
            .await
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
