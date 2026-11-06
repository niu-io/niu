-- Custom model policies are soft-deleted so immutable history and historical
-- routing selections keep a valid parent row. Named slugs stay reserved.
ALTER TABLE workspace_model_pools ADD COLUMN deleted_at TIMESTAMPTZ;
