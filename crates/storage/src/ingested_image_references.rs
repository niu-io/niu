//! Short-lived ordinary-image reuse, never a durable library or portrait grant.
//! A discovery result is private. Dispatch must atomically revalidate it while
//! recording the attempt; this module never submits upstream work.
use crate::{GuardrailSnapshot, Principal, Store, StoreError};
use niu_media::image_detector::{Consent, Runtime};
use sha2::{Digest, Sha256};
use sqlx::{PgConnection, Row};
use uuid::Uuid;

/// Explicit consent applies only to this request, not a saved perpetual grant.
pub struct IngestedImageReuse {
    pub ingestion_id: Uuid,
    pub readiness_id: Uuid,
    pub consent_to_reuse: bool,
}
/// Derived by the Gateway from its selected route, never trusted client fields.
pub struct IngestedImageRoute<'a> {
    pub vendor_id: Uuid,
    pub vendor_revision: i64,
    pub model_alias: &'a str,
    pub model_revision: i64,
    pub channel: &'a str,
}
/// Safe distinctions do not disclose whether another workspace owns an asset.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum IngestedImageReferenceUnavailable {
    ConsentRequired,
    UnsupportedChannel,
    BindingUnavailable,
}
pub enum IngestedImageReferenceResolution {
    Available(IngestedImageReference),
    Unavailable(IngestedImageReferenceUnavailable),
}
/// No Debug/Serialize: upstream identity and binding hashes are internal only.
pub struct IngestedImageReference {
    uri: String,
    source_id: Uuid,
    group_intent_id: Uuid,
    approval_ids: Vec<Uuid>,
    ingestion_id: Uuid,
    readiness_id: Uuid,
    vendor_id: Uuid,
    binding_sha256: String,
    expires_at_ms: i64,
}
impl IngestedImageReference {
    pub fn private_uri(&self) -> &str {
        &self.uri
    }
    pub fn binding_sha256(&self) -> &str {
        &self.binding_sha256
    }
    pub fn expires_at_ms(&self) -> i64 {
        self.expires_at_ms
    }
    pub fn source_id(&self) -> Uuid {
        self.source_id
    }
    pub fn approval_ids(&self) -> &[Uuid] {
        &self.approval_ids
    }
    pub fn ingestion_id(&self) -> Uuid {
        self.ingestion_id
    }
    pub fn readiness_id(&self) -> Uuid {
        self.readiness_id
    }
}

// Exact accepted image, original group/account and separately authorized Active
// observation. All consent/qualification deadlines remain restrictive; source
// erasure never becomes an implicit permission to keep using the upstream copy.
const RESOLVE: &str = r#"
SELECT s.id AS source_id, i.id AS group_intent_id, o.upstream_asset_id, v.adapter, i.request_body, i.upstream_project,
       (floor(EXTRACT(EPOCH FROM LEAST(d.expires_at,s.expires_at,a.expires_at,g.expires_at,group_grant.expires_at,k.expires_at,i.request_expires_at))*1000))::bigint AS expires_at_ms,
       s.content_sha256,
       jsonb_build_object('source',s.id,'ingestion',d.id,'readiness',r.id,
          'vendor',v.id,'vendor_revision',v.revision,'model',m.alias,'model_revision',m.revision,
          'credential_revision',c.revision,'project',i.upstream_project,'group',i.upstream_group_id,
          'creation_grant',a.id,'read_grant',g.id,'group_grant',group_grant.id,'approval',s.approval_id,
          'workspace_revision',p.workspace_revision,'key_revision',p.key_policy_revision,
          'assignment_revision',p.key_assignment_revision,'asset',o.upstream_asset_id,
          'deadline',(floor(EXTRACT(EPOCH FROM LEAST(d.expires_at,s.expires_at,a.expires_at,g.expires_at,group_grant.expires_at,k.expires_at,i.request_expires_at))*1000))::bigint
       )::text AS binding
