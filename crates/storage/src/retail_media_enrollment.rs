//! Explicit workspace media selling configuration; independent of supply rights.
use crate::{OperatorAuditActor, RetailSelection, Store, StoreError, TenantScope};
use niu_metered_cost::Dimensions;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sqlx::{Postgres, Transaction};
use uuid::Uuid;

#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct RetailMediaEnrollmentPublication {
    pub dimensions: Dimensions,
    pub meter: String,
    /// Explicit null restores legacy media-card selection for new operations.
    #[serde(deserialize_with = "crate::retail_publication::required_optional_uuid")]
    pub price_id: Option<Uuid>,
    pub expected_version: String,
    pub idempotency_key: Uuid,
    pub reason: String,
}

fn validate_identity(dimensions: &Dimensions, meter: &str) -> Result<(), StoreError> {
    for (value, maximum) in [
        (dimensions.model.as_str(), 200),
        (dimensions.channel.as_str(), 256),
        (dimensions.resolution.as_str(), 256),
        (meter, 256),
    ] {
        if value.is_empty()
            || value.len() > maximum
            || value != value.trim()
            || value.chars().any(char::is_control)
        {
            return Err(StoreError::InvalidPrice);
        }
    }
    if meter == "text_tokens" {
        return Err(StoreError::InvalidPrice);
    }
    Ok(())
}

