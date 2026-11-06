-- Polling scans enabled subscriptions ordered by checked_at; the partial index
-- keeps due-work discovery from sweeping disabled/malformed rows.
CREATE INDEX workspace_event_subscriptions_due_idx
    ON workspace_event_subscriptions (checked_at, id)
    WHERE configuration->>'enabled' = 'true';
