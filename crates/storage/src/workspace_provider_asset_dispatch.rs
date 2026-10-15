//! Resolve only workspace-owned, acknowledged ACTIVE Provider assets. This is
//! an internal reference and atomic dispatch check, not a new approval system.
use crate::{GuardrailSnapshot, Principal, Store, StoreError, TenantScope, VendorRoute};
use niu_media::ValidatedVideoRequest;
use serde_json::Value;
use sha2::{Digest, Sha256};
use sqlx::Row;
use uuid::Uuid;

/// Constructed only by an authenticated scoped database read. Provider identity
/// and transport URI are deliberately neither Debug nor Serialize.
#[derive(Clone)]
pub struct WorkspaceProviderAssetReference {
    scope: TenantScope,
    asset_id: Uuid,
    group_id: Uuid,
    kind: String,
    uri: String,
    asset_revision: i64,
    group_revision: i64,
    birth_model_revision: i64,
    route_sha256: [u8; 32],
    registry_generation: i64,
}
impl WorkspaceProviderAssetReference {
    pub fn asset_id(&self) -> Uuid {
        self.asset_id
    }
    pub fn kind(&self) -> &str {
        &self.kind
    }
    pub fn private_uri(&self) -> &str {
        &self.uri
    }
    pub fn asset_revision(&self) -> i64 {
        self.asset_revision
    }
    pub fn birth_model_revision(&self) -> i64 {
        self.birth_model_revision
    }
    pub fn group_revision(&self) -> i64 {
        self.group_revision
    }
}
pub struct WorkspaceProviderAssetVideoReference<'a> {
    pub position: usize,
    pub reference: &'a WorkspaceProviderAssetReference,
}
pub struct WorkspaceProviderAssetVideoDispatch<'a> {
    pub snapshot: &'a GuardrailSnapshot,
    pub route: &'a VendorRoute,
    pub request: &'a ValidatedVideoRequest,
    pub assets: &'a [WorkspaceProviderAssetVideoReference<'a>],
}
fn route_digest(route: &VendorRoute) -> Result<[u8; 32], StoreError> {
    let mut digest = Sha256::new();
    digest.update(
        serde_json::to_vec(&serde_json::json!({
            "vendor":route.vendor.id,"vendor_revision":route.vendor.revision,
            "adapter":route.vendor.adapter,"api_base":route.vendor.api_base,
            "vendor_enabled":route.vendor.enabled,"model":route.model.alias,
            "model_vendor":route.model.vendor_id,"model_revision":route.model.revision,
            "model_enabled":route.model.enabled,"upstream_model":route.model.upstream_model,
            "capabilities":route.model.capabilities,"pricing":route.model.pricing,
            "owner":route.personal_organization_id,
        }))
        .map_err(|_| StoreError::InvalidObservation)?,
    );
    digest.update(&route.credential_ciphertext);
    Ok(digest.finalize().into())
}
impl Store {
    async fn provider_asset_dispatch_route_using(
        tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
        p: &Principal,
        route: &VendorRoute,
        snapshot: &GuardrailSnapshot,
    ) -> Result<i64, StoreError> {
        // Existing publication writers take this lock before workspace policy,
        // key and route locks. Never hold these locks across Provider I/O.
        let scope = p.scope();
        sqlx::query(
            "SELECT pg_advisory_xact_lock_shared(716554), \
                    pg_advisory_xact_lock(hashtextextended('niu-guardrails:'||$1::text||':'||$2::text,0))",
        )
        .bind(scope.organization_id)
        .bind(scope.project_id)
        .execute(&mut **tx)
        .await?;
        Self::provider_asset_key_using(tx, p, &route.model.alias, true).await?;
        let current = Self::guardrail_snapshot_using(&mut **tx, scope, p.key_id())
            .await?
            .ok_or(StoreError::Unauthorized)?;
        if !crate::image_processing::same_policy(&current, snapshot) {
            return Err(StoreError::Conflict);
        }
        if !route.vendor.enabled
            || !route.model.enabled
            || route.model.vendor_id != route.vendor.id
            || route.credential_ciphertext.is_empty()
        {
            return Err(StoreError::Conflict);
        }
        let row=sqlx::query("SELECT v.revision AS vendor_revision,v.adapter,v.api_base,v.credential_ciphertext,m.revision AS model_revision,m.upstream_model,m.capabilities,m.pricing,own.organization_id AS personal_owner FROM vendor_models m JOIN vendors v ON v.id=m.vendor_id LEFT JOIN personal_vendor_ownership own ON own.vendor_id=v.id WHERE m.alias=$1 AND v.id=$2 AND v.enabled AND m.enabled AND v.credential_ciphertext IS NOT NULL AND m.capabilities#>>'{provider_assets,channel}'='fastrouter-actions-v1' AND (own.organization_id=$3 OR (own.organization_id IS NULL AND niu_supplier_model_route_available(m.alias))) FOR SHARE OF v,m")
            .bind(&route.model.alias).bind(route.vendor.id).bind(scope.organization_id).fetch_optional(&mut **tx).await?.ok_or(StoreError::Conflict)?;
        if row.get::<i64, _>("vendor_revision") != route.vendor.revision
            || row.get::<i64, _>("model_revision") != route.model.revision
            || row.get::<String, _>("adapter") != route.vendor.adapter
            || row.get::<String, _>("api_base") != route.vendor.api_base
            || row.get::<String, _>("upstream_model") != route.model.upstream_model
            || row.get::<Vec<u8>, _>("credential_ciphertext") != route.credential_ciphertext
            || row.get::<Value, _>("capabilities") != route.model.capabilities
            || row.get::<Option<Value>, _>("pricing") != route.model.pricing
            || row.get::<Option<Uuid>, _>("personal_owner") != route.personal_organization_id
        {
            return Err(StoreError::Conflict);
        }
        sqlx::query_scalar("SELECT generation FROM routing_registry_active WHERE singleton")
            .fetch_optional(&mut **tx)
            .await?
            .ok_or(StoreError::Conflict)
    }

