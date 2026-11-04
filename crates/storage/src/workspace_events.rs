//! Durable customer-safe resource events and explicitly delegated subscriptions.
use crate::{Principal, Store, StoreError, TenantScope};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::Row;
use uuid::Uuid;

#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct EventSubscription {
    pub slug: String,
    pub name: String,
    pub endpoint: String,
    pub event_types: Vec<String>,
    pub enabled: bool,
    /// Expected revision on write; zero creates.
    pub revision: i64,
}
impl EventSubscription {
    pub fn validate(&self) -> Result<(), StoreError> {
        if !crate::is_valid_pool_slug(&self.slug)
            || matches!(self.slug.as_str(), "log" | "deliveries" | "test")
            || self.name.trim().is_empty()
            || self.name.trim() != self.name
            || self.name.len() > 200
            || self.event_types.is_empty()
            || self.event_types.len() > 4
            || self.event_types.iter().any(|event| {
                ![
                    "pool.changed",
                    "evaluation.recorded",
                    "incident.opened",
                    "incident.resolved",
                ]
                .contains(&event.as_str())
            })
            || self
                .event_types
                .iter()
                .collect::<std::collections::BTreeSet<_>>()
                .len()
                != self.event_types.len()
            || !(0..9_007_199_254_740_991).contains(&self.revision)
            || self.endpoint.len() > 2048
        {
            return Err(StoreError::InvalidObservation);
        }
        let endpoint =
            url::Url::parse(&self.endpoint).map_err(|_| StoreError::InvalidObservation)?;
        let host = endpoint.domain().ok_or(StoreError::InvalidObservation)?;
        if endpoint.scheme() != "https"
            || !endpoint.username().is_empty()
            || endpoint.password().is_some()
            || endpoint.query().is_some()
            || endpoint.fragment().is_some()
            || endpoint.port().is_some_and(|port| port != 443)
            || !host.contains('.')
            || host.ends_with('.')
            || [".localhost", ".local", ".internal", ".lan"]
                .iter()
                .any(|suffix| host.ends_with(suffix))
        {
            return Err(StoreError::InvalidObservation);
        }
        Ok(())
    }
}
/// Internal only: intentionally neither serializable nor Debug.
pub struct EventSubscriptionRecord {
    pub id: Uuid,
    pub configuration: EventSubscription,
    pub secret_ciphertext: Vec<u8>,
    pub cursor: i64,
}
impl Store {
    /// Publish one durable per-workspace incident transition to the existing
    /// event stream. The bridge row and stream update commit in one transaction;
    /// competing workers skip the same row and crashes cannot duplicate a step.
    pub async fn publish_one_incident_event(&self) -> Result<bool, StoreError> {
        let mut tx = self.begin_bounded_recording().await?;
        let row = sqlx::query("SELECT b.incident_id,b.organization_id,b.project_id,b.reference,b.opened_sequence,i.resolved_at IS NOT NULL AS resolved FROM incident_workspace_events b JOIN connection_incidents i ON i.id=b.incident_id WHERE b.opened_sequence IS NULL OR (i.resolved_at IS NOT NULL AND b.resolved_sequence IS NULL) ORDER BY b.created_at,b.incident_id,b.organization_id,b.project_id FOR UPDATE OF b SKIP LOCKED LIMIT 1")
            .fetch_optional(&mut *tx).await?;
        let Some(row) = row else {
            tx.commit().await?;
            return Ok(false);
        };
        let scope = TenantScope {
            organization_id: row.try_get("organization_id")?,
            project_id: row.try_get("project_id")?,
        };
        let opened: Option<i64> = row.try_get("opened_sequence")?;
        let (event_type, revision) = if opened.is_none() {
            ("incident.opened", 1_i64)
        } else {
            ("incident.resolved", 2_i64)
        };
        Self::event_stream_head_in_tx(&mut tx, scope).await?;
        let sequence: i64 = sqlx::query_scalar("UPDATE workspace_event_streams SET sequence=sequence+1 WHERE organization_id=$1 AND project_id=$2 RETURNING sequence")
            .bind(scope.organization_id).bind(scope.project_id).fetch_one(&mut *tx).await?;
        sqlx::query("INSERT INTO workspace_events(organization_id,project_id,sequence,id,event_type,resource_kind,resource_slug,resource_revision) VALUES($1,$2,$3,$4,$5,'incident',$6,$7)")
            .bind(scope.organization_id).bind(scope.project_id).bind(sequence).bind(Uuid::new_v4()).bind(event_type).bind(row.try_get::<String,_>("reference")?).bind(revision).execute(&mut *tx).await?;
        let incident: i64 = row.try_get("incident_id")?;
        if opened.is_none() {
            sqlx::query("UPDATE incident_workspace_events SET opened_sequence=$4 WHERE incident_id=$1 AND organization_id=$2 AND project_id=$3")
                .bind(incident).bind(scope.organization_id).bind(scope.project_id).bind(sequence).execute(&mut *tx).await?;
        } else {
            sqlx::query("UPDATE incident_workspace_events SET resolved_sequence=$4 WHERE incident_id=$1 AND organization_id=$2 AND project_id=$3")
                .bind(incident).bind(scope.organization_id).bind(scope.project_id).bind(sequence).execute(&mut *tx).await?;
        }
        tx.commit().await?;
        Ok(true)
    }

