-- Persist the plaintext API key secret on active workspace keys so authorized
-- workspace operators with write permission can reveal and copy keys on demand.
-- Revocation and rotation clear token_secret on the retired key.
ALTER TABLE api_keys
    ADD COLUMN IF NOT EXISTS token_secret TEXT;
