-- Commitment checks must observe current reservations within the transaction.
-- Preserve the checksum of the already-applied spending-limit migration.
ALTER FUNCTION niu_customer_workspace_committed(UUID, UUID, UUID) VOLATILE;
