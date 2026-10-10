use crate::{ManagedRouteSnapshot, Store, StoreError, TenantScope, VendorRoute};
use sqlx::{Executor, Postgres};
use uuid::Uuid;

impl From<&VendorRoute> for ManagedRouteSnapshot {
    fn from(route: &VendorRoute) -> Self {
        Self {
            pool_alias: None,
            pool_revision: None,
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
        // The adapter name alone does not qualify a custom endpoint's failures.
        // Pin only the reviewed canonical endpoint policy at this route revision.
        let inserted = sqlx::query("INSERT INTO managed_attempt_routes(attempt_id,vendor_id,model_alias,vendor_revision,model_revision,pool_alias,pool_revision,nonexecution_policy) SELECT $1,$2,$3,$4,$5,$6,$7,CASE WHEN adapter='openrouter' AND rtrim(api_base,'/')='https://openrouter.ai/api/v1' THEN 'openrouter-text-auth-rejection-v1' END FROM vendors WHERE id=$2 AND revision=$4")
            .bind(attempt).bind(route.vendor_id).bind(&route.model_alias)
            .bind(route.vendor_revision).bind(route.model_revision).bind(&route.pool_alias).bind(route.pool_revision)
            .execute(executor).await.map_err(crate::accounting::map_gateway_admission_error)?;
        if inserted.rows_affected() != 1 {
            return Err(StoreError::ManagedRouteChanged);
        }
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
