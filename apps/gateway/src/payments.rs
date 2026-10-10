//! Trusted merchant reconciliation. No browser-return URL grants funding.
mod configuration;
use crate::{error::ApiError, state::AppState};
use axum::{
    Form, Json,
    extract::{Path, Query, State},
    http::HeaderMap,
};
pub(crate) use configuration::{read as read_configuration_api, save as save_configuration_api};
use niu_payments::{
    zhifux::{Callback, ExpectedOrder, Merchant, cny_decimal},
    zhifux_transport::{Client, VerifiedOrder},
};
use niu_storage::AdminPermission;
use serde::Deserialize;
use serde_json::{Value, json};
use std::{
    env,
    io::Read,
    path::Path as FilePath,
    time::{Duration, Instant},
};
use tokio::sync::Mutex;
use uuid::Uuid;

/// Product support inventory, independent of merchant activation or live qualification.
/// ```openapi
/// {
///   "path": "/admin/v1/platform/payments/integrations",
///   "method": "get",
///   "operation": {
///     "operationId": "listPaymentIntegrations",
///     "summary": "List supported payment integrations",
///     "description": "Installation administrator only. Capability inventory is independent of merchant activation. Returns no merchant configuration or credentials. Refunds means refund initiation; query recovery is limited to the declared scope.",
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "x-niu-implementation": "implemented",
///     "responses": {
///       "200": {
///         "description": "Supported integrations, not enabled customer checkout methods",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "required": [
///                 "data"
///               ],
///               "properties": {
///                 "data": {
///                   "type": "array",
///                   "items": {
///                     "type": "object",
///                     "additionalProperties": false,
///                     "required": [
///                       "id",
///                       "name",
///                       "configuration",
///                       "checkout",
///                       "signed_notifications",
///                       "query_recovery",
///                       "refunds"
///                     ],
///                     "properties": {
///                       "id": {
///                         "type": "string",
///                         "enum": [
///                           "epay",
///                           "stripe",
///                           "zhifux"
///                         ]
///                       },
///                       "name": {
///                         "type": "string"
///                       },
///                       "configuration": {
///                         "type": "string",
///                         "enum": [
///                           "administration_api",
///                           "server_environment",
///                           "server_file"
///                         ]
///                       },
///                       "checkout": {
///                         "type": "boolean"
///                       },
///                       "signed_notifications": {
///                         "type": "boolean"
///                       },
///                       "query_recovery": {
///                         "type": "string",
///                         "enum": [
///                           "unsupported",
///                           "bound_session",
///                           "saved_order"
///                         ]
///                       },
///                       "refunds": {
///                         "type": "boolean"
///                       }
///                     }
///                   }
///                 }
///               }
///             }
///           }
///         }
///       },
///       "401": {
///         "description": "Authentication required"
///       },
///       "403": {
///         "description": "Installation administrator required"
///       }
///     }
///   }
/// }
/// ```
pub(crate) async fn integrations(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    let authorization = state
        .authorize_admin_headers(&headers, AdminPermission::Read)
        .await?;
    if !authorization.is_installation() {
        return Err(ApiError::forbidden());
    }
    Ok(Json(json!({"data": [
        {"id":"epay", "name":"EPay-compatible gateway", "configuration":"administration_api",
         "checkout":true, "signed_notifications":true, "query_recovery":"unsupported",
         "refunds":false},
        {"id":"stripe", "name":"Stripe", "configuration":"server_environment",
         "checkout":true, "signed_notifications":true, "query_recovery":"bound_session",
         "refunds":false},
        {"id":"zhifux", "name":"PaymentFM native API", "configuration":"server_file",
         "checkout":true, "signed_notifications":true, "query_recovery":"saved_order",
         "refunds":false}
    ]})))
}

// Not Debug or Serialize: this file contains merchant credentials.
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Configuration {
    api_root: String,
    merchant: String,
    secret: String,
    checkout_origins: Vec<String>,
    notify_url: String,
    payment_methods: Vec<String>,
}
fn read_configuration(path: &FilePath) -> Result<Configuration, &'static str> {
    let metadata =
        std::fs::symlink_metadata(path).map_err(|_| "Cannot read private payment configuration")?;
    if !metadata.is_file() {
        return Err("Invalid private payment configuration file");
    }
    let mut options = std::fs::OpenOptions::new();
    options.read(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.custom_flags(libc::O_NOFOLLOW | libc::O_NONBLOCK);
    }
    let file = options
        .open(path)
        .map_err(|_| "Cannot read private payment configuration")?;
    // Check the opened descriptor, so replacing the path cannot bypass limits.
    let metadata = file
        .metadata()
        .map_err(|_| "Cannot read private payment configuration")?;
    if !metadata.is_file() || metadata.len() > 16 * 1024 {
        return Err("Invalid private payment configuration file");
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if metadata.permissions().mode() & 0o077 != 0 {
            return Err("Payment configuration must be readable only by its owner");
        }
    }
    let mut bytes = Vec::new();
    file.take(16 * 1024 + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| "Cannot read private payment configuration")?;
    if bytes.len() > 16 * 1024 {
        return Err("Invalid private payment configuration file");
    }
    serde_json::from_slice(&bytes).map_err(|_| "Invalid private payment configuration")
}
pub(crate) struct Runtime {
    callback_merchant: Merchant,
    merchant: String,
    client: Client,
    query_started: Mutex<Option<Instant>>,
    notify_url: String,
    payment_methods: Vec<String>,
}
impl Runtime {
    pub(crate) async fn recover_next(
        &self,
        state: &AppState,
        after: Option<Uuid>,
    ) -> Result<Option<Uuid>, ApiError> {
        let Some(order) = state
            .store
            .pending_customer_topup("zhifux", &self.merchant, after)
            .await
            .map_err(ApiError::from_store)?
        else {
            return Ok(None);
        };
        // Advance even for an unresolved order so it cannot starve later orders.
        // The next traversal retries it; no creation request is ever issued here.
        if self
            .settle(state, order.organization_id, order.id)
            .await
            .is_err()
        {
            tracing::debug!("Saved payment remains unresolved; reconciliation will retry");
        }
        Ok(Some(order.id))
    }

    pub(crate) async fn from_env() -> Result<Option<Self>, Box<dyn std::error::Error>> {
        let Some(path) = env::var_os("NIU_ZHIFUX_CONFIG_FILE") else {
            return Ok(None);
        };
        let configuration = read_configuration(FilePath::new(&path))?;
        let callback_merchant =
            Merchant::new(configuration.merchant.clone(), configuration.secret.clone())?;
        let merchant = Merchant::new(configuration.merchant.clone(), configuration.secret)?;
        if configuration.payment_methods.is_empty() || configuration.payment_methods.len() > 16 {
            return Err("Configure between one and sixteen qualified payment methods".into());
        }
        let mut unique = std::collections::HashSet::new();
        for method in &configuration.payment_methods {
            if !unique.insert(method) {
                return Err("Duplicate payment method configuration".into());
            }
            merchant.start_parameters(
                "ConfigurationCheck",
                1_000_000_000,
                method,
                &configuration.notify_url,
            )?;
        }
        let client = Client::new(
            &configuration.api_root,
            merchant,
            &configuration.checkout_origins,
        )
        .await?;
        Ok(Some(Self {
            callback_merchant,
            merchant: configuration.merchant,
            client,
            query_started: Mutex::new(None),
            notify_url: configuration.notify_url,
            payment_methods: configuration.payment_methods,
        }))
    }

    async fn settle(
        &self,
        state: &AppState,
        organization: Uuid,
        order: Uuid,
    ) -> Result<(), ApiError> {
        let saved = state
            .store
            .customer_topup(organization, order)
            .await
            .map_err(ApiError::from_store)?
            .ok_or_else(ApiError::not_found)?;
        if saved.aggregator != "zhifux"
            || saved.merchant != self.merchant
            || saved.currency != "CNY"
        {
            return Err(ApiError::invalid_request(
                "Saved payment requires its original merchant and currency configuration",
            ));
        }
        cny_decimal(saved.amount_nanos).map_err(|_| {
            ApiError::invalid_request("Saved payment amount requires reconciliation")
        })?;
        // Enforce merchant query spacing without an unbounded waiting queue.
        // The lock covers query and settlement; failures also consume spacing.
        let mut started = self.query_started.try_lock().map_err(|_| {
            ApiError::upstream_message("Payment reconciliation is busy; retry later")
        })?;
        if started.is_some_and(|time| time.elapsed() < Duration::from_secs(3)) {
            return Err(ApiError::upstream_message(
                "Payment reconciliation is rate limited; retry later",
            ));
        }
        *started = Some(Instant::now());
        if !state
            .store
            .claim_payment_query("zhifux", &self.merchant)
            .await
            .map_err(ApiError::from_store)?
        {
            return Err(ApiError::upstream_message(
                "Payment reconciliation is rate limited; retry later",
            ));
        }
        let number = order.simple().to_string();
        let evidence = self
            .client
            .query_order(&number, saved.amount_nanos, &saved.payment_method)
            .await
            .map_err(|error| {
                if let niu_payments::zhifux_transport::Error::Rejected { code } = error {
                    tracing::warn!(code, "Payment query rejected; saved order remains unresolved");
                    ApiError::upstream_message(if code == 6003 {
                        "Payment merchant query access is not enabled (code 6003); saved order requires reconciliation"
                    } else {
                        "Payment query was rejected; saved order requires reconciliation"
                    })
                } else {
                    ApiError::upstream_message(
                        "Payment is not independently confirmed; saved order requires reconciliation",
                    )
                }
            })?;
        apply_verified_order(&state.store, organization, order, evidence).await
    }
}

/// Only independently verified merchant query evidence reaches this path.
async fn apply_verified_order(
    store: &niu_storage::Store,
    organization: Uuid,
    order: Uuid,
    evidence: VerifiedOrder,
) -> Result<(), ApiError> {
    let evidence = match evidence {
        VerifiedOrder::Pending { platform_reference } => {
            store
                .bind_customer_topup_provider(organization, order, &platform_reference)
                .await
                .map_err(ApiError::from_store)?;
            return Err(ApiError::upstream_message("Payment is still pending"));
        }
        VerifiedOrder::Closed { platform_reference } => {
            store
                .bind_customer_topup_provider(organization, order, &platform_reference)
                .await
                .map_err(ApiError::from_store)?;
            store
                .close_verified_customer_topup(organization, order, &platform_reference)
                .await
                .map_err(ApiError::from_store)?;
            return Ok(());
        }
        VerifiedOrder::Paid(payment) => payment,
    };
    store
        .bind_customer_topup_provider(organization, order, &evidence.platform_reference)
        .await
        .map_err(ApiError::from_store)?;
    store
        .settle_verified_customer_topup(
            organization,
            order,
            &evidence.platform_reference,
            evidence.amount_nanos,
        )
        .await
        .map_err(ApiError::from_store)?;
    Ok(())
}

#[derive(Clone, Copy, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub(crate) enum PaymentGatewaySelection {
    Epay,
    Stripe,
    Zhifux,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct CreateTopup {
    payment_gateway: Option<PaymentGatewaySelection>,
    currency: Option<String>,
    amount_nanos: String,
    payment_method: String,
    idempotency_key: Uuid,
}

// Extra unsigned vendor fields are deliberately ignored, never funding evidence.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Notification {
    merchant_num: String,
    order_no: String,
    amount: String,
    state: String,
    sign: String,
}
async fn accept_notification(
    store: &niu_storage::Store,
    merchant: &Merchant,
    merchant_number: &str,
    input: &Notification,
) -> Result<(), ApiError> {
    if input.order_no.len() != 32 || !input.order_no.bytes().all(|b| b.is_ascii_hexdigit()) {
        return Err(ApiError::invalid_request("Invalid payment notification"));
    }
    let order = Uuid::parse_str(&input.order_no)
        .map_err(|_| ApiError::invalid_request("Invalid payment notification"))?;
    let saved = store
        .customer_topup_for_callback("zhifux", merchant_number, order)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::not_found)?;
    if saved.currency != "CNY" {
        return Err(ApiError::invalid_request("Invalid payment notification"));
    }
    let number = order.simple().to_string();
    merchant
        .verify_callback(
            &ExpectedOrder {
                number: &number,
                platform_number: "",
                amount_nanos: saved.amount_nanos,
                pay_type: &saved.payment_method,
            },
            &Callback {
                merchant: &input.merchant_num,
                order: &input.order_no,
                state: &input.state,
                amount: &input.amount,
                signature: &input.sign,
            },
        )
        .map_err(|_| ApiError::invalid_request("Invalid payment notification"))?;
    store
        .record_verified_topup_notification(saved.organization_id, order)
        .await
        .map_err(ApiError::from_store)
}

pub(crate) async fn notify(
    State(state): State<AppState>,
    Form(input): Form<Notification>,
) -> Result<&'static str, ApiError> {
    let runtime = state
        .payments
        .as_ref()
        .ok_or_else(|| ApiError::upstream_message("Payment integration is not configured"))?;
    // A receipt commits before acknowledgment; the worker independently verifies
    // actual payment. This callback never creates a paid ledger entry.
    tokio::time::timeout(
        Duration::from_secs(2),
        accept_notification(
            &state.store,
            &runtime.callback_merchant,
            &runtime.merchant,
            &input,
        ),
    )
    .await
    .map_err(|_| {
        ApiError::upstream_message("Payment notification processing timed out; retry delivery")
    })??;
    Ok("success")
}

