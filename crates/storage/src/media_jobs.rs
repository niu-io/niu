//! Internal asynchronous job binding and monotonic query-status evidence.
use crate::{Store, StoreError, TenantScope};
use sqlx::Row;
use uuid::Uuid;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum MediaJobStatus {
    Queued,
    Running,
    Succeeded,
    Failed,
    Unknown,
    Conflicting,
}

impl MediaJobStatus {
    fn observation(self) -> Option<&'static str> {
        match self {
            Self::Queued => Some("queued"),
            Self::Running => Some("running"),
            Self::Succeeded => Some("succeeded"),
            Self::Failed => Some("failed"),
            Self::Unknown => Some("unknown"),
            Self::Conflicting => None,
        }
    }
}

/// Internal transport context; intentionally neither Debug nor Serialize.
pub struct MediaRecoveryRoute {
    pub vendor_id: Uuid,
    pub channel: String,
    pub upstream_job_id: String,
    pub upstream_model: String,
    pub adapter: String,
    pub api_base: String,
    pub credential_ciphertext: Vec<u8>,
}

/// Internal recovery queue metadata; never a customer-facing identifier list.
pub struct MediaRecoveryCandidate {
    pub attempt_id: Uuid,
    pub has_upstream_reference: bool,
}

/// A measured network span, independent of Provider generation timestamps.
pub struct MediaTransportTiming {
    pub id: Uuid,
    pub phase: &'static str,
    pub started_unix_ms: i64,
    pub elapsed_ms: i64,
    pub received: bool,
    /// Safe failure metadata only; never implies nonexecution or a refund.
    pub upstream_http_status: Option<i32>,
}

/// Internal leased query identity; key authorization is rechecked by the worker.
pub struct MediaQueryLease {
    pub attempt_id: Uuid,
    pub scope: TenantScope,
    pub key_id: Uuid,
    pub owner: Uuid,
}

