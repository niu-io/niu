//! Limited Preview account registration policy, submission admission,
//! pending request queue, and atomic approval provisioning.
use crate::{
    OperatorAuditActor, OperatorScope, Store, StoreError,
    operator_audit::insert_operator_audit_event, password_logins::email_address,
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use sqlx::FromRow;
use uuid::Uuid;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RegistrationMode {
    Disabled,
    ApprovalRequired,
}

impl RegistrationMode {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Disabled => "disabled",
            Self::ApprovalRequired => "approval_required",
        }
    }

    pub fn parse(raw: &str) -> Option<Self> {
        match raw.trim() {
            "disabled" => Some(Self::Disabled),
            "approval_required" => Some(Self::ApprovalRequired),
            _ => None,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RegistrationStatus {
    Pending,
    Approved,
    Rejected,
}

impl RegistrationStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Pending => "pending",
            Self::Approved => "approved",
            Self::Rejected => "rejected",
        }
    }

    pub fn parse(raw: &str) -> Option<Self> {
        match raw.trim() {
            "pending" => Some(Self::Pending),
            "approved" => Some(Self::Approved),
            "rejected" => Some(Self::Rejected),
            _ => None,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct RegistrationPolicySnapshot {
    pub mode: RegistrationMode,
    pub revision: String,
    pub updated_at: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct RegistrationCounts {
    pub pending: i64,
    pub approved: i64,
    pub rejected: i64,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct RegistrationRequestRecord {
    pub id: Uuid,
    pub email: String,
    pub applicant_name: String,
    pub organization_name: String,
    pub workspace_name: String,
    pub note: Option<String>,
    pub status: RegistrationStatus,
    pub revision: String,
    pub created_at: String,
    pub reviewed_at: Option<String>,
    pub reviewed_by_kind: Option<String>,
    pub reviewed_by_label: Option<String>,
    pub decision_note: Option<String>,
    pub approved_organization_slug: Option<String>,
    pub approved_workspace_slug: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
pub struct RegistrationQueuePage {
    pub data: Vec<RegistrationRequestRecord>,
    pub next_cursor: Option<Uuid>,
    pub counts: RegistrationCounts,
    pub policy: RegistrationPolicySnapshot,
}

pub struct RegistrationSubmissionInput<'a> {
    pub email: &'a str,
    pub applicant_name: &'a str,
    pub organization_name: Option<&'a str>,
    pub workspace_name: Option<&'a str>,
    pub password_hash: &'a str,
    pub note: Option<&'a str>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RegistrationSubmissionOutcome {
    Created { id: Uuid },
    AcceptedExistingOrPending,
}

#[derive(FromRow)]
struct PolicyRow {
    mode: String,
    revision: i64,
    updated_at: String,
}

#[derive(FromRow)]
struct RequestRow {
    id: Uuid,
    email: String,
    applicant_name: String,
    organization_name: String,
    workspace_name: String,
    note: Option<String>,
    status: String,
    revision: i64,
    created_at: String,
    reviewed_at: Option<String>,
    reviewed_by_kind: Option<String>,
    reviewed_by_label: Option<String>,
    decision_note: Option<String>,
    approved_organization_slug: Option<String>,
    approved_workspace_slug: Option<String>,
}

impl TryFrom<RequestRow> for RegistrationRequestRecord {
    type Error = StoreError;

    fn try_from(row: RequestRow) -> Result<Self, Self::Error> {
        let status = RegistrationStatus::parse(&row.status).ok_or(StoreError::Conflict)?;
        Ok(Self {
            id: row.id,
            email: row.email,
            applicant_name: row.applicant_name,
            organization_name: row.organization_name,
            workspace_name: row.workspace_name,
            note: row.note,
            status,
            revision: row.revision.to_string(),
            created_at: row.created_at,
            reviewed_at: row.reviewed_at,
            reviewed_by_kind: row.reviewed_by_kind,
            reviewed_by_label: row.reviewed_by_label,
            decision_note: row.decision_note,
            approved_organization_slug: row.approved_organization_slug,
            approved_workspace_slug: row.approved_workspace_slug,
        })
    }
}

pub struct ValidatedRegistrationFields {
    pub email: String,
    pub applicant_name: String,
    pub organization_name: String,
    pub workspace_name: String,
    pub note: Option<String>,
}

/// Normalizes and validates user-supplied registration fields before
/// rate-limit admission or password hashing.
pub fn validate_registration_submission_fields(
    email: &str,
    applicant_name: &str,
    organization_name: Option<&str>,
    workspace_name: Option<&str>,
    note: Option<&str>,
) -> Result<ValidatedRegistrationFields, StoreError> {
    let email = email_address(email).ok_or(StoreError::InvalidRegistration)?;
    let applicant_name = normalize_registration_name(applicant_name)?;
    let organization_name = match organization_name.map(str::trim).filter(|s| !s.is_empty()) {
        Some(name) => normalize_registration_name(name)?,
        None => applicant_name.clone(),
    };
    let workspace_name = match workspace_name.map(str::trim).filter(|s| !s.is_empty()) {
        Some(name) => normalize_registration_name(name)?,
        None => "Default workspace".to_string(),
    };
    let note = normalize_registration_note(note)?;
    Ok(ValidatedRegistrationFields {
        email,
        applicant_name,
        organization_name,
        workspace_name,
        note,
    })
}

pub(crate) fn normalize_registration_name(raw: &str) -> Result<String, StoreError> {
    let trimmed = raw.trim();
    if trimmed.is_empty() || trimmed.chars().count() > 120 || trimmed.chars().any(char::is_control)
    {
        return Err(StoreError::InvalidRegistration);
    }
    Ok(trimmed.to_string())
}

pub(crate) fn normalize_registration_note(raw: Option<&str>) -> Result<Option<String>, StoreError> {
    let Some(raw) = raw else {
        return Ok(None);
    };
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Ok(None);
    }
    if trimmed.chars().count() > 500
        || trimmed
            .chars()
            .any(|ch| ch.is_control() && ch != '\n' && ch != '\r')
    {
        return Err(StoreError::InvalidRegistration);
    }
    Ok(Some(trimmed.to_string()))
}

const REQUEST_SELECT_SQL: &str = "\
SELECT r.id, r.email, r.applicant_name, r.organization_name, r.workspace_name, \
       r.note, r.status, r.revision, \
       to_char(r.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') AS created_at, \
       CASE WHEN r.reviewed_at IS NULL THEN NULL ELSE to_char(r.reviewed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') END AS reviewed_at, \
       r.reviewed_by_kind, \
       CASE WHEN r.reviewed_by_kind = 'installation' THEN 'Installation administrator' \
            WHEN r.reviewed_by_kind = 'operator' THEN COALESCE(reviewer.name, 'Platform administrator') \
            ELSE NULL END AS reviewed_by_label, \
       r.decision_note, \
       o.slug AS approved_organization_slug, \
       p.route_slug AS approved_workspace_slug \
FROM account_registration_requests r \
LEFT JOIN admin_operators reviewer ON reviewer.id = r.reviewed_by_operator_id \
LEFT JOIN organizations o ON o.id = r.approved_organization_id \
LEFT JOIN projects p ON p.id = r.approved_project_id AND p.organization_id = r.approved_organization_id";

#[derive(FromRow)]
struct PendingApprovalRow {
    email: String,
    applicant_name: String,
    organization_name: String,
    workspace_name: String,
    password_hash: Option<String>,
    status: String,
    revision: i64,
}

impl Store {
    /// Returns the durable installation registration policy.
    pub async fn registration_policy(&self) -> Result<RegistrationPolicySnapshot, StoreError> {
        let row: Option<PolicyRow> = sqlx::query_as(
            "SELECT mode, revision, \
             to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') AS updated_at \
             FROM platform_registration_policy WHERE singleton",
        )
        .fetch_optional(&self.pool)
        .await?;
        let Some(row) = row else {
            return Ok(RegistrationPolicySnapshot {
                mode: RegistrationMode::ApprovalRequired,
                revision: "1".to_string(),
                updated_at: String::new(),
            });
        };
        let mode = RegistrationMode::parse(&row.mode).ok_or(StoreError::Conflict)?;
        Ok(RegistrationPolicySnapshot {
            mode,
            revision: row.revision.to_string(),
            updated_at: row.updated_at,
        })
    }

    /// Compare-and-set update for Limited Preview registration policy with durable audit logging.
    pub async fn save_registration_policy(
        &self,
        expected_revision: i64,
        mode: RegistrationMode,
        actor: OperatorAuditActor,
    ) -> Result<RegistrationPolicySnapshot, StoreError> {
        if expected_revision < 1 {
            return Err(StoreError::InvalidRegistration);
        }
        let mut tx = self.begin_bounded_recording().await?;
        let current: PolicyRow = sqlx::query_as(
            "SELECT mode, revision, \
             to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') AS updated_at \
             FROM platform_registration_policy WHERE singleton FOR UPDATE",
        )
        .fetch_optional(&mut *tx)
        .await?
        .ok_or(StoreError::Conflict)?;

        if current.revision != expected_revision {
            return Err(StoreError::Conflict);
        }
        let current_mode = RegistrationMode::parse(&current.mode).ok_or(StoreError::Conflict)?;
        if current_mode == mode {
            crate::commit_tx(tx).await?;
            return Ok(RegistrationPolicySnapshot {
                mode: current_mode,
                revision: current.revision.to_string(),
                updated_at: current.updated_at,
            });
        }
        let next_revision = current
            .revision
            .checked_add(1)
            .ok_or(StoreError::Conflict)?;
        let updated: PolicyRow = sqlx::query_as(
            "UPDATE platform_registration_policy \
             SET mode = $1, revision = $2, updated_at = clock_timestamp() \
             WHERE singleton AND revision = $3 \
             RETURNING mode, revision, \
             to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') AS updated_at",
        )
        .bind(mode.as_str())
        .bind(next_revision)
        .bind(expected_revision)
        .fetch_one(&mut *tx)
        .await?;

        let (actor_kind, actor_operator_id) = actor.kind_and_id();
        sqlx::query(
            "INSERT INTO platform_registration_policy_events \
             (revision, mode, actor_kind, actor_operator_id) \
             VALUES ($1, $2, $3, $4)",
        )
        .bind(next_revision)
        .bind(mode.as_str())
        .bind(actor_kind)
        .bind(actor_operator_id)
        .execute(&mut *tx)
        .await?;

        crate::commit_tx(tx).await?;
        Ok(RegistrationPolicySnapshot {
            mode,
            revision: updated.revision.to_string(),
            updated_at: updated.updated_at,
        })
    }

    /// Bounded rate-limit admission before Argon2 hashing on public registration.
    pub async fn admit_registration_submission(
        &self,
        email: &str,
        client_ip: Option<&str>,
    ) -> Result<bool, StoreError> {
        let Some(normalized) = email_address(email) else {
            return Ok(false);
        };
        let mut tx = self.begin_tx().await?;
        sqlx::query(
            "DELETE FROM registration_submission_admission \
             WHERE (kind, bucket) IN ( \
                 SELECT kind, bucket FROM registration_submission_admission \
                 WHERE window_start < now() - interval '24 hours' \
                 ORDER BY window_start LIMIT 128 FOR UPDATE SKIP LOCKED \
             )",
        )
        .execute(&mut *tx)
        .await?;

        if let Some(ip) = client_ip {
            let ip_bucket = Sha256::digest(format!("ip:{ip}").as_bytes());
            if !registration_window(&mut tx, "ip", ip_bucket.as_slice(), 10, 300).await? {
                crate::commit_tx(tx).await?;
                return Ok(false);
            }
        }
        let email_bucket = Sha256::digest(normalized.as_bytes());
        if !registration_window(&mut tx, "email", email_bucket.as_slice(), 5, 900).await? {
            crate::commit_tx(tx).await?;
            return Ok(false);
        }
        let allowed = registration_window(&mut tx, "global", &[0u8; 32], 60, 60).await?;
        crate::commit_tx(tx).await?;
        Ok(allowed)
    }

    /// Submit a Limited Preview account registration request.
    /// Existing active emails and duplicate pending requests commit cleanly as
    /// `AcceptedExistingOrPending` without modifying existing credentials or
    /// revealing account existence to anonymous callers.
    pub async fn submit_registration_request(
        &self,
        input: RegistrationSubmissionInput<'_>,
    ) -> Result<RegistrationSubmissionOutcome, StoreError> {
        let fields = validate_registration_submission_fields(
            input.email,
            input.applicant_name,
            input.organization_name,
            input.workspace_name,
            input.note,
        )?;
        let email = fields.email;
        let applicant_name = fields.applicant_name;
        let organization_name = fields.organization_name;
        let workspace_name = fields.workspace_name;
        let note = fields.note;
        if !crate::passwords::supported_password_hash(input.password_hash) {
            return Err(StoreError::InvalidRegistration);
        }

        let mut tx = self.begin_bounded_recording().await?;
        let mode: String = sqlx::query_scalar(
            "SELECT mode FROM platform_registration_policy WHERE singleton FOR SHARE",
        )
        .fetch_optional(&mut *tx)
        .await?
        .unwrap_or_else(|| "approval_required".to_string());
        if RegistrationMode::parse(&mode) != Some(RegistrationMode::ApprovalRequired) {
            return Err(StoreError::RegistrationDisabled);
        }

        sqlx::query(
            "SELECT pg_advisory_xact_lock(hashtextextended('niu-registration-email:' || $1, 0))",
        )
        .bind(&email)
        .execute(&mut *tx)
        .await?;

        let existing_credential: bool = sqlx::query_scalar(
            "SELECT EXISTS(SELECT 1 FROM member_password_credentials WHERE email = $1)",
        )
        .bind(&email)
        .fetch_one(&mut *tx)
        .await?;
        if existing_credential {
            crate::commit_tx(tx).await?;
            return Ok(RegistrationSubmissionOutcome::AcceptedExistingOrPending);
        }

        let existing_pending: bool = sqlx::query_scalar(
            "SELECT EXISTS(SELECT 1 FROM account_registration_requests WHERE email = $1 AND status = 'pending')",
        )
        .bind(&email)
        .fetch_one(&mut *tx)
        .await?;
        if existing_pending {
            crate::commit_tx(tx).await?;
            return Ok(RegistrationSubmissionOutcome::AcceptedExistingOrPending);
        }

        let id = Uuid::new_v4();
        sqlx::query(
            "INSERT INTO account_registration_requests \
             (id, email, applicant_name, organization_name, workspace_name, password_hash, note, status, revision) \
             VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', 1)",
        )
        .bind(id)
        .bind(&email)
        .bind(&applicant_name)
        .bind(&organization_name)
        .bind(&workspace_name)
        .bind(input.password_hash)
        .bind(note.as_deref())
        .execute(&mut *tx)
        .await?;

        crate::commit_tx(tx).await?;
        Ok(RegistrationSubmissionOutcome::Created { id })
    }

    /// Reads the pending request password hash for an email with no active login
    /// credential so login can distinguish an awaiting-approval applicant ONLY
    /// after verifying their exact registered password.
    pub async fn pending_registration_password_hash(
        &self,
        email: &str,
    ) -> Result<Option<String>, StoreError> {
        let Some(email) = email_address(email) else {
            return Ok(None);
        };
        let hash: Option<String> = sqlx::query_scalar(
            "SELECT password_hash FROM account_registration_requests \
             WHERE email = $1 AND status = 'pending' AND password_hash IS NOT NULL",
        )
        .bind(email)
        .fetch_optional(&self.pool)
        .await?;
        Ok(hash)
    }

    /// Lists registration requests newest-first for platform/installation admins.
    pub async fn list_registration_requests(
        &self,
        status: Option<RegistrationStatus>,
        cursor: Option<Uuid>,
        limit: i64,
    ) -> Result<RegistrationQueuePage, StoreError> {
        if !(1..=100).contains(&limit) {
            return Err(StoreError::InvalidRegistrationQuery);
        }
        let status_filter = status.map(|s| s.as_str());
        let mut tx = self.begin_bounded_read_snapshot().await?;
        if let Some(cursor_id) = cursor {
            let valid: bool = sqlx::query_scalar(
                "SELECT EXISTS(SELECT 1 FROM account_registration_requests \
                 WHERE id = $1 AND ($2::text IS NULL OR status = $2))",
            )
            .bind(cursor_id)
            .bind(status_filter)
            .fetch_one(&mut *tx)
            .await?;
            if !valid {
                return Err(StoreError::InvalidRegistrationQuery);
            }
        }
        let query = format!(
            "{REQUEST_SELECT_SQL} \
             WHERE ($1::text IS NULL OR r.status = $1) \
               AND ($2::uuid IS NULL OR EXISTS ( \
                   SELECT 1 FROM account_registration_requests c \
                   WHERE c.id = $2 AND (r.created_at, r.id) < (c.created_at, c.id) \
               )) \
             ORDER BY r.created_at DESC, r.id DESC \
             LIMIT $3"
        );
        let mut rows: Vec<RequestRow> = sqlx::query_as(&query)
            .bind(status_filter)
            .bind(cursor)
            .bind(limit + 1)
            .fetch_all(&mut *tx)
            .await?;
        let has_more = rows.len() > limit as usize;
        if has_more {
            rows.pop();
        }
        let mut data = Vec::with_capacity(rows.len());
        for row in rows {
            data.push(RegistrationRequestRecord::try_from(row)?);
        }
        let next_cursor = if has_more {
            data.last().map(|row| row.id)
        } else {
            None
        };

        let counts: (i64, i64, i64) = sqlx::query_as(
            "SELECT \
                 COUNT(*) FILTER (WHERE status = 'pending'), \
                 COUNT(*) FILTER (WHERE status = 'approved'), \
                 COUNT(*) FILTER (WHERE status = 'rejected') \
             FROM account_registration_requests",
        )
        .fetch_one(&mut *tx)
        .await?;

        let policy_row: Option<PolicyRow> = sqlx::query_as(
            "SELECT mode, revision, \
             to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') AS updated_at \
             FROM platform_registration_policy WHERE singleton",
        )
        .fetch_optional(&mut *tx)
        .await?;
        crate::commit_tx(tx).await?;

        let policy = match policy_row {
            Some(row) => RegistrationPolicySnapshot {
                mode: RegistrationMode::parse(&row.mode).ok_or(StoreError::Conflict)?,
                revision: row.revision.to_string(),
                updated_at: row.updated_at,
            },
            None => RegistrationPolicySnapshot {
                mode: RegistrationMode::ApprovalRequired,
                revision: "1".to_string(),
                updated_at: String::new(),
            },
        };

        Ok(RegistrationQueuePage {
            data,
            next_cursor,
            counts: RegistrationCounts {
                pending: counts.0,
                approved: counts.1,
                rejected: counts.2,
            },
            policy,
        })
    }

    /// Atomically approves a pending registration, provisioning company, optional
    /// currency account, initial workspace, owner membership, and password credential.
    pub async fn approve_registration_request(
        &self,
        id: Uuid,
        expected_revision: i64,
        organization_name_override: Option<&str>,
        workspace_name_override: Option<&str>,
        decision_note: Option<&str>,
        actor: OperatorAuditActor,
    ) -> Result<RegistrationRequestRecord, StoreError> {
        if expected_revision < 1 {
            return Err(StoreError::InvalidRegistration);
        }
        let decision_note = normalize_registration_note(decision_note)?;
        let org_override = organization_name_override
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(normalize_registration_name)
            .transpose()?;
        let ws_override = workspace_name_override
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(normalize_registration_name)
            .transpose()?;

        let mut tx = self.begin_bounded_recording().await?;
        let Some(PendingApprovalRow {
            email,
            applicant_name,
            organization_name: stored_org_name,
            workspace_name: stored_ws_name,
            password_hash,
            status,
            revision,
        }) = sqlx::query_as::<_, PendingApprovalRow>(
            "SELECT email, applicant_name, organization_name, workspace_name, \
                    password_hash, status, revision \
             FROM account_registration_requests \
             WHERE id = $1 \
             FOR UPDATE",
        )
        .bind(id)
        .fetch_optional(&mut *tx)
        .await?
        else {
            return Err(StoreError::Conflict);
        };
        if status != "pending" || revision != expected_revision {
            return Err(StoreError::Conflict);
        }
        let password_hash = password_hash.ok_or(StoreError::Conflict)?;
        if !crate::passwords::supported_password_hash(&password_hash) {
            return Err(StoreError::Conflict);
        }

        sqlx::query(
            "SELECT pg_advisory_xact_lock(hashtextextended('niu-registration-email:' || $1, 0))",
        )
        .bind(&email)
        .execute(&mut *tx)
        .await?;

        let email_exists: bool = sqlx::query_scalar(
            "SELECT EXISTS(SELECT 1 FROM member_password_credentials WHERE email = $1)",
        )
        .bind(&email)
        .fetch_one(&mut *tx)
        .await?;
        if email_exists {
            return Err(StoreError::RegistrationEmailExists);
        }

        let organization_name = org_override.unwrap_or(stored_org_name);
        let workspace_name = ws_override.unwrap_or(stored_ws_name);

        let platform_currency: Option<String> =
            sqlx::query_scalar("SELECT currency FROM platform_currency WHERE singleton")
                .fetch_optional(&mut *tx)
                .await?;
        let currency = platform_currency.as_deref().unwrap_or("USD");
        let organization_id =
            Self::create_prepaid_organization_in_tx(&mut tx, &organization_name, currency).await?;

        let project_id = Uuid::new_v4();
        let base_ws_slug = crate::workspace_creation::workspace_slug_from_name(&workspace_name);
        let ws_slug: String = sqlx::query_scalar("SELECT niu_available_workspace_slug($1)")
            .bind(base_ws_slug)
            .fetch_one(&mut *tx)
            .await?;
        sqlx::query(
            "INSERT INTO projects(id, organization_id, name, route_slug) VALUES ($1, $2, $3, $4)",
        )
        .bind(project_id)
        .bind(organization_id)
        .bind(&workspace_name)
        .bind(&ws_slug)
        .execute(&mut *tx)
        .await?;

        let operator_id = Uuid::new_v4();
        sqlx::query(
            "INSERT INTO admin_operators(id, name, role, organization_id, project_id) \
             VALUES ($1, $2, 'owner', $3, NULL)",
        )
        .bind(operator_id)
        .bind(&applicant_name)
        .bind(organization_id)
        .execute(&mut *tx)
        .await?;

        crate::account_organization_creation::ensure_operator_identity_in_tx(
            &mut tx,
            operator_id,
            organization_id,
        )
        .await?;

        sqlx::query(
            "INSERT INTO member_password_credentials(operator_id, email, password_hash, revision) \
             VALUES ($1, $2, $3, 1)",
        )
        .bind(operator_id)
        .bind(&email)
        .bind(&password_hash)
        .execute(&mut *tx)
        .await
        .map_err(|error| {
            if error
                .as_database_error()
                .is_some_and(|db| db.is_unique_violation())
            {
                StoreError::RegistrationEmailExists
            } else {
                error.into()
            }
        })?;

        let scope = OperatorScope {
            organization_id,
            project_id: None,
        };
        insert_operator_audit_event(&mut tx, actor, "operator_created", operator_id, None, scope)
            .await?;
        insert_operator_audit_event(&mut tx, actor, "password_changed", operator_id, None, scope)
            .await?;

        let (actor_kind, actor_operator_id) = actor.kind_and_id();
        let next_revision = revision.checked_add(1).ok_or(StoreError::Conflict)?;
        sqlx::query(
            "UPDATE account_registration_requests \
             SET status = 'approved', \
                 revision = $2, \
                 organization_name = $3, \
                 workspace_name = $4, \
                 password_hash = NULL, \
                 reviewed_at = clock_timestamp(), \
                 reviewed_by_kind = $5, \
                 reviewed_by_operator_id = $6, \
                 decision_note = $7, \
                 approved_organization_id = $8, \
                 approved_project_id = $9, \
                 approved_operator_id = $10 \
             WHERE id = $1 AND status = 'pending' AND revision = $11",
        )
        .bind(id)
        .bind(next_revision)
        .bind(&organization_name)
        .bind(&workspace_name)
        .bind(actor_kind)
        .bind(actor_operator_id)
        .bind(decision_note.as_deref())
        .bind(organization_id)
        .bind(project_id)
        .bind(operator_id)
        .bind(expected_revision)
        .execute(&mut *tx)
        .await?;

        let target_label = bounded_review_target_label(&applicant_name, &organization_name);
        sqlx::query(
            "INSERT INTO account_registration_review_events \
             (id, request_id, action, actor_kind, actor_operator_id, target_label, revision) \
             VALUES ($1, $2, 'registration_approved', $3, $4, $5, $6)",
        )
        .bind(Uuid::new_v4())
        .bind(id)
        .bind(actor_kind)
        .bind(actor_operator_id)
        .bind(&target_label)
        .bind(next_revision)
        .execute(&mut *tx)
        .await?;

        let updated: RequestRow = sqlx::query_as(&format!("{REQUEST_SELECT_SQL} WHERE r.id = $1"))
            .bind(id)
            .fetch_one(&mut *tx)
            .await?;
        crate::commit_tx(tx).await?;
        RegistrationRequestRecord::try_from(updated)
    }

    /// Atomically rejects a pending registration and scrubs its pre-hashed password.
    pub async fn reject_registration_request(
        &self,
        id: Uuid,
        expected_revision: i64,
        decision_note: Option<&str>,
        actor: OperatorAuditActor,
    ) -> Result<RegistrationRequestRecord, StoreError> {
        if expected_revision < 1 {
            return Err(StoreError::InvalidRegistration);
        }
        let decision_note = normalize_registration_note(decision_note)?;
        let mut tx = self.begin_bounded_recording().await?;
        let row: Option<(String, String, String, i64)> = sqlx::query_as(
            "SELECT applicant_name, organization_name, status, revision \
             FROM account_registration_requests WHERE id = $1 FOR UPDATE",
        )
        .bind(id)
        .fetch_optional(&mut *tx)
        .await?;
        let Some((applicant_name, organization_name, status, revision)) = row else {
            return Err(StoreError::Conflict);
        };
        if status != "pending" || revision != expected_revision {
            return Err(StoreError::Conflict);
        }

        let (actor_kind, actor_operator_id) = actor.kind_and_id();
        let next_revision = revision.checked_add(1).ok_or(StoreError::Conflict)?;
        sqlx::query(
            "UPDATE account_registration_requests \
             SET status = 'rejected', \
                 revision = $2, \
                 password_hash = NULL, \
                 reviewed_at = clock_timestamp(), \
                 reviewed_by_kind = $3, \
                 reviewed_by_operator_id = $4, \
                 decision_note = $5 \
             WHERE id = $1 AND status = 'pending' AND revision = $6",
        )
        .bind(id)
        .bind(next_revision)
        .bind(actor_kind)
        .bind(actor_operator_id)
        .bind(decision_note.as_deref())
        .bind(expected_revision)
        .execute(&mut *tx)
        .await?;

        let target_label = bounded_review_target_label(&applicant_name, &organization_name);
        sqlx::query(
            "INSERT INTO account_registration_review_events \
             (id, request_id, action, actor_kind, actor_operator_id, target_label, revision) \
             VALUES ($1, $2, 'registration_rejected', $3, $4, $5, $6)",
        )
        .bind(Uuid::new_v4())
        .bind(id)
        .bind(actor_kind)
        .bind(actor_operator_id)
        .bind(&target_label)
        .bind(next_revision)
        .execute(&mut *tx)
        .await?;

        let updated: RequestRow = sqlx::query_as(&format!("{REQUEST_SELECT_SQL} WHERE r.id = $1"))
            .bind(id)
            .fetch_one(&mut *tx)
            .await?;
        crate::commit_tx(tx).await?;
        RegistrationRequestRecord::try_from(updated)
    }
}

fn bounded_review_target_label(applicant_name: &str, organization_name: &str) -> String {
    let label = if organization_name.eq_ignore_ascii_case(applicant_name) {
        applicant_name.to_string()
    } else {
        format!("{applicant_name} ({organization_name})")
    };
    if label.chars().count() <= 260 {
        label
    } else {
        label.chars().take(260).collect()
    }
}

async fn registration_window(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    kind: &str,
    bucket: &[u8],
    limit: i32,
    window_seconds: i32,
) -> Result<bool, StoreError> {
    let admitted: Option<i32> = sqlx::query_scalar(
        "INSERT INTO registration_submission_admission (kind, bucket, window_start, attempts) \
         VALUES ($1, $2, clock_timestamp(), 1) \
         ON CONFLICT (kind, bucket) DO UPDATE SET \
             attempts = CASE \
                 WHEN registration_submission_admission.window_start <= clock_timestamp() - make_interval(secs => $4) THEN 1 \
                 ELSE registration_submission_admission.attempts + 1 \
             END, \
             window_start = CASE \
                 WHEN registration_submission_admission.window_start <= clock_timestamp() - make_interval(secs => $4) THEN clock_timestamp() \
                 ELSE registration_submission_admission.window_start \
             END \
         WHERE registration_submission_admission.window_start <= clock_timestamp() - make_interval(secs => $4) \
            OR registration_submission_admission.attempts < $3 \
         RETURNING attempts",
    )
    .bind(kind)
    .bind(bucket)
    .bind(limit)
    .bind(window_seconds)
    .fetch_optional(&mut **tx)
    .await?;
    Ok(admitted.is_some())
}
