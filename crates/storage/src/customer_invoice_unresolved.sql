SELECT EXISTS (
    SELECT 1 FROM attempts a
    LEFT JOIN customer_attempt_tariffs t ON t.attempt_id=a.id
    LEFT JOIN customer_tariff_revisions r ON r.id=t.revision_id
    LEFT JOIN customer_charges c ON c.attempt_id=a.id
    LEFT JOIN customer_media_attempt_pricing m ON m.attempt_id=a.id
    LEFT JOIN customer_media_charges mc ON mc.attempt_id=a.id
    WHERE a.organization_id=$1 AND a.project_id=$2
        AND a.execution<>'confirmed_not_executed'
        AND a.dispatched_at>=to_timestamp($4::double precision/1000)
        AND a.dispatched_at<to_timestamp($5::double precision/1000)
        AND (
            (r.currency=$3 AND c.attempt_id IS NULL)
            OR (m.snapshot->'tariff'->>'currency'=$3 AND (
                mc.attempt_id IS NULL
                -- Reporting, recovery and issuance share the exact original-
                -- account debit/released-reservation predicate.
                OR NOT EXISTS (
                    SELECT 1 FROM customer_activity_charges posted
                    WHERE posted.attempt_id=a.id AND posted.organization_id=$1
                        AND posted.project_id=$2 AND posted.currency=$3
                        AND posted.amount_nanos=mc.amount_nanos
                )
            ))
        )
)
