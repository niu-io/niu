-- Bounded encrypted-source retention maintenance; provenance stays immutable.
CREATE INDEX inspected_image_sources_expiry ON inspected_image_sources(expires_at,id);