/// ```openapi
/// {
///   "path": "/admin/v1/organizations/{organization}/billing/topups",
///   "method": "post",
///   "operation": {
///     "operationId": "createCustomerTopup",
///     "summary": "Create or recover a company prepaid top-up",
///     "description": "Organization-wide owner/admin with write access or installation administrator only. Requires an enabled method and an existing account in the selected integration's currency. Classic EPay and native Zhifux use CNY; Stripe uses its configured supported currency. Exact positive amounts must match the integration's minor-unit precision. No implicit account creation, FX or approved credit. Reuse the same idempotency key and identical intent after an uncertain response. Remote creation is durably claimed before contact and never automatically repeated; EPay saves a deterministic signed checkout locally. Checkout alone grants no balance. Independently verified payment gates funding. Merchant credentials and enabled methods are deployment configuration. An explicit payment_gateway never falls through to another integration. Omission preserves runtime priority for compatibility.",
///     "requestBody": {
///       "required": true,
///       "content": {
///         "application/json": {
///           "schema": {
///             "type": "object",
///             "additionalProperties": false,
///             "required": [
///               "amount_nanos",
///               "payment_method",
///               "idempotency_key"
///             ],
///             "properties": {
///               "currency": {
///                 "type": "string",
///                 "pattern": "^[A-Z]{3}$",
///                 "description": "Optional account currency. Selects a matching enabled integration; omission preserves existing default priority. Never implies conversion."
///               },
///               "payment_gateway": {
///                 "type": "string",
///                 "enum": [
///                   "epay",
///                   "stripe",
///                   "zhifux"
///                 ],
///                 "description": "Optional explicit integration. Never falls through to a different gateway; omission preserves default priority."
///               },
///               "amount_nanos": {
///                 "type": "string",
///                 "pattern": "^[0-9]+$",
///                 "description": "Exact positive account-currency nanounits, at most 9223372036854775807. CNY requires divisibility by 10000000; other currencies require their supported minor-unit precision. Never a JSON number."
///               },
///               "payment_method": {
///                 "type": "string",
///                 "minLength": 1,
///                 "maxLength": 64,
///                 "pattern": "^[A-Za-z0-9.-]+$",
///                 "description": "Must be enabled for the configured merchant."
///               },
///               "idempotency_key": {
///                 "type": "string",
///                 "format": "uuid"
///               }
///             }
///           }
///         }
///       }
///     },
///     "responses": {
///       "200": {
///         "description": "Saved top-up status; checkout and pending status confer no spending capacity",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "required": [
///                 "data"
///               ],
///               "properties": {
///                 "data": {
///                   "type": "object",
///                   "additionalProperties": false,
///                   "required": [
///                     "id",
///                     "currency",
///                     "amount_nanos",
///                     "payment_method",
///                     "status",
///                     "checkout_url"
///                   ],
///                   "properties": {
///                     "id": {
///                       "type": "string",
///                       "format": "uuid",
///                       "description": "Internal API routing reference; never display as a product label."
///                     },
///                     "currency": {
///                       "type": "string",
///                       "pattern": "^[A-Z]{3}$",
///                       "description": "Immutable saved account currency; no implicit conversion."
///                     },
///                     "amount_nanos": {
///                       "type": "string",
///                       "pattern": "^[0-9]+$"
///                     },
///                     "payment_method": {
///                       "type": "string"
///                     },
///                     "status": {
///                       "type": "string",
///                       "enum": [
///                         "reconciliation_required",
///                         "pending",
///                         "paid",
///                         "closed"
///                       ]
///                     },
///                     "checkout_url": {
///                       "type": [
///                         "string",
///                         "null"
///                       ],
///                       "format": "uri",
///                       "description": "Validated HTTPS checkout for pending orders only; null for paid and closed orders."
///                     }
///                   }
///                 }
///               }
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Invalid amount or unavailable payment method"
///       },
///       "401": {
///         "description": "Authentication required"
///       },
///       "403": {
///         "description": "Write permission required"
///       },
///       "404": {
///         "description": "Company billing access not granted"
///       },
///       "409": {
///         "description": "Missing currency account or conflicting saved intent"
///       },
///       "422": {
///         "description": "Invalid body schema or unexpected field"
///       },
///       "502": {
///         "description": "Integration unavailable or checkout creation uncertain; preserve the intent and idempotency key"
///       },
///       "503": {
///         "description": "Durable storage unavailable; no successful creation is implied"
///       }
///     },
///     "parameters": [
///       {
///         "name": "organization",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       }
///     ],
///     "x-niu-implementation": "implemented",
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ]
///   }
/// }
/// ```
pub(crate) async fn create_topup(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(organization): Path<Uuid>,
    Json(input): Json<CreateTopup>,
) -> Result<Json<Value>, ApiError> {
    let auth = state
        .authorize_admin_headers(&headers, AdminPermission::Write)
        .await?;
    if !auth.permits_billing_account(organization) {
        return Err(ApiError::not_found());
    }
    if input.currency.as_ref().is_some_and(|currency| {
        currency.len() != 3 || !currency.bytes().all(|b| b.is_ascii_uppercase())
    }) {
        return Err(ApiError::invalid_request(
            "Provide a three-letter uppercase currency",
        ));
    }
    if input.amount_nanos.is_empty()
        || !input.amount_nanos.bytes().all(|byte| byte.is_ascii_digit())
        || !input
            .amount_nanos
            .parse::<i64>()
            .is_ok_and(|amount| amount > 0)
    {
        return Err(ApiError::invalid_request(
            "Provide an exact positive top-up amount within the supported integer range",
        ));
    }
    if input.payment_method.is_empty()
        || input.payment_method.len() > 64
        || !input
            .payment_method
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'-'))
    {
        return Err(ApiError::invalid_request(
            "Choose an enabled payment method",
        ));
    }
    // Reject unauthorized or malformed requests before joining the checkout
    // configuration queue. Concurrent checkouts share a read guard while
    // merchant configuration changes require exclusive access.
    let _configuration_guard = state.payment_configuration_guard.read().await;
    let epay = configuration::runtime(&state).await?;
    if let Some(runtime) = epay.as_ref()
        && input
            .payment_gateway
            .is_none_or(|gateway| gateway == PaymentGatewaySelection::Epay)
        && let Some(checkout) = runtime.checkout.as_ref()
        && checkout.methods.contains(&input.payment_method)
        && input
            .currency
            .as_deref()
            .is_none_or(|currency| currency == "CNY")
    {
        return create_epay_topup(&state, organization, runtime, checkout, input).await;
    }
    if let Some(runtime) = state.stripe_payments.as_ref()
        && input
            .payment_gateway
            .is_none_or(|gateway| gateway == PaymentGatewaySelection::Stripe)
        && let Some(checkout) = runtime.checkout.as_ref()
        && checkout.methods.contains(&input.payment_method)
        && input
            .currency
            .as_deref()
            .is_none_or(|currency| currency.eq_ignore_ascii_case(&checkout.currency))
    {
        return create_stripe_topup(&state, organization, runtime, checkout, input).await;
    }
    if input
        .payment_gateway
        .is_some_and(|gateway| gateway != PaymentGatewaySelection::Zhifux)
    {
        return Err(ApiError::invalid_request(
            "Choose an enabled method and currency for this payment gateway",
        ));
    }
    if input
        .currency
        .as_deref()
        .is_some_and(|currency| currency != "CNY")
    {
        return Err(ApiError::invalid_request(
            "Choose an enabled method for this currency",
        ));
    }
    let runtime = state
        .payments
        .as_ref()
        .ok_or_else(|| ApiError::upstream_message("Payment integration is not configured"))?;
    if !runtime.payment_methods.contains(&input.payment_method) {
        return Err(ApiError::invalid_request(
            "Choose an enabled payment method",
        ));
    }
    if input.amount_nanos.is_empty() || !input.amount_nanos.bytes().all(|b| b.is_ascii_digit()) {
        return Err(ApiError::invalid_request(
            "Provide an exact positive CNY amount",
        ));
    }
    let amount = input
        .amount_nanos
        .parse::<i64>()
        .map_err(|_| ApiError::invalid_request("Provide an exact positive CNY amount"))?;
    cny_decimal(amount).map_err(|_| {
        ApiError::invalid_request(
            "CNY top-ups require a positive amount with at most two decimal places",
        )
    })?;
    let order = state
        .store
        .create_customer_topup(
            organization,
            &niu_storage::TopupInput {
                currency: "CNY",
                amount_nanos: amount,
                aggregator: "zhifux",
                merchant: &runtime.merchant,
                payment_method: &input.payment_method,
                idempotency_key: input.idempotency_key,
            },
        )
        .await
        .map_err(ApiError::from_store)?;
    if state
        .store
        .customer_topup_closed(organization, order.id)
        .await
        .map_err(ApiError::from_store)?
        == Some(true)
    {
        return topup_response(&state, organization, order.id).await;
    }
    if state
        .store
        .customer_topup_checkout(organization, order.id)
        .await
        .map_err(ApiError::from_store)?
        .is_none()
        && state
            .store
            .claim_customer_topup_creation(organization, order.id)
            .await
            .map_err(ApiError::from_store)?
    {
        let created = runtime.client.create_order(&order.id.simple().to_string(), amount, &input.payment_method, &runtime.notify_url).await
            .map_err(|_| ApiError::upstream_message("Checkout creation is uncertain; recover the saved top-up instead of creating another order"))?;
        state
            .store
            .bind_customer_topup_checkout(
                organization,
                order.id,
                &created.platform_reference,
                &created.checkout_url,
            )
            .await
            .map_err(ApiError::from_store)?;
    }
    topup_response(&state, organization, order.id).await
}

async fn topup_response(
    state: &AppState,
    organization: Uuid,
    order: Uuid,
) -> Result<Json<Value>, ApiError> {
    let saved = state
        .store
        .customer_topup(organization, order)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::not_found)?;
    let paid = state
        .store
        .customer_topup_paid(organization, order)
        .await
        .map_err(ApiError::from_store)?
        .unwrap_or(false);
    let closed = state
        .store
        .customer_topup_closed(organization, order)
        .await
        .map_err(ApiError::from_store)?
        .unwrap_or(false);
    let checkout = if paid || closed {
        None
    } else {
        state
            .store
            .customer_topup_checkout(organization, order)
            .await
            .map_err(ApiError::from_store)?
    };
    let status = if paid {
        "paid"
    } else if closed {
        "closed"
    } else if checkout.is_some() {
        "pending"
    } else {
        "reconciliation_required"
    };
    Ok(Json(
        json!({"data":{"id":saved.id,"currency":saved.currency,"amount_nanos":saved.amount_nanos.to_string(),"payment_method":saved.payment_method,"status":status,"checkout_url":checkout}}),
    ))
}

/// Company-scoped checkout availability; no credentials or upstream calls.
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct TopupHistoryQuery {
    before: Option<Uuid>,
}
/// ```openapi
/// {
///   "path": "/admin/v1/organizations/{organization}/billing/topups",
///   "method": "get",
///   "operation": {
///     "operationId": "listCustomerTopups",
///     "summary": "Recover company checkout history",
///     "description": "Organization-wide owner/admin with read access or installation administrator only. Backend-owned history survives browser changes. At most 100 saved intents per page, ordered by descending creation time and internal routing reference. No upstream calls, merchant credentials or procurement data. Paid/closed entries withhold checkout URLs. Traversal is a live view, not a fixed snapshot; refresh to see newly created orders. Internal IDs are routing/cursor references, never product labels.",
///     "parameters": [
///       {
///         "name": "organization",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       },
///       {
///         "name": "before",
///         "in": "query",
///         "required": false,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         },
///         "description": "next_cursor from the previous company page. Foreign or missing cursors return conflict."
///       }
///     ],
///     "responses": {
///       "200": {
///         "description": "Saved checkout history page",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "required": [
///                 "data",
///                 "next_cursor"
///               ],
///               "properties": {
///                 "next_cursor": {
///                   "type": [
///                     "string",
///                     "null"
///                   ],
///                   "format": "uuid"
///                 },
///                 "data": {
///                   "type": "array",
///                   "maxItems": 100,
///                   "items": {
///                     "type": "object",
///                     "additionalProperties": false,
///                     "required": [
///                       "id",
///                       "currency",
///                       "amount_nanos",
///                       "payment_method",
///                       "status",
///                       "checkout_url",
///                       "created_at"
///                     ],
///                     "properties": {
///                       "id": {
///                         "type": "string",
///                         "format": "uuid",
///                         "description": "Internal routing/cursor reference; never display as a product label."
///                       },
///                       "currency": {
///                         "type": "string",
///                         "pattern": "^[A-Z]{3}$"
///                       },
///                       "amount_nanos": {
///                         "type": "string",
///                         "pattern": "^[0-9]+$"
///                       },
///                       "payment_method": {
///                         "type": "string"
///                       },
///                       "status": {
///                         "type": "string",
///                         "enum": [
///                           "reconciliation_required",
///                           "pending",
///                           "paid",
///                           "closed"
///                         ]
///                       },
///                       "checkout_url": {
///                         "type": [
///                           "string",
///                           "null"
///                         ],
///                         "format": "uri"
///                       },
///                       "created_at": {
///                         "type": "string",
///                         "format": "date-time"
///                       }
///                     }
///                   }
///                 }
///               }
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Invalid company or cursor syntax"
///       },
///       "401": {
///         "description": "Authentication required"
///       },
///       "404": {
///         "description": "Company billing access not granted"
///       },
///       "409": {
///         "description": "Foreign or missing cursor"
///       },
///       "503": {
///         "description": "Durable storage unavailable"
///       }
///     },
///     "x-niu-implementation": "implemented",
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ]
///   }
/// }
/// ```
pub(crate) async fn topup_history(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(organization): Path<Uuid>,
    Query(query): Query<TopupHistoryQuery>,
) -> Result<Json<Value>, ApiError> {
    let auth = state
        .authorize_admin_headers(&headers, AdminPermission::Read)
        .await?;
    if !auth.permits_billing_account(organization) {
        return Err(ApiError::not_found());
    }
    let (data, next_cursor) = state
        .store
        .customer_topup_history(organization, query.before)
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({"data":data,"next_cursor":next_cursor})))
}

