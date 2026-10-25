SELECT jsonb_build_object(
    'id', l.id,
    'definition_revision', l.definition_revision::text,
    'credit_atoms', l.credit_atoms::text,
    'provenance', l.provenance,
    'reason', l.grant_reason,
    'expires_at_ms', ((extract(epoch FROM l.expires_at)*1000)::bigint)::text,
    'name', d.name,
    'display_precision', d.display_precision,
    'atoms_per_unit', '1000000000',
    'created_at', to_char(l.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
)
FROM customer_unit_lots l JOIN customer_unit_definitions d ON d.revision=l.definition_revision
WHERE l.organization_id=$1 AND l.id=$2 AND l.order_id IS NULL
