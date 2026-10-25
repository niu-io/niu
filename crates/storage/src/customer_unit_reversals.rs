//! Exact Credits purchase reversals and original-range backing conservation.
//! Reversals remove only unoccupied ranges of the original purchase lot and
//! require processor minor-unit precision without discarding residual atoms.
//! Recording a reversal never executes an external payment-processor transfer.
use crate::{OperatorAuditActor, Store, StoreError};
use niu_metered_cost::credit_range_backing;
use serde_json::{Value, json};
use sqlx::{Postgres, Transaction};
use uuid::Uuid;

const PROCESSOR_MINOR_UNIT_NANOS: i64 = 10_000_000;

#[derive(sqlx::FromRow)]
struct PurchaseLotRow {
    id: Uuid,
    order_id: Uuid,
    definition_revision: i64,
    name: String,
    display_precision: i16,
    credit_atoms: i64,
    provenance: String,
    payment_currency: String,
    payment_nanos: i64,
    backing_nanos: i64,
    held_atoms: i64,
    charged_atoms: i64,
    restored_atoms: i64,
    reversed_atoms: i64,
}

struct ReversiblePrefix {
    available_atoms: i64,
    available_payment_nanos: i64,
    available_backing_nanos: i64,
    requested_atoms: i64,
    reversible_atoms: i64,
    refund_payment_nanos: i64,
    refund_backing_nanos: i64,
    residual_credit_atoms: i64,
    residual_payment_nanos: i64,
    residual_backing_nanos: i64,
    ranges: Vec<(i64, i64, i64, i64)>,
}

fn compute_reversible_prefix(
    lot: &PurchaseLotRow,
    unoccupied: &[(i64, i64)],
    requested_atoms_opt: Option<i64>,
) -> Result<ReversiblePrefix, StoreError> {
    let mut available_atoms = 0i64;
    let mut available_payment_nanos = 0i64;
    let mut available_backing_nanos = 0i64;
    for &(first, end) in unoccupied {
        let span = end
            .checked_sub(first)
            .filter(|&v| v > 0)
            .ok_or(StoreError::InvalidCustomerUnit)?;
        let payment = credit_range_backing(lot.credit_atoms, lot.payment_nanos, first, end)
            .map_err(|_| StoreError::InvalidCustomerUnit)?;
        let backing = credit_range_backing(lot.credit_atoms, lot.backing_nanos, first, end)
            .map_err(|_| StoreError::InvalidCustomerUnit)?;
        available_atoms = available_atoms
            .checked_add(span)
            .ok_or(StoreError::InvalidCustomerUnit)?;
        available_payment_nanos = available_payment_nanos
            .checked_add(payment)
            .ok_or(StoreError::InvalidCustomerUnit)?;
        available_backing_nanos = available_backing_nanos
            .checked_add(backing)
            .ok_or(StoreError::InvalidCustomerUnit)?;
    }

    let requested_atoms = match requested_atoms_opt {
        Some(value) => {
            if value <= 0 {
                return Err(StoreError::InvalidCustomerUnit);
            }
            if value > available_atoms {
                return Err(StoreError::Conflict);
            }
            value
        }
        None => available_atoms,
    };

    let mut selected = Vec::new();
    let mut remaining = requested_atoms;
    let mut selected_payment_nanos = 0i64;
    let mut selected_backing_nanos = 0i64;
    for &(first, end) in unoccupied {
        if remaining == 0 {
            break;
        }
        let take = remaining.min(end - first);
        let sub_end = first + take;
        let payment = credit_range_backing(lot.credit_atoms, lot.payment_nanos, first, sub_end)
            .map_err(|_| StoreError::InvalidCustomerUnit)?;
        let backing = credit_range_backing(lot.credit_atoms, lot.backing_nanos, first, sub_end)
            .map_err(|_| StoreError::InvalidCustomerUnit)?;
        selected.push((first, sub_end, payment, backing));
        selected_payment_nanos = selected_payment_nanos
            .checked_add(payment)
            .ok_or(StoreError::InvalidCustomerUnit)?;
        selected_backing_nanos = selected_backing_nanos
            .checked_add(backing)
            .ok_or(StoreError::InvalidCustomerUnit)?;
        remaining -= take;
    }

    let target_payment_nanos =
        (selected_payment_nanos / PROCESSOR_MINOR_UNIT_NANOS) * PROCESSOR_MINOR_UNIT_NANOS;
    let mut ranges = Vec::new();
    let mut accum_payment = 0i64;
    let mut accum_backing = 0i64;
    let mut reversible_atoms = 0i64;

    if target_payment_nanos > 0 {
        for (first, end, payment, backing) in selected {
            if accum_payment + payment < target_payment_nanos {
                ranges.push((first, end, payment, backing));
                accum_payment += payment;
                accum_backing += backing;
                reversible_atoms += end - first;
            } else {
                let needed_payment = target_payment_nanos - accum_payment;
                let start_floor = (i128::from(lot.payment_nanos) * i128::from(first))
                    / i128::from(lot.credit_atoms);
                let target_floor = start_floor + i128::from(needed_payment);
                let cut_end_i128 = (target_floor * i128::from(lot.credit_atoms)
                    + i128::from(lot.payment_nanos)
                    - 1)
                    / i128::from(lot.payment_nanos);
                let cut_end = i64::try_from(cut_end_i128)
                    .map_err(|_| StoreError::InvalidCustomerUnit)?
                    .clamp(first + 1, end);
                let cut_payment =
                    credit_range_backing(lot.credit_atoms, lot.payment_nanos, first, cut_end)
                        .map_err(|_| StoreError::InvalidCustomerUnit)?;
                let cut_backing =
                    credit_range_backing(lot.credit_atoms, lot.backing_nanos, first, cut_end)
                        .map_err(|_| StoreError::InvalidCustomerUnit)?;
                if accum_payment + cut_payment != target_payment_nanos {
                    ranges.clear();
                    accum_payment = 0;
                    accum_backing = 0;
                    reversible_atoms = 0;
                    break;
                }
                ranges.push((first, cut_end, cut_payment, cut_backing));
                accum_payment += cut_payment;
                accum_backing += cut_backing;
                reversible_atoms += cut_end - first;
                break;
            }
        }
    }

    Ok(ReversiblePrefix {
        available_atoms,
        available_payment_nanos,
        available_backing_nanos,
        requested_atoms,
        reversible_atoms,
        refund_payment_nanos: accum_payment,
        refund_backing_nanos: accum_backing,
        residual_credit_atoms: requested_atoms - reversible_atoms,
        residual_payment_nanos: selected_payment_nanos - accum_payment,
        residual_backing_nanos: selected_backing_nanos - accum_backing,
        ranges,
    })
}

