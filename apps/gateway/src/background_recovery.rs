//! Independent schedules for content maintenance and financial recovery.
//! Both use the existing pool; financial scans keep their database ownership.
use niu_storage::Store;
use tokio::task::JoinHandle;

pub(crate) fn spawn(store: Store) -> [JoinHandle<()>; 2] {
    let recovery_store = store.clone();
    let cleanup = tokio::spawn(async move {
        let mut interval = interval();
        loop {
            interval.tick().await;
            if recovery_store.purge_expired_video_intents().await.is_err() {
                tracing::warn!("Expired video intent cleanup requires retry");
            }
            if recovery_store
                .purge_expired_request_payloads()
                .await
                .is_err()
            {
                tracing::warn!("Expired request payload cleanup requires retry");
            }
            if recovery_store
                .purge_expired_media_result_references()
                .await
                .is_err()
            {
                tracing::warn!("Expired media result cleanup requires retry");
            }
            if recovery_store
                .purge_expired_inspected_image_sources()
                .await
                .is_err()
            {
                tracing::warn!("Expired inspected image source cleanup requires retry");
            }
            if recovery_store
                .recover_interrupted_asset_image_ingestions()
                .await
                .is_err()
            {
                tracing::warn!("Interrupted image ingestion recovery requires retry");
            }
            if recovery_store
                .recover_interrupted_ingested_image_reads()
                .await
                .is_err()
            {
                tracing::warn!("Interrupted image readiness recovery requires retry");
            }
        }
    });
    let recovery_store = store;
    let financial = tokio::spawn(async move {
        let mut interval = interval();
        loop {
            interval.tick().await;
            for failure in recovery_store.recover_financial_work().await {
                match failure {
                    niu_storage::FinancialRecoveryFailure::Attempts { stage, count } => {
                        tracing::warn!(
                            stage,
                            failures = count,
                            "Financial recovery requires retry"
                        );
                    }
                    niu_storage::FinancialRecoveryFailure::Storage { stage } => {
                        tracing::warn!(stage, "Financial recovery storage unavailable");
                    }
                }
            }
        }
    });
    [cleanup, financial]
}

fn interval() -> tokio::time::Interval {
    let mut interval = tokio::time::interval(std::time::Duration::from_secs(5));
    interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
    interval
}
