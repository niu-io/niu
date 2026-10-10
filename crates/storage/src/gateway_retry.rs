//! Bounded attempt-chain admission. This never authorizes uncertain resubmission.
use crate::{GatewayAdmission, Store, StoreError};
use sqlx::{Postgres, Transaction};
use uuid::Uuid;

#[derive(Clone, Copy)]
pub enum GatewayRetryAdmission {
    /// The gateway qualified the first route as canonical OpenRouter Chat.
    First {
        remaining_ms: i64,
    },
    Successor {
        predecessor_id: Uuid,
    },
}

impl Store {
    pub(crate) async fn insert_gateway_retry_attempt(
        tx: &mut Transaction<'_, Postgres>,
        admission: &GatewayAdmission,
        retry: Option<GatewayRetryAdmission>,
    ) -> Result<(), StoreError> {
        let scope = admission.scope;
        if let Some(GatewayRetryAdmission::Successor { predecessor_id }) = retry {
            let route = admission
                .managed_route
                .as_ref()
                .ok_or(StoreError::Conflict)?;
            // Serializing on the parent operation prevents competing successors.
            // Scope/model/task/key identities and the original deadline persist.
            sqlx::query("SELECT o.id FROM operations o JOIN gateway_retry_policies p ON p.operation_id=o.id WHERE o.id=$1 AND o.organization_id=$2 AND o.project_id=$3 AND o.model_alias=$4 AND o.task_id IS NOT DISTINCT FROM $5 AND p.key_id=$6 AND p.deadline>clock_timestamp() FOR UPDATE OF o")
                .bind(admission.operation_id).bind(scope.organization_id).bind(scope.project_id)
                .bind(&admission.model).bind(&admission.task_id).bind(admission.key_id)
                .fetch_optional(&mut **tx).await?.ok_or(StoreError::Conflict)?;
            let eligible: bool = sqlx::query_scalar(include_str!("gateway_retry_eligible.sql"))
                .bind(predecessor_id)
                .bind(admission.operation_id)
                .bind(route.vendor_id)
                .bind(&route.pool_alias)
                .fetch_one(&mut **tx)
                .await?;
            if !eligible {
                return Err(StoreError::Conflict);
            }
            sqlx::query("INSERT INTO attempts(id,organization_id,project_id,operation_id,resource_id,offer_revision) VALUES($1,$2,$3,$4,$5,$6)")
                .bind(admission.attempt_id).bind(scope.organization_id).bind(scope.project_id)
                .bind(admission.operation_id).bind(&admission.model).bind(&admission.revision)
                .execute(&mut **tx).await?;
            sqlx::query("INSERT INTO gateway_retry_attempts(attempt_id,operation_id,ordinal,predecessor_id) VALUES($1,$2,2,$3)")
                .bind(admission.attempt_id).bind(admission.operation_id).bind(predecessor_id)
                .execute(&mut **tx).await?;
        } else {
            Self::insert_gateway_attempt(
                &mut **tx,
                scope,
                admission.operation_id,
                admission.attempt_id,
                &admission.model,
                admission.task_id.as_deref(),
                &admission.revision,
            )
            .await?;
            if let Some(GatewayRetryAdmission::First { remaining_ms }) = retry {
                if !(1..=86_400_000).contains(&remaining_ms)
                    || admission.dispatch_provider != "openrouter"
                    || admission.api_base.as_deref().is_none_or(|base| {
                        base.trim_end_matches('/') != "https://openrouter.ai/api/v1"
                    })
                    || admission
                        .managed_route
                        .as_ref()
                        .is_none_or(|r| r.pool_alias.is_none())
                {
                    return Err(StoreError::Conflict);
                }
                sqlx::query("INSERT INTO gateway_retry_policies(operation_id,key_id,policy_revision,maximum_attempts,deadline) VALUES($1,$2,'openrouter-chat-auth-rejection-v1',2,clock_timestamp()+$3::bigint*interval '1 millisecond')")
                    .bind(admission.operation_id).bind(admission.key_id).bind(remaining_ms)
                    .execute(&mut **tx).await?;
                sqlx::query("INSERT INTO gateway_retry_attempts(attempt_id,operation_id,ordinal) VALUES($1,$2,1)")
                    .bind(admission.attempt_id).bind(admission.operation_id).execute(&mut **tx).await?;
            }
        }
        Ok(())
    }
}
