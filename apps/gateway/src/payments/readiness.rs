//! Payment setup or authorized company funding prerequisite (issue #101).
//! Configuration readiness is not a claim of merchant settlement verification.
use crate::{error::ApiError, state::{AppState, AdminAuthorization}};
use axum::{
    Json,
    body::Body,
    extract::{MatchedPath, State, Query, Path},
    http::Request,
    middleware::Next,
    response::{IntoResponse, Response},
    RequestExt,
};
use serde::{Deserialize, Serialize};
use serde_json::json;

#[derive(Serialize)]
pub(crate) struct Readiness {
    pub ready: bool,
    pub reason: Option<&'static str>,
}

/// Bind stored Stripe evidence to all effective checkout and callback settings.
/// Never serialize this digest or the source settings to customer responses.
pub(super) fn stripe_configuration_digest(runtime: &super::StripeRuntime, currency: &str) -> Option<[u8; 32]> {
    let checkout = runtime.checkout.as_ref()?;
    let context = serde_json::to_vec(&(
        "stripe-installation-v1", &runtime.merchant, &runtime.endpoint_secret,
        runtime.live_mode, currency, &checkout.currency, &checkout.success_url,
        &checkout.cancel_url, &checkout.methods,
    )).ok()?;
    Some(checkout.client.configuration_digest(&context))
}

pub(super) fn epay_configuration_digest(runtime: &super::EPayRuntime) -> Option<[u8;32]> {
    let checkout = runtime.checkout.as_ref()?;
    let context = serde_json::to_vec(&("epay-installation-v1",&runtime.merchant,"CNY",&checkout.endpoint,&checkout.notify,&checkout.return_url,&checkout.methods)).ok()?;
    Some(runtime.verifier.configuration_digest(&context))
}

pub(super) fn zhifux_configuration_digest(runtime: &super::Runtime) -> [u8;32] {
    let context=serde_json::to_vec(&("zhifux-installation-v1",&runtime.merchant,"CNY",&runtime.notify_url,&runtime.payment_methods)).expect("serializable configuration");
    runtime.client.configuration_digest(&context)
}

#[derive(Serialize)]
pub(crate) struct GatewayVerification {
    pub gateway: &'static str,
    pub checkout_enabled: bool,
    pub currency_supported: bool,
    pub account_verified: Option<bool>,
    pub callback_verified: bool,
    pub ready: bool,
}
#[derive(Serialize)]
pub(crate) struct Verification {
    pub currency_configured: bool,
    pub gateways: Vec<GatewayVerification>,
}

/// Same authoritative evidence powers admission and the administrator recovery view.
pub(crate) async fn verification(state: &AppState) -> Result<Verification,ApiError> {
    let currency=state.store.platform_currency().await.map_err(ApiError::from_store)?;
    let epay=super::configuration::runtime(state).await?;
    let mut gateways=Vec::new();
    let checkout_enabled=epay.as_ref().and_then(|r|r.checkout.as_ref()).is_some_and(|c|!c.methods.is_empty());
    let currency_supported=currency.as_deref()==Some("CNY");
    let callback_verified=if let Some(digest)=epay.as_ref().and_then(|r|epay_configuration_digest(r)) {
        state.store.payment_callback_verified("epay",&digest).await.map_err(ApiError::from_store)?
    } else {false};
    gateways.push(GatewayVerification{gateway:"epay",checkout_enabled,currency_supported,account_verified:None,callback_verified,ready:checkout_enabled&&currency_supported&&callback_verified});
    let checkout_enabled=state.payments.as_ref().is_some_and(|r|!r.payment_methods.is_empty());
    let callback_verified=if let Some(runtime)=state.payments.as_ref() {
        state.store.payment_callback_verified("zhifux",&zhifux_configuration_digest(runtime)).await.map_err(ApiError::from_store)?
    } else {false};
    gateways.push(GatewayVerification{gateway:"zhifux",checkout_enabled,currency_supported,account_verified:None,callback_verified,ready:checkout_enabled&&currency_supported&&callback_verified});
    let checkout=state.stripe_payments.as_ref().and_then(|r|r.checkout.as_ref());
    let checkout_enabled=checkout.is_some_and(|c|!c.methods.is_empty());
    let currency_supported=checkout.is_some_and(|c|currency.as_ref().is_some_and(|currency|c.currency.eq_ignore_ascii_case(currency)));
    let mock=super::mock_runtime::available();
    let (account_verified,callback_verified)=if !mock {
        if let Some(digest)=state.stripe_payments.as_ref().and_then(|r|currency.as_ref().and_then(|c|stripe_configuration_digest(r,c))) {
            (Some(state.store.payment_verification_valid("stripe",&digest,"account").await.map_err(ApiError::from_store)?),state.store.payment_callback_verified("stripe",&digest).await.map_err(ApiError::from_store)?)
        }else{(Some(false),false)}
    }else{(None,false)};
    let ready=checkout_enabled&&currency_supported&&if mock {super::mock_runtime::ready().await}else{account_verified==Some(true)&&callback_verified};
    gateways.push(GatewayVerification{gateway:"stripe",checkout_enabled,currency_supported,account_verified,callback_verified,ready});
    Ok(Verification{currency_configured:currency.is_some(),gateways})
}

pub(crate) async fn inspect(state: &AppState) -> Result<Readiness, ApiError> {
    let verification=verification(state).await?;
    let ready=verification.gateways.iter().any(|gateway|gateway.ready);
    Ok(Readiness{ready,reason:if ready {None}else if !verification.currency_configured {Some("currency_required")}else{Some("payment_setup_required")}})
}

/// Company funding is an alternative to merchant setup, never a cross-tenant
/// installation bypass. Callers must resolve and authorize the company first.
pub(crate) async fn inspect_organization(state: &AppState, organization: Option<uuid::Uuid>) -> Result<Readiness, ApiError> {
    if let Some(organization) = organization {
        if let Some(currency) = state.store.platform_currency().await.map_err(ApiError::from_store)? {
            if state.store.customer_has_funding_arrangement(organization, &currency).await.map_err(ApiError::from_store)? {
                return Ok(Readiness { ready:true, reason:None });
            }
        }
    }
    inspect(state).await
}

