//! Retail billing: independent from upstream costs and supplier earnings.
use crate::{ProviderOfferInput, Store, StoreError, TenantScope, TokenRates};
use serde_json::{Value, json};
use sqlx::Row;
use uuid::Uuid;

impl Store {
    pub async fn publish_customer_tariff(
        &self,
        scope: TenantScope,
        input: &ProviderOfferInput,
    ) -> Result<Uuid, StoreError> {
        let prompt = input
            .prompt_rate
            .parse::<i64>()
            .map_err(|_| StoreError::InvalidPrice)?;
        let completion = input
            .completion_rate
            .parse::<i64>()
            .map_err(|_| StoreError::InvalidPrice)?;
        if input.currency.len() != 3
            || !input.currency.bytes().all(|b| b.is_ascii_uppercase())
            || input.model_alias.trim().is_empty()
            || input.model_alias.len() > 200
            || [prompt, completion]
                .iter()
                .any(|n| !(0..=1_000_000_000_000_000).contains(n))
        {
            return Err(StoreError::InvalidPrice);
        }
        let mut tx = self.pool.begin().await?;
        sqlx::query("SELECT id FROM projects WHERE organization_id=$1 AND id=$2 FOR UPDATE")
            .bind(scope.organization_id)
            .bind(scope.project_id)
            .fetch_optional(&mut *tx)
            .await?
            .ok_or(StoreError::Conflict)?;
        let existing:Option<(Uuid,Uuid)>=sqlx::query_as("SELECT id,current_revision FROM customer_tariffs WHERE organization_id=$1 AND project_id=$2 AND model_alias=$3 FOR UPDATE").bind(scope.organization_id).bind(scope.project_id).bind(&input.model_alias).fetch_optional(&mut *tx).await?;
        let tariff = match existing {
            Some((id, revision)) => {
                if input.expected_revision != Some(revision) {
                    return Err(StoreError::Conflict);
                }
                id
            }
            None => {
                if input.expected_revision.is_some() {
                    return Err(StoreError::Conflict);
                }
                let id = Uuid::new_v4();
                sqlx::query("INSERT INTO customer_tariffs(id,organization_id,project_id,model_alias) VALUES($1,$2,$3,$4)").bind(id).bind(scope.organization_id).bind(scope.project_id).bind(&input.model_alias).execute(&mut *tx).await?;
                id
            }
        };
        let revision = Uuid::new_v4();
        sqlx::query("INSERT INTO customer_tariff_revisions(id,tariff_id,currency,prompt_rate,completion_rate) VALUES($1,$2,$3,$4,$5)").bind(revision).bind(tariff).bind(&input.currency).bind(prompt).bind(completion).execute(&mut *tx).await?;
        sqlx::query("UPDATE customer_tariffs SET current_revision=$2 WHERE id=$1")
            .bind(tariff)
            .bind(revision)
            .execute(&mut *tx)
            .await?;
        sqlx::query("INSERT INTO customer_billing_audit(organization_id,project_id,action,resource_id) VALUES($1,$2,'tariff_published',$3)").bind(scope.organization_id).bind(scope.project_id).bind(revision).execute(&mut *tx).await?;
        tx.commit().await?;
        Ok(revision)
    }
    pub async fn bind_customer_tariff(
        &self,
        scope: TenantScope,
        attempt: Uuid,
        alias: &str,
    ) -> Result<(), StoreError> {
        let mut tx = self.pool.begin().await?;
        sqlx::query("SELECT id FROM projects WHERE organization_id=$1 AND id=$2 FOR SHARE")
            .bind(scope.organization_id)
            .bind(scope.project_id)
            .fetch_optional(&mut *tx)
            .await?
            .ok_or(StoreError::Conflict)?;
        sqlx::query("INSERT INTO customer_attempt_tariffs(attempt_id,revision_id) SELECT a.id,t.current_revision FROM attempts a JOIN customer_tariffs t ON t.organization_id=a.organization_id AND t.project_id=a.project_id AND t.model_alias=a.resource_id WHERE a.id=$1 AND a.organization_id=$2 AND a.project_id=$3 AND a.resource_id=$4 AND a.execution='not_sent'").bind(attempt).bind(scope.organization_id).bind(scope.project_id).bind(alias).execute(&mut *tx).await?;
        tx.commit().await?;
        Ok(())
    }
    pub async fn accrue_customer_charge(&self, attempt: Uuid) -> Result<(), StoreError> {
        let mut tx = self.pool.begin().await?;
        let row=sqlx::query("SELECT a.organization_id,a.project_id,b.revision_id,r.currency,r.prompt_rate,r.completion_rate,a.prompt_tokens,a.completion_tokens FROM attempts a JOIN customer_attempt_tariffs b ON b.attempt_id=a.id JOIN customer_tariff_revisions r ON r.id=b.revision_id WHERE a.id=$1 AND a.execution='confirmed_completed' AND a.usage_confidence='provider_reported'").bind(attempt).fetch_optional(&mut *tx).await?;
        if let Some(row) = row {
            let prompt: i64 = row.get("prompt_tokens");
            let completion: i64 = row.get("completion_tokens");
            let amount = TokenRates {
                prompt: row.get("prompt_rate"),
                completion: row.get("completion_rate"),
            }
            .charge(prompt, completion)?;
            sqlx::query("INSERT INTO customer_charges(attempt_id,organization_id,project_id,revision_id,currency,amount_nanos,prompt_tokens,completion_tokens) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(attempt_id) DO NOTHING").bind(attempt).bind(row.get::<Uuid,_>("organization_id")).bind(row.get::<Uuid,_>("project_id")).bind(row.get::<Uuid,_>("revision_id")).bind(row.get::<String,_>("currency")).bind(amount).bind(prompt).bind(completion).execute(&mut *tx).await?;
        }
        tx.commit().await?;
        Ok(())
    }
    pub async fn recover_customer_charges(
        &self,
        after: Option<Uuid>,
    ) -> Result<(Option<Uuid>, usize), StoreError> {
        let ids:Vec<Uuid>=sqlx::query_scalar("SELECT a.id FROM attempts a JOIN customer_attempt_tariffs b ON b.attempt_id=a.id LEFT JOIN customer_charges c ON c.attempt_id=a.id WHERE c.attempt_id IS NULL AND a.execution='confirmed_completed' AND a.usage_confidence='provider_reported' AND ($1::uuid IS NULL OR a.id>$1) ORDER BY a.id LIMIT 100").bind(after).fetch_all(&self.pool).await?;
        let next = if ids.len() == 100 {
            ids.last().copied()
        } else {
            None
        };
        let mut failed = 0;
        for id in ids {
            if self.accrue_customer_charge(id).await.is_err() {
                failed += 1;
            }
        }
        Ok((next, failed))
    }
    /// Closed UTC dispatch interval, one currency, no overlaps or unresolved priced usage.
    pub async fn issue_customer_invoice(
        &self,
        scope: TenantScope,
        from: i64,
        to: i64,
        currency: &str,
        key: Uuid,
    ) -> Result<Uuid, StoreError> {
        if from < 0
            || to <= from
            || to - from > 366 * 86_400_000
            || currency.len() != 3
            || !currency.bytes().all(|b| b.is_ascii_uppercase())
        {
            return Err(StoreError::InvalidPrice);
        }
        let mut tx = self.pool.begin().await?;
        sqlx::query("SELECT id FROM projects WHERE organization_id=$1 AND id=$2 FOR UPDATE")
            .bind(scope.organization_id)
            .bind(scope.project_id)
            .fetch_optional(&mut *tx)
            .await?
            .ok_or(StoreError::Conflict)?;
        if let Some((id,old_from,old_to,old_currency))=sqlx::query_as::<_,(Uuid,i64,i64,String)>("SELECT id,from_ms,to_ms,currency FROM customer_invoices WHERE organization_id=$1 AND project_id=$2 AND idempotency_key=$3").bind(scope.organization_id).bind(scope.project_id).bind(key).fetch_optional(&mut *tx).await?{if old_from!=from || old_to!=to || old_currency!=currency{return Err(StoreError::Conflict);}return Ok(id);}
        let future: bool = sqlx::query_scalar(
            "SELECT $1>floor(extract(epoch FROM clock_timestamp())*1000)::bigint",
        )
        .bind(to)
        .fetch_one(&mut *tx)
        .await?;
        if future {
            return Err(StoreError::InvalidPrice);
        }
        let overlaps:bool=sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM customer_invoices WHERE organization_id=$1 AND project_id=$2 AND currency=$3 AND from_ms<$5 AND to_ms>$4)").bind(scope.organization_id).bind(scope.project_id).bind(currency).bind(from).bind(to).fetch_one(&mut *tx).await?;
        if overlaps {
            return Err(StoreError::Conflict);
        }
        let unresolved:bool=sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM attempts a JOIN customer_attempt_tariffs b ON b.attempt_id=a.id JOIN customer_tariff_revisions r ON r.id=b.revision_id LEFT JOIN customer_charges c ON c.attempt_id=a.id WHERE a.organization_id=$1 AND a.project_id=$2 AND r.currency=$3 AND a.dispatched_at>=to_timestamp($4::double precision/1000) AND a.dispatched_at<to_timestamp($5::double precision/1000) AND c.attempt_id IS NULL)").bind(scope.organization_id).bind(scope.project_id).bind(currency).bind(from).bind(to).fetch_one(&mut *tx).await?;
        if unresolved {
            return Err(StoreError::Unresolved);
        }
        let (amount,total):(String,i64)=sqlx::query_as("SELECT COALESCE(SUM(c.amount_nanos),0)::text,COUNT(*) FROM customer_charges c JOIN attempts a ON a.id=c.attempt_id WHERE c.organization_id=$1 AND c.project_id=$2 AND c.currency=$3 AND a.dispatched_at>=to_timestamp($4::double precision/1000) AND a.dispatched_at<to_timestamp($5::double precision/1000)").bind(scope.organization_id).bind(scope.project_id).bind(currency).bind(from).bind(to).fetch_one(&mut *tx).await?;
        if total == 0 {
            return Err(StoreError::Conflict);
        }
        let amount = amount
            .parse::<i64>()
            .map_err(|_| StoreError::AggregateOverflow)?;
        let id = Uuid::new_v4();
        sqlx::query("INSERT INTO customer_invoices(id,organization_id,project_id,from_ms,to_ms,currency,amount_nanos,idempotency_key) VALUES($1,$2,$3,$4,$5,$6,$7,$8)").bind(id).bind(scope.organization_id).bind(scope.project_id).bind(from).bind(to).bind(currency).bind(amount).bind(key).execute(&mut *tx).await?;
        sqlx::query("INSERT INTO customer_invoice_entries(invoice_id,organization_id,project_id,attempt_id) SELECT $1,c.organization_id,c.project_id,c.attempt_id FROM customer_charges c JOIN attempts a ON a.id=c.attempt_id WHERE c.organization_id=$2 AND c.project_id=$3 AND c.currency=$4 AND a.dispatched_at>=to_timestamp($5::double precision/1000) AND a.dispatched_at<to_timestamp($6::double precision/1000)").bind(id).bind(scope.organization_id).bind(scope.project_id).bind(currency).bind(from).bind(to).execute(&mut *tx).await?;
        sqlx::query("INSERT INTO customer_billing_audit(organization_id,project_id,action,resource_id) VALUES($1,$2,'invoice_issued',$3)").bind(scope.organization_id).bind(scope.project_id).bind(id).execute(&mut *tx).await?;
        tx.commit().await?;
        Ok(id)
    }
    pub async fn record_customer_payment(
        &self,
        scope: TenantScope,
        invoice: Uuid,
        reference: &str,
    ) -> Result<(), StoreError> {
        let reference = reference.trim();
        if reference.trim().is_empty()
            || reference.len() > 200
            || reference.chars().any(char::is_control)
        {
            return Err(StoreError::InvalidPrice);
        }
        let mut tx = self.pool.begin().await?;
        sqlx::query("SELECT id FROM customer_invoices WHERE id=$1 AND organization_id=$2 AND project_id=$3 FOR UPDATE").bind(invoice).bind(scope.organization_id).bind(scope.project_id).fetch_optional(&mut *tx).await?.ok_or(StoreError::Conflict)?;
        if let Some(prior) = sqlx::query_scalar::<_, String>(
            "SELECT payment_reference FROM customer_invoice_payments WHERE invoice_id=$1",
        )
        .bind(invoice)
        .fetch_optional(&mut *tx)
        .await?
        {
            return if prior == reference {
                Ok(())
            } else {
                Err(StoreError::Conflict)
            };
        }
        let duplicate: bool = sqlx::query_scalar(
            "SELECT EXISTS(SELECT 1 FROM customer_invoice_payments WHERE payment_reference=$1)",
        )
        .bind(reference)
        .fetch_one(&mut *tx)
        .await?;
        if duplicate {
            return Err(StoreError::Conflict);
        }
        let inserted = sqlx::query(
            "INSERT INTO customer_invoice_payments(invoice_id,payment_reference) VALUES($1,$2) ON CONFLICT DO NOTHING",
        )
        .bind(invoice)
        .bind(reference)
        .execute(&mut *tx)
        .await?;
        if inserted.rows_affected() != 1 {
            return Err(StoreError::Conflict);
        }
        sqlx::query("INSERT INTO customer_billing_audit(organization_id,project_id,action,resource_id) VALUES($1,$2,'external_payment_recorded',$3)").bind(scope.organization_id).bind(scope.project_id).bind(invoice).execute(&mut *tx).await?;
        tx.commit().await?;
        Ok(())
    }
    pub async fn customer_billing(&self, scope: TenantScope) -> Result<Value, StoreError> {
        let mut tx = self.pool.begin().await?;
        sqlx::query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY")
            .execute(&mut *tx)
            .await?;
        let balances:Vec<Value>=sqlx::query_scalar("SELECT jsonb_build_object('currency',c.currency,'charged_nanos',SUM(c.amount_nanos)::text,'unbilled_nanos',SUM(CASE WHEN e.invoice_id IS NULL THEN c.amount_nanos ELSE 0 END)::text,'due_nanos',SUM(CASE WHEN e.invoice_id IS NOT NULL AND p.invoice_id IS NULL THEN c.amount_nanos ELSE 0 END)::text,'paid_nanos',SUM(CASE WHEN p.invoice_id IS NOT NULL THEN c.amount_nanos ELSE 0 END)::text) FROM customer_charges c LEFT JOIN customer_invoice_entries e ON e.attempt_id=c.attempt_id LEFT JOIN customer_invoice_payments p ON p.invoice_id=e.invoice_id WHERE c.organization_id=$1 AND c.project_id=$2 GROUP BY c.currency ORDER BY c.currency").bind(scope.organization_id).bind(scope.project_id).fetch_all(&mut *tx).await?;
        let unresolved:String=sqlx::query_scalar("SELECT COUNT(*)::text FROM attempts a JOIN customer_attempt_tariffs b ON b.attempt_id=a.id LEFT JOIN customer_charges c ON c.attempt_id=a.id WHERE a.organization_id=$1 AND a.project_id=$2 AND a.dispatched_at IS NOT NULL AND c.attempt_id IS NULL").bind(scope.organization_id).bind(scope.project_id).fetch_one(&mut *tx).await?;
        let unpriced:String=sqlx::query_scalar("SELECT COUNT(*)::text FROM attempts a LEFT JOIN customer_attempt_tariffs b ON b.attempt_id=a.id WHERE a.organization_id=$1 AND a.project_id=$2 AND a.dispatched_at IS NOT NULL AND b.attempt_id IS NULL").bind(scope.organization_id).bind(scope.project_id).fetch_one(&mut *tx).await?;
        let tariffs:Vec<Value>=sqlx::query_scalar("SELECT jsonb_build_object('model_alias',t.model_alias,'revision',r.id,'currency',r.currency,'prompt_rate',r.prompt_rate::text,'completion_rate',r.completion_rate::text) FROM customer_tariffs t JOIN customer_tariff_revisions r ON r.id=t.current_revision WHERE t.organization_id=$1 AND t.project_id=$2 ORDER BY t.model_alias LIMIT 1000").bind(scope.organization_id).bind(scope.project_id).fetch_all(&mut *tx).await?;
        let invoices:Vec<Value>=sqlx::query_scalar("SELECT jsonb_build_object('id',i.id,'from_ms',i.from_ms,'to_ms',i.to_ms,'currency',i.currency,'amount_nanos',i.amount_nanos::text,'created_at',i.created_at,'status',CASE WHEN p.invoice_id IS NULL THEN 'issued' ELSE 'paid' END,'payment_reference',p.payment_reference) FROM customer_invoices i LEFT JOIN customer_invoice_payments p ON p.invoice_id=i.id WHERE i.organization_id=$1 AND i.project_id=$2 ORDER BY i.created_at DESC,i.id LIMIT 100").bind(scope.organization_id).bind(scope.project_id).fetch_all(&mut *tx).await?;
        tx.commit().await?;
        Ok(
            json!({"balances":balances,"unresolved":unresolved,"unpriced":unpriced,"tariffs":tariffs,"invoices":invoices}),
        )
    }
    pub async fn customer_invoice_lines(
        &self,
        scope: TenantScope,
        invoice: Uuid,
    ) -> Result<Vec<Value>, StoreError> {
        Ok(sqlx::query_scalar("SELECT jsonb_build_object('model_alias',t.model_alias,'revision',r.id,'prompt_rate',r.prompt_rate::text,'completion_rate',r.completion_rate::text,'currency',c.currency,'requests',COUNT(*)::text,'prompt_tokens',SUM(c.prompt_tokens)::text,'completion_tokens',SUM(c.completion_tokens)::text,'amount_nanos',SUM(c.amount_nanos)::text) FROM customer_invoice_entries e JOIN customer_charges c ON c.attempt_id=e.attempt_id JOIN customer_tariff_revisions r ON r.id=c.revision_id JOIN customer_tariffs t ON t.id=r.tariff_id WHERE e.organization_id=$1 AND e.project_id=$2 AND e.invoice_id=$3 GROUP BY t.model_alias,r.id,r.prompt_rate,r.completion_rate,c.currency ORDER BY t.model_alias,r.id").bind(scope.organization_id).bind(scope.project_id).bind(invoice).fetch_all(&self.pool).await?)
    }
}
