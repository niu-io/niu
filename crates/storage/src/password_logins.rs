//! Durable sign-in binding to existing scoped member identities. Authorization
//! to provision/reset a member remains a caller obligation. Password verification
//! happens outside transactions; session issuance rechecks the credential revision.
use crate::{
    IssuedOperatorSession, OperatorAuditActor, OperatorScope, Store, StoreError,
    operator_audit::insert_operator_audit_event, operators::issue_session,
};
use sha2::{Digest, Sha256};
use uuid::Uuid;

// Deliberately no Debug or Serialize: the credential must not enter responses/logs.
pub struct PasswordLoginCredential {
    operator_id: Uuid,
    revision: i64,
    password_hash: String,
}

pub struct VerifiedPasswordLogin {
    operator_id: Uuid,
    revision: i64,
}

impl PasswordLoginCredential {
    /// CPU-bound: the gateway must use a bounded blocking worker.
    pub fn verify(self, password: &str) -> Option<VerifiedPasswordLogin> {
        crate::passwords::verify_password(password, &self.password_hash).then_some(
            VerifiedPasswordLogin {
                operator_id: self.operator_id,
                revision: self.revision,
            },
        )
    }
}

fn email_address(email: &str) -> Option<String> {
    let email = email.trim().to_ascii_lowercase();
    if email.len() > 254
        || !email.is_ascii()
        || email
            .bytes()
            .any(|byte| byte.is_ascii_whitespace() || byte.is_ascii_control())
    {
        return None;
    }
    let (local, domain) = email.split_once('@')?;
    if local.is_empty() || domain.is_empty() || domain.contains('@') || !domain.contains('.') {
        return None;
    }
    Some(email)
}

impl Store {
    /// Called only by the explicitly enabled, loopback development launcher.
    /// Never reset a saved password, profile, role, or revocation on restart.
    pub async fn provision_development_member(
        &self,
        email: &str,
        password_hash: &str,
    ) -> Result<(), StoreError> {
        let email = email_address(email).ok_or(StoreError::InvalidOperator)?;
        if !crate::passwords::supported_password_hash(password_hash) {
            return Err(StoreError::InvalidOperator);
        }
        // Match first-use customer setup regardless of which bootstrap runs first.
        // The shared initializer reuses existing defaults without converting their
        // billing configuration or changing saved credentials.
        let workspace = self.default_prepaid_workspace().await?;
        let mut tx = self.pool.begin().await?;
        sqlx::query("SELECT pg_advisory_xact_lock(78641239)")
            .execute(&mut *tx)
            .await?;
        let exists: bool = sqlx::query_scalar(
            "SELECT EXISTS(SELECT 1 FROM member_password_credentials WHERE email=$1)",
        )
        .bind(&email)
        .fetch_one(&mut *tx)
        .await?;
        if !exists {
            let id = Uuid::new_v4();
            let name = if email == "demo@niu.io" {
                "Demo"
            } else {
                email.as_str()
            };
            sqlx::query("INSERT INTO admin_operators(id,name,role,organization_id,project_id) VALUES($1,$2,'owner',$3,NULL)").bind(id).bind(name).bind(workspace.organization_id).execute(&mut *tx).await?;
            sqlx::query("INSERT INTO member_password_credentials(operator_id,email,password_hash,revision) VALUES($1,$2,$3,1)").bind(id).bind(&email).bind(password_hash).execute(&mut *tx).await?;
        }
        tx.commit().await?;
        Ok(())
    }
    /// Revoke only the active session identified by this bearer credential.
    /// Revocation and its metadata-only audit record commit together.
    pub async fn revoke_current_member_session(&self, token: &str) -> Result<(), StoreError> {
        let mut tx = self.pool.begin().await?;
        let row: Option<(Uuid, Uuid, Uuid, Option<Uuid>)> = sqlx::query_as(
            "UPDATE admin_sessions s SET revoked_at=clock_timestamp() FROM admin_operators o \
             WHERE s.token_hash=$1 AND s.revoked_at IS NULL \
             AND s.expires_at_unix > extract(epoch FROM now())::bigint \
             AND o.id=s.operator_id AND o.revoked_at IS NULL \
             RETURNING s.id,o.id,o.organization_id,o.project_id",
        )
        .bind(Sha256::digest(token.as_bytes()).as_slice())
        .fetch_optional(&mut *tx)
        .await?;
        let (session_id, member_id, organization_id, project_id) =
            row.ok_or(StoreError::Unauthorized)?;
        insert_operator_audit_event(
            &mut tx,
            OperatorAuditActor::Operator(member_id),
            "session_revoked",
            member_id,
            Some(session_id),
            OperatorScope {
                organization_id,
                project_id,
            },
        )
        .await?;
        tx.commit().await?;
        Ok(())
    }
    /// Shared sign-in limits: five attempts per normalized email and 120 across
    /// the installation in a window that expires 60 seconds after its first
    /// attempt. Count successes and failures alike; admission precedes hashing.
    pub async fn admit_member_password_login(&self, email: &str) -> Result<bool, StoreError> {
        let Some(email) = email_address(email) else {
            return Ok(false);
        };
        let mut tx = self.pool.begin().await?;
        if !login_window(&mut tx, "global", &[0u8; 32], 120).await? {
            tx.commit().await?;
            return Ok(false);
        }
        // At most 120 new identity rows can be admitted per minute. Bounded
        // cleanup keeps inactive counters from becoming permanent identity data.
        sqlx::query("DELETE FROM password_login_admission WHERE (kind,bucket) IN (SELECT kind,bucket FROM password_login_admission WHERE window_start < now()-interval '24 hours' ORDER BY window_start LIMIT 128 FOR UPDATE SKIP LOCKED)")
            .execute(&mut *tx).await?;
        let bucket = Sha256::digest(email.as_bytes());
        let allowed = login_window(&mut tx, "identity", bucket.as_slice(), 5).await?;
        // Even an identity-denied attempt consumes global capacity.
        tx.commit().await?;
        Ok(allowed)
    }

