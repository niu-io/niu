-- Loopback development login sessions survive gateway rebuilds/restarts.
CREATE TABLE local_dev_sessions (
    token_hash BYTEA PRIMARY KEY CHECK(octet_length(token_hash)=32),
    credential_hash BYTEA NOT NULL CHECK(octet_length(credential_hash)=32),
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ
);
CREATE INDEX local_dev_session_expiry ON local_dev_sessions(expires_at);
