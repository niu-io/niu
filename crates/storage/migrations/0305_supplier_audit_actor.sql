-- Retain authenticated provenance for future Supplier creation/deletion events.
-- Historical events remain unchanged; recorded operator IDs still identify actors.
ALTER TABLE provider_audit_events
 ADD COLUMN actor_kind TEXT NOT NULL DEFAULT 'unknown'
 CHECK (actor_kind IN ('unknown','installation','operator'));
ALTER TABLE provider_audit_events
 ADD CONSTRAINT provider_audit_actor_identity CHECK (
   actor_kind='unknown'
   OR (actor_kind='installation' AND actor_operator_id IS NULL)
   OR (actor_kind='operator' AND actor_operator_id IS NOT NULL)
 );
