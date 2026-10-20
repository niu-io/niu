//! Atomic workspace onboarding with optional durable, actor-scoped replay.
use crate::{OperatorAuditActor, OperatorPrincipal, Store, StoreError, TenantScope};
use pinyin::ToPinyin;
use sha2::{Digest, Sha256};
use unicode_normalization::{UnicodeNormalization, char::is_combining_mark};
use uuid::Uuid;

pub struct WorkspaceCreationKey {
    pub actor: OperatorAuditActor,
    pub key_sha256: Vec<u8>,
}

/// Optional initial lifetime retail spending cap, committed with the workspace.
#[derive(serde::Serialize)]
pub struct WorkspaceCreationLimit {
    pub currency: String,
    pub limit_nanos: i64,
}

impl Store {
    pub async fn create_workspace(
        &self,
        organization_id: Option<Uuid>,
        name: &str,
    ) -> Result<TenantScope, StoreError> {
        self.create_workspace_with_key(organization_id, name, None, None)
            .await
    }

    /// Receipt, optional company/account and workspace commit together. Replays
    /// return the original identity. Gateway callers supply the authenticated
    /// member for transactional reauthorization; None is installation/internal use.
    pub async fn create_workspace_with_key(
        &self,
        organization_id: Option<Uuid>,
        name: &str,
        key: Option<WorkspaceCreationKey>,
        member: Option<OperatorPrincipal>,
    ) -> Result<TenantScope, StoreError> {
        self.create_workspace_with_slug(organization_id, name, None, key, member)
            .await
    }

    pub async fn create_workspace_with_slug(
        &self,
        organization_id: Option<Uuid>,
        name: &str,
        slug: Option<&str>,
        key: Option<WorkspaceCreationKey>,
        member: Option<OperatorPrincipal>,
    ) -> Result<TenantScope, StoreError> {
        self.create_workspace_with_limit(organization_id, name, slug, None, key, member).await
    }

