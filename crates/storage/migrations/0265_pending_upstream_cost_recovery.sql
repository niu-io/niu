-- Recovery traverses pending procurement reservations by attempt. Settled and
-- released history must not enlarge this index; no financial row is rewritten.
CREATE INDEX cost_reservations_pending_recovery
    ON cost_reservations (attempt_id)
    WHERE state = 'held';
