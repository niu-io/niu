use crate::{ManagedRouteSnapshot, Store, StoreError, TenantScope, VendorRoute};
use sqlx::{Executor, Postgres};
use uuid::Uuid;

impl From<&VendorRoute> for ManagedRouteSnapshot {
    fn from(route: &VendorRoute) -> Self {
        Self {
            vendor_id: route.vendor.id,
            model_alias: route.model.alias.clone(),
            vendor_revision: route.vendor.revision,
            model_revision: route.model.revision,
        }
    }
}

impl Store {
    pub(crate) async fn insert_managed_route<'e>(
        executor: impl Executor<'e, Database = Postgres>,
        attempt: Uuid,
        route: &ManagedRouteSnapshot,
    ) -> Result<(), StoreError> {
        sqlx::query("INSERT INTO managed_attempt_routes(attempt_id,vendor_id,model_alias,vendor_revision,model_revision) VALUES($1,$2,$3,$4,$5)")
            .bind(attempt).bind(route.vendor_id).bind(&route.model_alias)
            .bind(route.vendor_revision).bind(route.model_revision)
            .execute(executor).await.map_err(crate::accounting::map_gateway_admission_error)?;
        Ok(())
    }

    pub async fn bind_managed_route(
        &self,
        scope: TenantScope,
        attempt: Uuid,
        route: &ManagedRouteSnapshot,
    ) -> Result<(), StoreError> {
        let mut tx = self.pool.begin().await?;
        sqlx::query("SELECT id FROM attempts WHERE id=$1 AND organization_id=$2 AND project_id=$3 AND execution='not_sent' FOR UPDATE")
            .bind(attempt).bind(scope.organization_id).bind(scope.project_id)
            .fetch_optional(&mut *tx).await?.ok_or(StoreError::Conflict)?;
        Self::insert_managed_route(&mut *tx, attempt, route).await?;
        tx.commit().await?;
        Ok(())
    }
}