async fn load_purchase_lot(
    tx: &mut Transaction<'_, Postgres>,
    organization: Uuid,
    order: Uuid,
) -> Result<Option<(PurchaseLotRow, Vec<(i64, i64)>)>, StoreError> {
    let lot: Option<PurchaseLotRow> = sqlx::query_as(
        "SELECT l.id,
                l.order_id,
                l.definition_revision,
                d.name,
                d.display_precision,
                l.credit_atoms,
                l.provenance,
                l.payment_currency,
                l.payment_nanos,
                l.backing_nanos,
                COALESCE((
                    SELECT SUM(r.end_atom - r.first_atom)::bigint
                    FROM customer_unit_reserved_ranges r
                    WHERE r.lot_id = l.id
                      AND NOT EXISTS (
                          SELECT 1 FROM customer_unit_resolutions s
                          WHERE s.attempt_id = r.attempt_id
                      )
                ), 0) AS held_atoms,
                COALESCE((
                    SELECT SUM(c.end_atom - c.first_atom)::bigint
                    FROM customer_unit_consumed_ranges c
                    WHERE c.lot_id = l.id
                ), 0) AS charged_atoms,
                COALESCE((
                    SELECT SUM(
                        LEAST(r.end_atom, c.charge_offset + c.end_atom - c.first_atom)
                        - GREATEST(r.first_atom, c.charge_offset)
                    )::bigint
                    FROM customer_unit_consumed_ranges c
                    JOIN customer_unit_restorations r
                      ON r.attempt_id = c.attempt_id
                     AND r.first_atom < c.charge_offset + (c.end_atom - c.first_atom)
                     AND r.end_atom > c.charge_offset
                    WHERE c.lot_id = l.id
                ), 0) AS restored_atoms,
                COALESCE((
                    SELECT SUM(p.end_atom - p.first_atom)::bigint
                    FROM customer_unit_purchase_reversal_ranges p
                    WHERE p.lot_id = l.id
                ), 0) AS reversed_atoms
         FROM customer_unit_lots l
         JOIN customer_unit_definitions d ON d.revision = l.definition_revision
         WHERE l.organization_id = $1 AND l.order_id = $2",
    )
    .bind(organization)
    .bind(order)
    .fetch_optional(&mut **tx)
    .await?;

    let Some(lot) = lot else {
        return Ok(None);
    };

    let unoccupied: Vec<(i64, i64)> = sqlx::query_as(
        "SELECT lower(f.atoms), upper(f.atoms)
         FROM unnest(
             int8multirange(int8range(0, $1, '[)'))
             - COALESCE((
                 SELECT range_agg(o.atoms)
                 FROM customer_unit_occupied_ranges o
                 WHERE o.lot_id = $2
             ), '{}'::int8multirange)
         ) AS f(atoms)
         ORDER BY lower(f.atoms)",
    )
    .bind(lot.credit_atoms)
    .bind(lot.id)
    .fetch_all(&mut **tx)
    .await?;

    Ok(Some((lot, unoccupied)))
}

