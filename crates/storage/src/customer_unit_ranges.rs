//! Exact lot allocation primitives. These are not request pricing or settlement:
//! the caller must bind an immutable unit tariff, derive the liability from
//! authoritative usage, and include allocation in the admission/settlement tx.
use crate::{OperatorAuditActor, Store, StoreError, TenantScope};
use sqlx::{Postgres, Transaction};
use uuid::Uuid;

impl Store {
    /// Refund only the original consumed ranges. This never executes a payment
    /// refund, changes purchase rules, or renews an expired lot.
    pub async fn refund_customer_unit_charge(
        &self,
        organization: Uuid,
        attempt: Uuid,
        atoms: i64,
        reason: &str,
        idempotency_key: Uuid,
        actor: OperatorAuditActor,
    ) -> Result<Option<serde_json::Value>, StoreError> {
        let mut tx = self.begin_bounded_recording().await?;
        let project: Option<Uuid> = sqlx::query_scalar(
            "SELECT project_id FROM customer_unit_reservations WHERE organization_id=$1 AND attempt_id=$2",
        ).bind(organization).bind(attempt).fetch_optional(&mut *tx).await?;
        let Some(project_id) = project else {
            return Ok(None);
        };
        let id = Self::restore_customer_unit_ranges_in_tx(
            &mut tx,
            TenantScope {
                organization_id: organization,
                project_id,
            },
            attempt,
            atoms,
            reason,
            idempotency_key,
            actor,
        )
        .await?;
        let receipt = sqlx::query_scalar(include_str!("customer_unit_refund.sql"))
            .bind(attempt)
            .bind(id)
            .fetch_one(&mut *tx)
            .await?;
        tx.commit().await?;
        Ok(Some(receipt))
    }

    /// Customer-safe unit quantities in one statement snapshot. Monetary backing
    /// and procurement information deliberately do not enter this response.
    pub async fn customer_unit_balance(
        &self,
        organization: Uuid,
    ) -> Result<Option<serde_json::Value>, StoreError> {
        let (exists, balance): (bool, serde_json::Value) =
            sqlx::query_as(include_str!("customer_unit_balance.sql"))
                .bind(organization)
                .fetch_one(&self.pool)
                .await?;
        Ok(exists.then_some(balance))
    }

    pub(crate) async fn lock_customer_unit_attempt(
        tx: &mut Transaction<'_, Postgres>,
        scope: TenantScope,
        attempt: Uuid,
    ) -> Result<(), StoreError> {
        sqlx::query("SELECT id FROM organizations WHERE id=$1 FOR SHARE")
            .bind(scope.organization_id)
            .fetch_optional(&mut **tx)
            .await?
            .ok_or(StoreError::Conflict)?;
        sqlx::query(
            "INSERT INTO customer_unit_accounts(organization_id) VALUES($1) ON CONFLICT DO NOTHING",
        )
        .bind(scope.organization_id)
        .execute(&mut **tx)
        .await?;
        sqlx::query("SELECT organization_id FROM customer_unit_accounts WHERE organization_id=$1 FOR NO KEY UPDATE")
            .bind(scope.organization_id).fetch_optional(&mut **tx).await?
            .ok_or(StoreError::BudgetExceeded)?;
        sqlx::query("SELECT id FROM attempts WHERE organization_id=$1 AND project_id=$2 AND id=$3 FOR UPDATE")
            .bind(scope.organization_id).bind(scope.project_id).bind(attempt)
            .fetch_optional(&mut **tx).await?.ok_or(StoreError::Conflict)?;
        Ok(())
    }

