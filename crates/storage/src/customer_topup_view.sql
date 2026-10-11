-- Customer-safe projection shared by detail and keyset history reads.
SELECT jsonb_build_object(
    'id', o.id,
    'currency', o.currency,
    'amount_nanos', o.amount_nanos::text,
    'payment_method', o.payment_method,
    'created_at', o.created_at,
    'status', CASE
        WHEN s.order_id IS NOT NULL THEN 'paid'
        WHEN c.order_id IS NOT NULL THEN 'closed'
        WHEN h.order_id IS NOT NULL THEN 'pending'
        ELSE 'reconciliation_required'
    END,
    'checkout_url', CASE
        WHEN s.order_id IS NULL AND c.order_id IS NULL THEN h.checkout_url
        ELSE NULL
    END
)
FROM customer_topup_orders o
LEFT JOIN customer_topup_settlements s ON s.order_id = o.id
LEFT JOIN customer_topup_closures c ON c.order_id = o.id
LEFT JOIN customer_topup_checkout h ON h.order_id = o.id
WHERE o.organization_id = $1
    AND ($2::uuid IS NULL OR o.id = $2)
    AND ($3::text IS NULL OR (o.created_at, o.id) < ($3::text::timestamptz, $4))
ORDER BY o.created_at DESC, o.id DESC
LIMIT 101
