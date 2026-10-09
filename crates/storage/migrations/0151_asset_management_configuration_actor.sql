-- Prior internal foundation rows have no attributed actor; do not invent one.
ALTER TABLE vendor_asset_management_credentials
    ADD COLUMN actor_kind TEXT NOT NULL DEFAULT 'unknown'
    CHECK (actor_kind IN ('unknown','installation'));
