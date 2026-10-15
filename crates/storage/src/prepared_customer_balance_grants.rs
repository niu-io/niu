//! Durable noncash publication intent; no balance, reservation or payment on prepare.
use crate::{
    CustomerBalanceGrantPolicy, CustomerBalanceGrantPublication, OperatorAuditActor, Store,
    StoreError,
};
use serde_json::Value;
use uuid::Uuid;
impl Store {
    async fn prepared_customer_balance_grant_document_in_tx(
        tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
        organization: Uuid,
        id: Uuid,
    ) -> Result<Value, StoreError> {
        sqlx::query_scalar(
            r#"SELECT jsonb_build_object(
                'id',i.id,'idempotency_key',i.idempotency_key,'currency',i.currency,
                'amount_nanos',i.amount_nanos::text,'reason',i.reason,
                'application_policy',i.application_policy,'created_at',i.created_at,
                'status',CASE WHEN g.id IS NULL THEN 'prepared' ELSE 'issued' END,
                'result',CASE WHEN g.id IS NULL THEN NULL ELSE jsonb_build_object(
                    'id',g.id,'application_policy',i.application_policy,
                    'applied_to_credit_nanos',allocated.amount::text,
                    'retained_for_future_consumption_nanos',(g.amount_nanos::numeric-allocated.amount)::text
                ) END)
            FROM prepared_customer_balance_grants i
            LEFT JOIN customer_balance_grants g ON g.organization_id=i.organization_id AND g.idempotency_key=i.idempotency_key
            LEFT JOIN LATERAL (
                SELECT COALESCE(sum(a.amount_nanos::numeric),0) AS amount
                FROM customer_grant_credit_applications a WHERE a.grant_id=g.id
            ) allocated ON true
            WHERE i.id=$1 AND i.organization_id=$2"#,
        )
        .bind(id)
        .bind(organization)
        .fetch_optional(&mut **tx)
        .await?
        .ok_or(StoreError::Conflict)
    }

    pub async fn prepare_customer_balance_grant(
        &self,
        organization: Uuid,
        publication: CustomerBalanceGrantPublication<'_>,
        actor: OperatorAuditActor,
        policy: CustomerBalanceGrantPolicy,
    ) -> Result<Uuid, StoreError> {
        let (id, _) = self
            .prepare_customer_balance_grant_inner(organization, publication, actor, policy, false)
            .await?;
        Ok(id)
    }

    pub async fn prepare_customer_balance_grant_record(
        &self,
        organization: Uuid,
        publication: CustomerBalanceGrantPublication<'_>,
        actor: OperatorAuditActor,
        policy: CustomerBalanceGrantPolicy,
    ) -> Result<Value, StoreError> {
        let (_, document) = self
            .prepare_customer_balance_grant_inner(organization, publication, actor, policy, true)
            .await?;
        document.ok_or(StoreError::Conflict)
    }

    async fn prepare_customer_balance_grant_inner(
        &self,
        organization: Uuid,
        publication: CustomerBalanceGrantPublication<'_>,
        actor: OperatorAuditActor,
        policy: CustomerBalanceGrantPolicy,
        include_document: bool,
    ) -> Result<(Uuid, Option<Value>), StoreError> {
        publication.validate()?;
        let mut tx = self.begin_bounded_recording().await?;
        sqlx::query("SELECT id FROM organizations WHERE id=$1 FOR NO KEY UPDATE")
            .bind(organization)
            .fetch_optional(&mut *tx)
            .await?
            .ok_or(StoreError::Conflict)?;
        let prior: Option<(Uuid,String,i64,String,String)>=sqlx::query_as("SELECT id,currency,amount_nanos,reason,application_policy FROM prepared_customer_balance_grants WHERE organization_id=$1 AND idempotency_key=$2")
            .bind(organization).bind(publication.idempotency_key).fetch_optional(&mut *tx).await?;
        if let Some((id, currency, amount, reason, saved_policy)) = prior {
            if currency != publication.currency
                || amount != publication.amount_nanos
                || reason != publication.reason
                || saved_policy != policy.as_str()
            {
                return Err(StoreError::Conflict);
            }
            let document = if include_document {
                Some(
                    Self::prepared_customer_balance_grant_document_in_tx(&mut tx, organization, id)
                        .await?,
                )
            } else {
                None
            };
            tx.commit().await?;
            return Ok((id, document));
        }
        let published: Option<(String,i64,String,String)>=sqlx::query_as("SELECT g.currency,g.amount_nanos,g.reason,COALESCE(p.policy,'future_only') FROM customer_balance_grants g LEFT JOIN customer_grant_policies p ON p.grant_id=g.id WHERE g.organization_id=$1 AND g.idempotency_key=$2")
            .bind(organization).bind(publication.idempotency_key).fetch_optional(&mut *tx).await?;
        if published.is_some_and(|(currency, amount, reason, saved_policy)| {
            currency != publication.currency
                || amount != publication.amount_nanos
                || reason != publication.reason
                || saved_policy != policy.as_str()
        }) {
            return Err(StoreError::Conflict);
        }
        let id = Uuid::new_v4();
        let (kind, operator) = actor.kind_and_id();
        sqlx::query("INSERT INTO prepared_customer_balance_grants(id,organization_id,currency,amount_nanos,reason,idempotency_key,application_policy,actor_kind,actor_operator_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)")
            .bind(id).bind(organization).bind(publication.currency).bind(publication.amount_nanos).bind(publication.reason).bind(publication.idempotency_key).bind(policy.as_str()).bind(kind).bind(operator).execute(&mut *tx).await?;
        let document = if include_document {
            Some(
                Self::prepared_customer_balance_grant_document_in_tx(&mut tx, organization, id)
                    .await?,
            )
        } else {
            None
        };
        tx.commit().await?;
        Ok((id, document))
    }
    pub async fn prepared_customer_balance_grants(
        &self,
        organization: Uuid,
        currency: &str,
        before: Option<Uuid>,
        limit: i64,
        key: Option<Uuid>,
    ) -> Result<Value, StoreError> {
        if currency.len() != 3
            || !currency.bytes().all(|b| b.is_ascii_uppercase())
            || !(1..=100).contains(&limit)
        {
            return Err(StoreError::InvalidPrice);
        }
        let mut tx = self.begin_bounded_read_snapshot().await?;
        let (valid, page): (bool, Value) =
            sqlx::query_as(include_str!("prepared_customer_balance_grants.sql"))
                .bind(organization)
                .bind(currency)
                .bind(before)
                .bind(limit)
                .bind(key)
                .fetch_one(&mut *tx)
                .await?;
        if !valid {
            return Err(StoreError::Conflict);
        }
        tx.commit().await?;
        Ok(page)
    }
}
