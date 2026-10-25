SELECT jsonb_build_object(
    'id', q.id,
    'rule_revision', q.rule_revision::text,
    'payment_currency', q.payment_currency,
    'payment_nanos', q.payment_nanos::text,
    'credit_atoms', q.credit_atoms::text,
    'definition_revision', r.definition_revision::text,
    'name', d.name,
    'display_precision', d.display_precision,
    'atoms_per_unit', '1000000000',
    'numerator', r.numerator::text,
    'denominator', r.denominator::text,
    'created_at', to_char(q.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'expires_at', to_char(q.expires_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
)
FROM customer_unit_purchase_quotes q
JOIN customer_unit_purchase_rules r ON r.revision = q.rule_revision
JOIN customer_unit_definitions d ON d.revision = r.definition_revision
WHERE q.organization_id = $1 AND q.id = $2
