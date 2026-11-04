-- Preserve the old review binding while preparing a distinct, exact-revision
-- authorization binding. These nullable fields alone grant no eligibility.
ALTER TABLE provider_offer_authorizations
    ADD CONSTRAINT provider_offer_authorization_revision_identity
    UNIQUE (provider_id, offer_id, id, rate_revision);

ALTER TABLE provider_offers ADD COLUMN current_authorization UUID;
ALTER TABLE provider_offers ADD CONSTRAINT provider_offer_authorization_identity
    FOREIGN KEY (provider_id, id, current_authorization, current_revision)
    REFERENCES provider_offer_authorizations(provider_id, offer_id, id, rate_revision);
ALTER TABLE provider_offers ADD CONSTRAINT provider_offer_authorization_selection
    CHECK (current_authorization IS NULL OR
        (current_revision IS NOT NULL AND current_qualification_review IS NULL));

ALTER TABLE provider_attempt_offers ADD COLUMN authorization_id UUID;
ALTER TABLE provider_attempt_offers ADD CONSTRAINT provider_attempt_authorization_identity
    FOREIGN KEY (provider_id, offer_id, authorization_id, revision_id)
    REFERENCES provider_offer_authorizations(provider_id, offer_id, id, rate_revision);
ALTER TABLE provider_attempt_offers ADD CONSTRAINT provider_attempt_authorization_selection
    CHECK (authorization_id IS NULL OR qualification_review_id IS NULL);
