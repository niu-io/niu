-- Customer video uses a separate immutable pricing snapshot. It must pin the
-- same operation funding source as customer text, including historical attempts.
-- Hold inserts until both the backfill and future-write trigger are installed.
LOCK TABLE customer_media_attempt_pricing IN SHARE ROW EXCLUSIVE MODE;

INSERT INTO operation_funding_sources(operation_id, funding_source)
SELECT DISTINCT a.operation_id, 'customer'
FROM customer_media_attempt_pricing p JOIN attempts a ON a.id=p.attempt_id
ON CONFLICT(operation_id) DO NOTHING;

-- Never silently adopt a historical operation that also used personal funding.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM customer_media_attempt_pricing p
        JOIN attempts a ON a.id=p.attempt_id
        JOIN operation_funding_sources f ON f.operation_id=a.operation_id
        WHERE f.funding_source <> 'customer'
    ) THEN
        RAISE EXCEPTION 'Historical media operation has conflicting funding sources'
            USING ERRCODE='23514';
    END IF;
END;
$$;

CREATE TRIGGER bind_customer_media_operation_funding
BEFORE INSERT ON customer_media_attempt_pricing
FOR EACH ROW EXECUTE FUNCTION bind_operation_funding_source('customer');
