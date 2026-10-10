//! Atomic preparation of an owner-funded text attempt, without dispatch authority.
use crate::{GatewayAdmission, Principal, Store, StoreError, VendorRoute};
use uuid::Uuid;

impl Store {
    /// Persist the operation and all personal-route admission bindings together.
    /// Preparation never authorizes transport: the caller must separately commit
    /// `mark_dispatched`, which rechecks current key, route and Guardrail policy.
    /// Keeping that boundary separate preserves durable pre-dispatch denials.
    pub async fn prepare_personal_gateway_attempt(
        &self,
        principal: &Principal,
        admission: GatewayAdmission,
        route: &VendorRoute,
    ) -> Result<(Uuid, Uuid), StoreError> {
        let scope = principal.scope();
        if admission.scope.organization_id != scope.organization_id
            || admission.scope.project_id != scope.project_id
            || admission.key_id != principal.key_id()
        {
            return Err(StoreError::Conflict);
        }
        let attempt = admission.attempt_id;
        let mut tx = self.pool.begin().await?;
        Self::insert_gateway_attempt(
            &mut *tx,
            scope,
            admission.operation_id,
            attempt,
            &admission.model,
            admission.task_id.as_deref(),
            &admission.revision,
        )
        .await?;
        if let Some(route) = &admission.managed_route {
            Self::insert_managed_route(&mut *tx, attempt, route).await?;
        }
        Self::bind_key_token_bound_with(&mut *tx, scope, attempt, admission.token_bound).await?;
        Self::bind_personal_attempt_route_with(&mut *tx, scope, attempt, route).await?;
        if let Some(snapshot) = &admission.inspected_guardrails {
            Self::insert_inspected_guardrails(
                &mut *tx,
                scope,
                attempt,
                principal.key_id(),
                snapshot,
            )
            .await?;
        }
        Self::set_attempt_dispatch_provider_with(
            &mut *tx,
            scope,
            attempt,
            &admission.dispatch_provider,
        )
        .await?;
        tx.commit().await?;
        Ok((admission.operation_id, attempt))
    }
}
