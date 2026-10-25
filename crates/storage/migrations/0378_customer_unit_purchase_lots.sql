-- Mode activation is a separate guarded operation; migration retains currency mode.
ALTER TABLE customer_unit_configuration ADD COLUMN billing_mode TEXT NOT NULL DEFAULT 'currency'
    CHECK (billing_mode IN ('currency', 'credits'));

-- Separate consumption-unit issuance from monetary wallet funding. Existing
-- payment references remain globally unique across both settlement kinds.
CREATE TABLE customer_unit_accounts (
    organization_id UUID PRIMARY KEY REFERENCES organizations(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE customer_unit_topups (
    order_id UUID PRIMARY KEY REFERENCES customer_topup_orders(id),
    organization_id UUID NOT NULL,
    quote_id UUID NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY (organization_id, quote_id)
        REFERENCES customer_unit_purchase_quotes(organization_id, id)
);
CREATE TRIGGER immutable_customer_unit_topup BEFORE UPDATE OR DELETE ON customer_unit_topups
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

CREATE FUNCTION validate_customer_unit_topup() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    PERFORM id FROM customer_topup_orders WHERE id=NEW.order_id FOR UPDATE;
    IF NOT EXISTS (
        SELECT 1 FROM customer_topup_orders o JOIN customer_unit_purchase_quotes q
            ON q.organization_id=o.organization_id AND q.payment_currency=o.currency
                AND q.payment_nanos=o.amount_nanos
        WHERE o.id=NEW.order_id AND o.organization_id=NEW.organization_id
            AND q.id=NEW.quote_id AND q.expires_at>clock_timestamp()
    ) OR EXISTS (SELECT 1 FROM customer_topup_provider_orders WHERE order_id=NEW.order_id)
      OR EXISTS (SELECT 1 FROM customer_topup_checkout WHERE order_id=NEW.order_id)
      OR EXISTS (SELECT 1 FROM customer_topup_creation_claims WHERE order_id=NEW.order_id)
      OR EXISTS (SELECT 1 FROM customer_topup_settlements WHERE order_id=NEW.order_id)
      OR EXISTS (SELECT 1 FROM customer_topup_closures WHERE order_id=NEW.order_id) THEN
        RAISE EXCEPTION 'Credits binding requires an unexpired matching quote and an unsubmitted order'
            USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER validate_customer_unit_topup BEFORE INSERT ON customer_unit_topups
    FOR EACH ROW EXECUTE FUNCTION validate_customer_unit_topup();

CREATE TABLE customer_unit_purchase_lots (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES customer_unit_accounts(organization_id),
    order_id UUID NOT NULL UNIQUE REFERENCES customer_unit_topups(order_id),
    definition_revision BIGINT NOT NULL REFERENCES customer_unit_definitions(revision),
    credit_atoms BIGINT NOT NULL CHECK (credit_atoms > 0),
    provenance TEXT NOT NULL CHECK (provenance IN ('purchased', 'simulated')),
    payment_currency TEXT NOT NULL CHECK (payment_currency ~ '^[A-Z]{3}$'),
    payment_nanos BIGINT NOT NULL CHECK (payment_nanos > 0),
    backing_nanos BIGINT NOT NULL CHECK (backing_nanos >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (organization_id, id),
    CHECK ((provenance='purchased' AND backing_nanos=payment_nanos)
        OR (provenance='simulated' AND backing_nanos=0))
);
CREATE INDEX customer_unit_lots_consumption ON customer_unit_purchase_lots(organization_id, created_at, id);
CREATE TRIGGER immutable_customer_unit_purchase_lot BEFORE UPDATE OR DELETE ON customer_unit_purchase_lots
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

CREATE FUNCTION validate_customer_unit_purchase_lot() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
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
CREATE TRIGGER validate_customer_unit_purchase_lot BEFORE INSERT ON customer_unit_purchase_lots
    FOR EACH ROW EXECUTE FUNCTION validate_customer_unit_purchase_lot();

CREATE TABLE customer_unit_funding_receipts (
    unit_lot_id UUID PRIMARY KEY,
    channel TEXT NOT NULL CHECK (length(trim(channel)) BETWEEN 1 AND 100),
    payment_reference TEXT NOT NULL CHECK (length(trim(payment_reference)) BETWEEN 1 AND 200),
    organization_id UUID NOT NULL,
    account_id UUID NOT NULL,
    currency TEXT NOT NULL,
    amount_nanos BIGINT NOT NULL CHECK (amount_nanos > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (channel, payment_reference),
    FOREIGN KEY (organization_id, unit_lot_id)
        REFERENCES customer_unit_purchase_lots(organization_id, id),
    FOREIGN KEY (organization_id, account_id, currency)
        REFERENCES customer_balance_accounts(organization_id, id, currency)
);
CREATE TRIGGER immutable_customer_unit_receipt BEFORE UPDATE OR DELETE ON customer_unit_funding_receipts
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

-- This registry shares payment identity without feeding Credits purchases into
-- monetary wallet allocation or credit-repayment triggers.
CREATE TABLE customer_payment_references (
    channel TEXT NOT NULL,
    payment_reference TEXT NOT NULL,
    entry_id UUID UNIQUE REFERENCES customer_balance_entries(id),
    unit_lot_id UUID UNIQUE REFERENCES customer_unit_purchase_lots(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (channel, payment_reference),
    CHECK ((entry_id IS NOT NULL) <> (unit_lot_id IS NOT NULL))
);
INSERT INTO customer_payment_references(channel,payment_reference,entry_id,created_at)
    SELECT channel,payment_reference,entry_id,created_at FROM customer_funding_receipts;
CREATE TRIGGER immutable_customer_payment_reference BEFORE UPDATE OR DELETE ON customer_payment_references
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
CREATE FUNCTION register_customer_payment_reference() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE money_entry UUID; unit_lot UUID;
BEGIN
    IF TG_TABLE_NAME='customer_funding_receipts' THEN money_entry:=NEW.entry_id;
    ELSE unit_lot:=NEW.unit_lot_id; END IF;
    INSERT INTO customer_payment_references(channel,payment_reference,entry_id,unit_lot_id,created_at)
        VALUES(NEW.channel,NEW.payment_reference,money_entry,unit_lot,NEW.created_at)
        ON CONFLICT(channel,payment_reference) DO NOTHING;
    IF NOT EXISTS (SELECT 1 FROM customer_payment_references r
        WHERE r.channel=NEW.channel AND r.payment_reference=NEW.payment_reference
            AND r.entry_id IS NOT DISTINCT FROM money_entry AND r.unit_lot_id IS NOT DISTINCT FROM unit_lot) THEN
        RAISE EXCEPTION 'Payment reference already belongs to a different funding target'
            USING ERRCODE='23514', CONSTRAINT='customer_payment_reference_target';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER register_customer_payment_reference BEFORE INSERT ON customer_funding_receipts
    FOR EACH ROW EXECUTE FUNCTION register_customer_payment_reference();
CREATE TRIGGER register_customer_unit_payment_reference BEFORE INSERT ON customer_unit_funding_receipts
    FOR EACH ROW EXECUTE FUNCTION register_customer_payment_reference();

ALTER TABLE customer_topup_settlements ALTER COLUMN entry_id DROP NOT NULL;
ALTER TABLE customer_topup_settlements ADD COLUMN unit_lot_id UUID UNIQUE;
ALTER TABLE customer_topup_settlements ADD CONSTRAINT topup_settlement_target
    CHECK ((entry_id IS NOT NULL) <> (unit_lot_id IS NOT NULL));
ALTER TABLE customer_topup_settlements ADD FOREIGN KEY (organization_id, unit_lot_id)
    REFERENCES customer_unit_purchase_lots(organization_id, id);

CREATE FUNCTION validate_customer_unit_settlement() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF TG_TABLE_NAME='customer_unit_funding_receipts' THEN
        IF NEW.unit_lot_id IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM customer_unit_purchase_lots l
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
            SELECT 1 FROM customer_unit_purchase_lots l
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
CREATE TRIGGER validate_customer_unit_receipt BEFORE INSERT ON customer_unit_funding_receipts
    FOR EACH ROW EXECUTE FUNCTION validate_customer_unit_settlement();
CREATE TRIGGER validate_customer_unit_settlement BEFORE INSERT ON customer_topup_settlements
    FOR EACH ROW EXECUTE FUNCTION validate_customer_unit_settlement();
