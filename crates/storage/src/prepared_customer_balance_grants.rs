//! Durable noncash publication intent; no balance, reservation or payment on prepare.
use crate::{
    CustomerBalanceGrantPolicy, CustomerBalanceGrantPublication, OperatorAuditActor, Store,
    StoreError,
};
use serde_json::Value;
use uuid::Uuid;
impl Store {
    pub async fn prepare_customer_balance_grant(
        &self,
        organization: Uuid,
        publication: CustomerBalanceGrantPublication<'_>,
        actor: OperatorAuditActor,
        policy: CustomerBalanceGrantPolicy,
    ) -> Result<Uuid, StoreError> {
        publication.validate()?;
        let mut tx = self.begin_bounded_recording().await?;
        sqlx::query("SELECT id FROM organizations WHERE id=$1 FOR UPDATE")
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
            return Ok(id);
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
        tx.commit().await?;
        Ok(id)
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
