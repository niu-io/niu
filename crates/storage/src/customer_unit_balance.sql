WITH lots AS MATERIALIZED (
    SELECT * FROM customer_unit_lots WHERE organization_id=$1
), held AS (
    SELECT r.lot_id,sum(r.end_atom-r.first_atom) AS atoms
    FROM customer_unit_reserved_ranges r JOIN lots l ON l.id=r.lot_id
    WHERE NOT EXISTS (SELECT 1 FROM customer_unit_resolutions c WHERE c.attempt_id=r.attempt_id)
    GROUP BY r.lot_id
), charged AS (
    SELECT c.lot_id,sum(c.end_atom-c.first_atom) AS atoms
    FROM customer_unit_consumed_ranges c JOIN lots l ON l.id=c.lot_id GROUP BY c.lot_id
), restored AS (
    SELECT c.lot_id,sum(LEAST(r.end_atom,c.charge_offset+c.end_atom-c.first_atom)
        - GREATEST(r.first_atom,c.charge_offset)) AS atoms
    FROM customer_unit_consumed_ranges c JOIN lots l ON l.id=c.lot_id
    JOIN customer_unit_restorations r ON r.attempt_id=c.attempt_id
        AND r.first_atom<c.charge_offset+(c.end_atom-c.first_atom)
        AND r.end_atom>c.charge_offset
    GROUP BY c.lot_id
), reversed AS (
    SELECT p.lot_id,sum(p.end_atom-p.first_atom) AS atoms
    FROM customer_unit_purchase_reversal_ranges p JOIN lots l ON l.id=p.lot_id
    GROUP BY p.lot_id
), amounts AS (
    SELECT l.*,COALESCE(h.atoms,0) AS held_atoms,COALESCE(c.atoms,0) AS charged_atoms,
        COALESCE(r.atoms,0) AS restored_atoms,
        l.credit_atoms-COALESCE(rev.atoms,0) AS net_issued_atoms,
        l.credit_atoms-COALESCE(rev.atoms,0)-COALESCE(h.atoms,0)-COALESCE(c.atoms,0)+COALESCE(r.atoms,0) AS remaining
    FROM lots l LEFT JOIN held h ON h.lot_id=l.id
    LEFT JOIN charged c ON c.lot_id=l.id LEFT JOIN restored r ON r.lot_id=l.id
    LEFT JOIN reversed rev ON rev.lot_id=l.id
), groups AS (
    SELECT a.definition_revision,a.provenance,
        sum(a.net_issued_atoms)::text AS issued_atoms,sum(a.held_atoms)::text AS held_atoms,
        sum(a.charged_atoms)::text AS charged_atoms,sum(a.restored_atoms)::text AS restored_atoms,
        sum(CASE WHEN a.expires_at<=statement_timestamp() THEN a.remaining ELSE 0 END)::text AS expired_atoms,
        sum(CASE WHEN a.expires_at<=statement_timestamp() THEN 0 ELSE a.remaining END)::text AS available_atoms
    FROM amounts a GROUP BY a.definition_revision,a.provenance
)
SELECT EXISTS(SELECT 1 FROM organizations WHERE id=$1),jsonb_build_object(
    'billing_mode',c.billing_mode,'atoms_per_unit','1000000000',
    'definition',(
        SELECT jsonb_build_object(
            'revision',d.revision::text,'name',d.name,'display_precision',d.display_precision,
            'atoms_per_unit','1000000000'
        ) FROM customer_unit_definitions d ORDER BY d.revision DESC LIMIT 1
    ),
    'purchase_rules',COALESCE((
        SELECT jsonb_agg(item ORDER BY payment_currency)
        FROM (
            SELECT DISTINCT ON (r.payment_currency)
                r.payment_currency,
                jsonb_build_object(
                    'revision',r.revision::text,
                    'definition_revision',r.definition_revision::text,
                    'payment_currency',r.payment_currency,
                    'numerator',r.numerator::text,
                    'denominator',r.denominator::text
                ) AS item
            FROM customer_unit_purchase_rules r
            WHERE r.definition_revision = (SELECT max(revision) FROM customer_unit_definitions)
            ORDER BY r.payment_currency, r.revision DESC
        ) rules
    ),'[]'::jsonb),
    'balances',COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'definition_revision',g.definition_revision::text,'name',d.name,'display_precision',d.display_precision,
        'provenance',g.provenance,'issued_atoms',g.issued_atoms,'held_atoms',g.held_atoms,
        'charged_atoms',g.charged_atoms,'restored_atoms',g.restored_atoms,
        'expired_atoms',g.expired_atoms,'available_atoms',g.available_atoms
    ) ORDER BY g.definition_revision,g.provenance) FROM groups g
        JOIN customer_unit_definitions d ON d.revision=g.definition_revision),'[]'::jsonb),
    'purchases',COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'order_id',a.order_id::text,'created_at',to_char(a.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
        'definition_revision',a.definition_revision::text,'name',d.name,'display_precision',d.display_precision,
        'provenance',a.provenance,'payment_currency',a.payment_currency,'payment_nanos',a.payment_nanos::text,
        'issued_atoms',a.credit_atoms::text,'reversed_atoms',(a.credit_atoms - a.net_issued_atoms)::text,
        'available_atoms',a.remaining::text
    ) ORDER BY a.created_at DESC, a.id DESC) FROM amounts a
        JOIN customer_unit_definitions d ON d.revision=a.definition_revision
        WHERE a.order_id IS NOT NULL),'[]'::jsonb),
    'recent_charges',COALESCE((SELECT jsonb_agg(item) FROM (
        SELECT jsonb_build_object(
            'attempt_id',uc.attempt_id::text,
            'reference',a.public_reference,
            'charged_at',to_char(uc.charged_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
            'model_alias',o.model_alias,
            'definition_revision',uc.definition_revision::text,
            'name',uc.unit_name,
            'display_precision',uc.display_precision,
            'charged_atoms',uc.charged_atoms::text,
            'restored_atoms',uc.restored_atoms::text,
            'refundable_atoms',uc.net_atoms::text
        ) AS item
        FROM customer_activity_unit_charges uc
        JOIN attempts a ON a.id = uc.attempt_id AND a.organization_id = uc.organization_id AND a.project_id = uc.project_id
        JOIN operations o ON o.id = a.operation_id AND o.organization_id = a.organization_id AND o.project_id = a.project_id
        WHERE uc.organization_id = $1 AND uc.charged_atoms > 0
        ORDER BY uc.charged_at DESC, uc.attempt_id DESC
        LIMIT 50
    ) rc),'[]'::jsonb)
) FROM customer_unit_configuration c WHERE singleton;