    /// Reserve disjoint ranges while the caller's dispatch transaction is open.
    /// A zero tariff still gets an explicit zero reservation and resolution.
    /// Insufficient capacity requires rollback of the entire caller transaction.
    pub async fn reserve_customer_unit_ranges_in_tx(
        tx: &mut Transaction<'_, Postgres>,
        scope: TenantScope,
        attempt: Uuid,
        definition: i64,
        maximum: i64,
    ) -> Result<(), StoreError> {
        if definition <= 0 || maximum < 0 {
            return Err(StoreError::InvalidCustomerUnit);
        }
        let mode: String = sqlx::query_scalar(
            "SELECT billing_mode FROM customer_unit_configuration WHERE singleton FOR SHARE",
        )
        .fetch_one(&mut **tx)
        .await?;
        Self::lock_customer_unit_attempt(tx, scope, attempt).await?;
        let prior: Option<(i64, i64)> = sqlx::query_as("SELECT definition_revision,maximum_atoms FROM customer_unit_reservations WHERE organization_id=$1 AND project_id=$2 AND attempt_id=$3")
            .bind(scope.organization_id).bind(scope.project_id).bind(attempt)
            .fetch_optional(&mut **tx).await?;
        if let Some(prior) = prior {
            return if prior == (definition, maximum) {
                Ok(())
            } else {
                Err(StoreError::Conflict)
            };
        }
        if mode != "credits" {
            return Err(StoreError::Conflict);
        }
        let unsent: bool =
            sqlx::query_scalar("SELECT execution='not_sent' FROM attempts WHERE id=$1")
                .bind(attempt)
                .fetch_one(&mut **tx)
                .await?;
        if !unsent {
            return Err(StoreError::Conflict);
        }
        // No currency balance fallback. An unconfigured unit account cannot
        // borrow against an old monetary credit facility.
        sqlx::query("INSERT INTO customer_unit_reservations(attempt_id,organization_id,project_id,definition_revision,maximum_atoms) VALUES($1,$2,$3,$4,$5)")
            .bind(attempt).bind(scope.organization_id).bind(scope.project_id)
            .bind(definition).bind(maximum).execute(&mut **tx).await?;
        Self::allocate_customer_unit_ranges_in_tx(tx, scope, attempt, maximum).await
    }

    pub(crate) async fn allocate_customer_unit_ranges_in_tx(
        tx: &mut Transaction<'_, Postgres>,
        scope: TenantScope,
        attempt: Uuid,
        atoms: i64,
    ) -> Result<(), StoreError> {
        let start_ordinal: i64 = sqlx::query_scalar("SELECT COALESCE(max(ordinal)+1,0) FROM customer_unit_reserved_ranges WHERE attempt_id=$1")
            .bind(attempt).fetch_one(&mut **tx).await?;
        let available: Vec<(Uuid, i64, i64)> = sqlx::query_as(
            "SELECT l.id,lower(f.atoms),upper(f.atoms)
             FROM customer_unit_lots l
             CROSS JOIN LATERAL unnest(int8multirange(int8range(0,l.credit_atoms,'[)'))
                - COALESCE((SELECT range_agg(o.atoms) FROM customer_unit_occupied_ranges o
                    WHERE o.lot_id=l.id),'{}'::int8multirange)) f(atoms)
             WHERE l.organization_id=$1 AND (l.expires_at IS NULL OR l.expires_at>clock_timestamp())
             ORDER BY CASE l.provenance WHEN 'promotional' THEN 0 WHEN 'simulated' THEN 1 ELSE 2 END,
                l.expires_at ASC NULLS LAST,l.created_at,l.id,lower(f.atoms)",
        ).bind(scope.organization_id).fetch_all(&mut **tx).await?;
        let mut remaining = atoms;
        for (ordinal, (lot, first, end)) in available.into_iter().enumerate() {
            if remaining == 0 {
                break;
            }
            let take = remaining.min(end - first);
            sqlx::query("INSERT INTO customer_unit_reserved_ranges(attempt_id,organization_id,ordinal,lot_id,first_atom,end_atom) VALUES($1,$2,$3,$4,$5,$6)")
                .bind(attempt).bind(scope.organization_id).bind(start_ordinal + ordinal as i64)
                .bind(lot).bind(first).bind(first+take).execute(&mut **tx).await?;
            remaining -= take;
        }
        if remaining != 0 {
            return Err(StoreError::BudgetExceeded);
        }
        Ok(())
    }