impl Store {
    /// Caller independently authorizes platform financial administration.
    /// The price fixes currency; enrollment never creates a balance or credit.
    pub async fn publish_retail_media_enrollment(
        &self,
        scope: TenantScope,
        input: &RetailMediaEnrollmentPublication,
        actor: OperatorAuditActor,
    ) -> Result<Value, StoreError> {
        validate_identity(&input.dimensions, &input.meter)?;
        if input.reason.is_empty()
            || input.reason != input.reason.trim()
            || input.reason.chars().count() > 500
            || input.reason.chars().any(char::is_control)
            || input.expected_version.is_empty()
            || !input.expected_version.bytes().all(|b| b.is_ascii_digit())
        {
            return Err(StoreError::InvalidPrice);
        }
        let expected = input
            .expected_version
            .parse::<i64>()
            .map_err(|_| StoreError::InvalidPrice)?;
        let next = expected.checked_add(1).ok_or(StoreError::InvalidPrice)?;
        let dimensions =
            serde_json::to_value(&input.dimensions).map_err(|_| StoreError::InvalidPrice)?;
        let intent = json!({"dimensions":dimensions,"meter":input.meter,"price_id":input.price_id,
            "expected_version":expected.to_string(),"reason":input.reason});
        let mut tx = self.begin_bounded_recording().await?;
        sqlx::query("SELECT id FROM projects WHERE organization_id=$1 AND id=$2 FOR UPDATE")
            .bind(scope.organization_id)
            .bind(scope.project_id)
            .fetch_optional(&mut *tx)
            .await?
            .ok_or(StoreError::Conflict)?;
        let prior:Option<(Uuid,i64,Value)>=sqlx::query_as("SELECT id,version,intent FROM retail_media_enrollment_changes WHERE organization_id=$1 AND project_id=$2 AND idempotency_key=$3")
            .bind(scope.organization_id).bind(scope.project_id).bind(input.idempotency_key).fetch_optional(&mut *tx).await?;
        if let Some((id, version, saved)) = prior {
            return if saved == intent {
                Ok(
                    json!({"revision":id,"version":version.to_string(),"dimensions":input.dimensions,"meter":input.meter,"price_id":input.price_id}),
                )
            } else {
                Err(StoreError::Conflict)
            };
        }
        if let Some(head) = input.price_id {
            // Identity and currency are immutable. Plain validation avoids an
            // inverse price->workspace lock with global price publication.
            let valid:bool=sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM platform_retail_price_heads h JOIN customer_balance_accounts a ON a.organization_id=$4 AND a.currency=h.currency WHERE h.id=$1 AND h.rate_kind='media' AND h.current_revision IS NOT NULL AND h.dimensions=$2 AND h.meter=$3 AND h.model_alias=$2->>'model')")
                .bind(head).bind(&dimensions).bind(&input.meter).bind(scope.organization_id).fetch_one(&mut *tx).await?;
            if !valid {
                return Err(StoreError::Conflict);
            }
        }
        sqlx::query("INSERT INTO retail_media_enrollments(id,organization_id,project_id,dimensions,meter) VALUES($1,$2,$3,$4,$5) ON CONFLICT(organization_id,project_id,dimensions,meter) DO NOTHING")
            .bind(Uuid::new_v4()).bind(scope.organization_id).bind(scope.project_id).bind(&dimensions).bind(&input.meter)
            .execute(&mut *tx).await?;
        let(head,version):(Uuid,i64)=sqlx::query_as("SELECT id,version FROM retail_media_enrollments WHERE organization_id=$1 AND project_id=$2 AND dimensions=$3 AND meter=$4")
            .bind(scope.organization_id).bind(scope.project_id).bind(&dimensions).bind(&input.meter).fetch_one(&mut *tx).await?;
        if version != expected {
            return Err(StoreError::Conflict);
        }
        let id = Uuid::new_v4();
        let (kind, operator) = actor.kind_and_id();
        sqlx::query("INSERT INTO retail_media_enrollment_changes(id,organization_id,project_id,enrollment_id,price_id,version,idempotency_key,intent,reason,actor_kind,actor_operator_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)")
            .bind(id).bind(scope.organization_id).bind(scope.project_id).bind(head).bind(input.price_id).bind(next)
            .bind(input.idempotency_key).bind(intent).bind(&input.reason).bind(kind).bind(operator).execute(&mut *tx).await?;
        sqlx::query("UPDATE retail_media_enrollments SET price_id=$2,version=$3 WHERE id=$1")
            .bind(head)
            .bind(input.price_id)
            .bind(next)
            .execute(&mut *tx)
            .await?;
        tx.commit().await?;
        Ok(
            json!({"revision":id,"version":next.to_string(),"dimensions":input.dimensions,"meter":input.meter,"price_id":input.price_id}),
        )
    }

    /// Caller must already hold the scoped workspace SHARE lock. None means
    /// legacy selection; an exact complete dimensional identity is required.
    pub(crate) async fn enrolled_retail_media_price_in_tx(
        tx: &mut Transaction<'_, Postgres>,
        scope: TenantScope,
        dimensions: &Dimensions,
        meter: &str,
    ) -> Result<Option<Uuid>, StoreError> {
        validate_identity(dimensions, meter)?;
        let dimensions = serde_json::to_value(dimensions).map_err(|_| StoreError::InvalidPrice)?;
        Ok(sqlx::query_scalar("SELECT price_id FROM retail_media_enrollments WHERE organization_id=$1 AND project_id=$2 AND dimensions=$3 AND meter=$4 AND price_id IS NOT NULL")
            .bind(scope.organization_id).bind(scope.project_id).bind(dimensions).bind(meter).fetch_optional(&mut **tx).await?)
    }

    /// Advisory own-customer selection only; admission must reselect and pin.
    pub async fn retail_media_enrollment_preview(
        &self,
        scope: TenantScope,
        dimensions: &Dimensions,
        meter: &str,
    ) -> Result<Option<RetailSelection>, StoreError> {
        let mut tx = self.begin_bounded_recording().await?;
        sqlx::query("SELECT id FROM projects WHERE organization_id=$1 AND id=$2 FOR SHARE")
            .bind(scope.organization_id)
            .bind(scope.project_id)
            .fetch_optional(&mut *tx)
            .await?
            .ok_or(StoreError::Conflict)?;
        let head =
            Self::enrolled_retail_media_price_in_tx(&mut tx, scope, dimensions, meter).await?;
        let selected = if let Some(head) = head {
            Some(Self::select_retail_price_in_tx(&mut tx, head, scope.organization_id).await?)
        } else {
            None
        };
        tx.commit().await?;
        Ok(selected)
    }

    /// Exact own-workspace configuration, including version zero for missing
    /// enrollment. It does not advertise readiness or disclose other customers.
    pub async fn retail_media_enrollment(
        &self,
        scope: TenantScope,
        dimensions: &Dimensions,
        meter: &str,
    ) -> Result<Value, StoreError> {
        validate_identity(dimensions, meter)?;
        let encoded = serde_json::to_value(dimensions).map_err(|_| StoreError::InvalidPrice)?;
        let mut tx = self.begin_bounded_recording().await?;
        sqlx::query("SELECT id FROM projects WHERE organization_id=$1 AND id=$2 FOR SHARE")
            .bind(scope.organization_id)
            .bind(scope.project_id)
            .fetch_optional(&mut *tx)
            .await?
            .ok_or(StoreError::Conflict)?;
        let mut configuration:Value=sqlx::query_scalar("SELECT jsonb_build_object('dimensions',$3::jsonb,'meter',$4::text,'price_id',e.price_id,'version',COALESCE(e.version,0)::text,'pricing_source',CASE WHEN e.price_id IS NULL THEN 'workspace' ELSE 'platform' END) FROM projects p LEFT JOIN retail_media_enrollments e ON e.organization_id=p.organization_id AND e.project_id=p.id AND e.dimensions=$3 AND e.meter=$4 WHERE p.organization_id=$1 AND p.id=$2")
            .bind(scope.organization_id).bind(scope.project_id).bind(encoded).bind(meter).fetch_one(&mut *tx).await?;
        let head =
            Self::enrolled_retail_media_price_in_tx(&mut tx, scope, dimensions, meter).await?;
        let selected = if let Some(head) = head {
            Some(Self::select_retail_price_in_tx(&mut tx, head, scope.organization_id).await?)
        } else {
            None
        };
        configuration["effective_price"] = json!(selected);
        tx.commit().await?;
        Ok(configuration)
    }
}
