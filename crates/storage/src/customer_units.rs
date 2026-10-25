//! Immutable unit definitions and purchase rules. Publication alone does not
//! activate Credits billing or mutate existing balances and customer tariffs.
//! Callers must enforce installation-level financial configuration authority.
use crate::{OperatorAuditActor, Store, StoreError};
use niu_metered_cost::CreditConversion;
use serde_json::{Value, json};
use uuid::Uuid;

pub struct CustomerUnitDefinitionInput<'a> {
    pub name: &'a str,
    pub display_precision: i16,
    pub expected_revision: i64,
    pub idempotency_key: Uuid,
}

pub struct CustomerUnitPurchaseRuleInput<'a> {
    pub definition_revision: i64,
    pub payment_currency: &'a str,
    pub conversion: CreditConversion,
    pub expected_revision: i64,
    pub idempotency_key: Uuid,
}

pub struct CustomerUnitQuoteInput {
    pub rule_revision: i64,
    pub payment_nanos: i64,
    pub idempotency_key: Uuid,
}

impl Store {
    /// Save an exact purchase preview. It neither binds a payment order nor
    /// issues capacity. Replays retain their original expiry and rule even if
    /// that rule is no longer current; a new intent requires a current rule.
    pub async fn prepare_customer_unit_quote(
        &self,
        organization: Uuid,
        input: CustomerUnitQuoteInput,
        actor: OperatorAuditActor,
    ) -> Result<Value, StoreError> {
        if input.rule_revision <= 0 || input.payment_nanos <= 0 {
            return Err(StoreError::InvalidPrice);
        }
        let mut tx = self.begin_bounded_recording().await?;
        // Configuration, then company: the eventual mode switch and checkout
        // binder use the same lock order. No payment-network call holds a lock.
        sqlx::query("SELECT revision FROM customer_unit_configuration WHERE singleton FOR SHARE")
            .fetch_one(&mut *tx)
            .await?;
        sqlx::query("SELECT id FROM organizations WHERE id=$1 FOR NO KEY UPDATE")
            .bind(organization)
            .fetch_optional(&mut *tx)
            .await?
            .ok_or(StoreError::Conflict)?;
        let prior: Option<(Uuid, i64, i64)> = sqlx::query_as(
            "SELECT id, rule_revision, payment_nanos FROM customer_unit_purchase_quotes
             WHERE organization_id=$1 AND idempotency_key=$2",
        )
        .bind(organization)
        .bind(input.idempotency_key)
        .fetch_optional(&mut *tx)
        .await?;
        if let Some((id, revision, amount)) = prior {
            if revision != input.rule_revision || amount != input.payment_nanos {
                return Err(StoreError::Conflict);
            }
            return Ok(sqlx::query_scalar(include_str!("customer_unit_quote.sql"))
                .bind(organization)
                .bind(id)
                .fetch_one(&mut *tx)
                .await?);
        }
        let (currency, numerator, denominator): (String, i64, i64) = sqlx::query_as(
            "SELECT r.payment_currency,r.numerator,r.denominator FROM customer_unit_purchase_rules r
             WHERE r.revision=$1
               AND r.definition_revision=(SELECT max(revision) FROM customer_unit_definitions)
               AND r.revision=(SELECT max(other.revision) FROM customer_unit_purchase_rules other
                   WHERE other.definition_revision=r.definition_revision
                     AND other.payment_currency=r.payment_currency)",
        ).bind(input.rule_revision).fetch_optional(&mut *tx).await?.ok_or(StoreError::Conflict)?;
        let atoms = CreditConversion::new(numerator, denominator)
            .and_then(|conversion| conversion.purchase_atoms(input.payment_nanos))
            .map_err(|_| StoreError::InvalidPrice)?;
        let id = Uuid::new_v4();
        let (actor_kind, actor_id) = actor.kind_and_id();
        sqlx::query("INSERT INTO customer_unit_purchase_quotes
            (id,organization_id,idempotency_key,rule_revision,payment_currency,payment_nanos,credit_atoms,
             actor_kind,actor_operator_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)")
            .bind(id).bind(organization).bind(input.idempotency_key).bind(input.rule_revision)
            .bind(currency).bind(input.payment_nanos).bind(atoms).bind(actor_kind).bind(actor_id)
            .execute(&mut *tx).await?;
        let result = sqlx::query_scalar(include_str!("customer_unit_quote.sql"))
            .bind(organization)
            .bind(id)
            .fetch_one(&mut *tx)
            .await?;
        tx.commit().await?;
        Ok(result)
    }

    pub async fn customer_unit_quote(
        &self,
        organization: Uuid,
        id: Uuid,
    ) -> Result<Option<Value>, StoreError> {
        Ok(sqlx::query_scalar(include_str!("customer_unit_quote.sql"))
            .bind(organization)
            .bind(id)
            .fetch_optional(&self.pool)
            .await?)
    }

    /// A single statement snapshot. Quantities and revisions are strings so
    /// clients cannot lose precision while preparing a revision-checked write.
    pub async fn customer_unit_configuration(&self) -> Result<Value, StoreError> {
        Ok(sqlx::query_scalar(
            "SELECT jsonb_build_object('revision', c.revision::text,
                'definition', (SELECT jsonb_build_object('revision', d.revision::text,
                    'name', d.name, 'display_precision', d.display_precision,
                    'atoms_per_unit', '1000000000')
                    FROM customer_unit_definitions d ORDER BY revision DESC LIMIT 1),
                'purchase_rules', COALESCE((SELECT jsonb_agg(r.data ORDER BY r.payment_currency)
                    FROM (SELECT DISTINCT ON (payment_currency) payment_currency,
                        jsonb_build_object('revision', revision::text,
                            'definition_revision', definition_revision::text,
                            'payment_currency', payment_currency,
                            'numerator', numerator::text, 'denominator', denominator::text) AS data
                        FROM customer_unit_purchase_rules
                        WHERE definition_revision = (SELECT max(revision) FROM customer_unit_definitions)
                        ORDER BY payment_currency, revision DESC) r), '[]'::jsonb))
             FROM customer_unit_configuration c WHERE singleton",
        ).fetch_one(&self.pool).await?)
    }

