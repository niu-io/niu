-- PostgreSQL runs same-event triggers in name order. Reject personal billing
-- before commercial qualification or reference validation reports its error.
ALTER TRIGGER reject_personal_customer_tariff ON customer_attempt_tariffs
    RENAME TO a_personal_customer_tariff;
ALTER TRIGGER reject_personal_supplier_offer ON provider_attempt_offers
    RENAME TO a_personal_supplier_offer;
ALTER TRIGGER reject_personal_customer_balance ON customer_attempt_balance_accounts
    RENAME TO a_personal_customer_balance;
