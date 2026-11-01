//! Durable workspace event delivery. No host wake or task-success guarantee.
use crate::{state::AppState, vendors::crypto::CredentialCipher};
use futures_util::StreamExt;
use niu_storage::{EventDeliveryClaim, Store};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

pub(crate) async fn validate_saved_signing_credentials(
    store: &Store,
    cipher: Option<&CredentialCipher>,
) -> Result<(), Box<dyn std::error::Error>> {
    let mut after = None;
    loop {
        let page = store
            .event_signing_credential_page(after)
            .await
            .map_err(|_| "Cannot read resource event signing credentials")?;
        if page.is_empty() {
            return Ok(());
        }
        let cipher = cipher.ok_or(
            "NIU_VENDOR_ENCRYPTION_KEY is required for persisted resource event subscriptions",
        )?;
        for (id, scope, ciphertext) in page {
            cipher.open_event_subscription(scope, id, &ciphertext).map_err(|_| "Cannot authenticate resource event signing credentials with configured encryption key")?;
            after = Some(id);
        }
    }
}

pub(crate) fn spawn(
    state: &AppState,
    mut shutdown: tokio::sync::watch::Receiver<bool>,
) -> Option<tokio::task::JoinHandle<()>> {
    let cipher = state.vendor_cipher.clone()?;
    let store = state.store.clone();
    Some(tokio::spawn(async move {
        while !*shutdown.borrow() {
            tokio::select! {
                _ = shutdown.changed() => break,
                result = batch(&store, &cipher) => if result.is_err() { tracing::warn!("Resource event delivery storage requires retry"); }
            }
            tokio::select! {
                _ = shutdown.changed() => break,
                _ = tokio::time::sleep(Duration::from_secs(1)) => {}
            }
        }
    }))
}
async fn batch(store: &Store, cipher: &CredentialCipher) -> Result<(), niu_storage::StoreError> {
    batch_with(store, |claim| deliver(store, cipher, claim)).await
}
async fn batch_with<F, Fut>(store: &Store, sender: F) -> Result<(), niu_storage::StoreError>
where
    F: Fn(EventDeliveryClaim) -> Fut + Sync + Send,
    Fut: std::future::Future<Output = Result<(), niu_storage::StoreError>> + Send,
{
    let sender = &sender;
    let candidates = store.event_delivery_candidates().await?;
    futures_util::stream::iter(candidates)
        .for_each_concurrent(4, |id| async move {
            let result = async {
                if let Some(claim) = store.claim_event_delivery(id).await? {
                    sender(claim).await?;
                }
                Ok::<_, niu_storage::StoreError>(())
            }
            .await;
            if result.is_err() {
                tracing::warn!("Resource event delivery state requires reconciliation");
            }
        })
        .await;
    Ok(())
}
async fn deliver(
    store: &Store,
    cipher: &CredentialCipher,
    claim: EventDeliveryClaim,
) -> Result<(), niu_storage::StoreError> {
    if claim.configuration.validate().is_err() {
        return store
            .finish_event_delivery(&claim, None, Some("destination"))
            .await;
    }
    let client = match niu_upstream::client_for_public_endpoint(
        &claim.configuration.endpoint,
        Duration::from_secs(10),
    )
    .await
    {
        Ok(client) => client,
        Err(niu_upstream::EndpointError::ResolutionFailed) => {
            return store
                .finish_event_delivery(&claim, None, Some("transport"))
                .await;
        }
        Err(_) => {
            return store
                .finish_event_delivery(&claim, None, Some("destination"))
                .await;
        }
    };
    send_claim(
        store,
        cipher,
        &claim,
        &client,
        &claim.configuration.endpoint,
    )
    .await
}
async fn send_claim(
    store: &Store,
    cipher: &CredentialCipher,
    claim: &EventDeliveryClaim,
    client: &reqwest::Client,
    endpoint: &str,
) -> Result<(), niu_storage::StoreError> {
    if !store.event_delivery_authorized(claim).await? {
        return store
            .finish_event_delivery(claim, None, Some("authority"))
            .await;
    }
    let secret = match cipher.open_event_subscription(
        claim.scope,
        claim.subscription_id,
        &claim.secret_ciphertext,
    ) {
        Ok(secret) => secret,
        Err(_) => {
            return store
                .finish_event_delivery(claim, None, Some("signature"))
                .await;
        }
    };
    let body = serde_json::to_vec(&claim.event)
        .map_err(|_| niu_storage::StoreError::InvalidObservation)?;
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| niu_storage::StoreError::InvalidObservation)?
        .as_secs();
    let event_id = claim.event["id"]
        .as_str()
        .ok_or(niu_storage::StoreError::InvalidObservation)?;
    let status = send_signed(
        client,
        endpoint,
        &secret,
        timestamp,
        &body,
        event_id,
        &claim.id.to_string(),
    )
    .await;
    match status {
        Ok(status) if (200..=299).contains(&status) => {
            store.finish_event_delivery(claim, Some(status), None).await
        }
        Ok(status) => {
            store
                .finish_event_delivery(claim, Some(status), Some("http"))
                .await
        }
        Err(_) => {
            store
                .finish_event_delivery(claim, None, Some("transport"))
                .await
        }
    }
}
#[cfg(test)]
pub(crate) async fn run_fixture_batch(
    store: &Store,
    cipher: &CredentialCipher,
    endpoint: &str,
) -> Result<(), niu_storage::StoreError> {
    batch_with(store, |claim| async move {
        deliver_fixture(store, cipher, &claim, endpoint).await
    })
    .await
}
#[cfg(test)]
async fn deliver_fixture(
    store: &Store,
    cipher: &CredentialCipher,
    claim: &EventDeliveryClaim,
    endpoint: &str,
) -> Result<(), niu_storage::StoreError> {
    let url = url::Url::parse(endpoint).unwrap();
    assert_eq!(url.scheme(), "http");
    assert!(
        url.host_str()
            .unwrap()
            .parse::<std::net::IpAddr>()
            .unwrap()
            .is_loopback()
    );
    let client = reqwest::Client::builder()
        .no_proxy()
        .retry(reqwest::retry::never())
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .unwrap();
    send_claim(store, cipher, claim, &client, endpoint).await
}
fn signature(secret: &str, timestamp: u64, body: &[u8]) -> String {
    use std::fmt::Write;
    let key = ring::hmac::Key::new(ring::hmac::HMAC_SHA256, secret.as_bytes());
    let mut context = ring::hmac::Context::with_key(&key);
    context.update(timestamp.to_string().as_bytes());
    context.update(b".");
    context.update(body);
    let digest = context.sign();
    let mut encoded = String::with_capacity(64);
    for byte in digest.as_ref() {
        let _ = write!(encoded, "{byte:02x}");
    }
    format!("t={timestamp},v1={encoded}")
}
/// Receiver body is never consumed or retained. A 2xx acknowledges delivery,
/// not the receiver's processing, host wake, evaluation or policy change.
async fn send_signed(
    client: &reqwest::Client,
    endpoint: &str,
    secret: &str,
    timestamp: u64,
    body: &[u8],
    event_id: &str,
    delivery_id: &str,
) -> Result<u16, reqwest::Error> {
    Ok(client
        .post(endpoint)
        .header("content-type", "application/json")
        .header("x-niu-event-id", event_id)
        .header("x-niu-delivery-id", delivery_id)
        .header("x-niu-signature", signature(secret, timestamp, body))
        .body(body.to_vec())
        .send()
        .await?
        .status()
        .as_u16())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn signed_wire_preserves_body_identity_and_does_not_follow_redirects() {
        use axum::{
            Router,
            body::Bytes,
            extract::State,
            http::{HeaderMap, StatusCode},
            routing::post,
        };
        use std::sync::{
            Arc,
            atomic::{AtomicUsize, Ordering},
        };
        #[derive(Clone)]
        struct Fixture(Arc<AtomicUsize>);
        async fn receiver(
            State(fixture): State<Fixture>,
            headers: HeaderMap,
            body: Bytes,
        ) -> (StatusCode, HeaderMap) {
            assert_eq!(
                headers["x-niu-signature"],
                "t=123,v1=61d58e64504e8b0e73e85874d8c5d550885ebb2e7fe41273d322f51e1930f624"
            );
            assert_eq!(headers["x-niu-event-id"], "event-fixture");
            assert_eq!(headers["x-niu-delivery-id"], "delivery-fixture");
            assert_eq!(&body[..], b"{\"id\":\"event-fixture\"}");
            fixture.0.fetch_add(1, Ordering::SeqCst);
            (
                StatusCode::TEMPORARY_REDIRECT,
                HeaderMap::from_iter([(
                    axum::http::header::LOCATION,
                    "/unexpected".parse().unwrap(),
                )]),
            )
        }
        let hits = Arc::new(AtomicUsize::new(0));
        let fixture = Fixture(hits.clone());
        let app = Router::new()
            .route("/events", post(receiver))
            .route(
                "/unexpected",
                post(|State(fixture): State<Fixture>| async move {
                    fixture.0.fetch_add(1, Ordering::SeqCst);
                    StatusCode::OK
                }),
            )
            .with_state(fixture);
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let task = tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
        let client = reqwest::Client::builder()
            .no_proxy()
            .retry(reqwest::retry::never())
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .unwrap();
        assert_eq!(
            send_signed(
                &client,
                &format!("http://{address}/events"),
                "fixture-secret",
                123,
                b"{\"id\":\"event-fixture\"}",
                "event-fixture",
                "delivery-fixture"
            )
            .await
            .unwrap(),
            307
        );
        assert_eq!(hits.load(Ordering::SeqCst), 1);
        assert_ne!(
            signature("fixture-secret", 123, b"changed"),
            signature("fixture-secret", 123, b"original")
        );
        assert!(
            niu_upstream::client_for_public_endpoint(
                &format!("http://{address}/events"),
                Duration::from_secs(1)
            )
            .await
            .is_err()
        );
        task.abort();
    }
}
