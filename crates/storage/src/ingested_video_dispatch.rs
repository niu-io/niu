//! Atomic short-lived image authorization and immutable video dispatch metadata.
use crate::{
    GuardrailSnapshot, IngestedImageReference, IngestedImageReuse, IngestedImageRoute, Principal,
    Store, StoreError,
};
use niu_media::{ValidatedVideoRequest, image_detector::Runtime};
use sha2::{Digest, Sha256};
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
        let body = serde_json::to_vec(dispatch.request.body())
            .map_err(|_| StoreError::InvalidObservation)?;
        let body_sha256 = format!("{:x}", Sha256::digest(&body));
        let scope = principal.scope();
        let mut tx = self.begin_bounded_recording().await?;
        // A deterministic order keeps multiple source/group locks consistent.
        let mut images: Vec<_> = dispatch.images.iter().collect();
        images.sort_by_key(|image| (image.reference.source_id(), image.input.ingestion_id));
        for image in images {
            Self::revalidate_ingested_image_reference_using(
                &mut tx,
                principal,
                dispatch.snapshot,
                image.input,
                dispatch.route,
                dispatch.detectors,
                image.reference,
            )
            .await?;
            sqlx::query("INSERT INTO ingested_video_request_bindings(organization_id,project_id,key_id,attempt_id,content_position,ingestion_id,readiness_id,body_sha256,binding_sha256,schema_revision,expires_at_ms) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)")
                .bind(scope.organization_id).bind(scope.project_id).bind(principal.key_id()).bind(attempt)
                .bind(image.position as i32).bind(image.input.ingestion_id).bind(image.input.readiness_id)
                .bind(&body_sha256).bind(image.reference.binding_sha256())
                .bind(dispatch.request.schema_revision()).bind(image.reference.expires_at_ms())
                .execute(&mut *tx).await?;
        }
        if !Self::mark_dispatched_using(&mut tx, principal, attempt).await? {
            return Err(StoreError::Conflict);
        }
        tx.commit().await?;
        Ok(())
    }
}
