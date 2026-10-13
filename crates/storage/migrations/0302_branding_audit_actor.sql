-- Future Branding writes retain explicit authenticated actor provenance.
-- Never infer installation authorization from historical missing operator IDs.
ALTER TABLE branding_configuration_events
 ADD COLUMN actor_kind TEXT NOT NULL DEFAULT 'unknown'
 CHECK (actor_kind IN ('unknown','installation','operator'));
ALTER TABLE branding_configuration_events
 ADD CONSTRAINT branding_configuration_actor_identity CHECK (
   actor_kind='unknown'
   OR (actor_kind='installation' AND actor_operator_id IS NULL)
   OR (actor_kind='operator' AND actor_operator_id IS NOT NULL)
 );
-- Existing immutable events are not updated or backfilled.
