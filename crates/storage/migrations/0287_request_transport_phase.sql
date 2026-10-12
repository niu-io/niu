-- Historical observations remain unknown; never infer phase from duration/kind.
ALTER TABLE request_failures ADD COLUMN transport_phase TEXT
CHECK (transport_phase IN ('connection','request'));
ALTER TABLE request_failures ADD CONSTRAINT valid_request_transport_phase CHECK (
    transport_phase IS NULL
    OR (kind='upstream_timeout' AND transport_phase IN ('connection','request'))
    OR (kind='upstream_connection_error' AND transport_phase='connection')
);
