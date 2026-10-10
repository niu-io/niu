-- Recover the gap between durable success observation and completion marking.
-- This stage performs no egress and does not establish billable usage.
ALTER TABLE financial_recovery_progress
    DROP CONSTRAINT financial_recovery_progress_stage_check;
ALTER TABLE financial_recovery_progress
    ADD CONSTRAINT financial_recovery_progress_stage_check CHECK (stage IN (
        'media_completion', 'balance_release', 'customer_charge',
        'customer_media_charge', 'supplier_earning', 'upstream_cost'
    ));
INSERT INTO financial_recovery_progress(stage) VALUES ('media_completion');
