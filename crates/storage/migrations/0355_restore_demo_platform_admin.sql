-- Restore platform_admin access for the built-in demo@niu.io account so
-- platform administration (including Providers management) is accessible.
WITH granted AS (
    UPDATE admin_operators AS operator
    SET platform_admin = true
    FROM member_password_credentials AS credential
    WHERE credential.operator_id = operator.id
      AND credential.email = 'demo@niu.io'
      AND NOT operator.platform_admin
    RETURNING operator.id
)
INSERT INTO platform_admin_events (operator_id, granted, actor_kind)
SELECT id, true, 'database_administrator'
FROM granted;
