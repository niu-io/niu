-- Additive groundwork for explicit commercial offer authorization. These
-- records do not change dispatch eligibility until the lifecycle and pinned
-- attempt bindings are migrated together; legacy reviews remain authoritative.
CREATE TABLE provider_offer_authorizations (
    id UUID PRIMARY KEY,
    provider_id UUID NOT NULL,
    offer_id UUID NOT NULL,
    rate_revision UUID NOT NULL,
    actor_kind TEXT NOT NULL CHECK (actor_kind IN ('installation', 'operator')),
    actor_operator_id UUID REFERENCES admin_operators(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CHECK ((actor_kind = 'installation' AND actor_operator_id IS NULL)
        OR (actor_kind = 'operator' AND actor_operator_id IS NOT NULL)),
    FOREIGN KEY (provider_id, offer_id) REFERENCES provider_offers(provider_id, id),
    FOREIGN KEY (offer_id, rate_revision) REFERENCES provider_offer_revisions(offer_id, id),
    UNIQUE (provider_id, offer_id, id)
);

CREATE TABLE provider_offer_authorization_revocations (
    id UUID PRIMARY KEY,
    provider_id UUID NOT NULL,
    offer_id UUID NOT NULL,
    authorization_id UUID NOT NULL,
    actor_kind TEXT NOT NULL CHECK (actor_kind IN ('installation', 'operator')),
    actor_operator_id UUID REFERENCES admin_operators(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CHECK ((actor_kind = 'installation' AND actor_operator_id IS NULL)
        OR (actor_kind = 'operator' AND actor_operator_id IS NOT NULL)),
    FOREIGN KEY (provider_id, offer_id, authorization_id)
        REFERENCES provider_offer_authorizations(provider_id, offer_id, id),
    UNIQUE (authorization_id)
);

CREATE TRIGGER immutable_provider_offer_authorization
    BEFORE UPDATE OR DELETE ON provider_offer_authorizations
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
CREATE TRIGGER immutable_provider_offer_authorization_revocation
    BEFORE UPDATE OR DELETE ON provider_offer_authorization_revocations
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

CREATE TRIGGER registry_writer_provider_offer_authorizations
    BEFORE INSERT OR UPDATE OR DELETE ON provider_offer_authorizations
    FOR EACH STATEMENT EXECUTE FUNCTION niu_require_registry_writer();
CREATE CONSTRAINT TRIGGER registry_publication_provider_offer_authorizations
    AFTER INSERT OR UPDATE OR DELETE ON provider_offer_authorizations
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION niu_require_registry_publication();
CREATE TRIGGER registry_writer_provider_offer_authorization_revocations
    BEFORE INSERT OR UPDATE OR DELETE ON provider_offer_authorization_revocations
    FOR EACH STATEMENT EXECUTE FUNCTION niu_require_registry_writer();
CREATE CONSTRAINT TRIGGER registry_publication_provider_offer_authorization_revocations
    AFTER INSERT OR UPDATE OR DELETE ON provider_offer_authorization_revocations
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION niu_require_registry_publication();
