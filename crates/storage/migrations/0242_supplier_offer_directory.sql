-- Scope and canonical alias order for bounded current-offer traversal.
CREATE INDEX provider_offers_supplier_alias ON provider_offers(provider_id,model_alias);
