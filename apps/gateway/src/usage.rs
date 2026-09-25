//! Process-local evidence counters, not a billing ledger. Every dispatched
//! attempt starts unknown, including requests that fail or are cancelled.
use std::sync::{Arc, Mutex};

use serde::Serialize;
use serde_json::Value;

#[derive(Clone, Default, Serialize)]
pub struct UsageSnapshot {
    pub attempts_total: u64,
    pub attempts_unknown: u64,
    pub attempts_provider_reported: u64,
    /// Totals cover only attempts with complete, valid provider usage.
    pub prompt_tokens: u64,
    pub completion_tokens: u64,
}

#[derive(Default)]
pub struct UsageMetrics(Mutex<UsageSnapshot>);

impl UsageMetrics {
    pub fn begin(self: &Arc<Self>) -> UsageAttempt {
        let mut counters = self.0.lock().expect("usage metrics mutex");
        counters.attempts_total += 1;
        counters.attempts_unknown += 1;
        UsageAttempt(self.clone())
    }

    pub fn snapshot(&self) -> UsageSnapshot {
        self.0.lock().expect("usage metrics mutex").clone()
    }
}

pub struct UsageAttempt(Arc<UsageMetrics>);

impl UsageAttempt {
    /// Consuming the handle prevents counting the same attempt twice. Missing,
    /// partial, negative, fractional or overflowing evidence stays unknown.
    pub fn report(self, usage: &Value) {
        let (Some(prompt), Some(completion)) = (
            usage["prompt_tokens"].as_u64(),
            usage["completion_tokens"].as_u64(),
        ) else {
            return;
        };
        let mut counters = self.0.0.lock().expect("usage metrics mutex");
        let (Some(prompt_total), Some(completion_total)) = (
            counters.prompt_tokens.checked_add(prompt),
            counters.completion_tokens.checked_add(completion),
        ) else {
            return;
        };
        counters.prompt_tokens = prompt_total;
        counters.completion_tokens = completion_total;
        counters.attempts_unknown -= 1;
        counters.attempts_provider_reported += 1;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn missing_invalid_and_cancelled_usage_never_becomes_zero_evidence() {
        let metrics = Arc::new(UsageMetrics::default());
        for usage in [
            Value::Null,
            json!({"prompt_tokens": 3}),
            json!({"prompt_tokens": -1, "completion_tokens": 0}),
        ] {
            metrics.begin().report(&usage);
        }
        drop(metrics.begin());
        let snapshot = metrics.snapshot();
        assert_eq!(snapshot.attempts_unknown, 4);
        assert_eq!(snapshot.attempts_provider_reported, 0);
    }

    #[test]
    fn explicit_zero_is_evidence_and_totals_cover_only_reported_attempts() {
        let metrics = Arc::new(UsageMetrics::default());
        metrics
            .begin()
            .report(&json!({"prompt_tokens": 0, "completion_tokens": 0}));
        metrics
            .begin()
            .report(&json!({"prompt_tokens": 8, "completion_tokens": 3}));
        drop(metrics.begin());
        let snapshot = metrics.snapshot();
        assert_eq!(snapshot.attempts_total, 3);
        assert_eq!(snapshot.attempts_unknown, 1);
        assert_eq!(snapshot.attempts_provider_reported, 2);
        assert_eq!((snapshot.prompt_tokens, snapshot.completion_tokens), (8, 3));
    }
}
