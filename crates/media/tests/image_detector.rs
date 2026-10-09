use niu_media::image_detector::{Config, Consent, Runtime, RuntimeError};
const WORKSPACE: &str = "00000000-0000-4000-8000-000000000001";
fn config() -> Config {
    Config {
        endpoint: "https://detector.example/inspect".into(),
        api_key_env: "NIU_IMAGE_RUNTIME_FIXTURE_MISSING_KEY".into(),
        detector_revision: "fixture-v2".into(),
        recipient: "Fixture recipient".into(),
        region: "Fixture region".into(),
        retention: "No retention declared".into(),
        authorized_workspaces: vec![WORKSPACE.into()],
        declared_unmetered: true,
        timeout_ms: 1000,
        maximum_encoded_bytes: 4096,
        maximum_width: 32,
        maximum_height: 32,
        maximum_decoded_bytes: 4096,
        concurrency: 1,
    }
}
#[tokio::test]
async fn consent_and_workspace_denials_precede_decoding_or_transport() {
    let config = config();
    let runtime = Runtime::new(config.clone()).unwrap();
    let valid = Consent {
        configuration_fingerprint: config.fingerprint(),
        consent_to_image_processing: true,
    };
    assert!(runtime.permits(WORKSPACE, &valid));
    let no_consent = Consent {
        consent_to_image_processing: false,
        ..valid.clone()
    };
    let stale = Consent {
        configuration_fingerprint: "0".repeat(64),
        ..valid.clone()
    };
    for (workspace, consent) in [
        (WORKSPACE, &no_consent),
        (WORKSPACE, &stale),
        ("00000000-0000-4000-8000-000000000002", &valid),
    ] {
        assert_eq!(
            runtime
                .inspect_inline(workspace, consent, "invalid private data")
                .await
                .err(),
            Some(RuntimeError::Unauthorized)
        );
    }
    let metered = Runtime::new(Config {
        declared_unmetered: false,
        ..config
    })
    .unwrap();
    assert!(!metered.permits(
        WORKSPACE,
        &Consent {
            configuration_fingerprint: metered.fingerprint().into(),
            ..valid
        }
    ));
}
#[test]
fn processing_changes_require_renewed_consent_and_invalid_settings_fail() {
    let original = config();
    let fingerprint = original.fingerprint();
    let variants = vec![
        Config {
            recipient: "Other recipient".into(),
            ..original.clone()
        },
        Config {
            retention: "Other retention".into(),
            ..original.clone()
        },
        Config {
            endpoint: "https://other.example/inspect".into(),
            ..original.clone()
        },
        Config {
            detector_revision: "other".into(),
            ..original.clone()
        },
        Config {
            maximum_width: 31,
            ..original.clone()
        },
        Config {
            authorized_workspaces: vec![],
            ..original.clone()
        },
    ];
    for changed in variants {
        assert_ne!(changed.fingerprint(), fingerprint);
    }
    for changed in [
        Config {
            endpoint: "http://public.example/inspect".into(),
            ..original.clone()
        },
        Config {
            endpoint: "https://credential@detector.example/inspect".into(),
            ..original.clone()
        },
        Config {
            endpoint: "https://detector.example/inspect?secret=private".into(),
            ..original.clone()
        },
        Config {
            authorized_workspaces: vec!["------------------------------------".into()],
            ..original.clone()
        },
        Config {
            maximum_encoded_bytes: 0,
            ..original.clone()
        },
        Config {
            concurrency: 5,
            ..original.clone()
        },
        Config {
            timeout_ms: 0,
            ..original
        },
    ] {
        assert!(Runtime::new(changed).is_err());
    }
}
