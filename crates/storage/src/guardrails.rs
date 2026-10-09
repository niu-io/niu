use crate::{Store, StoreError, TenantScope};
use serde_json::{Value, json};

/// A single database snapshot for policy inspection before dispatch. Dispatch
/// must still recheck current policies under its coordination locks.
#[derive(Debug, Clone, sqlx::FromRow)]
pub struct GuardrailSnapshot {
    #[sqlx(skip)]
    pub input_detector_decision_ids: Vec<uuid::Uuid>,
    #[sqlx(skip)]
    pub input_outcome: Option<String>,
    #[sqlx(skip)]
    pub input_elapsed_ms: Option<i64>,
    pub workspace_revision: Option<i64>,
    pub workspace_policy: Option<Value>,
    pub key_assignment_revision: Option<i64>,
    pub key_policy_revision: Option<i64>,
    pub key_policy: Option<Value>,
}

impl Store {
    pub async fn input_detector_decisions(
        &self,
        scope: TenantScope,
    ) -> Result<Vec<Value>, StoreError> {
        Ok(sqlx::query_scalar("SELECT jsonb_build_object('detector',d.detector_name,'configuration_fingerprint',d.configuration_fingerprint,'stage','input','coverage','local_text','enforcer_version','external-input-v1','outcome',d.outcome,'reason',d.reason,'elapsed_ms',d.elapsed_ms,'key_name',k.name,'workspace_revision',d.workspace_revision,'key_policy_revision',d.key_policy_revision,'key_assignment_revision',d.key_assignment_revision,'recorded_at',d.recorded_at) FROM input_detector_decisions d JOIN api_keys k ON k.organization_id=d.organization_id AND k.project_id=d.project_id AND k.id=d.key_id WHERE d.organization_id=$1 AND d.project_id=$2 ORDER BY d.recorded_at DESC,d.id DESC LIMIT 100")
            .bind(scope.organization_id).bind(scope.project_id).fetch_all(&self.pool).await?)
    }

    pub async fn record_input_detector_decision(
        &self,
        scope: TenantScope,
        key: uuid::Uuid,
        snapshot: &GuardrailSnapshot,
        decision: &Value,
    ) -> Result<uuid::Uuid, StoreError> {
        let id = uuid::Uuid::new_v4();
        sqlx::query("INSERT INTO input_detector_decisions(id,organization_id,project_id,key_id,workspace_revision,key_policy_revision,key_assignment_revision,detector_name,configuration_fingerprint,outcome,reason,elapsed_ms) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)")
            .bind(id).bind(scope.organization_id).bind(scope.project_id).bind(key)
            .bind(snapshot.workspace_revision).bind(snapshot.key_policy_revision).bind(snapshot.key_assignment_revision)
            .bind(decision["detector"].as_str()).bind(decision["configuration_fingerprint"].as_str())
            .bind(decision["outcome"].as_str()).bind(decision["reason"].as_str()).bind(decision["elapsed_ms"].as_i64())
            .execute(&self.pool).await?;
        Ok(id)
    }

    pub async fn record_output_guardrail_observation(
        &self,
        scope: TenantScope,
        attempt: uuid::Uuid,
        outcome: &str,
        reason: &str,
        elapsed_ms: i64,
    ) -> Result<(), StoreError> {
        sqlx::query("INSERT INTO output_guardrail_observations(organization_id,project_id,attempt_id,outcome,reason,elapsed_ms) VALUES($1,$2,$3,$4,$5,$6)")
            .bind(scope.organization_id).bind(scope.project_id).bind(attempt).bind(outcome).bind(reason).bind(elapsed_ms).execute(&self.pool).await?;
        Ok(())
    }

    pub async fn record_output_guardrail_decision(
        &self,
        scope: TenantScope,
        attempt: uuid::Uuid,
        outcome: &str,
        reason: &str,
        elapsed_ms: i64,
    ) -> Result<(), StoreError> {
        sqlx::query("INSERT INTO output_guardrail_decisions(organization_id,project_id,attempt_id,outcome,reason,elapsed_ms) VALUES($1,$2,$3,$4,$5,$6)")
            .bind(scope.organization_id).bind(scope.project_id).bind(attempt).bind(outcome).bind(reason).bind(elapsed_ms).execute(&self.pool).await?;
        Ok(())
    }

