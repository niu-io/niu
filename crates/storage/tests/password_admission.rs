use niu_storage::{MIGRATOR, Store};
use sqlx::PgPool;

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn password_admission_coordinates_replicas_and_bounds_unknown_identities(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    let barrier = std::sync::Arc::new(tokio::sync::Barrier::new(16));
    let mut tasks = tokio::task::JoinSet::new();
    for index in 0..16 {
        let replica = Store::from_pool(pool.clone());
        let barrier = barrier.clone();
        tasks.spawn(async move {
            barrier.wait().await;
            replica
                .admit_member_password_login(if index % 2 == 0 {
                    "Member@Example.test"
                } else {
                    "member@example.test"
                })
                .await
                .unwrap()
        });
    }
    let mut admitted = 0;
    while let Some(result) = tasks.join_next().await {
        admitted += usize::from(result.unwrap());
    }
    assert_eq!(admitted, 5);
    assert!(
        !Store::from_pool(pool.clone())
            .admit_member_password_login("member@example.test")
            .await
            .unwrap()
    );
    let global: i32 =
        sqlx::query_scalar("SELECT attempts FROM password_login_admission WHERE kind='global'")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(global, 17);
    assert_eq!(
        sqlx::query_scalar::<_, i64>(
            "SELECT count(*) FROM password_login_admission WHERE kind='identity'"
        )
        .fetch_one(&pool)
        .await
        .unwrap(),
        1
    );
    sqlx::query("UPDATE password_login_admission SET window_start=now()-interval '2 minutes'")
        .execute(&pool)
        .await
        .unwrap();
    assert!(
        store
            .admit_member_password_login("member@example.test")
            .await
            .unwrap()
    );
    for index in 0..119 {
        assert!(
            store
                .admit_member_password_login(&format!("unknown-{index}@example.test"))
                .await
                .unwrap()
        );
    }
    assert!(
        !store
            .admit_member_password_login("next-unknown@example.test")
            .await
            .unwrap()
    );
    assert_eq!(
        sqlx::query_scalar::<_, i64>(
            "SELECT count(*) FROM password_login_admission WHERE kind='identity'"
        )
        .fetch_one(&pool)
        .await
        .unwrap(),
        120
    );
    assert_eq!(
        sqlx::query_scalar::<_, i32>(
            "SELECT attempts FROM password_login_admission WHERE kind='global'"
        )
        .fetch_one(&pool)
        .await
        .unwrap(),
        120
    );
    assert!(
        !store
            .admit_member_password_login("not an email")
            .await
            .unwrap()
    );
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn password_admission_storage_failure_rolls_back_and_expired_rows_are_bounded(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());
    sqlx::raw_sql("CREATE FUNCTION reject_login_identity() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.kind='identity' THEN RAISE EXCEPTION 'synthetic admission storage failure'; END IF; RETURN NEW; END; $$; CREATE TRIGGER reject_login_identity BEFORE INSERT OR UPDATE ON password_login_admission FOR EACH ROW EXECUTE FUNCTION reject_login_identity();").execute(&pool).await.unwrap();
    assert!(
        store
            .admit_member_password_login("member@example.test")
            .await
            .is_err()
    );
    assert_eq!(
        sqlx::query_scalar::<_, i64>("SELECT count(*) FROM password_login_admission")
            .fetch_one(&pool)
            .await
            .unwrap(),
        0
    );
    sqlx::raw_sql("DROP TRIGGER reject_login_identity ON password_login_admission; DROP FUNCTION reject_login_identity(); INSERT INTO password_login_admission(kind,bucket,window_start,attempts) SELECT 'identity',decode(lpad(to_hex(n),64,'0'),'hex'),now()-interval '48 hours',1 FROM generate_series(1,129) AS n;").execute(&pool).await.unwrap();
    assert!(
        store
            .admit_member_password_login("member@example.test")
            .await
            .unwrap()
    );
    assert_eq!(sqlx::query_scalar::<_, i64>("SELECT count(*) FROM password_login_admission WHERE window_start<now()-interval '24 hours'").fetch_one(&pool).await.unwrap(), 1);
    assert!(
        store
            .admit_member_password_login("member@example.test")
            .await
            .unwrap()
    );
    assert_eq!(sqlx::query_scalar::<_, i64>("SELECT count(*) FROM password_login_admission WHERE window_start<now()-interval '24 hours'").fetch_one(&pool).await.unwrap(), 0);
}

#[sqlx::test]
#[ignore = "requires PostgreSQL"]
async fn password_admission_combines_ip_email_and_global_in_single_transaction(pool: PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    let store = Store::from_pool(pool.clone());

    // A shared NAT IP must allow >5 distinct users per minute (limit is 30/min)
    // and increment the global counter exactly once per login attempt.
    for index in 0..30 {
        assert!(
            store
                .admit_member_password_login_with_ip(
                    &format!("nat-user-{index}@example.test"),
                    Some("203.0.113.10"),
                )
                .await
                .unwrap(),
            "attempt {index} from shared IP should be admitted"
        );
    }
    let global_after_30: i32 =
        sqlx::query_scalar("SELECT attempts FROM password_login_admission WHERE kind='global'")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(global_after_30, 30);

    // 31st attempt from the same IP is rejected, while a different IP is still admitted.
    assert!(
        !store
            .admit_member_password_login_with_ip("nat-user-30@example.test", Some("203.0.113.10"))
            .await
            .unwrap()
    );
    assert!(
        store
            .admit_member_password_login_with_ip("other-office@example.test", Some("203.0.113.11"))
            .await
            .unwrap()
    );
}
