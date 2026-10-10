-- Actor-owned restore content is separate from immutable dispatch identities.
CREATE TABLE video_submission_intents (
    organization_id uuid NOT NULL,
    project_id uuid NOT NULL,
    owner text NOT NULL CHECK (length(owner) BETWEEN 1 AND 200),
    id uuid NOT NULL,
    key_id uuid NOT NULL REFERENCES api_keys(id),
    model text NOT NULL CHECK (length(model) BETWEEN 1 AND 200),
    owner_funded boolean NOT NULL,
    submission_key uuid NOT NULL UNIQUE,
    request_digest bytea NOT NULL CHECK (octet_length(request_digest)=32),
    request jsonb CHECK (request IS NULL OR (jsonb_typeof(request)='object' AND octet_length(request::text)<=131072)),
    revision bigint NOT NULL DEFAULT 1 CHECK (revision>0),
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL DEFAULT now()+interval '30 days',
    deleted_at timestamptz,
    PRIMARY KEY (organization_id,project_id,owner,id),
    FOREIGN KEY (organization_id,project_id) REFERENCES projects(organization_id,id),
    CHECK (expires_at=created_at+interval '30 days'),
    CHECK (deleted_at IS NULL OR request IS NULL)
);
CREATE INDEX video_intent_actor_history ON video_submission_intents
    (organization_id,project_id,owner,created_at DESC,id DESC);
CREATE INDEX video_intent_content_expiry ON video_submission_intents(expires_at)
    WHERE request IS NOT NULL;
CREATE FUNCTION protect_video_submission_intent() RETURNS trigger AS $$
BEGIN
    IF (NEW.organization_id,NEW.project_id,NEW.owner,NEW.id,NEW.key_id,NEW.model,
        NEW.owner_funded,NEW.submission_key,NEW.request_digest,NEW.created_at,NEW.expires_at)
       IS DISTINCT FROM
       (OLD.organization_id,OLD.project_id,OLD.owner,OLD.id,OLD.key_id,OLD.model,
        OLD.owner_funded,OLD.submission_key,OLD.request_digest,OLD.created_at,OLD.expires_at)
       OR NEW.request IS NOT NULL
       OR OLD.request IS NULL
       OR NEW.revision<>OLD.revision+1
       OR NEW.deleted_at IS NULL THEN
        RAISE EXCEPTION 'video intent identity is immutable; only content deletion is allowed';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER protect_video_submission_intent BEFORE UPDATE ON video_submission_intents
    FOR EACH ROW EXECUTE FUNCTION protect_video_submission_intent();
CREATE TRIGGER retain_video_submission_intent BEFORE DELETE ON video_submission_intents
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
