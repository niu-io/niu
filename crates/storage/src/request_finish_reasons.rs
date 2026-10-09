use crate::{Store, StoreError, TenantScope};
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;
use uuid::Uuid;

/// Allowlisted protocol metadata; never include arbitrary upstream strings.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RequestFinishReason {
    Stop,
    Length,
    ToolCalls,
    ContentFilter,
    FunctionCall,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct RequestChoiceFinish {
    pub index: u32,
    pub reason: RequestFinishReason,
}

impl RequestChoiceFinish {
    /// Normalize explicit Responses interruption metadata. Index zero denotes
    /// the response as a whole, not an output-item index. Completed responses
    /// do not declare a stop reason and therefore remain unknown here.
    pub fn from_responses_response(value: &serde_json::Value) -> Option<Vec<Self>> {
        if value.get("status")?.as_str()? != "incomplete"
            || value.get("error").is_some_and(|error| !error.is_null())
        {
            return None;
        }
        let reason = match value.get("incomplete_details")?.get("reason")?.as_str()? {
            "max_output_tokens" => RequestFinishReason::Length,
            "content_filter" => RequestFinishReason::ContentFilter,
            _ => return None,
        };
        Some(vec![Self { index: 0, reason }])
    }

    /// All choices must explicitly report a recognized terminal reason and a
    /// unique index. Partial, malformed or unknown observations stay unknown.
    pub fn from_chat_response(value: &serde_json::Value) -> Option<Vec<Self>> {
        let choices = value.get("choices")?.as_array()?;
        if choices.is_empty() || choices.len() > 128 || value.get("error").is_some() {
            return None;
        }
        let mut indexes = BTreeSet::new();
        let mut result = Vec::with_capacity(choices.len());
        for choice in choices {
            let index = u32::try_from(choice.get("index")?.as_u64()?).ok()?;
            if !indexes.insert(index) {
                return None;
            }
            let reason = serde_json::from_value(choice.get("finish_reason")?.clone()).ok()?;
            result.push(Self { index, reason });
        }
        result.sort_by_key(|choice| choice.index);
        Some(result)
    }
}

impl Store {
    /// An immutable observation for a completed, scoped attempt. This neither
    /// infers usage nor alters charging or execution confirmation.
    pub async fn save_request_finish_reasons(
        &self,
        scope: TenantScope,
        attempt: Uuid,
        mut choices: Vec<RequestChoiceFinish>,
    ) -> Result<(), StoreError> {
        choices.sort_by_key(|choice| choice.index);
        if choices.is_empty()
            || choices.len() > 128
            || choices
                .windows(2)
                .any(|pair| pair[0].index == pair[1].index)
        {
            return Err(StoreError::InvalidUsage);
        }
        let choices = serde_json::to_value(choices).expect("finish metadata is serializable");
        let result = sqlx::query(
            "INSERT INTO request_finish_reasons (attempt_id,choices) \
             SELECT a.id,$4 FROM attempts a JOIN operations o ON o.id=a.operation_id \
             WHERE a.id=$1 AND o.organization_id=$2 AND o.project_id=$3 \
             AND a.execution='confirmed_completed' \
             ON CONFLICT (attempt_id) DO UPDATE SET attempt_id=EXCLUDED.attempt_id \
             WHERE request_finish_reasons.choices=EXCLUDED.choices",
        )
        .bind(attempt)
        .bind(scope.organization_id)
        .bind(scope.project_id)
        .bind(choices)
        .execute(&self.pool)
        .await?;
        if result.rows_affected() != 1 {
            return Err(StoreError::Conflict);
        }
        Ok(())
    }

    pub async fn request_finish_reasons(
        &self,
        scope: TenantScope,
        attempt: Uuid,
    ) -> Result<Option<Vec<RequestChoiceFinish>>, StoreError> {
        let value: Option<sqlx::types::Json<Vec<RequestChoiceFinish>>> = sqlx::query_scalar(
            "SELECT f.choices FROM request_finish_reasons f JOIN attempts a ON a.id=f.attempt_id \
             JOIN operations o ON o.id=a.operation_id \
             WHERE a.id=$1 AND o.organization_id=$2 AND o.project_id=$3",
        )
        .bind(attempt)
        .bind(scope.organization_id)
        .bind(scope.project_id)
        .fetch_optional(&self.pool)
        .await?;
        Ok(value.map(|value| value.0))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn responses_interruptions_preserve_only_explicit_known_metadata() {
        for (reason, expected) in [
            ("max_output_tokens", RequestFinishReason::Length),
            ("content_filter", RequestFinishReason::ContentFilter),
        ] {
            let value = json!({"status":"incomplete","error":null,
                "incomplete_details":{"reason":reason},"output":[{"text":"private"}]});
            let parsed = RequestChoiceFinish::from_responses_response(&value).unwrap();
            assert_eq!(
                parsed,
                vec![RequestChoiceFinish {
                    index: 0,
                    reason: expected
                }]
            );
            assert!(!serde_json::to_string(&parsed).unwrap().contains("private"));
        }
        for value in [
            json!({"status":"completed","incomplete_details":{"reason":"max_output_tokens"}}),
            json!({"status":"incomplete","incomplete_details":null}),
            json!({"status":"incomplete","incomplete_details":{"reason":"private"}}),
            json!({"status":"incomplete","incomplete_details":{"reason":"steered"}}),
            json!({"status":"incomplete","incomplete_details":{"reason":"max_messages"}}),
            json!({"status":"incomplete","error":{},"incomplete_details":{"reason":"content_filter"}}),
        ] {
            assert_eq!(RequestChoiceFinish::from_responses_response(&value), None);
        }
    }

    #[test]
    fn terminal_choices_are_bounded_explicit_unique_and_content_free() {
        let value = json!({"choices":[
            {"index":1,"finish_reason":"length","message":{"content":"private"}},
            {"index":0,"finish_reason":"tool_calls"}
        ]});
        let parsed = RequestChoiceFinish::from_chat_response(&value).unwrap();
        assert_eq!(parsed[0].index, 0);
        assert_eq!(parsed[1].reason, RequestFinishReason::Length);
        assert!(!serde_json::to_string(&parsed).unwrap().contains("private"));
        for invalid in [
            json!({"choices":[]}),
            json!({"choices":[{"index":0,"finish_reason":null}]}),
            json!({"choices":[{"finish_reason":"stop"}]}),
            json!({"choices":[{"index":-1,"finish_reason":"stop"}]}),
            json!({"choices":[{"index":0,"finish_reason":"private-arbitrary-string"}]}),
            json!({"choices":[{"index":0,"finish_reason":"stop"},{"index":0,"finish_reason":"length"}]}),
            json!({"choices":[{"index":0,"finish_reason":"stop"}],"error":{}}),
            json!({"choices":vec![json!({"index":0,"finish_reason":"stop"});129]}),
        ] {
            assert_eq!(RequestChoiceFinish::from_chat_response(&invalid), None);
        }
    }
}
