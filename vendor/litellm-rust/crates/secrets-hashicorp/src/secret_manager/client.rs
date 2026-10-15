use super::*;

impl HashicorpVault {
    pub(super) async fn client_for_location(
        &self,
        location: &SecretLocation,
    ) -> Result<Arc<VaultClient>, Error> {
        let client = self.vault_client().await?;
        if client.settings.namespace == location.namespace {
            return Ok(client);
        }
        let identity = self.tls_identity().await?;
        let mut cached = self.auth_client.lock().await;
        if let Some(entry) = cached.as_mut()
            && entry
                .expires_at
                .is_none_or(|expires_at| expires_at > Instant::now())
        {
            if let Some(existing) = entry.namespace_clients.get(&location.namespace) {
                return Ok(existing.clone());
            }
            let ns_client = Arc::new(self.build_client_with_identity(
                location.namespace.as_deref(),
                &entry.client.settings.token,
                identity,
            )?);
            entry
                .namespace_clients
                .insert(location.namespace.clone(), ns_client.clone());
            return Ok(ns_client);
        }
        drop(cached);
        self.build_client_with_identity(
            location.namespace.as_deref(),
            &client.settings.token,
            identity,
        )
        .map(Arc::new)
    }

    pub(super) async fn vault_client(&self) -> Result<Arc<VaultClient>, Error> {
        {
            let cached = self.auth_client.lock().await;
            if let Some(entry) = cached.as_ref()
                && entry
                    .expires_at
                    .is_none_or(|expires_at| expires_at > Instant::now())
            {
                return Ok(entry.client.clone());
            }
        }
        let identity = self.tls_identity().await?;
        let mut cached = self.auth_client.lock().await;
        if let Some(entry) = cached.as_ref()
            && entry
                .expires_at
                .is_none_or(|expires_at| expires_at > Instant::now())
        {
            return Ok(entry.client.clone());
        }

        let (client, expires_at): (VaultClient, Option<Instant>) =
            match (self.config.approle.as_ref(), self.config.tls_cert.as_ref()) {
                (Some(approle), _) => {
                    let login_client: VaultClient = self.build_client_with_identity(
                        self.config.login_namespace(),
                        "",
                        identity.clone(),
                    )?;
                    let auth = approle::login(
                        &login_client,
                        &approle.mount_path,
                        &approle.role_id,
                        approle.secret_id.expose(),
                    )
                    .await
                    .map_err(|error| map_api_error(error, ErrorContext::Login))?;
                    (
                        self.build_client_with_identity(
                            self.config.secret_namespace(),
                            &auth.client_token,
                            identity,
                        )?,
                        token_expiry(auth.lease_duration),
                    )
                }
                (None, Some(tls)) => {
                    let login_client: VaultClient = self.build_client_with_identity(
                        self.config.login_namespace(),
                        "",
                        identity.clone(),
                    )?;
                    let endpoint: CertLoginRequest = CertLoginRequest::new(tls.role.as_deref());
                    let auth = api::auth(&login_client, endpoint)
                        .await
                        .map_err(|error| map_api_error(error, ErrorContext::Login))?;
                    (
                        self.build_client_with_identity(
                            self.config.secret_namespace(),
                            &auth.client_token,
                            identity,
                        )?,
                        token_expiry(auth.lease_duration),
                    )
                }
                (None, None) => {
                    let token: SecretValue =
                        self.config.token.clone().ok_or(Error::NoAuthConfigured)?;
                    (
                        self.build_client_with_identity(
                            self.config.secret_namespace(),
                            token.expose(),
                            identity,
                        )?,
                        None,
                    )
                }
            };
        let client: Arc<VaultClient> = Arc::new(client);
        *cached = Some(CachedClient {
            client: client.clone(),
            namespace_clients: HashMap::new(),
            expires_at,
        });
        Ok(client)
    }

    async fn tls_identity(&self) -> Result<Option<Identity>, Error> {
        let Some(tls) = self.config.tls_cert.clone() else {
            return Ok(None);
        };
        self.tls_identity
            .get_or_try_init(|| async move {
                tokio::task::spawn_blocking(move || identity_for(Some(&tls)))
                    .await
                    .map_err(|err| Error::ClientSettings {
                        message: err.to_string(),
                    })?
            })
            .await
            .cloned()
    }

    fn build_client_with_identity(
        &self,
        namespace: Option<&str>,
        token: &str,
        identity: Option<Identity>,
    ) -> Result<VaultClient, Error> {
        let settings = VaultClientSettingsBuilder::default()
            .address(&self.config.address)
            .token(token.to_owned())
            .namespace(namespace.map(str::to_owned))
            .identity(identity)
            .ca_certs(Vec::new())
            .verify(true)
            .build()
            .map_err(|message| Error::ClientSettings {
                message: message.to_string(),
            })?;
        VaultClient::new(settings).map_err(Error::Client)
    }
}

fn identity_for(tls: Option<&TlsCertAuth>) -> Result<Option<Identity>, Error> {
    tls.map(|tls| {
        let cert: Vec<u8> = std::fs::read(&tls.cert_path).map_err(|source| Error::TlsIdentity {
            path: tls.cert_path.clone(),
            message: source.to_string(),
        })?;
        let key: Vec<u8> = std::fs::read(&tls.key_path).map_err(|source| Error::TlsIdentity {
            path: tls.key_path.clone(),
            message: source.to_string(),
        })?;
        Identity::from_pem(&[cert.as_slice(), key.as_slice()].concat()).map_err(|source| {
            Error::TlsIdentity {
                path: tls.cert_path.clone(),
                message: source.to_string(),
            }
        })
    })
    .transpose()
}

const MAX_TOKEN_TTL_SECS: u64 = 365 * 24 * 60 * 60;
const TOKEN_RENEWAL_MARGIN_SECS: u64 = 30;

fn token_expiry(lease_duration: u64) -> Option<Instant> {
    if lease_duration == 0 {
        return None;
    }
    let effective_secs = if lease_duration > TOKEN_RENEWAL_MARGIN_SECS * 2 {
        lease_duration - TOKEN_RENEWAL_MARGIN_SECS
    } else {
        lease_duration
    }
    .min(MAX_TOKEN_TTL_SECS);
    Instant::now().checked_add(Duration::from_secs(effective_secs))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn token_expiry_handles_zero_and_u64_max_without_panicking() {
        assert!(token_expiry(0).is_none());
        assert!(token_expiry(1).is_some());
        assert!(token_expiry(3600).is_some());
        assert!(token_expiry(u64::MAX).is_some());
    }
}
