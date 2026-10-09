use crate::{Store, StoreError};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Clone, Copy, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ColorMode {
    System,
    Light,
    Dark,
}

impl ColorMode {
    fn as_str(self) -> &'static str {
        match self {
            Self::System => "system",
            Self::Light => "light",
            Self::Dark => "dark",
        }
    }
}

impl Store {
    pub async fn member_color_mode(&self, member: Uuid) -> Result<String, StoreError> {
        let saved: Option<String> = sqlx::query_scalar::<_, Option<String>>("SELECT p.color_mode FROM admin_operators o LEFT JOIN member_preferences p ON p.operator_id=o.id WHERE o.id=$1 AND o.revoked_at IS NULL")
            .bind(member).fetch_optional(&self.pool).await?.ok_or(StoreError::Unauthorized)?;
        match saved {
            Some(mode) => Ok(mode),
            None => Ok(self
                .branding_configuration()
                .await?
                .1
                .default_appearance
                .as_str()
                .to_owned()),
        }
    }

    pub async fn set_member_color_mode(
        &self,
        member: Uuid,
        mode: ColorMode,
    ) -> Result<(), StoreError> {
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
        sqlx::query("INSERT INTO member_preferences(operator_id,color_mode) VALUES($1,$2) ON CONFLICT(operator_id) DO UPDATE SET color_mode=EXCLUDED.color_mode,updated_at=clock_timestamp()")
            .bind(member).bind(mode.as_str()).execute(&mut *tx).await?;
        tx.commit().await?;
        Ok(())
    }
}
