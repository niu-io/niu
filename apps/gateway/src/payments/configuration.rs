use super::*;
use serde::Serialize;
use std::sync::Arc;

#[derive(Deserialize, Serialize, Clone)]
#[serde(deny_unknown_fields)]
pub(crate) struct Settings {
    enabled: bool,
    merchant_id: String,
    key: String,
    endpoint: String,
    notify_url: String,
    return_url: String,
    methods: Vec<String>,
}
impl Settings {
    fn runtime(&self) -> Result<Option<EPayRuntime>, &'static str> {
        if !self.enabled {
            return Ok(None);
        }
        EPayRuntime::from_configuration(|name| {
            Ok(Some(match name {
                "NIU_EPAY_PID" => self.merchant_id.clone(),
                "NIU_EPAY_KEY" => self.key.clone(),
                "NIU_EPAY_ENDPOINT" => self.endpoint.clone(),
                "NIU_EPAY_NOTIFY_URL" => self.notify_url.clone(),
                "NIU_EPAY_RETURN_URL" => self.return_url.clone(),
                "NIU_EPAY_METHODS" => self.methods.join(","),
                _ => return Ok(None),
            }))
        })
    }
    fn environment() -> Self {
        Self {
            enabled: env::var_os("NIU_EPAY_PID").is_some(),
            merchant_id: env::var("NIU_EPAY_PID").unwrap_or_default(),
            key: env::var("NIU_EPAY_KEY").unwrap_or_default(),
            endpoint: env::var("NIU_EPAY_ENDPOINT").unwrap_or_default(),
            notify_url: env::var("NIU_EPAY_NOTIFY_URL").unwrap_or_default(),
            return_url: env::var("NIU_EPAY_RETURN_URL").unwrap_or_default(),
            methods: env::var("NIU_EPAY_METHODS")
                .unwrap_or_default()
                .split(',')
                .filter(|m| !m.is_empty())
                .map(str::to_owned)
                .collect(),
        }
    }
    fn public(&self, revision: i64) -> Value {
        json!({"revision":revision.to_string(),"enabled":self.enabled,"merchant_id":self.merchant_id,"has_key":!self.key.is_empty(),"endpoint":self.endpoint,"notify_url":self.notify_url,"return_url":self.return_url,"methods":self.methods})
    }
}
async fn settings(state: &AppState) -> Result<(i64, Settings), ApiError> {
    if let Some((revision, ciphertext)) = state
        .store
        .payment_gateway_configuration()
        .await
        .map_err(ApiError::from_store)?
    {
        let cipher = state
            .vendor_cipher
            .as_ref()
            .ok_or_else(|| ApiError::upstream_message("Payment encryption is not configured"))?;
        let plaintext = cipher
            .open_payment_configuration(&ciphertext)
            .map_err(|_| {
                ApiError::upstream_message("Stored payment configuration could not be opened")
            })?;
        Ok((
            revision,
            serde_json::from_str(&plaintext).map_err(|_| {
                ApiError::upstream_message("Stored payment configuration is invalid")
            })?,
        ))
    } else {
        Ok((0, Settings::environment()))
    }
}
pub(super) async fn runtime(state: &AppState) -> Result<Option<Arc<EPayRuntime>>, ApiError> {
    if state
        .store
        .payment_gateway_configuration()
        .await
        .map_err(ApiError::from_store)?
        .is_none()
    {
        return Ok(state.epay_payments.clone());
    }
    let (_, settings) = settings(state).await?;
    settings
        .runtime()
        .map(|runtime| runtime.map(Arc::new))
        .map_err(ApiError::invalid_request)
}
pub(crate) async fn read(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    if !state
        .authorize_admin_headers(&headers, AdminPermission::Read)
        .await?
        .can_manage_platform()
    {
        return Err(ApiError::forbidden());
    }
    let (revision, settings) = settings(&state).await?;
    Ok(Json(json!({"data":settings.public(revision)})))
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct Write {
    expected_revision: String,
    enabled: bool,
    merchant_id: String,
    key: String,
    endpoint: String,
    notify_url: String,
    return_url: String,
    methods: Vec<String>,
}
pub(crate) async fn save(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<Write>,
) -> Result<Json<Value>, ApiError> {
    let auth = state
        .authorize_admin_headers(&headers, AdminPermission::Write)
        .await?;
    if !auth.can_manage_platform() {
        return Err(ApiError::forbidden());
    }
    let actor = match auth {
        crate::state::AdminAuthorization::Operator(operator) => Some(operator.id),
        _ => None,
    };
    let _guard = state.payment_configuration_guard.lock().await;
    let (current_revision, previous) = settings(&state).await?;
    let expected = input
        .expected_revision
        .parse::<i64>()
        .map_err(|_| ApiError::invalid_request("Invalid configuration revision"))?;
    if expected != current_revision {
        return Err(ApiError::from_store(niu_storage::StoreError::Conflict));
    }
    let mut configuration = Settings {
        enabled: input.enabled,
        merchant_id: input.merchant_id,
        key: input.key,
        endpoint: input.endpoint,
        notify_url: input.notify_url,
        return_url: input.return_url,
        methods: input.methods,
    };
    if configuration.key.is_empty() {
        configuration.key = previous.key;
    }
    if configuration.methods.len() > 2
        || configuration
            .methods
            .iter()
            .collect::<std::collections::HashSet<_>>()
            .len()
            != configuration.methods.len()
    {
        return Err(ApiError::invalid_request(
            "Choose distinct supported payment methods",
        ));
    }
    configuration.runtime().map_err(ApiError::invalid_request)?;
    let cipher = state
        .vendor_cipher
        .as_ref()
        .ok_or_else(|| ApiError::upstream_message("Payment encryption is not configured"))?;
    let plaintext = serde_json::to_string(&configuration)
        .map_err(|_| ApiError::invalid_request("Invalid payment configuration"))?;
    let ciphertext = cipher
        .seal_payment_configuration(&plaintext)
        .map_err(ApiError::invalid_request)?;
    let revision = state
        .store
        .save_payment_gateway_configuration(expected, &ciphertext, actor)
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({"data":configuration.public(revision)})))
}
