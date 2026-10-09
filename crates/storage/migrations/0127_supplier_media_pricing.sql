-- Confidential purchase schedules and attempt snapshots, separate from customer prices.
CREATE TABLE supplier_media_rate_cards (
    provider_id UUID NOT NULL REFERENCES provider_businesses(id),
    revision TEXT NOT NULL CHECK (length(revision) BETWEEN 1 AND 256),
    offer_revision UUID NOT NULL REFERENCES provider_offer_revisions(id),
    model_alias TEXT NOT NULL,
    channel TEXT NOT NULL,
    resolution TEXT NOT NULL,
    reference_video BOOLEAN NOT NULL,
    effective_from BIGINT NOT NULL,
    effective_until BIGINT,
    document JSONB NOT NULL CHECK (jsonb_typeof(document)='object' AND octet_length(document::text)<=131072),
    PRIMARY KEY(provider_id,revision),
    CHECK(effective_until IS NULL OR effective_until>effective_from)
);
CREATE INDEX supplier_media_rate_selection ON supplier_media_rate_cards
    (provider_id,offer_revision,model_alias,channel,resolution,reference_video,effective_from);
CREATE TABLE supplier_media_attempt_pricing (
    attempt_id UUID PRIMARY KEY REFERENCES provider_attempt_offers(attempt_id),
    provider_id UUID NOT NULL,
    rate_revision TEXT NOT NULL,
    snapshot JSONB NOT NULL CHECK (jsonb_typeof(snapshot)='object' AND snapshot->>'version'='1' AND snapshot ? 'version' AND octet_length(snapshot::text)<=131072),
    FOREIGN KEY(provider_id,rate_revision) REFERENCES supplier_media_rate_cards(provider_id,revision)
);
CREATE TRIGGER immutable_supplier_media_cards BEFORE UPDATE OR DELETE ON supplier_media_rate_cards
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
CREATE TRIGGER immutable_supplier_media_pricing BEFORE UPDATE OR DELETE ON supplier_media_attempt_pricing
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

-- Use the existing Supplier liability/settlement ledger without inventing text tokens.
ALTER TABLE provider_earnings ALTER COLUMN prompt_tokens DROP NOT NULL;
ALTER TABLE provider_earnings ALTER COLUMN completion_tokens DROP NOT NULL;
ALTER TABLE provider_earnings ADD COLUMN billing_meter TEXT NOT NULL DEFAULT 'text_tokens';
ALTER TABLE provider_earnings ADD COLUMN meter_quantity JSONB;
ALTER TABLE provider_earnings ADD COLUMN media_explanation JSONB;
ALTER TABLE provider_earnings ADD CONSTRAINT supplier_meter_shape CHECK (
    (billing_meter='text_tokens' AND prompt_tokens IS NOT NULL AND completion_tokens IS NOT NULL AND meter_quantity IS NULL AND media_explanation IS NULL)
    OR (billing_meter<>'text_tokens' AND length(billing_meter) BETWEEN 1 AND 100 AND prompt_tokens IS NULL AND completion_tokens IS NULL
        AND meter_quantity IS NOT NULL AND jsonb_typeof(meter_quantity)='object'
        AND media_explanation IS NOT NULL AND jsonb_typeof(media_explanation)='object')
);
CREATE FUNCTION enforce_supplier_media_binding() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE supplier UUID; execution_state TEXT;
BEGIN
    SELECT b.provider_id,a.execution INTO supplier,execution_state
    FROM attempts a JOIN provider_attempt_offers b ON b.attempt_id=a.id
    WHERE a.id=NEW.attempt_id FOR UPDATE OF a;
    IF supplier IS NULL OR supplier<>NEW.provider_id THEN
        RAISE EXCEPTION 'supplier binding mismatch' USING ERRCODE='23514';
    END IF;
    IF TG_TABLE_NAME='supplier_media_attempt_pricing' THEN
        IF execution_state<>'not_sent' OR EXISTS(SELECT 1 FROM provider_earnings WHERE attempt_id=NEW.attempt_id)
            OR EXISTS(SELECT 1 FROM personal_attempt_routes WHERE attempt_id=NEW.attempt_id) THEN
            RAISE EXCEPTION 'supplier price must precede execution' USING ERRCODE='23514';
        END IF;
    ELSIF (NEW.billing_meter='text_tokens')=EXISTS(SELECT 1 FROM supplier_media_attempt_pricing WHERE attempt_id=NEW.attempt_id) THEN
        RAISE EXCEPTION 'supplier meter mismatch' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER supplier_media_binding BEFORE INSERT ON supplier_media_attempt_pricing
    FOR EACH ROW EXECUTE FUNCTION enforce_supplier_media_binding();
CREATE TRIGGER supplier_earning_meter BEFORE INSERT ON provider_earnings
    FOR EACH ROW EXECUTE FUNCTION enforce_supplier_media_binding();
