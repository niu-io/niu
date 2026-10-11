-- Support stable keyset traversal as the company directory grows.
CREATE INDEX organizations_directory_order ON organizations(created_at,id);
