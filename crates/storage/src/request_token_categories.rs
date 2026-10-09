use crate::{Store, StoreError, TenantScope};
use uuid::Uuid;

/// Reported subsets of authoritative input/output totals; missing is unknown.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct RequestTokenCategories {
    pub cached_input_tokens: Option<i64>,
    pub reasoning_output_tokens: Option<i64>,
}

impl RequestTokenCategories {
    /// Read only explicit, valid reported subsets. Never infer missing zeroes.
    pub fn from_openai_usage(usage: &serde_json::Value, totals: (u64, u64)) -> Option<Self> {
        Self::from_reported_usage(
            usage,
            totals,
            "/prompt_tokens_details/cached_tokens",
            "/completion_tokens_details/reasoning_tokens",
        )
    }

    pub fn from_responses_usage(usage: &serde_json::Value, totals: (u64, u64)) -> Option<Self> {
        Self::from_reported_usage(
            usage,
            totals,
            "/input_tokens_details/cached_tokens",
            "/output_tokens_details/reasoning_tokens",
        )
    }

    fn from_reported_usage(
        usage: &serde_json::Value,
        totals: (u64, u64),
        cached_path: &str,
        reasoning_path: &str,
    ) -> Option<Self> {
        let quantity = |path: &str, total: u64| {
            usage
                .pointer(path)?
                .as_u64()
                .filter(|value| *value <= total)
                .and_then(|value| i64::try_from(value).ok())
        };
        let details = Self {
            cached_input_tokens: quantity(cached_path, totals.0),
            reasoning_output_tokens: quantity(reasoning_path, totals.1),
        };
        (details.cached_input_tokens.is_some() || details.reasoning_output_tokens.is_some())
            .then_some(details)
    }
}

impl Store {
    /// Save one immutable observation only after scoped completion/usage exists.
    /// Identical replays succeed; conflicting observations never overwrite it.
    pub async fn save_request_token_categories(
        &self,
        scope: TenantScope,
        attempt: Uuid,
        categories: RequestTokenCategories,
    ) -> Result<(), StoreError> {
        if categories.cached_input_tokens.is_none() && categories.reasoning_output_tokens.is_none()
            || categories
                .cached_input_tokens
                .is_some_and(|value| value < 0)
            || categories
                .reasoning_output_tokens
                .is_some_and(|value| value < 0)
        {
            return Err(StoreError::InvalidUsage);
        }
        let result = sqlx::query(
            "INSERT INTO request_token_categories (attempt_id,cached_input_tokens,reasoning_output_tokens) \
             SELECT a.id,$4,$5 FROM attempts a JOIN operations o ON o.id=a.operation_id \
             WHERE a.id=$1 AND o.organization_id=$2 AND o.project_id=$3 \
             AND a.execution='confirmed_completed' AND a.prompt_tokens IS NOT NULL AND a.completion_tokens IS NOT NULL \
             AND ($4::bigint IS NULL OR $4 <= a.prompt_tokens) \
             AND ($5::bigint IS NULL OR $5 <= a.completion_tokens) \
             ON CONFLICT (attempt_id) DO UPDATE SET attempt_id=EXCLUDED.attempt_id \
             WHERE request_token_categories.cached_input_tokens IS NOT DISTINCT FROM EXCLUDED.cached_input_tokens \
             AND request_token_categories.reasoning_output_tokens IS NOT DISTINCT FROM EXCLUDED.reasoning_output_tokens",
        )
        .bind(attempt)
        .bind(scope.organization_id)
        .bind(scope.project_id)
        .bind(categories.cached_input_tokens)
        .bind(categories.reasoning_output_tokens)
        .execute(&self.pool)
        .await?;
        if result.rows_affected() != 1 {
            return Err(StoreError::Conflict);
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn category_parser_preserves_unknowns_and_rejects_invalid_subsets() {
        assert_eq!(
            RequestTokenCategories::from_openai_usage(&json!({}), (10, 5)),
            None
        );
        assert_eq!(
            RequestTokenCategories::from_openai_usage(
                &json!({"prompt_tokens_details":{"cached_tokens":0}}),
                (10, 5)
            ),
            Some(RequestTokenCategories {
                cached_input_tokens: Some(0),
                reasoning_output_tokens: None
            })
        );
        for invalid in [json!(-1), json!(11), json!("4"), json!(1.5), json!(null)] {
            let usage = json!({"prompt_tokens_details":{"cached_tokens":invalid},"completion_tokens_details":{"reasoning_tokens":2}});
            assert_eq!(
                RequestTokenCategories::from_openai_usage(&usage, (10, 5)),
                Some(RequestTokenCategories {
                    cached_input_tokens: None,
                    reasoning_output_tokens: Some(2)
                })
            );
        }
        assert_eq!(
            RequestTokenCategories::from_openai_usage(
                &json!({"completion_tokens_details":{"reasoning_tokens":6}}),
                (10, 5)
            ),
            None
        );
    }
}
