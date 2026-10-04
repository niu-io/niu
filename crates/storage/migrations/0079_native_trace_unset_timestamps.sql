-- OTLP exporters can leave timeUnixNano at zero while reporting event.timestamp.
-- Older native projections misread that sentinel as 1970. Immutable receipts stay
-- intact; clear only the invalid projection timing and use an explicit receipt basis.
UPDATE personal_agent_traces AS trace
SET record=jsonb_set(record,'{spans}',(
    SELECT jsonb_agg(span || jsonb_build_object(
        'started_at_ms',CASE WHEN span->>'started_at_ms'='0' THEN 'null'::jsonb ELSE span->'started_at_ms' END,
        'ended_at_ms',CASE WHEN span->>'ended_at_ms'='0' THEN 'null'::jsonb ELSE span->'ended_at_ms' END
    ) ORDER BY ordinal)
    FROM jsonb_array_elements(record->'spans') WITH ORDINALITY AS item(span,ordinal)
)),
    occurred_at=CASE WHEN occurred_at=to_timestamp(0) THEN received_at ELSE occurred_at END,
    time_basis=CASE WHEN occurred_at=to_timestamp(0) THEN 'received' ELSE time_basis END,
    duration_ms=CASE WHEN occurred_at=to_timestamp(0) THEN NULL ELSE duration_ms END
WHERE source='codex' AND session_key IS NOT NULL AND EXISTS(
    SELECT 1 FROM jsonb_array_elements(record->'spans') span
    WHERE span->>'started_at_ms'='0' OR span->>'ended_at_ms'='0'
);
