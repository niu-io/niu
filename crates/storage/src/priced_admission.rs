//! Atomic pre-dispatch state for a priced inference attempt.
use crate::{GatewayAdmission, GatewayReservation, Principal, Store, StoreError};
use uuid::Uuid;

impl Store {
    /// Commit every binding and the reservation with dispatch intent. A policy
    /// denial commits its evidence; an uncertain commit must never be retried
    /// as another upstream submission or treated as permission to free a hold.
    pub async fn admit_priced_gateway(
        &self,
        principal: &Principal,
        admission: GatewayAdmission,
        reservation: &GatewayReservation,
    ) -> Result<(Uuid, Uuid), StoreError> {
        self.admit_priced_gateway_with_retry(principal, admission, reservation, None)
            .await
    }

    pub async fn admit_priced_gateway_with_retry(
        &self,
        principal: &Principal,
        admission: GatewayAdmission,
        reservation: &GatewayReservation,
        retry: Option<crate::GatewayRetryAdmission>,
    ) -> Result<(Uuid, Uuid), StoreError> {
        let scope = principal.scope();
        if admission.scope.organization_id != scope.organization_id
            || admission.scope.project_id != scope.project_id
            || admission.key_id != principal.key_id()
            || admission.model != reservation.resource_id
            || admission.revision != reservation.offer_revision
        {
            return Err(StoreError::Conflict);
        }
        let attempt = admission.attempt_id;
        let mut tx = self.pool.begin().await?;
        Self::insert_gateway_retry_attempt(&mut tx, &admission, retry).await?;
        if let Some(route) = &admission.managed_route {
            Self::insert_managed_route(&mut *tx, attempt, route).await?;
        }
        Self::bind_key_token_bound_with(&mut *tx, scope, attempt, admission.token_bound).await?;
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
        Self::bind_customer_tariff_in_tx(&mut tx, scope, attempt, &admission.model).await?;
        Self::bind_provider_offer_in_tx(
            &mut tx,
            scope,
            attempt,
            admission
                .managed_route
                .as_ref()
                .map_or(admission.model.as_str(), |route| route.model_alias.as_str()),
            &admission.upstream_model,
            admission.api_base.as_deref(),
        )
        .await?;
        let dispatched =
            Self::reserve_and_dispatch_gateway_in_tx(&mut tx, principal, attempt, reservation)
                .await?;
        tx.commit().await?;
        if dispatched {
            Ok((admission.operation_id, attempt))
        } else {
            Err(StoreError::Conflict)
        }
    }
}