    pub async fn publish_customer_unit_definition(
        &self,
        input: CustomerUnitDefinitionInput<'_>,
        actor: OperatorAuditActor,
    ) -> Result<Value, StoreError> {
        if input.name.is_empty()
            || input.name.chars().count() > 80
            || input.name.trim() != input.name
            || input.name.chars().any(char::is_control)
            || !(0..=9).contains(&input.display_precision)
            || input.expected_revision < 0
        {
            return Err(StoreError::InvalidPrice);
        }
        let mut tx = self.begin_bounded_recording().await?;
        let current: i64 = sqlx::query_scalar(
            "SELECT revision FROM customer_unit_configuration WHERE singleton FOR UPDATE",
        )
        .fetch_one(&mut *tx)
        .await?;
        let previous: Option<(i64, i64, String, i16)> = sqlx::query_as(
            "SELECT revision, expected_revision, name, display_precision
             FROM customer_unit_definitions WHERE idempotency_key=$1",
        )
        .bind(input.idempotency_key)
        .fetch_optional(&mut *tx)
        .await?;
        if let Some((revision, expected, name, precision)) = previous {
            if expected != input.expected_revision
                || name != input.name
                || precision != input.display_precision
            {
                return Err(StoreError::Conflict);
            }
            return Ok(definition_result(revision, &name, precision));
        }
        if current != input.expected_revision {
            return Err(StoreError::Conflict);
        }
        let next = current.checked_add(1).ok_or(StoreError::Conflict)?;
        let (actor_kind, actor_id) = actor.kind_and_id();
        sqlx::query(
            "INSERT INTO customer_unit_definitions
                (revision,expected_revision,idempotency_key,name,display_precision,actor_kind,actor_operator_id)
             VALUES($1,$2,$3,$4,$5,$6,$7)",
        )
        .bind(next)
        .bind(current)
        .bind(input.idempotency_key)
        .bind(input.name)
        .bind(input.display_precision)
        .bind(actor_kind)
        .bind(actor_id)
        .execute(&mut *tx)
        .await?;
        sqlx::query("UPDATE customer_unit_configuration SET revision=$1 WHERE singleton")
            .bind(next)
            .execute(&mut *tx)
            .await?;
        tx.commit().await?;
        Ok(definition_result(next, input.name, input.display_precision))
    }

