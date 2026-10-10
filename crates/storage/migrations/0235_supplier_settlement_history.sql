-- Keyset payment history is scoped before ordering; no global ledger scan.
CREATE INDEX provider_settlement_history ON provider_settlements(provider_id,created_at DESC,id DESC);
