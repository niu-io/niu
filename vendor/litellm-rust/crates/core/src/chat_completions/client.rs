use std::{sync::OnceLock, time::Duration};

use crate::constants::{CHAT_COMPLETIONS_CONNECT_TIMEOUT_SECS, CHAT_COMPLETIONS_TIMEOUT_SECS};

pub(super) fn http_client() -> &'static reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .timeout(Duration::from_secs(CHAT_COMPLETIONS_TIMEOUT_SECS))
            .connect_timeout(Duration::from_secs(CHAT_COMPLETIONS_CONNECT_TIMEOUT_SECS))
            .redirect(reqwest::redirect::Policy::none())
            .retry(reqwest::retry::never())
            .no_proxy()
            .build()
            .expect("http client")
    })
}
