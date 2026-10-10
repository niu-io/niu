-- Run only while holding the parent operation lock. No observation inferred
-- from a timeout, disconnect or uncertain commit can satisfy this predicate.
SELECT EXISTS (
    SELECT 1
    FROM attempts a
    JOIN gateway_retry_attempts chain ON chain.attempt_id=a.id
    JOIN request_failures f ON f.attempt_id=a.id
    JOIN managed_attempt_routes m ON m.attempt_id=a.id
    JOIN operation_funding_sources funding ON funding.operation_id=a.operation_id
    WHERE a.id=$1 AND a.operation_id=$2 AND chain.ordinal=1
        AND a.execution='confirmed_not_executed'
        AND a.usage_confidence='unknown'
        AND a.dispatch_provider='openrouter'
        AND f.kind='upstream_http_error' AND f.upstream_http_status=401
        AND m.vendor_id<>$3
        AND m.pool_alias IS NOT NULL AND m.pool_alias=$4
        AND NOT EXISTS (
            SELECT 1 FROM gateway_retry_attempts successor
            WHERE successor.operation_id=a.operation_id AND successor.ordinal=2
        )
        AND NOT EXISTS (
            SELECT 1 FROM customer_balance_reservations r
            WHERE r.attempt_id=a.id AND r.released_at IS NULL
        )
        AND NOT EXISTS (
            SELECT 1 FROM cost_reservations r
            WHERE r.attempt_id=a.id AND r.state='held'
        )
        AND NOT EXISTS (
            SELECT 1 FROM customer_charges c WHERE c.attempt_id=a.id
        )
        AND NOT EXISTS (
            SELECT 1 FROM media_recovery_routes media WHERE media.attempt_id=a.id
        )
)