#[derive(Deserialize)]
pub(crate) struct ReadinessQuery { organization: Option<uuid::Uuid> }

/// ```openapi
/// {"path":"/api/v1/payments/readiness","method":"get","operation":{"operationId":"getPaymentReadiness","summary":"Read payment or scoped funding readiness","x-niu-implementation":"implemented","security":[{},{"bearerAuth":[]}],"description":"Anonymous reads describe installation payment configuration only. Authenticated reads may select an authorized company using organization; member sessions default to their own company. An explicit funded, granted or approved-credit arrangement in the platform currency permits that company to use self-hosted workspace features without a merchant. Empty accounts and another company’s funds never qualify. This setup decision is separate from per-request balance reservation; spending credits does not hide history or settings. Authentication, administration, directory lookup and funding recovery stay available. No amounts, merchant credentials or identities are returned.","responses":{"200":{"description":"Current prerequisite state","content":{"application/json":{"schema":{"type":"object","required":["data"],"properties":{"data":{"type":"object","required":["ready","reason"],"properties":{"ready":{"type":"boolean"},"reason":{"type":["string","null"],"enum":["currency_required","payment_setup_required",null]}}}}}}}},"500":{"description":"Readiness could not be established; clients must not assume readiness."},"401":{"description":"Requested authenticated scope has no valid session"},"403":{"description":"Company outside authorized scope"}},"parameters":[{"name":"organization","in":"query","required":false,"schema":{"type":"string","format":"uuid"},"description":"Authenticated company scope; installation credentials may select a company, members may only select their own."}]}}
/// ```
pub(crate) async fn read(
    State(state): State<AppState>, headers: axum::http::HeaderMap, Query(query): Query<ReadinessQuery>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let organization = if query.organization.is_some() || headers.contains_key("authorization") || headers.contains_key("cookie") {
        let authorization = state.authorize_admin_headers(&headers, niu_storage::AdminPermission::Read).await?;
        authorized_organization(authorization, query.organization)?
    } else { None };
    Ok(Json(json!({"data":inspect_organization(&state, organization).await?})))
}

fn authorized_organization(authorization: AdminAuthorization, requested: Option<uuid::Uuid>) -> Result<Option<uuid::Uuid>, ApiError> {
    if let Some(organization) = requested {
        if !authorization.permits_organization(organization) { return Err(ApiError::forbidden()); }
        return Ok(Some(organization));
    }
    Ok(match authorization { AdminAuthorization::Installation => None, AdminAuthorization::Operator(member) => Some(member.scope.organization_id) })
}

pub(crate) async fn require_creation_ready(state: &AppState, authorization: AdminAuthorization, organization: Option<uuid::Uuid>) -> Result<(), ApiError> {
    let organization = authorized_organization(authorization, organization)?;
    if inspect_organization(state, organization).await?.ready { return Ok(()); }
    Err(ApiError::payment_setup_required())
}

// Match registered route templates rather than user-supplied path spellings.
/// ```openapi
/// {"path":"/api/v1/platform/payments/stripe/verification","method":"get","operation":{"operationId":"getStripeVerification","summary":"Read Stripe verification evidence","x-niu-implementation":"implemented","description":"Installation administrator only. Reads evidence bound to current effective Stripe configuration and currency. Account and callback verification are separate; no merchant identity or credentials are returned. Does not contact Stripe.","security":[{"bearerAuth":[]}],"responses":{"200":{"description":"Current configuration-bound verification","content":{"application/json":{"schema":{"type":"object","properties":{"data":{"type":"object","properties":{"account_verified":{"type":"boolean"},"callback_verified":{"type":"boolean"}}}}}}}},"403":{"description":"Installation administrator required"},"400":{"description":"Real Stripe checkout is not configured"}}}}
/// ```
pub(crate) async fn stripe_verification(
    State(state): State<AppState>, headers: axum::http::HeaderMap,
) -> Result<Json<serde_json::Value>, ApiError> {
    authorize_verification(&state, &headers, niu_storage::AdminPermission::Read).await?;
    let (_, digest) = current_stripe_verification(&state).await?;
    let account = state.store.payment_verification_valid("stripe", &digest, "account").await.map_err(ApiError::from_store)?;
    let callback = state.store.payment_callback_verified("stripe", &digest).await.map_err(ApiError::from_store)?;
    Ok(Json(json!({"data":{"account_verified":account,"callback_verified":callback}})))
}
/// ```openapi
/// {"path":"/api/v1/platform/payments/stripe/verification","method":"post","operation":{"operationId":"verifyStripeAccount","summary":"Check the configured Stripe account","x-niu-implementation":"implemented","description":"Installation administrator write permission required. Performs a bounded read-only Stripe account check and persists evidence for the current configuration for ten minutes. Does not create checkout, charge money, or assert callback verification. Transient check failure preserves prior evidence only until its original expiry; credential rejection or disabled charges revokes it immediately. Mock mode is excluded. Merchant errors are sanitized.","security":[{"bearerAuth":[]}],"responses":{"200":{"description":"Account check result","content":{"application/json":{"schema":{"type":"object","properties":{"data":{"type":"object","properties":{"result":{"type":"string","enum":["account_enabled","account_disabled","credentials_rejected","check_unavailable"]}}}}}}}},"403":{"description":"Installation administrator required"},"400":{"description":"Real Stripe checkout is not configured"}}}}
/// ```
pub(crate) async fn verify_stripe_account(
    State(state): State<AppState>, headers: axum::http::HeaderMap,
) -> Result<Json<serde_json::Value>, ApiError> {
    authorize_verification(&state, &headers, niu_storage::AdminPermission::Write).await?;
    Ok(Json(json!({"data":{"result":check_stripe_account(&state).await?}})))
}

async fn check_stripe_account(state: &AppState) -> Result<&'static str, ApiError> {
    let (runtime, digest) = current_stripe_verification(&state).await?;
    let check = state.store.begin_payment_verification("stripe", &digest, "account").await.map_err(ApiError::from_store)?;
    let result = match runtime.checkout.as_ref().expect("validated checkout").client.account_status().await {
        Ok(account) if account.charges_enabled => "account_enabled",
        Ok(_) => "account_disabled",
        Err(niu_payments::stripe_transport::AccountCheckError::Rejected) => "credentials_rejected",
        Err(niu_payments::stripe_transport::AccountCheckError::Unavailable) => "check_unavailable",
    };
    if result == "check_unavailable" {
        state.store.payment_verification_unavailable(check).await.map_err(ApiError::from_store)?;
    } else {
        state.store.finish_payment_verification(check, (result == "account_enabled").then_some(600)).await.map_err(ApiError::from_store)?;
    }
    Ok(result)
}

