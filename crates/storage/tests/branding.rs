use base64::Engine;
use niu_storage::{Store, StoreError};
use sqlx::PgPool;
use std::io::Cursor;

#[sqlx::test(migrations = "./migrations")]
#[ignore = "requires PostgreSQL"]
async fn branding_is_durable_revisioned_resettable_and_atomically_audited(pool: PgPool) {
    let store = Store::from_pool(pool.clone());
    let (revision, defaults) = store.branding_configuration().await.unwrap();
    assert_eq!(revision, 0);
    assert_eq!(defaults.display_name, "NIU.IO");
    let mut settings = defaults.clone();
    let mut png = Cursor::new(Vec::new());
    image::DynamicImage::new_rgba8(32, 32)
        .write_to(&mut png, image::ImageFormat::Png)
        .unwrap();
    let asset = format!(
        "data:image/png;base64,{}",
        base64::engine::general_purpose::STANDARD.encode(png.into_inner())
    );
    settings.logo_data_url = Some(asset.clone());
    settings.favicon_data_url = Some(asset);

    settings.display_name = "Example deployment".into();
    settings.dark.insert("primary".into(), "#ffffff".into());
    let (a, b) = tokio::join!(
        store.save_branding_configuration(0, &settings, None),
        store.save_branding_configuration(0, &settings, None)
    );
    assert_eq!(usize::from(a.is_ok()) + usize::from(b.is_ok()), 1);
    assert!(matches!(
        a.as_ref().err().or(b.as_ref().err()),
        Some(StoreError::Conflict)
    ));
    let restored = Store::from_pool(pool.clone())
        .branding_configuration()
        .await
        .unwrap();
    assert_eq!(restored.0, 1);
    assert_eq!(restored.1.dark["primary"], "#ffffff");
    assert_eq!(restored.1.display_name, settings.display_name);
    assert!(restored.1.logo_data_url.is_some());
    assert!(restored.1.favicon_data_url.is_some());
    assert_eq!(
        store
            .save_branding_configuration(1, &defaults, None)
            .await
            .unwrap(),
        2
    );
    assert_eq!(
        store.branding_configuration().await.unwrap().1.display_name,
        "NIU.IO"
    );
    let reset = store.branding_configuration().await.unwrap().1;
    assert!(reset.logo_data_url.is_none() && reset.favicon_data_url.is_none());
    let mut executable = settings.clone();
    executable.logo_data_url = Some("data:image/svg+xml;base64,PHN2Zz4=".into());
    assert!(
        store
            .save_branding_configuration(2, &executable, None)
            .await
            .is_err()
    );
    assert_eq!(store.branding_configuration().await.unwrap().0, 2);
    let count: i64 = sqlx::query_scalar("SELECT count(*) FROM branding_configuration_events")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(count, 2);
    assert!(
        sqlx::query("DELETE FROM branding_configuration_events")
            .execute(&pool)
            .await
            .is_err()
    );
    let mut invalid = defaults;
    invalid
        .light
        .insert("primary".into(), "url(https://example.org/)".into());
    assert!(
        store
            .save_branding_configuration(2, &invalid, None)
            .await
            .is_err()
    );
    let mut unreadable = settings.clone();
    unreadable
        .light
        .insert("foreground".into(), "#ffffff".into());
    assert!(
        store
            .save_branding_configuration(2, &unreadable, None)
            .await
            .is_err()
    );
    assert_eq!(store.branding_configuration().await.unwrap().0, 2);
    assert!(
        store
            .save_branding_configuration(2, &settings, Some(uuid::Uuid::new_v4()))
            .await
            .is_err()
    );
    assert_eq!(store.branding_configuration().await.unwrap().0, 2);
}

#[sqlx::test(migrations = "./migrations")]
#[ignore = "requires PostgreSQL"]
async fn deployment_appearance_only_defaults_members_without_an_explicit_choice(pool: PgPool) {
    use niu_storage::{ColorMode, OperatorAuditActor, OperatorRole, OperatorScope};
    let store = Store::from_pool(pool.clone());
    let scope = store.default_workspace().await.unwrap();
    let member = store
        .create_operator(
            OperatorScope {
                organization_id: scope.organization_id,
                project_id: Some(scope.project_id),
            },
            "Theme member",
            OperatorRole::Owner,
            3600,
            OperatorAuditActor::Installation,
        )
        .await
        .unwrap();
    let (_, mut settings) = store.branding_configuration().await.unwrap();
    settings.default_appearance = ColorMode::Dark;
    store
        .save_branding_configuration(0, &settings, None)
        .await
        .unwrap();
    assert_eq!(
        store.member_color_mode(member.operator_id).await.unwrap(),
        "dark"
    );
    store
        .set_member_color_mode(member.operator_id, ColorMode::System)
        .await
        .unwrap();
    assert_eq!(
        store.member_color_mode(member.operator_id).await.unwrap(),
        "system"
    );
    settings.default_appearance = ColorMode::Light;
    store
        .save_branding_configuration(1, &settings, None)
        .await
        .unwrap();
    assert_eq!(
        Store::from_pool(pool.clone())
            .member_color_mode(member.operator_id)
            .await
            .unwrap(),
        "system"
    );
    store
        .set_member_color_mode(member.operator_id, ColorMode::Dark)
        .await
        .unwrap();
    assert_eq!(
        store.member_color_mode(member.operator_id).await.unwrap(),
        "dark"
    );
}
