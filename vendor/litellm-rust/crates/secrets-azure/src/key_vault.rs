use std::{sync::Arc, time::Duration};

use litellm_auth_azure::{AzureAuthInputs, AzureAuthService, ConfigValue};
use litellm_auth_types::{InputSource, Sourced};
use litellm_core_utils::settings::Lookup;
use litellm_secrets_types::{
    AzureOperationContext, BaseSecretManager, Secret, SecretCache, SecretValue,
    validate_secret_name,
};
use percent_encoding::{AsciiSet, NON_ALPHANUMERIC};
use serde::Deserialize;

use crate::Error;

const AZURE_KEY_VAULT_URI: &str = "AZURE_KEY_VAULT_URI";
const API_VERSION: &str = "7.4";
const CACHE_CAPACITY: u64 = 200;
const DEFAULT_CACHE_TTL: Duration = Duration::from_secs(600);
const PATH_SEGMENT: &AsciiSet = &NON_ALPHANUMERIC
    .remove(b'-')
    .remove(b'_')
    .remove(b'~');

#[derive(Clone)]
pub struct AzureKeyVault {
    client: reqwest::Client,
    vault: reqwest::Url,
    auth: Arc<AzureAuthService>,
    inputs: Arc<AzureAuthInputs>,
    environment: Arc<dyn Lookup + Send + Sync>,
    cache: SecretCache<String, SecretValue>,
}

#[derive(Deserialize)]
struct SecretResponse {
    value: Option<String>,
}

impl AzureKeyVault {
    pub fn with_client(
        client: reqwest::Client,
        mut vault: reqwest::Url,
        environment: Arc<dyn Lookup + Send + Sync>,
    ) -> Result<Self, Error> {
        if vault.host_str().is_none() {
            return Err(Error::VaultUri);
        }
        if !vault.path().ends_with('/') {
            vault.set_path(&format!("{}/", vault.path()));
        }
        let inputs = AzureAuthInputs {
            azure_scope: ConfigValue::Value(Sourced::new(
                scope_for(&vault),
                InputSource::Deployment,
            )),
            enable_azure_ad_token_refresh: Sourced::new(true, InputSource::Deployment),
            ..AzureAuthInputs::default()
        };
        Ok(Self {
            client,
            vault,
            auth: Arc::new(AzureAuthService::default()),
            inputs: Arc::new(inputs),
            environment,
            cache: SecretCache::new(CACHE_CAPACITY, DEFAULT_CACHE_TTL),
        })
    }

    pub fn new(environment: Arc<dyn Lookup + Send + Sync>) -> Result<Self, Error> {
        let value = environment
            .get(AZURE_KEY_VAULT_URI)
            .ok_or(Error::MissingEnvironment(AZURE_KEY_VAULT_URI))?;
        let vault = reqwest::Url::parse(&value).map_err(|_| Error::VaultUri)?;
        if vault.scheme() != "https" || vault.host_str().is_none() {
            return Err(Error::VaultUri);
        }
        let client = reqwest::Client::builder()
            .connect_timeout(std::time::Duration::from_secs(10))
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .map_err(Error::Http)?;
        Self::with_client(client, vault, environment)
    }

    pub fn scope(&self) -> &str {
        self.inputs
            .azure_scope
            .as_value()
            .map(|value| value.value().as_str())
            .unwrap_or_default()
    }

    pub async fn get_secret(&self, name: &str) -> Result<Option<Secret>, Error> {
        BaseSecretManager::async_read_secret(self, name, &AzureOperationContext::default())
            .await
            .map(|value| value.map(Secret::String))
    }

    async fn read(&self, name: &str) -> Result<Option<SecretValue>, Error> {
        validate_secret_name(name)?;
        self.cache
            .read(name.to_owned(), self.read_uncached(name))
            .await
    }

    async fn read_uncached(&self, name: &str) -> Result<Option<SecretValue>, Error> {
        validate_secret_name(name)?;
        let token = self
            .auth
            .get_azure_ad_token(&self.inputs, &|key| self.environment.get(key))
            .await?
            .ok_or(Error::MissingCredentials)?;
        let encoded_name = percent_encoding::utf8_percent_encode(name, PATH_SEGMENT);
        let url = self
            .vault
            .join(&format!("secrets/{encoded_name}?api-version={API_VERSION}"))
            .map_err(|_| Error::VaultUri)?;
        let response = self
            .client
            .get(url)
            .bearer_auth(token.value().secret().expose())
            .header(reqwest::header::ACCEPT, "application/json")
            .send()
            .await
            .map_err(Error::Http)?;
        if response.status() == reqwest::StatusCode::NOT_FOUND {
            return Ok(None);
        }
        if response.status() != reqwest::StatusCode::OK {
            return Err(Error::Status(response.status().as_u16()));
        }
        let raw_body = read_response_bytes(response).await?;
        let payload: SecretResponse = serde_json::from_slice(&raw_body).map_err(Error::Json)?;
        let value = payload.value.ok_or(Error::MissingValue)?;
        Ok(Some(SecretValue::new(value)))
    }
}

const MAX_SECRET_RESPONSE_BYTES: usize = 1024 * 1024;

async fn read_response_bytes(mut response: reqwest::Response) -> Result<Vec<u8>, Error> {
    if response
        .content_length()
        .is_some_and(|len| len > MAX_SECRET_RESPONSE_BYTES as u64)
    {
        return Err(Error::ResponseTooLarge);
    }
    let mut raw_body = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(Error::Http)? {
        if chunk.len() > MAX_SECRET_RESPONSE_BYTES.saturating_sub(raw_body.len()) {
            return Err(Error::ResponseTooLarge);
        }
        raw_body.extend_from_slice(&chunk);
    }
    Ok(raw_body)
}

fn scope_for(vault: &reqwest::Url) -> String {
    let host = vault.host_str().unwrap_or_default();
    let resource = host
        .split_once('.')
        .map_or(host, |(_, remainder)| remainder);
    format!("https://{resource}/.default")
}

impl BaseSecretManager for AzureKeyVault {
    type Error = Error;
    type Context = AzureOperationContext;

    async fn async_read_secret(
        &self,
        name: &str,
        context: &Self::Context,
    ) -> Result<Option<SecretValue>, Error> {
        match context.timeout {
            Some(timeout) => tokio::time::timeout(timeout, self.read(name))
                .await
                .map_err(|_| Error::Timeout)?,
            None => self.read(name).await,
        }
    }
}

pub trait AzureTokenProvider: Send + Sync {
    fn get_token<'a>(
        &'a self,
        scope: &'a str,
        environment: &'a (dyn Lookup + Send + Sync),
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<SecretValue, Error>> + Send + 'a>>;
}

#[derive(Default)]
pub struct NativeAzureTokenProvider {
    auth: AzureAuthService,
}

impl AzureTokenProvider for NativeAzureTokenProvider {
    fn get_token<'a>(
        &'a self,
        scope: &'a str,
        environment: &'a (dyn Lookup + Send + Sync),
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<SecretValue, Error>> + Send + 'a>>
    {
        Box::pin(async move {
            let inputs = AzureAuthInputs {
                azure_scope: ConfigValue::Value(Sourced::new(
                    scope.to_owned(),
                    InputSource::Deployment,
                )),
                enable_azure_ad_token_refresh: Sourced::new(true, InputSource::Deployment),
                ..Default::default()
            };
            self.auth
                .get_azure_ad_token(&inputs, &|name| environment.get(name))
                .await?
                .map(|token| SecretValue::new(token.value().secret().expose()))
                .ok_or(Error::MissingCredentials)
        })
    }
}