/// Company-scoped checkout availability; no credentials or upstream calls.
#[derive(Deserialize, Default)]
#[serde(deny_unknown_fields)]
pub(crate) struct PaymentMethodsQuery {
    currency: Option<String>,
    payment_gateway: Option<PaymentGatewaySelection>,
}
/// ```openapi
/// {
///   "path": "/admin/v1/organizations/{organization}/billing/payment-methods",
///   "method": "get",
///   "operation": {
///     "operationId": "getCustomerPaymentMethods",
///     "summary": "Read company checkout availability",
///     "description": "Organization-wide owner/admin with read access or installation administrator only. Returns enabled merchant method codes for the requested currency when configured and an account exists. Omitted currency preserves the configured default. No merchant credentials, account identifiers or upstream queries. Availability does not guarantee collection or grant write permission. No FX or account provisioning is implied.",
///     "parameters": [
///       {
///         "name": "organization",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       },
///       {
///         "name": "currency",
///         "in": "query",
///         "required": false,
///         "schema": {
///           "type": "string",
///           "pattern": "^[A-Z]{3}$"
///         }
///       },
///       {
///         "name": "payment_gateway",
///         "in": "query",
///         "required": false,
///         "schema": {
///           "type": "string",
///           "enum": [
///             "epay",
///             "stripe",
///             "zhifux"
///           ]
///         },
///         "description": "Select one configured integration without falling through to another."
///       }
///     ],
///     "responses": {
///       "200": {
///         "description": "Configured checkout methods or explicit unavailable state",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "required": [
///                 "data"
///               ],
///               "properties": {
///                 "data": {
///                   "type": "object",
///                   "additionalProperties": false,
///                   "required": [
///                     "currency",
///                     "payment_gateway",
///                     "available",
///                     "payment_methods",
///                     "unavailable_reason"
///                   ],
///                   "properties": {
///                     "currency": {
///                       "type": "string",
///                       "pattern": "^[A-Z]{3}$"
///                     },
///                     "available": {
///                       "type": "boolean"
///                     },
///                     "payment_methods": {
///                       "type": "array",
///                       "items": {
///                         "type": "string"
///                       },
///                       "description": "Empty when unavailable; exact configured codes otherwise."
///                     },
///                     "payment_gateway": {
///                       "type": [
///                         "string",
///                         "null"
///                       ],
///                       "enum": [
///                         "epay",
///                         "stripe",
///                         "zhifux",
///                         null
///                       ],
///                       "description": "Selected configured integration for these methods. Forward this value with currency when creating a top-up; null means no matching integration. This is adapter identity",
///                       "not merchant credentials or a payment-method display label.": null
///                     },
///                     "unavailable_reason": {
///                       "type": [
///                         "string",
///                         "null"
///                       ],
///                       "enum": [
///                         "integration_unavailable",
///                         "currency_account_missing",
///                         null
///                       ]
///                     }
///                   }
///                 }
///               }
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Invalid company identifier or currency query"
///       },
///       "401": {
///         "description": "Authentication required"
///       },
///       "404": {
///         "description": "Company billing access not granted"
///       },
///       "503": {
///         "description": "Durable account storage unavailable"
///       }
///     },
///     "x-niu-implementation": "implemented",
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ]
///   }
/// }
/// ```
pub(crate) async fn payment_methods(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(organization): Path<Uuid>,
    axum::extract::Query(query): axum::extract::Query<PaymentMethodsQuery>,
) -> Result<Json<Value>, ApiError> {
    let auth = state
        .authorize_admin_headers(&headers, AdminPermission::Read)
        .await?;
    if !auth.permits_billing_account(organization) {
        return Err(ApiError::not_found());
    }
    if query.currency.as_ref().is_some_and(|currency| {
        currency.len() != 3 || !currency.bytes().all(|b| b.is_ascii_uppercase())
    }) {
        return Err(ApiError::invalid_request(
            "Provide a three-letter uppercase currency",
        ));
    }
    let accounts = state
        .store
        .customer_balance_summary(organization)
        .await
        .map_err(ApiError::from_store)?;
    let epay = configuration::runtime(&state).await?;
    if let Some(checkout) = epay
        .as_ref()
        .and_then(|runtime| runtime.checkout.as_ref())
        .filter(|_| {
            query
                .payment_gateway
                .is_none_or(|gateway| gateway == PaymentGatewaySelection::Epay)
        })
        .filter(|_| {
            query
                .currency
                .as_deref()
                .is_none_or(|currency| currency == "CNY")
        })
    {
        let available = accounts.iter().any(|account| account["currency"] == "CNY");
        return Ok(Json(
            json!({"data":{"currency":"CNY","payment_gateway":"epay","available":available,
            "payment_methods":if available { checkout.methods.clone() } else { Vec::new() },
            "unavailable_reason":if available { None } else { Some("currency_account_missing") }}}),
        ));
    }
    if let Some(checkout) = state
        .stripe_payments
        .as_ref()
        .and_then(|runtime| runtime.checkout.as_ref())
        .filter(|_| {
            query
                .payment_gateway
                .is_none_or(|gateway| gateway == PaymentGatewaySelection::Stripe)
        })
        .filter(|checkout| {
            query
                .currency
                .as_deref()
                .is_none_or(|currency| currency.eq_ignore_ascii_case(&checkout.currency))
        })
    {
        let currency = checkout.currency.to_ascii_uppercase();
        let available = accounts
            .iter()
            .any(|account| account["currency"] == currency);
        return Ok(Json(
            json!({"data":{"currency":currency,"payment_gateway":"stripe","available":available,
            "payment_methods":if available { checkout.methods.clone() } else { Vec::new() },
            "unavailable_reason":if available { None } else { Some("currency_account_missing") }}}),
        ));
    }
    let currency = query.currency.as_deref().unwrap_or("CNY");
    let has_account = accounts
        .iter()
        .any(|account| account["currency"] == currency);
    let reason = if currency != "CNY"
        || state.payments.is_none()
        || query
            .payment_gateway
            .is_some_and(|gateway| gateway != PaymentGatewaySelection::Zhifux)
    {
        Some("integration_unavailable")
    } else if !has_account {
        Some("currency_account_missing")
    } else {
        None
    };
    let methods = if reason.is_none() {
        state
            .payments
            .as_ref()
            .map(|runtime| runtime.payment_methods.clone())
            .unwrap_or_default()
    } else {
        Vec::new()
    };
    Ok(Json(
        json!({"data":{"currency":currency,"payment_gateway":if reason == Some("integration_unavailable") { None } else { Some("zhifux") },"available":reason.is_none(),"payment_methods":methods,"unavailable_reason":reason}}),
    ))
}

/// Company-scoped status recovery reads durable records without upstream calls.
/// ```openapi
/// {
///   "path": "/admin/v1/organizations/{organization}/billing/topups/{order}",
///   "method": "get",
///   "operation": {
///     "operationId": "getCustomerTopup",
///     "summary": "Read saved company top-up status",
///     "description": "Organization-wide owner/admin with read access or installation administrator only. Reads durable records without querying the payment service. Paid and closed orders withhold checkout URLs. Internal routing references must not become product labels. No merchant, platform receipt, ledger identity, Supplier cost or margin is returned.",
///     "responses": {
///       "200": {
///         "description": "Saved top-up status; checkout and pending status confer no spending capacity",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "required": [
///                 "data"
///               ],
///               "properties": {
///                 "data": {
///                   "type": "object",
///                   "additionalProperties": false,
///                   "required": [
///                     "id",
///                     "currency",
///                     "amount_nanos",
///                     "payment_method",
///                     "status",
///                     "checkout_url"
///                   ],
///                   "properties": {
///                     "id": {
///                       "type": "string",
///                       "format": "uuid",
///                       "description": "Internal API routing reference; never display as a product label."
///                     },
///                     "currency": {
///                       "type": "string",
///                       "pattern": "^[A-Z]{3}$",
///                       "description": "Immutable saved account currency; no implicit conversion."
///                     },
///                     "amount_nanos": {
///                       "type": "string",
///                       "pattern": "^[0-9]+$"
///                     },
///                     "payment_method": {
///                       "type": "string"
///                     },
///                     "status": {
///                       "type": "string",
///                       "enum": [
///                         "reconciliation_required",
///                         "pending",
///                         "paid",
///                         "closed"
///                       ]
///                     },
///                     "checkout_url": {
///                       "type": [
///                         "string",
///                         "null"
///                       ],
///                       "format": "uri",
///                       "description": "Validated HTTPS checkout for pending orders only; null for paid and closed orders."
///                     }
///                   }
///                 }
///               }
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Invalid route identifier"
///       },
///       "401": {
///         "description": "Authentication required"
///       },
///       "404": {
///         "description": "Order missing or company billing access not granted"
///       },
///       "503": {
///         "description": "Durable storage unavailable"
///       }
///     },
///     "parameters": [
///       {
///         "name": "organization",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       },
///       {
///         "name": "order",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       }
///     ],
///     "x-niu-implementation": "implemented",
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ]
///   }
/// }
/// ```
pub(crate) async fn topup_status(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((organization, order)): Path<(Uuid, Uuid)>,
) -> Result<Json<Value>, ApiError> {
    let auth = state
        .authorize_admin_headers(&headers, AdminPermission::Read)
        .await?;
    if !auth.permits_billing_account(organization) {
        return Err(ApiError::not_found());
    }
    topup_response(&state, organization, order).await
}

