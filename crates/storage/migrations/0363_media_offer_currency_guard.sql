-- Media offer revisions identify qualified supply; their prices live in
-- supplier_media_rate_cards. The existing shape constraint requires their
-- currency and text rates to be NULL. Guard only monetary text revisions here;
-- the separate media rate-card guard continues to enforce platform currency.
DROP TRIGGER platform_currency_guard ON provider_offer_revisions;
CREATE TRIGGER platform_currency_guard
BEFORE INSERT OR UPDATE OF currency ON provider_offer_revisions
FOR EACH ROW WHEN (NEW.rate_kind = 'text')
EXECUTE FUNCTION niu_require_platform_currency();