/// Keep account evidence fresh outside customer requests. A transient outage gets
/// only the remainder of the original ten-minute validity; it never extends it.
pub(crate) fn spawn_account_checks(state: &AppState, mut shutdown: tokio::sync::watch::Receiver<bool>) -> Option<tokio::task::JoinHandle<()>> {
    if super::mock_runtime::available() || state.stripe_payments.as_ref().and_then(|runtime| runtime.checkout.as_ref()).is_none() { return None; }
    let state = state.clone();
    Some(tokio::spawn(async move {
        let mut interval = tokio::time::interval(std::time::Duration::from_secs(300));
        interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
        loop {
            tokio::select! {
                _ = interval.tick() => {},
                _ = shutdown.changed() => break,
            }
            if *shutdown.borrow() { break; }
            if check_stripe_account(&state).await.is_err() {
                tracing::warn!("Stripe account evidence could not be refreshed");
            }
        }
    }))
}
async fn authorize_verification(state: &AppState, headers: &axum::http::HeaderMap, permission: niu_storage::AdminPermission) -> Result<(), ApiError> {
    if !state.authorize_admin_headers(headers, permission).await?.can_manage_platform() { return Err(ApiError::forbidden()); }
    Ok(())
}
async fn current_stripe_verification(state: &AppState) -> Result<(&super::StripeRuntime, [u8;32]), ApiError> {
    if super::mock_runtime::available() { return Err(ApiError::invalid_request("Use the mock payment gateway controls in test mode")); }
    let runtime = state.stripe_payments.as_ref().ok_or_else(|| ApiError::invalid_request("Configure Stripe checkout before verification"))?;
    let currency = state.store.platform_currency().await.map_err(ApiError::from_store)?.ok_or_else(|| ApiError::invalid_request("Configure the platform currency first"))?;
    let digest = stripe_configuration_digest(runtime, &currency).ok_or_else(|| ApiError::invalid_request("Configure Stripe checkout before verification"))?;
    Ok((runtime, digest))
}

// Account funding, authentication and administration remain available for recovery.
fn customer_feature(path: &str) -> bool {
    if path == "/v1/currency" {
        return false;
    }
    path == "/v1"
        || path.starts_with("/v1/")
        || path == "/v1beta"
        || path.starts_with("/v1beta/")
        || ["/api/v1/", "/admin/v1/"].iter().any(|prefix| {
            path.strip_prefix(prefix).is_some_and(|path| {
                path == "workspaces"
                    || path.starts_with("workspaces/")
                    || (path.starts_with("organizations/") && path.contains("/projects"))
            })
        })
}