    pub async fn create_workspace_with_limit(
        &self,
        organization_id: Option<Uuid>,
        name: &str,
        slug: Option<&str>,
        limit: Option<WorkspaceCreationLimit>,
        key: Option<WorkspaceCreationKey>,
        member: Option<OperatorPrincipal>,
    ) -> Result<TenantScope, StoreError> {
        let request =
            serde_json::to_vec(&serde_json::json!({"organization_id":organization_id,"name":name}))
                .map_err(|_| StoreError::Conflict)?;
        let request = if let Some(slug) = slug {
            serde_json::to_vec(
                &serde_json::json!({"organization_id": organization_id,"name":name,"slug":slug}),
            )
            .map_err(|_| StoreError::Conflict)?
        } else {
            request
        };
        let request = if let Some(limit) = &limit {
            let mut value: serde_json::Value = serde_json::from_slice(&request).map_err(|_| StoreError::Conflict)?;
            value["spending_limit"] = serde_json::to_value(limit).map_err(|_| StoreError::Conflict)?;
            serde_json::to_vec(&value).map_err(|_| StoreError::Conflict)?
        } else { request };
        let request_sha256 = Sha256::digest(request).to_vec();
        let limit_actor = member.map(|m| OperatorAuditActor::Operator(m.id)).unwrap_or(OperatorAuditActor::Installation);
        let identity = key.map(|key| {
            let (kind, actor) = match key.actor {
                OperatorAuditActor::Installation => ("installation", Uuid::nil()),
                OperatorAuditActor::Operator(id) => ("member", id),
            };
            (kind, actor, key.key_sha256)
        });
        if let Some((kind, actor, hash)) = &identity
            && (hash.len() != 32 || (*kind == "member" && actor.is_nil()))
        {
            return Err(StoreError::Conflict);
        }
        let mut tx = self.begin_bounded_recording().await?;
        if let Some((kind, actor, hash)) = &identity {
            sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended('niu-workspace-create:'||$1::text||':'||$2::uuid::text||':'||encode($3::bytea,'hex'),0))")
                .bind(kind).bind(actor).bind(hash).execute(&mut *tx).await?;
        }
        if let Some(member) = member {
            Self::authorize_company_writer_in_tx(
                &mut tx,
                organization_id.ok_or(StoreError::Unauthorized)?,
                member,
            )
            .await?;
        }
        if let Some((kind, actor, hash)) = &identity {
            let saved: Option<(Vec<u8>, Uuid, Uuid)> = sqlx::query_as("SELECT request_sha256,organization_id,project_id FROM workspace_creation_receipts WHERE actor_kind=$1 AND actor_id=$2 AND key_sha256=$3")
                .bind(kind).bind(actor).bind(hash).fetch_optional(&mut *tx).await?;
            if let Some((request, organization_id, project_id)) = saved {
                if request != request_sha256 {
                    return Err(StoreError::Conflict);
                }
                tx.commit().await?;
                return Ok(TenantScope {
                    organization_id,
                    project_id,
                });
            }
        }
        let organization_id = match organization_id {
            Some(id) => id,
            None => {
                Self::create_prepaid_organization_in_tx(&mut tx, "Personal workspace", "USD")
                    .await?
            }
        };
        let generated_slug;
        let slug = match slug {
            Some(slug) => slug,
            None => {
                generated_slug =
                    sqlx::query_scalar::<_, String>("SELECT niu_available_workspace_slug($1)")
                        .bind(workspace_slug_from_name(name))
                        .fetch_one(&mut *tx)
                        .await?;
                &generated_slug
            }
        };
        let project_id = Uuid::new_v4();
        sqlx::query("INSERT INTO projects(id,organization_id,name,route_slug) VALUES($1,$2,$3,$4)")
            .bind(project_id)
            .bind(organization_id)
            .bind(name)
            .bind(slug)
            .execute(&mut *tx)
            .await
            .map_err(|error| match &error {
                sqlx::Error::Database(db) if db.code().as_deref() == Some("23505") => {
                    StoreError::WorkspaceSlugTaken
                }
                _ => StoreError::Database(error),
            })?;
        if let Some(limit) = limit {
            Self::set_workspace_limit_in_tx(&mut tx, TenantScope { organization_id, project_id }, &limit.currency, limit.limit_nanos, 0, Some(limit_actor)).await?;
        }
        if let Some((kind, actor, hash)) = identity {
            sqlx::query("INSERT INTO workspace_creation_receipts(actor_kind,actor_id,key_sha256,request_sha256,organization_id,project_id) VALUES($1,$2,$3,$4,$5,$6)")
                .bind(kind).bind(actor).bind(hash).bind(request_sha256).bind(organization_id).bind(project_id).execute(&mut *tx).await?;
        }
        tx.commit().await?;
        Ok(TenantScope {
            organization_id,
            project_id,
        })
    }
}

/// Deterministic, local transliteration; saved slugs never change on rename.
pub(crate) fn workspace_slug_from_name(name: &str) -> String {
    let mut romanized = String::new();
    for character in name.chars() {
        if let Some(pinyin) = character.to_pinyin() {
            romanized.push(' ');
            romanized.push_str(pinyin.plain());
            romanized.push(' ');
        } else {
            romanized.push(character);
        }
    }
    let mut slug = String::new();
    let mut separator = false;
    for c in romanized
        .nfkd()
        .filter(|c| !is_combining_mark(*c))
        .flat_map(char::to_lowercase)
    {
        if c.is_ascii_alphanumeric() {
            if separator && !slug.is_empty() {
                slug.push('-');
            }
            slug.push(c);
            separator = false;
        } else {
            separator = true;
        }
    }
    slug.truncate(slug.len().min(48));
    let slug = slug.trim_end_matches('-');
    match slug {
        "" => "workspace".into(),
        "default" => "default-workspace".into(),
        _ => slug.into(),
    }
}

#[cfg(test)]
mod slug_tests {
    use super::workspace_slug_from_name;
    #[test]
    fn names_produce_readable_ascii_slugs() {
        for (name, expected) in [
            ("  Product   experiments  ", "product-experiments"),
            ("产品 实验", "chan-pin-shi-yan"),
            ("Niu 测试", "niu-ce-shi"),
            ("Café / Déjà Vu!", "cafe-deja-vu"),
            ("ＡＢＣ　１２３", "abc-123"),
            ("🚀 !!!", "workspace"),
            ("Default", "default-workspace"),
        ] {
            assert_eq!(workspace_slug_from_name(name), expected);
        }
        assert_eq!(workspace_slug_from_name(&"a".repeat(100)).len(), 48);
    }
}