    async fn provider_asset_references_using(
        tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
        p: &Principal,
        route: &VendorRoute,
        route_sha256: [u8; 32],
        asset_ids: &[Uuid],
        generation: i64,
    ) -> Result<std::collections::BTreeMap<Uuid, WorkspaceProviderAssetReference>, StoreError> {
        let mut unique_ids = asset_ids.to_vec();
        unique_ids.sort_unstable();
        unique_ids.dedup();
        if unique_ids.is_empty() {
            return Ok(std::collections::BTreeMap::new());
        }
        let scope = p.scope();
        let rows = sqlx::query(
            "SELECT a.id AS asset_id,a.group_id,a.kind,a.provider_ref,g.provider_ref AS group_provider_ref,\
                    a.revision AS asset_revision,g.revision AS group_revision,g.vendor_id,g.vendor_revision,\
                    g.model_revision,g.upstream_model,g.model_alias \
             FROM workspace_provider_assets a \
             JOIN workspace_provider_asset_groups g \
               ON g.id=a.group_id AND g.organization_id=a.organization_id AND g.project_id=a.project_id \
             WHERE a.organization_id=$1 AND a.project_id=$2 AND a.id=ANY($3) \
               AND a.status='active' AND a.provider_ref IS NOT NULL \
               AND g.status='ready' AND g.provider_ref IS NOT NULL \
               AND EXISTS(SELECT 1 FROM workspace_provider_asset_operations o \
                          WHERE o.organization_id=a.organization_id AND o.project_id=a.project_id \
                            AND o.group_id=g.id AND o.asset_id=a.id \
                            AND o.action='create_asset' AND o.status='acknowledged') \
               AND NOT EXISTS(SELECT 1 FROM workspace_provider_asset_operations pending \
                              WHERE pending.organization_id=a.organization_id AND pending.project_id=a.project_id \
                                AND pending.group_id=g.id AND (pending.asset_id IS NULL OR pending.asset_id=a.id) \
                                AND pending.status IN ('prepared','unknown')) \
             ORDER BY a.group_id,a.id \
             FOR SHARE OF g,a",
        )
        .bind(scope.organization_id)
        .bind(scope.project_id)
        .bind(&unique_ids)
        .fetch_all(&mut **tx)
        .await?;
        if rows.len() != unique_ids.len() {
            return Err(StoreError::Conflict);
        }
        let mut group_ids: Vec<Uuid> = Vec::with_capacity(rows.len());
        let mut result = std::collections::BTreeMap::new();
        for row in rows {
            if row.get::<Uuid, _>("vendor_id") != route.vendor.id
                || row.get::<i64, _>("vendor_revision") != route.vendor.revision
                || row.get::<String, _>("model_alias") != route.model.alias
                || row.get::<String, _>("upstream_model") != route.model.upstream_model
            {
                return Err(StoreError::Conflict);
            }
            niu_media::fastrouter_domain::FastRouterProviderReference::parse(
                &row.get::<String, _>("group_provider_ref"),
            )
            .map_err(|_| StoreError::InvalidObservation)?;
            let reference = row.get::<String, _>("provider_ref");
            niu_media::fastrouter_domain::FastRouterProviderReference::parse(&reference)
                .map_err(|_| StoreError::InvalidObservation)?;
            let kind: String = row.get("kind");
            if !matches!(kind.as_str(), "image" | "video" | "audio") {
                return Err(StoreError::InvalidObservation);
            }
            let asset_id: Uuid = row.get("asset_id");
            let group_id: Uuid = row.get("group_id");
            group_ids.push(group_id);
            result.insert(
                asset_id,
                WorkspaceProviderAssetReference {
                    scope,
                    asset_id,
                    group_id,
                    kind,
                    uri: format!("asset://{reference}"),
                    asset_revision: row.get("asset_revision"),
                    group_revision: row.get("group_revision"),
                    birth_model_revision: row.get("model_revision"),
                    route_sha256,
                    registry_generation: generation,
                },
            );
        }
        group_ids.sort_unstable();
        group_ids.dedup();
        // A prepared mutation may have committed while the row locks waited
        // without changing the locked tuple. Recheck it with a fresh statement
        // snapshot after the group/asset locks are held.
        let pending: bool = sqlx::query_scalar(
            "SELECT EXISTS(SELECT 1 FROM workspace_provider_asset_operations \
             WHERE organization_id=$1 AND project_id=$2 AND group_id=ANY($3) \
               AND (asset_id IS NULL OR asset_id=ANY($4)) \
               AND status IN ('prepared','unknown'))",
        )
        .bind(scope.organization_id)
        .bind(scope.project_id)
        .bind(&group_ids)
        .bind(&unique_ids)
        .fetch_one(&mut **tx)
        .await?;
        if pending {
            return Err(StoreError::Conflict);
        }
        Ok(result)
    }