pub(crate) async fn gate(
    State(state): State<AppState>,
    mut request: Request<Body>,
    next: Next,
) -> Response {
    let path = request.extensions().get::<MatchedPath>().map(|value| value.as_str()).unwrap_or(request.uri().path()).to_owned();
    // Directory/slug lookup is necessary to select a funded workspace. Creation
    // checks the authorized body scope in its handler, before any write.
    let directory = ["/api/v1/workspaces", "/admin/v1/workspaces"].contains(&path.as_str());
    let lookup = path.ends_with("/workspaces/by-route/{route_slug}") && request.method() == axum::http::Method::GET;
    if customer_feature(&path) && !directory && !lookup {
        if matches!(inspect(&state).await, Ok(Readiness { ready:true, .. })) {
            return next.run(request).await;
        }
        let scope = if path.starts_with("/v1") {
            state.authorize_api_headers(request.headers()).await.map(|principal| Some(principal.scope().organization_id))
        } else {
            match state.authorize_admin_headers(request.headers(), niu_storage::AdminPermission::Read).await {
                Err(error) => Err(error),
                Ok(authorization) => {
                    match request.extract_parts::<Path<Vec<(String,String)>>>().await {
                        Err(_) => Err(ApiError::invalid_request("Invalid workspace scope")),
                        Ok(Path(parameters)) => {
                            if let Some((_,raw)) = parameters.iter().find(|(name,_)| name == "workspace") {
                                match raw.parse::<uuid::Uuid>() {
                                    Err(_) => Err(ApiError::invalid_request("Invalid workspace scope")),
                                    Ok(workspace) => crate::admin::workspace_aliases::authorize_workspace(&state, request.headers(), workspace, niu_storage::AdminPermission::Read).await.map(|(_,scope)| Some(scope.organization_id)),
                                }
                            } else if let Some((_,raw)) = parameters.iter().find(|(name,_)| name == "organization") {
                                match raw.parse::<uuid::Uuid>() {
                                    Err(_) => Err(ApiError::invalid_request("Invalid company scope")),
                                    Ok(organization) => authorized_organization(authorization, Some(organization)),
                                }
                            } else { authorized_organization(authorization, None) }
                        }
                    }
                }
            }
        };
        let organization = match scope { Ok(value) => value, Err(error) => return error.into_response() };
        match inspect_organization(&state, organization).await {
            Ok(Readiness { ready: true, .. }) => {},
            result => {
                let reason = result.ok().and_then(|value| value.reason).unwrap_or("readiness_unavailable");
                return (axum::http::StatusCode::SERVICE_UNAVAILABLE, Json(json!({"error":{
                    "type":"payment_setup_required", "code":reason,
                    "message":"Workspace features require platform currency setup and either an available payment gateway or funding for this company's account. Contact your service administrator."
                }}))).into_response();
            }
        }
    }
    next.run(request).await
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn gates_customer_features_and_legacy_aliases_but_preserves_setup_and_funding() {
        for path in [
            "/api/v1/workspaces",
            "/api/v1/workspaces/{workspace}/keys",
            "/admin/v1/workspaces/{workspace}",
            "/api/v1/organizations/{organization}/projects/{project}/chats",
            "/admin/v1/organizations/{organization}/projects/{project}/keys",
            "/v1/chat/completions",
            "/v1beta/models/{model_action}",
        ] {
            assert!(customer_feature(path), "{path}");
        }
        for path in [
            "/v1/currency",
            "/api/v1/payments/readiness",
            "/api/v1/platform/payments/epay",
            "/api/v1/platform/currency",
            "/api/v1/session",
            "/api/v1/auth/browser/login",
            "/api/v1/organizations/{organization}/billing/topups",
            "/api/v1/providers",
            "/catalog/v1/models",
            "/payments/stripe/notify",
        ] {
            assert!(!customer_feature(path), "{path}");
        }
    }
    #[test]
    fn stripe_evidence_digest_covers_every_checkout_and_callback_setting() {
        fn runtime() -> super::super::StripeRuntime {
            super::super::StripeRuntime {
                merchant: "fixture".into(), endpoint_secret: "whsec_fixture".into(), live_mode: false,
                checkout: Some(super::super::StripeCheckout {
                    client: niu_payments::stripe_transport::Client::new("sk_test_fixture".into(), false).unwrap(),
                    currency: "usd".into(), success_url: "https://example.test/success".into(),
                    cancel_url: "https://example.test/cancel".into(), methods: vec!["card".into()],
                }),
            }
        }
        let original = stripe_configuration_digest(&runtime(), "USD").unwrap();
        assert_eq!(original, stripe_configuration_digest(&runtime(), "USD").unwrap());
        assert_ne!(original, stripe_configuration_digest(&runtime(), "CNY").unwrap());
        for field in 0..8 {
            let mut changed = runtime();
            match field {
                0 => changed.merchant = "other".into(),
                1 => changed.endpoint_secret = "whsec_other".into(),
                2 => changed.live_mode = true,
                3 => changed.checkout.as_mut().unwrap().currency = "cny".into(),
                4 => changed.checkout.as_mut().unwrap().success_url = "https://example.test/new-success".into(),
                5 => changed.checkout.as_mut().unwrap().cancel_url = "https://example.test/new-cancel".into(),
                6 => changed.checkout.as_mut().unwrap().methods.push("alipay".into()),
                _ => changed.checkout.as_mut().unwrap().client = niu_payments::stripe_transport::Client::new("sk_test_other".into(), false).unwrap(),
            }
            assert_ne!(original, stripe_configuration_digest(&changed, "USD").unwrap(), "field {field}");
        }
        let mut disabled = runtime(); disabled.checkout = None;
        assert!(stripe_configuration_digest(&disabled, "USD").is_none());
    }

    #[sqlx::test(migrations = "../../crates/storage/migrations")]
    #[ignore = "requires PostgreSQL"]
    async fn stripe_account_verification_api_is_admin_only_and_does_not_verify_callbacks(pool: sqlx::PgPool) {
        use std::sync::{Arc, atomic::{AtomicBool, AtomicUsize, Ordering}};
        use http_body_util::BodyExt;
        use tower::ServiceExt;
        let calls = Arc::new(AtomicUsize::new(0));
        let enabled = Arc::new(AtomicBool::new(true));
        let calls_route = calls.clone(); let enabled_route = enabled.clone();
        let upstream = axum::Router::new().route("/v1/account", axum::routing::get(move || {
            let calls = calls_route.clone(); let enabled = enabled_route.clone();
            async move { calls.fetch_add(1, Ordering::SeqCst); Json(json!({"id":"acct_fixture","object":"account","charges_enabled":enabled.load(Ordering::SeqCst)})) }
        }));
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let base = format!("http://{}", listener.local_addr().unwrap());
        let server = tokio::spawn(async move { axum::serve(listener, upstream).await.unwrap() });
        let store = niu_storage::Store::from_pool(pool);
        store.configure_platform_currency("USD").await.unwrap();
        let mut state = AppState::new(toml::from_str("[models]").unwrap(), store,
            crate::state::TokenSet::parse("NIU_ADMIN_TOKENS", "readiness-fixture-administrator-token".into()).unwrap(), std::collections::HashMap::new());
        state.stripe_payments = Some(Arc::new(super::super::StripeRuntime {
            merchant:"fixture".into(),endpoint_secret:"whsec_fixture".into(),live_mode:false,
            checkout:Some(super::super::StripeCheckout {
                client:niu_payments::stripe_transport::Client::fixture("sk_test_fixture".into(),false,&base).unwrap(),
                currency:"usd".into(),success_url:"https://example.test/success".into(),cancel_url:"https://example.test/cancel".into(),methods:vec!["card".into()],
            }),
        }));
        let app = crate::web::router(state.clone());
        let path = "/api/v1/platform/payments/stripe/verification";
        let denied = app.clone().oneshot(axum::http::Request::post(path).body(Body::empty()).unwrap()).await.unwrap();
        assert_eq!(denied.status(), axum::http::StatusCode::UNAUTHORIZED);
        assert_eq!(calls.load(Ordering::SeqCst), 0);
        let company = state.store.create_prepaid_organization("Verification role fixture", "USD").await.unwrap();
        let owner = state.store.create_operator(
            niu_storage::OperatorScope { organization_id: company, project_id: None },
            "Customer owner", niu_storage::OperatorRole::Owner, 3600,
            niu_storage::OperatorAuditActor::Installation,
        ).await.unwrap();
        for method in ["GET", "POST"] {
            let denied = app.clone().oneshot(axum::http::Request::builder().method(method).uri(path)
                .header("authorization", format!("Bearer {}", owner.token)).body(Body::empty()).unwrap()).await.unwrap();
            assert_eq!(denied.status(), axum::http::StatusCode::FORBIDDEN, "customer ownership is not platform authority");
        }
        assert_eq!(calls.load(Ordering::SeqCst), 0);
        for (method, expected) in [("GET",json!({"account_verified":false,"callback_verified":false})),("POST",json!({"result":"account_enabled"})),("GET",json!({"account_verified":true,"callback_verified":false}))] {
            let response = app.clone().oneshot(axum::http::Request::builder().method(method).uri(path)
                .header("authorization","Bearer readiness-fixture-administrator-token").body(Body::empty()).unwrap()).await.unwrap();
            assert_eq!(response.status(), axum::http::StatusCode::OK);
            let body:serde_json::Value=serde_json::from_slice(&response.into_body().collect().await.unwrap().to_bytes()).unwrap();
            assert_eq!(body,json!({"data":expected}));
        }
        assert_eq!(calls.load(Ordering::SeqCst), 1);
        enabled.store(false,Ordering::SeqCst);
        let response=app.oneshot(axum::http::Request::post(path).header("authorization","Bearer readiness-fixture-administrator-token").body(Body::empty()).unwrap()).await.unwrap();
        assert_eq!(response.status(),axum::http::StatusCode::OK);
        let digest = stripe_configuration_digest(state.stripe_payments.as_ref().unwrap(),"USD").unwrap();
        assert!(!state.store.payment_verification_valid("stripe",&digest,"account").await.unwrap());
        enabled.store(true,Ordering::SeqCst);
        let (shutdown, receiver) = tokio::sync::watch::channel(false);
        let monitor = spawn_account_checks(&state, receiver).unwrap();
        tokio::time::timeout(std::time::Duration::from_secs(2), async {
            while !state.store.payment_verification_valid("stripe", &digest, "account").await.unwrap() {
                tokio::time::sleep(std::time::Duration::from_millis(10)).await;
            }
        }).await.unwrap();
        shutdown.send(true).unwrap();
        tokio::time::timeout(std::time::Duration::from_secs(2), monitor).await.unwrap().unwrap();
        assert_eq!(calls.load(Ordering::SeqCst), 3, "startup refresh checks once and responds to shutdown");
        server.abort();
    }

    #[sqlx::test(migrations = "../../crates/storage/migrations")]
    #[ignore = "requires PostgreSQL"]
    async fn funded_readiness_is_company_scoped_without_merchant_setup(pool: sqlx::PgPool) {
        use tower::ServiceExt;
        use http_body_util::BodyExt;
        use niu_storage::{OperatorAuditActor, OperatorRole, OperatorScope};
        let store=niu_storage::Store::from_pool(pool);
        store.configure_platform_currency("USD").await.unwrap();
        let funded=store.create_prepaid_organization("Funded fixture", "USD").await.unwrap();
        let other=store.create_prepaid_organization("Unfunded fixture", "USD").await.unwrap();
        let workspace=store.create_project(funded,"Funded workspace").await.unwrap();
        let foreign=store.create_project(other,"Other workspace").await.unwrap();
        let owner=store.create_operator(OperatorScope{organization_id:funded,project_id:None},"Company owner",OperatorRole::Owner,3600,OperatorAuditActor::Installation).await.unwrap();
        let key=store.issue_key(workspace,"Funded key",&["*".into()],3600).await.unwrap();
        let foreign_key=store.issue_key(foreign,"Other key",&["*".into()],3600).await.unwrap();
        let state=AppState::new(toml::from_str("[models]").unwrap(),store.clone(),crate::state::TokenSet::parse("NIU_ADMIN_TOKENS","funding-fixture-installation-token".into()).unwrap(),std::collections::HashMap::new());
        assert!(!inspect_organization(&state,Some(funded)).await.unwrap().ready);
        let revision=store.configure_customer_balance_policy(funded,"USD",1_000_000_000,None,0).await.unwrap();
        assert!(inspect_organization(&state,Some(funded)).await.unwrap().ready);
        assert!(!inspect_organization(&state,Some(other)).await.unwrap().ready);
        store.configure_customer_balance_policy(funded,"USD",0,None,revision).await.unwrap();
        assert!(!inspect_organization(&state,Some(funded)).await.unwrap().ready);
        store.publish_customer_balance_grant(funded,niu_storage::CustomerBalanceGrantPublication{currency:"USD",amount_nanos:1_000_000_000,reason:"Isolated evaluation",idempotency_key:uuid::Uuid::new_v4()},OperatorAuditActor::Installation).await.unwrap();
        assert!(inspect_organization(&state,Some(funded)).await.unwrap().ready);
        assert!(!store.customer_has_funding_arrangement(funded,"CNY").await.unwrap());
        assert!(!inspect(&state).await.unwrap().ready,"funding is not a global bypass");
        let corrected = store.publish_customer_balance_grant(other,niu_storage::CustomerBalanceGrantPublication{currency:"USD",amount_nanos:1_000_000_000,reason:"Mistaken isolated grant",idempotency_key:uuid::Uuid::new_v4()},OperatorAuditActor::Installation).await.unwrap();
        assert!(inspect_organization(&state,Some(other)).await.unwrap().ready);
        store.correct_unused_customer_balance_grant(other,corrected,niu_storage::CustomerBalanceGrantPublication{currency:"USD",amount_nanos:1_000_000_000,reason:"Remove unused mistaken grant",idempotency_key:uuid::Uuid::new_v4()},OperatorAuditActor::Installation).await.unwrap();
        assert!(!inspect_organization(&state,Some(other)).await.unwrap().ready,"a wholly corrected grant is not a funding arrangement");
        let app=crate::web::router(state.clone());
        for (path,token,status) in [
            ("/api/v1/platform/configuration".into(),owner.token.as_str(),403),
            (format!("/api/v1/workspaces/{}/keys",workspace.project_id),owner.token.as_str(),200),
            (format!("/api/v1/workspaces/{}/keys",foreign.project_id),"funding-fixture-installation-token",503),
            (format!("/api/v1/organizations/{other}/projects/{}/keys",foreign.project_id),owner.token.as_str(),403),
            ("/v1/models".into(),key.token.as_str(),200),
            ("/v1/models".into(),foreign_key.token.as_str(),503),
            ("/api/v1/workspaces".into(),owner.token.as_str(),200),
            (format!("/api/v1/payments/readiness?organization={other}"),owner.token.as_str(),403),
        ] {
            let response=app.clone().oneshot(Request::get(&path).header("authorization",format!("Bearer {token}")).body(Body::empty()).unwrap()).await.unwrap();
            assert_eq!(response.status().as_u16(),status,"{path}");
        }
        let configuration=app.clone().oneshot(Request::get("/api/v1/platform/configuration").header("authorization","Bearer funding-fixture-installation-token").body(Body::empty()).unwrap()).await.unwrap();
        assert_eq!(configuration.status(),axum::http::StatusCode::OK);
        let configuration:serde_json::Value=serde_json::from_slice(&configuration.into_body().collect().await.unwrap().to_bytes()).unwrap();
        let verification=&configuration["data"]["verification"];
        assert_eq!(verification["currency_configured"],true);
        assert_eq!(verification["gateways"].as_array().unwrap().len(),3);
        assert!(verification["gateways"].as_array().unwrap().iter().all(|g|g["ready"]==false),"company funding must not certify payment gateways");
        for (path,token,ready) in [
            ("/api/v1/payments/readiness".to_owned(),owner.token.as_str(),true),
            (format!("/api/v1/payments/readiness?organization={funded}"),"funding-fixture-installation-token",true),
            (format!("/api/v1/payments/readiness?organization={other}"),"funding-fixture-installation-token",false),
        ] {
            let response=app.clone().oneshot(Request::get(path).header("authorization",format!("Bearer {token}")).body(Body::empty()).unwrap()).await.unwrap();
            assert_eq!(response.status(),axum::http::StatusCode::OK);
            let body:serde_json::Value=serde_json::from_slice(&response.into_body().collect().await.unwrap().to_bytes()).unwrap();
            assert_eq!(body["data"]["ready"],ready);
        }
        for (organization,expected) in [(funded,201),(other,503)] {
            let response=app.clone().oneshot(Request::post("/api/v1/workspaces").header("authorization","Bearer funding-fixture-installation-token").header("content-type","application/json").body(Body::from(json!({"name":"Additional workspace","organization_id":organization}).to_string())).unwrap()).await.unwrap();
            assert_eq!(response.status().as_u16(),expected);
        }
    }

    #[sqlx::test(migrations = "../../crates/storage/migrations")]
    #[ignore = "requires PostgreSQL"]
    async fn payment_callback_verification_requires_original_configuration_and_settlement(pool: sqlx::PgPool) {
        let store = niu_storage::Store::from_pool(pool.clone());
        let company = store.create_prepaid_organization("Callback evidence fixture", "USD").await.unwrap();
        let digest = [8u8;32];
        let changed = [9u8;32];
        for legacy in [false, true] {
            let order = store.create_customer_topup(company, &niu_storage::TopupInput {
                currency:"USD",amount_nanos:2_000_000_000,aggregator:"stripe",merchant:"fixture",
                payment_method:"card",idempotency_key:uuid::Uuid::new_v4(),
            }).await.unwrap();
            assert!(store.bind_payment_checkout_verification(order.id,"stripe",&digest).await.is_err(), "unclaimed intents cannot acquire evidence");
            assert!(store.claim_customer_topup_creation(company,order.id).await.unwrap());
            if !legacy {
                store.bind_payment_checkout_verification(order.id,"stripe",&digest).await.unwrap();
                assert!(store.bind_payment_checkout_verification(order.id,"stripe",&changed).await.is_err(), "binding is immutable");
            }
            let session = format!("cs_test_{}",order.id.simple());
            store.bind_customer_topup_checkout(company,order.id,&session,&format!("https://checkout.stripe.com/c/pay/{session}")).await.unwrap();
            assert!(store.bind_payment_checkout_verification(order.id,"stripe",&digest).await.is_err(), "saved legacy checkout cannot acquire a new binding");
            store.verify_payment_callback(order.id,"stripe",&changed).await.unwrap();
            assert!(!store.payment_callback_verified("stripe",&changed).await.unwrap());
            let before:i64=sqlx::query_scalar("SELECT count(*) FROM payment_callback_verification WHERE order_id=$1").bind(order.id).fetch_one(&pool).await.unwrap();
            assert_eq!(before,0);
            store.verify_payment_callback(order.id,"stripe",&digest).await.unwrap();
            let unpaid:i64=sqlx::query_scalar("SELECT count(*) FROM payment_callback_verification WHERE order_id=$1").bind(order.id).fetch_one(&pool).await.unwrap();
            assert_eq!(unpaid,0, "signature receipt without settlement is insufficient");
            store.settle_verified_customer_topup(company,order.id,&session,2_000_000_000).await.unwrap();
            store.verify_payment_callback(order.id,"stripe",&changed).await.unwrap();
            assert!(!store.payment_callback_verified("stripe",&changed).await.unwrap());
            store.verify_payment_callback(order.id,"stripe",&digest).await.unwrap();
            let receipt:Option<String>=sqlx::query_scalar("SELECT verified_at::text FROM payment_callback_verification WHERE order_id=$1").bind(order.id).fetch_optional(&pool).await.unwrap();
            assert_eq!(receipt.is_some(),!legacy);
            store.verify_payment_callback(order.id,"stripe",&digest).await.unwrap();
            let replay:Option<String>=sqlx::query_scalar("SELECT verified_at::text FROM payment_callback_verification WHERE order_id=$1").bind(order.id).fetch_optional(&pool).await.unwrap();
            assert_eq!(receipt,replay,"replay cannot refresh verification time");
        }
        assert!(store.payment_callback_verified("stripe",&digest).await.unwrap());
        assert!(!store.payment_callback_verified("epay",&digest).await.unwrap());
        assert!(store.payment_callback_verified("mock",&digest).await.is_err());
    }

    #[sqlx::test(migrations = "../../crates/storage/migrations")]
    #[ignore = "requires PostgreSQL"]
    async fn native_notification_qualification_requires_both_receipt_and_settlement(pool: sqlx::PgPool) {
        let store=niu_storage::Store::from_pool(pool.clone());
        let company=store.create_prepaid_organization("Native callback proof","CNY").await.unwrap();
        for receipt_first in [true,false] {
            let digest=if receipt_first {[31u8;32]}else{[32u8;32]};
            let changed=[33u8;32];
            let order=store.create_customer_topup(company,&niu_storage::TopupInput{currency:"CNY",amount_nanos:1_000_000_000,aggregator:"zhifux",merchant:"fixture",payment_method:"wxpaynative",idempotency_key:uuid::Uuid::new_v4()}).await.unwrap();
            assert!(store.claim_customer_topup_creation(company,order.id).await.unwrap());
            store.bind_payment_checkout_verification(order.id,"zhifux",&digest).await.unwrap();
            let reference=format!("native{}",order.id.simple());
            store.bind_customer_topup_provider(company,order.id,&reference).await.unwrap();
            store.record_payment_signed_notification(order.id,"zhifux",&changed).await.unwrap();
            if receipt_first {store.record_payment_signed_notification(order.id,"zhifux",&digest).await.unwrap();}
            assert!(!store.payment_callback_verified("zhifux",&digest).await.unwrap());
            store.settle_verified_customer_topup(company,order.id,&reference,1_000_000_000).await.unwrap();
            assert_eq!(store.payment_callback_verified("zhifux",&digest).await.unwrap(),receipt_first,"settlement without a bound notification is insufficient; committed receipt plus settlement needs no later worker write");
            store.record_payment_signed_notification(order.id,"zhifux",&digest).await.unwrap();
            store.record_payment_signed_notification(order.id,"zhifux",&digest).await.unwrap();
            assert!(store.payment_callback_verified("zhifux",&digest).await.unwrap());
            assert!(!store.payment_callback_verified("zhifux",&changed).await.unwrap());
            let count:i64=sqlx::query_scalar("SELECT count(*) FROM payment_signed_notifications WHERE order_id=$1").bind(order.id).fetch_one(&pool).await.unwrap();
            assert_eq!(count,1);
        }
    }

    #[sqlx::test(migrations = "../../crates/storage/migrations")]
    #[ignore = "requires PostgreSQL"]
    async fn payment_verification_is_bound_to_configuration_kind_and_start_order(pool: sqlx::PgPool) {
        let store = niu_storage::Store::from_pool(pool.clone());
        let digest = [1u8; 32];
        assert!(!store.payment_verification_valid("stripe", &digest, "account").await.unwrap());
        let old = store.begin_payment_verification("stripe", &digest, "account").await.unwrap();
        let current = store.begin_payment_verification("stripe", &digest, "account").await.unwrap();
        store.finish_payment_verification(current, None).await.unwrap();
        store.finish_payment_verification(old, Some(60)).await.unwrap();
        assert!(!store.payment_verification_valid("stripe", &digest, "account").await.unwrap(), "late success must not supersede newer failed verification");
        let successful = store.begin_payment_verification("stripe", &digest, "account").await.unwrap();
        store.finish_payment_verification(successful, Some(60)).await.unwrap();
        assert!(store.payment_verification_valid("stripe", &digest, "account").await.unwrap());
        let outage = store.begin_payment_verification("stripe", &digest, "account").await.unwrap();
        assert!(store.payment_verification_valid("stripe", &digest, "account").await.unwrap(), "background refresh must not interrupt still-valid evidence");
        store.payment_verification_unavailable(outage).await.unwrap();
        assert!(store.payment_verification_valid("stripe", &digest, "account").await.unwrap(), "transient unavailability preserves only the original bounded validity");
        assert!(store.payment_verification_unavailable(outage).await.is_err());
        assert!(!store.payment_verification_valid("stripe", &[2u8;32], "account").await.unwrap());
        assert!(!store.payment_verification_valid("epay", &digest, "account").await.unwrap());
        assert!(!store.payment_verification_valid("stripe", &digest, "callback").await.unwrap());
        assert!(store.finish_payment_verification(successful, None).await.is_err());
        assert!(store.begin_payment_verification("mock", &digest, "account").await.is_err());
        assert!(store.begin_payment_verification("stripe", &[0u8;31], "account").await.is_err());
        sqlx::query("UPDATE payment_verification_evidence SET completed_at=now()-interval '2 minutes',expires_at=now()-interval '1 minute' WHERE id=$1")
            .bind(successful).execute(&pool).await.unwrap();
        assert!(!store.payment_verification_valid("stripe", &digest, "account").await.unwrap());
        let pending = store.begin_payment_verification("stripe", &digest, "account").await.unwrap();
        assert!(!store.payment_verification_valid("stripe", &digest, "account").await.unwrap());
        assert!(store.finish_payment_verification(pending, Some(0)).await.is_err());
        assert!(store.finish_payment_verification(pending, Some(2_592_001)).await.is_err());
        let reopened = niu_storage::Store::from_pool(pool.clone());
        assert!(!reopened.payment_verification_valid("stripe", &digest, "account").await.unwrap());
        store.finish_payment_verification(pending, Some(60)).await.unwrap();
        assert!(reopened.payment_verification_valid("stripe", &digest, "account").await.unwrap());
    }

    #[sqlx::test(migrations = "../../crates/storage/migrations")]
    #[ignore = "requires PostgreSQL"]
    async fn payment_readiness_gates_and_recovers_without_mutating_customer_data(
        pool: sqlx::PgPool,
    ) {
        use http_body_util::BodyExt;
        use std::sync::Arc;
        use tower::ServiceExt;
        let store = niu_storage::Store::from_pool(pool);
        let scope = store.default_prepaid_workspace().await.unwrap();
        let keys = format!("/api/v1/workspaces/{}/keys",scope.project_id);
        let mut state = AppState::new(
            toml::from_str("[models]").unwrap(),
            store.clone(),
            crate::state::TokenSet::parse(
                "NIU_ADMIN_TOKENS",
                "readiness-fixture-administrator-token".into(),
            )
            .unwrap(),
            std::collections::HashMap::new(),
        );
        assert_eq!(
            inspect(&state).await.unwrap().reason,
            Some("currency_required")
        );
        store.configure_platform_currency("USD").await.unwrap();
        assert_eq!(
            inspect(&state).await.unwrap().reason,
            Some("payment_setup_required")
        );
        let app = crate::web::router(state.clone());
        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri(keys.as_str())
                    .header(
                        "authorization",
                        "Bearer readiness-fixture-administrator-token",
                    )
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(
            response.status(),
            axum::http::StatusCode::SERVICE_UNAVAILABLE
        );
        let body: serde_json::Value =
            serde_json::from_slice(&response.into_body().collect().await.unwrap().to_bytes())
                .unwrap();
        assert_eq!(body["error"]["type"], "payment_setup_required");
        let response = app
            .oneshot(
                Request::builder()
                    .uri(keys.as_str())
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), axum::http::StatusCode::UNAUTHORIZED);
        let checkout = |currency: &str, methods: Vec<String>| {
            Some(super::super::StripeCheckout {
                client: niu_payments::stripe_transport::Client::new(
                    "sk_test_readiness_fixture_key_1234567890".into(),
                    false,
                )
                .unwrap(),
                currency: currency.into(),
                methods,
                success_url: "https://example.test/success".into(),
                cancel_url: "https://example.test/cancel".into(),
            })
        };
        state.stripe_payments = Some(Arc::new(super::super::StripeRuntime {
            merchant: "ReadinessFixture".into(),
            endpoint_secret: "whsec_fixture_readiness_1234567890".into(),
            live_mode: false,
            checkout: checkout("cny", vec!["card".into()]),
        }));
        assert!(!inspect(&state).await.unwrap().ready);
        Arc::get_mut(state.stripe_payments.as_mut().unwrap())
            .unwrap()
            .checkout = checkout("usd", vec![]);
        assert!(!inspect(&state).await.unwrap().ready);
        Arc::get_mut(state.stripe_payments.as_mut().unwrap())
            .unwrap()
            .checkout = checkout("usd", vec!["card".into()]);
        assert!(!inspect(&state).await.unwrap().ready,"saved configuration alone cannot qualify");
        let digest = stripe_configuration_digest(state.stripe_payments.as_ref().unwrap(),"USD").unwrap();
        let check = store.begin_payment_verification("stripe",&digest,"account").await.unwrap();
        store.finish_payment_verification(check,Some(600)).await.unwrap();
        assert!(!inspect(&state).await.unwrap().ready,"merchant account alone does not prove callback integration");
        qualify_test_gateway(&state,"USD").await;
        assert!(inspect(&state).await.unwrap().ready);
        let response = crate::web::router(state.clone())
            .oneshot(
                Request::builder()
                    .uri(keys.as_str())
                    .header(
                        "authorization",
                        "Bearer readiness-fixture-administrator-token",
                    )
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), axum::http::StatusCode::OK);

        let unavailable = store.begin_payment_verification("stripe",&digest,"account").await.unwrap();
        store.payment_verification_unavailable(unavailable).await.unwrap();
        assert!(inspect(&state).await.unwrap().ready,"temporary check outage retains unexpired evidence");
        let rejected = store.begin_payment_verification("stripe",&digest,"account").await.unwrap();
        store.finish_payment_verification(rejected,None).await.unwrap();
        assert!(!inspect(&state).await.unwrap().ready,"rejected merchant revokes readiness despite prior successful callback");
        let recovered = store.begin_payment_verification("stripe",&digest,"account").await.unwrap();
        store.finish_payment_verification(recovered,Some(600)).await.unwrap();
        assert!(inspect(&state).await.unwrap().ready,"recovery reuses only unchanged configuration-bound callback evidence");
        Arc::get_mut(state.stripe_payments.as_mut().unwrap()).unwrap().endpoint_secret.push_str("changed");
        assert!(!inspect(&state).await.unwrap().ready,"credential changes cannot reuse old qualification");

        // Removing the last configured method must close the same entry again.
        // The public readiness read and administrator recovery route remain reachable.
        state.stripe_payments = None;
        let app = crate::web::router(state);
        for (path, expected) in [
            (
                keys.as_str(),
                axum::http::StatusCode::SERVICE_UNAVAILABLE,
            ),
            ("/api/v1/payments/readiness", axum::http::StatusCode::OK),
            ("/api/v1/platform/payments/epay", axum::http::StatusCode::OK),
        ] {
            let response = app
                .clone()
                .oneshot(
                    Request::builder()
                        .uri(path)
                        .header(
                            "authorization",
                            "Bearer readiness-fixture-administrator-token",
                        )
                        .body(Body::empty())
                        .unwrap(),
                )
                .await
                .unwrap();
            assert_eq!(response.status(), expected, "{path}");
        }
    }
}

