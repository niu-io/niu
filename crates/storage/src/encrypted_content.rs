//! Bounded startup inventory of retained private content, including expired rows.
//! No content, ciphertext or plaintext is exposed through a product API.
use crate::{Store, StoreError, TenantScope};
use uuid::Uuid;

#[derive(Clone, Copy)]
pub enum EncryptedContentDomain {
    MediaResult,
    AssetListing,
    AssetLookup,
    AssetRead,
    AssetPatch,
    InspectedImage,
    WorkspaceAsset,
    ProviderVerification,
}

impl EncryptedContentDomain {
    pub const ALL: [Self; 8] = [
        Self::MediaResult,
        Self::AssetListing,
        Self::AssetLookup,
        Self::AssetRead,
        Self::AssetPatch,
        Self::InspectedImage,
        Self::WorkspaceAsset,
        Self::ProviderVerification,
    ];
}

// Deliberately not Debug or Serialize: this is internal encryption material.
pub struct EncryptedContent {
    pub scope: TenantScope,
    pub id: Uuid,
    pub discriminator: String,
    pub key_id: Option<Uuid>,
    pub ciphertext: Vec<u8>,
}

impl Store {
    /// Startup protection for offline maintenance. This does not fence already
    /// running writers; operators must stop every Gateway before rotation.
    pub async fn encryption_rotation_active(&self) -> Result<bool, StoreError> {
        Ok(sqlx::query_scalar(
            "SELECT EXISTS(SELECT 1 FROM encryption_rotation_operations WHERE completed_at IS NULL)",
        )
        .fetch_one(&self.pool)
        .await?)
    }

