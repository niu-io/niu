-- Token budget admission shared across gateway instances and key rotations.
CREATE TABLE key_token_rate_limits (
    organization_id UUID NOT NULL, project_id UUID NOT NULL, spending_root_id UUID NOT NULL,
    tokens_per_minute BIGINT CHECK(tokens_per_minute BETWEEN 0 AND 1000000000000),
    revision BIGINT NOT NULL CHECK(revision > 0),
    UNIQUE(spending_root_id),
    PRIMARY KEY(organization_id,project_id,spending_root_id),
    FOREIGN KEY(organization_id,project_id,spending_root_id) REFERENCES api_keys(organization_id,project_id,id)
);
CREATE TABLE key_token_rate_history (
    organization_id UUID NOT NULL, project_id UUID NOT NULL, spending_root_id UUID NOT NULL,
    revision BIGINT NOT NULL, tokens_per_minute BIGINT,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    actor_kind TEXT NOT NULL CHECK(actor_kind IN ('installation','member')),
    actor_name TEXT NOT NULL, actor_operator_id UUID REFERENCES admin_operators(id),
    PRIMARY KEY(organization_id,project_id,spending_root_id,revision),
    FOREIGN KEY(organization_id,project_id,spending_root_id) REFERENCES key_token_rate_limits(organization_id,project_id,spending_root_id),
    CHECK((actor_kind='installation' AND actor_operator_id IS NULL) OR (actor_kind='member' AND actor_operator_id IS NOT NULL))
);
CREATE TRIGGER immutable_key_token_rate_history BEFORE UPDATE OR DELETE ON key_token_rate_history
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();


CREATE TABLE key_attempt_token_bounds (
    attempt_id UUID PRIMARY KEY REFERENCES attempts(id) DEFERRABLE INITIALLY DEFERRED,
    token_bound BIGINT NOT NULL CHECK(token_bound>0),
    estimator TEXT NOT NULL CHECK(estimator='serialized-utf8-plus-output-v1')
);
CREATE TRIGGER immutable_key_attempt_token_bounds BEFORE UPDATE OR DELETE ON key_attempt_token_bounds
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
CREATE FUNCTION niu_enforce_key_token_rate() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE root UUID; maximum BIGINT; requested BIGINT; committed NUMERIC; unbounded BIGINT;
BEGIN
    IF NEW.dispatched_at IS NULL OR (TG_OP='UPDATE' AND OLD.dispatched_at IS NOT NULL) THEN RETURN NEW; END IF;
    SELECT spending_root_id INTO root FROM api_keys WHERE id=NEW.api_key_id;
    IF root IS NULL THEN RETURN NEW; END IF;
    SELECT tokens_per_minute INTO maximum FROM key_token_rate_limits WHERE spending_root_id=root FOR UPDATE;
    IF NOT FOUND OR maximum IS NULL THEN RETURN NEW; END IF;
    IF maximum=0 THEN RAISE EXCEPTION 'API key token rate exhausted' USING ERRCODE='P0022'; END IF;
    SELECT token_bound INTO requested FROM key_attempt_token_bounds WHERE attempt_id=NEW.id;
    IF requested IS NULL THEN RAISE EXCEPTION 'Token budget requires supported bounded text input' USING ERRCODE='P0023'; END IF;
    SELECT COALESCE(sum(CASE WHEN a.execution='confirmed_completed' AND a.usage_confidence='provider_reported' AND a.prompt_tokens IS NOT NULL AND a.completion_tokens IS NOT NULL THEN a.prompt_tokens::numeric+a.completion_tokens ELSE b.token_bound::numeric END),0),
        count(*) FILTER(WHERE b.token_bound IS NULL AND NOT(a.execution='confirmed_completed' AND a.usage_confidence='provider_reported' AND a.prompt_tokens IS NOT NULL AND a.completion_tokens IS NOT NULL))
        INTO committed,unbounded
        FROM attempts a JOIN api_keys k ON k.id=a.api_key_id LEFT JOIN key_attempt_token_bounds b ON b.attempt_id=a.id
        WHERE k.spending_root_id=root AND a.id<>NEW.id AND a.dispatched_at IS NOT NULL
        AND a.execution<>'confirmed_not_executed'
        AND (a.execution<>'confirmed_completed' OR a.usage_confidence IS DISTINCT FROM 'provider_reported' OR a.prompt_tokens IS NULL OR a.completion_tokens IS NULL OR a.completed_at>clock_timestamp()-interval '60 seconds');
    IF unbounded>0 THEN RAISE EXCEPTION 'Existing unknown usage has no token budget' USING ERRCODE='P0023'; END IF;
    IF committed+requested>maximum THEN RAISE EXCEPTION 'API key token rate exhausted' USING ERRCODE='P0022'; END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER enforce_key_token_rate AFTER INSERT OR UPDATE OF dispatched_at ON attempts
    FOR EACH ROW EXECUTE FUNCTION niu_enforce_key_token_rate();
