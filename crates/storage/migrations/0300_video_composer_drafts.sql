-- One mutable, actor-private Video composer per workspace. No dispatch identity.
CREATE TABLE video_composer_drafts (
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    owner TEXT NOT NULL CHECK (length(owner) BETWEEN 1 AND 200),
    payload JSONB CHECK (payload IS NULL OR (jsonb_typeof(payload)='object' AND octet_length(payload::text)<=65536)),
    revision BIGINT NOT NULL DEFAULT 1 CHECK (revision BETWEEN 1 AND 9007199254740991),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    expires_at TIMESTAMPTZ,
    PRIMARY KEY (organization_id,project_id,owner),
    FOREIGN KEY (organization_id,project_id) REFERENCES projects(organization_id,id) ON DELETE CASCADE,
    CHECK (payload IS NULL OR expires_at IS NOT NULL)
);
-- Cleared/expired content remains a revision tombstone until empty-workspace deletion.
CREATE INDEX video_composer_draft_expiry ON video_composer_drafts(expires_at,organization_id,project_id,owner)
    WHERE payload IS NOT NULL;

-- Backstop empty-workspace deletion: only disposable tombstones/expired content
-- may cascade, even when another caller reaches the project DELETE directly.
CREATE FUNCTION protect_retained_video_composer_draft() RETURNS trigger AS $$
BEGIN
    IF OLD.payload IS NOT NULL AND OLD.expires_at>clock_timestamp() THEN
        RAISE EXCEPTION 'retained Video composer content protects its workspace'
            USING ERRCODE='23503';
    END IF;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER protect_retained_video_composer_draft BEFORE DELETE ON video_composer_drafts
    FOR EACH ROW EXECUTE FUNCTION protect_retained_video_composer_draft();