FROM asset_image_ingestion_consents d
JOIN inspected_image_sources s ON s.id=d.source_id
JOIN inspected_image_source_content content ON content.source_id=s.id
JOIN api_keys k ON k.id=s.key_id AND k.organization_id=s.organization_id AND k.project_id=s.project_id
JOIN image_processing_approvals p ON p.id=s.approval_id
JOIN asset_group_create_intents i ON i.id=d.group_intent_id AND i.organization_id=s.organization_id AND i.project_id=s.project_id
JOIN asset_group_dispatch_authorizations group_dispatch ON group_dispatch.intent_id=i.id
JOIN asset_operation_authorizations group_grant ON group_grant.id=group_dispatch.authorization_id AND group_grant.operation='CreateAssetGroup'
JOIN asset_image_ingestion_outcomes o ON o.consent_id=d.id AND o.outcome='accepted'
JOIN asset_operation_authorizations a ON a.id=d.authorization_id AND a.operation='CreateAsset'
JOIN ingested_image_readiness_claims r ON r.id=$2 AND r.consent_id=d.id
JOIN ingested_image_readiness_outcomes ready ON ready.read_id=r.id AND ready.asset_status='Active' AND ready.reason IS NULL
JOIN asset_operation_authorizations g ON g.id=r.authorization_id AND g.operation='GetAsset'
JOIN vendors v ON v.id=i.vendor_id AND v.revision=i.vendor_revision AND v.enabled AND v.credential_ciphertext IS NOT NULL
JOIN vendor_asset_management_credentials c ON c.vendor_id=i.vendor_id AND c.revision=i.credential_revision AND c.upstream_project=i.upstream_project
JOIN vendor_models m ON m.vendor_id=v.id AND m.alias=$6 AND m.enabled AND m.revision=$8
WHERE d.id=$1 AND s.organization_id=$3 AND s.project_id=$4 AND s.key_id=$5
 AND v.id=$7 AND v.revision=$9
 AND k.revoked_at IS NULL AND k.expires_at>clock_timestamp()
 AND ($6=ANY(k.allowed_models) OR '*'=ANY(k.allowed_models))
 AND m.capabilities->'video_schema'->>'channel'='ark-direct-v1'
 AND m.capabilities->'video_schema'->>'model_alias'=m.alias
 AND m.capabilities->'video_schema'->>'upstream_model'=m.upstream_model
 AND d.confirm_ingestion AND d.expires_at>clock_timestamp() AND s.expires_at>clock_timestamp()
 AND c.credential_ciphertext IS NOT NULL AND i.state='succeeded' AND i.upstream_group_id IS NOT NULL
 AND i.request_body IS NOT NULL AND i.request_expires_at>clock_timestamp()
 AND i.request_body->>'GroupType'='AIGC' AND i.request_body->>'ProjectName'=i.upstream_project
 AND group_grant.organization_id=i.organization_id AND group_grant.project_id=i.project_id AND group_grant.vendor_id=i.vendor_id
 AND group_grant.vendor_revision=i.vendor_revision AND group_grant.credential_revision=i.credential_revision AND group_grant.expires_at>clock_timestamp()
 AND a.organization_id=i.organization_id AND a.project_id=i.project_id AND a.vendor_id=i.vendor_id
 AND a.vendor_revision=i.vendor_revision AND a.credential_revision=i.credential_revision AND a.expires_at>clock_timestamp()
 AND g.organization_id=i.organization_id AND g.project_id=i.project_id AND g.vendor_id=i.vendor_id
 AND g.vendor_revision=i.vendor_revision AND g.credential_revision=i.credential_revision AND g.expires_at>clock_timestamp()
 AND p.organization_id=s.organization_id AND p.project_id=s.project_id AND p.key_id=s.key_id
 AND p.content_sha256=s.content_sha256
 AND p.workspace_revision IS NOT DISTINCT FROM $10 AND p.key_policy_revision IS NOT DISTINCT FROM $11
 AND p.key_assignment_revision IS NOT DISTINCT FROM $12
 AND EXISTS(SELECT 1 FROM inspected_image_source_approvals proof WHERE proof.source_id=s.id AND proof.approval_id=s.approval_id)
 AND NOT EXISTS(SELECT 1 FROM inspected_image_source_erasures e WHERE e.source_id=s.id)
 AND NOT EXISTS(SELECT 1 FROM asset_image_ingestion_consent_revocations revoked WHERE revoked.consent_id=d.id)
 AND NOT EXISTS(SELECT 1 FROM asset_operation_authorization_revocations revoked WHERE revoked.authorization_id IN (a.id,g.id,group_grant.id))
 AND NOT EXISTS(SELECT 1 FROM vendor_asset_management_revocations revoked WHERE revoked.vendor_id=i.vendor_id AND revoked.through_revision>=i.credential_revision)
 AND NOT EXISTS(SELECT 1 FROM asset_group_deletion_claims deletion JOIN asset_group_create_intents original ON original.id=deletion.intent_id
                WHERE original.vendor_id=i.vendor_id AND original.credential_revision=i.credential_revision
                 AND original.upstream_project=i.upstream_project AND original.upstream_group_id=i.upstream_group_id)
 AND NOT EXISTS(SELECT 1 FROM ingested_image_readiness_claims newer WHERE newer.consent_id=d.id
                AND (newer.created_at,newer.id)>(r.created_at,r.id))
"#;