    pub async fn bind_inspected_guardrails(
        &self,
        scope: TenantScope,
        attempt: uuid::Uuid,
        key: uuid::Uuid,
        snapshot: &GuardrailSnapshot,
    ) -> Result<(), StoreError> {
        Self::insert_inspected_guardrails(&self.pool, scope, attempt, key, snapshot).await
    }

    pub(crate) async fn insert_inspected_guardrails<'e, E>(
        executor: E,
        scope: TenantScope,
        attempt: uuid::Uuid,
        key: uuid::Uuid,
        snapshot: &GuardrailSnapshot,
    ) -> Result<(), StoreError>
    where
        E: sqlx::Executor<'e, Database = sqlx::Postgres>,
    {
        sqlx::query("INSERT INTO inspected_guardrail_bindings(organization_id,project_id,attempt_id,key_id,workspace_revision,key_policy_revision,key_assignment_revision,input_outcome,input_elapsed_ms,input_detector_decision_ids) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)")
            .bind(scope.organization_id).bind(scope.project_id).bind(attempt).bind(key)
            .bind(snapshot.workspace_revision).bind(snapshot.key_policy_revision).bind(snapshot.key_assignment_revision)
            .bind(&snapshot.input_outcome).bind(snapshot.input_elapsed_ms).bind(&snapshot.input_detector_decision_ids)
            .execute(executor).await?;
        Ok(())
    }

    pub async fn record_guardrail_preparation_denial(
        &self,
        scope: TenantScope,
        key: uuid::Uuid,
        snapshot: &GuardrailSnapshot,
        reason: &str,
    ) -> Result<(), StoreError> {
        sqlx::query("INSERT INTO guardrail_preparation_denials(id,organization_id,project_id,key_id,workspace_revision,key_policy_revision,key_assignment_revision,reason) VALUES($1,$2,$3,$4,$5,$6,$7,$8)")
            .bind(uuid::Uuid::new_v4()).bind(scope.organization_id).bind(scope.project_id).bind(key)
            .bind(snapshot.workspace_revision).bind(snapshot.key_policy_revision).bind(snapshot.key_assignment_revision)
            .bind(reason).execute(&self.pool).await?;
        Ok(())
    }

    /// Latest 100 pre-admission access denials. No prompt, route, secret or match content is stored.
    pub async fn guardrail_preparation_denials(
        &self,
        scope: TenantScope,
    ) -> Result<Vec<Value>, StoreError> {
        Ok(sqlx::query_scalar("SELECT jsonb_build_object('stage','preparation','outcome','blocked','coverage',CASE WHEN d.reason LIKE 'detector_%' THEN 'external_input' WHEN d.reason='output_incompatible' THEN 'output_configuration' WHEN d.reason LIKE 'input_%' THEN 'local_input' ELSE 'model_provider_access' END,'enforcer_version',CASE WHEN d.reason LIKE 'detector_%' THEN 'external-input-v1' WHEN d.reason='output_incompatible' THEN 'buffer-mode-v1' WHEN d.reason LIKE 'input_%' THEN 'local-input-v1' ELSE 'access-v1' END,'reason',d.reason,'key_name',a.name,'workspace_policy_name',w.policy->>'name','key_policy_name',k.policy->>'name','workspace_revision',d.workspace_revision,'key_policy_revision',d.key_policy_revision,'key_assignment_revision',d.key_assignment_revision,'recorded_at',d.recorded_at) FROM guardrail_preparation_denials d JOIN api_keys a ON a.id=d.key_id LEFT JOIN workspace_guardrail_revisions w ON w.organization_id=d.organization_id AND w.project_id=d.project_id AND w.revision=d.workspace_revision LEFT JOIN workspace_guardrail_revisions k ON k.organization_id=d.organization_id AND k.project_id=d.project_id AND k.revision=d.key_policy_revision WHERE d.organization_id=$1 AND d.project_id=$2 ORDER BY d.recorded_at DESC,d.id DESC LIMIT 100")
            .bind(scope.organization_id).bind(scope.project_id).fetch_all(&self.pool).await?)
    }
    /// Recorded dispatch exceptions only; excludes per-row eligibility statuses.
    pub async fn guardrail_dispatch_denials(
        &self,
        scope: TenantScope,
    ) -> Result<Vec<Value>, StoreError> {
        Ok(sqlx::query_scalar("WITH denials AS (SELECT id,organization_id,project_id,key_id,reason,workspace_revision,key_policy_revision,key_assignment_revision,recorded_at,'dispatch'::text AS stage FROM dispatch_guardrail_rejections WHERE organization_id=$1 AND project_id=$2 UNION ALL SELECT id,organization_id,project_id,key_id,reason,workspace_revision,key_policy_revision,key_assignment_revision,recorded_at,'batch_admission'::text AS stage FROM batch_guardrail_rejections WHERE organization_id=$1 AND project_id=$2) SELECT jsonb_build_object('stage',d.stage,'outcome','blocked','coverage',CASE WHEN d.reason='access_denied' THEN 'model_provider_access' ELSE 'policy_binding' END,'reason',d.reason,'key_name',a.name,'workspace_policy_name',w.policy->>'name','key_policy_name',k.policy->>'name','workspace_revision',d.workspace_revision,'key_policy_revision',d.key_policy_revision,'key_assignment_revision',d.key_assignment_revision,'recorded_at',d.recorded_at) FROM denials d JOIN api_keys a ON a.organization_id=d.organization_id AND a.project_id=d.project_id AND a.id=d.key_id LEFT JOIN workspace_guardrail_revisions w ON w.organization_id=d.organization_id AND w.project_id=d.project_id AND w.revision=d.workspace_revision LEFT JOIN workspace_guardrail_revisions k ON k.organization_id=d.organization_id AND k.project_id=d.project_id AND k.revision=d.key_policy_revision ORDER BY d.recorded_at DESC,d.id DESC LIMIT 100")
            .bind(scope.organization_id).bind(scope.project_id).fetch_all(&self.pool).await?)
    }
    pub async fn guardrail_snapshot(
        &self,
        scope: TenantScope,
        key: uuid::Uuid,
    ) -> Result<Option<GuardrailSnapshot>, StoreError> {
        Self::guardrail_snapshot_using(&self.pool, scope, key).await
    }
    pub(crate) async fn guardrail_snapshot_using<'e, E>(
        executor: E,
        scope: TenantScope,
        key: uuid::Uuid,
    ) -> Result<Option<GuardrailSnapshot>, StoreError>
    where
        E: sqlx::Executor<'e, Database = sqlx::Postgres>,
    {
        Ok(sqlx::query_as::<_, GuardrailSnapshot>(
            "SELECT w.revision AS workspace_revision,w.policy AS workspace_policy,
                    a.assignment_revision AS key_assignment_revision,
                    k.revision AS key_policy_revision,k.policy AS key_policy
             FROM api_keys key
             LEFT JOIN workspace_guardrail_heads h ON h.organization_id=key.organization_id AND h.project_id=key.project_id
             LEFT JOIN workspace_guardrail_revisions w ON w.organization_id=h.organization_id AND w.project_id=h.project_id AND w.revision=h.revision
             LEFT JOIN key_guardrail_assignments a ON a.organization_id=key.organization_id AND a.project_id=key.project_id AND a.key_id=key.id
             LEFT JOIN workspace_guardrail_revisions k ON k.organization_id=a.organization_id AND k.project_id=a.project_id AND k.revision=a.policy_revision
             WHERE key.organization_id=$1 AND key.project_id=$2 AND key.id=$3",
        ).bind(scope.organization_id).bind(scope.project_id).bind(key).fetch_optional(executor).await?)
    }

    pub async fn dispatch_guardrail_decision(
        &self,
        scope: TenantScope,
        attempt: uuid::Uuid,
    ) -> Result<Option<Value>, StoreError> {
        let value = sqlx::query_scalar::<_, Value>("SELECT jsonb_build_object('stage','dispatch','outcome','allowed','coverage','model_provider_access','enforcer_version','access-v1','workspace_revision',d.workspace_revision,'workspace_policy_name',w.policy->>'name','key_policy_revision',d.key_policy_revision,'key_policy_name',k.policy->>'name','key_assignment_revision',d.key_assignment_revision,'recorded_at',d.recorded_at,'output_inspection',CASE WHEN o.outcome IS NULL THEN NULL ELSE jsonb_build_object('outcome',o.outcome,'reason',o.reason,'mode','buffered_full','coverage','local_text','enforcer_version','local-output-v1','elapsed_ms',o.elapsed_ms) END,'output_observation',CASE WHEN obs.outcome IS NULL THEN NULL ELSE jsonb_build_object('outcome',obs.outcome,'reason',obs.reason,'mode','observe_only','enforcement',false,'coverage','local_text','enforcer_version','local-output-v1','elapsed_ms',obs.elapsed_ms) END,'input_detectors',(SELECT COALESCE(jsonb_agg(jsonb_build_object('detector',i.detector_name,'configuration_fingerprint',i.configuration_fingerprint,'stage','input','coverage','local_text','outcome',i.outcome,'reason',i.reason,'elapsed_ms',i.elapsed_ms)),'[]'::jsonb) FROM input_detector_decisions i WHERE i.id=ANY(b.input_detector_decision_ids) AND i.organization_id=d.organization_id AND i.project_id=d.project_id),'input_inspection',CASE WHEN b.input_outcome IS NULL THEN NULL ELSE jsonb_build_object('outcome',b.input_outcome,'coverage','local_text','enforcer_version','local-input-v1','elapsed_ms',b.input_elapsed_ms) END) FROM dispatch_guardrail_decisions d LEFT JOIN output_guardrail_decisions o ON o.organization_id=d.organization_id AND o.project_id=d.project_id AND o.attempt_id=d.attempt_id LEFT JOIN output_guardrail_observations obs ON obs.organization_id=d.organization_id AND obs.project_id=d.project_id AND obs.attempt_id=d.attempt_id LEFT JOIN inspected_guardrail_bindings b ON b.organization_id=d.organization_id AND b.project_id=d.project_id AND b.attempt_id=d.attempt_id LEFT JOIN workspace_guardrail_revisions w ON w.organization_id=d.organization_id AND w.project_id=d.project_id AND w.revision=d.workspace_revision LEFT JOIN workspace_guardrail_revisions k ON k.organization_id=d.organization_id AND k.project_id=d.project_id AND k.revision=d.key_policy_revision WHERE d.organization_id=$1 AND d.project_id=$2 AND d.attempt_id=$3")
            .bind(scope.organization_id).bind(scope.project_id).bind(attempt).fetch_optional(&self.pool).await?;
        Ok(value)
    }

    pub async fn set_attempt_dispatch_provider(
        &self,
        scope: TenantScope,
        attempt: uuid::Uuid,
        provider: &str,
    ) -> Result<(), StoreError> {
        if provider.is_empty() || provider.len() > 200 || provider.chars().any(char::is_control) {
            return Err(StoreError::Conflict);
        }
        let changed=sqlx::query("UPDATE attempts SET dispatch_provider=$4 WHERE organization_id=$1 AND project_id=$2 AND id=$3 AND execution='not_sent' AND dispatch_provider IS NULL")
            .bind(scope.organization_id).bind(scope.project_id).bind(attempt).bind(provider).execute(&self.pool).await?.rows_affected();
        if changed != 1 {
            return Err(StoreError::Conflict);
        }
        Ok(())
    }

    pub async fn assign_key_guardrail(
        &self,
        scope: TenantScope,
        key: uuid::Uuid,
        policy_revision: i64,
        expected_assignment: i64,
    ) -> Result<i64, StoreError> {
        self.assign_key_guardrail_as(scope, key, policy_revision, expected_assignment, "system")
            .await
    }

    pub async fn assign_key_guardrail_as(
        &self,
        scope: TenantScope,
        key: uuid::Uuid,
        policy_revision: i64,
        expected_assignment: i64,
        actor: &str,
    ) -> Result<i64, StoreError> {
        self.update_key_guardrail_assignment(
            scope,
            key,
            Some(policy_revision),
            expected_assignment,
            actor,
        )
        .await
    }

    pub async fn clear_key_guardrail_as(
        &self,
        scope: TenantScope,
        key: uuid::Uuid,
        expected_assignment: i64,
        actor: &str,
    ) -> Result<i64, StoreError> {
        if expected_assignment < 1 {
            return Err(StoreError::Conflict);
        }
        self.update_key_guardrail_assignment(scope, key, None, expected_assignment, actor)
            .await
    }

    async fn update_key_guardrail_assignment(
        &self,
        scope: TenantScope,
        key: uuid::Uuid,
        policy_revision: Option<i64>,
        expected_assignment: i64,
        actor: &str,
    ) -> Result<i64, StoreError> {
        if actor.is_empty() || actor.len() > 200 || actor.chars().any(char::is_control) {
            return Err(StoreError::Conflict);
        }
        if expected_assignment < 0 || expected_assignment == i64::MAX {
            return Err(StoreError::Conflict);
        }
        let mut tx = self.pool.begin().await?;
        let active: Option<uuid::Uuid> = sqlx::query_scalar("SELECT id FROM api_keys WHERE organization_id=$1 AND project_id=$2 AND id=$3 AND revoked_at IS NULL AND expires_at > clock_timestamp() FOR UPDATE")
            .bind(scope.organization_id).bind(scope.project_id).bind(key).fetch_optional(&mut *tx).await?;
        if active.is_none() {
            return Err(StoreError::Conflict);
        }
        let revision: Option<i64> = if expected_assignment == 0 {
            sqlx::query_scalar("INSERT INTO key_guardrail_assignments (organization_id,project_id,key_id,policy_revision) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING assignment_revision")
                .bind(scope.organization_id).bind(scope.project_id).bind(key).bind(policy_revision).fetch_optional(&mut *tx).await?
        } else {
            sqlx::query_scalar("UPDATE key_guardrail_assignments SET policy_revision=$4,assignment_revision=assignment_revision+1 WHERE organization_id=$1 AND project_id=$2 AND key_id=$3 AND assignment_revision=$5 RETURNING assignment_revision")
                .bind(scope.organization_id).bind(scope.project_id).bind(key).bind(policy_revision).bind(expected_assignment).fetch_optional(&mut *tx).await?
        };
        let revision = revision.ok_or(StoreError::Conflict)?;
        sqlx::query("INSERT INTO key_guardrail_assignment_events (organization_id,project_id,key_id,assignment_revision,policy_revision,actor) VALUES ($1,$2,$3,$4,$5,$6)")
            .bind(scope.organization_id).bind(scope.project_id).bind(key).bind(revision).bind(policy_revision).bind(actor).execute(&mut *tx).await?;
        tx.commit().await?;
        Ok(revision)
    }

    pub async fn key_guardrail_history(
        &self,
        scope: TenantScope,
        key: uuid::Uuid,
        before: Option<i64>,
    ) -> Result<Vec<Value>, StoreError> {
        if before.is_some_and(|revision| revision < 1) {
            return Err(StoreError::Conflict);
        }
        Ok(sqlx::query_scalar("SELECT jsonb_build_object('assignment_revision',e.assignment_revision,'policy_revision',e.policy_revision,'policy_name',r.policy->>'name','actor_name',CASE WHEN e.actor='installation' THEN 'Installation administrator' WHEN e.actor='system' THEN 'System' ELSE COALESCE(op.name,'Unknown administrator') END,'created_at',e.created_at) FROM key_guardrail_assignment_events e LEFT JOIN workspace_guardrail_revisions r ON r.organization_id=e.organization_id AND r.project_id=e.project_id AND r.revision=e.policy_revision LEFT JOIN admin_operators op ON e.actor='operator:'||op.id::text WHERE e.organization_id=$1 AND e.project_id=$2 AND e.key_id=$3 AND ($4::bigint IS NULL OR e.assignment_revision<$4) ORDER BY e.assignment_revision DESC LIMIT 101")
            .bind(scope.organization_id).bind(scope.project_id).bind(key).bind(before).fetch_all(&self.pool).await?)
    }

    pub async fn key_guardrail_assignment(
        &self,
        scope: TenantScope,
        key: uuid::Uuid,
    ) -> Result<Option<Value>, StoreError> {
        Ok(sqlx::query_scalar("SELECT jsonb_build_object('assignment_revision',a.assignment_revision,'policy_revision',a.policy_revision,'policy',r.policy) FROM key_guardrail_assignments a LEFT JOIN workspace_guardrail_revisions r ON r.organization_id=a.organization_id AND r.project_id=a.project_id AND r.revision=a.policy_revision WHERE a.organization_id=$1 AND a.project_id=$2 AND a.key_id=$3")
            .bind(scope.organization_id).bind(scope.project_id).bind(key).fetch_optional(&self.pool).await?)
    }

    pub async fn key_guardrail(
        &self,
        scope: TenantScope,
        key: uuid::Uuid,
    ) -> Result<Option<Value>, StoreError> {
        Ok(sqlx::query_scalar("SELECT r.policy FROM key_guardrail_assignments a JOIN workspace_guardrail_revisions r ON r.organization_id=a.organization_id AND r.project_id=a.project_id AND r.revision=a.policy_revision WHERE a.organization_id=$1 AND a.project_id=$2 AND a.key_id=$3")
            .bind(scope.organization_id).bind(scope.project_id).bind(key).fetch_optional(&self.pool).await?)
    }
    /// Bounded immutable revision metadata; policy content and actor identifiers are excluded.
    pub async fn workspace_guardrail_history(
        &self,
        scope: TenantScope,
        before: Option<i64>,
    ) -> Result<Vec<Value>, StoreError> {
        if before.is_some_and(|revision| revision < 1) {
            return Err(StoreError::Conflict);
        }
        Ok(sqlx::query_scalar("SELECT jsonb_build_object('revision',r.revision,'policy_name',r.policy->>'name','active',r.revision=h.revision,'actor_name',CASE WHEN r.activated_by='installation' THEN 'Installation administrator' WHEN r.activated_by='system' THEN 'System' ELSE COALESCE(op.name,'Unknown administrator') END,'activated_at',r.activated_at,'restored_from_revision',r.restored_from_revision) FROM workspace_guardrail_revisions r JOIN workspace_guardrail_heads h USING (organization_id,project_id) LEFT JOIN admin_operators op ON r.activated_by='operator:'||op.id::text WHERE r.organization_id=$1 AND r.project_id=$2 AND ($3::bigint IS NULL OR r.revision<$3) ORDER BY r.revision DESC LIMIT 101")
            .bind(scope.organization_id).bind(scope.project_id).bind(before).fetch_all(&self.pool).await?)
    }

    pub async fn workspace_guardrail_revision(
        &self,
        scope: TenantScope,
        revision: i64,
    ) -> Result<Option<Value>, StoreError> {
        Ok(sqlx::query_scalar("SELECT policy FROM workspace_guardrail_revisions WHERE organization_id=$1 AND project_id=$2 AND revision=$3")
            .bind(scope.organization_id).bind(scope.project_id).bind(revision).fetch_optional(&self.pool).await?)
    }
    /// Caller must authorize the workspace and validate the policy before activation.
    pub async fn activate_workspace_guardrail(
        &self,
        scope: TenantScope,
        expected_revision: i64,
        policy: &Value,
    ) -> Result<i64, StoreError> {
        self.activate_workspace_guardrail_as(scope, expected_revision, policy, "system", None)
            .await
    }

    pub async fn activate_workspace_guardrail_as(
        &self,
        scope: TenantScope,
        expected_revision: i64,
        policy: &Value,
        actor: &str,
        restored_from_revision: Option<i64>,
    ) -> Result<i64, StoreError> {
        if actor.is_empty()
            || actor.len() > 200
            || actor.chars().any(char::is_control)
            || restored_from_revision
                .is_some_and(|revision| revision < 1 || revision > expected_revision)
        {
            return Err(StoreError::Conflict);
        }
        if expected_revision < 0 || expected_revision == i64::MAX || !policy.is_object() {
            return Err(StoreError::Conflict);
        }
        let mut tx = self.pool.begin().await?;
        sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended('niu-guardrails:'||$1::text||':'||$2::text,0))")
            .bind(scope.organization_id).bind(scope.project_id).execute(&mut *tx).await?;

        sqlx::query("INSERT INTO workspace_guardrail_heads (organization_id,project_id) VALUES ($1,$2) ON CONFLICT DO NOTHING")
            .bind(scope.organization_id).bind(scope.project_id).execute(&mut *tx).await?;
        let revision: i64 = sqlx::query_scalar("UPDATE workspace_guardrail_heads SET revision=revision+1 WHERE organization_id=$1 AND project_id=$2 AND revision=$3 RETURNING revision")
            .bind(scope.organization_id).bind(scope.project_id).bind(expected_revision)
            .fetch_optional(&mut *tx).await?.ok_or(StoreError::Conflict)?;
        sqlx::query("INSERT INTO workspace_guardrail_revisions (organization_id,project_id,revision,policy,activated_by,restored_from_revision) VALUES ($1,$2,$3,$4,$5,$6)")
            .bind(scope.organization_id).bind(scope.project_id).bind(revision).bind(policy).bind(actor).bind(restored_from_revision)
            .execute(&mut *tx).await?;
        tx.commit().await?;
        Ok(revision)
    }

    pub async fn workspace_guardrail(
        &self,
        scope: TenantScope,
    ) -> Result<Option<Value>, StoreError> {
        let row: Option<(i64, Value)> = sqlx::query_as("SELECT r.revision,r.policy FROM workspace_guardrail_heads h JOIN workspace_guardrail_revisions r USING (organization_id,project_id,revision) WHERE h.organization_id=$1 AND h.project_id=$2")
            .bind(scope.organization_id).bind(scope.project_id).fetch_optional(&self.pool).await?;
        Ok(row.map(|(revision, policy)| json!({"revision":revision,"policy":policy})))
    }
}
