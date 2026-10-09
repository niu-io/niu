CREATE TABLE member_preferences (
    operator_id uuid PRIMARY KEY REFERENCES admin_operators(id) ON DELETE CASCADE,
    color_mode text NOT NULL DEFAULT 'system' CHECK (color_mode IN ('system', 'light', 'dark')),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