    /// Caller first admits the selected published model and its declared input
    /// contract. This read does not create a job, reserve balance or call upstream.
    pub async fn resolve_workspace_provider_asset_references(
        &self,
        p: &Principal,
        route: &VendorRoute,
        snapshot: &GuardrailSnapshot,
        asset_ids: &[Uuid],
    ) -> Result<std::collections::BTreeMap<Uuid, WorkspaceProviderAssetReference>, StoreError> {
        if asset_ids.is_empty() {
            return Ok(std::collections::BTreeMap::new());
        }
        let route_sha256 = route_digest(route)?;
        let mut tx = self.begin_bounded_recording().await?;
        let generation =
            Self::provider_asset_dispatch_route_using(&mut tx, p, route, snapshot).await?;
        let map = Self::provider_asset_references_using(
            &mut tx,
            p,
            route,
            route_sha256,
            asset_ids,
            generation,
        )
        .await?;
        tx.commit().await?;
        Ok(map)
    }

    pub async fn resolve_workspace_provider_asset_reference(
        &self,
        p: &Principal,
        route: &VendorRoute,
        snapshot: &GuardrailSnapshot,
        asset_id: Uuid,
    ) -> Result<WorkspaceProviderAssetReference, StoreError> {
        let mut map = self
            .resolve_workspace_provider_asset_references(p, route, snapshot, &[asset_id])
            .await?;
        map.remove(&asset_id).ok_or(StoreError::Conflict)
    }

