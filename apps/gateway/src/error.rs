use axum::{Json, http::StatusCode, response::IntoResponse};
use serde_json::{Value, json};

#[derive(Debug)]
pub struct ApiError {
    status: StatusCode,
    kind: &'static str,
    message: &'static str,
    failure: Option<niu_storage::RequestFailure>,
}

impl ApiError {
    pub fn from_store(error: niu_storage::StoreError) -> Self {
        match error {
            niu_storage::StoreError::InvalidVendor => {
                Self::invalid_request("Invalid vendor or model configuration")
            }
            niu_storage::StoreError::InvalidObservation => Self::invalid_request(
                "Invalid execution record version, graph, identifiers or size",
            ),
            niu_storage::StoreError::InvalidPrice => {
                Self::invalid_request("Invalid price, currency or monetary amount")
            }
            niu_storage::StoreError::BudgetExceeded => Self {
                failure: None,
                status: StatusCode::PAYMENT_REQUIRED,
                kind: "budget_exceeded",
                message: "Insufficient available funds for this request",
            },
            niu_storage::StoreError::KeyIpDenied => Self {
                failure: None,
                status: StatusCode::FORBIDDEN,
                kind: "key_ip_not_allowed",
                message: "This API key does not allow the request source address",
            },
            niu_storage::StoreError::KeySpendingLimitExceeded => Self {
                failure: None,
                status: StatusCode::PAYMENT_REQUIRED,
                kind: "key_spending_limit_exceeded",
                message: "This API key's customer spending limit is exhausted",
            },
            niu_storage::StoreError::WorkspaceSpendingLimitExceeded => Self {
                failure: None,
                status: StatusCode::PAYMENT_REQUIRED,
                kind: "workspace_spending_limit_exceeded",
                message: "This request exceeds the workspace spending limit",
            },
            niu_storage::StoreError::Unresolved => Self {
                failure: None,
                status: StatusCode::CONFLICT,
                kind: "reconciliation_required",
                message: "Execution or usage evidence remains unresolved",
            },
            niu_storage::StoreError::Unauthorized => Self::unauthorized(),
            niu_storage::StoreError::InvalidAccount => {
                Self::invalid_request("Invalid account or quota configuration")
            }
            niu_storage::StoreError::ImageSourceCapacityExceeded => Self {
                failure: None,
                status: StatusCode::SERVICE_UNAVAILABLE,
                kind: "image_source_capacity_exceeded",
                message: "Image source storage is temporarily full. Try again after content expires or is erased",
            },
            niu_storage::StoreError::AccountUnavailable => Self {
                failure: None,
                status: StatusCode::SERVICE_UNAVAILABLE,
                kind: "account_unavailable",
                message: "The selected account is unavailable",
            },
            niu_storage::StoreError::InvalidKey => {
                Self::invalid_request("Invalid key name, model permissions, or lifetime")
            }
            niu_storage::StoreError::InvalidGatewayAdmissionBatch => {
                Self::invalid_request("Invalid gateway admission batch")
            }
            niu_storage::StoreError::InvalidOperator => {
                Self::invalid_request("Invalid operator name, role, or session lifetime")
            }
            niu_storage::StoreError::InvalidOperatorAuditQuery => {
                Self::invalid_request("Invalid operator audit cursor or page size")
            }
            niu_storage::StoreError::InvalidMediaQuery => {
                Self::invalid_request("Invalid video history cursor or page size")
            }
            niu_storage::StoreError::WorkspaceNotEmpty => Self {
                failure: None,
                status: StatusCode::CONFLICT,
                kind: "workspace_not_empty",
                message: "This workspace has saved records or is the installation default and cannot be deleted",
            },
            niu_storage::StoreError::Conflict => Self {
                failure: None,
                status: StatusCode::CONFLICT,
                kind: "conflict_error",
                message: "The record is unavailable or its state changed",
            },
            _ => Self {
                failure: None,
                status: StatusCode::SERVICE_UNAVAILABLE,
                kind: "storage_error",
                message: "Durable storage is unavailable",
            },
        }
    }

    pub fn unauthorized() -> Self {
        Self {
            failure: None,
            status: StatusCode::UNAUTHORIZED,
            kind: "authentication_error",
            message: "A valid bearer token is required",
        }
    }

    pub(crate) fn sign_in_failed() -> Self {
        Self {
            failure: None,
            status: StatusCode::UNAUTHORIZED,
            kind: "authentication_error",
            message: "Email or password is incorrect",
        }
    }

    pub(crate) fn sign_in_limited() -> Self {
        Self {
            failure: None,
            status: StatusCode::TOO_MANY_REQUESTS,
            kind: "authentication_rate_limit",
            message: "Sign-in is temporarily limited. Try again later.",
        }
    }