    /// Bind an already computed password hash; expensive hashing must complete
    /// before entering this short transaction. Reset revokes all old sessions.
    pub async fn set_member_password(
        &self,
        operator_id: Uuid,
        email: &str,
        password_hash: &str,
        expected_revision: Option<i64>,
        actor: OperatorAuditActor,
    ) -> Result<i64, StoreError> {
        let email = email_address(email).ok_or(StoreError::InvalidOperator)?;
        if !crate::passwords::supported_password_hash(password_hash) {
            return Err(StoreError::InvalidOperator);
        }
        let mut tx = self.pool.begin().await?;
        let scope: Option<(Uuid, Option<Uuid>)> = sqlx::query_as(
            "SELECT organization_id,project_id FROM admin_operators WHERE id=$1 AND revoked_at IS NULL FOR UPDATE"
        ).bind(operator_id).fetch_optional(&mut *tx).await?;
        let (organization_id, project_id) = scope.ok_or(StoreError::Conflict)?;
        let scope = OperatorScope {
            organization_id,
            project_id,
        };
        let previous: Option<i64> = sqlx::query_scalar(
            "SELECT revision FROM member_password_credentials WHERE operator_id=$1",
        )
        .bind(operator_id)
        .fetch_optional(&mut *tx)
        .await?;
        if previous != expected_revision {
            return Err(StoreError::Conflict);
        }
        let revision = previous
            .unwrap_or(0)
            .checked_add(1)
            .ok_or(StoreError::Conflict)?;
        sqlx::query("INSERT INTO member_password_credentials(operator_id,email,password_hash,revision) VALUES($1,$2,$3,$4) ON CONFLICT(operator_id) DO UPDATE SET email=EXCLUDED.email,password_hash=EXCLUDED.password_hash,revision=EXCLUDED.revision,changed_at=clock_timestamp()")
            .bind(operator_id).bind(email).bind(password_hash).bind(revision).execute(&mut *tx).await.map_err(|error| {
                if error.as_database_error().is_some_and(|database| database.is_unique_violation()) {
                    StoreError::Conflict
                } else {
                    error.into()
                }
            })?;
        let revoked: Vec<Uuid> = sqlx::query_scalar(
            "UPDATE admin_sessions SET revoked_at=clock_timestamp() WHERE operator_id=$1 AND revoked_at IS NULL RETURNING id"
        ).bind(operator_id).fetch_all(&mut *tx).await?;
        for session in revoked {
            insert_operator_audit_event(
                &mut tx,
                actor,
                "session_revoked",
                operator_id,
                Some(session),
                scope,
            )
            .await?;
        }
        insert_operator_audit_event(&mut tx, actor, "password_changed", operator_id, None, scope)
            .await?;
        tx.commit().await?;
        Ok(revision)
    }

