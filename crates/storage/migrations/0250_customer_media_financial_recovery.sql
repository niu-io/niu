-- Media settlement uses the existing bounded financial worker, independently
-- of optional upstream video polling. No ledger or reservation is rewritten.
ALTER TABLE financial_recovery_progress
    DROP CONSTRAINT financial_recovery_progress_stage_check;
ALTER TABLE financial_recovery_progress
    ADD CONSTRAINT financial_recovery_progress_stage_check CHECK (stage IN (
        'balance_release', 'customer_charge', 'customer_media_charge',
        'supplier_earning', 'upstream_cost'
    ));
INSERT INTO financial_recovery_progress(stage) VALUES ('customer_media_charge');