/// Installation-only recovery endpoint, not a customer self-funding API.
pub(crate) async fn reconcile(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((organization, order)): Path<(Uuid, Uuid)>,
) -> Result<Json<Value>, ApiError> {
    let auth = state
        .authorize_admin_headers(&headers, AdminPermission::Write)
        .await?;
    if !auth.is_installation() {
        return Err(ApiError::forbidden());
    }
    let saved = state
        .store
        .customer_topup(organization, order)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::not_found)?;
    match saved.aggregator.as_str() {
        "stripe" => return reconcile_stripe(&state, &saved).await,
        "zhifux" => {}
        "epay" => {
            return Err(ApiError::unsupported_message(
                "EPay order query recovery is not supported; signed notifications remain available",
            ));
        }
        _ => {
            return Err(ApiError::unsupported_message(
                "Order query recovery is not supported for this payment integration",
            ));
        }
    }
    let runtime = state
        .payments
        .as_ref()
        .ok_or_else(|| ApiError::upstream_message("Payment integration is not configured"))?;
    runtime.settle(&state, organization, order).await?;
    topup_response(&state, organization, order).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{
        body::Body,
        http::{Request, StatusCode},
    };
    use http_body_util::BodyExt;
    use tower::ServiceExt;

    #[sqlx::test(migrations = "../../crates/storage/migrations")]
    #[ignore = "requires PostgreSQL"]
    async fn pending_query_pins_identity_before_paid_recovery(pool: sqlx::PgPool) {
        let store = niu_storage::Store::from_pool(pool.clone());
        let company = store
            .create_prepaid_organization("Pending recovery", "CNY")
            .await
            .unwrap();
        let order = store
            .create_customer_topup(
                company,
                &niu_storage::TopupInput {
                    currency: "CNY",
                    amount_nanos: 1_000_000_000,
                    aggregator: "zhifux",
                    merchant: "merchant01",
                    payment_method: "wxpaynative",
                    idempotency_key: Uuid::new_v4(),
                },
            )
            .await
            .unwrap();
        assert!(
            apply_verified_order(
                &store,
                company,
                order.id,
                VerifiedOrder::Pending {
                    platform_reference: "originalPlatform".into(),
                }
            )
            .await
            .is_err()
        );
        // Reopening must retain the independently observed pending identity.
        let reopened = niu_storage::Store::from_pool(pool.clone());
        assert_eq!(
            reopened
                .customer_topup_platform_reference(company, order.id)
                .await
                .unwrap()
                .as_deref(),
            Some("originalPlatform")
        );
        for evidence in [
            VerifiedOrder::Paid(niu_payments::zhifux_transport::RecoveredPayment {
                platform_reference: "substitutedPlatform".into(),
                amount_nanos: order.amount_nanos,
            }),
            VerifiedOrder::Closed {
                platform_reference: "substitutedPlatform".into(),
            },
        ] {
            assert!(
                apply_verified_order(&reopened, company, order.id, evidence)
                    .await
                    .is_err()
            );
        }
        let settled: i64 =
            sqlx::query_scalar("SELECT count(*) FROM customer_topup_settlements WHERE order_id=$1")
                .bind(order.id)
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(settled, 0);
        assert!(
            !reopened
                .customer_topup_closed(company, order.id)
                .await
                .unwrap()
                .unwrap()
        );
        for _ in 0..2 {
            apply_verified_order(
                &reopened,
                company,
                order.id,
                VerifiedOrder::Paid(niu_payments::zhifux_transport::RecoveredPayment {
                    platform_reference: "originalPlatform".into(),
                    amount_nanos: order.amount_nanos,
                }),
            )
            .await
            .unwrap();
        }
        let settled: i64 =
            sqlx::query_scalar("SELECT count(*) FROM customer_topup_settlements WHERE order_id=$1")
                .bind(order.id)
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(settled, 1);
    }

    #[sqlx::test(migrations = "../../crates/storage/migrations")]
    #[ignore = "requires PostgreSQL"]
    async fn verified_callback_is_durable_idempotent_and_never_funds_unsigned_evidence(
        pool: sqlx::PgPool,
    ) {
        let store = niu_storage::Store::from_pool(pool.clone());
        let company = store
            .create_prepaid_organization("Callback receipt", "CNY")
            .await
            .unwrap();
        let source = store
            .create_customer_topup(
                company,
                &niu_storage::TopupInput {
                    currency: "CNY",
                    amount_nanos: 1_000_000_000,
                    aggregator: "zhifux",
                    merchant: "merchant01",
                    payment_method: "wxpaynative",
                    idempotency_key: Uuid::new_v4(),
                },
            )
            .await
            .unwrap();
        let order = Uuid::parse_str("00112233445566778899aabbccddeeff").unwrap();
        sqlx::query("INSERT INTO customer_topup_orders(id,organization_id,account_id,currency,amount_nanos,aggregator,merchant,payment_method,idempotency_key) SELECT $1,organization_id,account_id,currency,amount_nanos,aggregator,merchant,payment_method,$2 FROM customer_topup_orders WHERE id=$3").bind(order).bind(Uuid::new_v4()).bind(source.id).execute(&pool).await.unwrap();
        let merchant = Merchant::new("merchant01".into(), "callback-test-secret".into()).unwrap();
        // Independently calculated fixture signature, not the verifier's output.
        let input: Notification = serde_json::from_value(json!({"merchantNum":"merchant01","orderNo":"00112233445566778899aabbccddeeff","amount":"1.00","state":"1","sign":"fe3d4710e4dea917fa175eddbb8f8f57","actualPayAmount":"99999","platformOrderNo":"forgedPlatform","type":"forgedMethod"})).unwrap();
        sqlx::query("CREATE FUNCTION reject_test_notification() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected failure'; END $$").execute(&pool).await.unwrap();
        sqlx::query("CREATE TRIGGER reject_test_notification BEFORE INSERT ON customer_topup_notifications FOR EACH ROW EXECUTE FUNCTION reject_test_notification()").execute(&pool).await.unwrap();
        assert!(
            accept_notification(&store, &merchant, "merchant01", &input)
                .await
                .is_err()
        );
        let empty: i64 = sqlx::query_scalar("SELECT count(*) FROM customer_topup_notifications")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(empty, 0);
        sqlx::query("DROP TRIGGER reject_test_notification ON customer_topup_notifications")
            .execute(&pool)
            .await
            .unwrap();
        let (a, b) = tokio::join!(
            accept_notification(&store, &merchant, "merchant01", &input),
            accept_notification(&store, &merchant, "merchant01", &input)
        );
        a.unwrap();
        b.unwrap();
        let count: i64 = sqlx::query_scalar(
            "SELECT count(*) FROM customer_topup_notifications WHERE order_id=$1",
        )
        .bind(order)
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(count, 1);
        assert_eq!(
            store.customer_balance_summary(company).await.unwrap()[0]["balance_nanos"],
            "0"
        );
        assert!(
            store
                .customer_topup_platform_reference(company, order)
                .await
                .unwrap()
                .is_none()
        );
        assert_eq!(
            store.customer_topup_paid(company, order).await.unwrap(),
            Some(false)
        );
        assert_eq!(
            niu_storage::Store::from_pool(pool.clone())
                .pending_customer_topup("zhifux", "merchant01", None)
                .await
                .unwrap()
                .unwrap()
                .id,
            order
        );
        for (field, value) in [
            ("state", "2"),
            ("amount", "2.00"),
            ("merchantNum", "foreignMerchant"),
            ("sign", "00000000000000000000000000000000"),
        ] {
            let mut body = json!({"merchantNum":"merchant01","orderNo":"00112233445566778899aabbccddeeff","amount":"1.00","state":"1","sign":"fe3d4710e4dea917fa175eddbb8f8f57"});
            body[field] = json!(value);
            let changed: Notification = serde_json::from_value(body).unwrap();
            assert!(
                accept_notification(&store, &merchant, "merchant01", &changed)
                    .await
                    .is_err()
            );
        }
        assert!(
            accept_notification(&store, &merchant, "foreignMerchant", &input)
                .await
                .is_err()
        );
        let mut state = AppState::new(
            toml::from_str("[models]").unwrap(),
            store.clone(),
            crate::state::TokenSet::parse(
                "NIU_ADMIN_TOKENS",
                "callback-test-installation-token-123456789".into(),
            )
            .unwrap(),
            std::collections::HashMap::new(),
        );
        // Construct transport without sending any request; callback acceptance
        // must not depend on an upstream query or trust unsigned payment data.
        state.payments = Some(std::sync::Arc::new(Runtime {
            callback_merchant: merchant,
            merchant: "merchant01".into(),
            client: Client::new(
                "https://8.8.8.8",
                Merchant::new("merchant01".into(), "callback-test-secret".into()).unwrap(),
                &["https://checkout.example".into()],
            )
            .await
            .unwrap(),
            query_started: Mutex::new(None),
            notify_url: "https://niu.example/payments/zhifux/notify".into(),
            payment_methods: vec!["wxpaynative".into()],
        }));
        let app = crate::web::router(state);
        let usd_company = store
            .create_prepaid_organization("Unsupported checkout currency", "USD")
            .await
            .unwrap();
        for (organization, available, reason) in [
            (company, true, None),
            (usd_company, false, Some("currency_account_missing")),
        ] {
            let response = app
                .clone()
                .oneshot(
                    Request::get(format!(
                        "/admin/v1/organizations/{organization}/billing/payment-methods"
                    ))
                    .header(
                        "authorization",
                        "Bearer callback-test-installation-token-123456789",
                    )
                    .body(Body::empty())
                    .unwrap(),
                )
                .await
                .unwrap();
            assert_eq!(response.status(), StatusCode::OK);
            let bytes = response.into_body().collect().await.unwrap().to_bytes();
            let body: Value = serde_json::from_slice(&bytes).unwrap();
            assert_eq!(body["data"]["available"], available);
            assert_eq!(body["data"]["unavailable_reason"], json!(reason));
            assert_eq!(
                body["data"]["payment_methods"],
                if available {
                    json!(["wxpaynative"])
                } else {
                    json!([])
                }
            );
            assert!(!String::from_utf8_lossy(&bytes).contains("merchant01"));
            assert!(!String::from_utf8_lossy(&bytes).contains("callback-test-secret"));
        }
        let valid_form = "merchantNum=merchant01&orderNo=00112233445566778899aabbccddeeff&amount=1.00&state=1&sign=fe3d4710e4dea917fa175eddbb8f8f57&actualPayAmount=99999";
        sqlx::query("CREATE TRIGGER reject_test_notification BEFORE INSERT ON customer_topup_notifications FOR EACH ROW EXECUTE FUNCTION reject_test_notification()").execute(&pool).await.unwrap();
        let response = app
            .clone()
            .oneshot(
                Request::post("/payments/zhifux/notify")
                    .header("content-type", "application/x-www-form-urlencoded")
                    .body(Body::from(valid_form))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);
        assert_ne!(
            response
                .into_body()
                .collect()
                .await
                .unwrap()
                .to_bytes()
                .as_ref(),
            b"success"
        );
        sqlx::query("DROP TRIGGER reject_test_notification ON customer_topup_notifications")
            .execute(&pool)
            .await
            .unwrap();

        // A database lock exercises the real handler deadline. No query to the
        // payment service or successful acknowledgment may escape this timeout.
        let mut locked = pool.begin().await.unwrap();
        sqlx::query("LOCK TABLE customer_topup_notifications IN ACCESS EXCLUSIVE MODE")
            .execute(&mut *locked)
            .await
            .unwrap();
        let started = Instant::now();
        let response = app
            .clone()
            .oneshot(
                Request::post("/payments/zhifux/notify")
                    .header("content-type", "application/x-www-form-urlencoded")
                    .body(Body::from(valid_form))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::BAD_GATEWAY);
        assert!(started.elapsed() < Duration::from_secs(3));
        assert_ne!(
            response
                .into_body()
                .collect()
                .await
                .unwrap()
                .to_bytes()
                .as_ref(),
            b"success"
        );
        locked.rollback().await.unwrap();
        for (method, content_type, body, expected) in [
            (
                "POST",
                "application/x-www-form-urlencoded",
                valid_form.to_owned(),
                StatusCode::OK,
            ),
            (
                "POST",
                "application/x-www-form-urlencoded",
                valid_form.replace("amount=1.00", "amount=2.00"),
                StatusCode::BAD_REQUEST,
            ),
            (
                "POST",
                "application/x-www-form-urlencoded",
                format!("{valid_form}&extra={}", "x".repeat(8192)),
                StatusCode::PAYLOAD_TOO_LARGE,
            ),
            (
                "POST",
                "application/json",
                "{}".into(),
                StatusCode::UNSUPPORTED_MEDIA_TYPE,
            ),
            (
                "GET",
                "application/x-www-form-urlencoded",
                String::new(),
                StatusCode::METHOD_NOT_ALLOWED,
            ),
        ] {
            let response = app
                .clone()
                .oneshot(
                    Request::builder()
                        .method(method)
                        .uri("/payments/zhifux/notify")
                        .header("content-type", content_type)
                        .body(Body::from(body))
                        .unwrap(),
                )
                .await
                .unwrap();
            assert_eq!(response.status(), expected);
            let body = response.into_body().collect().await.unwrap().to_bytes();
            if expected == StatusCode::OK {
                assert_eq!(body.as_ref(), b"success");
            } else {
                assert!(!String::from_utf8_lossy(&body).contains("callback-test-secret"));
            }
        }
        assert_eq!(
            store.customer_balance_summary(company).await.unwrap()[0]["balance_nanos"],
            "0"
        );
        assert!(
            sqlx::query("DELETE FROM customer_topup_notifications WHERE order_id=$1")
                .bind(order)
                .execute(&pool)
                .await
                .is_err()
        );
    }

    #[test]
    #[cfg(unix)]
    fn private_configuration_is_bounded_and_errors_never_echo_credentials() {
        use std::os::unix::fs::{PermissionsExt, symlink};
        let directory =
            std::env::temp_dir().join(format!("niu-payment-config-test-{}", Uuid::new_v4()));
        std::fs::create_dir(&directory).unwrap();
        let path = directory.join("merchant.json");
        let valid = json!({"api_root":"https://merchant.example","merchant":"merchant01","secret":"configuration-test-secret","checkout_origins":["https://checkout.example"],"notify_url":"https://niu.example/payments/zhifux/notify","payment_methods":["wxpaynative"]});
        std::fs::write(&path, valid.to_string()).unwrap();
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600)).unwrap();
        assert_eq!(
            read_configuration(&path)
                .unwrap_or_else(|_| panic!("valid fixture rejected"))
                .merchant,
            "merchant01"
        );
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o644)).unwrap();
        assert!(read_configuration(&path).is_err());
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600)).unwrap();
        let link = directory.join("linked.json");
        symlink(&path, &link).unwrap();
        assert!(read_configuration(&link).is_err());
        let mut unknown = valid.clone();
        unknown["unrecognized"] = json!("configuration-test-secret");
        for invalid in [
            unknown.to_string(),
            "configuration-test-secret malformed JSON".into(),
            "x".repeat(16 * 1024 + 1),
        ] {
            std::fs::write(&path, invalid).unwrap();
            let error = read_configuration(&path).err().unwrap();
            assert!(!error.contains("configuration-test-secret"));
            assert!(!error.contains(directory.to_str().unwrap()));
        }
        assert!(read_configuration(&directory).is_err());
        assert!(read_configuration(&directory.join("missing.json")).is_err());
        std::fs::remove_file(&link).unwrap();
        std::fs::remove_file(&path).unwrap();
        std::fs::remove_dir(&directory).unwrap();
    }

    #[sqlx::test(migrations = "../../crates/storage/migrations")]
    #[ignore = "requires PostgreSQL"]
    async fn reconciliation_authorization_and_durable_customer_status(pool: sqlx::PgPool) {
        let state = AppState::new(
            toml::from_str("[models]").unwrap(),
            niu_storage::Store::from_pool(pool),
            crate::state::TokenSet::parse(
                "NIU_ADMIN_TOKENS",
                "payment-test-installation-token-123456789".into(),
            )
            .unwrap(),
            std::collections::HashMap::new(),
        );
        let company = state
            .store
            .create_prepaid_organization("Payment authorization", "CNY")
            .await
            .unwrap();
        let order = state
            .store
            .create_customer_topup(
                company,
                &niu_storage::TopupInput {
                    currency: "CNY",
                    amount_nanos: 1_000_000_000,
                    aggregator: "zhifux",
                    merchant: "merchant01",
                    payment_method: "wxpaynative",
                    idempotency_key: Uuid::new_v4(),
                },
            )
            .await
            .unwrap();
        let owner = state
            .store
            .create_operator(
                niu_storage::OperatorScope {
                    organization_id: company,
                    project_id: None,
                },
                "Company owner",
                niu_storage::OperatorRole::Owner,
                3600,
                niu_storage::OperatorAuditActor::Installation,
            )
            .await
            .unwrap();
        let app = crate::web::router(state.clone());
        let response = app
            .clone()
            .oneshot(
                Request::get(format!("/admin/v1/organizations/{company}/billing/topups"))
                    .header("authorization", format!("Bearer {}", owner.token))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let body: Value =
            serde_json::from_slice(&response.into_body().collect().await.unwrap().to_bytes())
                .unwrap();
        assert_eq!(body["data"].as_array().unwrap().len(), 1);
        assert_eq!(body["data"][0]["status"], "reconciliation_required");
        assert!(body["data"][0]["created_at"].as_str().is_some());
        assert!(body["next_cursor"].is_null());
        let response = app
            .clone()
            .oneshot(
                Request::get(format!(
                    "/admin/v1/organizations/{}/billing/topups",
                    Uuid::new_v4()
                ))
                .header("authorization", format!("Bearer {}", owner.token))
                .body(Body::empty())
                .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::NOT_FOUND);
        let methods_path = format!("/admin/v1/organizations/{company}/billing/payment-methods");
        let response = app
            .clone()
            .oneshot(
                Request::get(&methods_path)
                    .header("authorization", format!("Bearer {}", owner.token))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let body: Value =
            serde_json::from_slice(&response.into_body().collect().await.unwrap().to_bytes())
                .unwrap();
        assert_eq!(
            body["data"],
            json!({"currency":"CNY","payment_gateway":null,"available":false,"payment_methods":[],"unavailable_reason":"integration_unavailable"})
        );
        for (organization, token, expected) in [
            (company, None, StatusCode::UNAUTHORIZED),
            (
                Uuid::new_v4(),
                Some(owner.token.as_str()),
                StatusCode::NOT_FOUND,
            ),
        ] {
            let mut request = Request::get(format!(
                "/admin/v1/organizations/{organization}/billing/payment-methods"
            ));
            if let Some(token) = token {
                request = request.header("authorization", format!("Bearer {token}"));
            }
            let response = app
                .clone()
                .oneshot(request.body(Body::empty()).unwrap())
                .await
                .unwrap();
            assert_eq!(response.status(), expected);
        }
        let path = format!(
            "/admin/v1/organizations/{company}/billing/topups/{}/reconcile",
            order.id
        );
        for (token, expected) in [
            (None, StatusCode::UNAUTHORIZED),
            (Some(owner.token.as_str()), StatusCode::FORBIDDEN),
            (
                Some("payment-test-installation-token-123456789"),
                StatusCode::BAD_GATEWAY,
            ),
        ] {
            let mut request = Request::post(&path);
            if let Some(token) = token {
                request = request.header("authorization", format!("Bearer {token}"));
            }
            let response = app
                .clone()
                .oneshot(request.body(Body::empty()).unwrap())
                .await
                .unwrap();
            assert_eq!(response.status(), expected);
            let body = response.into_body().collect().await.unwrap().to_bytes();
            assert!(!String::from_utf8_lossy(&body).contains("merchant01"));
        }
        assert_eq!(
            state.store.customer_balance_summary(company).await.unwrap()[0]["balance_nanos"],
            "0"
        );
        let status_path = format!(
            "/admin/v1/organizations/{company}/billing/topups/{}",
            order.id
        );
        for (expected_status, checkout) in [
            ("reconciliation_required", None),
            ("pending", Some("https://checkout.example/pay?order=saved")),
            ("paid", None),
        ] {
            if expected_status == "pending" {
                state
                    .store
                    .bind_customer_topup_checkout(
                        company,
                        order.id,
                        "fixturePlatform",
                        checkout.unwrap(),
                    )
                    .await
                    .unwrap();
            }
            if expected_status == "paid" {
                state
                    .store
                    .settle_verified_customer_topup(
                        company,
                        order.id,
                        "fixturePlatform",
                        1_000_000_000,
                    )
                    .await
                    .unwrap();
            }
            let response = app
                .clone()
                .oneshot(
                    Request::get(&status_path)
                        .header("authorization", format!("Bearer {}", owner.token))
                        .body(Body::empty())
                        .unwrap(),
                )
                .await
                .unwrap();
            assert_eq!(response.status(), StatusCode::OK);
            let bytes = response.into_body().collect().await.unwrap().to_bytes();
            let body: Value = serde_json::from_slice(&bytes).unwrap();
            assert_eq!(body["data"]["status"], expected_status);
            assert_eq!(body["data"]["amount_nanos"], "1000000000");
            assert_eq!(body["data"]["checkout_url"], json!(checkout));
            for confidential in [
                "merchant01",
                "fixturePlatform",
                "account_id",
                "entry_id",
                "aggregator",
                "supplier",
            ] {
                assert!(!String::from_utf8_lossy(&bytes).contains(confidential));
            }
        }
        let closed = state
            .store
            .create_customer_topup(
                company,
                &niu_storage::TopupInput {
                    currency: "CNY",
                    amount_nanos: 1_000_000_000,
                    aggregator: "zhifux",
                    merchant: "merchant01",
                    payment_method: "wxpaynative",
                    idempotency_key: Uuid::new_v4(),
                },
            )
            .await
            .unwrap();
        state
            .store
            .bind_customer_topup_checkout(
                company,
                closed.id,
                "closedPlatform",
                "https://checkout.example/pay?order=closed",
            )
            .await
            .unwrap();
        state
            .store
            .close_verified_customer_topup(company, closed.id, "closedPlatform")
            .await
            .unwrap();
        let response = app
            .clone()
            .oneshot(
                Request::get(format!(
                    "/admin/v1/organizations/{company}/billing/topups/{}",
                    closed.id
                ))
                .header("authorization", format!("Bearer {}", owner.token))
                .body(Body::empty())
                .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let bytes = response.into_body().collect().await.unwrap().to_bytes();
        let body: Value = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(body["data"]["status"], "closed");
        assert!(body["data"]["checkout_url"].is_null());
        assert!(!String::from_utf8_lossy(&bytes).contains("closedPlatform"));
        let foreign = state
            .store
            .create_prepaid_organization("Foreign payment company", "CNY")
            .await
            .unwrap();
        let response = app
            .clone()
            .oneshot(
                Request::get(format!(
                    "/admin/v1/organizations/{foreign}/billing/topups/{}",
                    order.id
                ))
                .header("authorization", format!("Bearer {}", owner.token))
                .body(Body::empty())
                .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::NOT_FOUND);
        let response = app.oneshot(Request::post(format!("/admin/v1/organizations/{company}/billing/topups")).header("authorization",format!("Bearer {}", owner.token)).header("content-type","application/json").body(Body::from(json!({"amount_nanos":"1000000000","payment_method":"wxpaynative","idempotency_key":Uuid::new_v4()}).to_string())).unwrap()).await.unwrap();
        assert_eq!(response.status(), StatusCode::BAD_GATEWAY);
        assert_eq!(
            state.store.customer_balance_summary(company).await.unwrap()[0]["balance_nanos"],
            "1000000000"
        );
        assert_eq!(
            state
                .store
                .customer_topup_platform_reference(company, order.id)
                .await
                .unwrap()
                .as_deref(),
            Some("fixturePlatform")
        );
    }
}

// Trusted server configuration; never Debug or Serialize.
pub(crate) struct StripeRuntime {
    merchant: String,
    endpoint_secret: String,
    live_mode: bool,
    checkout: Option<StripeCheckout>,
}
struct StripeCheckout {
    client: niu_payments::stripe_transport::Client,
    currency: String,
    success_url: String,
    cancel_url: String,
    methods: Vec<String>,
}
impl StripeRuntime {
    pub(crate) fn from_env() -> Result<Option<Self>, &'static str> {
        let Some(merchant) = env::var_os("NIU_STRIPE_MERCHANT") else {
            return Ok(None);
        };
        let merchant = merchant
            .into_string()
            .map_err(|_| "Invalid Stripe merchant configuration")?;
        let endpoint_secret =
            env::var("NIU_STRIPE_WEBHOOK_SECRET").map_err(|_| "Missing Stripe webhook secret")?;
        let live_mode = match env::var("NIU_STRIPE_MODE").as_deref() {
            Ok("live") => true,
            Ok("test") => false,
            _ => return Err("Stripe mode must be explicit"),
        };
        if merchant.is_empty()
            || merchant.len() > 64
            || !merchant.bytes().all(|b| b.is_ascii_alphanumeric())
            || !endpoint_secret.starts_with("whsec_")
            || endpoint_secret.len() <= 6
            || endpoint_secret.len() > 512
        {
            return Err("Invalid Stripe payment configuration");
        }
        let checkout = match env::var("NIU_STRIPE_API_KEY") {
            Ok(key) => {
                let currency =
                    env::var("NIU_STRIPE_CURRENCY").map_err(|_| "Missing Stripe currency")?;
                let success_url =
                    env::var("NIU_STRIPE_SUCCESS_URL").map_err(|_| "Missing Stripe return URL")?;
                let cancel_url =
                    env::var("NIU_STRIPE_CANCEL_URL").map_err(|_| "Missing Stripe return URL")?;
                let methods: Vec<String> = env::var("NIU_STRIPE_PAYMENT_METHODS")
                    .map_err(|_| "Missing Stripe payment methods")?
                    .split(',')
                    .map(str::to_owned)
                    .collect();
                if methods.is_empty() || methods.len() > 3 {
                    return Err("Invalid Stripe payment methods");
                }
                let mut unique = std::collections::BTreeSet::new();
                for method in &methods {
                    if !unique.insert(method) {
                        return Err("Duplicate Stripe payment method");
                    }
                    niu_payments::stripe::checkout_parameters(
                        "00112233445566778899aabbccddeeff",
                        &currency,
                        1_000_000_000,
                        method,
                        &success_url,
                        &cancel_url,
                    )
                    .map_err(|_| "Invalid Stripe checkout configuration")?;
                }
                Some(StripeCheckout {
                    client: niu_payments::stripe_transport::Client::new(key, live_mode)
                        .map_err(|_| "Invalid Stripe API configuration")?,
                    currency,
                    success_url,
                    cancel_url,
                    methods,
                })
            }
            Err(env::VarError::NotPresent) => None,
            Err(_) => return Err("Invalid Stripe API configuration"),
        };
        Ok(Some(Self {
            merchant,
            endpoint_secret,
            live_mode,
            checkout,
        }))
    }
}

pub(crate) async fn stripe_notify(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: axum::body::Bytes,
) -> Result<axum::http::StatusCode, ApiError> {
    let runtime = state
        .stripe_payments
        .as_ref()
        .ok_or_else(|| ApiError::upstream_message("Stripe payments are not configured"))?;
    let signature = headers
        .get("stripe-signature")
        .and_then(|h| h.to_str().ok())
        .ok_or_else(|| ApiError::invalid_request("Invalid Stripe notification"))?;
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|_| ApiError::upstream_message("Payment clock unavailable"))?
        .as_secs();
    niu_payments::stripe::verify_webhook(&body, signature, &runtime.endpoint_secret, now)
        .map_err(|_| ApiError::invalid_request("Invalid Stripe notification"))?;
    let event: Value = serde_json::from_slice(&body)
        .map_err(|_| ApiError::invalid_request("Invalid Stripe notification"))?;
    let reference = event
        .pointer("/data/object/client_reference_id")
        .and_then(Value::as_str)
        .and_then(|s| Uuid::parse_str(s).ok())
        .ok_or_else(|| ApiError::invalid_request("Invalid Stripe notification"))?;
    let order = state
        .store
        .customer_topup_for_callback("stripe", &runtime.merchant, reference)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(|| ApiError::invalid_request("Unknown Stripe order"))?;
    let session = state
        .store
        .customer_topup_platform_reference(order.organization_id, order.id)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(|| ApiError::invalid_request("Stripe session is not bound"))?;
    let currency = order.currency.to_ascii_lowercase();
    let expected = niu_payments::stripe::ExpectedCheckout {
        session_id: &session,
        order_reference: &order.id.simple().to_string(),
        currency: &currency,
        amount_nanos: order.amount_nanos,
        live_mode: runtime.live_mode,
    };
    let paid = niu_payments::stripe::verify_paid_checkout(
        &body,
        signature,
        &runtime.endpoint_secret,
        now,
        &expected,
    )
    .map_err(|_| ApiError::invalid_request("Invalid Stripe payment evidence"))?;
    state
        .store
        .settle_verified_customer_topup(
            order.organization_id,
            order.id,
            paid.session_id(),
            paid.amount_nanos(),
        )
        .await
        .map_err(ApiError::from_store)?;
    Ok(axum::http::StatusCode::OK)
}