impl Store {
    /// Bounded discovery snapshot. The private result is not dispatch authority.
    pub async fn resolve_ingested_image_reference(
        &self,
        principal: &Principal,
        snapshot: &GuardrailSnapshot,
        input: &IngestedImageReuse,
        route: &IngestedImageRoute<'_>,
        detectors: &[(&str, &Runtime)],
    ) -> Result<IngestedImageReferenceResolution, StoreError> {
        let mut tx = self.begin_bounded_read_snapshot().await?;
        let result = Self::resolve_ingested_image_reference_using(
            &mut tx, principal, snapshot, input, route, detectors,
        )
        .await?;
        tx.commit().await?;
        Ok(result)
    }

    /// Called INSIDE the bounded writable transaction which claims the video
    /// dispatch. Coordination locks are retained until that claim commits or
    /// rolls back. Do not call this on a pool connection outside a transaction.
    /// No network I/O may occur while this transaction remains open.
    pub async fn revalidate_ingested_image_reference_using(
        connection: &mut PgConnection,
        principal: &Principal,
        snapshot: &GuardrailSnapshot,
        input: &IngestedImageReuse,
        route: &IngestedImageRoute<'_>,
        detectors: &[(&str, &Runtime)],
        reference: &IngestedImageReference,
    ) -> Result<(), StoreError> {
        if reference.ingestion_id != input.ingestion_id
            || reference.readiness_id != input.readiness_id
            || reference.vendor_id != route.vendor_id
        {
            return Err(StoreError::Conflict);
        }
        let scope = principal.scope();
        sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended('niu-guardrails:'||$1::text||':'||$2::text,0))")
            .bind(scope.organization_id).bind(scope.project_id).execute(&mut *connection).await?;
        sqlx::query("SELECT id FROM api_keys WHERE id=$1 FOR SHARE")
            .bind(principal.key_id())
            .execute(&mut *connection)
            .await?;
        sqlx::query("SELECT id FROM vendors WHERE id=$1 FOR SHARE")
            .bind(route.vendor_id)
            .execute(&mut *connection)
            .await?;
        sqlx::query("SELECT alias FROM vendor_models WHERE alias=$1 AND vendor_id=$2 FOR SHARE")
            .bind(route.model_alias)
            .bind(route.vendor_id)
            .execute(&mut *connection)
            .await?;
        sqlx::query("SELECT id FROM asset_image_ingestion_consents WHERE id=$1 FOR SHARE")
            .bind(input.ingestion_id)
            .execute(&mut *connection)
            .await?;
        sqlx::query("SELECT id FROM inspected_image_sources WHERE id=$1 FOR SHARE")
            .bind(reference.source_id)
            .execute(&mut *connection)
            .await?;
        sqlx::query("SELECT id FROM asset_group_create_intents WHERE id=$1 FOR SHARE")
            .bind(reference.group_intent_id)
            .execute(&mut *connection)
            .await?;
        let result = Self::resolve_ingested_image_reference_using(
            connection, principal, snapshot, input, route, detectors,
        )
        .await?;
        match result {
            IngestedImageReferenceResolution::Available(current)
                if current.binding_sha256 == reference.binding_sha256
                    && current.expires_at_ms == reference.expires_at_ms =>
            {
                Ok(())
            }
            _ => Err(StoreError::Conflict),
        }
    }

    async fn resolve_ingested_image_reference_using(
        connection: &mut PgConnection,
        principal: &Principal,
        snapshot: &GuardrailSnapshot,
        input: &IngestedImageReuse,
        route: &IngestedImageRoute<'_>,
        detectors: &[(&str, &Runtime)],
    ) -> Result<IngestedImageReferenceResolution, StoreError> {
        use IngestedImageReferenceResolution::{Available, Unavailable};
        use IngestedImageReferenceUnavailable::*;
        if !input.consent_to_reuse {
            return Ok(Unavailable(ConsentRequired));
        }
        if route.channel != "ark-direct-v1" {
            return Ok(Unavailable(UnsupportedChannel));
        }
        if !principal.allows_model(route.model_alias) {
            return Err(StoreError::Unauthorized);
        }
        let scope = principal.scope();
        let current = Self::guardrail_snapshot_using(&mut *connection, scope, principal.key_id())
            .await?
            .ok_or(StoreError::Unauthorized)?;
        if !crate::image_processing::same_policy(&current, snapshot) {
            return Err(StoreError::Conflict);
        }
        let Some(row) = sqlx::query(RESOLVE)
            .bind(input.ingestion_id)
            .bind(input.readiness_id)
            .bind(scope.organization_id)
            .bind(scope.project_id)
            .bind(principal.key_id())
            .bind(route.model_alias)
            .bind(route.vendor_id)
            .bind(route.model_revision)
            .bind(route.vendor_revision)
            .bind(snapshot.workspace_revision)
            .bind(snapshot.key_policy_revision)
            .bind(snapshot.key_assignment_revision)
            .fetch_optional(&mut *connection)
            .await?
        else {
            return Ok(Unavailable(BindingUnavailable));
        };
        let group_body: serde_json::Value = row.get("request_body");
        if niu_media::asset_group::OrdinaryAssetGroupCreate::from_saved_body(
            &group_body,
            row.get::<&str, _>("upstream_project"),
        )
        .is_err()
        {
            return Ok(Unavailable(BindingUnavailable));
        }
        for policy in [&snapshot.workspace_policy, &snapshot.key_policy]
            .into_iter()
            .flatten()
        {
            for (field, value) in [
                ("models", route.model_alias),
                ("providers", row.get::<&str, _>("adapter")),
            ] {
                let rule = &policy[field];
                let permitted = match rule["mode"].as_str() {
                    Some("inherit" | "allow_all") => true,
                    Some("allow_list") => rule["values"].as_array().is_some_and(|values| {
                        values
                            .iter()
                            .any(|candidate| candidate.as_str() == Some(value))
                    }),
                    _ => false,
                };
                if !permitted {
                    return Ok(Unavailable(BindingUnavailable));
                }
            }
        }
        let source_id: Uuid = row.get("source_id");
        let content_sha256: String = row.get("content_sha256");
        let proofs=sqlx::query("SELECT p.id,p.detector_name,p.configuration_fingerprint,p.detector_revision,p.content_sha256,p.workspace_revision,p.key_policy_revision,p.key_assignment_revision FROM inspected_image_source_approvals proof JOIN image_processing_approvals p ON p.id=proof.approval_id WHERE proof.source_id=$1 AND p.organization_id=$2 AND p.project_id=$3 AND p.key_id=$4 ORDER BY p.detector_name,p.id")
            .bind(source_id).bind(scope.organization_id).bind(scope.project_id).bind(principal.key_id()).fetch_all(&mut *connection).await?;
        let required = crate::image_processing::required_image_detectors(snapshot)?;
        let mut seen = std::collections::BTreeSet::new();
        let mut approval_ids = Vec::with_capacity(proofs.len());
        let mut digest = Sha256::new();
        digest.update(row.get::<String, _>("binding").as_bytes());
        if proofs.is_empty() || proofs.len() > 8 {
            return Ok(Unavailable(BindingUnavailable));
        }
        for proof in proofs {
            let name: String = proof.get("detector_name");
            let fingerprint: String = proof.get("configuration_fingerprint");
            if !seen.insert(name.clone())
                || proof.get::<String, _>("content_sha256") != content_sha256
                || proof.get::<Option<i64>, _>("workspace_revision") != snapshot.workspace_revision
                || proof.get::<Option<i64>, _>("key_policy_revision")
                    != snapshot.key_policy_revision
                || proof.get::<Option<i64>, _>("key_assignment_revision")
                    != snapshot.key_assignment_revision
            {
                return Ok(Unavailable(BindingUnavailable));
            }
            let consent = Consent {
                configuration_fingerprint: fingerprint.clone(),
                consent_to_image_processing: true,
            };
            if !detectors.iter().any(|(n, runtime)| {
                *n == name
                    && runtime.fingerprint() == fingerprint
                    && runtime.permits(&scope.project_id.to_string(), &consent)
            }) || required
                .get(&name)
                .is_some_and(|expected| expected != &fingerprint)
            {
                return Ok(Unavailable(BindingUnavailable));
            }
            approval_ids.push(proof.get::<Uuid, _>("id"));
            digest.update(proof.get::<Uuid, _>("id").as_bytes());
            digest.update(fingerprint.as_bytes());
        }
        if required.keys().any(|name| !seen.contains(name)) {
            return Ok(Unavailable(BindingUnavailable));
        }
        let asset: String = row.get("upstream_asset_id");
        if !asset.starts_with("asset-")
            || asset.len() <= 6
            || asset.len() > 128
            || !asset
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b"_-".contains(&b))
        {
            return Err(StoreError::InvalidObservation);
        }
        Ok(Available(IngestedImageReference {
            uri: format!("asset://{asset}"),
            source_id,
            group_intent_id: row.get("group_intent_id"),
            approval_ids,
            ingestion_id: input.ingestion_id,
            readiness_id: input.readiness_id,
            vendor_id: route.vendor_id,
            binding_sha256: format!("{:x}", digest.finalize()),
            expires_at_ms: row.get("expires_at_ms"),
        }))
    }
}
