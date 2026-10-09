-- One renewable OAuth registration has one private workspace owner. Sharing it
-- across scopes would race rotating tokens and violate credential isolation.
CREATE UNIQUE INDEX codex_registration_owner ON codex_connections(subject, client_id);
