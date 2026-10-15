//! Atomic short-lived image authorization and immutable video dispatch metadata.
use crate::{
    GuardrailSnapshot, IngestedImageReference, IngestedImageReuse, IngestedImageRoute, Principal,
    Store, StoreError,
};
use niu_media::{ValidatedVideoRequest, image_detector::Runtime};
use uuid::Uuid;

pub struct IngestedVideoImage<'a> {
    pub position: usize,
    pub input: &'a IngestedImageReuse,
    pub reference: &'a IngestedImageReference,
}
/// Internal transport request and bindings; never accept this from a client.
pub struct IngestedVideoDispatch<'a> {
    pub snapshot: &'a GuardrailSnapshot,
    pub route: &'a IngestedImageRoute<'a>,
    pub detectors: &'a [(&'a str, &'a Runtime)],
    pub request: &'a ValidatedVideoRequest,
    pub images: &'a [IngestedVideoImage<'a>],
}
impl Store {
    /// No upstream request occurs under these bounded transaction locks.
    /// A failed/ambiguous commit must not be retried as a fresh submission.
    pub async fn mark_ingested_video_dispatched(
        &self,
        principal: &Principal,
        attempt: Uuid,
        dispatch: IngestedVideoDispatch<'_>,
    ) -> Result<(), StoreError> {
        let content = dispatch.request.body()["content"]
            .as_array()
            .ok_or(StoreError::InvalidObservation)?;
        if dispatch.images.is_empty() || dispatch.images.len() > 32 || content.len() > 32 {
            return Err(StoreError::InvalidObservation);
        }
        let mut positions = std::collections::BTreeSet::new();
        for image in dispatch.images {
            if !positions.insert(image.position)
                || content.get(image.position).is_none_or(|item| {
                    item["type"] != "image_url"
                        || item["image_url"]["url"].as_str() != Some(image.reference.private_uri())
                })
            {
                return Err(StoreError::InvalidObservation);
            }
        }
        if content
            .iter()
            .enumerate()
            .any(|(position, item)| item["type"] != "text" && !positions.contains(&position))
            || dispatch.request.model_alias() != dispatch.route.model_alias
        {
            return Err(StoreError::InvalidObservation);
        }
        let body_sha256 = dispatch.request.body_sha256();
        let scope = principal.scope();
        let mut tx = self.begin_bounded_recording().await?;
        // A deterministic order keeps multiple source/group locks consistent.
        let mut images: Vec<_> = dispatch.images.iter().collect();
        images.sort_by_key(|image| (image.reference.source_id(), image.input.ingestion_id));
        let revalidation_items: Vec<_> = images
            .iter()
            .map(|image| (image.input, image.reference))
            .collect();
        Self::revalidate_ingested_image_references_using(
            &mut tx,
            principal,
            dispatch.snapshot,
            dispatch.route,
            dispatch.detectors,
            &revalidation_items,
        )
        .await?;
        let positions: Vec<i32> = images.iter().map(|image| image.position as i32).collect();
        let ingestion_ids: Vec<Uuid> = images
            .iter()
            .map(|image| image.input.ingestion_id)
            .collect();
        let readiness_ids: Vec<Uuid> = images
            .iter()
            .map(|image| image.input.readiness_id)
            .collect();
        let binding_hashes: Vec<&str> = images
            .iter()
            .map(|image| image.reference.binding_sha256())
            .collect();
        let expires_at_ms: Vec<i64> = images
            .iter()
            .map(|image| image.reference.expires_at_ms())
            .collect();
        sqlx::query(
            "INSERT INTO ingested_video_request_bindings(\
                organization_id,project_id,key_id,attempt_id,\
                content_position,ingestion_id,readiness_id,\
                body_sha256,binding_sha256,schema_revision,expires_at_ms\
             ) \
             SELECT $1,$2,$3,$4,u.content_position,u.ingestion_id,u.readiness_id,$5,u.binding_sha256,$6,u.expires_at_ms \
             FROM UNNEST($7::int4[],$8::uuid[],$9::uuid[],$10::text[],$11::int8[]) \
               AS u(content_position,ingestion_id,readiness_id,binding_sha256,expires_at_ms)",
        )
        .bind(scope.organization_id)
        .bind(scope.project_id)
        .bind(principal.key_id())
        .bind(attempt)
        .bind(body_sha256)
        .bind(dispatch.request.schema_revision())
        .bind(&positions)
        .bind(&ingestion_ids)
        .bind(&readiness_ids)
        .bind(&binding_hashes)
        .bind(&expires_at_ms)
        .execute(&mut *tx)
        .await?;
        if !Self::mark_dispatched_using(&mut tx, principal, attempt).await? {
            return Err(StoreError::Conflict);
        }
        tx.commit().await?;
        Ok(())
    }
}
