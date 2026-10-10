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
                -- Known media overrun may await funding. Do not issue a
                -- receivable that recovery could subsequently debit again.
                OR (mc.amount_nanos>0 AND NOT EXISTS (
                    SELECT 1 FROM customer_balance_entries d
                    JOIN customer_attempt_balance_accounts b
                        ON b.attempt_id=d.attempt_id AND b.account_id=d.account_id
                    WHERE d.attempt_id=a.id AND d.kind='charge'
                        AND d.organization_id=$1 AND d.project_id=$2
                        AND d.currency=$3 AND d.amount_nanos=-mc.amount_nanos
                ))
            ))
        )
)
