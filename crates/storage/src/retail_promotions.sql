-- Every publication is joined to its cutoff in one statement snapshot.
WITH observed AS MATERIALIZED (
    SELECT floor(extract(epoch FROM clock_timestamp()))::bigint AS at
), page AS (
    SELECT c.version, jsonb_build_object(
        'revision',p.id,'version',c.version::text,'created_at',c.created_at,'reason',c.reason,
        'baseline_revision',p.baseline_revision,'baseline_version',original.version::text,
        'baseline_published_at',original.created_at,'original_schedule',s.schedule,'schedule',p.schedule,
        'scope',CASE WHEN p.customer_organization_id IS NULL THEN 'global' ELSE 'customer' END,
        'customer_organization_id',p.customer_organization_id,'customer_name',o.name,'customer_created_at',o.created_at,
        'effective_from',p.effective_from::text,'effective_until',p.effective_until::text,
        'retirement_effective_until',r.effective_until::text,
        'eligibility_until',LEAST(p.effective_until,COALESCE(r.effective_until,p.effective_until))::text,
        'state',CASE
            WHEN LEAST(p.effective_until,COALESCE(r.effective_until,p.effective_until))<=p.effective_from THEN 'ended'
            WHEN observed.at<p.effective_from THEN 'scheduled'
            WHEN observed.at<LEAST(p.effective_until,COALESCE(r.effective_until,p.effective_until)) THEN 'within_period'
            ELSE 'ended' END
    ) AS document
    FROM platform_retail_promotions p
    JOIN platform_retail_price_changes c ON c.id=p.id
    JOIN platform_retail_standard_revisions s ON s.id=p.baseline_revision
    JOIN platform_retail_price_changes original ON original.id=p.baseline_revision
    LEFT JOIN organizations o ON o.id=p.customer_organization_id
    LEFT JOIN platform_retail_promotion_retirements r ON r.promotion_id=p.id
    CROSS JOIN observed
    WHERE p.head_id=$1 AND ($2::bigint IS NULL OR c.version<$2)
    ORDER BY c.version DESC LIMIT ($3::bigint+1)
)
SELECT (
    $2::bigint IS NULL OR EXISTS(
        SELECT 1 FROM platform_retail_promotions p JOIN platform_retail_price_changes c ON c.id=p.id
        WHERE p.head_id=$1 AND c.version=$2
    )
), jsonb_build_object(
    'price_id',h.id,'model_alias',h.model_alias,'currency',h.currency,'current_version',h.version::text,
    'as_of',observed.at::text,
    'standard',jsonb_build_object('price_id',h.id,'model_alias',h.model_alias,'currency',h.currency,
        'version',h.version::text,'revision',current_standard.id,'schedule',current_standard.schedule,'published_at',current_change.created_at),
    'data',COALESCE((SELECT jsonb_agg(document ORDER BY version DESC) FROM page),'[]'::jsonb)
)
FROM platform_retail_price_heads h
JOIN platform_retail_standard_revisions current_standard ON current_standard.id=h.current_revision
JOIN platform_retail_price_changes current_change ON current_change.id=current_standard.id
CROSS JOIN observed WHERE h.id=$1
