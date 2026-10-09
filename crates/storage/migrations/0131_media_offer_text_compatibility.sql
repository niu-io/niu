-- Media configuration pinning must not change legacy text requalification.
CREATE OR REPLACE FUNCTION niu_media_offer_binding_current(p_provider UUID, p_offer UUID, p_revision UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE AS $$
    SELECT EXISTS (
        SELECT 1 FROM provider_offers o
        JOIN provider_offer_revisions r ON r.offer_id=o.id AND r.id=p_revision
        WHERE o.provider_id=p_provider AND o.id=p_offer
          AND (r.rate_kind='text' OR EXISTS (
              SELECT 1 FROM vendors v
              JOIN vendor_models m ON m.alias=o.model_alias AND m.vendor_id=v.id
              WHERE v.id=o.vendor_id AND r.vendor_id=v.id
                AND r.vendor_revision=v.revision AND r.model_revision=m.revision
                AND r.schema_revision=m.capabilities->'video_schema'->>'revision'
                AND m.capabilities->'video_schema'->>'model_alias'=m.alias
                AND m.capabilities->'video_schema'->>'upstream_model'=m.upstream_model
                AND EXISTS (SELECT 1 FROM vendor_supplier_ownership s WHERE s.vendor_id=v.id AND s.provider_id=p_provider)
                AND NOT EXISTS (SELECT 1 FROM personal_vendor_ownership p WHERE p.vendor_id=v.id)
          ))
    )
$$;
