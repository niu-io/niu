use axum::{Json, http::StatusCode, response::IntoResponse};
use serde_json::{Value, json};

#[derive(Debug)]
pub struct ApiError {
    status: StatusCode,
    kind: &'static str,
    message: &'static str,
}

impl ApiError {
    pub fn from_store(error: niu_storage::StoreError) -> Self {
        match error {
            niu_storage::StoreError::InvalidObservation => Self::invalid_request(
                "Invalid execution record version, graph, identifiers or size",
            ),
            niu_storage::StoreError::InvalidPrice => {
                Self::invalid_request("Invalid price, currency or monetary amount")
            }
            niu_storage::StoreError::BudgetExceeded => Self {
                status: StatusCode::PAYMENT_REQUIRED,
                kind: "budget_exceeded",
                message: "The project budget has insufficient available funds",
            },
            niu_storage::StoreError::Unresolved => Self {
                status: StatusCode::CONFLICT,
                kind: "reconciliation_required",
                message: "Execution or usage evidence remains unresolved",
            },
            niu_storage::StoreError::Unauthorized => Self::unauthorized(),
            niu_storage::StoreError::InvalidAccount => {
                Self::invalid_request("Invalid account or quota configuration")
            }
            niu_storage::StoreError::AccountUnavailable => Self {
                status: StatusCode::SERVICE_UNAVAILABLE,
                kind: "account_unavailable",
                message: "The selected account is unavailable",
            },
            niu_storage::StoreError::InvalidKey => {
                Self::invalid_request("Invalid key name, model permissions, or lifetime")
            }
            niu_storage::StoreError::InvalidOperator => {
                Self::invalid_request("Invalid operator name, role, or session lifetime")
            }
            niu_storage::StoreError::Conflict => Self {
                status: StatusCode::CONFLICT,
                kind: "conflict_error",
                message: "The record is unavailable or its state changed",
            },
            _ => Self {
                status: StatusCode::SERVICE_UNAVAILABLE,
                kind: "storage_error",
                message: "Durable storage is unavailable",
            },
        }
    }

    pub fn unauthorized() -> Self {
        Self {
            status: StatusCode::UNAUTHORIZED,
            kind: "authentication_error",
            message: "A valid bearer token is required",
        }
    }

    pub fn forbidden() -> Self {
        Self {
            status: StatusCode::FORBIDDEN,
            kind: "permission_denied",
            message: "This administrator role cannot perform the requested action",
        }
    }

    pub fn invalid_request(message: &'static str) -> Self {
        Self {
            status: StatusCode::BAD_REQUEST,
            kind: "invalid_request_error",
            message,
        }
    }

    pub fn not_found() -> Self {
        Self {
            status: StatusCode::NOT_FOUND,
            kind: "not_found_error",
            message: "The requested resource is not available",
        }
    }

    pub fn unavailable() -> Self {
        Self {
            status: StatusCode::SERVICE_UNAVAILABLE,
            kind: "upstream_error",
            message: "The configured provider credential is unavailable",
        }
    }

    pub fn upstream() -> Self {
        Self {
            status: StatusCode::BAD_GATEWAY,
            kind: "upstream_error",
            message: "The provider request failed",
        }
    }

    pub fn unsupported() -> Self {
        Self {
            status: StatusCode::NOT_IMPLEMENTED,
            kind: "unsupported_operation_error",
            message: "The requested operation is not supported for this provider route",
        }
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> axum::response::Response {
        let body: Value = json!({
            "error": {
                "message": self.message,
                "type": self.kind,
                "param": null,
                "code": self.status.as_u16()
            }
        });
        (self.status, Json(body)).into_response()
    }
}
