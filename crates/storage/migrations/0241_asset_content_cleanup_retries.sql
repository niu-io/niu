-- Each retry has a real foreign key to its own immutable content identity.
-- No retained content, upstream identifier or database error enters retry state.
CREATE TABLE asset_group_read_cleanup_retries (
    record_id UUID PRIMARY KEY REFERENCES asset_group_read_results(read_id) ON DELETE CASCADE,
    retry_after TIMESTAMPTZ NOT NULL
);
CREATE TABLE asset_group_update_cleanup_retries (
    record_id UUID PRIMARY KEY REFERENCES asset_group_update_patches(update_id) ON DELETE CASCADE,
    retry_after TIMESTAMPTZ NOT NULL
);
CREATE TABLE asset_listing_cleanup_retries (
    record_id UUID PRIMARY KEY REFERENCES asset_listing_results(listing_id) ON DELETE CASCADE,
    retry_after TIMESTAMPTZ NOT NULL
);
CREATE TABLE asset_lookup_cleanup_retries (
    record_id UUID PRIMARY KEY REFERENCES asset_lookup_results(lookup_id) ON DELETE CASCADE,
    retry_after TIMESTAMPTZ NOT NULL
);

-- Trigger arguments below are installation-owned constants, not request inputs.
CREATE FUNCTION clear_asset_content_cleanup_retry() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
    EXECUTE format('DELETE FROM %I WHERE record_id = $1', TG_ARGV[0])
        USING (to_jsonb(NEW)->>TG_ARGV[1])::uuid;
    RETURN NEW;
END;
$$;
CREATE TRIGGER clear_asset_group_read_cleanup_retry
AFTER UPDATE OF deleted_at ON asset_group_read_results
FOR EACH ROW WHEN (NEW.deleted_at IS NOT NULL)
EXECUTE FUNCTION clear_asset_content_cleanup_retry('asset_group_read_cleanup_retries', 'read_id');
CREATE TRIGGER clear_asset_group_update_cleanup_retry
AFTER UPDATE OF deleted_at ON asset_group_update_patches
FOR EACH ROW WHEN (NEW.deleted_at IS NOT NULL)
EXECUTE FUNCTION clear_asset_content_cleanup_retry('asset_group_update_cleanup_retries', 'update_id');
CREATE TRIGGER clear_asset_listing_cleanup_retry
AFTER UPDATE OF deleted_at ON asset_listing_results
FOR EACH ROW WHEN (NEW.deleted_at IS NOT NULL)
EXECUTE FUNCTION clear_asset_content_cleanup_retry('asset_listing_cleanup_retries', 'listing_id');
CREATE TRIGGER clear_asset_lookup_cleanup_retry
AFTER UPDATE OF deleted_at ON asset_lookup_results
FOR EACH ROW WHEN (NEW.deleted_at IS NOT NULL)
EXECUTE FUNCTION clear_asset_content_cleanup_retry('asset_lookup_cleanup_retries', 'lookup_id');

-- These four domains share the same retention/erasure contract. Keep one
-- bounded implementation, with an explicit closed mapping of identifiers.
-- This is not SECURITY DEFINER and does not accept SQL or table names.
CREATE FUNCTION niu_purge_asset_content_page(content_kind TEXT) RETURNS BIGINT
LANGUAGE plpgsql AS $$
DECLARE
    content_table TEXT;
    key_column TEXT;
    retry_table TEXT;
    candidate RECORD;
    removed BIGINT := 0;
    affected BIGINT;
BEGIN
    CASE content_kind
        WHEN 'group_read' THEN
            content_table := 'asset_group_read_results';
            key_column := 'read_id';
            retry_table := 'asset_group_read_cleanup_retries';
        WHEN 'group_update' THEN
            content_table := 'asset_group_update_patches';
            key_column := 'update_id';
            retry_table := 'asset_group_update_cleanup_retries';
        WHEN 'listing' THEN
            content_table := 'asset_listing_results';
            key_column := 'listing_id';
            retry_table := 'asset_listing_cleanup_retries';
        WHEN 'lookup' THEN
            content_table := 'asset_lookup_results';
            key_column := 'lookup_id';
            retry_table := 'asset_lookup_cleanup_retries';
        ELSE
            RAISE EXCEPTION 'unsupported asset retention domain' USING ERRCODE = '22023';
    END CASE;
    FOR candidate IN EXECUTE format(
        'SELECT c.%1$I AS id FROM %2$I c LEFT JOIN %3$I r ON r.record_id=c.%1$I
         WHERE c.ciphertext IS NOT NULL AND c.expires_at<=now()
           AND (r.retry_after IS NULL OR r.retry_after<=now())
         ORDER BY c.expires_at,c.%1$I LIMIT 64 FOR UPDATE OF c SKIP LOCKED',
        key_column, content_table, retry_table)
    LOOP
        BEGIN
            EXECUTE format(
                'UPDATE %I SET ciphertext=NULL,deleted_at=clock_timestamp()
                 WHERE %I=$1 AND ciphertext IS NOT NULL AND expires_at<=now()',
                content_table, key_column) USING candidate.id;
            GET DIAGNOSTICS affected = ROW_COUNT;
            removed := removed + affected;
        EXCEPTION
            WHEN integrity_constraint_violation OR data_exception OR raise_exception THEN
                EXECUTE format(
                    'INSERT INTO %I(record_id,retry_after) VALUES($1,clock_timestamp()+interval ''60 seconds'')
                     ON CONFLICT(record_id) DO UPDATE SET retry_after=EXCLUDED.retry_after',
                    retry_table) USING candidate.id;
        END;
    END LOOP;
    RETURN removed;
END;
$$;
