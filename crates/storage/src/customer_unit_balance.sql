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
    'balances',COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'definition_revision',g.definition_revision::text,'name',d.name,'display_precision',d.display_precision,
        'provenance',g.provenance,'issued_atoms',g.issued_atoms,'held_atoms',g.held_atoms,
        'charged_atoms',g.charged_atoms,'restored_atoms',g.restored_atoms,
        'expired_atoms',g.expired_atoms,'available_atoms',g.available_atoms
    ) ORDER BY g.definition_revision,g.provenance) FROM groups g
        JOIN customer_unit_definitions d ON d.revision=g.definition_revision),'[]'::jsonb)
) FROM customer_unit_configuration c WHERE singleton;
