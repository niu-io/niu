-- Index active inspected_image_source_content expiry and unresolved
-- asset_image_ingestion_claims so 5-second background loops do not scan
-- historical rows (#27 #133).

ALTER TABLE inspected_image_source_content
    ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

DROP TRIGGER IF EXISTS immutable_inspected_image_source_bytes ON inspected_image_source_content;

UPDATE inspected_image_source_content c
SET expires_at = s.expires_at
FROM inspected_image_sources s
WHERE s.id = c.source_id
  AND c.expires_at IS NULL;

ALTER TABLE inspected_image_source_content
    ALTER COLUMN expires_at SET NOT NULL;

CREATE OR REPLACE FUNCTION set_inspected_image_source_content_expiry() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.expires_at IS NULL THEN
        SELECT s.expires_at INTO NEW.expires_at
        FROM inspected_image_sources s
        WHERE s.id = NEW.source_id;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER set_inspected_image_source_content_expiry
BEFORE INSERT ON inspected_image_source_content
FOR EACH ROW EXECUTE FUNCTION set_inspected_image_source_content_expiry();

CREATE TRIGGER immutable_inspected_image_source_bytes
BEFORE UPDATE ON inspected_image_source_content
FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

CREATE INDEX IF NOT EXISTS inspected_image_source_content_expiry
    ON inspected_image_source_content(expires_at, source_id);

CREATE INDEX IF NOT EXISTS inspected_image_sources_workspace_active
    ON inspected_image_sources(organization_id, project_id, expires_at, id);

CREATE OR REPLACE FUNCTION niu_purge_inspected_image_page() RETURNS BIGINT
LANGUAGE plpgsql AS $$
DECLARE
    candidate RECORD;
    removed BIGINT := 0;
    affected BIGINT;
BEGIN
    FOR candidate IN
        SELECT c.source_id AS id
        FROM inspected_image_source_content c
        JOIN inspected_image_sources s ON s.id = c.source_id
        LEFT JOIN inspected_image_cleanup_retries r ON r.source_id = c.source_id
        WHERE c.expires_at <= now()
          AND (r.retry_after IS NULL OR r.retry_after <= now())
        ORDER BY c.expires_at, c.source_id
        LIMIT 16
        FOR UPDATE OF s SKIP LOCKED
    LOOP
        BEGIN
            INSERT INTO inspected_image_source_erasures(source_id)
            VALUES(candidate.id) ON CONFLICT DO NOTHING;
            DELETE FROM inspected_image_source_content WHERE source_id = candidate.id;
            GET DIAGNOSTICS affected = ROW_COUNT;
            removed := removed + affected;
        EXCEPTION
            WHEN integrity_constraint_violation OR data_exception OR raise_exception THEN
                INSERT INTO inspected_image_cleanup_retries(source_id, retry_after)
                VALUES(candidate.id, clock_timestamp() + interval '60 seconds')
                ON CONFLICT(source_id) DO UPDATE SET retry_after = EXCLUDED.retry_after;
        END;
    END LOOP;
    RETURN removed;
END;
$$;

ALTER TABLE asset_image_ingestion_claims
    ADD COLUMN IF NOT EXISTS resolved BOOLEAN NOT NULL DEFAULT FALSE;

DROP TRIGGER IF EXISTS immutable_asset_image_ingestion_claim ON asset_image_ingestion_claims;

UPDATE asset_image_ingestion_claims c
SET resolved = TRUE
WHERE NOT c.resolved
  AND EXISTS (
      SELECT 1 FROM asset_image_ingestion_outcomes o
      WHERE o.consent_id = c.consent_id
  );

CREATE OR REPLACE FUNCTION guard_asset_image_ingestion_claim() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'accounting records are immutable';
    END IF;
    IF NEW.consent_id = OLD.consent_id
       AND NEW.created_at = OLD.created_at
       AND OLD.resolved = FALSE
       AND NEW.resolved = TRUE
       AND EXISTS (
           SELECT 1 FROM asset_image_ingestion_outcomes o
           WHERE o.consent_id = NEW.consent_id
       ) THEN
        RETURN NEW;
    END IF;
    RAISE EXCEPTION 'accounting records are immutable';
END;
$$;

CREATE TRIGGER immutable_asset_image_ingestion_claim
BEFORE UPDATE OR DELETE ON asset_image_ingestion_claims
FOR EACH ROW EXECUTE FUNCTION guard_asset_image_ingestion_claim();

CREATE OR REPLACE FUNCTION mark_asset_image_ingestion_claim_resolved() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
    UPDATE asset_image_ingestion_claims
    SET resolved = TRUE
    WHERE consent_id = NEW.consent_id
      AND NOT resolved;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS resolve_asset_image_ingestion_claim ON asset_image_ingestion_outcomes;
CREATE TRIGGER resolve_asset_image_ingestion_claim
AFTER INSERT ON asset_image_ingestion_outcomes
FOR EACH ROW EXECUTE FUNCTION mark_asset_image_ingestion_claim_resolved();

CREATE INDEX IF NOT EXISTS asset_image_ingestion_claims_unresolved
    ON asset_image_ingestion_claims(created_at, consent_id)
    WHERE NOT resolved;
