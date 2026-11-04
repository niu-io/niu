-- Standard price publication does not require a human-supplied explanation.
-- Promotions retain their existing reason requirement and all audit events remain immutable.
ALTER TABLE platform_retail_price_changes
    DROP CONSTRAINT platform_retail_price_changes_reason_check;
ALTER TABLE platform_retail_price_changes
    ADD CONSTRAINT platform_retail_price_changes_reason_check
    CHECK (length(reason) <= 500 AND reason = trim(reason) AND reason !~ '[[:cntrl:]]'
        AND (action = 'standard_published' OR length(reason) >= 1));
