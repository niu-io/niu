use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use sqlx::FromRow;
use uuid::Uuid;

use crate::{Store, StoreError};

const MIN_SESSION_SECONDS: i64 = 60;
const MAX_SESSION_SECONDS: i64 = 31_536_000;

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum OperatorRole {
    Owner,
    Admin,
    Viewer,
}

impl OperatorRole {
    fn as_str(self) -> &'static str {
        match self {
            Self::Owner => "owner",
            Self::Admin => "admin",
            Self::Viewer => "viewer",
        }
    }

    fn parse(role: &str) -> Result<Self, StoreError> {
        match role {
            "owner" => Ok(Self::Owner),
            "admin" => Ok(Self::Admin),
            "viewer" => Ok(Self::Viewer),
            _ => Err(StoreError::InvalidOperator),
        }
    }

    pub fn permits(self, permission: AdminPermission) -> bool {
        match permission {
            AdminPermission::Read => true,
            AdminPermission::Write => matches!(self, Self::Owner | Self::Admin),
            AdminPermission::ManageOperators => self == Self::Owner,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AdminPermission {
    Read,
    Write,
    ManageOperators,
}

#[derive(Debug, Serialize)]
pub struct OperatorView {
    pub id: Uuid,
    pub name: String,
    pub role: OperatorRole,
    pub revoked: bool,
}

#[derive(Debug, Serialize)]
pub struct OperatorSessionView {
    pub id: Uuid,
    pub operator_id: Uuid,
    pub expires_at_unix: i64,
    pub revoked: bool,
}

#[derive(Debug, Serialize)]
pub struct IssuedOperatorSession {
    pub operator_id: Uuid,
    pub session: OperatorSessionView,
    pub token: String,
}

#[derive(FromRow)]
struct OperatorRow {
    id: Uuid,
    name: String,
    role: String,
    revoked: bool,
}

impl TryFrom<OperatorRow> for OperatorView {
    type Error = StoreError;

    fn try_from(row: OperatorRow) -> Result<Self, Self::Error> {
        Ok(Self {
            id: row.id,
            name: row.name,
            role: OperatorRole::parse(&row.role)?,
            revoked: row.revoked,
        })
    }
}

#[derive(FromRow)]
struct SessionRow {
    id: Uuid,
    operator_id: Uuid,
    expires_at_unix: i64,
    revoked: bool,
}

impl From<SessionRow> for OperatorSessionView {
    fn from(row: SessionRow) -> Self {
        Self {
            id: row.id,
            operator_id: row.operator_id,
            expires_at_unix: row.expires_at_unix,
            revoked: row.revoked,
        }
    }
}

impl Store {
    pub async fn authenticate_operator(&self, token: &str) -> Result<OperatorRole, StoreError> {
        if token.len() < 32 {
            return Err(StoreError::Unauthorized);
        }
        let digest = token_hash(token);
        let role: Option<String> = sqlx::query_scalar(
            "SELECT o.role FROM admin_sessions s JOIN admin_operators o ON o.id=s.operator_id \
             WHERE s.token_hash=$1 AND s.expires_at_unix > extract(epoch FROM now())::bigint \
               AND s.revoked_at IS NULL AND o.revoked_at IS NULL",
        )
        .bind(digest.as_slice())
        .fetch_optional(&self.pool)
        .await?;
        OperatorRole::parse(role.as_deref().ok_or(StoreError::Unauthorized)?)
    }

    pub async fn operators(&self) -> Result<Vec<OperatorView>, StoreError> {
        let rows: Vec<OperatorRow> = sqlx::query_as(
            "SELECT id, name, role, revoked_at IS NOT NULL AS revoked \
             FROM admin_operators ORDER BY created_at, id LIMIT 1000",
        )
        .fetch_all(&self.pool)
        .await?;
        rows.into_iter().map(OperatorView::try_from).collect()
    }

    pub async fn operator_sessions(
        &self,
        operator_id: Uuid,
    ) -> Result<Vec<OperatorSessionView>, StoreError> {
        let rows: Vec<SessionRow> = sqlx::query_as(
            "SELECT id, operator_id, expires_at_unix, revoked_at IS NOT NULL AS revoked \
             FROM admin_sessions WHERE operator_id=$1 ORDER BY created_at, id LIMIT 1000",
        )
        .bind(operator_id)
        .fetch_all(&self.pool)
        .await?;
        Ok(rows.into_iter().map(Into::into).collect())
    }

    pub async fn create_operator(
        &self,
        name: &str,
        role: OperatorRole,
        expires_in_seconds: i64,
    ) -> Result<IssuedOperatorSession, StoreError> {
        validate_operator(name, expires_in_seconds)?;
        let mut tx = self.pool.begin().await?;
        let operator_id = Uuid::new_v4();
        sqlx::query("INSERT INTO admin_operators (id, name, role) VALUES ($1, $2, $3)")
            .bind(operator_id)
            .bind(name.trim())
            .bind(role.as_str())
            .execute(&mut *tx)
            .await?;
        let issued = issue_session(&mut tx, operator_id, expires_in_seconds).await?;
        tx.commit().await?;
        Ok(issued)
    }

    pub async fn create_operator_session(
        &self,
        operator_id: Uuid,
        expires_in_seconds: i64,
    ) -> Result<IssuedOperatorSession, StoreError> {
        validate_operator("operator", expires_in_seconds)?;
        let mut tx = self.pool.begin().await?;
        let active: bool = sqlx::query_scalar(
            "SELECT revoked_at IS NULL FROM admin_operators WHERE id=$1 FOR UPDATE",
        )
        .bind(operator_id)
        .fetch_optional(&mut *tx)
        .await?
        .ok_or(StoreError::Conflict)?;
        if !active {
            return Err(StoreError::Conflict);
        }
        let issued = issue_session(&mut tx, operator_id, expires_in_seconds).await?;
        tx.commit().await?;
        Ok(issued)
    }

    pub async fn revoke_operator_session(
        &self,
        operator_id: Uuid,
        session_id: Uuid,
    ) -> Result<(), StoreError> {
        let result = sqlx::query(
            "UPDATE admin_sessions SET revoked_at=now() WHERE operator_id=$1 AND id=$2 AND revoked_at IS NULL",
        )
        .bind(operator_id)
        .bind(session_id)
        .execute(&self.pool)
        .await?;
        if result.rows_affected() != 1 {
            return Err(StoreError::Conflict);
        }
        Ok(())
    }

    pub async fn revoke_operator(&self, operator_id: Uuid) -> Result<(), StoreError> {
        let mut tx = self.pool.begin().await?;
        let result = sqlx::query(
            "UPDATE admin_operators SET revoked_at=now() WHERE id=$1 AND revoked_at IS NULL",
        )
        .bind(operator_id)
        .execute(&mut *tx)
        .await?;
        if result.rows_affected() != 1 {
            return Err(StoreError::Conflict);
        }
        sqlx::query(
            "UPDATE admin_sessions SET revoked_at=now() WHERE operator_id=$1 AND revoked_at IS NULL",
        )
        .bind(operator_id)
        .execute(&mut *tx)
        .await?;
        tx.commit().await?;
        Ok(())
    }
}

async fn issue_session(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    operator_id: Uuid,
    expires_in_seconds: i64,
) -> Result<IssuedOperatorSession, StoreError> {
    let token = format!(
        "niu_admin_{}{}",
        Uuid::new_v4().simple(),
        Uuid::new_v4().simple()
    );
    let digest = token_hash(&token);
    let expires_at_unix: i64 = sqlx::query_scalar("SELECT extract(epoch FROM now())::bigint + $1")
        .bind(expires_in_seconds)
        .fetch_one(&mut **tx)
        .await?;
    let session_id = Uuid::new_v4();
    sqlx::query("INSERT INTO admin_sessions (id, operator_id, token_hash, expires_at_unix) VALUES ($1, $2, $3, $4)")
        .bind(session_id)
        .bind(operator_id)
        .bind(digest.as_slice())
        .bind(expires_at_unix)
        .execute(&mut **tx)
        .await?;
    Ok(IssuedOperatorSession {
        operator_id,
        session: OperatorSessionView {
            id: session_id,
            operator_id,
            expires_at_unix,
            revoked: false,
        },
        token,
    })
}

fn validate_operator(name: &str, ttl: i64) -> Result<(), StoreError> {
    if name.trim().is_empty()
        || name.len() > 200
        || !(MIN_SESSION_SECONDS..=MAX_SESSION_SECONDS).contains(&ttl)
    {
        return Err(StoreError::InvalidOperator);
    }
    Ok(())
}

fn token_hash(token: &str) -> [u8; 32] {
    Sha256::digest(token.as_bytes()).into()
}
