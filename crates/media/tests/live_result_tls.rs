//! Opt-in network qualification of the production result transport.
//! No Supplier credentials or customer content are used; the public WPT fixture
//! remains external and is not redistributed by this repository.
use niu_media::result::{ResultError, ResultKind, fetch_result};
use std::time::Duration;

const FIXTURE: &str = "https://wpt.live/media/2x2-green.mp4";

#[tokio::test]
#[ignore = "requires public HTTPS access to the external WPT media fixture"]
async fn public_https_video_retrieval_keeps_size_and_kind_boundaries() {
    let result = fetch_result(
        FIXTURE,
        ResultKind::Video,
        256 * 1024,
        Duration::from_secs(15),
    )
    .await
    .expect("Production HTTPS video retrieval must succeed");
    assert_eq!(result.content_type, "video/mp4");
    assert!(result.bytes.len() > 16 && result.bytes.len() <= 256 * 1024);
    assert_eq!(&result.bytes[4..8], b"ftyp");
    assert!(matches!(
        fetch_result(FIXTURE, ResultKind::Video, 16, Duration::from_secs(15)).await,
        Err(ResultError::TooLarge)
    ));
    assert!(matches!(
        fetch_result(
            FIXTURE,
            ResultKind::LastFrame,
            256 * 1024,
            Duration::from_secs(15)
        )
        .await,
        Err(ResultError::InvalidMedia)
    ));
}
