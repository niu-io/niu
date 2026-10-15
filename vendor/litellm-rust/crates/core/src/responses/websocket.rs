use std::{
    collections::HashMap,
    io,
    sync::{Arc, OnceLock},
    time::Duration,
};

use futures_util::{
    SinkExt, StreamExt,
    stream::{SplitSink, SplitStream},
};
use litellm_types::responses::streaming_websocket::ResponsesWsEventType;
use rustls::{ClientConfig, RootCertStore};
use tokio::{net::TcpStream, sync::Mutex};
use tokio_tungstenite::{
    Connector, MaybeTlsStream, WebSocketStream, connect_async_tls_with_config,
    tungstenite::{
        Message,
        client::IntoClientRequest,
        error::TlsError,
        handshake::client::Response,
        http::{HeaderName, HeaderValue},
        protocol::WebSocketConfig,
    },
};

use super::Error;

const DEFAULT_WS_CONNECT_TIMEOUT: Duration = Duration::from_secs(30);
const MAX_WS_MESSAGE_BYTES: usize = 16 * 1024 * 1024;
const MAX_WS_FRAME_BYTES: usize = 4 * 1024 * 1024;

pub fn is_terminal_event(event_type: &ResponsesWsEventType) -> bool {
    matches!(
        event_type,
        ResponsesWsEventType::ResponseCompleted
            | ResponsesWsEventType::ResponseFailed
            | ResponsesWsEventType::ResponseIncomplete
            | ResponsesWsEventType::Error
    )
}

pub type ResponsesUpstreamWs = WebSocketStream<MaybeTlsStream<TcpStream>>;

static TLS_CONFIG: OnceLock<Arc<ClientConfig>> = OnceLock::new();

fn build_tls_config() -> Result<ClientConfig, Box<tokio_tungstenite::tungstenite::Error>> {
    let native = rustls_native_certs::load_native_certs();
    let mut store = RootCertStore::empty();
    let (added, _ignored) = store.add_parsable_certificates(native.certs);
    if added == 0 {
        return Err(Box::new(tokio_tungstenite::tungstenite::Error::Io(
            io::Error::other(format!(
                "no usable native root certificates: {:?}",
                native.errors
            )),
        )));
    }
    ClientConfig::builder_with_provider(Arc::new(rustls::crypto::ring::default_provider()))
        .with_safe_default_protocol_versions()
        .map(|builder| builder.with_root_certificates(store).with_no_client_auth())
        .map_err(|error| {
            Box::new(tokio_tungstenite::tungstenite::Error::Tls(
                TlsError::Rustls(error),
            ))
        })
}

fn tls_config() -> Result<Arc<ClientConfig>, Box<tokio_tungstenite::tungstenite::Error>> {
    if let Some(config) = TLS_CONFIG.get() {
        return Ok(Arc::clone(config));
    }
    let built = Arc::new(build_tls_config()?);
    Ok(Arc::clone(TLS_CONFIG.get_or_init(|| built)))
}

pub async fn connect_upstream<R>(
    request: R,
) -> Result<(ResponsesUpstreamWs, Response), Box<tokio_tungstenite::tungstenite::Error>>
where
    R: IntoClientRequest + Unpin,
{
    let request = request.into_client_request().map_err(Box::new)?;
    let connector = match request.uri().scheme_str() {
        Some("wss") => Some(Connector::Rustls(tls_config()?)),
        _ => None,
    };
    let mut ws_config = WebSocketConfig::default();
    ws_config.max_message_size = Some(MAX_WS_MESSAGE_BYTES);
    ws_config.max_frame_size = Some(MAX_WS_FRAME_BYTES);
    connect_async_tls_with_config(request, Some(ws_config), false, connector)
        .await
        .map_err(Box::new)
}

#[derive(Clone)]
pub struct ResponsesWebSocketConnection {
    sink: Arc<Mutex<Option<SplitSink<ResponsesUpstreamWs, Message>>>>,
    stream: Arc<Mutex<Option<SplitStream<ResponsesUpstreamWs>>>>,
}

impl ResponsesWebSocketConnection {
    pub async fn connect_url(
        url: &str,
        headers: &HashMap<String, String>,
        timeout: Option<Duration>,
    ) -> Result<Self, Error> {
        let mut request = url.into_client_request().map_err(|error| {
            Error::Transport(litellm_http::transport::Error::Network(error.to_string()))
        })?;
        for (name, value) in headers {
            let header_name = name
                .parse::<HeaderName>()
                .map_err(|error| Error::InvalidRequest(error.to_string()))?;
            let header_value = HeaderValue::from_str(value)
                .map_err(|error| Error::InvalidRequest(error.to_string()))?;
            request.headers_mut().insert(header_name, header_value);
        }
        let connect = connect_upstream(request);
        let effective_timeout = timeout
            .filter(|t| !t.is_zero())
            .unwrap_or(DEFAULT_WS_CONNECT_TIMEOUT);
        let result = tokio::time::timeout(effective_timeout, connect)
            .await
            .map_err(|_| {
                Error::Transport(litellm_http::transport::Error::Network(
                    "Responses WebSocket connection timed out".into(),
                ))
            })?;
        let (socket, _) = result.map_err(|error| match *error {
            tokio_tungstenite::tungstenite::Error::Http(response) => {
                Error::Transport(litellm_http::transport::Error::Http {
                    status: response.status().as_u16(),
                    body: String::new(),
                })
            }
            other => Error::Transport(litellm_http::transport::Error::Network(other.to_string())),
        })?;
        let (sink, stream) = socket.split();
        Ok(Self {
            sink: Arc::new(Mutex::new(Some(sink))),
            stream: Arc::new(Mutex::new(Some(stream))),
        })
    }

    pub async fn send_text(&self, text: String) -> Result<(), Error> {
        let mut sink = self.sink.lock().await;
        let Some(sink) = sink.as_mut() else {
            return Err(Error::Transport(litellm_http::transport::Error::Network(
                "Responses WebSocket is closed".into(),
            )));
        };
        sink.send(Message::Text(text)).await.map_err(|error| {
            Error::Transport(litellm_http::transport::Error::Network(error.to_string()))
        })
    }

    pub async fn recv_text(&self) -> Result<Option<String>, Error> {
        let mut stream = self.stream.lock().await;
        let Some(stream) = stream.as_mut() else {
            return Ok(None);
        };
        match stream.next().await {
            Some(Ok(Message::Text(text))) => Ok(Some(text)),
            Some(Ok(Message::Binary(bytes))) => String::from_utf8(bytes.to_vec())
                .map(Some)
                .map_err(|error| Error::InvalidResponse(error.to_string())),
            Some(Ok(Message::Close(_))) | None => Ok(None),
            Some(Ok(_)) => Ok(None),
            Some(Err(error)) => Err(Error::Transport(litellm_http::transport::Error::Network(
                error.to_string(),
            ))),
        }
    }

    pub async fn close(&self) -> Result<(), Error> {
        let mut sink = self.sink.lock().await;
        if let Some(s) = sink.as_mut() {
            s.close().await.map_err(|error| {
                Error::Transport(litellm_http::transport::Error::Network(error.to_string()))
            })?;
        }
        *sink = None;
        if let Ok(mut stream) = self.stream.try_lock() {
            *stream = None;
        }
        Ok(())
    }
}
