-- Match the bounded identifier accepted by the classic EPay verifier.
-- Preserve Stripe and all other adapters' existing limits.
ALTER TABLE customer_topup_provider_orders
    DROP CONSTRAINT customer_topup_provider_orders_platform_reference_check;
ALTER TABLE customer_topup_provider_orders
    ADD CONSTRAINT customer_topup_provider_orders_platform_reference_check CHECK (
        (aggregator = 'stripe' AND platform_reference ~ '^cs_[A-Za-z0-9_]{1,252}$')
        OR (aggregator = 'epay' AND platform_reference ~ '^[A-Za-z0-9_-]{1,128}$')
        OR (aggregator NOT IN ('stripe', 'epay') AND platform_reference ~ '^[A-Za-z0-9]{1,128}$')
    );
