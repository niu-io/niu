-- The gateway retry deadline is a single static timestamp on the operation.
-- `Store::mark_dispatched` already holds the attempt row lock and can reject the
-- same condition in Rust before the dispatch UPDATE; keeping a second PL/pgSQL
-- trigger only split the rule across languages. Other writers that move an
-- attempt to `may_have_executed` are test fixtures, not product paths.
DROP TRIGGER IF EXISTS require_gateway_retry_deadline ON attempts;
DROP FUNCTION IF EXISTS require_gateway_retry_deadline();