#[cfg(test)]
mod stripe_tests {
    use super::*;
    use axum::{
        body::Body,
        http::{Request, StatusCode},
    };
    use hmac::{Hmac, Mac};
    use sha2::Sha256;
    use tower::ServiceExt;
    #[sqlx::test(migrator = "niu_storage::MIGRATOR")]
    #[ignore = "requires PostgreSQL"]
    async fn stripe_callback_settles_only_bound_paid_intent_and_replays_once(pool: sqlx::PgPool) {
        let store = niu_storage::Store::from_pool(pool.clone());
        let company = store
            .create_prepaid_organization("Stripe callback fixture", "USD")
            .await
            .unwrap();
        let order = store
            .create_customer_topup(
                company,
                &niu_storage::TopupInput {
                    currency: "USD",
                    amount_nanos: 2_000_000_000,
                    aggregator: "stripe",
                    merchant: "fixtureMerchant",
                    payment_method: "card",
                    idempotency_key: Uuid::new_v4(),
                },
            )
            .await
            .unwrap();
        store
            .bind_customer_topup_checkout(
                company,
                order.id,
                "cs_test_fixture",
                "https://checkout.stripe.com/c/pay/cs_test_fixture#saved",
            )
            .await
            .unwrap();
        let mut state = AppState::new(
            toml::from_str("[models]").unwrap(),
            store.clone(),
            crate::state::TokenSet::parse(
                "NIU_ADMIN_TOKENS",
                "stripe-test-installation-token-123456789".into(),
            )
            .unwrap(),
            std::collections::HashMap::new(),
        );
        state.stripe_payments = Some(std::sync::Arc::new(StripeRuntime {
            merchant: "fixtureMerchant".into(),
            endpoint_secret: "whsec_fixture_only".into(),
            live_mode: false,
            checkout: Some(StripeCheckout {
                client: niu_payments::stripe_transport::Client::new(
                    "sk_test_fixture_only".into(),
                    false,
                )
                .unwrap(),
                currency: "usd".into(),
                success_url: "https://niu.example/settings/billing".into(),
                cancel_url: "https://niu.example/settings/billing".into(),
                methods: vec!["card".into()],
            }),
        }));
        let app = crate::web::router(state.clone());
        let replay = app.clone().oneshot(Request::post(format!("/admin/v1/organizations/{company}/billing/topups"))
            .header("authorization", "Bearer stripe-test-installation-token-123456789").header("content-type", "application/json")
            .body(Body::from(json!({"amount_nanos":"2000000000","payment_method":"card","idempotency_key":order.idempotency_key}).to_string())).unwrap()).await.unwrap();
        assert_eq!(replay.status(), StatusCode::OK);
        let fixture = json!({"id":"evt_fixture", "object":"event", "type":"checkout.session.completed", "livemode":false, "data":{"object":{
            "id":"cs_test_fixture", "object":"checkout.session", "client_reference_id":order.id.simple().to_string(), "amount_total":200, "currency":"usd", "livemode":false,
            "mode":"payment", "status":"complete", "payment_status":"paid"
        }}});
        let request = |event: &Value, valid: bool| {
            let body = serde_json::to_vec(event).unwrap();
            let now = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_secs();
            let mut mac = Hmac::<Sha256>::new_from_slice(b"whsec_fixture_only").unwrap();
            mac.update(format!("{now}.").as_bytes());
            mac.update(&body);
            let hex: String = mac
                .finalize()
                .into_bytes()
                .iter()
                .map(|b| format!("{b:02x}"))
                .collect();
            Request::post("/payments/stripe/notify")
                .header(
                    "stripe-signature",
                    format!("t={now},v1={}", if valid { hex } else { "0".repeat(64) }),
                )
                .body(Body::from(body))
                .unwrap()
        };
        assert_eq!(
            app.clone()
                .oneshot(request(&fixture, false))
                .await
                .unwrap()
                .status(),
            StatusCode::BAD_REQUEST
        );
        let mut unpaid = fixture.clone();
        unpaid["data"]["object"]["payment_status"] = json!("unpaid");
        assert_eq!(
            app.clone()
                .oneshot(request(&unpaid, true))
                .await
                .unwrap()
                .status(),
            StatusCode::BAD_REQUEST
        );
        state.stripe_payments = Some(std::sync::Arc::new(StripeRuntime {
            merchant: "otherMerchant".into(),
            endpoint_secret: "whsec_fixture_only".into(),
            live_mode: false,
            checkout: None,
        }));
        assert_eq!(
            crate::web::router(state)
                .oneshot(request(&fixture, true))
                .await
                .unwrap()
                .status(),
            StatusCode::BAD_REQUEST
        );
        assert_eq!(
            store.customer_topup_paid(company, order.id).await.unwrap(),
            Some(false)
        );
        sqlx::query("CREATE FUNCTION reject_stripe_settlement() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected failure'; END $$").execute(&pool).await.unwrap();
        sqlx::query("CREATE TRIGGER reject_stripe_settlement BEFORE INSERT ON customer_topup_settlements FOR EACH ROW EXECUTE FUNCTION reject_stripe_settlement()").execute(&pool).await.unwrap();
        assert_eq!(
            app.clone()
                .oneshot(request(&fixture, true))
                .await
                .unwrap()
                .status(),
            StatusCode::SERVICE_UNAVAILABLE
        );
        let failed_count: i64 = sqlx::query_scalar("SELECT count(*) FROM customer_balance_entries WHERE organization_id=$1 AND kind='funding'").bind(company).fetch_one(&pool).await.unwrap();
        assert_eq!(failed_count, 0);
        assert_eq!(
            store.customer_topup_paid(company, order.id).await.unwrap(),
            Some(false)
        );
        sqlx::query("DROP TRIGGER reject_stripe_settlement ON customer_topup_settlements")
            .execute(&pool)
            .await
            .unwrap();
        drop(app);
        let reopened = niu_storage::Store::from_pool(pool.clone());
        let mut recovered = AppState::new(
            toml::from_str("[models]").unwrap(),
            reopened,
            crate::state::TokenSet::parse(
                "NIU_ADMIN_TOKENS",
                "stripe-test-installation-token-123456789".into(),
            )
            .unwrap(),
            std::collections::HashMap::new(),
        );
        recovered.stripe_payments = Some(std::sync::Arc::new(StripeRuntime {
            merchant: "fixtureMerchant".into(),
            endpoint_secret: "whsec_fixture_only".into(),
            live_mode: false,
            checkout: None,
        }));
        let app = crate::web::router(recovered);
        let (a, b) = tokio::join!(
            app.clone().oneshot(request(&fixture, true)),
            app.clone().oneshot(request(&fixture, true))
        );
        assert_eq!(a.unwrap().status(), StatusCode::OK);
        assert_eq!(b.unwrap().status(), StatusCode::OK);
        assert_eq!(
            store.customer_topup_paid(company, order.id).await.unwrap(),
            Some(true)
        );
        let count: i64 = sqlx::query_scalar("SELECT count(*) FROM customer_balance_entries WHERE organization_id=$1 AND kind='funding'").bind(company).fetch_one(&pool).await.unwrap();
        assert_eq!(count, 1);
    }
}

