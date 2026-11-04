//! Recognize specific documented Provider failures without exposing raw bodies.
use axum::http::StatusCode;
use serde_json::Value;

pub(crate) const QINIU_CHAT_BANNED: &str = "The Qiniu account is not permitted to use chat services (account_chat_banned). Contact Qiniu to restore account access.";

pub(crate) fn qiniu_chat_banned(base: Option<&str>, status: StatusCode, body: &[u8]) -> bool {
    status == StatusCode::FORBIDDEN
        && base.map(|value| value.trim_end_matches('/')) == Some("https://api.qnaigc.com/v1")
        && serde_json::from_slice::<Value>(body)
            .ok()
            .is_some_and(|value| {
                value.pointer("/error/code").and_then(Value::as_str) == Some("account_chat_banned")
            })
}

/// An untrusted response is bounded in both time and memory before inspection.
pub(crate) async fn bounded_body(mut response: reqwest::Response) -> Vec<u8> {
    let mut body = Vec::new();
    let read = async {
        loop {
            match response.chunk().await {
                Ok(Some(chunk)) if body.len().saturating_add(chunk.len()) <= 16 * 1024 => {
                    body.extend_from_slice(&chunk);
                }
                Ok(None) => break,
                _ => {
                    body.clear();
                    break;
                }
            }
        }
    };
    if tokio::time::timeout(std::time::Duration::from_secs(2), read)
        .await
        .is_err()
    {
        body.clear();
    }
    body
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classification_requires_exact_provider_status_and_code() {
        let body = br#"{"error":{"code":"account_chat_banned","message":"private secret"}}"#;
        assert!(qiniu_chat_banned(
            Some("https://api.qnaigc.com/v1/"),
            StatusCode::FORBIDDEN,
            body
        ));
        assert!(!qiniu_chat_banned(
            Some("https://api.qnaigc.com.evil.example/v1"),
            StatusCode::FORBIDDEN,
            body
        ));
        assert!(!qiniu_chat_banned(
            Some("https://api.qnaigc.com/v1"),
            StatusCode::UNAUTHORIZED,
            body
        ));
        assert!(!qiniu_chat_banned(
            Some("https://api.qnaigc.com/v1"),
            StatusCode::FORBIDDEN,
            br#"{"error":{"code":"other"}}"#
        ));
        assert!(!qiniu_chat_banned(
            Some("https://api.qnaigc.com/v1"),
            StatusCode::FORBIDDEN,
            b"not json"
        ));
        assert!(!QINIU_CHAT_BANNED.contains("private secret"));
    }
}
