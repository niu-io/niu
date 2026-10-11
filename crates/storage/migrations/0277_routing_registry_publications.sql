-- Server-only immutable routing publications. Never store API key material here.
CREATE TABLE routing_registry_generations (
    generation BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    static_identity TEXT NOT NULL CHECK(length(static_identity)=64),
    compiled JSONB NOT NULL CHECK(jsonb_typeof(compiled)='object'),
    source_transaction TEXT NOT NULL DEFAULT pg_current_xact_id()::text,
    published_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE TRIGGER immutable_routing_registry_generations
    BEFORE UPDATE OR DELETE ON routing_registry_generations
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
CREATE TABLE routing_registry_active (
    singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK(singleton),
    generation BIGINT NOT NULL REFERENCES routing_registry_generations(generation)
);

-- Serialization precedes domain row locks, including an older process's writes.
-- Ciphertext-only offline re-encryption is not a configuration revision change.
CREATE FUNCTION niu_require_registry_writer() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    PERFORM pg_advisory_xact_lock(716554);
    IF EXISTS(SELECT 1 FROM routing_registry_active)
       AND current_setting('niu.registry_writer',true) IS DISTINCT FROM 'v1' THEN
        RAISE EXCEPTION 'Routing publication writer required' USING ERRCODE='P0029';
    END IF;
    PERFORM set_config('niu.registry_dirty','1',true);
    RETURN NULL;
END;
$$;
CREATE FUNCTION niu_require_registry_publication() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF EXISTS(SELECT 1 FROM routing_registry_active) AND (
        current_setting('niu.registry_dirty',true) IS DISTINCT FROM '0'
        OR NOT EXISTS(
            SELECT 1 FROM routing_registry_active a
            JOIN routing_registry_generations g ON g.generation=a.generation
            WHERE g.source_transaction=pg_current_xact_id()::text
        )
    ) THEN
        RAISE EXCEPTION 'Routing configuration was not published' USING ERRCODE='P0029';
    END IF;
    RETURN NULL;
END;
$$;
CREATE TRIGGER registry_writer_vendor_models BEFORE INSERT OR UPDATE OR DELETE ON vendor_models
    FOR EACH STATEMENT EXECUTE FUNCTION niu_require_registry_writer();
CREATE CONSTRAINT TRIGGER registry_publication_vendor_models AFTER INSERT OR UPDATE OR DELETE ON vendor_models
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION niu_require_registry_publication();
CREATE TRIGGER registry_writer_model_route_pools BEFORE INSERT OR UPDATE OR DELETE ON model_route_pools
    FOR EACH STATEMENT EXECUTE FUNCTION niu_require_registry_writer();
CREATE CONSTRAINT TRIGGER registry_publication_model_route_pools AFTER INSERT OR UPDATE OR DELETE ON model_route_pools
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION niu_require_registry_publication();
CREATE TRIGGER registry_writer_personal_vendor_ownership BEFORE INSERT OR UPDATE OR DELETE ON personal_vendor_ownership
    FOR EACH STATEMENT EXECUTE FUNCTION niu_require_registry_writer();
CREATE CONSTRAINT TRIGGER registry_publication_personal_vendor_ownership AFTER INSERT OR UPDATE OR DELETE ON personal_vendor_ownership
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION niu_require_registry_publication();
CREATE TRIGGER registry_writer_vendor_supplier_ownership BEFORE INSERT OR UPDATE OR DELETE ON vendor_supplier_ownership
    FOR EACH STATEMENT EXECUTE FUNCTION niu_require_registry_writer();
CREATE CONSTRAINT TRIGGER registry_publication_vendor_supplier_ownership AFTER INSERT OR UPDATE OR DELETE ON vendor_supplier_ownership
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION niu_require_registry_publication();
CREATE TRIGGER registry_writer_provider_offers BEFORE INSERT OR UPDATE OR DELETE ON provider_offers
    FOR EACH STATEMENT EXECUTE FUNCTION niu_require_registry_writer();
CREATE CONSTRAINT TRIGGER registry_publication_provider_offers AFTER INSERT OR UPDATE OR DELETE ON provider_offers
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION niu_require_registry_publication();
CREATE TRIGGER registry_writer_provider_qualification_reviews BEFORE INSERT OR UPDATE OR DELETE ON provider_qualification_reviews
    FOR EACH STATEMENT EXECUTE FUNCTION niu_require_registry_writer();
CREATE CONSTRAINT TRIGGER registry_publication_provider_qualification_reviews AFTER INSERT OR UPDATE OR DELETE ON provider_qualification_reviews
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION niu_require_registry_publication();
CREATE TRIGGER registry_writer_provider_qualification_revocations BEFORE INSERT OR UPDATE OR DELETE ON provider_qualification_revocations
    FOR EACH STATEMENT EXECUTE FUNCTION niu_require_registry_writer();
CREATE CONSTRAINT TRIGGER registry_publication_provider_qualification_revocations AFTER INSERT OR UPDATE OR DELETE ON provider_qualification_revocations
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION niu_require_registry_publication();
CREATE TRIGGER registry_writer_provider_offer_qualification_reviews BEFORE INSERT OR UPDATE OR DELETE ON provider_offer_qualification_reviews
    FOR EACH STATEMENT EXECUTE FUNCTION niu_require_registry_writer();
CREATE CONSTRAINT TRIGGER registry_publication_provider_offer_qualification_reviews AFTER INSERT OR UPDATE OR DELETE ON provider_offer_qualification_reviews
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION niu_require_registry_publication();
CREATE TRIGGER registry_writer_vendors BEFORE INSERT OR DELETE OR UPDATE OF name,adapter,api_base,enabled,revision,bootstrap_name ON vendors
    FOR EACH STATEMENT EXECUTE FUNCTION niu_require_registry_writer();
CREATE CONSTRAINT TRIGGER registry_publication_vendors AFTER INSERT OR DELETE OR UPDATE OF name,adapter,api_base,enabled,revision,bootstrap_name ON vendors
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION niu_require_registry_publication();
CREATE TRIGGER registry_writer_supplier_review BEFORE UPDATE OF current_qualification_review ON provider_businesses
    FOR EACH STATEMENT EXECUTE FUNCTION niu_require_registry_writer();
CREATE CONSTRAINT TRIGGER registry_publication_supplier_review AFTER UPDATE OF current_qualification_review ON provider_businesses
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION niu_require_registry_publication();

-- Historical attempts remain explicitly unattributed; never infer from current state.
CREATE TABLE attempt_route_generations (
    attempt_id UUID PRIMARY KEY REFERENCES attempts(id) DEFERRABLE INITIALLY DEFERRED,
    generation BIGINT NOT NULL REFERENCES routing_registry_generations(generation)
);
CREATE INDEX attempt_route_generations_by_generation ON attempt_route_generations(generation);
CREATE TRIGGER immutable_attempt_route_generations BEFORE UPDATE OR DELETE ON attempt_route_generations
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
