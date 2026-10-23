-- Configuration updates must follow the unit too, even when currency itself
-- is not included in UPDATE. Historical settlement rows remain untouched.
DROP TRIGGER platform_currency_guard ON customer_balance_accounts;
CREATE TRIGGER platform_currency_guard BEFORE INSERT OR UPDATE ON customer_balance_accounts
FOR EACH ROW EXECUTE FUNCTION niu_require_platform_currency();
DROP TRIGGER platform_currency_guard ON customer_workspace_spending_limits;
CREATE TRIGGER platform_currency_guard BEFORE INSERT OR UPDATE ON customer_workspace_spending_limits
FOR EACH ROW EXECUTE FUNCTION niu_require_platform_currency();
DROP TRIGGER platform_currency_guard ON customer_key_spending_limits;
CREATE TRIGGER platform_currency_guard BEFORE INSERT OR UPDATE ON customer_key_spending_limits
FOR EACH ROW EXECUTE FUNCTION niu_require_platform_currency();
DROP TRIGGER platform_currency_guard ON platform_retail_price_heads;
CREATE TRIGGER platform_currency_guard BEFORE INSERT OR UPDATE ON platform_retail_price_heads
FOR EACH ROW EXECUTE FUNCTION niu_require_platform_currency();
CREATE TRIGGER platform_currency_guard BEFORE INSERT OR UPDATE OF currency,limit_nanos ON project_budgets
FOR EACH ROW EXECUTE FUNCTION niu_require_platform_currency();
