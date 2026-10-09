-- Shared admission counters contain no plaintext email, password or session.
CREATE TABLE password_login_admission (
    kind TEXT NOT NULL CHECK (kind IN ('global', 'identity')),
    bucket BYTEA NOT NULL CHECK (octet_length(bucket) = 32),
    window_start TIMESTAMPTZ NOT NULL DEFAULT now(),
    attempts INTEGER NOT NULL CHECK (attempts BETWEEN 1 AND 120),
    PRIMARY KEY (kind, bucket)
);
CREATE INDEX password_login_admission_expiry ON password_login_admission(window_start);
