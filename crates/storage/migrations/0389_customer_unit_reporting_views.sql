-- Include Credits text and media attempt tariffs in priced-attempt reporting
-- and expose settled Credits charges without mixing atoms into monetary charges (#110).

CREATE OR REPLACE VIEW customer_activity_priced_attempts AS
SELECT attempt_id FROM customer_attempt_tariffs
UNION
SELECT attempt_id FROM customer_media_attempt_pricing
UNION
SELECT attempt_id FROM customer_unit_attempt_tariffs
UNION
SELECT attempt_id FROM customer_unit_media_attempt_tariffs;

CREATE VIEW customer_activity_unit_charges AS
SELECT r.organization_id,
       r.project_id,
       r.attempt_id,
       r.definition_revision,
       d.name AS unit_name,
       d.display_precision,
       res.charged_atoms,
       COALESCE((
           SELECT sum(rest.end_atom - rest.first_atom)::bigint
           FROM customer_unit_restorations rest
           WHERE rest.attempt_id = res.attempt_id
       ), 0)::bigint AS restored_atoms,
       (res.charged_atoms - COALESCE((
           SELECT sum(rest.end_atom - rest.first_atom)::bigint
           FROM customer_unit_restorations rest
           WHERE rest.attempt_id = res.attempt_id
       ), 0))::bigint AS net_atoms,
       res.created_at AS charged_at
FROM customer_unit_resolutions res
JOIN customer_unit_reservations r ON r.attempt_id = res.attempt_id
JOIN customer_unit_definitions d ON d.revision = r.definition_revision
WHERE res.kind = 'charge';
