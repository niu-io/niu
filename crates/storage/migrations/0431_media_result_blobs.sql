-- Durable encrypted copies of bounded video results. The upstream signed URL is
-- not a storage guarantee; retain a validated BabelArk payload with the same
-- tenant/job/kind identity so delivery survives signed-URL expiry or truncation.
CREATE TABLE media_result_blobs (
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    attempt_id UUID NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('video', 'last_frame')),
    content_type TEXT NOT NULL CHECK (octet_length(content_type) BETWEEN 1 AND 128),
    byte_length BIGINT NOT NULL CHECK (byte_length > 0 AND byte_length <= 67108864),
    ciphertext BYTEA NOT NULL CHECK (octet_length(ciphertext) > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (attempt_id, kind)
);
CREATE INDEX media_result_blobs_scope_idx
    ON media_result_blobs (organization_id, project_id, attempt_id);
