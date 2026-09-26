ALTER TABLE collector_keys ADD COLUMN purpose TEXT NOT NULL DEFAULT 'quota' CHECK (purpose IN ('quota', 'execution'));
