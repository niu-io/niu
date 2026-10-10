-- Only explicitly selected retail receipt fields cross the customer boundary.
-- Quantities and amounts are decimal strings, avoiding JSON integer rounding.
SELECT a.id, jsonb_build_object(
    'model_alias',a.resource_id,
    'currency',c.currency,
    'amount_nanos',c.amount_nanos::text,
    'tariff_revision',c.explanation->>'tariff_revision',
    'meter',c.explanation->>'meter',
    'measured_quantity',jsonb_build_object(
        'numerator',c.explanation->'measured_quantity'->>'numerator',
        'denominator',c.explanation->'measured_quantity'->>'denominator'),
    'billable_quantity',jsonb_build_object(
        'numerator',c.explanation->'billable_quantity'->>'numerator',
        'denominator',c.explanation->'billable_quantity'->>'denominator'),
    'discount_revisions',c.explanation->'discount_revisions',
    'bound_exceeded',c.bound_exceeded
)
FROM customer_invoice_entries e
JOIN customer_media_charges c ON c.attempt_id=e.attempt_id
JOIN attempts a ON a.id=c.attempt_id
WHERE e.organization_id=$1 AND e.project_id=$2 AND e.invoice_id=$3
    AND ($4::uuid IS NULL OR a.id>$4)
ORDER BY a.id
LIMIT 101
