-- Trigger checks run after policy coordination locks. Rejection metadata must
-- read the same current state, not a snapshot from before lock acquisition.
ALTER FUNCTION niu_guardrail_rejection_detail(UUID,UUID,UUID,TEXT) VOLATILE;
