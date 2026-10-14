-- Source-qualified audit pagination follows metadata only. No operation history
-- is rewritten; bound each newly integrated commercial journal before merging.
CREATE INDEX platform_retail_price_changes_audit_order ON platform_retail_price_changes(created_at DESC, (id::text) DESC);
CREATE INDEX retail_text_enrollment_changes_audit_order ON retail_text_enrollment_changes(created_at DESC, (id::text) DESC);
CREATE INDEX retail_media_enrollment_changes_audit_order ON retail_media_enrollment_changes(created_at DESC, (id::text) DESC);
CREATE INDEX customer_balance_grants_audit_order ON customer_balance_grants(created_at DESC, (id::text) DESC);
CREATE INDEX media_liability_qualification_changes_audit_order ON media_liability_qualification_changes(created_at DESC, (id::text) DESC);
