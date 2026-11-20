-- Configuration-bound callback evidence is immutable once recorded. Keeping the
-- verified digests in their own small table lets the per-request readiness read
-- stay O(1) instead of scanning every settled customer top-up.
CREATE TABLE payment_verified_callback_digests (
    gateway text NOT NULL CHECK (gateway IN ('stripe', 'epay', 'zhifux')),
    configuration_digest bytea NOT NULL CHECK (octet_length(configuration_digest) = 32),
    verified_at timestamptz NOT NULL,
    PRIMARY KEY (gateway, configuration_digest)
);

-- Preserve verified callbacks recorded before this table existed. The callback
-- row already proves settlement through its foreign key.
INSERT INTO payment_verified_callback_digests(gateway, configuration_digest, verified_at)
SELECT b.gateway, b.configuration_digest, max(v.verified_at)
FROM payment_checkout_verification b
JOIN payment_callback_verification v ON v.order_id = b.order_id
GROUP BY b.gateway, b.configuration_digest;

-- ZhifuX qualifies on a signed notification plus settlement, even before the
-- callback verification row is written by a later recovery path.
INSERT INTO payment_verified_callback_digests(gateway, configuration_digest, verified_at)
SELECT b.gateway, b.configuration_digest, max(n.received_at)
FROM payment_checkout_verification b
JOIN payment_signed_notifications n ON n.order_id = b.order_id
JOIN customer_topup_settlements s ON s.order_id = b.order_id
WHERE b.gateway = 'zhifux'
GROUP BY b.gateway, b.configuration_digest
ON CONFLICT (gateway, configuration_digest) DO UPDATE
SET verified_at = GREATEST(payment_verified_callback_digests.verified_at, EXCLUDED.verified_at);