async fn load_reversal_receipt(
    tx: &mut Transaction<'_, Postgres>,
    order: Uuid,
    reversal_id: Uuid,
) -> Result<Value, StoreError> {
    sqlx::query_scalar(
        "SELECT jsonb_build_object(
            'id', r.id,
            'order_id', r.order_id,
            'lot_id', r.lot_id,
            'definition_revision', r.definition_revision::text,
            'name', d.name,
            'display_precision', d.display_precision,
            'atoms_per_unit', '1000000000',
            'provenance', r.provenance,
            'payment_currency', r.payment_currency,
            'processor_minor_unit_nanos', '10000000',
            'credit_atoms', r.credit_atoms::text,
            'refund_payment_nanos', r.refund_payment_nanos::text,
            'refund_backing_nanos', r.refund_backing_nanos::text,
            'reason', r.reason,
            'created_at', to_char(r.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"'),
            'ranges', COALESCE((
                SELECT jsonb_agg(jsonb_build_object(
                    'first_atom', g.first_atom::text,
                    'end_atom', g.end_atom::text,
                    'credit_atoms', (g.end_atom - g.first_atom)::text,
                    'payment_nanos', g.payment_nanos::text,
                    'backing_nanos', g.backing_nanos::text
                ) ORDER BY g.ordinal)
                FROM customer_unit_purchase_reversal_ranges g
                WHERE g.reversal_id = r.id
            ), '[]'::jsonb)
        )
        FROM customer_unit_purchase_reversals r
        JOIN customer_unit_definitions d ON d.revision = r.definition_revision
        WHERE r.order_id = $1 AND r.id = $2",
    )
    .bind(order)
    .bind(reversal_id)
    .fetch_one(&mut **tx)
    .await
    .map_err(StoreError::from)
}

