-- Store compact offer revisions alongside compiled routing registry snapshots
-- so hot-path validate_published_offer_binding never detoasts multi-MB compiled JSONB.

ALTER TABLE routing_registry_generations
    ADD COLUMN IF NOT EXISTS offer_revisions JSONB;
