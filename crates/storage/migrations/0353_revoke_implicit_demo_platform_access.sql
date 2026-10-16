-- Demo sign-in is customer-scoped. Repair only the built-in account's implicit
-- platform grant; retain its password, company membership and existing sessions.
-- The schema owner records the revocation without inventing a member login.
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
