-- Keep the released 0333 migration immutable. Apply the diagnostic context
-- and same-statement visibility correction to both upgrades and fresh installs.

CREATE OR REPLACE FUNCTION niu_guardrail_rejection_detail(org UUID, workspace UUID, key UUID, reason TEXT)
RETURNS TEXT LANGUAGE sql VOLATILE AS $$
    SELECT jsonb_build_object(
        'reason', reason,
        'organization_id', org,
        'project_id', workspace,
        'key_id', key,
        'workspace_revision', (
            SELECT NULLIF(revision, 0)
            FROM workspace_guardrail_heads
            WHERE organization_id = org AND project_id = workspace
        ),
        'key_policy_revision', a.policy_revision,
        'key_assignment_revision', a.assignment_revision
    )::text
    FROM (SELECT 1) AS one_row
    LEFT JOIN key_guardrail_assignments a
      ON a.organization_id = org AND a.project_id = workspace AND a.key_id = key;
$$;

