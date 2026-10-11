//! Transactional authorization shared by company-scoped creation flows.
use crate::{OperatorPrincipal, Store, StoreError};
use uuid::Uuid;

impl Store {
    /// Call after operation-specific lock waits, before intent/receipt writes.
    /// Share locks keep member/session scope and revocation stable until commit;
    /// use wall-clock time after those locks to reject expired waiting sessions.
    /// Installation/internal bypass remains explicit at each caller.
    pub(crate) async fn authorize_company_writer_in_tx(
        tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
        organization: Uuid,
        member: OperatorPrincipal,
    ) -> Result<(), StoreError> {
        let access: Option<(bool, i64)> = sqlx::query_as(
            "SELECT o.revoked_at IS NULL AND s.revoked_at IS NULL \
         AND o.role IN ('owner','admin') AND o.project_id IS NULL \
         AND o.organization_id=$3, s.expires_at_unix \
         FROM admin_operators o JOIN admin_sessions s ON s.operator_id=o.id \
         WHERE o.id=$1 AND s.id=$2 FOR SHARE OF o,s",
        )
        .bind(member.id)
        .bind(member.session_id)
        .bind(organization)
        .fetch_optional(&mut **tx)
        .await?;
        let Some((true, expires_at)) = access else {
            return Err(StoreError::Unauthorized);
        };
        let unexpired: bool =
            sqlx::query_scalar("SELECT $1::bigint > extract(epoch FROM clock_timestamp())::bigint")
                .bind(expires_at)
                .fetch_one(&mut **tx)
                .await?;
        if !unexpired {
            return Err(StoreError::Unauthorized);
        }
        Ok(())
    }
}