    /// Scope-bound reconciliation for references returned by incident events.
    pub async fn workspace_incident_event_detail(
        &self,
        scope: TenantScope,
        reference: &str,
    ) -> Result<Option<Value>, StoreError> {
        Ok(sqlx::query_scalar("SELECT jsonb_build_object('reference',b.reference,'model',i.model_alias,'owner_funded',EXISTS(SELECT 1 FROM personal_vendor_ownership p WHERE p.vendor_id=i.vendor_id AND p.organization_id=b.organization_id),'status',CASE WHEN i.resolved_at IS NULL THEN 'active' ELSE 'resolved' END,'recovered_at',i.resolved_at) FROM incident_workspace_events b JOIN connection_incidents i ON i.id=b.incident_id WHERE b.organization_id=$1 AND b.project_id=$2 AND b.reference=$3")
            .bind(scope.organization_id).bind(scope.project_id).bind(reference).fetch_optional(&self.pool).await?)
    }

    pub(crate) async fn event_stream_head_in_tx(
        tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
        scope: TenantScope,
    ) -> Result<i64, StoreError> {
        sqlx::query("INSERT INTO workspace_event_streams(organization_id,project_id) VALUES($1,$2) ON CONFLICT DO NOTHING")
            .bind(scope.organization_id).bind(scope.project_id).execute(&mut **tx).await?;
        Ok(sqlx::query_scalar("SELECT sequence FROM workspace_event_streams WHERE organization_id=$1 AND project_id=$2 FOR UPDATE")
            .bind(scope.organization_id).bind(scope.project_id).fetch_one(&mut **tx).await?)
    }
    /// Allocate while holding the stream row until commit, so cursor readers
    /// cannot skip an uncommitted event with a lower sequence.
    pub(crate) async fn emit_pool_event_in_tx(
        tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
        scope: TenantScope,
        slug: &str,
        revision: i64,
    ) -> Result<(), StoreError> {
        Self::event_stream_head_in_tx(tx, scope).await?;
        let sequence: i64 = sqlx::query_scalar("UPDATE workspace_event_streams SET sequence=sequence+1 WHERE organization_id=$1 AND project_id=$2 RETURNING sequence")
            .bind(scope.organization_id).bind(scope.project_id).fetch_one(&mut **tx).await?;
        sqlx::query("INSERT INTO workspace_events(organization_id,project_id,sequence,id,event_type,resource_slug,resource_revision) VALUES($1,$2,$3,$4,'pool.changed',$5,$6)")
            .bind(scope.organization_id).bind(scope.project_id).bind(sequence).bind(Uuid::new_v4()).bind(slug).bind(revision).execute(&mut **tx).await?;
        Ok(())
    }
    pub(crate) async fn emit_evaluation_event_in_tx(
        tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
        scope: TenantScope,
        evaluation: &str,
        revision: i64,
        run: &str,
    ) -> Result<(), StoreError> {
        Self::event_stream_head_in_tx(tx, scope).await?;
        let sequence: i64 = sqlx::query_scalar("UPDATE workspace_event_streams SET sequence=sequence+1 WHERE organization_id=$1 AND project_id=$2 RETURNING sequence")
            .bind(scope.organization_id).bind(scope.project_id).fetch_one(&mut **tx).await?;
        sqlx::query("INSERT INTO workspace_events(organization_id,project_id,sequence,id,event_type,resource_kind,resource_slug,resource_revision,resource_run) VALUES($1,$2,$3,$4,'evaluation.recorded','evaluation',$5,$6,$7)")
            .bind(scope.organization_id).bind(scope.project_id).bind(sequence).bind(Uuid::new_v4()).bind(evaluation).bind(revision).bind(run).execute(&mut **tx).await?;
        Ok(())
    }
    pub async fn workspace_event_head(&self, scope: TenantScope) -> Result<i64, StoreError> {
        Ok(sqlx::query_scalar("SELECT sequence FROM workspace_event_streams WHERE organization_id=$1 AND project_id=$2")
            .bind(scope.organization_id).bind(scope.project_id).fetch_optional(&self.pool).await?.unwrap_or(0))
    }
    pub async fn test_event_subscription(
        &self,
        principal: &Principal,
        slug: &str,
        expected_revision: i64,
    ) -> Result<Value, StoreError> {
        let scope = principal.scope();
        let mut tx = self.begin_bounded_recording().await?;
        Self::require_agent_capability_in_tx(&mut tx, principal, "events:write", &[]).await?;
        Self::event_stream_head_in_tx(&mut tx, scope).await?;
        let record = sqlx::query("SELECT id,revision,configuration FROM workspace_event_subscriptions WHERE organization_id=$1 AND project_id=$2 AND slug=$3 FOR UPDATE")
            .bind(scope.organization_id).bind(scope.project_id).bind(slug).fetch_optional(&mut *tx).await?.ok_or(StoreError::Conflict)?;
        let id: Uuid = record.try_get("id")?;
        let revision: i64 = record.try_get("revision")?;
        let configuration: EventSubscription =
            serde_json::from_value(record.try_get("configuration")?)
                .map_err(|_| StoreError::InvalidObservation)?;
        if revision != expected_revision {
            return Err(StoreError::Conflict);
        }
        if !configuration.enabled {
            return Err(StoreError::InvalidObservation);
        }
        let sequence:i64 = sqlx::query_scalar("UPDATE workspace_event_streams SET sequence=sequence+1 WHERE organization_id=$1 AND project_id=$2 RETURNING sequence")
            .bind(scope.organization_id).bind(scope.project_id).fetch_one(&mut *tx).await?;
        let event_id = Uuid::new_v4();
        sqlx::query("INSERT INTO workspace_events(organization_id,project_id,sequence,id,event_type,resource_kind,resource_slug,resource_revision,target_subscription_id) VALUES($1,$2,$3,$4,'subscription.test','subscription',$5,$6,$7)")
            .bind(scope.organization_id).bind(scope.project_id).bind(sequence).bind(event_id).bind(slug).bind(revision).bind(id).execute(&mut *tx).await?;
        tx.commit().await?;
        Ok(
            serde_json::json!({"id":event_id,"sequence":sequence.to_string(),"type":"subscription.test","subscription_revision":revision,"delivery":"queued"}),
        )
    }
    pub async fn workspace_events(
        &self,
        scope: TenantScope,
        after: i64,
    ) -> Result<Vec<Value>, StoreError> {
        if after < 0 {
            return Err(StoreError::InvalidObservation);
        }
        Ok(sqlx::query_scalar("SELECT jsonb_build_object('id',id,'sequence',sequence::text,'type',event_type,'schema_version',1,'occurred_at',created_at,'resource',(jsonb_build_object('kind',resource_kind,'slug',resource_slug,'revision',resource_revision) || CASE WHEN resource_run IS NOT NULL THEN jsonb_build_object('run',resource_run) ELSE '{}'::jsonb END)) FROM workspace_events WHERE organization_id=$1 AND project_id=$2 AND sequence>$3 ORDER BY sequence LIMIT 101")
            .bind(scope.organization_id).bind(scope.project_id).bind(after).fetch_all(&self.pool).await?)
    }
    pub async fn event_subscriptions(
        &self,
        scope: TenantScope,
    ) -> Result<Vec<EventSubscription>, StoreError> {
        let rows: Vec<Value> = sqlx::query_scalar("SELECT configuration FROM workspace_event_subscriptions WHERE organization_id=$1 AND project_id=$2 ORDER BY slug LIMIT 32")
            .bind(scope.organization_id).bind(scope.project_id).fetch_all(&self.pool).await?;
        rows.into_iter()
            .map(|row| serde_json::from_value(row).map_err(|_| StoreError::InvalidObservation))
            .collect()
    }
    pub async fn event_subscription(
        &self,
        scope: TenantScope,
        slug: &str,
    ) -> Result<Option<EventSubscriptionRecord>, StoreError> {
        let row = sqlx::query("SELECT id,configuration,secret_ciphertext,cursor FROM workspace_event_subscriptions WHERE organization_id=$1 AND project_id=$2 AND slug=$3")
            .bind(scope.organization_id).bind(scope.project_id).bind(slug).fetch_optional(&self.pool).await?;
        row.map(|row| {
            Ok(EventSubscriptionRecord {
                id: row.try_get("id")?,
                configuration: serde_json::from_value(row.try_get("configuration")?)
                    .map_err(|_| StoreError::InvalidObservation)?,
                secret_ciphertext: row.try_get("secret_ciphertext")?,
                cursor: row.try_get("cursor")?,
            })
        })
        .transpose()
    }
    /// Ciphertext is bound by the gateway to this exact scope/id and encryption
    /// domain. It is never part of public configuration or immutable history.
    pub async fn set_event_subscription(
        &self,
        principal: &Principal,
        id: Uuid,
        input: &EventSubscription,
        new_secret: Option<&[u8]>,
    ) -> Result<EventSubscription, StoreError> {
        input.validate()?;
        if new_secret.is_some_and(|value| !(30..=1024).contains(&value.len())) {
            return Err(StoreError::InvalidObservation);
        }
        let scope = principal.scope();
        let mut tx = self.begin_bounded_recording().await?;
        Self::require_agent_capability_in_tx(&mut tx, principal, "events:write", &[]).await?;
        let head = Self::event_stream_head_in_tx(&mut tx, scope).await?;
        let existing = sqlx::query("SELECT id,revision,configuration,cursor FROM workspace_event_subscriptions WHERE organization_id=$1 AND project_id=$2 AND slug=$3 FOR UPDATE")
            .bind(scope.organization_id).bind(scope.project_id).bind(&input.slug).fetch_optional(&mut *tx).await?;
        let mut cursor = head;
        if let Some(existing) = &existing {
            let previous: EventSubscription =
                serde_json::from_value(existing.try_get("configuration")?)
                    .map_err(|_| StoreError::InvalidObservation)?;
            if existing.try_get::<Uuid, _>("id")? != id
                || existing.try_get::<i64, _>("revision")? != input.revision
            {
                return Err(StoreError::Conflict);
            }
            if previous.endpoint == input.endpoint
                && new_secret.is_none()
                && previous.enabled == input.enabled
                && previous.event_types == input.event_types
            {
                cursor = existing.try_get("cursor")?;
            }
            if previous.endpoint != input.endpoint && new_secret.is_none() {
                return Err(StoreError::InvalidObservation);
            }
        } else {
            if input.revision != 0 || new_secret.is_none() {
                return Err(StoreError::Conflict);
            }
            let count: i64 = sqlx::query_scalar("SELECT count(*) FROM workspace_event_subscriptions WHERE organization_id=$1 AND project_id=$2")
                .bind(scope.organization_id).bind(scope.project_id).fetch_one(&mut *tx).await?;
            if count >= 32 {
                return Err(StoreError::Conflict);
            }
        }
        let mut saved = input.clone();
        saved.revision += 1;
        let configuration =
            serde_json::to_value(&saved).map_err(|_| StoreError::InvalidObservation)?;
        if existing.is_none() {
            sqlx::query("INSERT INTO workspace_event_subscriptions(id,organization_id,project_id,slug,revision,configuration,secret_ciphertext,issuer_key_id,cursor) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)")
                .bind(id).bind(scope.organization_id).bind(scope.project_id).bind(&saved.slug).bind(saved.revision).bind(&configuration).bind(new_secret.unwrap()).bind(principal.key_id()).bind(cursor).execute(&mut *tx).await?;
        } else {
            // A revision change cancels the old destination's pending work. The
            // destination/secret/enable change starts at the current head. A
            // metadata-only edit preserves the acknowledged cursor.
            sqlx::query("UPDATE workspace_event_subscriptions SET revision=$2,configuration=$3,secret_ciphertext=COALESCE($4,secret_ciphertext),issuer_key_id=$5,cursor=$6,updated_at=clock_timestamp() WHERE id=$1")
                .bind(id).bind(saved.revision).bind(&configuration).bind(new_secret).bind(principal.key_id()).bind(cursor).execute(&mut *tx).await?;
            sqlx::query("UPDATE workspace_event_deliveries SET state='cancelled',failure_kind='superseded',lease_id=NULL,lease_until=NULL,updated_at=clock_timestamp() WHERE subscription_id=$1 AND state IN ('pending','sending')")
                .bind(id).execute(&mut *tx).await?;
        }
        sqlx::query("INSERT INTO workspace_event_subscription_history(subscription_id,revision,configuration,actor_key_id) VALUES($1,$2,$3,$4)")
            .bind(id).bind(saved.revision).bind(configuration).bind(principal.key_id()).execute(&mut *tx).await?;
        tx.commit().await?;
        Ok(saved)
    }
    /// Offline/startup inventory only; never a customer projection.
    pub async fn event_signing_credential_page(
        &self,
        after: Option<Uuid>,
    ) -> Result<Vec<(Uuid, TenantScope, Vec<u8>)>, StoreError> {
        let rows = sqlx::query("SELECT id,organization_id,project_id,secret_ciphertext FROM workspace_event_subscriptions WHERE ($1::uuid IS NULL OR id>$1) ORDER BY id LIMIT 100")
            .bind(after).fetch_all(&self.pool).await?;
        rows.into_iter()
            .map(|row| {
                Ok((
                    row.try_get("id")?,
                    TenantScope {
                        organization_id: row.try_get("organization_id")?,
                        project_id: row.try_get("project_id")?,
                    },
                    row.try_get("secret_ciphertext")?,
                ))
            })
            .collect()
    }
    pub async fn event_subscription_history(
        &self,
        scope: TenantScope,
        slug: &str,
        before: Option<i64>,
    ) -> Result<Vec<Value>, StoreError> {
        if before.is_some_and(|value| value < 1) {
            return Err(StoreError::InvalidObservation);
        }
        Ok(sqlx::query_scalar("SELECT h.configuration FROM workspace_event_subscription_history h JOIN workspace_event_subscriptions s ON s.id=h.subscription_id WHERE s.organization_id=$1 AND s.project_id=$2 AND s.slug=$3 AND ($4::bigint IS NULL OR h.revision<$4) ORDER BY h.revision DESC LIMIT 100")
            .bind(scope.organization_id).bind(scope.project_id).bind(slug).bind(before).fetch_all(&self.pool).await?)
    }
}

