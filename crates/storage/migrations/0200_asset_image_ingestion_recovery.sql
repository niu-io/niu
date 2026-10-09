-- Bounded interrupted-worker scans retain immutable claims and outcomes.
CREATE INDEX asset_image_ingestion_claim_recovery
ON asset_image_ingestion_claims(created_at,consent_id);
