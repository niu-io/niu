//! Deployment defaults. Gateway callers must require platform administration for writes.
use crate::{ColorMode, Store, StoreError};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use uuid::Uuid;

#[path = "branding_contrast.rs"]
mod contrast;
#[path = "branding_images.rs"]
mod images;

#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct BrandingSettings {
    pub display_name: String,
    #[serde(default)]
    pub logo_data_url: Option<String>,
    #[serde(default)]
    pub favicon_data_url: Option<String>,
    pub default_appearance: ColorMode,
    pub light: BTreeMap<String, String>,
    pub dark: BTreeMap<String, String>,
}
impl Default for BrandingSettings {
    fn default() -> Self {
        Self {
            display_name: "NIU.IO".into(),
            logo_data_url: None,
            favicon_data_url: None,
            default_appearance: ColorMode::System,
            light: BTreeMap::new(),
            dark: BTreeMap::new(),
        }
    }
}
impl BrandingSettings {
    pub fn validate(&self) -> Result<(), StoreError> {
        if self.display_name.trim().is_empty()
            || self.display_name != self.display_name.trim()
            || self.display_name.chars().count() > 80
            || self.display_name.chars().any(char::is_control)
        {
            return Err(StoreError::InvalidObservation);
        }
        images::validate_reference(self.logo_data_url.as_deref(), 262144)?;
        images::validate_reference(self.favicon_data_url.as_deref(), 32768)?;
        for palette in [&self.light, &self.dark] {
            if palette.len() > 8 {
                return Err(StoreError::InvalidObservation);
            }
            for (token, color) in palette {
                if !matches!(
                    token.as_str(),
                    "background"
                        | "foreground"
                        | "primary"
                        | "primary-foreground"
                        | "sidebar"
                        | "sidebar-foreground"
                        | "accent"
                        | "accent-foreground"
                ) || color.len() != 7
                    || !color.starts_with('#')
                    || !color.as_bytes()[1..].iter().all(u8::is_ascii_hexdigit)
                {
                    return Err(StoreError::InvalidObservation);
                }
            }
        }
        if !contrast::readable(&self.light, false) || !contrast::readable(&self.dark, true) {
            return Err(StoreError::InvalidObservation);
        }
        Ok(())
    }
}
impl Store {
    pub async fn branding_configuration(&self) -> Result<(i64, BrandingSettings), StoreError> {
        let saved: Option<(i64, serde_json::Value)> =
            sqlx::query_as("SELECT revision,settings FROM branding_configuration WHERE singleton")
                .fetch_optional(&self.pool)
                .await?;
        match saved {
            None => Ok((0, BrandingSettings::default())),
            Some((revision, value)) => {
                let settings: BrandingSettings =
                    serde_json::from_value(value).map_err(|_| StoreError::InvalidObservation)?;
                settings.validate()?;
                Ok((revision, settings))
            }
        }
    }
    /// Save/reset deployment defaults with atomic audit and optimistic concurrency.
    /// Empty palettes inherit the shared NIU.IO tokens; no CSS text is accepted.
    pub async fn save_branding_configuration(
        &self,
        expected_revision: i64,
        settings: &BrandingSettings,
        actor: Option<Uuid>,
    ) -> Result<i64, StoreError> {
        self.save_branding_configuration_snapshot(expected_revision, settings, actor)
            .await
            .map(|saved| saved.0)
    }

    /// Returns the exact normalized snapshot committed by this save, even if a
    /// concurrent administrator immediately advances the revision again.
    pub async fn save_branding_configuration_snapshot(
        &self,
        expected_revision: i64,
        settings: &BrandingSettings,
        actor: Option<Uuid>,
    ) -> Result<(i64, BrandingSettings), StoreError> {
        settings.validate()?;
        static SLOTS: std::sync::LazyLock<std::sync::Arc<tokio::sync::Semaphore>> =
            std::sync::LazyLock::new(|| std::sync::Arc::new(tokio::sync::Semaphore::new(2)));
        let permit = SLOTS
            .clone()
            .try_acquire_owned()
            .map_err(|_| StoreError::Conflict)?;
        let mut settings = settings.clone();
        settings = tokio::task::spawn_blocking(move || {
            let _permit = permit;
            settings.logo_data_url = images::normalize(settings.logo_data_url, false)?;
            settings.favicon_data_url = images::normalize(settings.favicon_data_url, true)?;
            Ok::<_, StoreError>(settings)
        })
        .await
        .map_err(|_| StoreError::InvalidObservation)??;
        let revision = expected_revision
            .checked_add(1)
            .filter(|n| *n > 0)
            .ok_or(StoreError::Conflict)?;
        let value = serde_json::to_value(&settings).map_err(|_| StoreError::InvalidObservation)?;
        let mut tx = self.pool.begin().await?;
        sqlx::query("SELECT pg_advisory_xact_lock(716554)")
            .execute(&mut *tx)
            .await?;
        let current: Option<i64> = sqlx::query_scalar(
            "SELECT revision FROM branding_configuration WHERE singleton FOR UPDATE",
        )
        .fetch_optional(&mut *tx)
        .await?;
        if current.unwrap_or(0) != expected_revision {
            return Err(StoreError::Conflict);
        }
        sqlx::query("INSERT INTO branding_configuration(singleton,revision,settings) VALUES(true,$1,$2) ON CONFLICT(singleton) DO UPDATE SET revision=EXCLUDED.revision,settings=EXCLUDED.settings,updated_at=clock_timestamp()")
            .bind(revision).bind(&value).execute(&mut *tx).await?;
        sqlx::query("INSERT INTO branding_configuration_events(revision,settings,actor_operator_id) VALUES($1,$2,$3)")
            .bind(revision).bind(value).bind(actor).execute(&mut *tx).await?;
        tx.commit().await?;
        Ok((revision, settings))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn branding_accepts_only_named_hex_tokens_and_bounded_text() {
        let mut settings = BrandingSettings::default();
        settings.light.insert("primary".into(), "#112233".into());
        assert!(settings.validate().is_ok());
        for color in [
            "red",
            "#fff",
            "#gggggg",
            "url(https://example.org/x)",
            "#ffffff;display:none",
        ] {
            settings.light.insert("primary".into(), color.into());
            assert!(settings.validate().is_err());
        }
        settings.light.clear();
        settings.light.insert("position".into(), "#ffffff".into());
        assert!(settings.validate().is_err());
        settings.light.clear();
        for name in ["".to_owned(), " x".into(), "x\ny".into(), "x".repeat(81)] {
            settings.display_name = name;
            assert!(settings.validate().is_err());
        }
        assert!(serde_json::from_value::<BrandingSettings>(serde_json::json!({"display_name":"NIU.IO","default_appearance":"system","light":{},"dark":{},"css":"body{}"})).is_err());
    }
}