    /// Record a known charge or a proven safe release. `None` is release;
    /// `Some(0)` is a zero-price charge. Unknown outcomes must call neither.
    /// An over-bound charge cannot silently discard the unresolved liability.
    pub async fn resolve_customer_unit_ranges_in_tx(
        tx: &mut Transaction<'_, Postgres>,
        scope: TenantScope,
        attempt: Uuid,
        charge: Option<i64>,
    ) -> Result<(), StoreError> {
        let amount = charge.unwrap_or(0);
        if amount < 0 {
            return Err(StoreError::InvalidCustomerUnit);
        }
        let kind = if charge.is_some() {
            "charge"
        } else {
            "release"
        };
        Self::lock_customer_unit_attempt(tx, scope, attempt).await?;
        let previous: Option<(String, i64)> = sqlx::query_as(
            "SELECT kind,charged_atoms FROM customer_unit_resolutions WHERE attempt_id=$1",
        )
        .bind(attempt)
        .fetch_optional(&mut **tx)
        .await?;
        if let Some((old_kind, old_amount)) = previous {
            return if old_kind == kind && old_amount == amount {
                Ok(())
            } else {
                Err(StoreError::Conflict)
            };
        }
        let maximum: i64 = sqlx::query_scalar("SELECT r.maximum_atoms+COALESCE(e.additional_atoms,0) FROM customer_unit_reservations r LEFT JOIN customer_unit_reservation_extensions e USING(attempt_id) WHERE r.organization_id=$1 AND r.project_id=$2 AND r.attempt_id=$3")
            .bind(scope.organization_id).bind(scope.project_id).bind(attempt)
            .fetch_optional(&mut **tx).await?.ok_or(StoreError::Conflict)?;
        if amount > maximum {
            return Err(StoreError::BudgetExceeded);
        }
        sqlx::query(
            "INSERT INTO customer_unit_resolutions(attempt_id,kind,charged_atoms) VALUES($1,$2,$3)",
        )
        .bind(attempt)
        .bind(kind)
        .bind(amount)
        .execute(&mut **tx)
        .await?;
        Ok(())
    }

    /// Restore a prefix of the as-yet-unrestored original charge. Expiry and
    /// backing stay attached to the original lot, never to today's purchase rule.
    pub async fn restore_customer_unit_ranges_in_tx(
        tx: &mut Transaction<'_, Postgres>,
        scope: TenantScope,
        attempt: Uuid,
        atoms: i64,
        reason: &str,
        idempotency_key: Uuid,
        actor: OperatorAuditActor,
    ) -> Result<Uuid, StoreError> {
        if atoms <= 0
            || reason.is_empty()
            || reason.trim() != reason
            || reason.chars().count() > 500
            || reason.chars().any(char::is_control)
        {
            return Err(StoreError::InvalidCustomerUnit);
        }
        Self::lock_customer_unit_attempt(tx, scope, attempt).await?;
        if let OperatorAuditActor::Operator(id) = actor {
            sqlx::query("SELECT id FROM admin_operators WHERE id=$1 AND platform_admin AND revoked_at IS NULL FOR SHARE")
                .bind(id).fetch_optional(&mut **tx).await?.ok_or(StoreError::Unauthorized)?;
        }
        let prior: Option<(Uuid,i64,String)> = sqlx::query_as("SELECT id,end_atom-first_atom,reason FROM customer_unit_restorations WHERE attempt_id=$1 AND idempotency_key=$2")
            .bind(attempt).bind(idempotency_key).fetch_optional(&mut **tx).await?;
        if let Some((id, old_atoms, old_reason)) = prior {
            return if old_atoms == atoms && old_reason == reason {
                Ok(id)
            } else {
                Err(StoreError::Conflict)
            };
        }
        let charged: i64 = sqlx::query_scalar("SELECT charged_atoms FROM customer_unit_resolutions WHERE attempt_id=$1 AND kind='charge'")
            .bind(attempt).fetch_optional(&mut **tx).await?.ok_or(StoreError::Conflict)?;
        let first: i64 = sqlx::query_scalar(
            "SELECT COALESCE(max(end_atom),0) FROM customer_unit_restorations WHERE attempt_id=$1",
        )
        .bind(attempt)
        .fetch_one(&mut **tx)
        .await?;
        let end = first
            .checked_add(atoms)
            .ok_or(StoreError::InvalidCustomerUnit)?;
        if end > charged {
            return Err(StoreError::Conflict);
        }
        let id = Uuid::new_v4();
        let (kind, operator) = actor.kind_and_id();
        sqlx::query("INSERT INTO customer_unit_restorations(id,attempt_id,idempotency_key,first_atom,end_atom,reason,actor_kind,actor_operator_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)")
            .bind(id).bind(attempt).bind(idempotency_key).bind(first).bind(end)
            .bind(reason).bind(kind).bind(operator).execute(&mut **tx).await?;
        Ok(id)
    }
}
