//! Administrator-reviewed, expiring ordinary asset-operation qualifications.
//! Callers must enforce platform administration before issuing or revoking grants.
//! Evidence hashes identify reviewed records; they do not prove rights by themselves.
use crate::{OperatorAuditActor, Store, StoreError, TenantScope};
use uuid::Uuid;

pub struct AssetOperationQualification {
    pub vendor_id: Uuid,
    pub vendor_revision: i64,
    pub credential_revision: i64,
    pub rights_sha256: [u8; 32],
    pub protocol_sha256: [u8; 32],
    pub data_handling_sha256: [u8; 32],
    pub free_operation_sha256: [u8; 32],
    pub valid_for_seconds: i32,
}
impl Store {
    /// Qualifies only ordinary AIGC CreateAssetGroup, never liveness or generation.
    pub async fn qualify_asset_group_creation(
        &self,
        scope: TenantScope,
        qualification: AssetOperationQualification,
        actor: OperatorAuditActor,
    ) -> Result<Uuid, StoreError> {
        self.qualify_asset_operation(scope, qualification, actor, "CreateAssetGroup")
            .await
    }

    /// Separate reviewed read grant; creation grants never imply read permission.
    pub async fn qualify_asset_group_read(
        &self,
        scope: TenantScope,
        qualification: AssetOperationQualification,
        actor: OperatorAuditActor,
    ) -> Result<Uuid, StoreError> {
        self.qualify_asset_operation(scope, qualification, actor, "GetAssetGroup")
            .await
    }

    /// Listing has separate rights and never inherits creation or group-read grants.
    pub async fn qualify_asset_listing(
        &self,
        scope: TenantScope,
        qualification: AssetOperationQualification,
        actor: OperatorAuditActor,
    ) -> Result<Uuid, StoreError> {
        self.qualify_asset_operation(scope, qualification, actor, "ListAssets")
            .await
    }

    /// Individual lookup requires its own review; listing grants never imply it.
    pub async fn qualify_asset_lookup(
        &self,
        scope: TenantScope,
        qualification: AssetOperationQualification,
        actor: OperatorAuditActor,
    ) -> Result<Uuid, StoreError> {
        self.qualify_asset_operation(scope, qualification, actor, "GetAsset")
            .await
    }

    /// Metadata writes require their own review; creation and reads never imply it.
    pub async fn qualify_asset_group_update(
        &self,
        scope: TenantScope,
        qualification: AssetOperationQualification,
        actor: OperatorAuditActor,
    ) -> Result<Uuid, StoreError> {
        self.qualify_asset_operation(scope, qualification, actor, "UpdateAssetGroup")
            .await
    }

    /// Separate reviewed cascading-deletion rights. This does not establish
    /// destructive user consent, claim dispatch or release credentials.
    pub async fn qualify_asset_group_deletion(
        &self,
        scope: TenantScope,
        qualification: AssetOperationQualification,
        actor: OperatorAuditActor,
    ) -> Result<Uuid, StoreError> {
        self.qualify_asset_operation(scope, qualification, actor, "DeleteAssetGroup")
            .await
    }

    /// Media ingestion requires separate review, not inherited group rights.
    pub async fn qualify_asset_creation(
        &self,
        scope: TenantScope,
        qualification: AssetOperationQualification,
        actor: OperatorAuditActor,
    ) -> Result<Uuid, StoreError> {
        self.qualify_asset_operation(scope, qualification, actor, "CreateAsset")
            .await
    }

