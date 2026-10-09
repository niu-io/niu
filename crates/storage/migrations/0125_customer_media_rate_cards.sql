-- Customer selling schedules only; procurement terms have separate ownership.
CREATE TABLE customer_media_rate_cards (
    organization_id UUID NOT NULL REFERENCES organizations(id),
    revision TEXT NOT NULL CHECK (length(revision) BETWEEN 1 AND 256),
    vendor_id UUID NOT NULL REFERENCES vendors(id),
    model_alias TEXT NOT NULL,
    channel TEXT NOT NULL,
    resolution TEXT NOT NULL,
    reference_video BOOLEAN NOT NULL,
    effective_from BIGINT NOT NULL,
    effective_until BIGINT,
    document JSONB NOT NULL CHECK (
        jsonb_typeof(document)='object' AND octet_length(document::text)<=131072
    ),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (organization_id,revision),
    CHECK (effective_until IS NULL OR effective_until>effective_from)
);
CREATE INDEX customer_media_rate_selection ON customer_media_rate_cards
    (organization_id,model_alias,channel,resolution,reference_video,effective_from);
CREATE INDEX customer_media_rate_vendor ON customer_media_rate_cards(vendor_id);
CREATE TRIGGER immutable_customer_media_rate_cards
    BEFORE UPDATE OR DELETE ON customer_media_rate_cards
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
