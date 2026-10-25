-- Preserve purchased lots and references while adding noncash grant origins.
ALTER TABLE customer_unit_purchase_lots RENAME TO customer_unit_lots;
ALTER TABLE customer_unit_lots ALTER COLUMN order_id DROP NOT NULL;
ALTER TABLE customer_unit_lots ALTER COLUMN payment_currency DROP NOT NULL;
ALTER TABLE customer_unit_lots ALTER COLUMN payment_nanos DROP NOT NULL;
ALTER TABLE customer_unit_lots DROP CONSTRAINT customer_unit_purchase_lots_provenance_check;
ALTER TABLE customer_unit_lots DROP CONSTRAINT customer_unit_purchase_lots_check;
ALTER TABLE customer_unit_lots ADD COLUMN grant_idempotency_key UUID;
ALTER TABLE customer_unit_lots ADD COLUMN grant_reason TEXT;
ALTER TABLE customer_unit_lots ADD COLUMN grant_actor_kind TEXT;
ALTER TABLE customer_unit_lots ADD COLUMN grant_actor_operator_id UUID REFERENCES admin_operators(id);
ALTER TABLE customer_unit_lots ADD COLUMN expires_at TIMESTAMPTZ;
ALTER TABLE customer_unit_lots ADD CONSTRAINT customer_unit_provenance
    CHECK (provenance IN ('purchased','promotional','simulated'));
ALTER TABLE customer_unit_lots ADD CONSTRAINT customer_unit_backing
    CHECK ((provenance='purchased' AND backing_nanos=payment_nanos AND payment_nanos IS NOT NULL)
        OR (provenance IN ('promotional','simulated') AND backing_nanos=0));
ALTER TABLE customer_unit_lots ADD CONSTRAINT customer_unit_origin CHECK (
    (order_id IS NOT NULL AND grant_idempotency_key IS NULL AND grant_reason IS NULL
        AND grant_actor_kind IS NULL AND grant_actor_operator_id IS NULL
        AND expires_at IS NULL AND payment_currency IS NOT NULL AND payment_nanos IS NOT NULL
        AND provenance IN ('purchased','simulated'))
    OR (order_id IS NULL AND grant_idempotency_key IS NOT NULL AND grant_reason IS NOT NULL
        AND char_length(grant_reason) BETWEEN 1 AND 500 AND grant_reason=btrim(grant_reason)
        AND grant_reason !~ '[[:cntrl:]]' AND grant_actor_kind IS NOT NULL
        AND grant_actor_kind IN ('installation','operator')
        AND ((grant_actor_kind='operator')=(grant_actor_operator_id IS NOT NULL))
        AND payment_currency IS NULL AND payment_nanos IS NULL
        AND provenance IN ('promotional','simulated') AND backing_nanos=0)
);
ALTER TABLE customer_unit_lots ADD CONSTRAINT customer_unit_grant_expiry
    CHECK (expires_at IS NULL OR expires_at>created_at);
CREATE UNIQUE INDEX customer_unit_grant_identity
    ON customer_unit_lots(organization_id,grant_idempotency_key) WHERE grant_idempotency_key IS NOT NULL;
CREATE INDEX customer_unit_expiring_lots ON customer_unit_lots(organization_id,expires_at,created_at,id);

CREATE OR REPLACE FUNCTION validate_customer_unit_purchase_lot() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.order_id IS NULL THEN RETURN NEW; END IF;
    IF NOT EXISTS (
        SELECT 1 FROM customer_unit_topups t
        JOIN customer_topup_orders o ON o.id=t.order_id
        JOIN customer_unit_purchase_quotes q ON q.id=t.quote_id
        JOIN customer_unit_purchase_rules r ON r.revision=q.rule_revision
        WHERE t.order_id=NEW.order_id AND t.organization_id=NEW.organization_id
            AND q.credit_atoms=NEW.credit_atoms AND r.definition_revision=NEW.definition_revision
            AND q.payment_currency=NEW.payment_currency AND q.payment_nanos=NEW.payment_nanos
            AND NEW.provenance=CASE WHEN o.aggregator='stripe' AND o.merchant='NiuMockPayments'
                THEN 'simulated' ELSE 'purchased' END
    ) THEN
        RAISE EXCEPTION 'Credits lot must match its original quote and immutable payment provenance'
            USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION validate_customer_unit_settlement() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF TG_TABLE_NAME='customer_unit_funding_receipts' THEN
        IF NEW.unit_lot_id IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM customer_unit_lots l
            JOIN customer_topup_orders o ON o.id=l.order_id
            JOIN customer_topup_provider_orders p ON p.order_id=o.id
            WHERE l.id=NEW.unit_lot_id AND l.organization_id=NEW.organization_id
                AND l.payment_currency=NEW.currency AND l.payment_nanos=NEW.amount_nanos
                AND o.account_id=NEW.account_id AND NEW.channel=o.aggregator || ':' || o.merchant
                AND NEW.payment_reference=p.platform_reference
        ) THEN
            RAISE EXCEPTION 'Credits receipt must match its bound payment' USING ERRCODE='23514';
        END IF;
    ELSE
        IF (NEW.unit_lot_id IS NOT NULL) <> EXISTS (
            SELECT 1 FROM customer_unit_topups WHERE order_id=NEW.order_id
        ) OR (NEW.unit_lot_id IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM customer_unit_lots l
            JOIN customer_unit_funding_receipts f ON f.unit_lot_id=l.id
            WHERE l.id=NEW.unit_lot_id AND l.order_id=NEW.order_id
                AND l.organization_id=NEW.organization_id AND f.account_id=NEW.account_id
                AND f.currency=NEW.currency
        )) THEN
            RAISE EXCEPTION 'Credits settlement must match its issued lot and receipt'
                USING ERRCODE='23514';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
