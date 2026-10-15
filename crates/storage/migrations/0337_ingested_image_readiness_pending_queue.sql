-- Track unresolved ingested_image_readiness_claims in a compact pending table
-- maintained by triggers so recover_interrupted_ingested_image_reads() and
-- pending-claim checks remain O(active claims) while keeping
-- ingested_image_readiness_claims strictly immutable.

CREATE TABLE IF NOT EXISTS ingested_image_readiness_pending (
    read_id UUID PRIMARY KEY REFERENCES ingested_image_readiness_claims(id) ON DELETE CASCADE,
    consent_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS ingested_image_readiness_pending_recovery_idx
    ON ingested_image_readiness_pending (created_at, read_id);

CREATE INDEX IF NOT EXISTS ingested_image_readiness_pending_consent_idx
    ON ingested_image_readiness_pending (consent_id);

INSERT INTO ingested_image_readiness_pending (read_id, consent_id, created_at)
SELECT c.id, c.consent_id, c.created_at
  FROM ingested_image_readiness_claims c
 WHERE NOT EXISTS (
     SELECT 1 FROM ingested_image_readiness_outcomes o WHERE o.read_id = c.id
 )
ON CONFLICT (read_id) DO NOTHING;

CREATE OR REPLACE FUNCTION niu_track_ingested_image_readiness_pending()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM ingested_image_readiness_outcomes o WHERE o.read_id = NEW.id
    ) THEN
        INSERT INTO ingested_image_readiness_pending (read_id, consent_id, created_at)
        VALUES (NEW.id, NEW.consent_id, NEW.created_at)
        ON CONFLICT (read_id) DO NOTHING;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS track_ingested_image_readiness_pending ON ingested_image_readiness_claims;
CREATE TRIGGER track_ingested_image_readiness_pending
    AFTER INSERT ON ingested_image_readiness_claims
    FOR EACH ROW
    EXECUTE FUNCTION niu_track_ingested_image_readiness_pending();

CREATE OR REPLACE FUNCTION niu_clear_ingested_image_readiness_pending()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    DELETE FROM ingested_image_readiness_pending WHERE read_id = NEW.read_id;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS clear_ingested_image_readiness_pending ON ingested_image_readiness_outcomes;
CREATE TRIGGER clear_ingested_image_readiness_pending
    AFTER INSERT ON ingested_image_readiness_outcomes
    FOR EACH ROW
    EXECUTE FUNCTION niu_clear_ingested_image_readiness_pending();