    pub async fn publish_customer_unit_purchase_rule(
        &self,
        input: CustomerUnitPurchaseRuleInput<'_>,
        actor: OperatorAuditActor,
    ) -> Result<Value, StoreError> {
        if input.definition_revision <= 0
            || input.expected_revision < 0
            || input.payment_currency.len() != 3
            || !input
                .payment_currency
                .bytes()
                .all(|b| b.is_ascii_uppercase())
        {
            return Err(StoreError::InvalidPrice);
        }
        let mut tx = self.begin_bounded_recording().await?;
        let current: i64 = sqlx::query_scalar(
            "SELECT revision FROM customer_unit_configuration WHERE singleton FOR UPDATE",
        )
        .fetch_one(&mut *tx)
        .await?;
        let previous: Option<(i64, i64, i64, String, i64, i64)> = sqlx::query_as(
            "SELECT revision,expected_revision,definition_revision,payment_currency,numerator,denominator
             FROM customer_unit_purchase_rules WHERE idempotency_key=$1",
        )
        .bind(input.idempotency_key)
        .fetch_optional(&mut *tx)
        .await?;
        if let Some((revision, expected, definition, currency, numerator, denominator)) = previous {
            if expected != input.expected_revision
                || definition != input.definition_revision
                || currency != input.payment_currency
                || numerator != input.conversion.numerator()
                || denominator != input.conversion.denominator()
            {
                return Err(StoreError::Conflict);
            }
            return Ok(rule_result(revision, &input));
        }
        let latest_definition: Option<i64> =
            sqlx::query_scalar("SELECT max(revision) FROM customer_unit_definitions")
                .fetch_one(&mut *tx)
                .await?;
        if current != input.expected_revision
            || latest_definition != Some(input.definition_revision)
        {
            return Err(StoreError::Conflict);
        }
        let next = current.checked_add(1).ok_or(StoreError::Conflict)?;
        let (actor_kind, actor_id) = actor.kind_and_id();
        sqlx::query(
            "INSERT INTO customer_unit_purchase_rules
                (revision,expected_revision,idempotency_key,definition_revision,payment_currency,
                    numerator,denominator,actor_kind,actor_operator_id)
             VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
        )
        .bind(next)
        .bind(current)
        .bind(input.idempotency_key)
        .bind(input.definition_revision)
        .bind(input.payment_currency)
        .bind(input.conversion.numerator())
        .bind(input.conversion.denominator())
        .bind(actor_kind)
        .bind(actor_id)
        .execute(&mut *tx)
        .await?;
        sqlx::query("UPDATE customer_unit_configuration SET revision=$1 WHERE singleton")
            .bind(next)
            .execute(&mut *tx)
            .await?;
        tx.commit().await?;
        Ok(rule_result(next, &input))
    }
}

fn definition_result(revision: i64, name: &str, display_precision: i16) -> Value {
    json!({"revision": revision.to_string(), "name": name,
        "display_precision": display_precision, "atoms_per_unit": "1000000000"})
}

fn rule_result(revision: i64, input: &CustomerUnitPurchaseRuleInput<'_>) -> Value {
    json!({"revision": revision.to_string(),
        "definition_revision": input.definition_revision.to_string(),
        "payment_currency": input.payment_currency,
        "numerator": input.conversion.numerator().to_string(),
        "denominator": input.conversion.denominator().to_string()})
}
