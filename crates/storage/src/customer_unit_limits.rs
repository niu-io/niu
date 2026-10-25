//! Separate Credits workspace and API-key spending limits (#110).
//!
//! Monetary caps in `customer_workspace_spending_limits` and
//! `customer_key_spending_limits` remain preserved for currency mode and are
//! never reinterpreted as atom quantities. A workspace or key lineage with a
//! monetary limit requires an explicit Credits limit policy revision (either an
//! exact atom cap or explicit `null` for unlimited) before Credits admission.

use crate::{OperatorAuditActor, Store, StoreError, TenantScope};
use serde_json::Value;
use sqlx::{Postgres, Transaction};
use uuid::Uuid;

const WORKSPACE_HISTORY_ROW: &str = "
    SELECT jsonb_build_object(
        'revision', revision::text,
        'expected_revision', expected_revision::text,
        'definition_revision', definition_revision::text,
        'limit_atoms', limit_atoms::text,
        'recorded_at', to_char(recorded_at AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"'),
        'actor_kind', actor_kind,
        'actor_name', actor_name
    )
    FROM customer_unit_workspace_limit_history
    WHERE organization_id = $1 AND project_id = $2 AND idempotency_key = $3
";

const KEY_HISTORY_ROW: &str = "
    SELECT jsonb_build_object(
        'revision', revision::text,
        'expected_revision', expected_revision::text,
        'definition_revision', definition_revision::text,
        'limit_atoms', limit_atoms::text,
        'recorded_at', to_char(recorded_at AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"'),
        'actor_kind', actor_kind,
        'actor_name', actor_name
    )
    FROM customer_unit_key_limit_history
    WHERE organization_id = $1 AND project_id = $2 AND spending_root_id = $3 AND idempotency_key = $4
";

async fn authorize_owner(
    tx: &mut Transaction<'_, Postgres>,
    scope: TenantScope,
    actor: OperatorAuditActor,
) -> Result<(&'static str, String, Option<Uuid>), StoreError> {
    match actor {
        OperatorAuditActor::Installation => Ok((
            "installation",
            "Installation administrator".to_owned(),
            None,
        )),
        OperatorAuditActor::Operator(id) => {
            let name: String = sqlx::query_scalar(
                "SELECT name FROM admin_operators
                 WHERE id = $1 AND role = 'owner' AND revoked_at IS NULL
                   AND organization_id = $2 AND (project_id IS NULL OR project_id = $3)
                 FOR SHARE",
            )
            .bind(id)
            .bind(scope.organization_id)
            .bind(scope.project_id)
            .fetch_optional(&mut **tx)
            .await?
            .ok_or(StoreError::Unauthorized)?;
            Ok(("member", name, Some(id)))
        }
    }
}

async fn lock_unit_account(
    tx: &mut Transaction<'_, Postgres>,
    organization_id: Uuid,
) -> Result<(), StoreError> {
    sqlx::query("SELECT revision FROM customer_unit_configuration WHERE singleton FOR SHARE")
        .fetch_one(&mut **tx)
        .await?;
    sqlx::query("SELECT id FROM organizations WHERE id = $1 FOR SHARE")
        .bind(organization_id)
        .fetch_optional(&mut **tx)
        .await?
        .ok_or(StoreError::Conflict)?;
    sqlx::query(
        "INSERT INTO customer_unit_accounts(organization_id) VALUES($1) ON CONFLICT DO NOTHING",
    )
    .bind(organization_id)
    .execute(&mut **tx)
    .await?;
    sqlx::query(
        "SELECT organization_id FROM customer_unit_accounts WHERE organization_id = $1 FOR NO KEY UPDATE",
    )
    .bind(organization_id)
    .fetch_one(&mut **tx)
    .await?;
    Ok(())
}

impl Store {
    pub async fn customer_unit_workspace_spending_limit(
        &self,
        scope: TenantScope,
    ) -> Result<Option<Value>, StoreError> {
        let mut snapshot = self.begin_bounded_financial_snapshot().await?;
        let row: Option<Value> = sqlx::query_scalar(
            "WITH state AS MATERIALIZED (
                SELECT
                    l.limit_atoms,
                    l.revision,
                    l.definition_revision,
                    niu_customer_unit_workspace_committed(p.organization_id, p.id) AS committed,
                    EXISTS (
                        SELECT 1 FROM customer_workspace_spending_limits m
                        WHERE m.organization_id = p.organization_id AND m.project_id = p.id
                    ) AS monetary_preserved
                FROM projects p
                LEFT JOIN customer_unit_workspace_spending_limits l
                  ON l.organization_id = p.organization_id AND l.project_id = p.id
                WHERE p.organization_id = $1 AND p.id = $2
            )
            SELECT jsonb_build_object(
                'unit', (
                    SELECT jsonb_build_object(
                        'definition_revision', d.revision::text,
                        'name', d.name,
                        'display_precision', d.display_precision,
                        'atoms_per_unit', '1000000000'
                    )
                    FROM customer_unit_definitions d
                    ORDER BY d.revision DESC LIMIT 1
                ),
                'limit_atoms', limit_atoms::text,
                'revision', revision::text,
                'definition_revision', definition_revision::text,
                'committed_atoms', committed::text,
                'remaining_atoms', CASE
                    WHEN limit_atoms IS NULL THEN NULL
                    ELSE GREATEST(limit_atoms::numeric - committed, 0)::text
                END,
                'monetary_limit_preserved', monetary_preserved,
                'credits_admission_blocked_by_monetary_limit', monetary_preserved AND revision IS NULL
            )
            FROM state",
        )
        .bind(scope.organization_id)
        .bind(scope.project_id)
        .fetch_optional(&mut *snapshot)
        .await?;
        snapshot.commit().await?;
        Ok(row)
    }

    pub async fn customer_unit_workspace_limit_history(
        &self,
        scope: TenantScope,
        before_revision: Option<i64>,
        limit: i64,
    ) -> Result<Option<Vec<Value>>, StoreError> {
        if !(1..=100).contains(&limit) || before_revision.is_some_and(|v| v <= 0) {
            return Err(StoreError::Conflict);
        }
        let mut snapshot = self.begin_bounded_financial_snapshot().await?;
        let exists: bool = sqlx::query_scalar(
            "SELECT EXISTS(SELECT 1 FROM projects WHERE organization_id = $1 AND id = $2)",
        )
        .bind(scope.organization_id)
        .bind(scope.project_id)
        .fetch_one(&mut *snapshot)
        .await?;
        if !exists {
            return Ok(None);
        }
        let rows = sqlx::query_scalar(
            "SELECT jsonb_build_object(
                'revision', revision::text,
                'expected_revision', expected_revision::text,
                'definition_revision', definition_revision::text,
                'limit_atoms', limit_atoms::text,
                'recorded_at', to_char(recorded_at AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"'),
                'actor_kind', actor_kind,
                'actor_name', actor_name
            )
            FROM customer_unit_workspace_limit_history
            WHERE organization_id = $1 AND project_id = $2
              AND ($3::bigint IS NULL OR revision < $3)
            ORDER BY revision DESC LIMIT $4",
        )
        .bind(scope.organization_id)
        .bind(scope.project_id)
        .bind(before_revision)
        .bind(limit)
        .fetch_all(&mut *snapshot)
        .await?;
        snapshot.commit().await?;
        Ok(Some(rows))
    }

    pub async fn set_customer_unit_workspace_spending_limit(
        &self,
        scope: TenantScope,
        limit_atoms: Option<i64>,
        expected_revision: i64,
        idempotency_key: Uuid,
        actor: OperatorAuditActor,
    ) -> Result<Value, StoreError> {
        if limit_atoms.is_some_and(|v| v < 0) || expected_revision < 0 || expected_revision == i64::MAX {
            return Err(StoreError::InvalidCustomerUnit);
        }
        let mut tx = self.begin_bounded_recording().await?;
        lock_unit_account(&mut tx, scope.organization_id).await?;
        sqlx::query("SELECT id FROM projects WHERE organization_id = $1 AND id = $2 FOR SHARE")
            .bind(scope.organization_id)
            .bind(scope.project_id)
            .fetch_optional(&mut *tx)
            .await?
            .ok_or(StoreError::Conflict)?;
        let (actor_kind, actor_name, actor_id) = authorize_owner(&mut tx, scope, actor).await?;
        let prior: Option<(i64, Option<i64>)> = sqlx::query_as(
            "SELECT expected_revision, limit_atoms
             FROM customer_unit_workspace_limit_history
             WHERE organization_id = $1 AND project_id = $2 AND idempotency_key = $3",
        )
        .bind(scope.organization_id)
        .bind(scope.project_id)
        .bind(idempotency_key)
        .fetch_optional(&mut *tx)
        .await?;
        if let Some((old_expected, old_limit)) = prior {
            if old_expected != expected_revision || old_limit != limit_atoms {
                return Err(StoreError::Conflict);
            }
            return Ok(sqlx::query_scalar(WORKSPACE_HISTORY_ROW)
                .bind(scope.organization_id)
                .bind(scope.project_id)
                .bind(idempotency_key)
                .fetch_one(&mut *tx)
                .await?);
        }
        let definition: i64 = sqlx::query_scalar::<_, Option<i64>>(
            "SELECT max(revision) FROM customer_unit_definitions",
        )
        .fetch_one(&mut *tx)
        .await?
        .ok_or(StoreError::Conflict)?;
        let current: Option<i64> = sqlx::query_scalar(
            "SELECT revision FROM customer_unit_workspace_spending_limits
             WHERE organization_id = $1 AND project_id = $2",
        )
        .bind(scope.organization_id)
        .bind(scope.project_id)
        .fetch_optional(&mut *tx)
        .await?;
        if current.unwrap_or(0) != expected_revision {
            return Err(StoreError::Conflict);
        }
        if let Some(limit) = limit_atoms {
            let exceeds: bool = sqlx::query_scalar(
                "SELECT niu_customer_unit_workspace_committed($1, $2) > $3",
            )
            .bind(scope.organization_id)
            .bind(scope.project_id)
            .bind(limit)
            .fetch_one(&mut *tx)
            .await?;
            if exceeds {
                return Err(StoreError::WorkspaceSpendingLimitExceeded);
            }
        }
        let next = expected_revision + 1;
        sqlx::query(
            "INSERT INTO customer_unit_workspace_limit_history(
                organization_id, project_id, revision, expected_revision, definition_revision,
                limit_atoms, idempotency_key, actor_kind, actor_name, actor_operator_id
            ) VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)",
        )
        .bind(scope.organization_id)
        .bind(scope.project_id)
        .bind(next)
        .bind(expected_revision)
        .bind(definition)
        .bind(limit_atoms)
        .bind(idempotency_key)
        .bind(actor_kind)
        .bind(actor_name)
        .bind(actor_id)
        .execute(&mut *tx)
        .await?;
        if current.is_none() {
            sqlx::query(
                "INSERT INTO customer_unit_workspace_spending_limits(
                    organization_id, project_id, definition_revision, limit_atoms, revision
                ) VALUES($1, $2, $3, $4, $5)",
            )
            .bind(scope.organization_id)
            .bind(scope.project_id)
            .bind(definition)
            .bind(limit_atoms)
            .bind(next)
            .execute(&mut *tx)
            .await?;
        } else {
            sqlx::query(
                "UPDATE customer_unit_workspace_spending_limits
                 SET definition_revision = $3, limit_atoms = $4, revision = $5
                 WHERE organization_id = $1 AND project_id = $2",
            )
            .bind(scope.organization_id)
            .bind(scope.project_id)
            .bind(definition)
            .bind(limit_atoms)
            .bind(next)
            .execute(&mut *tx)
            .await?;
        }
        let result = sqlx::query_scalar(WORKSPACE_HISTORY_ROW)
            .bind(scope.organization_id)
            .bind(scope.project_id)
            .bind(idempotency_key)
            .fetch_one(&mut *tx)
            .await?;
        tx.commit().await?;
        Ok(result)
    }

    pub async fn customer_unit_key_spending_limit(
        &self,
        scope: TenantScope,
        key: Uuid,
    ) -> Result<Option<Value>, StoreError> {
        let mut snapshot = self.begin_bounded_financial_snapshot().await?;
        let row: Option<Value> = sqlx::query_scalar(
            "WITH state AS MATERIALIZED (
                SELECT
                    l.limit_atoms,
                    l.revision,
                    l.definition_revision,
                    niu_customer_unit_key_committed(k.organization_id, k.project_id, k.spending_root_id) AS committed,
                    EXISTS (
                        SELECT 1 FROM customer_key_spending_limits m
                        WHERE m.organization_id = k.organization_id
                          AND m.project_id = k.project_id
                          AND m.spending_root_id = k.spending_root_id
                          AND m.limit_nanos IS NOT NULL
                    ) AS monetary_preserved
                FROM api_keys k
                LEFT JOIN customer_unit_key_spending_limits l
                  ON l.organization_id = k.organization_id
                 AND l.project_id = k.project_id
                 AND l.spending_root_id = k.spending_root_id
                WHERE k.organization_id = $1 AND k.project_id = $2 AND k.id = $3
            )
            SELECT jsonb_build_object(
                'unit', (
                    SELECT jsonb_build_object(
                        'definition_revision', d.revision::text,
                        'name', d.name,
                        'display_precision', d.display_precision,
                        'atoms_per_unit', '1000000000'
                    )
                    FROM customer_unit_definitions d
                    ORDER BY d.revision DESC LIMIT 1
                ),
                'limit_atoms', limit_atoms::text,
                'revision', revision::text,
                'definition_revision', definition_revision::text,
                'committed_atoms', committed::text,
                'remaining_atoms', CASE
                    WHEN limit_atoms IS NULL THEN NULL
                    ELSE GREATEST(limit_atoms::numeric - committed, 0)::text
                END,
                'monetary_limit_preserved', monetary_preserved,
                'credits_admission_blocked_by_monetary_limit', monetary_preserved AND revision IS NULL
            )
            FROM state",
        )
        .bind(scope.organization_id)
        .bind(scope.project_id)
        .bind(key)
        .fetch_optional(&mut *snapshot)
        .await?;
        snapshot.commit().await?;
        Ok(row)
    }

    pub async fn customer_unit_key_limit_history(
        &self,
        scope: TenantScope,
        key: Uuid,
        before_revision: Option<i64>,
        limit: i64,
    ) -> Result<Option<Vec<Value>>, StoreError> {
        if !(1..=100).contains(&limit) || before_revision.is_some_and(|v| v <= 0) {
            return Err(StoreError::Conflict);
        }
        let mut snapshot = self.begin_bounded_financial_snapshot().await?;
        let root: Option<Uuid> = sqlx::query_scalar(
            "SELECT spending_root_id FROM api_keys
             WHERE organization_id = $1 AND project_id = $2 AND id = $3",
        )
        .bind(scope.organization_id)
        .bind(scope.project_id)
        .bind(key)
        .fetch_optional(&mut *snapshot)
        .await?;
        let Some(root) = root else {
            snapshot.commit().await?;
            return Ok(None);
        };
        let rows = sqlx::query_scalar(
            "SELECT jsonb_build_object(
                'revision', revision::text,
                'expected_revision', expected_revision::text,
                'definition_revision', definition_revision::text,
                'limit_atoms', limit_atoms::text,
                'recorded_at', to_char(recorded_at AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"'),
                'actor_kind', actor_kind,
                'actor_name', actor_name
            )
            FROM customer_unit_key_limit_history
            WHERE organization_id = $1 AND project_id = $2 AND spending_root_id = $3
              AND ($4::bigint IS NULL OR revision < $4)
            ORDER BY revision DESC LIMIT $5",
        )
        .bind(scope.organization_id)
        .bind(scope.project_id)
        .bind(root)
        .bind(before_revision)
        .bind(limit)
        .fetch_all(&mut *snapshot)
        .await?;
        snapshot.commit().await?;
        Ok(Some(rows))
    }

    pub async fn set_customer_unit_key_spending_limit(
        &self,
        scope: TenantScope,
        key: Uuid,
        limit_atoms: Option<i64>,
        expected_revision: i64,
        idempotency_key: Uuid,
        actor: OperatorAuditActor,
    ) -> Result<Option<Value>, StoreError> {
        if limit_atoms.is_some_and(|v| v < 0) || expected_revision < 0 || expected_revision == i64::MAX {
            return Err(StoreError::InvalidCustomerUnit);
        }
        let mut tx = self.begin_bounded_recording().await?;
        lock_unit_account(&mut tx, scope.organization_id).await?;
        let (actor_kind, actor_name, actor_id) = authorize_owner(&mut tx, scope, actor).await?;
        let root: Option<Uuid> = sqlx::query_scalar(
            "SELECT spending_root_id FROM api_keys
             WHERE organization_id = $1 AND project_id = $2 AND id = $3
             FOR SHARE",
        )
        .bind(scope.organization_id)
        .bind(scope.project_id)
        .bind(key)
        .fetch_optional(&mut *tx)
        .await?;
        let Some(root) = root else {
            return Ok(None);
        };
        let prior: Option<(i64, Option<i64>)> = sqlx::query_as(
            "SELECT expected_revision, limit_atoms
             FROM customer_unit_key_limit_history
             WHERE organization_id = $1 AND project_id = $2 AND spending_root_id = $3 AND idempotency_key = $4",
        )
        .bind(scope.organization_id)
        .bind(scope.project_id)
        .bind(root)
        .bind(idempotency_key)
        .fetch_optional(&mut *tx)
        .await?;
        if let Some((old_expected, old_limit)) = prior {
            if old_expected != expected_revision || old_limit != limit_atoms {
                return Err(StoreError::Conflict);
            }
            return Ok(Some(
                sqlx::query_scalar(KEY_HISTORY_ROW)
                    .bind(scope.organization_id)
                    .bind(scope.project_id)
                    .bind(root)
                    .bind(idempotency_key)
                    .fetch_one(&mut *tx)
                    .await?,
            ));
        }
        let definition: i64 = sqlx::query_scalar::<_, Option<i64>>(
            "SELECT max(revision) FROM customer_unit_definitions",
        )
        .fetch_one(&mut *tx)
        .await?
        .ok_or(StoreError::Conflict)?;
        let current: Option<i64> = sqlx::query_scalar(
            "SELECT revision FROM customer_unit_key_spending_limits
             WHERE organization_id = $1 AND project_id = $2 AND spending_root_id = $3",
        )
        .bind(scope.organization_id)
        .bind(scope.project_id)
        .bind(root)
        .fetch_optional(&mut *tx)
        .await?;
        if current.unwrap_or(0) != expected_revision {
            return Err(StoreError::Conflict);
        }
        if let Some(limit) = limit_atoms {
            let unattributed: bool = sqlx::query_scalar(
                "SELECT EXISTS(
                    SELECT 1 FROM customer_unit_reservations r
                    WHERE r.organization_id = $1 AND r.project_id = $2
                      AND niu_customer_attempt_spending_root(r.attempt_id) IS NULL
                      AND NOT EXISTS(
                          SELECT 1 FROM customer_unit_resolutions s
                          WHERE s.attempt_id = r.attempt_id AND s.kind = 'release'
                      )
                )",
            )
            .bind(scope.organization_id)
            .bind(scope.project_id)
            .fetch_one(&mut *tx)
            .await?;
            if unattributed {
                return Err(StoreError::Unresolved);
            }
            let exceeds: bool = sqlx::query_scalar(
                "SELECT niu_customer_unit_key_committed($1, $2, $3) > $4",
            )
            .bind(scope.organization_id)
            .bind(scope.project_id)
            .bind(root)
            .bind(limit)
            .fetch_one(&mut *tx)
            .await?;
            if exceeds {
                return Err(StoreError::KeySpendingLimitExceeded);
            }
        }
        let next = expected_revision + 1;
        sqlx::query(
            "INSERT INTO customer_unit_key_limit_history(
                organization_id, project_id, spending_root_id, revision, expected_revision,
                definition_revision, limit_atoms, idempotency_key, actor_kind, actor_name, actor_operator_id
            ) VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)",
        )
        .bind(scope.organization_id)
        .bind(scope.project_id)
        .bind(root)
        .bind(next)
        .bind(expected_revision)
        .bind(definition)
        .bind(limit_atoms)
        .bind(idempotency_key)
        .bind(actor_kind)
        .bind(actor_name)
        .bind(actor_id)
        .execute(&mut *tx)
        .await?;
        if current.is_none() {
            sqlx::query(
                "INSERT INTO customer_unit_key_spending_limits(
                    organization_id, project_id, spending_root_id, definition_revision, limit_atoms, revision
                ) VALUES($1, $2, $3, $4, $5, $6)",
            )
            .bind(scope.organization_id)
            .bind(scope.project_id)
            .bind(root)
            .bind(definition)
            .bind(limit_atoms)
            .bind(next)
            .execute(&mut *tx)
            .await?;
        } else {
            sqlx::query(
                "UPDATE customer_unit_key_spending_limits
                 SET definition_revision = $4, limit_atoms = $5, revision = $6
                 WHERE organization_id = $1 AND project_id = $2 AND spending_root_id = $3",
            )
            .bind(scope.organization_id)
            .bind(scope.project_id)
            .bind(root)
            .bind(definition)
            .bind(limit_atoms)
            .bind(next)
            .execute(&mut *tx)
            .await?;
        }
        let result = sqlx::query_scalar(KEY_HISTORY_ROW)
            .bind(scope.organization_id)
            .bind(scope.project_id)
            .bind(root)
            .bind(idempotency_key)
            .fetch_one(&mut *tx)
            .await?;
        tx.commit().await?;
        Ok(Some(result))
    }
}
