//! Scoped company-directory traversal without name-dependent cursors.
use crate::{NamedResource, Store, StoreError};
use uuid::Uuid;

impl Store {
    pub async fn organization_page(
        &self,
        organization: Option<Uuid>,
        after: Option<Uuid>,
        limit: i64,
    ) -> Result<Vec<NamedResource>, StoreError> {
        if !(1..=1001).contains(&limit) {
            return Err(StoreError::Conflict);
        }
        let cursor: Option<(String, Uuid)> = if let Some(after) = after {
            Some(sqlx::query_as("SELECT created_at::text,id FROM organizations WHERE id=$1 AND ($2::uuid IS NULL OR id=$2)")
                .bind(after).bind(organization).fetch_optional(&self.pool).await?
                .ok_or(StoreError::Conflict)?)
        } else {
            None
        };
        Ok(sqlx::query_as(
            "SELECT id,name FROM organizations \
             WHERE ($1::uuid IS NULL OR id=$1) \
             AND ($2::text IS NULL OR (created_at,id)>($2::text::timestamptz,$3::uuid)) \
             ORDER BY created_at,id LIMIT $4",
        )
        .bind(organization)
        .bind(cursor.as_ref().map(|c| &c.0))
        .bind(cursor.as_ref().map(|c| c.1))
        .bind(limit)
        .fetch_all(&self.pool)
        .await?)
    }
}
