//! Media offer revisions pin configuration without inventing text-token prices.
use crate::{Store, StoreError};
use serde::Deserialize;
use serde_json::{Value, json};
use sqlx::Row;
use uuid::Uuid;

fn publication_error(error: sqlx::Error) -> StoreError {
    if error
        .as_database_error()
        .and_then(|e| e.code())
        .is_some_and(|code| code == "23505")
    {
        StoreError::Conflict
    } else {
        StoreError::Database(error)
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SupplierMediaOfferInput {
    pub revision: Uuid,
    pub model_alias: String,
    pub vendor_id: Uuid,
    #[serde(deserialize_with = "positive_revision")]
    pub vendor_revision: i64,
    #[serde(deserialize_with = "positive_revision")]
    pub model_revision: i64,
    pub schema_revision: String,
    pub expected_revision: Option<Uuid>,
}

fn positive_revision<'de, D: serde::Deserializer<'de>>(deserializer: D) -> Result<i64, D::Error> {
    #[derive(Deserialize)]
    #[serde(untagged)]
    enum Revision {
        Number(i64),
        Decimal(String),
    }
    let value = match Revision::deserialize(deserializer)? {
        Revision::Number(value) => value,
        Revision::Decimal(value) => {
            if value.len() > 19
                || value.starts_with('0')
                || !value.bytes().all(|byte| byte.is_ascii_digit())
            {
                return Err(serde::de::Error::custom(
                    "A canonical positive revision is required",
                ));
            }
            value.parse().map_err(serde::de::Error::custom)?
        }
    };
    if value < 1 {
        return Err(serde::de::Error::custom("A positive revision is required"));
    }
    Ok(value)
}

impl Store {
    pub async fn supplier_media_offer_models(
        &self,
        supplier: Uuid,
        after: Option<&str>,
        limit: i64,
    ) -> Result<Value, StoreError> {
        if !(1..=100).contains(&limit)
            || after.is_some_and(|s| {
                s.is_empty() || s.len() > 256 || s.trim() != s || s.chars().any(char::is_control)
            })
        {
            return Err(StoreError::InvalidPrice);
        }
        let mut rows=sqlx::query("SELECT m.alias,v.id AS vendor_id,v.name,v.revision AS vendor_revision,m.revision AS model_revision,m.upstream_model,m.capabilities->'video_schema' AS schema,o.current_revision FROM vendor_supplier_ownership s JOIN vendors v ON v.id=s.vendor_id JOIN vendor_models m ON m.vendor_id=v.id LEFT JOIN provider_offers o ON o.model_alias=m.alias AND o.provider_id=s.provider_id WHERE s.provider_id=$1 AND jsonb_typeof(m.capabilities->'video_schema')='object' AND NOT EXISTS(SELECT 1 FROM personal_vendor_ownership p WHERE p.vendor_id=v.id) AND NOT EXISTS(SELECT 1 FROM provider_offers x WHERE x.model_alias=m.alias AND x.provider_id<>$1) AND ($2::text IS NULL OR m.alias>$2) ORDER BY m.alias LIMIT $3")
            .bind(supplier).bind(after).bind(limit+1).fetch_all(&self.pool).await?;
        let more = rows.len() > limit as usize;
        rows.truncate(limit as usize);
        let next = more
            .then(|| rows.last().map(|r| r.get::<String, _>("alias")))
            .flatten();
        let mut data = Vec::new();
        for row in rows {
            let Ok(schema) = serde_json::from_value::<niu_media::VideoSchema>(row.get("schema"))
            else {
                continue;
            };
            let alias: String = row.get("alias");
            if schema.validate().is_err()
                || schema.model_alias != alias
                || schema.upstream_model != row.get::<String, _>("upstream_model")
            {
                continue;
            }
            data.push(json!({"model_alias":alias,"api_key_name":row.get::<String,_>("name"),"vendor_id":row.get::<Uuid,_>("vendor_id"),"vendor_revision":row.get::<i64,_>("vendor_revision").to_string(),"model_revision":row.get::<i64,_>("model_revision").to_string(),"schema_revision":schema.revision,"channel":schema.channel,"offer_revision":row.get::<Option<Uuid>,_>("current_revision")}));
        }
        Ok(json!({"data":data,"has_more":more,"next_after":next}))
    }

    pub async fn publish_supplier_media_offer(
        &self,
        supplier: Uuid,
        input: &SupplierMediaOfferInput,
    ) -> Result<Uuid, StoreError> {
        if input.vendor_revision < 1
            || input.model_revision < 1
            || input.model_alias.is_empty()
            || input.model_alias.len() > 256
            || input.model_alias.trim() != input.model_alias
            || input.model_alias.chars().any(char::is_control)
            || input.schema_revision.is_empty()
            || input.schema_revision.len() > 256
            || input.schema_revision.trim() != input.schema_revision
            || input.schema_revision.chars().any(char::is_control)
        {
            return Err(StoreError::InvalidVendor);
        }
        let mut tx = self.pool.begin().await?;
        sqlx::query(
            "SELECT id FROM provider_businesses WHERE id=$1 AND deleted_at IS NULL FOR UPDATE",
        )
        .bind(supplier)
        .fetch_optional(&mut *tx)
        .await?
        .ok_or(StoreError::Conflict)?;
        // Receipt replay never reactivates or replaces a later current revision.
        if let Some(row)=sqlx::query("SELECT o.provider_id,o.model_alias,r.rate_kind,r.vendor_id,r.vendor_revision,r.model_revision,r.schema_revision,r.replaces_revision FROM provider_offer_revisions r JOIN provider_offers o ON o.id=r.offer_id WHERE r.id=$1").bind(input.revision).fetch_optional(&mut *tx).await? {
            if row.get::<Uuid,_>("provider_id")!=supplier || row.get::<String,_>("model_alias")!=input.model_alias || row.get::<String,_>("rate_kind")!="media" || row.get::<Option<Uuid>,_>("vendor_id")!=Some(input.vendor_id)
                || row.get::<Option<i64>,_>("vendor_revision")!=Some(input.vendor_revision) || row.get::<Option<i64>,_>("model_revision")!=Some(input.model_revision) || row.get::<Option<String>,_>("schema_revision").as_deref()!=Some(input.schema_revision.as_str()) || row.get::<Option<Uuid>,_>("replaces_revision")!=input.expected_revision {
                return Err(StoreError::Conflict);
            }
            tx.commit().await?;
            return Ok(input.revision);
        }
        let model=sqlx::query("SELECT vendor_id,upstream_model,revision,capabilities->'video_schema' AS schema FROM vendor_models WHERE alias=$1 FOR SHARE").bind(&input.model_alias).fetch_optional(&mut *tx).await?.ok_or(StoreError::Conflict)?;
        let vendor = model.get::<Uuid, _>("vendor_id");
        if vendor != input.vendor_id || model.get::<i64, _>("revision") != input.model_revision {
            return Err(StoreError::Conflict);
        }
        let schema: niu_media::VideoSchema =
            serde_json::from_value(model.get("schema")).map_err(|_| StoreError::InvalidVendor)?;
        schema.validate().map_err(|_| StoreError::InvalidVendor)?;
        if schema.model_alias != input.model_alias
            || schema.upstream_model != model.get::<String, _>("upstream_model")
            || schema.revision != input.schema_revision
        {
            return Err(StoreError::Conflict);
        }
        let current: i64 = sqlx::query_scalar("SELECT revision FROM vendors WHERE id=$1 FOR SHARE")
            .bind(vendor)
            .fetch_one(&mut *tx)
            .await?;
        let owned:bool=sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM vendor_supplier_ownership s WHERE s.vendor_id=$1 AND s.provider_id=$2) AND NOT EXISTS(SELECT 1 FROM personal_vendor_ownership p WHERE p.vendor_id=$1)").bind(vendor).bind(supplier).fetch_one(&mut *tx).await?;
        if current != input.vendor_revision || !owned {
            return Err(StoreError::Conflict);
        }
        let existing:Option<(Uuid,Uuid,Option<Uuid>)>=sqlx::query_as("SELECT id,provider_id,current_revision FROM provider_offers WHERE model_alias=$1 FOR UPDATE").bind(&input.model_alias).fetch_optional(&mut *tx).await?;
        let offer = match existing {
            Some((id, owner, revision)) => {
                if owner != supplier || revision != input.expected_revision {
                    return Err(StoreError::Conflict);
                }
                id
            }
            None => {
                if input.expected_revision.is_some() {
                    return Err(StoreError::Conflict);
                }
                let id = Uuid::new_v4();
                sqlx::query("INSERT INTO provider_offers(id,provider_id,model_alias,vendor_id,active) VALUES($1,$2,$3,$4,FALSE)").bind(id).bind(supplier).bind(&input.model_alias).bind(vendor).execute(&mut *tx).await.map_err(publication_error)?;
                id
            }
        };
        sqlx::query("INSERT INTO provider_offer_revisions(id,offer_id,rate_kind,vendor_id,vendor_revision,model_revision,schema_revision,replaces_revision) VALUES($1,$2,'media',$3,$4,$5,$6,$7)").bind(input.revision).bind(offer).bind(vendor).bind(input.vendor_revision).bind(input.model_revision).bind(&input.schema_revision).bind(input.expected_revision).execute(&mut *tx).await.map_err(publication_error)?;
        sqlx::query("UPDATE provider_offers SET vendor_id=$3,current_revision=$2,active=FALSE,current_qualification_review=NULL WHERE id=$1").bind(offer).bind(input.revision).bind(vendor).execute(&mut *tx).await.map_err(publication_error)?;
        sqlx::query("INSERT INTO provider_audit_events(provider_id,action,resource_id) VALUES($1,'media_offer_configured',$2)").bind(supplier).bind(input.revision).execute(&mut *tx).await?;
        tx.commit().await?;
        Ok(input.revision)
    }

    pub async fn supplier_model_uses_media_offer(&self, alias: &str) -> Result<bool, StoreError> {
        Ok(sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM provider_offers o JOIN provider_offer_revisions r ON r.id=o.current_revision WHERE o.model_alias=$1 AND r.rate_kind='media')").bind(alias).fetch_one(&self.pool).await?)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn revision_writes_preserve_exact_decimal_strings_and_legacy_numbers() {
        let mut body = json!({"revision":uuid::Uuid::new_v4(),"model_alias":"video","vendor_id":uuid::Uuid::new_v4(),"vendor_revision":1,"model_revision":1,"schema_revision":"one","expected_revision":null});
        assert_eq!(
            serde_json::from_value::<SupplierMediaOfferInput>(body.clone())
                .unwrap()
                .vendor_revision,
            1
        );
        for revision in ["9007199254740993", "9223372036854775807"] {
            body["vendor_revision"] = json!(revision);
            assert_eq!(
                serde_json::from_value::<SupplierMediaOfferInput>(body.clone())
                    .unwrap()
                    .vendor_revision,
                revision.parse::<i64>().unwrap()
            );
        }
        for invalid in [
            json!(""),
            json!("0"),
            json!("01"),
            json!(" 1"),
            json!("+1"),
            json!("1.0"),
            json!("9223372036854775808"),
            json!("-1"),
            json!(0),
            json!(-1),
            json!(1.5),
            json!(true),
        ] {
            for field in ["vendor_revision", "model_revision"] {
                let mut invalid_body = body.clone();
                invalid_body[field] = invalid.clone();
                assert!(serde_json::from_value::<SupplierMediaOfferInput>(invalid_body).is_err());
            }
        }
    }
}
