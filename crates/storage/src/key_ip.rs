//! Request-source policy shared across secret rotations.
use crate::{OperatorAuditActor, Store, StoreError, TenantScope};
use serde_json::Value;
use std::net::IpAddr;
use uuid::Uuid;
impl Store {
    pub async fn check_key_ip(
        &self,
        scope: TenantScope,
        key: Uuid,
        source: Option<IpAddr>,
    ) -> Result<(), StoreError> {
        let allowed:Option<bool>=sqlx::query_scalar("SELECT CASE WHEN p.revision IS NULL OR p.allowed_cidrs IS NULL THEN true WHEN $4::text IS NULL THEN false ELSE EXISTS(SELECT 1 FROM unnest(p.allowed_cidrs) n WHERE $4::text::inet <<= n::cidr) END FROM api_keys k LEFT JOIN key_ip_policies p ON p.spending_root_id=k.spending_root_id WHERE k.organization_id=$1 AND k.project_id=$2 AND k.id=$3")
            .bind(scope.organization_id).bind(scope.project_id).bind(key).bind(source.map(|ip|ip.to_string())).fetch_optional(&self.pool).await?;
        match allowed {
            Some(true) => Ok(()),
            Some(false) => Err(StoreError::KeyIpDenied),
            None => Err(StoreError::Unauthorized),
        }
    }
    pub async fn key_ip_policy(
        &self,
        scope: TenantScope,
        key: Uuid,
    ) -> Result<Option<Value>, StoreError> {
        Ok(sqlx::query_scalar("SELECT jsonb_build_object('allowed_cidrs',p.allowed_cidrs,'revision',p.revision::text) FROM api_keys k LEFT JOIN key_ip_policies p ON p.spending_root_id=k.spending_root_id WHERE k.organization_id=$1 AND k.project_id=$2 AND k.id=$3")
            .bind(scope.organization_id).bind(scope.project_id).bind(key).fetch_optional(&self.pool).await?)
    }
    pub async fn key_ip_history(
        &self,
        scope: TenantScope,
        key: Uuid,
        before: Option<i64>,
        limit: i64,
    ) -> Result<Vec<Value>, StoreError> {
        if !(1..=100).contains(&limit) || before.is_some_and(|v| v <= 0) {
            return Err(StoreError::Conflict);
        }
        Ok(sqlx::query_scalar("SELECT jsonb_build_object('allowed_cidrs',h.allowed_cidrs,'revision',h.revision::text,'recorded_at',h.recorded_at,'actor_kind',h.actor_kind,'actor_name',h.actor_name) FROM key_ip_policy_history h JOIN api_keys k ON k.spending_root_id=h.spending_root_id WHERE k.organization_id=$1 AND k.project_id=$2 AND k.id=$3 AND ($4::bigint IS NULL OR h.revision<$4) ORDER BY h.revision DESC LIMIT $5")
            .bind(scope.organization_id).bind(scope.project_id).bind(key).bind(before).bind(limit).fetch_all(&self.pool).await?)
    }
    pub async fn set_key_ip_policy(
        &self,
        scope: TenantScope,
        key: Uuid,
        networks: Option<Vec<String>>,
        expected: i64,
        actor: OperatorAuditActor,
    ) -> Result<i64, StoreError> {
        if expected < 0 || expected == i64::MAX || networks.as_ref().is_some_and(|n| n.len() > 64) {
            return Err(StoreError::InvalidKey);
        }
        let networks = networks
            .map(|values| {
                values
                    .into_iter()
                    .map(|value| {
                        if value.len() > 64 || value.trim() != value {
                            return Err(StoreError::InvalidKey);
                        }
                        let net = value
                            .parse::<ipnet::IpNet>()
                            .ok()
                            .or_else(|| value.parse::<IpAddr>().ok().map(ipnet::IpNet::from))
                            .ok_or(StoreError::InvalidKey)?;
                        Ok(net.trunc().to_string())
                    })
                    .collect::<Result<Vec<_>, StoreError>>()
            })
            .transpose()?;
        let mut tx = self.pool.begin().await?;
        let (kind, name, actor_id) = match actor {
            OperatorAuditActor::Installation => (
                "installation",
                "Installation administrator".to_owned(),
                None,
            ),
            OperatorAuditActor::Operator(id) => {
                let name:String=sqlx::query_scalar("SELECT name FROM admin_operators WHERE id=$1 AND organization_id=$2 AND (project_id IS NULL OR project_id=$3) AND role='owner' AND revoked_at IS NULL FOR SHARE")
                    .bind(id).bind(scope.organization_id).bind(scope.project_id).fetch_optional(&mut *tx).await?.ok_or(StoreError::Unauthorized)?;
                ("member", name, Some(id))
            }
        };
        let root:Uuid=sqlx::query_scalar("SELECT root.id FROM api_keys k JOIN api_keys root ON root.id=k.spending_root_id WHERE k.organization_id=$1 AND k.project_id=$2 AND k.id=$3 FOR UPDATE OF root")
            .bind(scope.organization_id).bind(scope.project_id).bind(key).fetch_optional(&mut *tx).await?.ok_or(StoreError::Conflict)?;
        let current: Option<i64> =
            sqlx::query_scalar("SELECT revision FROM key_ip_policies WHERE spending_root_id=$1")
                .bind(root)
                .fetch_optional(&mut *tx)
                .await?;
        if current.unwrap_or(0) != expected {
            return Err(StoreError::Conflict);
        }
        let next = expected + 1;
        sqlx::query("INSERT INTO key_ip_policies(organization_id,project_id,spending_root_id,allowed_cidrs,revision) VALUES($1,$2,$3,$4,$5) ON CONFLICT(organization_id,project_id,spending_root_id) DO UPDATE SET allowed_cidrs=EXCLUDED.allowed_cidrs,revision=EXCLUDED.revision")
            .bind(scope.organization_id).bind(scope.project_id).bind(root).bind(&networks).bind(next).execute(&mut *tx).await?;
        sqlx::query("INSERT INTO key_ip_policy_history(organization_id,project_id,spending_root_id,revision,allowed_cidrs,actor_kind,actor_name,actor_operator_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)")
            .bind(scope.organization_id).bind(scope.project_id).bind(root).bind(next).bind(networks).bind(kind).bind(name).bind(actor_id).execute(&mut *tx).await?;
        tx.commit().await?;
        Ok(next)
    }
}
