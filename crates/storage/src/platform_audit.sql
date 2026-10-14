-- Project only audited operation metadata. Never select configuration payloads,
-- credentials, purchase prices, or customer request content.
-- Bound each indexed source before the final merge; eleven bounded pages are sorted.
WITH events AS (
 (SELECT * FROM (
 SELECT 'operator'::text AS source, e.id::text AS event_id,
   CASE WHEN e.action LIKE 'session_%' OR e.action LIKE 'password_%' THEN 'authentication' ELSE 'access' END AS category,
   e.action, e.actor_kind, COALESCE(a.name, CASE WHEN e.actor_kind='installation' THEN 'Installation administrator' ELSE 'Unknown actor' END) AS actor_label,
   t.name AS target_label, NULL::bigint AS revision, e.before_role, e.after_role, e.created_at
 FROM operator_audit_events e
 LEFT JOIN admin_operators a ON a.id=e.actor_operator_id
 JOIN admin_operators t ON t.id=e.target_operator_id
 ) projection(source,event_id,category,action,actor_kind,actor_label,target_label,revision,before_role,after_role,created_at) WHERE ($1::text IS NULL OR category=$1)
 AND ($2::text IS NULL OR (created_at,source,event_id)<($2::text::timestamptz,$3::text,$4::text))
 ORDER BY created_at DESC,event_id DESC LIMIT $5)
 UNION ALL
 (SELECT * FROM (
 SELECT 'vendor', e.id::text, 'configuration', e.action, e.actor_kind,
   CASE WHEN e.actor_kind='installation' THEN 'Installation administrator (recorded)' ELSE 'Unknown actor' END,
   CASE WHEN e.model_alias IS NULL THEN v.name ELSE v.name || ' / ' || e.model_alias END,
   e.revision, NULL::text, NULL::text, e.created_at FROM vendor_audit_events e JOIN vendors v ON v.id=e.vendor_id
 ) projection(source,event_id,category,action,actor_kind,actor_label,target_label,revision,before_role,after_role,created_at) WHERE ($1::text IS NULL OR category=$1)
 AND ($2::text IS NULL OR (created_at,source,event_id)<($2::text::timestamptz,$3::text,$4::text))
 ORDER BY created_at DESC,event_id DESC LIMIT $5)
 UNION ALL
 (SELECT * FROM (
 SELECT 'supplier', e.id::text, 'supplier', e.action,
   CASE WHEN e.actor_kind='installation' THEN 'installation' WHEN e.actor_operator_id IS NOT NULL THEN 'operator' ELSE 'unknown' END,
   CASE WHEN e.actor_kind='installation' THEN 'Installation administrator' ELSE COALESCE(a.name,'Unknown actor') END, p.name, NULL::bigint, NULL::text, NULL::text, e.created_at
 FROM provider_audit_events e JOIN provider_businesses p ON p.id=e.provider_id
 LEFT JOIN admin_operators a ON a.id=e.actor_operator_id
 ) projection(source,event_id,category,action,actor_kind,actor_label,target_label,revision,before_role,after_role,created_at) WHERE ($1::text IS NULL OR category=$1)
 AND ($2::text IS NULL OR (created_at,source,event_id)<($2::text::timestamptz,$3::text,$4::text))
 ORDER BY created_at DESC,event_id DESC LIMIT $5)
 UNION ALL
 (SELECT * FROM (
 SELECT 'branding', e.revision::text, 'configuration', 'branding_updated',
   CASE WHEN e.actor_kind='installation' THEN 'installation' WHEN e.actor_operator_id IS NOT NULL THEN 'operator' ELSE 'unknown' END,
   CASE WHEN e.actor_kind='installation' THEN 'Installation administrator' ELSE COALESCE(a.name,'Unknown actor') END,
   'Platform branding', e.revision, NULL::text, NULL::text, e.created_at
 FROM branding_configuration_events e LEFT JOIN admin_operators a ON a.id=e.actor_operator_id
 ) projection(source,event_id,category,action,actor_kind,actor_label,target_label,revision,before_role,after_role,created_at) WHERE ($1::text IS NULL OR category=$1)
 AND ($2::text IS NULL OR (created_at,source,event_id)<($2::text::timestamptz,$3::text,$4::text))
 ORDER BY created_at DESC,event_id DESC LIMIT $5)
 UNION ALL
 (SELECT * FROM (
 SELECT 'payment_gateway', e.id::text, 'configuration', 'payment_gateway_updated',
   CASE WHEN e.actor_operator_id IS NULL THEN 'unknown' ELSE 'operator' END,
   COALESCE(a.name,'Unknown actor'), 'Payment gateway / ' || e.gateway, e.revision, NULL::text, NULL::text, e.created_at
 FROM payment_gateway_configuration_events e LEFT JOIN admin_operators a ON a.id=e.actor_operator_id
 ) projection(source,event_id,category,action,actor_kind,actor_label,target_label,revision,before_role,after_role,created_at) WHERE ($1::text IS NULL OR category=$1)
 AND ($2::text IS NULL OR (created_at,source,event_id)<($2::text::timestamptz,$3::text,$4::text))
 ORDER BY created_at DESC,event_id DESC LIMIT $5)
 UNION ALL
 (SELECT * FROM (
 SELECT 'platform_access', e.id::text, 'access',
   CASE WHEN e.granted THEN 'platform_access_granted' ELSE 'platform_access_revoked' END,
   e.actor_kind, 'Database administrator', a.name, NULL::bigint, NULL::text, NULL::text, e.created_at
 FROM platform_admin_events e JOIN admin_operators a ON a.id=e.operator_id
 ) projection(source,event_id,category,action,actor_kind,actor_label,target_label,revision,before_role,after_role,created_at) WHERE ($1::text IS NULL OR category=$1)
 AND ($2::text IS NULL OR (created_at,source,event_id)<($2::text::timestamptz,$3::text,$4::text))
 ORDER BY created_at DESC,event_id DESC LIMIT $5)
 UNION ALL
 (SELECT * FROM (
 SELECT 'retail_price', e.id::text, 'configuration', e.action, e.actor_kind,
   CASE WHEN e.actor_kind='installation' THEN 'Installation administrator' ELSE COALESCE(a.name,'Unknown actor') END,
   h.model_alias || ' / ' || h.currency
     || CASE WHEN h.rate_kind='media' THEN ' / ' || (h.dimensions->>'channel') || ' / ' || (h.dimensions->>'resolution')
        || CASE WHEN (h.dimensions->>'reference_video')::boolean THEN ' / With reference video' ELSE ' / Without reference video' END || ' / ' || h.meter ELSE ' / Text' END
     || CASE WHEN e.action='standard_published' THEN '' WHEN promotion.customer_organization_id IS NULL THEN ' / Global promotion'
        ELSE ' / Customer promotion / ' || COALESCE(customer.name,'Unknown customer') END,
   e.version, NULL::text, NULL::text, e.created_at
 FROM platform_retail_price_changes e JOIN platform_retail_price_heads h ON h.id=e.head_id
 LEFT JOIN platform_retail_promotion_retirements retirement ON retirement.id=e.id
 LEFT JOIN platform_retail_promotions promotion ON promotion.id=COALESCE(retirement.promotion_id,e.id)
 LEFT JOIN organizations customer ON customer.id=promotion.customer_organization_id
 LEFT JOIN admin_operators a ON a.id=e.actor_operator_id
 ) projection(source,event_id,category,action,actor_kind,actor_label,target_label,revision,before_role,after_role,created_at) WHERE ($1::text IS NULL OR category=$1)
 AND ($2::text IS NULL OR (created_at,source,event_id)<($2::text::timestamptz,$3::text,$4::text))
 ORDER BY created_at DESC,event_id DESC LIMIT $5)

 UNION ALL
 (SELECT * FROM (
 SELECT 'retail_text_enrollment', e.id::text, 'configuration', 'text_retail_enrollment_updated', e.actor_kind,
   CASE WHEN e.actor_kind='installation' THEN 'Installation administrator' ELSE COALESCE(a.name,'Unknown actor') END,
   o.name || ' / ' || p.name || ' / ' || (e.intent->>'model_alias'), e.version, NULL::text, NULL::text, e.created_at
 FROM retail_text_enrollment_changes e JOIN organizations o ON o.id=e.organization_id JOIN projects p ON p.id=e.project_id AND p.organization_id=e.organization_id LEFT JOIN admin_operators a ON a.id=e.actor_operator_id
 ) projection(source,event_id,category,action,actor_kind,actor_label,target_label,revision,before_role,after_role,created_at) WHERE ($1::text IS NULL OR category=$1)
 AND ($2::text IS NULL OR (created_at,source,event_id)<($2::text::timestamptz,$3::text,$4::text))
 ORDER BY created_at DESC,event_id DESC LIMIT $5)

 UNION ALL
 (SELECT * FROM (
 SELECT 'retail_media_enrollment', e.id::text, 'configuration', 'media_retail_enrollment_updated', e.actor_kind,
   CASE WHEN e.actor_kind='installation' THEN 'Installation administrator' ELSE COALESCE(a.name,'Unknown actor') END,
   o.name || ' / ' || p.name || ' / ' || (e.intent->'dimensions'->>'model') || ' / ' || (e.intent->'dimensions'->>'resolution') || ' / ' || (e.intent->'dimensions'->>'channel') || CASE WHEN (e.intent->'dimensions'->>'reference_video')::boolean THEN ' / With reference video' ELSE ' / Without reference video' END || ' / ' || (e.intent->>'meter'), e.version, NULL::text, NULL::text, e.created_at
 FROM retail_media_enrollment_changes e JOIN organizations o ON o.id=e.organization_id JOIN projects p ON p.id=e.project_id AND p.organization_id=e.organization_id LEFT JOIN admin_operators a ON a.id=e.actor_operator_id
 ) projection(source,event_id,category,action,actor_kind,actor_label,target_label,revision,before_role,after_role,created_at) WHERE ($1::text IS NULL OR category=$1)
 AND ($2::text IS NULL OR (created_at,source,event_id)<($2::text::timestamptz,$3::text,$4::text))
 ORDER BY created_at DESC,event_id DESC LIMIT $5)

 UNION ALL
 (SELECT * FROM (
 SELECT 'balance_grant', e.id::text, 'configuration', 'noncash_balance_granted', e.actor_kind,
   CASE WHEN e.actor_kind='installation' THEN 'Installation administrator' ELSE COALESCE(a.name,'Unknown actor') END,
   o.name || ' / ' || e.currency, NULL::bigint, NULL::text, NULL::text, e.created_at
 FROM customer_balance_grants e JOIN organizations o ON o.id=e.organization_id LEFT JOIN admin_operators a ON a.id=e.actor_operator_id
 ) projection(source,event_id,category,action,actor_kind,actor_label,target_label,revision,before_role,after_role,created_at) WHERE ($1::text IS NULL OR category=$1)
 AND ($2::text IS NULL OR (created_at,source,event_id)<($2::text::timestamptz,$3::text,$4::text))
 ORDER BY created_at DESC,event_id DESC LIMIT $5)

 UNION ALL
 (SELECT * FROM (
 SELECT 'media_liability', e.id::text, 'supplier', 'media_liability_' || e.action, e.actor_kind,
   CASE WHEN e.actor_kind='installation' THEN 'Installation administrator' ELSE COALESCE(a.name,'Unknown actor') END,
   b.name || ' / ' || (h.identity->>'model_alias') || ' / ' || (h.identity->'dimensions'->>'resolution') || ' / ' || (h.identity->'dimensions'->>'channel') || CASE WHEN (h.identity->'dimensions'->>'reference_video')::boolean THEN ' / With reference video' ELSE ' / Without reference video' END || ' / ' || (h.identity->>'meter'), e.version, NULL::text, NULL::text, e.created_at
 FROM media_liability_qualification_changes e JOIN media_liability_qualification_heads h ON h.id=e.head_id JOIN provider_businesses b ON b.id=h.supplier_id LEFT JOIN admin_operators a ON a.id=e.actor_operator_id
 ) projection(source,event_id,category,action,actor_kind,actor_label,target_label,revision,before_role,after_role,created_at) WHERE ($1::text IS NULL OR category=$1)
 AND ($2::text IS NULL OR (created_at,source,event_id)<($2::text::timestamptz,$3::text,$4::text))
 ORDER BY created_at DESC,event_id DESC LIMIT $5)

)