/// A leased delivery; contains a private signing credential and is deliberately
/// neither serializable nor Debug. A lease is not a receiver acknowledgement.
pub struct EventDeliveryClaim {
    pub id: Uuid,
    pub lease: Uuid,
    pub scope: TenantScope,
    pub subscription_id: Uuid,
    pub subscription_revision: i64,
    pub configuration: EventSubscription,
    pub secret_ciphertext: Vec<u8>,
    pub event: Value,
    pub sequence: i64,
    pub attempt: i32,
}
// No secret projection: only presence of a current, scoped, explicitly granted
// delegation determines whether a new delivery can be started.
const EVENT_AUTHORITY: &str = "EXISTS(SELECT 1 FROM agent_key_capabilities c JOIN api_keys k ON k.id=c.key_id JOIN agent_authorizations a ON a.id=c.authorization_id JOIN admin_operators o ON o.id=a.approved_by WHERE c.key_id=s.issuer_key_id AND c.capability='events:write' AND k.organization_id=s.organization_id AND k.project_id=s.project_id AND k.revoked_at IS NULL AND k.expires_at>clock_timestamp() AND o.revoked_at IS NULL AND o.role IN ('owner','admin') AND o.organization_id=k.organization_id AND (o.project_id IS NULL OR o.project_id=k.project_id))";
impl Store {
    pub async fn event_subscription_authorized(
        &self,
        scope: TenantScope,
        slug: &str,
    ) -> Result<bool, StoreError> {
        Ok(sqlx::query_scalar(&format!("SELECT EXISTS(SELECT 1 FROM workspace_event_subscriptions s WHERE s.organization_id=$1 AND s.project_id=$2 AND s.slug=$3 AND {EVENT_AUTHORITY})"))
            .bind(scope.organization_id).bind(scope.project_id).bind(slug).fetch_one(&self.pool).await?)
    }
    pub async fn event_delivery_candidates(&self) -> Result<Vec<Uuid>, StoreError> {
        Ok(sqlx::query_scalar(&format!("SELECT s.id FROM workspace_event_subscriptions s WHERE (s.configuration->>'enabled')::boolean AND {EVENT_AUTHORITY} AND EXISTS(SELECT 1 FROM workspace_events e WHERE e.organization_id=s.organization_id AND e.project_id=s.project_id AND e.sequence>s.cursor AND ((e.target_subscription_id IS NULL AND (s.configuration->'event_types') ? e.event_type) OR e.target_subscription_id=s.id)) ORDER BY s.checked_at,s.id LIMIT 100"))
            .fetch_all(&self.pool).await?)
    }
    pub async fn claim_event_delivery(
        &self,
        subscription: Uuid,
    ) -> Result<Option<EventDeliveryClaim>, StoreError> {
        let mut tx = self.begin_bounded_recording().await?;
        let row = sqlx::query(&format!("SELECT s.* FROM workspace_event_subscriptions s WHERE s.id=$1 AND (s.configuration->>'enabled')::boolean AND {EVENT_AUTHORITY} FOR UPDATE OF s SKIP LOCKED"))
            .bind(subscription).fetch_optional(&mut *tx).await?;
        let Some(row) = row else {
            return Ok(None);
        };
        sqlx::query(
            "UPDATE workspace_event_subscriptions SET checked_at=clock_timestamp() WHERE id=$1",
        )
        .bind(subscription)
        .execute(&mut *tx)
        .await?;
        let scope = TenantScope {
            organization_id: row.try_get("organization_id")?,
            project_id: row.try_get("project_id")?,
        };
        let cursor: i64 = row.try_get("cursor")?;
        let revision: i64 = row.try_get("revision")?;
        let event = sqlx::query("SELECT sequence,jsonb_build_object('id',id,'sequence',sequence::text,'type',event_type,'schema_version',1,'occurred_at',created_at,'resource',(jsonb_build_object('kind',resource_kind,'slug',resource_slug,'revision',resource_revision) || CASE WHEN resource_run IS NOT NULL THEN jsonb_build_object('run',resource_run) ELSE '{}'::jsonb END)) AS event FROM workspace_events WHERE organization_id=$1 AND project_id=$2 AND sequence>$3 AND ((target_subscription_id IS NULL AND $5::jsonb ? event_type) OR target_subscription_id=$4) ORDER BY sequence LIMIT 1")
            .bind(scope.organization_id).bind(scope.project_id).bind(cursor).bind(subscription).bind(row.try_get::<Value,_>("configuration")?["event_types"].clone()).fetch_optional(&mut *tx).await?;
        let Some(event) = event else {
            tx.commit().await?;
            return Ok(None);
        };
        let sequence: i64 = event.try_get("sequence")?;
        sqlx::query("INSERT INTO workspace_event_deliveries(id,organization_id,project_id,subscription_id,subscription_revision,event_sequence) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(subscription_id,subscription_revision,event_sequence) DO NOTHING")
            .bind(Uuid::new_v4()).bind(scope.organization_id).bind(scope.project_id).bind(subscription).bind(revision).bind(sequence).execute(&mut *tx).await?;
        let delivery = sqlx::query("SELECT id,attempts,state,available_at<=clock_timestamp() AS due,COALESCE(lease_until<=clock_timestamp(),true) AS expired FROM workspace_event_deliveries WHERE subscription_id=$1 AND subscription_revision=$2 AND event_sequence=$3 FOR UPDATE")
            .bind(subscription).bind(revision).bind(sequence).fetch_one(&mut *tx).await?;
        let id: Uuid = delivery.try_get("id")?;
        let state: String = delivery.try_get("state")?;
        let attempt: i32 = delivery.try_get("attempts")?;
        if matches!(state.as_str(), "delivered" | "failed" | "cancelled") || attempt >= 8 {
            if attempt >= 8 && !matches!(state.as_str(), "delivered" | "failed" | "cancelled") {
                // An eighth attempt may still be in flight. Do not replace it
                // before its lease expires merely because the count is bounded.
                if state == "sending" && !delivery.try_get::<bool, _>("expired")? {
                    tx.commit().await?;
                    return Ok(None);
                }
                sqlx::query("UPDATE workspace_event_deliveries SET state='failed',failure_kind='exhausted',lease_id=NULL,lease_until=NULL,updated_at=clock_timestamp() WHERE id=$1").bind(id).execute(&mut *tx).await?;
            }
            sqlx::query("UPDATE workspace_event_subscriptions SET cursor=$2 WHERE id=$1")
                .bind(subscription)
                .bind(sequence)
                .execute(&mut *tx)
                .await?;
            tx.commit().await?;
            return Ok(None);
        }
        if (state == "sending" && !delivery.try_get::<bool, _>("expired")?)
            || !delivery.try_get::<bool, _>("due")?
        {
            tx.commit().await?;
            return Ok(None);
        }
        let lease = Uuid::new_v4();
        sqlx::query("UPDATE workspace_event_deliveries SET state='sending',attempts=attempts+1,response_status=NULL,failure_kind=NULL,lease_id=$2,lease_until=clock_timestamp()+interval '30 seconds',updated_at=clock_timestamp() WHERE id=$1")
            .bind(id).bind(lease).execute(&mut *tx).await?;
        let claim = EventDeliveryClaim {
            id,
            lease,
            scope,
            subscription_id: subscription,
            subscription_revision: revision,
            configuration: serde_json::from_value(row.try_get("configuration")?)
                .map_err(|_| StoreError::InvalidObservation)?,
            secret_ciphertext: row.try_get("secret_ciphertext")?,
            event: event.try_get("event")?,
            sequence,
            attempt: attempt + 1,
        };
        tx.commit().await?;
        Ok(Some(claim))
    }
    /// Recheck just before dispatch. Revocation prevents new attempts, but an
    /// already in-flight network request cannot be recalled.
    pub async fn event_delivery_authorized(
        &self,
        claim: &EventDeliveryClaim,
    ) -> Result<bool, StoreError> {
        Ok(sqlx::query_scalar(&format!("SELECT EXISTS(SELECT 1 FROM workspace_event_subscriptions s JOIN workspace_event_deliveries d ON d.subscription_id=s.id WHERE d.id=$1 AND d.lease_id=$2 AND d.state='sending' AND d.lease_until>clock_timestamp() AND s.revision=d.subscription_revision AND (s.configuration->>'enabled')::boolean AND {EVENT_AUTHORITY})"))
            .bind(claim.id).bind(claim.lease).fetch_one(&self.pool).await?)
    }
    pub async fn finish_event_delivery(
        &self,
        claim: &EventDeliveryClaim,
        status: Option<u16>,
        failure: Option<&str>,
    ) -> Result<(), StoreError> {
        if status.is_some_and(|value| !(100..=599).contains(&value))
            || failure.is_some_and(|value| {
                !["transport", "destination", "signature", "http", "authority"].contains(&value)
            })
        {
            return Err(StoreError::InvalidObservation);
        }
        let success = status.is_some_and(|value| (200..=299).contains(&value)) && failure.is_none();
        if !success && failure.is_none() {
            return Err(StoreError::InvalidObservation);
        }
        let terminal = success
            || claim.attempt >= 8
            || matches!(failure, Some("destination" | "signature" | "authority"));
        let state = if success {
            "delivered"
        } else if failure == Some("authority") {
            "cancelled"
        } else if terminal {
            "failed"
        } else {
            "pending"
        };
        let delay: i32 = 1 << (claim.attempt - 1).clamp(0, 7);
        let mut tx = self.begin_bounded_recording().await?;
        // Match lock order with configuration updates/claims to avoid deadlocks.
        sqlx::query("SELECT id FROM workspace_event_subscriptions WHERE id=$1 FOR UPDATE")
            .bind(claim.subscription_id)
            .fetch_optional(&mut *tx)
            .await?;
        let changed = sqlx::query("UPDATE workspace_event_deliveries SET state=$3,response_status=$4,failure_kind=$5,lease_id=NULL,lease_until=NULL,available_at=clock_timestamp()+make_interval(secs=>$6),updated_at=clock_timestamp() WHERE id=$1 AND lease_id=$2 AND state='sending'")
            .bind(claim.id).bind(claim.lease).bind(state).bind(status.map(|value| value as i16)).bind(failure).bind(delay as f64).execute(&mut *tx).await?;
        if changed.rows_affected() != 1 {
            return Err(StoreError::Conflict);
        }
        if terminal {
            sqlx::query("UPDATE workspace_event_subscriptions SET cursor=GREATEST(cursor,$2) WHERE id=$1 AND revision=$3")
                .bind(claim.subscription_id).bind(claim.sequence).bind(claim.subscription_revision).execute(&mut *tx).await?;
        }
        tx.commit().await?;
        Ok(())
    }
    pub async fn event_deliveries(
        &self,
        scope: TenantScope,
        slug: &str,
    ) -> Result<Vec<Value>, StoreError> {
        Ok(sqlx::query_scalar("SELECT jsonb_build_object('id',d.id,'subscription_revision',d.subscription_revision,'sequence',d.event_sequence::text,'state',d.state,'attempts',d.attempts,'response_status',d.response_status,'failure_kind',d.failure_kind,'updated_at',d.updated_at,'lease_expires_at',d.lease_until,'lease_expired',COALESCE(d.state='sending' AND d.lease_until<=clock_timestamp(),false),'next_attempt_at',CASE WHEN d.state='pending' THEN d.available_at ELSE NULL END) FROM workspace_event_deliveries d JOIN workspace_event_subscriptions s ON s.id=d.subscription_id WHERE s.organization_id=$1 AND s.project_id=$2 AND s.slug=$3 ORDER BY d.updated_at DESC,d.id DESC LIMIT 100")
            .bind(scope.organization_id).bind(scope.project_id).bind(slug).fetch_all(&self.pool).await?)
    }
}
