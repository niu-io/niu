-- Negative corrections reduce an original monetary obligation; they do not
-- issue spendable money. Keep recovery of historical records available while
-- blocking new monetary issuance in Credits mode.
DROP TRIGGER require_customer_money_funding_mode ON customer_balance_entries;
CREATE TRIGGER require_customer_money_funding_mode BEFORE INSERT ON customer_balance_entries
    FOR EACH ROW WHEN (NEW.kind='funding' OR (NEW.kind='adjustment' AND NEW.amount_nanos>0))
    EXECUTE FUNCTION require_customer_issuance_mode('currency');
