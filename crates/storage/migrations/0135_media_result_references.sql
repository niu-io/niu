-- Signed output URLs are encrypted private content, separate from accounting.
CREATE TABLE media_result_references (
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    attempt_id UUID NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('video','last_frame')),
    ciphertext BYTEA CHECK (octet_length(ciphertext) BETWEEN 30 AND 16413),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp() + interval '24 hours',
    deleted_at TIMESTAMPTZ,
    PRIMARY KEY (attempt_id,kind),
    FOREIGN KEY (organization_id,project_id,attempt_id)
        REFERENCES media_recovery_routes(organization_id,project_id,attempt_id),
    CHECK (expires_at > created_at AND expires_at <= created_at + interval '24 hours 1 second'),
    CHECK ((deleted_at IS NULL AND ciphertext IS NOT NULL) OR (deleted_at IS NOT NULL AND ciphertext IS NULL))
);
CREATE INDEX media_result_expiry ON media_result_references(expires_at) WHERE ciphertext IS NOT NULL;
CREATE FUNCTION protect_media_result_reference() RETURNS TRIGGER AS $$
BEGIN
    IF (NEW.organization_id,NEW.project_id,NEW.attempt_id,NEW.kind,NEW.created_at,NEW.expires_at)
      IS DISTINCT FROM (OLD.organization_id,OLD.project_id,OLD.attempt_id,OLD.kind,OLD.created_at,OLD.expires_at)
      OR (OLD.deleted_at IS NOT NULL AND NEW IS DISTINCT FROM OLD) THEN
        RAISE EXCEPTION 'media result identity, expiry and deletion are permanent';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER protect_media_result_reference BEFORE UPDATE ON media_result_references
    FOR EACH ROW EXECUTE FUNCTION protect_media_result_reference();
