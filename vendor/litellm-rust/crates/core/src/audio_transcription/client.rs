use std::{sync::OnceLock, time::Duration};

use crate::constants::AUDIO_TRANSCRIPTION_TIMEOUT_SECS;

pub(super) fn http_client() -> &'static reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(10))
            .timeout(Duration::from_secs(AUDIO_TRANSCRIPTION_TIMEOUT_SECS))
            .redirect(reqwest::redirect::Policy::none())
            .retry(reqwest::retry::never())
            .no_proxy()
            .build()
            .expect("http client")
    })
}