    async fn qualify_asset_operation(
        &self,
        scope: TenantScope,
        qualification: AssetOperationQualification,
        actor: OperatorAuditActor,
        operation: &str,
    ) -> Result<Uuid, StoreError> {
        let q = qualification;
        if q.vendor_revision <= 0
            || q.credential_revision <= 0
            || !(1..=7_776_000).contains(&q.valid_for_seconds)
            || [
                q.rights_sha256,
                q.protocol_sha256,
                q.data_handling_sha256,
                q.free_operation_sha256,
            ]
            .contains(&[0; 32])
        {
            return Err(StoreError::InvalidObservation);
        }
        let mut tx = self.pool.begin().await?;
        // Serialize qualification with account changes and credential revocation.
        let account = sqlx::query_as::<_, (i64, String)>(
            "SELECT revision,api_base FROM vendors WHERE id=$1 FOR UPDATE",
        )
        .bind(q.vendor_id)
        .fetch_optional(&mut *tx)
        .await?;
        let Some((revision, base)) = account else {
            return Err(StoreError::Conflict);
        };
        // Credential setup already validates direct Ark configuration; reject a
        // changed account or any non-Ark account rather than broadening entitlement.
        let direct_ark = base == "https://ark.cn-beijing.volcengineapi.com/api/v3"
            || base == "https://ark.cn-beijing.volcengineapi.com/api/v3/";
        if revision != q.vendor_revision || !direct_ark {
            return Err(StoreError::Conflict);
        }
        let usable: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM vendor_asset_management_credentials c WHERE c.vendor_id=$1 AND c.revision=$2 AND c.credential_ciphertext IS NOT NULL AND NOT EXISTS(SELECT 1 FROM vendor_asset_management_revocations r WHERE r.vendor_id=c.vendor_id AND r.through_revision>=c.revision))")
            .bind(q.vendor_id).bind(q.credential_revision).fetch_one(&mut *tx).await?;
        if !usable {
            return Err(StoreError::Conflict);
        }
        let (kind, actor_id) = actor.kind_and_id();
        let id = Uuid::new_v4();
        sqlx::query("INSERT INTO asset_operation_authorizations(id,organization_id,project_id,vendor_id,vendor_revision,credential_revision,operation,rights_sha256,protocol_sha256,data_handling_sha256,free_operation_sha256,actor_kind,actor_id,created_at,expires_at) VALUES($1,$2,$3,$4,$5,$6,$14,$7,$8,$9,$10,$11,$12,statement_timestamp(),statement_timestamp()+make_interval(secs=>$13))")
            .bind(id).bind(scope.organization_id).bind(scope.project_id).bind(q.vendor_id)
            .bind(q.vendor_revision).bind(q.credential_revision).bind(q.rights_sha256.as_slice())
            .bind(q.protocol_sha256.as_slice()).bind(q.data_handling_sha256.as_slice())
            .bind(q.free_operation_sha256.as_slice()).bind(kind).bind(actor_id)
            .bind(f64::from(q.valid_for_seconds)).bind(operation).execute(&mut *tx).await?;
        tx.commit().await?;
        Ok(id)
    }

    /// Exact binding only. Rotation does not transfer a qualification to new keys.
    /// Dispatch must recheck in its own account-locked transaction before egress.
    pub async fn asset_group_creation_is_qualified(
        &self,
        scope: TenantScope,
        vendor: Uuid,
        vendor_revision: i64,
        credential_revision: i64,
    ) -> Result<bool, StoreError> {
        self.asset_operation_is_qualified(
            scope,
            vendor,
            vendor_revision,
            credential_revision,
            "CreateAssetGroup",
        )
        .await
    }

    /// Read-specific check, not a dispatch authorization or credential release.
    pub async fn asset_group_read_is_qualified(
        &self,
        scope: TenantScope,
        vendor: Uuid,
        vendor_revision: i64,
        credential_revision: i64,
    ) -> Result<bool, StoreError> {
        self.asset_operation_is_qualified(
            scope,
            vendor,
            vendor_revision,
            credential_revision,
            "GetAssetGroup",
        )
        .await
    }

    /// Qualification check only; does not claim an operation or release credentials.
    pub async fn asset_listing_is_qualified(
        &self,
        scope: TenantScope,
        vendor: Uuid,
        vendor_revision: i64,
        credential_revision: i64,
    ) -> Result<bool, StoreError> {
        self.asset_operation_is_qualified(
            scope,
            vendor,
            vendor_revision,
            credential_revision,
            "ListAssets",
        )
        .await
    }

    /// Qualification check only; does not claim an operation or release credentials.
    pub async fn asset_lookup_is_qualified(
        &self,
        scope: TenantScope,
        vendor: Uuid,
        vendor_revision: i64,
        credential_revision: i64,
    ) -> Result<bool, StoreError> {
        self.asset_operation_is_qualified(
            scope,
            vendor,
            vendor_revision,
            credential_revision,
            "GetAsset",
        )
        .await
    }

    /// Qualification check only; does not claim an operation or release credentials.
    pub async fn asset_group_update_is_qualified(
        &self,
        scope: TenantScope,
        vendor: Uuid,
        vendor_revision: i64,
        credential_revision: i64,
    ) -> Result<bool, StoreError> {
        self.asset_operation_is_qualified(
            scope,
            vendor,
            vendor_revision,
            credential_revision,
            "UpdateAssetGroup",
        )
        .await
    }

    /// Qualification only; dispatch must separately bind consent and claim once.
    pub async fn asset_group_deletion_is_qualified(
        &self,
        scope: TenantScope,
        vendor: Uuid,
        vendor_revision: i64,
        credential_revision: i64,
    ) -> Result<bool, StoreError> {
        self.asset_operation_is_qualified(
            scope,
            vendor,
            vendor_revision,
            credential_revision,
            "DeleteAssetGroup",
        )
        .await
    }

    /// Qualification only; exact inspected bytes and consent remain required.
    pub async fn asset_creation_is_qualified(
        &self,
        scope: TenantScope,
        vendor: Uuid,
        vendor_revision: i64,
        credential_revision: i64,
    ) -> Result<bool, StoreError> {
        self.asset_operation_is_qualified(
            scope,
            vendor,
            vendor_revision,
            credential_revision,
            "CreateAsset",
        )
        .await
    }

    async fn asset_operation_is_qualified(
        &self,
        scope: TenantScope,
        vendor: Uuid,
        vendor_revision: i64,
        credential_revision: i64,
        operation: &str,
    ) -> Result<bool, StoreError> {
        Ok(sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM asset_operation_authorizations a JOIN vendors v ON v.id=a.vendor_id AND v.revision=a.vendor_revision JOIN vendor_asset_management_credentials c ON c.vendor_id=a.vendor_id AND c.revision=a.credential_revision WHERE a.organization_id=$1 AND a.project_id=$2 AND a.vendor_id=$3 AND a.vendor_revision=$4 AND a.credential_revision=$5 AND a.operation=$6 AND a.expires_at>clock_timestamp() AND c.credential_ciphertext IS NOT NULL AND NOT EXISTS(SELECT 1 FROM asset_operation_authorization_revocations r WHERE r.authorization_id=a.id) AND NOT EXISTS(SELECT 1 FROM vendor_asset_management_revocations r WHERE r.vendor_id=a.vendor_id AND r.through_revision>=a.credential_revision))")
            .bind(scope.organization_id).bind(scope.project_id).bind(vendor).bind(vendor_revision)
            .bind(credential_revision).bind(operation).fetch_one(&self.pool).await?)
    }

    /// Administrative projection only: evidence identifiers and account bindings
    /// must never be included in customer asset request responses.
    pub async fn asset_operation_authorizations(
        &self,
        vendor: Uuid,
        after: Option<Uuid>,
        limit: i64,
    ) -> Result<Vec<serde_json::Value>, StoreError> {
        if !(1..=101).contains(&limit) {
            return Err(StoreError::InvalidObservation);
        }
        Ok(sqlx::query_scalar("SELECT jsonb_build_object('id',a.id,'organization_id',a.organization_id,'project_id',a.project_id,'vendor_revision',a.vendor_revision,'credential_revision',a.credential_revision,'operation',a.operation,'rights_sha256',encode(a.rights_sha256,'hex'),'protocol_sha256',encode(a.protocol_sha256,'hex'),'data_handling_sha256',encode(a.data_handling_sha256,'hex'),'free_operation_sha256',encode(a.free_operation_sha256,'hex'),'created_at',a.created_at,'expires_at',a.expires_at,'revoked',EXISTS(SELECT 1 FROM asset_operation_authorization_revocations r WHERE r.authorization_id=a.id)) FROM asset_operation_authorizations a WHERE a.vendor_id=$1 AND ($2::uuid IS NULL OR a.id>$2) ORDER BY a.id LIMIT $3")
            .bind(vendor).bind(after).bind(limit).fetch_all(&self.pool).await?)
    }

    /// Vendor-scoped administration prevents a mismatched route from revoking
    /// another account's authorization. Missing or already revoked is idempotent.
    pub async fn revoke_asset_operation_authorization_for_vendor(
        &self,
        vendor: Uuid,
        authorization: Uuid,
        actor: OperatorAuditActor,
    ) -> Result<bool, StoreError> {
        let mut tx = self.pool.begin().await?;
        let exists: Option<Uuid> =
            sqlx::query_scalar("SELECT id FROM vendors WHERE id=$1 FOR UPDATE")
                .bind(vendor)
                .fetch_optional(&mut *tx)
                .await?;
        if exists.is_none() {
            return Ok(false);
        }
        let (kind, actor_id) = actor.kind_and_id();
        let changed=sqlx::query("INSERT INTO asset_operation_authorization_revocations(authorization_id,actor_kind,actor_id) SELECT id,$3,$4 FROM asset_operation_authorizations WHERE id=$1 AND vendor_id=$2 ON CONFLICT DO NOTHING")
            .bind(authorization).bind(vendor).bind(kind).bind(actor_id).execute(&mut *tx).await?.rows_affected()==1;
        tx.commit().await?;
        Ok(changed)
    }

    /// Append-only and idempotent. Caller authorizes platform administration.
    pub async fn revoke_asset_operation_authorization(
        &self,
        authorization: Uuid,
        actor: OperatorAuditActor,
    ) -> Result<bool, StoreError> {
        let vendor: Option<Uuid> =
            sqlx::query_scalar("SELECT vendor_id FROM asset_operation_authorizations WHERE id=$1")
                .bind(authorization)
                .fetch_optional(&self.pool)
                .await?;
        match vendor {
            Some(vendor) => {
                self.revoke_asset_operation_authorization_for_vendor(vendor, authorization, actor)
                    .await
            }
            None => Ok(false),
        }
    }
}
