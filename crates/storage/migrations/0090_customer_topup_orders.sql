-- Immutable order intent, provider identity and successful settlement are separate.
-- Pending orders never grant spending capacity. No merchant secrets are stored here.
CREATE TABLE customer_topup_orders (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL,
    account_id UUID NOT NULL,
    currency TEXT NOT NULL,
    amount_nanos BIGINT NOT NULL CHECK (amount_nanos > 0),
    aggregator TEXT NOT NULL CHECK (aggregator ~ '^[a-z0-9]{1,32}$'),
    merchant TEXT NOT NULL CHECK (merchant ~ '^[A-Za-z0-9]{1,64}$'),
    payment_method TEXT NOT NULL CHECK (payment_method ~ '^[A-Za-z0-9.-]{1,64}$'),
    idempotency_key UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY (organization_id, account_id, currency)
        REFERENCES customer_balance_accounts(organization_id, id, currency),
    UNIQUE (organization_id, idempotency_key),
    UNIQUE (id, aggregator, merchant),
    UNIQUE (id, organization_id, account_id, currency)
);
CREATE INDEX customer_topup_orders_company_history ON customer_topup_orders(organization_id, created_at DESC, id DESC);
CREATE TRIGGER immutable_customer_topup_order BEFORE UPDATE OR DELETE ON customer_topup_orders
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

CREATE TABLE customer_topup_provider_orders (
    order_id UUID PRIMARY KEY,
    aggregator TEXT NOT NULL,
    merchant TEXT NOT NULL,
    platform_reference TEXT NOT NULL CHECK (platform_reference ~ '^[A-Za-z0-9]{1,128}$'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (aggregator, merchant, platform_reference),
    FOREIGN KEY (order_id, aggregator, merchant)
        REFERENCES customer_topup_orders(id, aggregator, merchant)
);
CREATE TRIGGER immutable_customer_topup_provider_order BEFORE UPDATE OR DELETE ON customer_topup_provider_orders
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

CREATE TABLE customer_topup_settlements (
    order_id UUID PRIMARY KEY REFERENCES customer_topup_orders(id),
    organization_id UUID NOT NULL,
    account_id UUID NOT NULL,
    currency TEXT NOT NULL,
    entry_id UUID NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY (organization_id, account_id, currency, entry_id)
        REFERENCES customer_balance_entries(organization_id, account_id, currency, id),
    FOREIGN KEY (order_id, organization_id, account_id, currency)
        REFERENCES customer_topup_orders(id, organization_id, account_id, currency)
);
CREATE TRIGGER immutable_customer_topup_settlement BEFORE UPDATE OR DELETE ON customer_topup_settlements
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
