-- Immutable refund receipt: expiry is the original deadline, not a new grant.
-- Do not include confidential backing, procurement prices or platform margins.
SELECT jsonb_build_object(
    'id', r.id, 'credit_atoms', (r.end_atom-r.first_atom)::text,
    'reason', r.reason, 'atoms_per_unit', '1000000000',
    'created_at', to_char(r.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'sources', (SELECT jsonb_agg(jsonb_build_object(
        'credit_atoms', (LEAST(c.charge_offset+c.end_atom-c.first_atom,r.end_atom)
            -GREATEST(c.charge_offset,r.first_atom))::text,
        'definition_revision', l.definition_revision::text,
        'name', d.name, 'display_precision', d.display_precision,
        'provenance', l.provenance,
        'expires_at_ms', ((extract(epoch FROM l.expires_at)*1000)::bigint)::text
    ) ORDER BY c.ordinal)
    FROM customer_unit_consumed_ranges c
    JOIN customer_unit_lots l ON l.id=c.lot_id
    JOIN customer_unit_definitions d ON d.revision=l.definition_revision
    WHERE c.attempt_id=r.attempt_id AND c.charge_offset<r.end_atom
      AND c.charge_offset+c.end_atom-c.first_atom>r.first_atom)
)
FROM customer_unit_restorations r WHERE r.attempt_id=$1 AND r.id=$2
