EXISTS (
    SELECT 1 FROM provider_offers po
    JOIN provider_offer_revisions por ON por.id = po.current_revision
    WHERE po.model_alias = m.alias AND po.vendor_id = m.vendor_id AND por.rate_kind = 'text'
)