async fn create_stripe_topup(
    state: &AppState,
    organization: Uuid,
    runtime: &StripeRuntime,
    checkout: &StripeCheckout,
    input: CreateTopup,
) -> Result<Json<Value>, ApiError> {
    if input.amount_nanos.is_empty() || !input.amount_nanos.bytes().all(|b| b.is_ascii_digit()) {
        return Err(ApiError::invalid_request(
            "Provide an exact positive top-up amount",
        ));
    }
    let amount = input
        .amount_nanos
        .parse::<i64>()
        .map_err(|_| ApiError::invalid_request("Invalid top-up amount"))?;
    niu_payments::stripe::checkout_parameters(
        "00112233445566778899aabbccddeeff",
        &checkout.currency,
        amount,
        &input.payment_method,
        &checkout.success_url,
        &checkout.cancel_url,
    )
    .map_err(|_| ApiError::invalid_request("Top-ups require positive whole minor units"))?;
    let order = state
        .store
        .create_customer_topup(
            organization,
            &niu_storage::TopupInput {
                currency: &checkout.currency.to_ascii_uppercase(),
                amount_nanos: amount,
                aggregator: "stripe",
                merchant: &runtime.merchant,
                payment_method: &input.payment_method,
                idempotency_key: input.idempotency_key,
            },
        )
        .await
        .map_err(ApiError::from_store)?;
    if state
        .store
        .customer_topup_closed(organization, order.id)
        .await
        .map_err(ApiError::from_store)?
        == Some(true)
        || state
            .store
            .customer_topup_paid(organization, order.id)
            .await
            .map_err(ApiError::from_store)?
            == Some(true)
    {
        return topup_response(state, organization, order.id).await;
    }
    if state
        .store
        .customer_topup_checkout(organization, order.id)
        .await
        .map_err(ApiError::from_store)?
        .is_none()
        && state
            .store
            .claim_customer_topup_creation(organization, order.id)
            .await
            .map_err(ApiError::from_store)?
    {
        let created = checkout.client.create_checkout(&order.id.simple().to_string(), &checkout.currency, amount, &input.payment_method, &checkout.success_url, &checkout.cancel_url).await
            .map_err(|_| ApiError::upstream_message("Checkout creation is uncertain; recover the saved top-up instead of creating another order"))?;
        state
            .store
            .bind_customer_topup_checkout(
                organization,
                order.id,
                &created.session_id,
                &created.checkout_url,
            )
            .await
            .map_err(ApiError::from_store)?;
    }
    topup_response(state, organization, order.id).await
}

async fn reconcile_stripe(
    state: &AppState,
    order: &niu_storage::TopupOrder,
) -> Result<Json<Value>, ApiError> {
    let runtime = state
        .stripe_payments
        .as_ref()
        .ok_or_else(|| ApiError::upstream_message("Stripe payments are not configured"))?;
    let checkout = runtime
        .checkout
        .as_ref()
        .ok_or_else(|| ApiError::upstream_message("Stripe recovery API is not configured"))?;
    if order.merchant != runtime.merchant {
        return Err(ApiError::invalid_request(
            "Saved payment requires its original merchant configuration",
        ));
    }
    let session = state
        .store
        .customer_topup_platform_reference(order.organization_id, order.id)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(|| {
            ApiError::invalid_request("Unbound Stripe checkout requires merchant reconciliation")
        })?;
    if !state
        .store
        .claim_payment_query("stripe", &runtime.merchant)
        .await
        .map_err(ApiError::from_store)?
    {
        return Err(ApiError::upstream_message(
            "Payment reconciliation is busy; retry later",
        ));
    }
    let reference = order.id.simple().to_string();
    let currency = order.currency.to_ascii_lowercase();
    let expected = niu_payments::stripe::ExpectedCheckout {
        session_id: &session,
        order_reference: &reference,
        currency: &currency,
        amount_nanos: order.amount_nanos,
        live_mode: runtime.live_mode,
    };
    match checkout
        .client
        .retrieve_checkout(&expected)
        .await
        .map_err(|_| ApiError::upstream_message("Stripe payment could not be verified"))?
    {
        niu_payments::stripe_transport::RetrievedCheckout::Paid { amount_nanos } => {
            state
                .store
                .settle_verified_customer_topup(
                    order.organization_id,
                    order.id,
                    &session,
                    amount_nanos,
                )
                .await
                .map_err(ApiError::from_store)?;
        }
        niu_payments::stripe_transport::RetrievedCheckout::Expired => {
            state
                .store
                .close_verified_customer_topup(order.organization_id, order.id, &session)
                .await
                .map_err(ApiError::from_store)?;
        }
        niu_payments::stripe_transport::RetrievedCheckout::Pending { checkout_url } => {
            if let Some(url) = checkout_url {
                state
                    .store
                    .bind_customer_topup_checkout(order.organization_id, order.id, &session, &url)
                    .await
                    .map_err(ApiError::from_store)?;
            }
        }
    }
    topup_response(state, order.organization_id, order.id).await
}