/// Real configuration validation with inert test credentials; never contacts a merchant.
#[cfg(test)]
pub(crate) async fn configure_test_gateway(state: &mut AppState) {
    configure_test_gateway_currency(state, "usd").await;
}

#[cfg(test)]
pub(crate) async fn configure_test_gateway_currency(state: &mut AppState, currency: &str) {
    state.stripe_payments = Some(std::sync::Arc::new(super::StripeRuntime {
        merchant: "ReadinessFixture".into(),
        endpoint_secret: "whsec_readiness_fixture_1234567890".into(),
        live_mode: false,
        checkout: Some(super::StripeCheckout {
            client: niu_payments::stripe_transport::Client::new(
                "sk_test_readiness_fixture_1234567890".into(),
                false,
            )
            .unwrap(),
            currency: currency.into(),
            methods: vec!["card".into()],
            success_url: "https://example.test/success".into(),
            cancel_url: "https://example.test/cancel".into(),
        }),
    }));
    qualify_test_gateway(state, &currency.to_ascii_uppercase()).await;
}

/// Synthetic evidence uses the real storage constraints; no production bypass or merchant call.
#[cfg(test)]
async fn qualify_test_gateway(state: &AppState, currency: &str) {
    let runtime = state.stripe_payments.as_ref().unwrap();
    let digest = stripe_configuration_digest(runtime, currency).unwrap();
    let check = state.store.begin_payment_verification("stripe", &digest, "account").await.unwrap();
    state.store.finish_payment_verification(check, Some(600)).await.unwrap();
    let company = state.store.create_prepaid_organization("Isolated merchant verification",currency).await.unwrap();
    let order = state.store.create_customer_topup(company, &niu_storage::TopupInput {
        currency,amount_nanos:2_000_000_000,aggregator:"stripe",merchant:&runtime.merchant,
        payment_method:"card",idempotency_key:uuid::Uuid::new_v4(),
    }).await.unwrap();
    assert!(state.store.claim_customer_topup_creation(company,order.id).await.unwrap());
    state.store.bind_payment_checkout_verification(order.id,"stripe",&digest).await.unwrap();
    let session=format!("cs_test_{}",order.id.simple());
    state.store.bind_customer_topup_checkout(company,order.id,&session,&format!("https://checkout.stripe.com/c/pay/{session}")).await.unwrap();
    state.store.settle_verified_customer_topup(company,order.id,&session,2_000_000_000).await.unwrap();
    state.store.verify_payment_callback(order.id,"stripe",&digest).await.unwrap();
}