    pub fn forbidden() -> Self {
        Self {
            failure: None,
            status: StatusCode::FORBIDDEN,
            kind: "permission_denied",
            message: "This administrator role cannot perform the requested action",
        }
    }

    pub fn invalid_request(message: &'static str) -> Self {
        Self {
            failure: None,
            status: StatusCode::BAD_REQUEST,
            kind: "invalid_request_error",
            message,
        }
    }

    pub fn request_too_large() -> Self {
        Self {
            failure: None,
            status: StatusCode::PAYLOAD_TOO_LARGE,
            kind: "invalid_request_error",
            message: "Request exceeds the configured body limit",
        }
    }

    pub fn export_too_large() -> Self {
        Self {
            failure: None,
            status: StatusCode::PAYLOAD_TOO_LARGE,
            kind: "invalid_request_error",
            message: "Export exceeds 10000 requests. Narrow the date range or model/API key filters.",
        }
    }

    pub fn not_found() -> Self {
        Self {
            failure: None,
            status: StatusCode::NOT_FOUND,
            kind: "not_found_error",
            message: "The requested resource is not available",
        }
    }

    pub fn unavailable() -> Self {
        Self {
            failure: None,
            status: StatusCode::SERVICE_UNAVAILABLE,
            kind: "upstream_error",
            message: "The configured provider credential is unavailable",
        }
    }

    pub fn storage_unavailable() -> Self {
        Self {
            failure: None,
            status: StatusCode::SERVICE_UNAVAILABLE,
            kind: "storage_error",
            message: "Durable storage is unavailable",
        }
    }

    pub(crate) fn from_endpoint(error: crate::upstream::EndpointError) -> Self {
        use crate::upstream::EndpointError;
        let message = match error {
            EndpointError::InvalidUrl => "The configured provider endpoint URL is invalid",
            EndpointError::ResolutionFailed => {
                "The provider hostname could not be resolved. Check the gateway DNS connection"
            }
            EndpointError::PrivateAddress => {
                "The provider hostname resolves to a private or reserved address. If using a VPN or proxy with fake-IP DNS, configure real DNS resolution for the provider hostname"
            }
            EndpointError::ClientConfiguration => {
                "The gateway could not initialize the provider connection"
            }
        };
        Self {
            failure: None,
            status: StatusCode::SERVICE_UNAVAILABLE,
            kind: "provider_connection_error",
            message,
        }
    }

    pub(crate) fn asset_management_busy() -> Self {
        Self {
            failure: None,
            status: StatusCode::SERVICE_UNAVAILABLE,
            kind: "asset_management_busy",
            message: "Asset management is busy. Try again later.",
        }
    }

    pub(crate) fn media_result_busy() -> Self {
        Self {
            failure: None,
            status: StatusCode::SERVICE_UNAVAILABLE,
            kind: "media_result_busy",
            message: "Result downloads are busy. Try again later.",
        }
    }

    pub(crate) fn from_media_result(error: niu_media::result::ResultError) -> Self {
        use niu_media::result::ResultError;
        let (status, kind, message) = match error {
            ResultError::Timeout => (
                StatusCode::GATEWAY_TIMEOUT,
                "media_result_timeout",
                "Result retrieval timed out. Try again later.",
            ),
            ResultError::Unavailable => (
                StatusCode::BAD_GATEWAY,
                "media_result_unavailable",
                "The Supplier cannot currently serve this saved result. Its link may have expired.",
            ),
            ResultError::TooLarge => (
                StatusCode::BAD_GATEWAY,
                "media_result_too_large",
                "The saved result exceeds the download limit.",
            ),
            ResultError::InvalidMedia => (
                StatusCode::BAD_GATEWAY,
                "media_result_invalid",
                "The Supplier returned an unsupported or invalid media file.",
            ),
            ResultError::EndpointRejected => (
                StatusCode::BAD_GATEWAY,
                "media_result_destination_rejected",
                "The result destination could not be safely reached. Check gateway DNS and public HTTPS access.",
            ),
            ResultError::InvalidConfiguration => (
                StatusCode::SERVICE_UNAVAILABLE,
                "media_result_configuration_error",
                "Result retrieval is unavailable because the gateway configuration is invalid.",
            ),
            ResultError::Transport | ResultError::HttpStatus(_) => (
                StatusCode::BAD_GATEWAY,
                "media_result_transport_error",
                "The Supplier result request failed. Try again later.",
            ),
        };
        Self {
            failure: None,
            status,
            kind,
            message,
        }
    }