    /// Recheck exact saved input identity and current route/key/policy together
    /// with the existing funded dispatch claim. Mixed inspected/library inputs
    /// require their existing composite dispatch path. Ordinary public HTTPS
    /// inputs retain the selected schema validation; every private asset URI
    /// must match a scoped reference above. The caller enforces image policy.
    pub async fn mark_workspace_provider_assets_video_dispatched(
        &self,
        p: &Principal,
        attempt: Uuid,
        dispatch: WorkspaceProviderAssetVideoDispatch<'_>,
    ) -> Result<(), StoreError> {
        let content = dispatch.request.body()["content"]
            .as_array()
            .ok_or(StoreError::InvalidObservation)?;
        if dispatch.assets.is_empty()
            || dispatch.assets.len() > 32
            || content.len() > 32
            || dispatch.request.model_alias() != dispatch.route.model.alias
        {
            return Err(StoreError::InvalidObservation);
        }
        let expected_route_sha256 = route_digest(dispatch.route)?;
        let mut positions = std::collections::BTreeSet::new();
        for asset in dispatch.assets {
            if !positions.insert(asset.position) {
                return Err(StoreError::InvalidObservation);
            }
            let reference = asset.reference;
            let item = content
                .get(asset.position)
                .ok_or(StoreError::InvalidObservation)?;
            let key = match reference.kind.as_str() {
                "image" => "image_url",
                "video" => "video_url",
                "audio" => "audio_url",
                _ => return Err(StoreError::InvalidObservation),
            };
            if item["type"] != key
                || item[key]["url"].as_str() != Some(reference.private_uri())
                || reference.scope.organization_id != p.scope().organization_id
                || reference.scope.project_id != p.scope().project_id
                || reference.route_sha256 != expected_route_sha256
            {
                return Err(StoreError::InvalidObservation);
            }
        }
        if content.iter().enumerate().any(|(position, item)| {
            if item["type"] == "text" || positions.contains(&position) {
                return false;
            }
            let Some(kind) = item["type"].as_str() else {
                return true;
            };
            !matches!(kind, "image_url" | "video_url" | "audio_url")
                || !item[kind]["url"]
                    .as_str()
                    .is_some_and(|url| url.starts_with("https://"))
        }) {
            return Err(StoreError::InvalidObservation);
        }
        let mut tx = self.begin_bounded_recording().await?;
        let generation = Self::provider_asset_dispatch_route_using(
            &mut tx,
            p,
            dispatch.route,
            dispatch.snapshot,
        )
        .await?;
        let scope = p.scope();
        // Pin the creator through the saved inspection binding. Fresh attempts acquire
        // api_key_id only when mark_dispatched_using atomically commits dispatch.
        let bound:bool=sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM attempts a JOIN media_recovery_routes r ON r.attempt_id=a.id JOIN attempt_route_generations publication ON publication.attempt_id=a.id JOIN inspected_guardrail_bindings inspection ON inspection.attempt_id=a.id AND inspection.organization_id=a.organization_id AND inspection.project_id=a.project_id WHERE a.id=$1 AND a.organization_id=$2 AND a.project_id=$3 AND inspection.key_id=$4 AND a.execution='not_sent' AND a.dispatched_at IS NULL AND (a.api_key_id IS NULL OR a.api_key_id=$4) AND a.resource_id=$5 AND r.organization_id=a.organization_id AND r.project_id=a.project_id AND r.vendor_id=$6 AND r.vendor_revision=$7 AND r.model_revision=$8 AND r.upstream_model=$9 AND r.adapter=$10 AND r.api_base=$11 AND r.schema_revision=$12 AND publication.generation=$13)")
            .bind(attempt).bind(scope.organization_id).bind(scope.project_id).bind(p.key_id()).bind(&dispatch.route.model.alias).bind(dispatch.route.vendor.id).bind(dispatch.route.vendor.revision).bind(dispatch.route.model.revision).bind(&dispatch.route.model.upstream_model).bind(&dispatch.route.vendor.adapter).bind(&dispatch.route.vendor.api_base).bind(dispatch.request.schema_revision()).bind(generation).fetch_one(&mut *tx).await?;
        if !bound {
            return Err(StoreError::Conflict);
        }
        let mut assets: Vec<_> = dispatch.assets.iter().collect();
        assets.sort_by_key(|v| (v.reference.group_id, v.reference.asset_id, v.position));
        let asset_ids: Vec<Uuid> = assets.iter().map(|v| v.reference.asset_id).collect();
        let live_by_id = Self::provider_asset_references_using(
            &mut tx,
            p,
            dispatch.route,
            expected_route_sha256,
            &asset_ids,
            generation,
        )
        .await?;
        for asset in assets {
            let expected = asset.reference;
            let live = live_by_id
                .get(&expected.asset_id)
                .ok_or(StoreError::Conflict)?;
            if live.group_id != expected.group_id
                || live.kind != expected.kind
                || live.uri != expected.uri
                || live.asset_revision != expected.asset_revision
                || live.group_revision != expected.group_revision
                || live.birth_model_revision != expected.birth_model_revision
                || live.registry_generation != expected.registry_generation
            {
                return Err(StoreError::Conflict);
            }
        }
        // No network operation occurs until this transaction definitively commits.
        let allowed = Self::mark_dispatched_using(&mut tx, p, attempt).await?;
        tx.commit().await?;
        if allowed {
            Ok(())
        } else {
            Err(StoreError::Conflict)
        }
    }
}
