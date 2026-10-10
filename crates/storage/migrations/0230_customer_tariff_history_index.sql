-- Scoped reverse-chronological history and keyset continuation, including ties.
CREATE INDEX customer_tariff_revision_history
    ON customer_tariff_revisions(tariff_id,created_at DESC,id DESC);
