-- Bound recent usage and latest-use lookups to each key's dispatched history.
CREATE INDEX attempts_key_dispatch_window ON attempts(api_key_id,dispatched_at DESC)
    WHERE dispatched_at IS NOT NULL;
