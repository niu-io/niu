-- Historical pages follow immutable record creation and identity, never mutable status.
CREATE INDEX generations_video_history ON attempts(organization_id,project_id,created_at DESC,id DESC) WHERE dispatched_at IS NOT NULL;
CREATE INDEX generations_output_history ON media_result_references(organization_id,project_id,created_at DESC,attempt_id DESC,kind DESC);
