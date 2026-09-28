ALTER TABLE attempts
    ADD COLUMN provider_model TEXT
    CHECK (provider_model IS NULL OR length(provider_model) BETWEEN 1 AND 200);
