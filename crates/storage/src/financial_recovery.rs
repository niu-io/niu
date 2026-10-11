//! Single-owner, single-connection financial recovery with durable traversal.
use crate::{Store, StoreError, TenantScope};
use sqlx::Acquire;
use uuid::Uuid;

// Query limits and cursor continuation must use the same batch size.
const RECOVERY_PAGE_SIZE: i64 = 100;

/// Safe recovery diagnostics; never includes database messages or ledger data.
pub enum FinancialRecoveryFailure {
    Attempts { stage: &'static str, count: usize },
    Storage { stage: &'static str },
}

#[derive(Clone, Copy)]
pub(crate) enum FinancialStage {
    MediaCompletion,
    BalanceRelease,
    CustomerCharge,
    CustomerMediaCharge,
    SupplierEarning,
    UpstreamCost,
}

impl FinancialStage {
    fn name(self) -> &'static str {
        match self {
            Self::MediaCompletion => "media_completion",
            Self::BalanceRelease => "balance_release",
            Self::CustomerCharge => "customer_charge",
            Self::CustomerMediaCharge => "customer_media_charge",
            Self::SupplierEarning => "supplier_earning",
            Self::UpstreamCost => "upstream_cost",
        }
    }
    fn query(self) -> &'static str {
        match self {
            Self::MediaCompletion => {
                include_str!("media_completion_recovery.sql")
            }
            Self::BalanceRelease => {
                include_str!("customer_balance_release_recovery.sql")
            }
            Self::CustomerCharge => {
                include_str!("customer_charge_recovery.sql")
            }
            Self::CustomerMediaCharge => {
                include_str!("customer_media_charge_recovery.sql")
            }
            Self::SupplierEarning => {
                include_str!("supplier_earning_recovery.sql")
            }
            Self::UpstreamCost => {
                include_str!("upstream_cost_recovery.sql")
            }
        }
    }
}

impl Store {
    /// Installation-only diagnostic projection. Caller must enforce platform authority.
    /// One statement snapshot; no attempt identifiers or financial values escape.
    pub async fn financial_recovery_diagnostics(&self) -> Result<serde_json::Value, StoreError> {
        let mut tx = self.begin_bounded_financial_snapshot().await?;
        let diagnostics = sqlx::query_scalar(
            "SELECT jsonb_build_object('observed_at',statement_timestamp(),'data',\
             COALESCE(jsonb_agg(jsonb_build_object(\
             'stage',stage,'last_step_at',last_step_at,\
             'last_candidate_count',last_candidate_count,'last_failure_count',last_failure_count,\
             'has_cursor',after_attempt IS NOT NULL) ORDER BY stage),'[]'::jsonb)) \
             FROM financial_recovery_progress",
        )
        .fetch_one(&mut *tx)
        .await?;
        tx.commit().await?;
        Ok(diagnostics)
    }

    /// Each ledger commits independently; one unavailable ledger never prevents
    /// trying another. Pool acquisition waits at most 250 ms per stage.
    pub async fn recover_financial_work(&self) -> Vec<FinancialRecoveryFailure> {
        let mut failures = Vec::new();
        for stage in [
            FinancialStage::MediaCompletion,
            FinancialStage::BalanceRelease,
            FinancialStage::CustomerCharge,
            FinancialStage::CustomerMediaCharge,
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
        let rows: Vec<(Uuid, Uuid, Uuid, bool)> = sqlx::query_as(stage.query())
            .bind(after)
            .bind(RECOVERY_PAGE_SIZE)
            .fetch_all(&mut **tx)
            .await?;
        let candidate_count = rows.len() as i32;
        let next = if rows.len() == RECOVERY_PAGE_SIZE as usize {
            rows.last().map(|row| row.0)
        } else {
            None
        };
        let mut failed = 0;
        for (attempt, organization_id, project_id, needs_recovery) in rows {
            if !needs_recovery {
                continue;
            }
            let scope = TenantScope {
                organization_id,
                project_id,
            };
            let mut row_tx = tx.begin().await?;
            let result = match stage {
                FinancialStage::MediaCompletion => {
                    Self::confirm_media_job_completion_in_tx(&mut row_tx, scope, attempt).await
                }
                FinancialStage::BalanceRelease => {
                    Self::release_nonexecuted_customer_balance_in_tx(&mut row_tx, scope, attempt)
                        .await
                }
                FinancialStage::CustomerCharge => {
                    Self::accrue_customer_charge_in_tx(&mut row_tx, attempt).await
                }
                FinancialStage::CustomerMediaCharge => {
                    Self::settle_customer_media_charge_in_tx(&mut row_tx, scope, attempt)
                        .await
                        .map(|_| ())
                }
                FinancialStage::SupplierEarning => {
                    Self::accrue_provider_earning_in_tx(&mut row_tx, attempt).await
                }
                FinancialStage::UpstreamCost => {
                    async {
                        let nonexecuted: bool = sqlx::query_scalar(
                            "SELECT execution='confirmed_not_executed' FROM attempts WHERE id=$1",
                        )
                        .bind(attempt)
                        .fetch_one(&mut *row_tx)
                        .await?;
                        if nonexecuted {
                            Self::release_nonexecuted_cost_in_tx(&mut row_tx, scope, attempt).await
                        } else {
                            Self::settle_cost_in_tx(&mut row_tx, scope, attempt)
                                .await
                                .map(|_| ())
                        }
                    }
                    .await
                }
            };
            if result.is_ok() {
                row_tx.commit().await?;
            } else if matches!(stage, FinancialStage::CustomerMediaCharge)
                && matches!(result, Err(StoreError::BudgetExceeded))
            {
                // Preserve a known media liability even before funding permits
                // its debit; subsequent sweeps retry without another Provider call.
                row_tx.commit().await?;
                failed += 1;
            } else {
                row_tx.rollback().await?;
                failed += 1;
            }
        }
        if cursor.is_none() {
            // Publish diagnostics only with the committed durable cursor. Explicit
            // library traversals and rolled-back steps do not impersonate worker progress.
            sqlx::query("UPDATE financial_recovery_progress SET after_attempt=$2,updated_at=clock_timestamp(),last_step_at=clock_timestamp(),last_candidate_count=$3,last_failure_count=$4 WHERE stage=$1")
                .bind(stage.name()).bind(next).bind(candidate_count).bind(failed as i32)
                .execute(&mut **tx).await?;
        }
        Ok((next, failed))
    }
}
