//! Single-owner, single-connection financial recovery with durable traversal.
use crate::{Store, StoreError, TenantScope};
use sqlx::Acquire;
use uuid::Uuid;

/// Safe recovery diagnostics; never includes database messages or ledger data.
pub enum FinancialRecoveryFailure {
    Attempts { stage: &'static str, count: usize },
    Storage { stage: &'static str },
}

#[derive(Clone, Copy)]
pub(crate) enum FinancialStage {
    BalanceRelease,
    CustomerCharge,
    SupplierEarning,
    UpstreamCost,
}

impl FinancialStage {
    fn name(self) -> &'static str {
        match self {
            Self::BalanceRelease => "balance_release",
            Self::CustomerCharge => "customer_charge",
            Self::SupplierEarning => "supplier_earning",
            Self::UpstreamCost => "upstream_cost",
        }
    }
    fn query(self) -> &'static str {
        match self {
            Self::BalanceRelease => {
                "SELECT a.id,a.organization_id,a.project_id FROM customer_balance_reservations r JOIN attempts a ON a.id=r.attempt_id WHERE r.released_at IS NULL AND a.execution IN ('not_sent','confirmed_not_executed') AND ($1::uuid IS NULL OR a.id>$1) ORDER BY a.id LIMIT 100"
            }
            Self::CustomerCharge => {
                "SELECT a.id,a.organization_id,a.project_id FROM attempts a JOIN customer_attempt_tariffs b ON b.attempt_id=a.id LEFT JOIN customer_charges c ON c.attempt_id=a.id WHERE c.attempt_id IS NULL AND a.execution='confirmed_completed' AND a.usage_confidence='provider_reported' AND ($1::uuid IS NULL OR a.id>$1) ORDER BY a.id LIMIT 100"
            }
            Self::SupplierEarning => {
                "SELECT a.id,a.organization_id,a.project_id FROM attempts a JOIN provider_attempt_offers b ON b.attempt_id=a.id LEFT JOIN provider_earnings e ON e.attempt_id=a.id WHERE e.attempt_id IS NULL AND a.execution='confirmed_completed' AND (a.usage_confidence='provider_reported' OR EXISTS(SELECT 1 FROM supplier_media_attempt_pricing p WHERE p.attempt_id=a.id)) AND ($1::uuid IS NULL OR a.id>$1) ORDER BY a.id LIMIT 100"
            }
            Self::UpstreamCost => {
                "SELECT a.id, a.organization_id, a.project_id FROM attempts a JOIN cost_reservations r ON r.attempt_id=a.id WHERE a.execution='confirmed_completed' AND a.usage_confidence='provider_reported' AND r.state='held' AND ($1::uuid IS NULL OR a.id > $1) ORDER BY a.id LIMIT 100"
            }
        }
    }
}

impl Store {
    /// Each ledger commits independently; one unavailable ledger never prevents
    /// trying another. Pool acquisition waits at most 250 ms per stage.
    pub async fn recover_financial_work(&self) -> Vec<FinancialRecoveryFailure> {
        let mut failures = Vec::new();
        for stage in [
            FinancialStage::BalanceRelease,
            FinancialStage::CustomerCharge,
            FinancialStage::SupplierEarning,
            FinancialStage::UpstreamCost,
        ] {
            match self.recover_financial_stage(stage, None).await {
                Ok(Some((_, count))) if count > 0 => {
                    failures.push(FinancialRecoveryFailure::Attempts {
                        stage: stage.name(),
                        count,
                    })
                }
                Ok(_) => {}
                Err(_) => failures.push(FinancialRecoveryFailure::Storage {
                    stage: stage.name(),
                }),
            }
        }
        failures
    }

    /// None uses the durable cursor; Some preserves the explicit-cursor library
    /// API. A skipped claim never advances either cursor. The global transaction
    /// lock covers all financial stages and is released on commit or disconnect.
    pub(crate) async fn recover_financial_stage(
        &self,
        stage: FinancialStage,
        cursor: Option<Option<Uuid>>,
    ) -> Result<Option<(Option<Uuid>, usize)>, StoreError> {
        self.run_background_work(crate::background_work::BackgroundWork::Financial, |tx| {
            Box::pin(Self::recover_financial_stage_in_tx(tx, stage, cursor))
        })
        .await
    }

    async fn recover_financial_stage_in_tx(
        tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
        stage: FinancialStage,
        cursor: Option<Option<Uuid>>,
    ) -> Result<(Option<Uuid>, usize), StoreError> {
        let after = match cursor {
            Some(after) => after,
            None => {
                sqlx::query_scalar::<_, Option<Uuid>>(
                    "SELECT after_attempt FROM financial_recovery_progress WHERE stage=$1",
                )
                .bind(stage.name())
                .fetch_one(&mut **tx)
                .await?
            }
        };
        let rows: Vec<(Uuid, Uuid, Uuid)> = sqlx::query_as(stage.query())
            .bind(after)
            .fetch_all(&mut **tx)
            .await?;
        let next = if rows.len() == 100 {
            rows.last().map(|row| row.0)
        } else {
            None
        };
        let mut failed = 0;
        for (attempt, organization_id, project_id) in rows {
            let scope = TenantScope {
                organization_id,
                project_id,
            };
            let mut row_tx = tx.begin().await?;
            let result = match stage {
                FinancialStage::BalanceRelease => {
                    Self::release_nonexecuted_customer_balance_in_tx(&mut row_tx, scope, attempt)
                        .await
                }
                FinancialStage::CustomerCharge => {
                    Self::accrue_customer_charge_in_tx(&mut row_tx, attempt).await
                }
                FinancialStage::SupplierEarning => {
                    Self::accrue_provider_earning_in_tx(&mut row_tx, attempt).await
                }
                FinancialStage::UpstreamCost => {
                    Self::settle_cost_in_tx(&mut row_tx, scope, attempt)
                        .await
                        .map(|_| ())
                }
            };
            if result.is_ok() {
                row_tx.commit().await?;
            } else {
                row_tx.rollback().await?;
                failed += 1;
            }
        }
        if cursor.is_none() {
            sqlx::query("UPDATE financial_recovery_progress SET after_attempt=$2,updated_at=clock_timestamp() WHERE stage=$1")
                .bind(stage.name()).bind(next).execute(&mut **tx).await?;
        }
        Ok((next, failed))
    }
}
