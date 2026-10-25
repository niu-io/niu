//! Explicit noncash Credits grants. No payment receipt or monetary entry.
use crate::{OperatorAuditActor, Store, StoreError};
use serde_json::Value;
use uuid::Uuid;

pub struct CustomerUnitGrantInput<'a> {
    pub definition_revision: i64,
    pub credit_atoms: i64,
    pub provenance: &'a str,
    pub reason: &'a str,
    pub expires_at_ms: Option<i64>,
    pub idempotency_key: Uuid,
}

impl Store {
    pub async fn issue_customer_unit_grant(
        &self,
        organization: Uuid,
        input: CustomerUnitGrantInput<'_>,
        actor: OperatorAuditActor,
    ) -> Result<Value, StoreError> {
        if input.definition_revision <= 0
            || input.credit_atoms <= 0
            || !matches!(input.provenance, "promotional" | "simulated")
            || input.reason.is_empty()
            || input.reason.trim() != input.reason
            || input.reason.chars().count() > 500
            || input.reason.chars().any(char::is_control)
            || input
                .expires_at_ms
                .is_some_and(|value| !(1..=253402300799000).contains(&value))
        {
            return Err(StoreError::InvalidCustomerUnit);
        }
        let mut tx = self.begin_bounded_recording().await?;
        let mode: String = sqlx::query_scalar(
            "SELECT billing_mode FROM customer_unit_configuration WHERE singleton FOR SHARE",
        )
        .fetch_one(&mut *tx)
        .await?;
        sqlx::query("SELECT id FROM organizations WHERE id=$1 FOR NO KEY UPDATE")
            .bind(organization)
            .fetch_optional(&mut *tx)
            .await?
            .ok_or(StoreError::Conflict)?;
        if let OperatorAuditActor::Operator(id) = actor {
            sqlx::query("SELECT id FROM admin_operators WHERE id=$1 AND platform_admin AND revoked_at IS NULL FOR SHARE")
                .bind(id).fetch_optional(&mut *tx).await?.ok_or(StoreError::Unauthorized)?;
        }
        let previous: Option<(Uuid, i64, i64, String, String, Option<i64>)> = sqlx::query_as(
            "SELECT id,definition_revision,credit_atoms,provenance,grant_reason,
                    (extract(epoch FROM expires_at)*1000)::bigint
             FROM customer_unit_lots WHERE organization_id=$1 AND grant_idempotency_key=$2",
        )
        .bind(organization)
        .bind(input.idempotency_key)
        .fetch_optional(&mut *tx)
        .await?;
        if let Some((id, definition, atoms, provenance, reason, expiry)) = previous {
            if definition != input.definition_revision
                || atoms != input.credit_atoms
                || provenance != input.provenance
                || reason != input.reason
                || expiry != input.expires_at_ms
            {
                return Err(StoreError::Conflict);
            }
            return Ok(sqlx::query_scalar(include_str!("customer_unit_grant.sql"))
                .bind(organization)
                .bind(id)
                .fetch_one(&mut *tx)
                .await?);
        }
        let latest: Option<i64> =
            sqlx::query_scalar("SELECT max(revision) FROM customer_unit_definitions")
                .fetch_one(&mut *tx)
                .await?;
        if mode != "credits" || latest != Some(input.definition_revision) {
            return Err(StoreError::Conflict);
        }
        sqlx::query(
            "INSERT INTO customer_unit_accounts(organization_id) VALUES($1) ON CONFLICT DO NOTHING",
        )
        .bind(organization)
        .execute(&mut *tx)
        .await?;
        sqlx::query("SELECT organization_id FROM customer_unit_accounts WHERE organization_id=$1 FOR NO KEY UPDATE")
            .bind(organization).fetch_one(&mut *tx).await?;
        if let Some(expiry) = input.expires_at_ms {
            let future: bool = sqlx::query_scalar(
                "SELECT to_timestamp($1::double precision/1000)>clock_timestamp()",
            )
            .bind(expiry)
            .fetch_one(&mut *tx)
            .await?;
            if !future {
                return Err(StoreError::InvalidCustomerUnit);
            }
        }
        let id = Uuid::new_v4();
        let (actor_kind, actor_id) = actor.kind_and_id();
        sqlx::query(
            "INSERT INTO customer_unit_lots
            (id,organization_id,definition_revision,credit_atoms,provenance,backing_nanos,
             grant_idempotency_key,grant_reason,grant_actor_kind,grant_actor_operator_id,expires_at)
             VALUES($1,$2,$3,$4,$5,0,$6,$7,$8,$9,to_timestamp($10::double precision/1000))",
        )
        .bind(id)
        .bind(organization)
        .bind(input.definition_revision)
        .bind(input.credit_atoms)
        .bind(input.provenance)
        .bind(input.idempotency_key)
        .bind(input.reason)
        .bind(actor_kind)
        .bind(actor_id)
        .bind(input.expires_at_ms)
        .execute(&mut *tx)
        .await?;
        let result = sqlx::query_scalar(include_str!("customer_unit_grant.sql"))
            .bind(organization)
            .bind(id)
            .fetch_one(&mut *tx)
            .await?;
        tx.commit().await?;
        Ok(result)
    }
}