impl Store {
    /// Preview a purchase reversal on unoccupied ranges of an original purchase
    /// lot, reporting exact processor-precision refund amounts, residual atoms
    /// and backing, and prior committed reversal receipts.
    pub async fn preview_customer_unit_purchase_reversal(
        &self,
        organization: Uuid,
        order: Uuid,
        credit_atoms: Option<i64>,
    ) -> Result<Option<Value>, StoreError> {
        let mut tx = self.begin_bounded_financial_snapshot().await?;
        let Some((lot, unoccupied)) = load_purchase_lot(&mut tx, organization, order).await? else {
            return Ok(None);
        };
        let prefix = compute_reversible_prefix(&lot, &unoccupied, credit_atoms)?;
        let reversals: Value = sqlx::query_scalar(
            "SELECT COALESCE(jsonb_agg(jsonb_build_object(
                'id', r.id,
                'order_id', r.order_id,
                'lot_id', r.lot_id,
                'definition_revision', r.definition_revision::text,
                'name', d.name,
                'display_precision', d.display_precision,
                'atoms_per_unit', '1000000000',
                'provenance', r.provenance,
                'payment_currency', r.payment_currency,
                'processor_minor_unit_nanos', '10000000',
                'credit_atoms', r.credit_atoms::text,
                'refund_payment_nanos', r.refund_payment_nanos::text,
                'refund_backing_nanos', r.refund_backing_nanos::text,
                'reason', r.reason,
                'created_at', to_char(r.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"'),
                'ranges', COALESCE((
                    SELECT jsonb_agg(jsonb_build_object(
                        'first_atom', g.first_atom::text,
                        'end_atom', g.end_atom::text,
                        'credit_atoms', (g.end_atom - g.first_atom)::text,
                        'payment_nanos', g.payment_nanos::text,
                        'backing_nanos', g.backing_nanos::text
                    ) ORDER BY g.ordinal)
                    FROM customer_unit_purchase_reversal_ranges g
                    WHERE g.reversal_id = r.id
                ), '[]'::jsonb)
            ) ORDER BY r.created_at ASC, r.id ASC), '[]'::jsonb)
            FROM customer_unit_purchase_reversals r
            JOIN customer_unit_definitions d ON d.revision = r.definition_revision
            WHERE r.organization_id = $1 AND r.order_id = $2",
        )
        .bind(organization)
        .bind(order)
        .fetch_one(&mut *tx)
        .await?;
        tx.commit().await?;

        let ranges_json: Vec<Value> = prefix
            .ranges
            .iter()
            .map(|&(first, end, payment, backing)| {
                json!({
                    "first_atom": first.to_string(),
                    "end_atom": end.to_string(),
                    "credit_atoms": (end - first).to_string(),
                    "payment_nanos": payment.to_string(),
                    "backing_nanos": backing.to_string(),
                })
            })
            .collect();

        Ok(Some(json!({
            "order_id": lot.order_id,
            "lot_id": lot.id,
            "definition_revision": lot.definition_revision.to_string(),
            "name": lot.name,
            "display_precision": lot.display_precision,
            "atoms_per_unit": "1000000000",
            "provenance": lot.provenance,
            "payment_currency": lot.payment_currency,
            "processor_minor_unit_nanos": PROCESSOR_MINOR_UNIT_NANOS.to_string(),
            "payment_nanos": lot.payment_nanos.to_string(),
            "backing_nanos": lot.backing_nanos.to_string(),
            "issued_atoms": lot.credit_atoms.to_string(),
            "held_atoms": lot.held_atoms.to_string(),
            "charged_atoms": lot.charged_atoms.to_string(),
            "restored_atoms": lot.restored_atoms.to_string(),
            "reversed_atoms": lot.reversed_atoms.to_string(),
            "available_atoms": prefix.available_atoms.to_string(),
            "available_payment_nanos": prefix.available_payment_nanos.to_string(),
            "available_backing_nanos": prefix.available_backing_nanos.to_string(),
            "requested_atoms": prefix.requested_atoms.to_string(),
            "reversible_atoms": prefix.reversible_atoms.to_string(),
            "refund_payment_nanos": prefix.refund_payment_nanos.to_string(),
            "refund_backing_nanos": prefix.refund_backing_nanos.to_string(),
            "residual_credit_atoms": prefix.residual_credit_atoms.to_string(),
            "residual_payment_nanos": prefix.residual_payment_nanos.to_string(),
            "residual_backing_nanos": prefix.residual_backing_nanos.to_string(),
            "ranges": ranges_json,
            "reversals": reversals,
        })))
    }

    /// Record an immutable purchase reversal on unoccupied ranges of an original
    /// purchase lot. Requires exact processor minor-unit precision with zero
    /// discarded residual atoms or backing.
    pub async fn reverse_customer_unit_purchase(
        &self,
        organization: Uuid,
        order: Uuid,
        credit_atoms: i64,
        reason: &str,
        idempotency_key: Uuid,
        actor: OperatorAuditActor,
    ) -> Result<Option<Value>, StoreError> {
        if credit_atoms <= 0
            || reason.is_empty()
            || reason.trim() != reason
            || reason.chars().count() > 500
            || reason.chars().any(char::is_control)
        {
            return Err(StoreError::InvalidCustomerUnit);
        }
        let mut tx = self.begin_bounded_recording().await?;
        if let OperatorAuditActor::Operator(id) = actor {
            sqlx::query(
                "SELECT id FROM admin_operators WHERE id = $1 AND platform_admin AND revoked_at IS NULL FOR SHARE",
            )
            .bind(id)
            .fetch_optional(&mut *tx)
            .await?
            .ok_or(StoreError::Unauthorized)?;
        }
        let exists: bool = sqlx::query_scalar(
            "SELECT EXISTS(SELECT 1 FROM customer_unit_lots WHERE organization_id = $1 AND order_id = $2)",
        )
        .bind(organization)
        .bind(order)
        .fetch_one(&mut *tx)
        .await?;
        if !exists {
            return Ok(None);
        }
        sqlx::query("SELECT id FROM organizations WHERE id = $1 FOR SHARE")
            .bind(organization)
            .fetch_optional(&mut *tx)
            .await?
            .ok_or(StoreError::Conflict)?;
        sqlx::query(
            "SELECT organization_id FROM customer_unit_accounts WHERE organization_id = $1 FOR NO KEY UPDATE",
        )
        .bind(organization)
        .fetch_one(&mut *tx)
        .await?;

        let prior: Option<(Uuid, i64, String)> = sqlx::query_as(
            "SELECT id, credit_atoms, reason
             FROM customer_unit_purchase_reversals
             WHERE organization_id = $1 AND order_id = $2 AND idempotency_key = $3",
        )
        .bind(organization)
        .bind(order)
        .bind(idempotency_key)
        .fetch_optional(&mut *tx)
        .await?;
        if let Some((id, saved_atoms, saved_reason)) = prior {
            if saved_atoms != credit_atoms || saved_reason != reason {
                return Err(StoreError::Conflict);
            }
            let receipt = load_reversal_receipt(&mut tx, order, id).await?;
            tx.commit().await?;
            return Ok(Some(receipt));
        }

        let Some((lot, unoccupied)) = load_purchase_lot(&mut tx, organization, order).await? else {
            return Ok(None);
        };
        let prefix = compute_reversible_prefix(&lot, &unoccupied, Some(credit_atoms))?;
        if prefix.refund_payment_nanos <= 0
            || prefix.refund_payment_nanos % PROCESSOR_MINOR_UNIT_NANOS != 0
            || prefix.reversible_atoms != credit_atoms
            || prefix.residual_credit_atoms != 0
            || prefix.residual_payment_nanos != 0
            || prefix.residual_backing_nanos != 0
        {
            return Err(StoreError::InvalidCustomerUnit);
        }

        let reversal_id = Uuid::new_v4();
        let (actor_kind, actor_operator_id) = actor.kind_and_id();
        sqlx::query(
            "INSERT INTO customer_unit_purchase_reversals (
                id, organization_id, order_id, lot_id, definition_revision, provenance,
                payment_currency, credit_atoms, refund_payment_nanos, refund_backing_nanos,
                reason, idempotency_key, actor_kind, actor_operator_id
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)",
        )
        .bind(reversal_id)
        .bind(organization)
        .bind(order)
        .bind(lot.id)
        .bind(lot.definition_revision)
        .bind(&lot.provenance)
        .bind(&lot.payment_currency)
        .bind(credit_atoms)
        .bind(prefix.refund_payment_nanos)
        .bind(prefix.refund_backing_nanos)
        .bind(reason)
        .bind(idempotency_key)
        .bind(actor_kind)
        .bind(actor_operator_id)
        .execute(&mut *tx)
        .await?;

        for (ordinal, &(first_atom, end_atom, payment_nanos, backing_nanos)) in
            prefix.ranges.iter().enumerate()
        {
            sqlx::query(
                "INSERT INTO customer_unit_purchase_reversal_ranges (
                    reversal_id, organization_id, ordinal, lot_id,
                    first_atom, end_atom, payment_nanos, backing_nanos
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
            )
            .bind(reversal_id)
            .bind(organization)
            .bind(ordinal as i64)
            .bind(lot.id)
            .bind(first_atom)
            .bind(end_atom)
            .bind(payment_nanos)
            .bind(backing_nanos)
            .execute(&mut *tx)
            .await?;
        }

        let receipt = load_reversal_receipt(&mut tx, order, reversal_id).await?;
        tx.commit().await?;
        Ok(Some(receipt))
    }
}
