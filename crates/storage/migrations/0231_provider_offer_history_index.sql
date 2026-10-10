-- Supplier-scoped reverse chronological quote history and exclusive cursor reads.
CREATE INDEX provider_offer_revision_history
    ON provider_offer_revisions(offer_id,created_at DESC,id DESC);