#[cfg(test)]
mod stripe_recovery_tests {
    use super::*;
    use axum::{
        Router,
        body::Body,
        http::{Request, StatusCode},
        routing::get,
    };
    use tower::ServiceExt;
    #[sqlx::test(migrator = "niu_storage::MIGRATOR")]
    #[ignore = "requires PostgreSQL"]
    async fn stripe_checkout_creation_replay_and_lifecycle_are_durable(pool: sqlx::PgPool) {
        let store = niu_storage::Store::from_pool(pool.clone());
        let company = store
            .create_prepaid_organization("Stripe recovery fixture", "USD")
            .await
            .unwrap();
        sqlx::query("INSERT INTO customer_balance_accounts(id,organization_id,currency) VALUES($1,$2,'CNY')").bind(Uuid::new_v4()).bind(company).execute(&pool).await.unwrap();
        let mut rows = Vec::new();
        let mut responses = std::collections::HashMap::new();
        for (index, status) in ["paid", "pending", "expired"].into_iter().enumerate() {
            let merchant = format!("fixtureMerchant{index}");
            let order = store
                .create_customer_topup(
                    company,
                    &niu_storage::TopupInput {
                        currency: "USD",
                        amount_nanos: 2_000_000_000,
                        aggregator: "stripe",
                        merchant: &merchant,
                        payment_method: "alipay",
                        idempotency_key: Uuid::new_v4(),
                    },
                )
                .await
                .unwrap();
            let session = format!("cs_test_fixture{index}");
            responses.insert(session.clone(), json!({"id":session,"object":"checkout.session","client_reference_id":order.id.simple().to_string(),"amount_total":200,"currency":"usd","livemode":false,"mode":"payment","status":match status {"paid"=>"complete","expired"=>"expired",_=>"open"},"payment_status":if status=="paid" {"paid"} else {"unpaid"},"url":if status=="pending" {Some(format!("https://checkout.stripe.com/c/pay/{session}#saved"))} else {None}}));
            rows.push((order, merchant, status));
        }
        #[derive(Clone)]
        struct Fixture {
            responses: std::sync::Arc<std::collections::HashMap<String, Value>>,
            creations: std::sync::Arc<std::sync::atomic::AtomicUsize>,
        }
        let creations = std::sync::Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let fixture = Router::new()
            .route(
                "/v1/checkout/sessions/{session}",
                get(
                    |State(fixture): State<Fixture>,
                     Path(session): Path<String>,
                     headers: HeaderMap| async move {
                        assert!(headers.get("authorization").is_some());
                        Json(fixture.responses.get(&session).unwrap().clone())
                    },
                ),
            )
            .route(
                "/v1/checkout/sessions",
                axum::routing::post(
                    |State(fixture): State<Fixture>, headers: HeaderMap, body: String| async move {
                        assert!(headers.get("authorization").is_some());
                        let fields: std::collections::HashMap<_, _> =
                            url::form_urlencoded::parse(body.as_bytes())
                                .into_owned()
                                .collect();
                        let reference = fields.get("client_reference_id").unwrap();
                        assert_eq!(headers["idempotency-key"], format!("niu-topup-{reference}"));
                        assert_eq!(fields["line_items[0][price_data][unit_amount]"], "200");
                        fixture
                            .creations
                            .fetch_add(1, std::sync::atomic::Ordering::SeqCst);
                        let mut response = fixture
                            .responses
                            .values()
                            .find(|value| value["client_reference_id"] == *reference)
                            .unwrap()
                            .clone();
                        response["status"] = json!("open");
                        response["payment_status"] = json!("unpaid");
                        response["url"] = json!(format!(
                            "https://checkout.stripe.com/c/pay/{}#saved",
                            response["id"].as_str().unwrap()
                        ));
                        Json(response)
                    },
                ),
            )
            .with_state(Fixture {
                responses: std::sync::Arc::new(responses),
                creations: creations.clone(),
            });
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let server = tokio::spawn(async move {
            axum::serve(listener, fixture).await.unwrap();
        });
        for (order, merchant, status) in rows {
            let mut state = AppState::new(
                toml::from_str("[models]").unwrap(),
                store.clone(),
                crate::state::TokenSet::parse(
                    "NIU_ADMIN_TOKENS",
                    "stripe-recovery-installation-token-123456789".into(),
                )
                .unwrap(),
                std::collections::HashMap::new(),
            );
            state.stripe_payments = Some(std::sync::Arc::new(StripeRuntime {
                merchant,
                endpoint_secret: "whsec_fixture_only".into(),
                live_mode: false,
                checkout: Some(StripeCheckout {
                    client: niu_payments::stripe_transport::Client::fixture(
                        "sk_test_fixture_only".into(),
                        false,
                        &format!("http://{address}"),
                    )
                    .unwrap(),
                    currency: "usd".into(),
                    success_url: "https://niu.example".into(),
                    cancel_url: "https://niu.example".into(),
                    methods: vec!["alipay".into()],
                }),
            }));
            state.epay_payments = Some(std::sync::Arc::new(EPayRuntime {
                merchant: "1234".into(),
                verifier: niu_payments::epay::Merchant::new(
                    "1234".into(),
                    "fixture-key-0123456789".into(),
                )
                .unwrap(),
                checkout: Some(EPayCheckout {
                    endpoint: "https://checkout.example".into(),
                    notify: "https://niu.example/payments/epay/notify".into(),
                    return_url: "https://niu.example/settings/billing".into(),
                    methods: vec!["alipay".into()],
                }),
            }));
            let app = crate::web::router(state);
            for (gateway, currency) in [("epay", "CNY"), ("stripe", "USD")] {
                let response = app.clone().oneshot(Request::get(format!("/admin/v1/organizations/{company}/billing/payment-methods?payment_gateway={gateway}&currency={currency}"))
                    .header("authorization", "Bearer stripe-recovery-installation-token-123456789").body(Body::empty()).unwrap()).await.unwrap();
                assert_eq!(response.status(), StatusCode::OK);
                let value: Value = serde_json::from_slice(
                    &axum::body::to_bytes(response.into_body(), 4096)
                        .await
                        .unwrap(),
                )
                .unwrap();
                assert_eq!(value["data"]["currency"], currency);
                assert_eq!(value["data"]["payment_gateway"], gateway);
                assert_eq!(value["data"]["available"], true);
                assert_eq!(value["data"]["payment_methods"], json!(["alipay"]));
            }
            let epay_key = Uuid::new_v4();
            for _ in 0..2 {
                let response = app.clone().oneshot(Request::post(format!("/admin/v1/organizations/{company}/billing/topups"))
                    .header("authorization", "Bearer stripe-recovery-installation-token-123456789").header("content-type", "application/json")
                    .body(Body::from(json!({"payment_gateway":"epay","currency":"CNY","amount_nanos":"1230000000","payment_method":"alipay","idempotency_key":epay_key}).to_string())).unwrap()).await.unwrap();
                assert_eq!(response.status(), StatusCode::OK);
            }
            for _ in 0..2 {
                let response = app.clone().oneshot(Request::post(format!("/admin/v1/organizations/{company}/billing/topups"))
                    .header("authorization","Bearer stripe-recovery-installation-token-123456789")
                    .header("content-type","application/json")
                    .body(Body::from(json!({"amount_nanos":"2000000000","payment_gateway":"stripe","currency":"USD","payment_method":"alipay","idempotency_key":order.idempotency_key}).to_string())).unwrap()).await.unwrap();
                assert_eq!(response.status(), StatusCode::OK);
            }
            assert!(
                store
                    .customer_topup_checkout(company, order.id)
                    .await
                    .unwrap()
                    .is_some()
            );
            assert_eq!(
                store.customer_topup_paid(company, order.id).await.unwrap(),
                Some(false)
            );
            let response = app
                .oneshot(
                    Request::post(format!(
                        "/admin/v1/organizations/{company}/billing/topups/{}/reconcile",
                        order.id
                    ))
                    .header(
                        "authorization",
                        "Bearer stripe-recovery-installation-token-123456789",
                    )
                    .body(Body::empty())
                    .unwrap(),
                )
                .await
                .unwrap();
            assert_eq!(response.status(), StatusCode::OK);
            assert_eq!(
                store.customer_topup_paid(company, order.id).await.unwrap(),
                Some(status == "paid")
            );
            assert_eq!(
                store
                    .customer_topup_closed(company, order.id)
                    .await
                    .unwrap(),
                Some(status == "expired")
            );
            if status == "pending" {
                assert!(
                    store
                        .customer_topup_checkout(company, order.id)
                        .await
                        .unwrap()
                        .unwrap()
                        .contains("#saved")
                );
            }
        }
        let funding:i64=sqlx::query_scalar("SELECT count(*) FROM customer_balance_entries WHERE organization_id=$1 AND kind='funding'").bind(company).fetch_one(&pool).await.unwrap();
        assert_eq!(funding, 1);
        assert_eq!(creations.load(std::sync::atomic::Ordering::SeqCst), 3);
        let epay_orders: i64 = sqlx::query_scalar("SELECT count(*) FROM customer_topup_orders WHERE organization_id=$1 AND aggregator='epay' AND currency='CNY'").bind(company).fetch_one(&pool).await.unwrap();
        assert_eq!(epay_orders, 3);
        let cny_credits: i64 = sqlx::query_scalar("SELECT count(*) FROM customer_balance_entries WHERE organization_id=$1 AND currency='CNY' AND kind='funding'").bind(company).fetch_one(&pool).await.unwrap();
        assert_eq!(cny_credits, 0);
        server.abort();
    }
}

// Optional checkout plus signed callbacks for classic EPay.
pub(crate) struct EPayRuntime {
    merchant: String,
    verifier: niu_payments::epay::Merchant,
    checkout: Option<EPayCheckout>,
}
struct EPayCheckout {
    endpoint: String,
    notify: String,
    return_url: String,
    methods: Vec<String>,
}
impl EPayRuntime {
    pub(crate) fn from_env() -> Result<Option<Self>, &'static str> {
        Self::from_configuration(|name| match env::var(name) {
            Ok(value) => Ok(Some(value)),
            Err(env::VarError::NotPresent) => Ok(None),
            Err(env::VarError::NotUnicode(_)) => Err("Invalid EPay merchant configuration"),
        })
    }
    pub(crate) fn from_configuration(
        read: impl Fn(&str) -> Result<Option<String>, &'static str>,
    ) -> Result<Option<Self>, &'static str> {
        let pid = read("NIU_EPAY_PID")?;
        let key = read("NIU_EPAY_KEY")?;
        match (pid, key) {
            (None, None) => {
                for name in [
                    "NIU_EPAY_ENDPOINT",
                    "NIU_EPAY_NOTIFY_URL",
                    "NIU_EPAY_RETURN_URL",
                    "NIU_EPAY_METHODS",
                ] {
                    if read(name)?.is_some() {
                        return Err("EPay checkout requires merchant ID and key");
                    }
                }
                Ok(None)
            }
            (Some(pid), Some(key)) => {
                let verifier = niu_payments::epay::Merchant::new(pid.clone(), key)
                    .map_err(|_| "Invalid EPay merchant configuration")?;
                let checkout = match (
                    read("NIU_EPAY_ENDPOINT")?,
                    read("NIU_EPAY_NOTIFY_URL")?,
                    read("NIU_EPAY_RETURN_URL")?,
                    read("NIU_EPAY_METHODS")?,
                ) {
                    (None, None, None, None) => None,
                    (Some(endpoint), Some(notify), Some(return_url), Some(methods)) => {
                        let methods: Vec<String> = methods
                            .split(',')
                            .map(str::trim)
                            .map(str::to_owned)
                            .collect();
                        if methods.is_empty()
                            || methods
                                .iter()
                                .any(|m| !matches!(m.as_str(), "alipay" | "wxpay"))
                        {
                            return Err("Invalid EPay payment methods");
                        }
                        verifier
                            .checkout(
                                &endpoint,
                                &notify,
                                &return_url,
                                &niu_payments::epay::ExpectedOrder {
                                    number: "configuration",
                                    payment_method: &methods[0],
                                    amount_nanos: 10_000_000,
                                },
                            )
                            .map_err(|_| "Invalid EPay checkout configuration")?;
                        Some(EPayCheckout {
                            endpoint,
                            notify,
                            return_url,
                            methods,
                        })
                    }
                    _ => {
                        return Err(
                            "EPay checkout requires endpoint, notification, return URL and methods",
                        );
                    }
                };
                Ok(Some(Self {
                    merchant: pid,
                    verifier,
                    checkout,
                }))
            }
            _ => Err("EPay requires both merchant ID and key"),
        }
    }
}
async fn create_epay_topup(
    state: &AppState,
    organization: Uuid,
    runtime: &EPayRuntime,
    checkout: &EPayCheckout,
    input: CreateTopup,
) -> Result<Json<Value>, ApiError> {
    if input.amount_nanos.is_empty() || !input.amount_nanos.bytes().all(|b| b.is_ascii_digit()) {
        return Err(ApiError::invalid_request(
            "Provide an exact positive CNY amount",
        ));
    }
    let amount = input
        .amount_nanos
        .parse::<i64>()
        .map_err(|_| ApiError::invalid_request("Provide an exact positive CNY amount"))?;
    cny_decimal(amount)
        .map_err(|_| ApiError::invalid_request("CNY top-ups require at most two decimal places"))?;
    let order = state
        .store
        .create_customer_topup(
            organization,
            &niu_storage::TopupInput {
                currency: "CNY",
                amount_nanos: amount,
                aggregator: "epay",
                merchant: &runtime.merchant,
                payment_method: &input.payment_method,
                idempotency_key: input.idempotency_key,
            },
        )
        .await
        .map_err(ApiError::from_store)?;
    if state
        .store
        .customer_topup_paid(organization, order.id)
        .await
        .map_err(ApiError::from_store)?
        != Some(true)
        && state
            .store
            .customer_topup_closed(organization, order.id)
            .await
            .map_err(ApiError::from_store)?
            != Some(true)
        && state
            .store
            .customer_topup_checkout(organization, order.id)
            .await
            .map_err(ApiError::from_store)?
            .is_none()
    {
        let url = runtime
            .verifier
            .checkout(
                &checkout.endpoint,
                &checkout.notify,
                &checkout.return_url,
                &niu_payments::epay::ExpectedOrder {
                    number: &order.id.simple().to_string(),
                    payment_method: &order.payment_method,
                    amount_nanos: order.amount_nanos,
                },
            )
            .map_err(|_| ApiError::upstream_message("EPay checkout configuration is invalid"))?;
        state
            .store
            .save_epay_merchant_checkout(organization, order.id, &url)
            .await
            .map_err(ApiError::from_store)?;
    }
    topup_response(state, organization, order.id).await
}
pub(crate) async fn epay_notify_post(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: axum::body::Bytes,
) -> Result<([(&'static str, &'static str); 1], &'static str), ApiError> {
    if headers
        .get("content-type")
        .and_then(|value| value.to_str().ok())
        .is_none_or(|value| value.split(';').next() != Some("application/x-www-form-urlencoded"))
    {
        return Err(ApiError::invalid_request("Invalid EPay notification"));
    }
    epay_notify(&state, &body).await
}
pub(crate) async fn epay_notify_get(
    State(state): State<AppState>,
    axum::extract::RawQuery(query): axum::extract::RawQuery,
) -> Result<([(&'static str, &'static str); 1], &'static str), ApiError> {
    epay_notify(&state, query.as_deref().unwrap_or_default().as_bytes()).await
}
async fn epay_notify(
    state: &AppState,
    body: &[u8],
) -> Result<([(&'static str, &'static str); 1], &'static str), ApiError> {
    tokio::time::timeout(Duration::from_secs(2), epay_notify_inner(state, body))
        .await
        .map_err(|_| {
            ApiError::upstream_message("EPay notification processing timed out; retry delivery")
        })?
}
async fn epay_notify_inner(
    state: &AppState,
    body: &[u8],
) -> Result<([(&'static str, &'static str); 1], &'static str), ApiError> {
    let runtime = configuration::runtime(state)
        .await?
        .ok_or_else(|| ApiError::upstream_message("EPay payments are not configured"))?;
    if body.is_empty() || body.len() > 8192 {
        return Err(ApiError::invalid_request("Invalid EPay notification"));
    }
    let references: Vec<_> = url::form_urlencoded::parse(body)
        .filter(|(key, _)| key == "out_trade_no")
        .collect();
    if references.len() != 1 {
        return Err(ApiError::invalid_request("Invalid EPay notification"));
    }
    let reference = Uuid::parse_str(&references[0].1)
        .map_err(|_| ApiError::invalid_request("Invalid EPay notification"))?;
    let order = state
        .store
        .customer_topup_for_callback("epay", &runtime.merchant, reference)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(|| ApiError::invalid_request("Invalid EPay notification"))?;
    if order.currency != "CNY" {
        return Err(ApiError::invalid_request("Invalid EPay notification"));
    }
    let expected = niu_payments::epay::ExpectedOrder {
        number: &order.id.simple().to_string(),
        payment_method: &order.payment_method,
        amount_nanos: order.amount_nanos,
    };
    let paid = runtime
        .verifier
        .verify_paid(body, &expected)
        .map_err(|_| ApiError::invalid_request("Invalid EPay payment evidence"))?;
    // The first verified callback establishes the immutable provider identity.
    // Retry after a funding failure can only use that same signed identity.
    state
        .store
        .bind_customer_topup_provider(order.organization_id, order.id, paid.platform_reference())
        .await
        .map_err(ApiError::from_store)?;
    state
        .store
        .settle_verified_customer_topup(
            order.organization_id,
            order.id,
            paid.platform_reference(),
            order.amount_nanos,
        )
        .await
        .map_err(ApiError::from_store)?;
    Ok(([("cache-control", "no-store")], "success"))
}

