-- The built-in demo is an ordinary customer identity. A later release restored
-- its implicit platform grant after the original repair; revoke that grant
-- again without changing credentials, sessions, customer scope or other admins.
-- Existing sessions consult the saved operator permissions on every request.
WITH revoked AS (
    UPDATE admin_operators AS operator
    SET platform_admin = false
    FROM member_password_credentials AS credential
    WHERE credential.operator_id = operator.id
      AND credential.email = 'demo@niu.io'
      AND operator.platform_admin
    RETURNING operator.id
)
INSERT INTO platform_admin_events (operator_id, granted, actor_kind)
SELECT id, false, 'database_administrator'
FROM revoked;
