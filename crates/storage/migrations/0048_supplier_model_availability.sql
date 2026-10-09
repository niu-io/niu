-- Keep catalog eligibility consistent with binding and dispatch checks.
-- Legacy routes without explicit offers retain their existing compatibility behavior.
CREATE FUNCTION niu_supplier_model_route_available(p_alias TEXT)
RETURNS BOOLEAN LANGUAGE SQL STABLE AS $$
    SELECT NOT EXISTS (
        SELECT 1 FROM provider_offers o
        LEFT JOIN vendor_models m ON m.alias = o.model_alias
        LEFT JOIN vendors v ON v.id = m.vendor_id
        WHERE o.model_alias = p_alias AND (
            NOT o.active
            OR NOT niu_offer_qualification_current(o.provider_id, o.id, o.current_revision)
            OR m.alias IS NULL OR v.id IS NULL
            OR NOT m.enabled OR NOT v.enabled
            OR m.vendor_id IS DISTINCT FROM o.vendor_id
        )
    )
$$;
