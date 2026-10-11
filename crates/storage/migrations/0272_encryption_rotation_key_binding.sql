-- Keyed, operation-specific verification values are computed outside PostgreSQL.
-- Legacy maintenance records remain unbound and cannot be resumed by the writer.
ALTER TABLE encryption_rotation_operations
    ADD COLUMN source_key_check BYTEA,
    ADD COLUMN target_key_check BYTEA,
    ADD CONSTRAINT encryption_rotation_key_binding_complete CHECK (
        (source_key_check IS NULL AND target_key_check IS NULL)
        OR (source_key_check IS NOT NULL AND target_key_check IS NOT NULL
            AND octet_length(source_key_check)=32 AND octet_length(target_key_check)=32)
    );
CREATE OR REPLACE FUNCTION preserve_encryption_rotation_operation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP='UPDATE'
       AND OLD.completed_at IS NULL AND NEW.completed_at IS NOT NULL
       AND (to_jsonb(NEW)-'completed_at')=(to_jsonb(OLD)-'completed_at')
    THEN RETURN NEW; END IF;
    RAISE EXCEPTION 'encryption rotation history permits completion only' USING ERRCODE='23514';
END;
$$;

CREATE OR REPLACE FUNCTION niu_authorized_encryption_rewrap(
    relation_name TEXT, cipher_column TEXT, old_record JSONB, new_record JSONB
) RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
    SELECT COALESCE(
        old_record->>cipher_column IS NOT NULL
        AND new_record->>cipher_column IS NOT NULL
        AND (old_record-cipher_column)=(new_record-cipher_column)
        AND EXISTS (
            SELECT 1 FROM encryption_rewrap_authorizations a
            JOIN encryption_rotation_operations o ON o.id=a.operation_id
            WHERE o.completed_at IS NULL
              AND o.source_key_check IS NOT NULL AND o.target_key_check IS NOT NULL
              AND a.transaction_id=txid_current()
              AND a.table_name=relation_name
              AND a.old_record_sha256=sha256(convert_to(old_record::TEXT,'UTF8'))
              AND a.new_record_sha256=sha256(convert_to(new_record::TEXT,'UTF8'))
        ), FALSE)
$$;