    pub(crate) fn upstream_status(status: StatusCode, regional: bool) -> Self {
        use niu_storage::{RequestFailure, RequestFailureKind};
        Self {
            status,
            kind: "upstream_error",
            message: if regional {
                "The provider does not offer this model in the gateway region. Check the configured upstream network route"
            } else {
                match status.as_u16() {
                    401 | 403 => {
                        "The provider refused this request. Check credential access and regional model availability"
                    }
                    429 => "The provider rate or spending limit was reached",
                    _ => "The provider returned a non-success HTTP response",
                }
            },
            failure: Some(RequestFailure {
                kind: if regional {
                    RequestFailureKind::UpstreamRegionUnavailable
                } else {
                    RequestFailureKind::UpstreamHttpError
                },
                upstream_http_status: Some(status.as_u16()),
            }),
        }
    }

    pub(crate) fn upstream_transport(error: &reqwest::Error) -> Self {
        use niu_storage::RequestFailureKind;
        let kind = if error.is_timeout() {
            RequestFailureKind::UpstreamTimeout
        } else if error.is_connect() {
            RequestFailureKind::UpstreamConnectionError
        } else {
            RequestFailureKind::UpstreamTransportError
        };
        let mut result = Self::upstream();
        result.failure = Some(niu_storage::RequestFailure {
            kind,
            upstream_http_status: None,
        });
        result
    }

    pub(crate) fn upstream_invalid_response() -> Self {
        let mut result = Self::upstream_message("The provider returned an invalid response");
        result.failure = Some(niu_storage::RequestFailure {
            kind: niu_storage::RequestFailureKind::UpstreamInvalidResponse,
            upstream_http_status: None,
        });
        result
    }

    pub fn upstream() -> Self {
        Self::upstream_message("The provider request failed")
    }

    pub fn upstream_message(message: &'static str) -> Self {
        Self {
            failure: None,
            status: StatusCode::BAD_GATEWAY,
            kind: "upstream_error",
            message,
        }
    }

    pub fn unsupported() -> Self {
        Self::unsupported_message(
            "The requested operation is not supported for this provider route",
        )
    }

    pub fn unsupported_message(message: &'static str) -> Self {
        Self {
            failure: None,
            status: StatusCode::NOT_IMPLEMENTED,
            kind: "unsupported_operation_error",
            message,
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
        let mut response = (self.status, Json(body)).into_response();
        if let Some(failure) = self.failure {
            response.extensions_mut().insert(failure);
        }
        response
    }
}

#[cfg(test)]
mod endpoint_tests {
    use super::*;
    use crate::upstream::EndpointError;

    #[tokio::test]
    async fn media_result_failures_keep_safe_actionable_categories() {
        use http_body_util::BodyExt;
        use niu_media::result::ResultError;
        let mut categories = std::collections::HashSet::new();
        for (cause, expected) in [
            (ResultError::Timeout, StatusCode::GATEWAY_TIMEOUT),
            (ResultError::Unavailable, StatusCode::BAD_GATEWAY),
            (ResultError::TooLarge, StatusCode::BAD_GATEWAY),
            (ResultError::InvalidMedia, StatusCode::BAD_GATEWAY),
            (ResultError::EndpointRejected, StatusCode::BAD_GATEWAY),
            (
                ResultError::InvalidConfiguration,
                StatusCode::SERVICE_UNAVAILABLE,
            ),
            (ResultError::Transport, StatusCode::BAD_GATEWAY),
        ] {
            let error = ApiError::from_media_result(cause);
            assert!(categories.insert(error.kind));
            let response = error.into_response();
            assert_eq!(response.status(), expected);
            let body = response.into_body().collect().await.unwrap().to_bytes();
            let body: Value = serde_json::from_slice(&body).unwrap();
            assert_eq!(body["error"]["code"], expected.as_u16());
            assert!(!body.to_string().contains("credential"));
            assert!(!body.to_string().contains("https://"));
        }
        assert_eq!(
            ApiError::from_media_result(ResultError::HttpStatus(429)).kind,
            ApiError::from_media_result(ResultError::Transport).kind
        );
        let busy = ApiError::media_result_busy();
        assert_eq!(busy.status, StatusCode::SERVICE_UNAVAILABLE);
        assert!(!busy.message.contains("credential"));
    }

    #[test]
    fn endpoint_failures_are_not_reported_as_missing_credentials() {
        for cause in [
            EndpointError::InvalidUrl,
            EndpointError::ResolutionFailed,
            EndpointError::PrivateAddress,
            EndpointError::ClientConfiguration,
        ] {
            let error = ApiError::from_endpoint(cause);
            assert_eq!(error.status, StatusCode::SERVICE_UNAVAILABLE);
            assert_eq!(error.kind, "provider_connection_error");
            assert!(!error.message.contains("credential"));
        }
        assert!(
            ApiError::from_endpoint(EndpointError::PrivateAddress)
                .message
                .contains("fake-IP DNS")
        );
        assert!(
            ApiError::from_endpoint(EndpointError::ResolutionFailed)
                .message
                .contains("DNS")
        );
        assert_eq!(
            ApiError::unavailable().message,
            "The configured provider credential is unavailable"
        );
    }
}
