ALTER TABLE provider_businesses
    ADD COLUMN description TEXT NOT NULL DEFAULT '' CHECK (octet_length(description) <= 8000),
    ADD COLUMN website_url TEXT NOT NULL DEFAULT '' CHECK (octet_length(website_url) <= 2048),
    ADD COLUMN logo_url TEXT NOT NULL DEFAULT '' CHECK (octet_length(logo_url) <= 2048),
    ADD COLUMN profile_revision BIGINT NOT NULL DEFAULT 1;
