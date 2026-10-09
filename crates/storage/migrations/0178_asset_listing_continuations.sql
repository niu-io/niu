-- One next-page claim per retained parent, with a finite chain and private receipt.
ALTER TABLE asset_listing_claims
    ADD COLUMN parent_listing_id UUID REFERENCES asset_listing_claims(id),
    ADD COLUMN page_number INTEGER NOT NULL DEFAULT 1 CHECK (page_number BETWEEN 1 AND 100),
    ADD COLUMN parent_snapshot_sha256 BYTEA CHECK (parent_snapshot_sha256 IS NULL OR octet_length(parent_snapshot_sha256)=32),
    ADD CHECK ((parent_listing_id IS NULL)=(page_number=1)),
    ADD CHECK ((parent_listing_id IS NULL)=(parent_snapshot_sha256 IS NULL)),
    ADD CHECK (parent_listing_id IS NULL OR parent_listing_id<>id);
CREATE UNIQUE INDEX asset_listing_one_child ON asset_listing_claims(parent_listing_id) WHERE parent_listing_id IS NOT NULL;