#[cfg(test)]
mod epay_tests {
    use super::*;
    use axum::{
        body::Body,
        http::{Request, StatusCode},
    };
    use md5::{Digest, Md5};
    use tower::ServiceExt;
    #[test]
    fn epay_configuration_requires_credentials_and_complete_checkout() {
        let parse = |values: &[(&str, &str)]| {
            EPayRuntime::from_configuration(|name| {
                Ok(values
                    .iter()
                    .find(|(key, _)| *key == name)
                    .map(|(_, value)| (*value).to_owned()))
            })
        };
        assert!(parse(&[]).unwrap().is_none());
        assert!(parse(&[("NIU_EPAY_ENDPOINT", "https://checkout.example")]).is_err());
        assert!(parse(&[("NIU_EPAY_PID", "1234")]).is_err());
        let credentials = [
            ("NIU_EPAY_PID", "1234"),
            ("NIU_EPAY_KEY", "fixture-key-0123456789"),
        ];
        assert!(parse(&credentials).unwrap().unwrap().checkout.is_none());
        let mut configured = credentials.to_vec();
        configured.push(("NIU_EPAY_ENDPOINT", "https://checkout.example"));
        assert!(parse(&configured).is_err());
        configured.extend([
            (
                "NIU_EPAY_NOTIFY_URL",
                "https://niu.example/payments/epay/notify",
            ),
            (
                "NIU_EPAY_RETURN_URL",
                "https://niu.example/settings/billing",
            ),
            ("NIU_EPAY_METHODS", "alipay,wxpay"),
        ]);
        assert!(parse(&configured).unwrap().unwrap().checkout.is_some());
        configured[2].1 = "http://checkout.example";
        assert!(parse(&configured).is_err());
    }
    fn state(pool: sqlx::PgPool) -> AppState {
        let mut state = AppState::new(
            toml::from_str("[models]").unwrap(),
            niu_storage::Store::from_pool(pool),
            crate::state::TokenSet::parse(
                "NIU_ADMIN_TOKENS",
                "epay-test-installation-token-123456789".into(),
            )
            .unwrap(),
            std::collections::HashMap::new(),
        );
        state.epay_payments = Some(std::sync::Arc::new(EPayRuntime {
            merchant: "1234".into(),
            checkout: None,
            verifier: niu_payments::epay::Merchant::new(
                "1234".into(),
                "fixture-key-0123456789".into(),
            )
            .unwrap(),
        }));
        state
    }
    fn callback(order: Uuid, money: &str) -> String {
        let reference = order.simple().to_string();
        let unsigned = format!(
            "money={money}&out_trade_no={reference}&pid=1234&trade_no=provider123&trade_status=TRADE_SUCCESS&type=alipay"
        );
        let signature = format!(
            "{:x}",
            Md5::digest(format!("{unsigned}fixture-key-0123456789").as_bytes())
        );
        format!("{unsigned}&sign={signature}&sign_type=MD5")
    }
    async fn post(app: &axum::Router, body: &str) -> StatusCode {
        app.clone()
            .oneshot(
                Request::post("/payments/epay/notify")
                    .header("content-type", "application/x-www-form-urlencoded")
                    .body(Body::from(body.to_owned()))
                    .unwrap(),
            )
            .await
            .unwrap()
            .status()
    }
    #[sqlx::test(migrator = "niu_storage::MIGRATOR")]
    #[ignore = "requires PostgreSQL"]
    async fn epay_checkout_api_saves_one_unfunded_order(pool: sqlx::PgPool) {
        let mut initial = state(pool.clone());
        let runtime = std::sync::Arc::get_mut(initial.epay_payments.as_mut().unwrap()).unwrap();
        runtime.checkout = Some(EPayCheckout {
            endpoint: "https://checkout.example".into(),
            notify: "https://niu.example/payments/epay/notify".into(),
            return_url: "https://niu.example/settings/billing".into(),
            methods: vec!["alipay".into()],
        });
        let company = initial
            .store
            .create_prepaid_organization("EPay initiation", "CNY")
            .await
            .unwrap();
        let app = crate::web::router(initial.clone());
        let key = Uuid::new_v4();
        let owner = initial
            .store
            .create_operator(
                niu_storage::OperatorScope {
                    organization_id: company,
                    project_id: None,
                },
                "Company funding owner",
                niu_storage::OperatorRole::Owner,
                3600,
                niu_storage::OperatorAuditActor::Installation,
            )
            .await
            .unwrap();
        let foreign = initial
            .store
            .create_prepaid_organization("Foreign funding", "CNY")
            .await
            .unwrap();
        let path = format!("/admin/v1/organizations/{company}/billing/topups");
        for (gateway, expected) in [
            ("stripe", StatusCode::BAD_REQUEST),
            ("unknown", StatusCode::UNPROCESSABLE_ENTITY),
        ] {
            let response = app.clone().oneshot(Request::post(&path).header("authorization", format!("Bearer {}", owner.token)).header("content-type", "application/json").body(Body::from(json!({"payment_gateway":gateway,"currency":"CNY","amount_nanos":"1230000000","payment_method":"alipay","idempotency_key":Uuid::new_v4()}).to_string())).unwrap()).await.unwrap();
            assert_eq!(response.status(), expected);
        }
        for currency in ["USD", "cny"] {
            let response = app.clone().oneshot(Request::post(&path).header("authorization", format!("Bearer {}", owner.token)).header("content-type", "application/json").body(Body::from(json!({"currency":currency,"amount_nanos":"1230000000","payment_method":"alipay","idempotency_key":Uuid::new_v4()}).to_string())).unwrap()).await.unwrap();
            assert_eq!(response.status(), StatusCode::BAD_REQUEST);
        }
        for (currency, available) in [("CNY", true), ("USD", false)] {
            let response = app.clone().oneshot(Request::get(format!("/admin/v1/organizations/{company}/billing/payment-methods?currency={currency}"))
                .header("authorization", format!("Bearer {}", owner.token)).body(Body::empty()).unwrap()).await.unwrap();
            assert_eq!(response.status(), StatusCode::OK);
            let payload: Value = serde_json::from_slice(
                &axum::body::to_bytes(response.into_body(), 4096)
                    .await
                    .unwrap(),
            )
            .unwrap();
            assert_eq!(payload["data"]["currency"], currency);
            assert_eq!(payload["data"]["available"], available);
            if !available {
                assert_eq!(payload["data"]["payment_methods"], json!([]));
            }
        }
        for (token, route, amount, request_key, expected) in [
            (
                "invalid-token",
                path.clone(),
                "1230000000",
                Uuid::new_v4(),
                StatusCode::UNAUTHORIZED,
            ),
            (
                owner.token.as_str(),
                format!("/admin/v1/organizations/{foreign}/billing/topups"),
                "1230000000",
                Uuid::new_v4(),
                StatusCode::NOT_FOUND,
            ),
            (
                owner.token.as_str(),
                path.clone(),
                "0",
                Uuid::new_v4(),
                StatusCode::BAD_REQUEST,
            ),
            (
                owner.token.as_str(),
                path.clone(),
                "1230000001",
                Uuid::new_v4(),
                StatusCode::BAD_REQUEST,
            ),
        ] {
            let response = app.clone().oneshot(Request::post(route).header("authorization", format!("Bearer {token}")).header("content-type", "application/json").body(Body::from(json!({"amount_nanos":amount,"payment_method":"alipay","idempotency_key":request_key}).to_string())).unwrap()).await.unwrap();
            assert_eq!(response.status(), expected);
        }
        for _ in 0..2 {
            let response = app.clone().oneshot(Request::post(format!("/admin/v1/organizations/{company}/billing/topups"))
                .header("authorization", format!("Bearer {}", owner.token))
                .header("content-type", "application/json")
                .body(Body::from(json!({"payment_gateway":"epay","currency":"CNY","amount_nanos":"1230000000","payment_method":"alipay","idempotency_key":key}).to_string())).unwrap()).await.unwrap();
            assert_eq!(response.status(), StatusCode::OK);
        }
        let changed = app.clone().oneshot(Request::post(&path).header("authorization", format!("Bearer {}", owner.token)).header("content-type", "application/json").body(Body::from(json!({"amount_nanos":"1240000000","payment_method":"alipay","idempotency_key":key}).to_string())).unwrap()).await.unwrap();
        assert_eq!(changed.status(), StatusCode::CONFLICT);
        let (history, _) = initial
            .store
            .customer_topup_history(company, None)
            .await
            .unwrap();
        assert_eq!(history.len(), 1);
        assert_eq!(history[0]["status"], "pending");
        let checkout = url::Url::parse(history[0]["checkout_url"].as_str().unwrap()).unwrap();
        assert_eq!(checkout.host_str(), Some("checkout.example"));
        assert_eq!(checkout.path(), "/submit.php");
        let fields: std::collections::HashMap<_, _> = checkout.query_pairs().into_owned().collect();
        assert_eq!(fields["money"], "1.23");
        assert_eq!(fields["pid"], "1234");
        let credits: i64 = sqlx::query_scalar(
            "SELECT count(*) FROM customer_balance_entries WHERE kind='funding'",
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(credits, 0);
        let bindings: i64 =
            sqlx::query_scalar("SELECT count(*) FROM customer_topup_provider_orders")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(bindings, 0);
    }
    #[sqlx::test(migrator = "niu_storage::MIGRATOR")]
    #[ignore = "requires PostgreSQL"]
    async fn epay_callbacks_bind_verified_identity_and_credit_once_after_failure(
        pool: sqlx::PgPool,
    ) {
        let initial = state(pool.clone());
        let company = initial
            .store
            .create_prepaid_organization("EPay callback fixture", "CNY")
            .await
            .unwrap();
        let order = initial
            .store
            .create_customer_topup(
                company,
                &niu_storage::TopupInput {
                    currency: "CNY",
                    amount_nanos: 1_230_000_000,
                    aggregator: "epay",
                    merchant: "1234",
                    payment_method: "alipay",
                    idempotency_key: Uuid::new_v4(),
                },
            )
            .await
            .unwrap();
        let app = crate::web::router(initial.clone());
        // Even correctly signed evidence cannot cross the saved adapter or merchant.
        for (aggregator, merchant) in [("zhifux", "1234"), ("epay", "5678")] {
            let foreign = initial
                .store
                .create_customer_topup(
                    company,
                    &niu_storage::TopupInput {
                        currency: "CNY",
                        amount_nanos: 1_230_000_000,
                        aggregator,
                        merchant,
                        payment_method: "alipay",
                        idempotency_key: Uuid::new_v4(),
                    },
                )
                .await
                .unwrap();
            assert_eq!(
                post(&app, &callback(foreign.id, "1.23")).await,
                StatusCode::BAD_REQUEST
            );
        }
        assert_eq!(
            post(&app, &callback(order.id, "1.24")).await,
            StatusCode::BAD_REQUEST
        );
        assert_eq!(
            post(&app, &format!("{}&pid=1234", callback(order.id, "1.23"))).await,
            StatusCode::BAD_REQUEST
        );
        let bindings: i64 =
            sqlx::query_scalar("SELECT count(*) FROM customer_topup_provider_orders")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(bindings, 0);
        let mut lock = pool.begin().await.unwrap();
        sqlx::query("SELECT id FROM organizations WHERE id=$1 FOR UPDATE")
            .bind(company)
            .execute(&mut *lock)
            .await
            .unwrap();
        let timed_out = tokio::time::timeout(
            Duration::from_secs(4),
            post(&app, &callback(order.id, "1.23")),
        )
        .await
        .unwrap();
        assert_eq!(timed_out, StatusCode::BAD_GATEWAY);
        lock.rollback().await.unwrap();
        let bindings: i64 =
            sqlx::query_scalar("SELECT count(*) FROM customer_topup_provider_orders")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(bindings, 0);
        sqlx::query("CREATE FUNCTION reject_epay_credit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected funding failure'; END $$").execute(&pool).await.unwrap();
        sqlx::query("CREATE TRIGGER reject_epay_credit BEFORE INSERT ON customer_balance_entries FOR EACH ROW EXECUTE FUNCTION reject_epay_credit()").execute(&pool).await.unwrap();
        let signed = callback(order.id, "1.23");
        assert_eq!(post(&app, &signed).await, StatusCode::SERVICE_UNAVAILABLE);
        let credited: i64 = sqlx::query_scalar("SELECT count(*) FROM customer_topup_settlements")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(credited, 0);
        sqlx::query("DROP TRIGGER reject_epay_credit ON customer_balance_entries")
            .execute(&pool)
            .await
            .unwrap();
        let rebuilt = crate::web::router(state(pool.clone()));
        let (first, second) = tokio::join!(post(&rebuilt, &signed), post(&rebuilt, &signed));
        assert_eq!((first, second), (StatusCode::OK, StatusCode::OK));
        let response = rebuilt
            .clone()
            .oneshot(
                Request::get(format!("/payments/epay/notify?{signed}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(response.headers()["cache-control"], "no-store");
        assert_eq!(
            axum::body::to_bytes(response.into_body(), 1024)
                .await
                .unwrap(),
            "success"
        );
        let entries:(i64,i64)=sqlx::query_as("SELECT count(*),sum(amount_nanos)::bigint FROM customer_balance_entries WHERE kind='funding'").fetch_one(&pool).await.unwrap();
        assert_eq!(entries, (1, 1_230_000_000));
        let references:i64=sqlx::query_scalar("SELECT count(*) FROM customer_topup_provider_orders WHERE platform_reference='provider123'").fetch_one(&pool).await.unwrap();
        assert_eq!(references, 1);
        let another = initial
            .store
            .create_customer_topup(
                company,
                &niu_storage::TopupInput {
                    currency: "CNY",
                    amount_nanos: 1_230_000_000,
                    aggregator: "epay",
                    merchant: "1234",
                    payment_method: "alipay",
                    idempotency_key: Uuid::new_v4(),
                },
            )
            .await
            .unwrap();
        // The same provider payment is not a second credit, even with a valid
        // signature and a different saved merchant order.
        assert_eq!(
            post(&rebuilt, &callback(another.id, "1.23")).await,
            StatusCode::CONFLICT
        );
        assert!(
            initial
                .store
                .customer_topup_platform_reference(company, another.id)
                .await
                .unwrap()
                .is_none()
        );
        let entries: i64 = sqlx::query_scalar(
            "SELECT count(*) FROM customer_balance_entries WHERE kind='funding'",
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(entries, 1);
    }
}
