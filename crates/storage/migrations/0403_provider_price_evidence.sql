-- Advertised quote evidence only. Never a customer tariff, balance or posted charge.
CREATE TABLE provider_price_evidence (
    revision BIGSERIAL PRIMARY KEY,
    provider_id UUID NOT NULL REFERENCES provider_businesses(id),
    adapter TEXT NOT NULL,
    integration_revision BIGINT NOT NULL,
    evidence JSONB NOT NULL CHECK (jsonb_typeof(evidence)='object'),
    captured_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX provider_price_evidence_lookup ON provider_price_evidence(provider_id,revision DESC);
CREATE TRIGGER immutable_provider_price_evidence
    BEFORE UPDATE OR DELETE ON provider_price_evidence
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
