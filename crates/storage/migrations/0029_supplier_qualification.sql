-- Offers are not eligible for dispatch until both the Supplier and the exact
-- model/rate revision have current, installation-reviewed evidence.
ALTER TABLE provider_offers ALTER COLUMN active SET DEFAULT FALSE;
UPDATE provider_offers SET active = FALSE;

CREATE TABLE provider_qualification_reviews (
    id UUID PRIMARY KEY,
    provider_id UUID NOT NULL REFERENCES provider_businesses(id),
    supply_rights_sha256 TEXT NOT NULL CHECK (supply_rights_sha256 ~ '^[0-9a-f]{64}$'),
    supply_capability_sha256 TEXT NOT NULL CHECK (supply_capability_sha256 ~ '^[0-9a-f]{64}$'),
    data_handling_sha256 TEXT NOT NULL CHECK (data_handling_sha256 ~ '^[0-9a-f]{64}$'),
    reviewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    valid_until TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    reviewer_operator_id UUID REFERENCES admin_operators(id),
    UNIQUE (provider_id, id),
    CHECK (valid_until > reviewed_at),
    CHECK (revoked_at IS NULL OR revoked_at >= reviewed_at)
);

CREATE TABLE provider_offer_qualification_reviews (
    id UUID PRIMARY KEY,
    provider_id UUID NOT NULL,
    offer_id UUID NOT NULL,
    rate_revision UUID NOT NULL,
    model_identity_sha256 TEXT NOT NULL CHECK (model_identity_sha256 ~ '^[0-9a-f]{64}$'),
    protocol_matrix_sha256 TEXT NOT NULL CHECK (protocol_matrix_sha256 ~ '^[0-9a-f]{64}$'),
    protocol_matrix_version TEXT NOT NULL CHECK (length(trim(protocol_matrix_version)) BETWEEN 1 AND 100),
    data_handling_sha256 TEXT NOT NULL CHECK (data_handling_sha256 ~ '^[0-9a-f]{64}$'),
    availability_sha256 TEXT NOT NULL CHECK (availability_sha256 ~ '^[0-9a-f]{64}$'),
    agreed_rates_sha256 TEXT NOT NULL CHECK (agreed_rates_sha256 ~ '^[0-9a-f]{64}$'),
    reviewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    valid_until TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    reviewer_operator_id UUID REFERENCES admin_operators(id),
    FOREIGN KEY (provider_id, offer_id) REFERENCES provider_offers(provider_id, id),
    FOREIGN KEY (offer_id, rate_revision) REFERENCES provider_offer_revisions(offer_id, id),
    CHECK (valid_until > reviewed_at),
    CHECK (revoked_at IS NULL OR revoked_at >= reviewed_at)
);

CREATE INDEX provider_qualification_current
    ON provider_qualification_reviews(provider_id, valid_until DESC)
    WHERE revoked_at IS NULL;
CREATE INDEX provider_offer_qualification_current
    ON provider_offer_qualification_reviews(offer_id, rate_revision, valid_until DESC)
    WHERE revoked_at IS NULL;

CREATE FUNCTION niu_supplier_qualification_current(p_provider UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE AS $$
    SELECT EXISTS (
        SELECT 1 FROM provider_qualification_reviews q
         WHERE q.provider_id = p_provider
           AND q.revoked_at IS NULL
           AND q.valid_until > now()
    )
$$;

CREATE FUNCTION niu_offer_qualification_current(
    p_provider UUID, p_offer UUID, p_revision UUID
)
RETURNS BOOLEAN LANGUAGE SQL STABLE AS $$
    SELECT niu_supplier_qualification_current(p_provider)
       AND EXISTS (
        SELECT 1 FROM provider_offer_qualification_reviews q
         WHERE q.provider_id = p_provider
           AND q.offer_id = p_offer
           AND q.rate_revision = p_revision
           AND q.revoked_at IS NULL
           AND q.valid_until > now()
    )
$$;

CREATE FUNCTION niu_guard_provider_offer_activation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.active AND NOT niu_offer_qualification_current(
        NEW.provider_id, NEW.id, NEW.current_revision
    ) THEN
        RAISE EXCEPTION 'supplier offer lacks current qualification evidence'
            USING ERRCODE = 'P0007';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER provider_offer_activation_requires_qualification
    BEFORE INSERT OR UPDATE OF active, current_revision
    ON provider_offers FOR EACH ROW
    EXECUTE FUNCTION niu_guard_provider_offer_activation();

CREATE FUNCTION niu_guard_provider_offer_binding() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NOT niu_offer_qualification_current(
        NEW.provider_id, NEW.offer_id, NEW.revision_id
    ) THEN
        RAISE EXCEPTION 'supplier offer lacks current qualification evidence'
            USING ERRCODE = 'P0007';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER provider_offer_binding_requires_qualification
    BEFORE INSERT ON provider_attempt_offers FOR EACH ROW
    EXECUTE FUNCTION niu_guard_provider_offer_binding();

CREATE FUNCTION niu_guard_qualified_supplier_dispatch() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.execution = 'not_sent'
       AND NEW.execution = 'may_have_executed'
       AND EXISTS (
           SELECT 1 FROM provider_attempt_offers b
            WHERE b.attempt_id = NEW.id
              AND NOT niu_offer_qualification_current(
                  b.provider_id, b.offer_id, b.revision_id
              )
       ) THEN
        RAISE EXCEPTION 'supplier offer qualification expired before dispatch'
            USING ERRCODE = 'P0007';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER attempts_require_current_supplier_qualification
    BEFORE UPDATE OF execution ON attempts FOR EACH ROW
    EXECUTE FUNCTION niu_guard_qualified_supplier_dispatch();

CREATE TRIGGER immutable_provider_qualification_review
    BEFORE UPDATE OR DELETE ON provider_qualification_reviews
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
CREATE TRIGGER immutable_provider_offer_qualification_review
    BEFORE UPDATE OR DELETE ON provider_offer_qualification_reviews
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
