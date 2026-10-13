-- Project only audited operation metadata. Never select configuration payloads,
-- credentials, purchase prices, or customer request content.
-- Bound each indexed source before the final merge; at most six pages are sorted.
WITH events AS (
 (SELECT * FROM (
 SELECT 'operator'::text AS source, e.id::text AS event_id,
   CASE WHEN e.action LIKE 'session_%' OR e.action LIKE 'password_%' THEN 'authentication' ELSE 'access' END AS category,
   e.action, e.actor_kind, COALESCE(a.name, CASE WHEN e.actor_kind='installation' THEN 'Installation administrator' ELSE 'Unknown actor' END) AS actor_label,
   t.name AS target_label, NULL::bigint AS revision, e.created_at
 FROM operator_audit_events e
 LEFT JOIN admin_operators a ON a.id=e.actor_operator_id
 JOIN admin_operators t ON t.id=e.target_operator_id
 ) projection(source,event_id,category,action,actor_kind,actor_label,target_label,revision,created_at) WHERE ($1::text IS NULL OR category=$1)
 AND ($2::text IS NULL OR (created_at,source,event_id)<($2::text::timestamptz,$3::text,$4::text))
 ORDER BY created_at DESC,event_id DESC LIMIT $5)
 UNION ALL
 (SELECT * FROM (
 SELECT 'vendor', e.id::text, 'configuration', e.action, e.actor_kind,
   CASE WHEN e.actor_kind='installation' THEN 'Installation administrator (recorded)' ELSE 'Unknown actor' END,
   CASE WHEN e.model_alias IS NULL THEN v.name ELSE v.name || ' / ' || e.model_alias END,
   e.revision, e.created_at FROM vendor_audit_events e JOIN vendors v ON v.id=e.vendor_id
 ) projection(source,event_id,category,action,actor_kind,actor_label,target_label,revision,created_at) WHERE ($1::text IS NULL OR category=$1)
 AND ($2::text IS NULL OR (created_at,source,event_id)<($2::text::timestamptz,$3::text,$4::text))
 ORDER BY created_at DESC,event_id DESC LIMIT $5)
 UNION ALL
 (SELECT * FROM (
 SELECT 'supplier', e.id::text, 'supplier', e.action,
   CASE WHEN e.actor_operator_id IS NULL THEN 'unknown' ELSE 'operator' END,
   COALESCE(a.name,'Unknown actor'), p.name, NULL::bigint, e.created_at
 FROM provider_audit_events e JOIN provider_businesses p ON p.id=e.provider_id
 LEFT JOIN admin_operators a ON a.id=e.actor_operator_id
 ) projection(source,event_id,category,action,actor_kind,actor_label,target_label,revision,created_at) WHERE ($1::text IS NULL OR category=$1)
 AND ($2::text IS NULL OR (created_at,source,event_id)<($2::text::timestamptz,$3::text,$4::text))
 ORDER BY created_at DESC,event_id DESC LIMIT $5)
 UNION ALL
 (SELECT * FROM (
 SELECT 'branding', e.revision::text, 'configuration', 'branding_updated',
   CASE WHEN e.actor_kind='installation' THEN 'installation' WHEN e.actor_operator_id IS NOT NULL THEN 'operator' ELSE 'unknown' END,
   CASE WHEN e.actor_kind='installation' THEN 'Installation administrator' ELSE COALESCE(a.name,'Unknown actor') END,
   'Platform branding', e.revision, e.created_at
 FROM branding_configuration_events e LEFT JOIN admin_operators a ON a.id=e.actor_operator_id
 ) projection(source,event_id,category,action,actor_kind,actor_label,target_label,revision,created_at) WHERE ($1::text IS NULL OR category=$1)
 AND ($2::text IS NULL OR (created_at,source,event_id)<($2::text::timestamptz,$3::text,$4::text))
 ORDER BY created_at DESC,event_id DESC LIMIT $5)
 UNION ALL
 (SELECT * FROM (
 SELECT 'payment_gateway', e.id::text, 'configuration', 'payment_gateway_updated',
   CASE WHEN e.actor_operator_id IS NULL THEN 'unknown' ELSE 'operator' END,
   COALESCE(a.name,'Unknown actor'), 'Payment gateway / ' || e.gateway, e.revision, e.created_at
 FROM payment_gateway_configuration_events e LEFT JOIN admin_operators a ON a.id=e.actor_operator_id
 ) projection(source,event_id,category,action,actor_kind,actor_label,target_label,revision,created_at) WHERE ($1::text IS NULL OR category=$1)
 AND ($2::text IS NULL OR (created_at,source,event_id)<($2::text::timestamptz,$3::text,$4::text))
 ORDER BY created_at DESC,event_id DESC LIMIT $5)
 UNION ALL
 (SELECT * FROM (
 SELECT 'platform_access', e.id::text, 'access',
   CASE WHEN e.granted THEN 'platform_access_granted' ELSE 'platform_access_revoked' END,
   e.actor_kind, 'Database administrator', a.name, NULL::bigint, e.created_at
 FROM platform_admin_events e JOIN admin_operators a ON a.id=e.operator_id
 ) projection(source,event_id,category,action,actor_kind,actor_label,target_label,revision,created_at) WHERE ($1::text IS NULL OR category=$1)
 AND ($2::text IS NULL OR (created_at,source,event_id)<($2::text::timestamptz,$3::text,$4::text))
 ORDER BY created_at DESC,event_id DESC LIMIT $5)
)