impl Store {
    /// Customer-only projection from one database snapshot. Never serialize the
    /// internal pricing document, route, offer/customer IDs or procurement rates.
    pub async fn media_billing_for_key(
        &self,
        principal: &crate::Principal,
        attempt: Uuid,
    ) -> Result<Option<serde_json::Value>, StoreError> {
        use serde_json::json;
        if self
            .media_job_state_for_key(principal, attempt)
            .await?
            .is_none()
        {
            return Ok(None);
        }
        let scope = principal.scope();
        let row=sqlx::query("SELECT p.snapshot,s.document AS output_snapshot,EXISTS(SELECT 1 FROM personal_attempt_routes x WHERE x.attempt_id=a.id) AS personal,r.amount_nanos AS reserved,(r.released_at IS NOT NULL) AS released,c.amount_nanos AS charged,c.explanation AS settled_receipt,c.bound_exceeded,EXISTS(SELECT 1 FROM customer_activity_charges posted WHERE posted.attempt_id=a.id AND posted.organization_id=a.organization_id AND posted.project_id=a.project_id AND posted.currency=c.currency AND posted.amount_nanos=c.amount_nanos) AS posted,EXISTS(SELECT 1 FROM media_job_observations o WHERE o.attempt_id=a.id AND o.status='failed') AS failed,EXISTS(SELECT 1 FROM media_job_observations o WHERE o.attempt_id=a.id AND o.status='succeeded') AS succeeded,COALESCE((SELECT jsonb_agg(u) FROM (SELECT DISTINCT meter,quantity FROM customer_media_usage_observations WHERE attempt_id=a.id LIMIT 2) u),'[]'::jsonb) AS usage FROM attempts a LEFT JOIN media_output_snapshots s ON s.attempt_id=a.id LEFT JOIN customer_media_attempt_pricing p ON p.attempt_id=a.id LEFT JOIN customer_balance_reservations r ON r.attempt_id=a.id LEFT JOIN customer_media_charges c ON c.attempt_id=a.id WHERE a.organization_id=$1 AND a.project_id=$2 AND a.id=$3")
            .bind(scope.organization_id).bind(scope.project_id).bind(attempt).fetch_one(&self.pool).await?;
        let output_snapshot: Option<serde_json::Value> = row.get("output_snapshot");
        let (effective_output, mut estimate, estimated_usage) = if let Some(saved) = output_snapshot
        {
            let output: niu_media::output::EffectiveVideoOutput =
                serde_json::from_value(saved["output"].clone())
                    .map_err(|_| StoreError::InvalidUsage)?;
            let usage = output
                .estimate(niu_metered_cost::Quantity::integer(0))
                .map_err(|_| StoreError::InvalidUsage)?;
            let niu_metered_cost::Usage::Known {
                ref meter,
                quantity,
                provenance,
            } = usage
            else {
                return Err(StoreError::InvalidUsage);
            };
            let recorded = json!({"meter":meter,"quantity":quantity,"provenance":provenance});
            if saved["estimated_usage"] != recorded {
                return Err(StoreError::InvalidUsage);
            }
            (
                Some(serde_json::to_value(output).map_err(|_| StoreError::InvalidUsage)?),
                Some(
                    json!({"meter":meter,"quantity":quantity,"provenance":"Estimate","currency":null,"amount_nanos":null}),
                ),
                Some(usage),
            )
        } else {
            (None, None, None)
        };
        let snapshot: Option<serde_json::Value> = row.get("snapshot");
        let Some(snapshot) = snapshot else {
            let mode = if row.get::<bool, _>("personal") {
                "owner_funded"
            } else {
                "unavailable"
            };
            return Ok(Some(
                json!({"mode":mode,"state":mode,"currency":null,"reserved_nanos":null,"charge_nanos":null,"usage":null,"price":null,"settled_usage":null,"bound_exceeded":null,"effective_output":effective_output,"estimate":estimate}),
            ));
        };
        let pricing = niu_metered_cost::PricingSnapshot::decode(&snapshot.to_string())
            .map_err(|_| StoreError::InvalidPrice)?;
        if let (Some(estimate), Some(usage)) = (&mut estimate, &estimated_usage)
            && let Ok(receipt) = pricing.calculate(usage)
            && let Ok(amount) = crate::media_pricing::receipt_nanos(&receipt)
        {
            estimate["currency"] = json!(receipt.currency);
            estimate["amount_nanos"] = json!(amount.to_string());
        }
        let tariff = pricing.tariff();
        let usages: serde_json::Value = row.get("usage");
        let usages = usages.as_array().ok_or(StoreError::InvalidUsage)?;
        let usage = if usages.len() == 1 {
            Some(usages[0].clone())
        } else {
            None
        };
        let unpriceable = if let Some(usage) = &usage {
            let meter = usage["meter"]
                .as_str()
                .ok_or(StoreError::InvalidUsage)?
                .to_owned();
            let quantity = serde_json::from_value(usage["quantity"].clone())
                .map_err(|_| StoreError::InvalidUsage)?;
            pricing
                .calculate(&niu_metered_cost::Usage::Known {
                    meter,
                    quantity,
                    provenance: niu_metered_cost::Provenance::Reported,
                })
                .is_err()
        } else {
            false
        };
        let posted = row.get::<Option<bool>, _>("posted").unwrap_or(false);
        let charged: Option<i64> = row.get("charged");
        let settled_usage = if posted {
            let saved: serde_json::Value = row
                .get::<Option<serde_json::Value>, _>("settled_receipt")
                .ok_or(StoreError::InvalidUsage)?;
            let quantity: niu_metered_cost::Quantity =
                serde_json::from_value(saved["measured_quantity"].clone())
                    .map_err(|_| StoreError::InvalidUsage)?;
            let receipt = pricing
                .calculate(&niu_metered_cost::Usage::Known {
                    meter: pricing.tariff().meter.clone(),
                    quantity,
                    provenance: niu_metered_cost::Provenance::Reported,
                })
                .map_err(|_| StoreError::InvalidPrice)?;
            if serde_json::to_value(&receipt).map_err(|_| StoreError::InvalidUsage)? != saved
                || Some(crate::media_pricing::receipt_nanos(&receipt)?) != charged
            {
                return Err(StoreError::InvalidUsage);
            }
            Some(
                json!({"meter":receipt.meter,"quantity":receipt.measured_quantity,
                "billable_quantity":receipt.billable_quantity,"provenance":"Reported"}),
            )
        } else {
            None
        };
        let exceeded: Option<bool> = row.get("bound_exceeded");
        let state = if usages.len() > 1
            || unpriceable
            || row.get::<bool, _>("failed")
            || exceeded == Some(true)
        {
            "reconciliation_required"
        } else if posted {
            "settled"
        } else if row.get::<bool, _>("succeeded") && usage.is_some() {
            "awaiting_settlement"
        } else if row.get::<bool, _>("succeeded") {
            "awaiting_usage"
        } else {
            "reserved"
        };
        let reserved = if row.get::<bool, _>("released") {
            Some("0".to_owned())
        } else {
            row.get::<Option<i64>, _>("reserved").map(|v| v.to_string())
        };
        let discounts:Vec<_>=pricing.discounts().iter().map(|d|json!({"multiplier":d.multiplier,"stacking":d.stacking,"effective_from":d.effective_from.to_string(),"effective_until":d.effective_until.map(|v|v.to_string())})).collect();
        Ok(Some(
            json!({"mode":"customer","state":state,"currency":tariff.currency,"reserved_nanos":reserved,
                "charge_nanos":if posted {charged.map(|v|v.to_string())} else {None},"usage":usage,"bound_exceeded":exceeded,
                "effective_output":effective_output,"estimate":estimate,"settled_usage":settled_usage,
                "price":{"meter":tariff.meter,"amount_units":tariff.amount_units.to_string(),"decimal_places":tariff.decimal_places,
                    "per_quantity":tariff.per_quantity,"minimum_quantity":tariff.minimum_quantity,"rounding":tariff.rounding,
                    "resolution":tariff.dimensions.resolution,"reference_video":tariff.dimensions.reference_video,
                    "effective_from":tariff.effective_from.to_string(),"effective_until":tariff.effective_until.map(|v|v.to_string()),"discounts":discounts}
            }),
        ))
    }
    /// Ensure the newly pinned route is the same configuration resolved for
    /// request validation, pricing and credential decryption. The dispatch
    /// trigger subsequently checks this immutable pin against current state.
    pub async fn require_media_dispatch_route(
        &self,
        scope: TenantScope,
        attempt: Uuid,
        route: &crate::VendorRoute,
    ) -> Result<(), StoreError> {
        let schema = route
            .model
            .capabilities
            .get("video_schema")
            .and_then(|v| v.get("revision"))
            .and_then(serde_json::Value::as_str)
            .ok_or(StoreError::Conflict)?;
        let matched: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM media_recovery_routes WHERE organization_id=$1 AND project_id=$2 AND attempt_id=$3 AND vendor_id=$4 AND vendor_revision=$5 AND model_revision=$6 AND schema_revision=$7 AND upstream_model=$8 AND adapter=$9 AND api_base=$10)")
            .bind(scope.organization_id).bind(scope.project_id).bind(attempt)
            .bind(route.vendor.id).bind(route.vendor.revision).bind(route.model.revision)
            .bind(schema).bind(&route.model.upstream_model).bind(&route.vendor.adapter).bind(&route.vendor.api_base)
            .fetch_one(&self.pool).await?;
        if !matched {
            return Err(StoreError::Conflict);
        }
        Ok(())
    }
    /// Rebuild scheduling from durable jobs after a crash between receipt and
    /// enqueue. Only existing owner-funded direct jobs enter this initial queue.
    pub async fn enqueue_pending_personal_media_queries(&self) -> Result<u64, StoreError> {
        Ok(sqlx::query("INSERT INTO media_query_schedule(attempt_id) SELECT a.id FROM attempts a JOIN media_jobs j ON j.attempt_id=a.id JOIN media_recovery_routes r ON r.attempt_id=a.id JOIN media_recovery_protocols protocol ON protocol.attempt_id=r.attempt_id JOIN personal_attempt_routes p ON p.attempt_id=a.id JOIN vendor_models m ON m.alias=a.resource_id AND m.vendor_id=r.vendor_id WHERE a.execution='may_have_executed' AND a.api_key_id IS NOT NULL AND protocol.channel IN ('ark-direct-v1','openrouter-video-v1') AND NOT EXISTS(SELECT 1 FROM media_query_schedule existing WHERE existing.attempt_id=a.id) ORDER BY a.id LIMIT 100 ON CONFLICT(attempt_id) DO NOTHING").execute(&self.pool).await?.rows_affected())
    }

    /// Reconstruct direct-channel polling from original jobs and accounting
    /// bindings. Completed customer jobs with unposted liability remain eligible
    /// after a crash; a terminal generation label is not settlement evidence.
    pub async fn enqueue_pending_media_queries(&self) -> Result<u64, StoreError> {
        // A rotated original secret may have stopped polling before its replacement
        // was resolved. Resume queries only for nonterminal jobs in that same lineage.
        sqlx::query("UPDATE media_query_schedule s SET stopped=false,next_poll_at=now() FROM attempts a JOIN api_keys original ON original.id=a.api_key_id WHERE s.attempt_id=a.id AND s.stopped AND a.execution='may_have_executed' AND (original.revoked_at IS NOT NULL OR original.expires_at<=clock_timestamp()) AND NOT EXISTS(SELECT 1 FROM media_job_observations o WHERE o.attempt_id=a.id AND o.status IN ('succeeded','failed')) AND EXISTS(SELECT 1 FROM api_keys current WHERE current.spending_root_id=original.spending_root_id AND current.organization_id=a.organization_id AND current.project_id=a.project_id AND current.revoked_at IS NULL AND current.expires_at>clock_timestamp() AND ('*'=ANY(current.allowed_models) OR a.resource_id=ANY(current.allowed_models)))")
            .execute(&self.pool).await?;

        Ok(sqlx::query("INSERT INTO media_query_schedule(attempt_id) SELECT a.id FROM attempts a JOIN media_jobs j ON j.attempt_id=a.id JOIN media_recovery_routes r ON r.attempt_id=a.id JOIN media_recovery_protocols protocol ON protocol.attempt_id=r.attempt_id JOIN vendor_models m ON m.alias=a.resource_id AND m.vendor_id=r.vendor_id WHERE a.api_key_id IS NOT NULL AND protocol.channel IN ('ark-direct-v1','openrouter-video-v1') AND (EXISTS(SELECT 1 FROM personal_attempt_routes p WHERE p.attempt_id=a.id) OR (EXISTS(SELECT 1 FROM customer_media_attempt_pricing p WHERE p.attempt_id=a.id) AND EXISTS(SELECT 1 FROM provider_attempt_offers o WHERE o.attempt_id=a.id) AND EXISTS(SELECT 1 FROM customer_media_liability_bounds b WHERE b.attempt_id=a.id))) AND (a.execution='may_have_executed' OR (a.execution='confirmed_completed' AND EXISTS(SELECT 1 FROM customer_media_attempt_pricing p WHERE p.attempt_id=a.id) AND NOT EXISTS(SELECT 1 FROM customer_media_charges c JOIN customer_activity_charges posted ON posted.attempt_id=c.attempt_id AND posted.organization_id=c.organization_id AND posted.project_id=c.project_id AND posted.currency=c.currency AND posted.amount_nanos=c.amount_nanos WHERE c.attempt_id=a.id))) AND NOT EXISTS(SELECT 1 FROM media_query_schedule existing WHERE existing.attempt_id=a.id) ORDER BY a.id LIMIT 100 ON CONFLICT(attempt_id) DO NOTHING").execute(&self.pool).await?.rows_affected())
    }

    /// Stop only on generation failure/conflict or successfully reconciled
    /// completion. Missing customer usage or an unposted debit retains recovery.
    pub async fn media_query_recovery_complete(
        &self,
        scope: TenantScope,
        attempt: Uuid,
    ) -> Result<bool, StoreError> {
        match self.media_job_status(scope, attempt).await? {
            Some(MediaJobStatus::Failed | MediaJobStatus::Conflicting) => Ok(true),
            Some(MediaJobStatus::Succeeded) => {
                if self.customer_media_pricing(scope, attempt).await?.is_none() {
                    return Ok(true);
                }
                Ok(sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM customer_media_charges c JOIN customer_activity_charges posted ON posted.attempt_id=c.attempt_id AND posted.organization_id=c.organization_id AND posted.project_id=c.project_id AND posted.currency=c.currency AND posted.amount_nanos=c.amount_nanos WHERE c.organization_id=$1 AND c.project_id=$2 AND c.attempt_id=$3)")
                    .bind(scope.organization_id).bind(scope.project_id).bind(attempt).fetch_one(&self.pool).await?)
            }
            _ => Ok(false),
        }
    }

    /// Reconcile an already evidenced obligation without another network call.
    /// This internal financial recovery uses original immutable pricing and
    /// reported usage; credential revocation never forgives committed liability.
    pub async fn recover_customer_media_settlement(
        &self,
        scope: TenantScope,
        attempt: Uuid,
    ) -> Result<bool, StoreError> {
        if self.customer_media_pricing(scope, attempt).await?.is_none()
            || self.media_job_status(scope, attempt).await? != Some(MediaJobStatus::Succeeded)
            || !matches!(
                self.customer_media_usage_state(scope, attempt).await?,
                crate::MediaUsageState::Agreed(_)
            )
        {
            return Ok(false);
        }
        self.confirm_media_job_completion(scope, attempt).await?;
        let supplier = self.accrue_supplier_media_earning(attempt).await;
        let customer = self.settle_customer_media_charge(scope, attempt).await;
        supplier.and(customer).map(|_| true)
    }

    /// One leased GET per job across replicas. A missing reference never enters
    /// the queue. Lease expiry allows retry of query only, never generation.
    pub async fn claim_media_query(
        &self,
        owner: Uuid,
    ) -> Result<Option<MediaQueryLease>, StoreError> {
        let mut tx = self.pool.begin().await?;
        let row:Option<(Uuid,Uuid,Uuid,Uuid)>=sqlx::query_as("SELECT s.attempt_id,a.organization_id,a.project_id,a.api_key_id FROM media_query_schedule s JOIN attempts a ON a.id=s.attempt_id WHERE NOT s.stopped AND s.next_poll_at<=now() AND (s.lease_until IS NULL OR s.lease_until<=now()) ORDER BY s.next_poll_at,s.attempt_id LIMIT 1 FOR UPDATE OF s SKIP LOCKED").fetch_optional(&mut *tx).await?;
        let Some((attempt_id, organization_id, project_id, key_id)) = row else {
            return Ok(None);
        };
        sqlx::query("UPDATE media_query_schedule SET lease_owner=$2,lease_until=now()+interval '90 seconds' WHERE attempt_id=$1").bind(attempt_id).bind(owner).execute(&mut *tx).await?;
        tx.commit().await?;
        Ok(Some(MediaQueryLease {
            attempt_id,
            scope: TenantScope {
                organization_id,
                project_id,
            },
            key_id,
            owner,
        }))
    }

    /// Finishing an expired/replaced lease cannot overwrite a newer worker.
    /// Normal progress polls every ten seconds; query failures back off to five
    /// minutes. Terminal or access-blocked jobs stop without changing execution.
    pub async fn finish_media_query(
        &self,
        lease: &MediaQueryLease,
        failed: bool,
        stop: bool,
    ) -> Result<(), StoreError> {
        let changed=sqlx::query("UPDATE media_query_schedule SET failures=CASE WHEN $3 THEN LEAST(failures+1,16) ELSE 0 END,next_poll_at=now()+make_interval(secs=>CASE WHEN $3 THEN LEAST(300,10*power(2,LEAST(failures+1,5)))::double precision ELSE 10::double precision END),stopped=$4,lease_owner=NULL,lease_until=NULL WHERE attempt_id=$1 AND lease_owner=$2 AND lease_until>now()")
            .bind(lease.attempt_id).bind(lease.owner).bind(failed).bind(stop).execute(&self.pool).await?.rows_affected();
        if changed != 1 {
            return Err(StoreError::Conflict);
        }
        Ok(())
    }

    pub async fn record_media_transport_timing(
        &self,
        scope: TenantScope,
        attempt: Uuid,
        timing: &MediaTransportTiming,
    ) -> Result<(), StoreError> {
        if timing
            .upstream_http_status
            .is_some_and(|status| timing.received || !(100..=599).contains(&status))
            || !matches!(timing.phase, "submission" | "query")
            || !(0..=9007199254740991).contains(&timing.started_unix_ms)
            || !(0..=120000).contains(&timing.elapsed_ms)
        {
            return Err(StoreError::Conflict);
        }
        sqlx::query("INSERT INTO media_transport_timings(id,organization_id,project_id,attempt_id,phase,started_unix_ms,elapsed_ms,outcome,upstream_http_status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)")
            .bind(timing.id).bind(scope.organization_id).bind(scope.project_id).bind(attempt).bind(timing.phase).bind(timing.started_unix_ms).bind(timing.elapsed_ms).bind(if timing.received {"received"} else {"unavailable"}).bind(timing.upstream_http_status).execute(&self.pool).await?;
        Ok(())
    }

    /// Last 100 measured spans, ordered chronologically with explicit truncation.
    /// The response contains no internal timing IDs, upstream identities, URLs or response bodies.
    pub async fn media_transport_timings_for_key(
        &self,
        principal: &crate::Principal,
        attempt: Uuid,
    ) -> Result<Option<serde_json::Value>, StoreError> {
        if self
            .media_job_state_for_key(principal, attempt)
            .await?
            .is_none()
        {
            return Ok(None);
        }
        let scope = principal.scope();
        let mut rows: Vec<serde_json::Value> = sqlx::query_scalar("SELECT jsonb_build_object('phase',phase,'started_unix_ms',started_unix_ms,'elapsed_ms',elapsed_ms,'outcome',outcome,'upstream_http_status',upstream_http_status) FROM media_transport_timings WHERE organization_id=$1 AND project_id=$2 AND attempt_id=$3 ORDER BY started_unix_ms DESC,id DESC LIMIT 101")
            .bind(scope.organization_id).bind(scope.project_id).bind(attempt).fetch_all(&self.pool).await?;
        let has_more = rows.len() > 100;
        rows.truncate(100);
        rows.reverse();
        // First observations survive polling duplicates and restart. They are
        // gateway observation times, never claimed as exact Supplier transitions.
        let lifecycle: serde_json::Value = sqlx::query_scalar(
            "SELECT jsonb_build_object('source','gateway_observation','submitted_unix_ms',floor(extract(epoch FROM a.dispatched_at)*1000)::bigint,'observations',COALESCE((SELECT jsonb_agg(jsonb_build_object('status',o.status,'observed_unix_ms',floor(extract(epoch FROM o.created_at)*1000)::bigint) ORDER BY o.created_at,o.status) FROM media_job_observations o WHERE o.organization_id=a.organization_id AND o.project_id=a.project_id AND o.attempt_id=a.id),'[]'::jsonb),'conflicting_terminal',EXISTS(SELECT 1 FROM media_job_observations o WHERE o.attempt_id=a.id AND o.status='succeeded') AND EXISTS(SELECT 1 FROM media_job_observations o WHERE o.attempt_id=a.id AND o.status='failed')) FROM attempts a WHERE a.organization_id=$1 AND a.project_id=$2 AND a.id=$3",
        ).bind(scope.organization_id).bind(scope.project_id).bind(attempt).fetch_one(&self.pool).await?;
        Ok(Some(
            serde_json::json!({"data":rows,"has_more":has_more,"lifecycle":lifecycle}),
        ))
    }

    /// Customer-safe durable state. No upstream identifiers, credentials, result
    /// URLs or procurement values enter this response. Caller authenticates a
    /// current key; model grants are enforced here independently of the handler.
    /// Bounded durable workspace history, filtered by the key's current model
    /// grants. Cursors belong to accessible jobs; upstream identities and
    /// procurement data never enter this projection. No Provider calls occur.
    pub async fn media_jobs_for_key(
        &self,
        principal: &crate::Principal,
        before: Option<Uuid>,
        limit: i64,
    ) -> Result<serde_json::Value, StoreError> {
        if !(1..=100).contains(&limit) {
            return Err(StoreError::InvalidMediaQuery);
        }
        let scope = principal.scope();
        if let Some(cursor) = before {
            let accessible: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM attempts a JOIN media_recovery_routes r ON r.attempt_id=a.id JOIN api_keys k ON k.id=$4 AND k.organization_id=a.organization_id AND k.project_id=a.project_id WHERE a.organization_id=$1 AND a.project_id=$2 AND a.id=$3 AND a.dispatched_at IS NOT NULL AND k.revoked_at IS NULL AND k.expires_at>clock_timestamp() AND ('*'=ANY(k.allowed_models) OR a.resource_id=ANY(k.allowed_models)))")
                .bind(scope.organization_id).bind(scope.project_id).bind(cursor).bind(principal.key_id()).fetch_one(&self.pool).await?;
            if !accessible {
                return Err(StoreError::InvalidMediaQuery);
            }
        }
        let mut rows: Vec<serde_json::Value> = sqlx::query_scalar("SELECT jsonb_build_object('id',a.id,'object','video.job','model',a.resource_id,'created_at_ms',floor(extract(epoch FROM a.created_at)*1000)::bigint::text,'status',CASE WHEN j.attempt_id IS NULL THEN 'submission_unknown' WHEN 'succeeded'=ANY(o.statuses) AND 'failed'=ANY(o.statuses) THEN 'reconciliation_required' WHEN 'succeeded'=ANY(o.statuses) THEN 'succeeded' WHEN 'failed'=ANY(o.statuses) THEN 'failed' WHEN 'unknown'=ANY(o.statuses) OR cardinality(o.statuses)=0 THEN 'unknown' WHEN 'running'=ANY(o.statuses) THEN 'running' ELSE 'queued' END) FROM attempts a JOIN media_recovery_routes r ON r.attempt_id=a.id JOIN api_keys k ON k.id=$3 AND k.organization_id=a.organization_id AND k.project_id=a.project_id LEFT JOIN media_jobs j ON j.attempt_id=a.id LEFT JOIN LATERAL (SELECT ARRAY(SELECT status FROM media_job_observations WHERE attempt_id=a.id) AS statuses) o ON true WHERE a.organization_id=$1 AND a.project_id=$2 AND a.dispatched_at IS NOT NULL AND k.revoked_at IS NULL AND k.expires_at>clock_timestamp() AND ('*'=ANY(k.allowed_models) OR a.resource_id=ANY(k.allowed_models)) AND ($4::uuid IS NULL OR (a.created_at,a.id)<(SELECT created_at,id FROM attempts WHERE id=$4)) ORDER BY a.created_at DESC,a.id DESC LIMIT $5")
            .bind(scope.organization_id).bind(scope.project_id).bind(principal.key_id()).bind(before).bind(limit+1).fetch_all(&self.pool).await?;
        let more = rows.len() > limit as usize;
        rows.truncate(limit as usize);
        let next = if more {
            rows.last()
                .and_then(|row| row["id"].as_str())
                .map(str::to_owned)
        } else {
            None
        };
        Ok(serde_json::json!({"data":rows,"has_more":more,"next_before":next}))
    }

    pub async fn media_job_state_for_key(
        &self,
        principal: &crate::Principal,
        attempt: Uuid,
    ) -> Result<Option<serde_json::Value>, StoreError> {
        Ok(self
            .media_job_snapshot_for_key(principal, attempt)
            .await?
            .map(|(_, job)| job))
    }

    /// Read dispatch and job observations from one statement snapshot, so an
    /// intent restore cannot combine pre-dispatch state with a later job state.
    pub async fn media_job_snapshot_for_key(
        &self,
        principal: &crate::Principal,
        attempt: Uuid,
    ) -> Result<Option<(bool, serde_json::Value)>, StoreError> {
        let scope = principal.scope();
        let row: Option<(String, bool, Option<Vec<String>>)> = sqlx::query_as(
            "SELECT a.resource_id, a.dispatched_at IS NOT NULL,
             CASE WHEN j.attempt_id IS NULL THEN NULL ELSE
               ARRAY(SELECT status FROM media_job_observations o WHERE o.attempt_id=a.id)
             END
             FROM attempts a LEFT JOIN media_jobs j
               ON j.attempt_id=a.id AND j.organization_id=a.organization_id AND j.project_id=a.project_id
             WHERE a.organization_id=$1 AND a.project_id=$2 AND a.id=$3
               AND ((a.dispatched_at IS NOT NULL AND EXISTS(SELECT 1 FROM media_recovery_routes r WHERE r.attempt_id=a.id))
                    OR EXISTS(SELECT 1 FROM media_submission_keys s WHERE s.attempt_id=a.id))",
        )
        .bind(scope.organization_id)
        .bind(scope.project_id)
        .bind(attempt)
        .fetch_optional(&self.pool)
        .await?;
        let Some((model, dispatched, observations)) =
            row.filter(|(model, _, _)| principal.allows_model(model))
        else {
            return Ok(None);
        };
        let status = match observations.map(media_status_from_observations) {
            None => "submission_unknown",
            Some(MediaJobStatus::Queued) => "queued",
            Some(MediaJobStatus::Running) => "running",
            Some(MediaJobStatus::Succeeded) => "succeeded",
            Some(MediaJobStatus::Failed) => "failed",
            Some(MediaJobStatus::Unknown) => "unknown",
            Some(MediaJobStatus::Conflicting) => "reconciliation_required",
        };
        Ok(Some((
            dispatched,
            serde_json::json!({"id":attempt,"object":"video.job","model":model,"status":status}),
        )))
    }

    /// Apply a decoded query only to its original durable identity. The caller
    /// must authenticate transport and qualify the protocol/meter first. Safe to
    /// repeat after a crash between writes; settlement retains its own atomic
    /// ledger transaction and conflict checks. No asset URLs are persisted here.
    pub async fn apply_media_query_observation(
        &self,
        scope: TenantScope,
        attempt: Uuid,
        observation: &niu_media::query::QueryObservation,
    ) -> Result<Option<i64>, StoreError> {
        use niu_media::query::{QueryStatus, ReportedQuantity};
        let identity: Option<(String,String)> = sqlx::query_as("SELECT j.upstream_job_id,r.upstream_model FROM media_jobs j JOIN media_recovery_routes r ON r.attempt_id=j.attempt_id WHERE j.organization_id=$1 AND j.project_id=$2 AND j.attempt_id=$3")
            .bind(scope.organization_id).bind(scope.project_id).bind(attempt).fetch_optional(&self.pool).await?;
        if identity
            .as_ref()
            .map(|(job, model)| (job.as_str(), model.as_str()))
            != Some((observation.upstream_job(), observation.upstream_model()))
        {
            return Err(StoreError::Conflict);
        }
        // Preserve reported/missing/invalid usage even for owner-funded jobs,
        // independently of commercial pricing or settlement.
        use sha2::{Digest, Sha256};
        let metadata = observation.metadata();
        let bytes = serde_json::to_vec(&metadata).map_err(|_| StoreError::InvalidUsage)?;
        if bytes.len() > 8192 {
            return Err(StoreError::InvalidUsage);
        }
        let mut tx = self.pool.begin().await?;
        sqlx::query("INSERT INTO media_query_evidence(organization_id,project_id,attempt_id,receipt_sha256,metadata) VALUES($1,$2,$3,$4,$5) ON CONFLICT(attempt_id,receipt_sha256) DO NOTHING")
            .bind(scope.organization_id).bind(scope.project_id).bind(attempt).bind(Sha256::digest(bytes).to_vec()).bind(metadata).execute(&mut *tx).await?;
        // Keep reported attribution distinct from the configured recovery route.
        // A receipt and its attribution commit together; replay cannot overwrite
        // a different identity or invent a value when the provider omitted it.
        if let Some(model) = observation
            .reported_model()
            .filter(|model| model.len() <= 200)
        {
            let changed = sqlx::query("UPDATE attempts SET provider_model=$4 WHERE organization_id=$1 AND project_id=$2 AND id=$3 AND dispatched_at IS NOT NULL AND (provider_model IS NULL OR provider_model=$4)")
                .bind(scope.organization_id).bind(scope.project_id).bind(attempt).bind(model)
                .execute(&mut *tx).await?.rows_affected();
            if changed != 1 {
                return Err(StoreError::Conflict);
            }
        }
        tx.commit().await?;
        let status = match observation.status {
            QueryStatus::Queued => MediaJobStatus::Queued,
            QueryStatus::Running => MediaJobStatus::Running,
            QueryStatus::Succeeded => MediaJobStatus::Succeeded,
            // Retain the precise terminal reason in query evidence above.
            // Generation failure stops polling; it does not settle or release funds.
            QueryStatus::Failed | QueryStatus::Cancelled | QueryStatus::Expired => {
                MediaJobStatus::Failed
            }
            QueryStatus::Unknown => MediaJobStatus::Unknown,
        };
        self.record_media_job_status(scope, attempt, status).await?;
        let priced = self.customer_media_pricing(scope, attempt).await?.is_some();
        if priced && let ReportedQuantity::Reported(quantity) = observation.quantity {
            self.record_customer_media_usage(
                scope,
                attempt,
                crate::MediaUsageSource::Query,
                &niu_metered_cost::Usage::Known {
                    meter: observation.meter().into(),
                    quantity: niu_metered_cost::Quantity::integer(u128::from(quantity)),
                    provenance: niu_metered_cost::Provenance::Reported,
                },
            )
            .await?;
        }
        if self.media_job_status(scope, attempt).await? != Some(MediaJobStatus::Succeeded) {
            return Ok(None);
        }
        self.confirm_media_job_completion(scope, attempt).await?;
        // Both liabilities use independent agreed rates. Persist one even when
        // the other's validation or storage operation requires a later retry.
        let supplier = if matches!(observation.quantity, ReportedQuantity::Reported(_)) {
            self.accrue_supplier_media_earning(attempt).await
        } else {
            Ok(())
        };
        let customer = async {
            if priced
                && matches!(observation.quantity, ReportedQuantity::Reported(_))
                && matches!(
                    self.customer_media_usage_state(scope, attempt).await?,
                    crate::MediaUsageState::Agreed(_)
                )
            {
                self.settle_customer_media_charge(scope, attempt)
                    .await
                    .map(Some)
            } else {
                Ok(None)
            }
        }
        .await;
        supplier.and(customer)
    }

    /// Bounded keyset sweep over durable dispatch intent. Includes crashes before
    /// an uncertainty marker or returned job reference was persisted. Start a new
    /// sweep after reaching the end: concurrent admissions may sort before cursor.
    /// This list neither claims work nor authorizes egress; workers must recheck
    /// the original route and never POST to replace a missing reference.
    pub async fn media_recovery_candidates(
        &self,
        scope: TenantScope,
        after: Option<Uuid>,
        limit: u32,
    ) -> Result<Vec<MediaRecoveryCandidate>, StoreError> {
        if !(1..=100).contains(&limit) {
            return Err(StoreError::Conflict);
        }
        let rows: Vec<(Uuid, bool)> = sqlx::query_as("SELECT a.id,EXISTS(SELECT 1 FROM media_jobs j WHERE j.attempt_id=a.id) FROM attempts a JOIN media_recovery_routes r ON r.attempt_id=a.id WHERE a.organization_id=$1 AND a.project_id=$2 AND a.dispatched_at IS NOT NULL AND ($3::uuid IS NULL OR a.id>$3) AND (a.execution='may_have_executed' OR (a.execution='confirmed_completed' AND EXISTS(SELECT 1 FROM customer_media_attempt_pricing p WHERE p.attempt_id=a.id) AND NOT EXISTS(SELECT 1 FROM customer_media_charges c JOIN customer_activity_charges posted ON posted.attempt_id=c.attempt_id AND posted.organization_id=c.organization_id AND posted.project_id=c.project_id AND posted.currency=c.currency AND posted.amount_nanos=c.amount_nanos WHERE c.attempt_id=a.id))) ORDER BY a.id LIMIT $4")
            .bind(scope.organization_id).bind(scope.project_id).bind(after).bind(i64::from(limit)).fetch_all(&self.pool).await?;
        Ok(rows
            .into_iter()
            .map(
                |(attempt_id, has_upstream_reference)| MediaRecoveryCandidate {
                    attempt_id,
                    has_upstream_reference,
                },
            )
            .collect())
    }

    /// Persist a lost/unusable submission response without inventing a job ID or
    /// releasing its financial hold. Repeated observations are idempotent.
    pub async fn record_media_submission_uncertainty(
        &self,
        scope: TenantScope,
        attempt: Uuid,
    ) -> Result<(), StoreError> {
        let mut tx = self.pool.begin().await?;
        let dispatched: Option<bool> = sqlx::query_scalar("SELECT dispatched_at IS NOT NULL FROM attempts WHERE organization_id=$1 AND project_id=$2 AND id=$3 FOR UPDATE")
            .bind(scope.organization_id).bind(scope.project_id).bind(attempt).fetch_optional(&mut *tx).await?;
        if dispatched != Some(true) {
            return Err(StoreError::Conflict);
        }
        let pinned: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM media_recovery_routes WHERE organization_id=$1 AND project_id=$2 AND attempt_id=$3)")
            .bind(scope.organization_id).bind(scope.project_id).bind(attempt).fetch_one(&mut *tx).await?;
        if !pinned {
            return Err(StoreError::Conflict);
        }
        sqlx::query("INSERT INTO media_submission_uncertainty(organization_id,project_id,attempt_id) VALUES($1,$2,$3) ON CONFLICT(attempt_id) DO NOTHING")
            .bind(scope.organization_id).bind(scope.project_id).bind(attempt).execute(&mut *tx).await?;
        tx.commit().await?;
        Ok(())
    }

    /// Recovery cannot query an unknown upstream reference. A later immutable
    /// binding resolves this condition without deleting its original evidence.
    pub async fn media_submission_is_unresolved(
        &self,
        scope: TenantScope,
        attempt: Uuid,
    ) -> Result<bool, StoreError> {
        Ok(sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM media_submission_uncertainty u WHERE u.organization_id=$1 AND u.project_id=$2 AND u.attempt_id=$3 AND NOT EXISTS(SELECT 1 FROM media_jobs j WHERE j.attempt_id=u.attempt_id))")
            .bind(scope.organization_id).bind(scope.project_id).bind(attempt).fetch_one(&self.pool).await?)
    }
    /// Pin current route identity before egress. This is not live model or
    /// commercial qualification, nor a replacement for dispatch authorization.
    pub async fn pin_media_recovery_route(
        &self,
        scope: TenantScope,
        attempt: Uuid,
    ) -> Result<(), StoreError> {
        let mut tx = self.pool.begin().await?;
        let row = sqlx::query("SELECT m.alias,v.id,v.revision AS vendor_revision,m.revision AS model_revision,m.upstream_model,m.capabilities,v.adapter,v.api_base FROM attempts a JOIN vendor_models m ON m.alias=a.resource_id JOIN vendors v ON v.id=m.vendor_id WHERE a.organization_id=$1 AND a.project_id=$2 AND a.id=$3 AND m.enabled AND v.enabled AND NOT EXISTS(SELECT 1 FROM personal_vendor_ownership o WHERE o.vendor_id=v.id AND o.organization_id<>a.organization_id) FOR SHARE OF v,m")
            .bind(scope.organization_id).bind(scope.project_id).bind(attempt).fetch_optional(&mut *tx).await?.ok_or(StoreError::Conflict)?;
        let unsent: Option<bool> = sqlx::query_scalar("SELECT dispatched_at IS NULL FROM attempts WHERE organization_id=$1 AND project_id=$2 AND id=$3 FOR UPDATE")
            .bind(scope.organization_id).bind(scope.project_id).bind(attempt).fetch_optional(&mut *tx).await?;
        if unsent != Some(true) {
            return Err(StoreError::Conflict);
        }
        let capabilities: serde_json::Value = row.try_get("capabilities")?;
        let schema: niu_media::VideoSchema = serde_json::from_value(
            capabilities
                .get("video_schema")
                .cloned()
                .ok_or(StoreError::Conflict)?,
        )
        .map_err(|_| StoreError::Conflict)?;
        schema.validate().map_err(|_| StoreError::Conflict)?;
        let vendor: Uuid = row.try_get("id")?;
        let vendor_revision: i64 = row.try_get("vendor_revision")?;
        let model_revision: i64 = row.try_get("model_revision")?;
        let upstream: String = row.try_get("upstream_model")?;
        if schema.upstream_model != upstream
            || schema.model_alias != row.try_get::<String, _>("alias")?
        {
            return Err(StoreError::Conflict);
        }
        let adapter: String = row.try_get("adapter")?;
        let api_base: String = row.try_get("api_base")?;
        sqlx::query("INSERT INTO media_recovery_routes(organization_id,project_id,attempt_id,vendor_id,vendor_revision,model_revision,upstream_model,schema_revision,adapter,api_base) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(attempt_id) DO NOTHING")
            .bind(scope.organization_id).bind(scope.project_id).bind(attempt).bind(vendor).bind(vendor_revision).bind(model_revision).bind(&upstream).bind(&schema.revision).bind(&adapter).bind(&api_base).execute(&mut *tx).await?;
        let same: bool = sqlx::query_scalar("SELECT vendor_id=$2 AND vendor_revision=$3 AND model_revision=$4 AND upstream_model=$5 AND schema_revision=$6 AND adapter=$7 AND api_base=$8 FROM media_recovery_routes WHERE attempt_id=$1")
            .bind(attempt).bind(vendor).bind(vendor_revision).bind(model_revision).bind(upstream).bind(schema.revision).bind(adapter).bind(api_base).fetch_one(&mut *tx).await?;
        if !same {
            return Err(StoreError::Conflict);
        }
        sqlx::query("INSERT INTO media_recovery_protocols(attempt_id,channel) VALUES($1,$2) ON CONFLICT(attempt_id) DO NOTHING")
            .bind(attempt).bind(&schema.channel).execute(&mut *tx).await?;
        let same_protocol: bool = sqlx::query_scalar(
            "SELECT channel=$2 FROM media_recovery_protocols WHERE attempt_id=$1",
        )
        .bind(attempt)
        .bind(&schema.channel)
        .fetch_one(&mut *tx)
        .await?;
        if !same_protocol {
            return Err(StoreError::Conflict);
        }
        tx.commit().await?;
        Ok(())
    }

    /// Persist immutable effective output and an explicitly estimated quantity.
    /// Current text-only dispatch has no reference-video duration. Never infer
    /// reference duration from uninspected media or use an estimate as liability.
    pub async fn pin_media_output_snapshot(
        &self,
        scope: TenantScope,
        attempt: Uuid,
        request: &niu_media::ValidatedVideoRequest,
    ) -> Result<(), StoreError> {
        let Some(output) = request.effective_output() else {
            return Ok(());
        };
        if request
            .body()
            .get("content")
            .and_then(serde_json::Value::as_array)
            .is_none_or(|items| {
                items.iter().any(|item| {
                    !matches!(
                        item.get("type").and_then(serde_json::Value::as_str),
                        Some("text" | "image_url")
                    )
                })
            })
        {
            return Err(StoreError::InvalidUsage);
        }
        let niu_metered_cost::Usage::Known {
            meter,
            quantity,
            provenance,
        } = output
            .estimate(niu_metered_cost::Quantity::integer(0))
            .map_err(|_| StoreError::InvalidUsage)?
        else {
            return Err(StoreError::InvalidUsage);
        };
        let document = serde_json::json!({"version":1,"output":output,
            "effective_controls":request.effective_controls(),
            "reference_video_seconds":niu_metered_cost::Quantity::integer(0),
            "estimated_usage":{"meter":meter,"quantity":quantity,"provenance":provenance}});
        let mut tx = self.pool.begin().await?;
        let capabilities: serde_json::Value = sqlx::query_scalar("SELECT m.capabilities FROM media_recovery_routes r JOIN vendors v ON v.id=r.vendor_id JOIN attempts a ON a.id=r.attempt_id JOIN vendor_models m ON m.alias=a.resource_id AND m.vendor_id=r.vendor_id WHERE r.organization_id=$1 AND r.project_id=$2 AND r.attempt_id=$3 AND v.revision=r.vendor_revision AND m.revision=r.model_revision AND v.enabled AND m.enabled AND a.dispatched_at IS NULL FOR SHARE OF v,m")
            .bind(scope.organization_id).bind(scope.project_id).bind(attempt).fetch_optional(&mut *tx).await?.ok_or(StoreError::Conflict)?;
        let schema: niu_media::VideoSchema = serde_json::from_value(
            capabilities
                .get("video_schema")
                .cloned()
                .ok_or(StoreError::Conflict)?,
        )
        .map_err(|_| StoreError::Conflict)?;
        if request
            .body()
            .get("model")
            .and_then(serde_json::Value::as_str)
            != Some(schema.upstream_model.as_str())
            || request.schema_revision() != schema.revision
        {
            return Err(StoreError::Conflict);
        }
        // Validated bodies contain the upstream model; validation accepts the
        // public alias. Restore only that field before checking the pinned schema.
        let mut client_body = request.body().clone();
        client_body["model"] = serde_json::Value::String(schema.model_alias.clone());
        let validated = schema
            .validate_request(
                &serde_json::to_vec(&client_body).map_err(|_| StoreError::InvalidUsage)?,
            )
            .map_err(|_| StoreError::Conflict)?;
        if validated.effective_output() != Some(output)
            || validated.effective_controls() != request.effective_controls()
        {
            return Err(StoreError::Conflict);
        }
        sqlx::query("INSERT INTO media_output_snapshots(organization_id,project_id,attempt_id,document) VALUES($1,$2,$3,$4) ON CONFLICT(attempt_id) DO NOTHING")
            .bind(scope.organization_id).bind(scope.project_id).bind(attempt).bind(&document).execute(&mut *tx).await?;
        let same: bool = sqlx::query_scalar("SELECT document=$4 FROM media_output_snapshots WHERE organization_id=$1 AND project_id=$2 AND attempt_id=$3")
            .bind(scope.organization_id).bind(scope.project_id).bind(attempt).bind(&document).fetch_one(&mut *tx).await?;
        if !same {
            return Err(StoreError::Conflict);
        }
        tx.commit().await?;
        Ok(())
    }

    /// Scoped saved evidence only; never recompute from current capabilities.
    pub async fn media_output_snapshot(
        &self,
        scope: TenantScope,
        attempt: Uuid,
    ) -> Result<Option<serde_json::Value>, StoreError> {
        Ok(sqlx::query_scalar("SELECT document FROM media_output_snapshots WHERE organization_id=$1 AND project_id=$2 AND attempt_id=$3")
            .bind(scope.organization_id).bind(scope.project_id).bind(attempt).fetch_optional(&self.pool).await?)
    }

    /// Model edits cannot change a saved job's protocol or upstream identity.
    /// Credential changes and disabled routes still block egress; never use a
    /// replacement account or replay generation to recover a job.
    pub async fn media_recovery_route(
        &self,
        scope: TenantScope,
        attempt: Uuid,
    ) -> Result<Option<MediaRecoveryRoute>, StoreError> {
        let row = sqlx::query("SELECT r.vendor_id,protocol.channel,j.upstream_job_id,r.upstream_model,r.adapter,r.api_base,v.credential_ciphertext,(protocol.channel IS NOT NULL AND v.enabled AND m.enabled AND v.revision=r.vendor_revision AND v.adapter=r.adapter AND v.api_base=r.api_base AND NOT EXISTS(SELECT 1 FROM personal_vendor_ownership o WHERE o.vendor_id=v.id AND o.organization_id<>r.organization_id)) AS current FROM media_recovery_routes r LEFT JOIN media_recovery_protocols protocol ON protocol.attempt_id=r.attempt_id JOIN media_jobs j ON j.attempt_id=r.attempt_id JOIN vendors v ON v.id=r.vendor_id LEFT JOIN vendor_models m ON m.alias=(SELECT resource_id FROM attempts WHERE id=r.attempt_id) AND m.vendor_id=r.vendor_id WHERE r.organization_id=$1 AND r.project_id=$2 AND r.attempt_id=$3")
            .bind(scope.organization_id).bind(scope.project_id).bind(attempt).fetch_optional(&self.pool).await?;
        let Some(row) = row else {
            return Ok(None);
        };
        if row.try_get::<Option<bool>, _>("current")? != Some(true) {
            return Err(StoreError::Conflict);
        }
        Ok(Some(MediaRecoveryRoute {
            vendor_id: row.try_get("vendor_id")?,
            channel: row.try_get("channel")?,
            upstream_job_id: row.try_get("upstream_job_id")?,
            upstream_model: row.try_get("upstream_model")?,
            adapter: row.try_get("adapter")?,
            api_base: row.try_get("api_base")?,
            credential_ciphertext: row.try_get("credential_ciphertext")?,
        }))
    }

    /// Only a dispatched attempt may bind a returned upstream job. Identical
    /// replay is safe; changing the reference or schema is never a new submission.
    pub async fn bind_media_job(
        &self,
        scope: TenantScope,
        attempt: Uuid,
        upstream_job_id: &str,
        schema_revision: &str,
    ) -> Result<(), StoreError> {
        if upstream_job_id.is_empty()
            || upstream_job_id.len() > 512
            || schema_revision.is_empty()
            || schema_revision.len() > 256
            || upstream_job_id.chars().any(char::is_control)
            || schema_revision.chars().any(char::is_control)
        {
            return Err(StoreError::Conflict);
        }
        let mut tx = self.pool.begin().await?;
        let dispatched: Option<bool> = sqlx::query_scalar("SELECT dispatched_at IS NOT NULL FROM attempts WHERE organization_id=$1 AND project_id=$2 AND id=$3 FOR UPDATE")
            .bind(scope.organization_id).bind(scope.project_id).bind(attempt)
            .fetch_optional(&mut *tx).await?;
        if dispatched != Some(true) {
            return Err(StoreError::Conflict);
        }
        let _vendor: Uuid = sqlx::query_scalar("SELECT vendor_id FROM media_recovery_routes WHERE organization_id=$1 AND project_id=$2 AND attempt_id=$3 AND schema_revision=$4")
            .bind(scope.organization_id).bind(scope.project_id).bind(attempt).bind(schema_revision).fetch_optional(&mut *tx).await?.ok_or(StoreError::Conflict)?;
        sqlx::query("INSERT INTO media_jobs(organization_id,project_id,attempt_id,upstream_job_id,schema_revision) VALUES($1,$2,$3,$4,$5) ON CONFLICT(attempt_id) DO NOTHING")
            .bind(scope.organization_id).bind(scope.project_id).bind(attempt).bind(upstream_job_id).bind(schema_revision)
            .execute(&mut *tx).await?;
        let binding: (String,String) = sqlx::query_as("SELECT upstream_job_id,schema_revision FROM media_jobs WHERE organization_id=$1 AND project_id=$2 AND attempt_id=$3")
            .bind(scope.organization_id).bind(scope.project_id).bind(attempt).fetch_one(&mut *tx).await?;
        if binding != (upstream_job_id.to_owned(), schema_revision.to_owned()) {
            return Err(StoreError::Conflict);
        }
        tx.commit().await?;
        Ok(())
    }

    /// Confirm a bound job only from unopposed success evidence. This does not
    /// imply billable usage, refund entitlement or a settled customer charge.
    pub async fn confirm_media_job_completion(
        &self,
        scope: TenantScope,
        attempt: Uuid,
    ) -> Result<(), StoreError> {
        let mut tx = self.pool.begin().await?;
        Self::confirm_media_job_completion_in_tx(&mut tx, scope, attempt).await?;
        tx.commit().await?;
        Ok(())
    }

    pub(crate) async fn confirm_media_job_completion_in_tx(
        tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
        scope: TenantScope,
        attempt: Uuid,
    ) -> Result<(), StoreError> {
        let execution: Option<String> = sqlx::query_scalar("SELECT execution FROM attempts WHERE organization_id=$1 AND project_id=$2 AND id=$3 FOR UPDATE")
            .bind(scope.organization_id).bind(scope.project_id).bind(attempt).fetch_optional(&mut **tx).await?;
        if !matches!(
            execution.as_deref(),
            Some("may_have_executed" | "confirmed_completed")
        ) {
            return Err(StoreError::Unresolved);
        }
        let success: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM media_jobs j WHERE j.organization_id=$1 AND j.project_id=$2 AND j.attempt_id=$3 AND EXISTS(SELECT 1 FROM media_job_observations WHERE attempt_id=j.attempt_id AND status='succeeded') AND NOT EXISTS(SELECT 1 FROM media_job_observations WHERE attempt_id=j.attempt_id AND status='failed'))")
            .bind(scope.organization_id).bind(scope.project_id).bind(attempt).fetch_one(&mut **tx).await?;
        if !success {
            return Err(StoreError::Unresolved);
        }
        sqlx::query("UPDATE attempts SET execution='confirmed_completed',completed_at=COALESCE(completed_at,now()) WHERE id=$1")
            .bind(attempt).execute(&mut **tx).await?;
        Ok(())
    }

    /// Trusted query adapters normalize statuses. This does not authenticate a
    /// callback or authorize settlement; failed status alone never proves no cost.
    pub async fn record_media_job_status(
        &self,
        scope: TenantScope,
        attempt: Uuid,
        status: MediaJobStatus,
    ) -> Result<(), StoreError> {
        let status = status.observation().ok_or(StoreError::Conflict)?;
        let result = sqlx::query("INSERT INTO media_job_observations(organization_id,project_id,attempt_id,status) SELECT organization_id,project_id,attempt_id,$4 FROM media_jobs WHERE organization_id=$1 AND project_id=$2 AND attempt_id=$3 ON CONFLICT(attempt_id,status) DO NOTHING")
            .bind(scope.organization_id).bind(scope.project_id).bind(attempt).bind(status).execute(&self.pool).await?;
        if result.rows_affected() == 0 && self.media_job_status(scope, attempt).await?.is_none() {
            return Err(StoreError::Conflict);
        }
        Ok(())
    }

    pub async fn media_job_status(
        &self,
        scope: TenantScope,
        attempt: Uuid,
    ) -> Result<Option<MediaJobStatus>, StoreError> {
        let statuses: Option<Vec<String>> = sqlx::query_scalar("SELECT ARRAY(SELECT status FROM media_job_observations o WHERE o.attempt_id=j.attempt_id) FROM media_jobs j WHERE organization_id=$1 AND project_id=$2 AND attempt_id=$3")
            .bind(scope.organization_id).bind(scope.project_id).bind(attempt).fetch_optional(&self.pool).await?;
        Ok(statuses.map(media_status_from_observations))
    }
}

fn media_status_from_observations(values: Vec<String>) -> MediaJobStatus {
    let has = |s| values.iter().any(|v| v == s);
    if has("succeeded") && has("failed") {
        MediaJobStatus::Conflicting
    } else if has("succeeded") {
        MediaJobStatus::Succeeded
    } else if has("failed") {
        MediaJobStatus::Failed
    } else if has("unknown") || values.is_empty() {
        MediaJobStatus::Unknown
    } else if has("running") {
        MediaJobStatus::Running
    } else {
        MediaJobStatus::Queued
    }
}
