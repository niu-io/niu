-- Unknown values may be filled by later evidence; known values never change.
-- The conflict row lock serializes complementary observations. Validate their
-- merged input partition as well as each individual incoming observation.
INSERT INTO request_token_categories AS saved
    (attempt_id,cached_input_tokens,reasoning_output_tokens,cache_write_input_tokens)
SELECT a.id,$4,$5,$6
FROM attempts a
WHERE a.id=$1 AND a.organization_id=$2 AND a.project_id=$3
  AND a.execution='confirmed_completed'
  AND a.prompt_tokens IS NOT NULL AND a.completion_tokens IS NOT NULL
  AND ($4::bigint IS NULL OR $4 <= a.prompt_tokens)
  AND ($5::bigint IS NULL OR $5 <= a.completion_tokens)
  AND ($6::bigint IS NULL OR $6 <= a.prompt_tokens - COALESCE($4::bigint,0))
ON CONFLICT (attempt_id) DO UPDATE SET
    cached_input_tokens=COALESCE(saved.cached_input_tokens,EXCLUDED.cached_input_tokens),
    reasoning_output_tokens=COALESCE(saved.reasoning_output_tokens,EXCLUDED.reasoning_output_tokens),
    cache_write_input_tokens=COALESCE(saved.cache_write_input_tokens,EXCLUDED.cache_write_input_tokens)
WHERE (saved.cached_input_tokens IS NULL OR EXCLUDED.cached_input_tokens IS NULL
       OR saved.cached_input_tokens=EXCLUDED.cached_input_tokens)
  AND (saved.reasoning_output_tokens IS NULL OR EXCLUDED.reasoning_output_tokens IS NULL
       OR saved.reasoning_output_tokens=EXCLUDED.reasoning_output_tokens)
  AND (saved.cache_write_input_tokens IS NULL OR EXCLUDED.cache_write_input_tokens IS NULL
       OR saved.cache_write_input_tokens=EXCLUDED.cache_write_input_tokens)
  AND COALESCE(saved.cache_write_input_tokens,EXCLUDED.cache_write_input_tokens,0)
      <= (SELECT a.prompt_tokens FROM attempts a WHERE a.id=EXCLUDED.attempt_id)
         - COALESCE(saved.cached_input_tokens,EXCLUDED.cached_input_tokens,0)
