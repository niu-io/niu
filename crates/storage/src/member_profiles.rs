use crate::{Store, StoreError};
use serde::Serialize;
use sqlx::FromRow;
use uuid::Uuid;

#[derive(FromRow, Serialize)]
pub struct MemberProfile {
    pub name: String,
    pub email: Option<String>,
    pub avatar_data_url: Option<String>,
    pub revision: i64,
}

impl Store {
    pub async fn member_profile(&self, member: Uuid) -> Result<MemberProfile, StoreError> {
        sqlx::query_as("SELECT o.name,c.email,p.avatar_data_url,COALESCE(p.revision,0) AS revision FROM admin_operators o LEFT JOIN member_password_credentials c ON c.operator_id=o.id LEFT JOIN member_profiles p ON p.operator_id=o.id WHERE o.id=$1 AND o.revoked_at IS NULL")
            .bind(member).fetch_optional(&self.pool).await?.ok_or(StoreError::Unauthorized)
    }

    /// Caller authorizes the current member, never a caller-supplied target ID.
    /// The avatar must already be decoded and normalized to a bounded PNG.
    pub async fn update_member_profile(
        &self,
        member: Uuid,
        name: &str,
        avatar: Option<&str>,
        expected_revision: i64,
    ) -> Result<MemberProfile, StoreError> {
        let name = name.trim();
        if name.is_empty()
            || name.chars().count() > 100
            || name.chars().any(char::is_control)
            || expected_revision < 0
        {
            return Err(StoreError::InvalidOperator);
        }
        let mut tx = self.pool.begin().await?;
        let active: Option<Uuid> = sqlx::query_scalar(
            "SELECT id FROM admin_operators WHERE id=$1 AND revoked_at IS NULL FOR UPDATE",
        )
        .bind(member)
        .fetch_optional(&mut *tx)
        .await?;
        if active.is_none() {
            return Err(StoreError::Unauthorized);
        }
        sqlx::query("INSERT INTO member_profiles(operator_id) VALUES($1) ON CONFLICT DO NOTHING")
            .bind(member)
            .execute(&mut *tx)
            .await?;
        let revision: i64 = sqlx::query_scalar(
            "SELECT revision FROM member_profiles WHERE operator_id=$1 FOR UPDATE",
        )
        .bind(member)
        .fetch_one(&mut *tx)
        .await?;
        if revision != expected_revision {
            return Err(StoreError::Conflict);
        }
        sqlx::query("UPDATE admin_operators SET name=$2 WHERE id=$1")
            .bind(member)
            .bind(name)
            .execute(&mut *tx)
            .await?;
        sqlx::query("UPDATE member_profiles SET avatar_data_url=$2,revision=revision+1,updated_at=clock_timestamp() WHERE operator_id=$1").bind(member).bind(avatar).execute(&mut *tx).await?;
        let profile = sqlx::query_as("SELECT o.name,c.email,p.avatar_data_url,p.revision FROM admin_operators o LEFT JOIN member_password_credentials c ON c.operator_id=o.id JOIN member_profiles p ON p.operator_id=o.id WHERE o.id=$1")
            .bind(member).fetch_one(&mut *tx).await?;
        tx.commit().await?;
        Ok(profile)
    }
}
