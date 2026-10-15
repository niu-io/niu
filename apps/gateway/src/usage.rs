//! Process-local evidence counters, not a billing ledger. Every dispatched
//! attempt starts unknown, including requests that fail or are cancelled.
use std::sync::{
    Arc,
    atomic::{AtomicU64, Ordering},
};

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
pub struct UsageMetrics {
    attempts_total: AtomicU64,
    attempts_unknown: AtomicU64,
    attempts_provider_reported: AtomicU64,
    prompt_tokens: AtomicU64,
    completion_tokens: AtomicU64,
}

impl UsageMetrics {
    pub fn begin(self: &Arc<Self>) -> UsageAttempt {
        self.attempts_total.fetch_add(1, Ordering::Relaxed);
        self.attempts_unknown.fetch_add(1, Ordering::Relaxed);
        UsageAttempt(self.clone())
    }

    pub fn snapshot(&self) -> UsageSnapshot {
        UsageSnapshot {
            attempts_total: self.attempts_total.load(Ordering::Relaxed),
            attempts_unknown: self.attempts_unknown.load(Ordering::Relaxed),
            attempts_provider_reported: self.attempts_provider_reported.load(Ordering::Relaxed),
            prompt_tokens: self.prompt_tokens.load(Ordering::Relaxed),
            completion_tokens: self.completion_tokens.load(Ordering::Relaxed),
        }
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
        if self
            .0
            .prompt_tokens
            .fetch_update(Ordering::Relaxed, Ordering::Relaxed, |cur| {
                cur.checked_add(prompt)
            })
            .is_err()
        {
            return;
        }
        if self
            .0
            .completion_tokens
            .fetch_update(Ordering::Relaxed, Ordering::Relaxed, |cur| {
                cur.checked_add(completion)
            })
            .is_err()
        {
            self.0.prompt_tokens.fetch_sub(prompt, Ordering::Relaxed);
            return;
        }
        self.0.attempts_unknown.fetch_sub(1, Ordering::Relaxed);
        self.0
            .attempts_provider_reported
            .fetch_add(1, Ordering::Relaxed);
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