    /// Keyset pages cap binary-source memory at eight retained objects. Do not
    /// filter by expiry, enabled routes, adapter, or current user authorization:
    /// those predicates would hide content needed by a complete key audit.
    pub async fn retained_encrypted_content_page(
        &self,
        domain: EncryptedContentDomain,
        after: Option<(Uuid, String)>,
    ) -> Result<Vec<EncryptedContent>, StoreError> {
        // Source SQL is a closed enum, never request text. Identity rows are
        // protected by foreign keys; physically erased content is absent/null.
        // Push the keyset predicate and LIMIT 8 directly into each source table
        // so PostgreSQL uses the primary-key B-tree index instead of sorting
        // derived tables with constant empty-string discriminators.
        let (id, discriminator) =
            after.map_or((None, String::new()), |(id, kind)| (Some(id), kind));
        type Row = (Uuid, Uuid, Uuid, String, Option<Uuid>, Vec<u8>);
        let rows: Vec<Row> = match domain {
            EncryptedContentDomain::MediaResult => {
                sqlx::query_as(
                    "SELECT organization_id,project_id,attempt_id AS id,kind AS discriminator,NULL::uuid AS key_id,ciphertext \
                     FROM media_result_references \
                     WHERE ciphertext IS NOT NULL AND ($1::uuid IS NULL OR (attempt_id,kind)>($1,$2)) \
                     ORDER BY attempt_id,kind LIMIT 64",
                )
                .bind(id)
                .bind(discriminator)
                .fetch_all(&self.pool)
                .await?
            }
            EncryptedContentDomain::ProviderVerification => {
                sqlx::query_as(
                    "SELECT organization_id,project_id,id,''::text AS discriminator,key_id,ciphertext \
                     FROM workspace_provider_verification_sessions \
                     WHERE ciphertext IS NOT NULL AND ($1::uuid IS NULL OR id>$1) \
                     ORDER BY id LIMIT 64",
                )
                .bind(id)
                .fetch_all(&self.pool)
                .await?
            }
            EncryptedContentDomain::WorkspaceAsset => {
                sqlx::query_as(
                    "SELECT a.organization_id,a.project_id,c.asset_id AS id,''::text AS discriminator,NULL::uuid AS key_id,c.ciphertext \
                     FROM workspace_asset_library_content c \
                     JOIN workspace_asset_library a ON a.id=c.asset_id \
                     WHERE ($1::uuid IS NULL OR c.asset_id>$1) \
                     ORDER BY c.asset_id LIMIT 8",
                )
                .bind(id)
                .fetch_all(&self.pool)
                .await?
            }
            EncryptedContentDomain::AssetListing => {
                sqlx::query_as(
                    "SELECT i.organization_id,i.project_id,c.listing_id AS id,''::text AS discriminator,NULL::uuid AS key_id,c.ciphertext \
                     FROM asset_listing_results c \
                     JOIN asset_listing_claims r ON r.id=c.listing_id \
                     JOIN asset_group_create_intents i ON i.id=r.intent_id \
                     WHERE c.ciphertext IS NOT NULL AND ($1::uuid IS NULL OR c.listing_id>$1) \
                     ORDER BY c.listing_id LIMIT 64",
                )
                .bind(id)
                .fetch_all(&self.pool)
                .await?
            }
            EncryptedContentDomain::AssetLookup => {
                sqlx::query_as(
                    "SELECT i.organization_id,i.project_id,c.lookup_id AS id,''::text AS discriminator,NULL::uuid AS key_id,c.ciphertext \
                     FROM asset_lookup_results c \
                     JOIN asset_lookup_claims r ON r.id=c.lookup_id \
                     JOIN asset_listing_claims l ON l.id=r.listing_id \
                     JOIN asset_group_create_intents i ON i.id=l.intent_id \
                     WHERE c.ciphertext IS NOT NULL AND ($1::uuid IS NULL OR c.lookup_id>$1) \
                     ORDER BY c.lookup_id LIMIT 64",
                )
                .bind(id)
                .fetch_all(&self.pool)
                .await?
            }
            EncryptedContentDomain::AssetRead => {
                sqlx::query_as(
                    "SELECT i.organization_id,i.project_id,c.read_id AS id,''::text AS discriminator,NULL::uuid AS key_id,c.ciphertext \
                     FROM asset_group_read_results c \
                     JOIN asset_group_read_claims r ON r.id=c.read_id \
                     JOIN asset_group_create_intents i ON i.id=r.intent_id \
                     WHERE c.ciphertext IS NOT NULL AND ($1::uuid IS NULL OR c.read_id>$1) \
                     ORDER BY c.read_id LIMIT 64",
                )
                .bind(id)
                .fetch_all(&self.pool)
                .await?
            }
            EncryptedContentDomain::AssetPatch => {
                sqlx::query_as(
                    "SELECT i.organization_id,i.project_id,c.update_id AS id,''::text AS discriminator,NULL::uuid AS key_id,c.ciphertext \
                     FROM asset_group_update_patches c \
                     JOIN asset_group_update_intents u ON u.id=c.update_id \
                     JOIN asset_group_create_intents i ON i.id=u.intent_id \
                     WHERE c.ciphertext IS NOT NULL AND ($1::uuid IS NULL OR c.update_id>$1) \
                     ORDER BY c.update_id LIMIT 64",
                )
                .bind(id)
                .fetch_all(&self.pool)
                .await?
            }
            EncryptedContentDomain::InspectedImage => {
                sqlx::query_as(
                    "SELECT i.organization_id,i.project_id,c.source_id AS id,''::text AS discriminator,i.key_id,c.ciphertext \
                     FROM inspected_image_source_content c \
                     JOIN inspected_image_sources i ON i.id=c.source_id \
                     WHERE ($1::uuid IS NULL OR c.source_id>$1) \
                     ORDER BY c.source_id LIMIT 8",
                )
                .bind(id)
                .fetch_all(&self.pool)
                .await?
            }
        };
        Ok(rows
            .into_iter()
            .map(
                |(organization_id, project_id, id, discriminator, key_id, ciphertext)| {
                    EncryptedContent {
                        scope: TenantScope {
                            organization_id,
                            project_id,
                        },
                        id,
                        discriminator,
                        key_id,
                        ciphertext,
                    }
                },
            )
            .collect())
    }
}
