-- Durable keyset traversal; no financial evidence or ledger rows are changed.
CREATE TABLE financial_recovery_progress (
    stage TEXT PRIMARY KEY CHECK (stage IN (
        'balance_release', 'customer_charge', 'supplier_earning', 'upstream_cost'
    )),
    after_attempt UUID,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO financial_recovery_progress(stage) VALUES
    ('balance_release'), ('customer_charge'), ('supplier_earning'), ('upstream_cost');
