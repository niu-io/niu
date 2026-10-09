//! Filtered, customer-safe request metadata exports.
use super::{GatewayActivityQuery, authorize_project, gateway_activity_filter};
use crate::{error::ApiError, state::AppState};
use axum::{
    extract::{Path, Query, State},
    http::HeaderMap,
};
use niu_storage::{AdminPermission, TenantScope};
use uuid::Uuid;

pub async fn csv(
    State(state): State<AppState>,
    Path((organization_id, project_id)): Path<(Uuid, Uuid)>,
    headers: HeaderMap,
    Query(query): Query<GatewayActivityQuery>,
) -> Result<([(&'static str, &'static str); 3], String), ApiError> {
    authorize_project(
        &state,
        &headers,
        AdminPermission::Read,
        organization_id,
        project_id,
    )
    .await?;
    if query.limit.is_some() || query.after.is_some() {
        return Err(ApiError::invalid_request(
            "Exports cover the filtered range; pagination parameters are not supported",
        ));
    }
    let filter = gateway_activity_filter(&query)?;
    let rows = state
        .store
        .gateway_activity_export(
            TenantScope {
                organization_id,
                project_id,
            },
            &filter,
        )
        .await
        .map_err(ApiError::from_store)?;
    if rows.len() > 10_000 {
        return Err(ApiError::export_too_large());
    }
    let mut csv = String::from(
        "Time (UTC),Model,API key,Delivery HTTP status,Provider status,Usage confidence,Input tokens,Output tokens,Customer charge status,Customer currency,Customer charge nanounits,Observed duration ms,Timing complete,Cached input tokens,Reasoning output tokens,Finish reasons,Failure kind,Upstream HTTP status\r\n",
    );
    for row in rows {
        let values = [
            row.created_at,
            row.model,
            row.key_name.unwrap_or_default(),
            row.http_status.map(|v| v.to_string()).unwrap_or_default(),
            row.execution,
            row.usage_confidence,
            row.prompt_tokens.unwrap_or_default(),
            row.completion_tokens.unwrap_or_default(),
            row.customer_charge_status,
            row.customer_charge_currency.unwrap_or_default(),
            row.customer_charge_nanos.unwrap_or_default(),
            row.total_ms.map(|v| v.to_string()).unwrap_or_default(),
            row.timing_complete
                .map(|v| v.to_string())
                .unwrap_or_default(),
            row.cached_input_tokens.unwrap_or_default(),
            row.reasoning_output_tokens.unwrap_or_default(),
            row.finish_reasons
                .map(|value| {
                    serde_json::to_string(&value.0).expect("finish metadata is serializable")
                })
                .unwrap_or_default(),
            row.failure
                .as_ref()
                .map(|failure| failure.kind.as_str().to_owned())
                .unwrap_or_default(),
            row.failure
                .and_then(|failure| failure.upstream_http_status)
                .map(|status| status.to_string())
                .unwrap_or_default(),
        ];
        for (index, value) in values.iter().enumerate() {
            if index > 0 {
                csv.push(',');
            }
            csv_cell(&mut csv, value);
        }
        csv.push_str("\r\n");
    }
    Ok((
        [
            ("content-type", "text/csv; charset=utf-8"),
            (
                "content-disposition",
                "attachment; filename=\"niu-requests.csv\"",
            ),
            ("cache-control", "no-store"),
        ],
        csv,
    ))
}

fn csv_cell(output: &mut String, value: &str) {
    output.push('"');
    // Quoting alone does not stop spreadsheet formula evaluation. Prefix
    // formula-like cells, including leading whitespace/control characters.
    if value.trim_start().starts_with(['=', '+', '-', '@']) || value.starts_with(['\t', '\r', '\n'])
    {
        output.push('\'');
    }
    for character in value.chars() {
        if character == '"' {
            output.push('"');
        }
        output.push(character);
    }
    output.push('"');
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn csv_cells_escape_delimiters_and_neutralize_formulas_without_rounding() {
        for (value, expected) in [
            ("normal", "\"normal\""),
            ("", "\"\""),
            ("a,\"b\"\nc", "\"a,\"\"b\"\"\nc\""),
            ("=SUM(1,2)", "\"'=SUM(1,2)\""),
            ("  @command", "\"'  @command\""),
            ("\tformula", "\"'\tformula\""),
            ("9007199254740993", "\"9007199254740993\""),
        ] {
            let mut output = String::new();
            csv_cell(&mut output, value);
            assert_eq!(output, expected);
        }
    }
}
