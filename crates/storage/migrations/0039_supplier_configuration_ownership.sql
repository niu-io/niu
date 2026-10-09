-- Explicit ownership; never infer a Supplier business from an adapter/name.
CREATE TABLE vendor_supplier_ownership (
    vendor_id UUID PRIMARY KEY REFERENCES vendors(id),
    provider_id UUID NOT NULL REFERENCES provider_businesses(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX vendor_supplier_ownership_provider ON vendor_supplier_ownership(provider_id);
