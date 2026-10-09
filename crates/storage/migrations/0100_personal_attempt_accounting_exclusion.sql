-- Serialize commercial accounting bindings against personal-route assignment.
-- Personal upstream bills are paid by the credential owner, not Niu balances.
CREATE FUNCTION reject_personal_attempt_accounting() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    PERFORM id FROM attempts WHERE id=NEW.attempt_id FOR UPDATE;
    IF EXISTS (SELECT 1 FROM personal_attempt_routes WHERE attempt_id=NEW.attempt_id) THEN
        RAISE EXCEPTION 'personal attempts cannot receive commercial accounting'
            USING ERRCODE='P0008';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER reject_personal_customer_tariff BEFORE INSERT ON customer_attempt_tariffs
    FOR EACH ROW EXECUTE FUNCTION reject_personal_attempt_accounting();
CREATE TRIGGER reject_personal_supplier_offer BEFORE INSERT ON provider_attempt_offers
    FOR EACH ROW EXECUTE FUNCTION reject_personal_attempt_accounting();
CREATE TRIGGER reject_personal_customer_balance BEFORE INSERT ON customer_attempt_balance_accounts
    FOR EACH ROW EXECUTE FUNCTION reject_personal_attempt_accounting();