    /// Unknown email and revoked members are indistinguishable to callers.
    pub async fn member_password_credential(
        &self,
        email: &str,
    ) -> Result<Option<PasswordLoginCredential>, StoreError> {
        let Some(email) = email_address(email) else {
            return Ok(None);
        };
        let row: Option<(Uuid, i64, String)> = sqlx::query_as(
            "SELECT c.operator_id,c.revision,c.password_hash FROM member_password_credentials c JOIN admin_operators o ON o.id=c.operator_id WHERE c.email=$1 AND o.revoked_at IS NULL"
        ).bind(email).fetch_optional(&self.pool).await?;
        Ok(row.map(
            |(operator_id, revision, password_hash)| PasswordLoginCredential {
                operator_id,
                revision,
                password_hash,
            },
        ))
    }

    /// Caller must authenticate this member before looking up change credentials.
    /// The opaque credential cannot be serialized and verification is CPU-bound.
    pub async fn member_password_change_credential(
        &self,
        member_id: Uuid,
    ) -> Result<Option<(String, PasswordLoginCredential)>, StoreError> {
        let row: Option<(String, i64, String)> = sqlx::query_as(
            "SELECT c.email,c.revision,c.password_hash FROM member_password_credentials c JOIN admin_operators o ON o.id=c.operator_id WHERE c.operator_id=$1 AND o.revoked_at IS NULL",
        ).bind(member_id).fetch_optional(&self.pool).await?;
        Ok(row.map(|(email, revision, password_hash)| {
            (
                email,
                PasswordLoginCredential {
                    operator_id: member_id,
                    revision,
                    password_hash,
                },
            )
        }))
    }

    /// Current-password proof authorizes only its own member. Revision checking
    /// prevents a reset racing verification from being overwritten.
    pub async fn change_verified_member_password(
        &self,
        verified: VerifiedPasswordLogin,
        password_hash: &str,
    ) -> Result<i64, StoreError> {
        let email: Option<String> = sqlx::query_scalar(
            "SELECT email FROM member_password_credentials WHERE operator_id=$1",
        )
        .bind(verified.operator_id)
        .fetch_optional(&self.pool)
        .await?;
        self.set_member_password(
            verified.operator_id,
            &email.ok_or(StoreError::Unauthorized)?,
            password_hash,
            Some(verified.revision),
            OperatorAuditActor::Operator(verified.operator_id),
        )
        .await
    }

    /// A verified snapshot cannot outlive a password reset or member revocation.
    pub async fn issue_password_login_session(
        &self,
        verified: VerifiedPasswordLogin,
    ) -> Result<IssuedOperatorSession, StoreError> {
        let mut tx = self.pool.begin().await?;
        let scope: Option<(Uuid, Option<Uuid>)> = sqlx::query_as(
            "SELECT organization_id,project_id FROM admin_operators WHERE id=$1 AND revoked_at IS NULL FOR UPDATE"
        ).bind(verified.operator_id).fetch_optional(&mut *tx).await?;
        let (organization_id, project_id) = scope.ok_or(StoreError::Unauthorized)?;
        let current: Option<i64> = sqlx::query_scalar(
            "SELECT revision FROM member_password_credentials WHERE operator_id=$1",
        )
        .bind(verified.operator_id)
        .fetch_optional(&mut *tx)
        .await?;
        if current != Some(verified.revision) {
            return Err(StoreError::Unauthorized);
        }
        let issued = issue_session(&mut tx, verified.operator_id, 28800).await?;
        insert_operator_audit_event(
            &mut tx,
            OperatorAuditActor::Operator(verified.operator_id),
            "session_created",
            verified.operator_id,
            Some(issued.session.id),
            OperatorScope {
                organization_id,
                project_id,
            },
        )
        .await?;
        tx.commit().await?;
        Ok(issued)
    }
}

async fn login_window(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    kind: &str,
    bucket: &[u8],
    limit: i32,
) -> Result<bool, StoreError> {
    let admitted: Option<i32> = sqlx::query_scalar(
        "INSERT INTO password_login_admission(kind,bucket,window_start,attempts) VALUES($1,$2,now(),1) ON CONFLICT(kind,bucket) DO UPDATE SET attempts=CASE WHEN password_login_admission.window_start<=now()-interval '1 minute' THEN 1 ELSE password_login_admission.attempts+1 END,window_start=CASE WHEN password_login_admission.window_start<=now()-interval '1 minute' THEN now() ELSE password_login_admission.window_start END WHERE password_login_admission.window_start<=now()-interval '1 minute' OR password_login_admission.attempts<$3 RETURNING attempts"
    ).bind(kind).bind(bucket).bind(limit).fetch_optional(&mut **tx).await?;
    Ok(admitted.is_some())
}
