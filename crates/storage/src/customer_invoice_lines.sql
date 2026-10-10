SELECT jsonb_build_object(
    'model_alias',t.model_alias,
    'revision',r.id,
    'context_minimum_input_tokens',c.context_minimum_input_tokens::text,
    'prompt_rate',CASE WHEN c.context_minimum_input_tokens IS NULL THEN r.prompt_rate::text ELSE tier.value->>'prompt_rate' END,
    'completion_rate',CASE WHEN c.context_minimum_input_tokens IS NULL THEN r.completion_rate::text ELSE tier.value->>'completion_rate' END,
    'cached_prompt_rate',CASE WHEN c.context_minimum_input_tokens IS NULL THEN r.cached_prompt_rate::text ELSE tier.value->>'cached_prompt_rate' END,
    'reasoning_completion_rate',CASE WHEN c.context_minimum_input_tokens IS NULL THEN r.reasoning_completion_rate::text ELSE tier.value->>'reasoning_completion_rate' END,
    'cache_write_prompt_rate',CASE WHEN c.context_minimum_input_tokens IS NULL THEN r.cache_write_prompt_rate::text ELSE tier.value->>'cache_write_prompt_rate' END,
    'minimum_charge_nanos',r.minimum_charge_nanos::text,
    'request_fee_nanos',r.request_fee_nanos::text,
    'currency',c.currency,
    'requests',COUNT(*)::text,
    'prompt_tokens',SUM(c.prompt_tokens)::text,
    'completion_tokens',SUM(c.completion_tokens)::text,
    'cached_prompt_tokens',SUM(c.cached_prompt_tokens)::text,
    'reasoning_completion_tokens',SUM(c.reasoning_completion_tokens)::text,
    'cache_write_prompt_tokens',SUM(c.cache_write_prompt_tokens)::text,
    'amount_nanos',SUM(c.amount_nanos)::text
)
FROM customer_invoice_entries e
JOIN customer_charges c ON c.attempt_id=e.attempt_id
JOIN customer_tariff_revisions r ON r.id=c.revision_id
JOIN customer_tariffs t ON t.id=r.tariff_id
LEFT JOIN LATERAL (
    SELECT value FROM jsonb_array_elements(r.context_tiers)
    WHERE (value->>'minimum_input_tokens')::bigint=c.context_minimum_input_tokens
) tier ON TRUE
WHERE e.organization_id=$1 AND e.project_id=$2 AND e.invoice_id=$3
GROUP BY t.model_alias,r.id,c.currency,c.context_minimum_input_tokens,tier.value
ORDER BY t.model_alias,r.id,c.context_minimum_input_tokens NULLS FIRST
