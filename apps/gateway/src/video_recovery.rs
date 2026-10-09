//! Opt-in direct-channel polling and settlement. Never resubmits generation.
use crate::state::AppState;

pub(crate) fn spawn(state: &AppState) -> Result<Option<tokio::task::JoinHandle<()>>, &'static str> {
    match std::env::var("NIU_VIDEO_POLLING").as_deref() {
        Err(std::env::VarError::NotPresent) | Ok("false") => return Ok(None),
        Ok("true") => (),
        _ => return Err("NIU_VIDEO_POLLING must be true or false"),
    }
    let state = state.clone();
    Ok(Some(tokio::spawn(async move {
        let mut interval = tokio::time::interval(std::time::Duration::from_secs(5));
        interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
        loop {
            interval.tick().await;
            if run_once(&state).await.is_err() {
                tracing::warn!("Video query recovery requires retry");
            }
        }
    })))
}

pub(crate) async fn run_once(state: &AppState) -> Result<bool, niu_storage::StoreError> {
    state.store.enqueue_pending_media_queries().await?;
    let Some(lease) = state.store.claim_media_query(uuid::Uuid::new_v4()).await? else {
        return Ok(false);
    };
    match state
        .store
        .recover_customer_media_settlement(lease.scope, lease.attempt_id)
        .await
    {
        Ok(true) => {
            state.store.finish_media_query(&lease, false, true).await?;
            return Ok(true);
        }
        Ok(false) => (),
        Err(niu_storage::StoreError::BudgetExceeded | niu_storage::StoreError::Unresolved) => {
            state.store.finish_media_query(&lease, true, false).await?;
            return Ok(true);
        }
        Err(error) => {
            state.store.finish_media_query(&lease, true, false).await?;
            return Err(error);
        }
    }
    let principal = match state.store.dashboard_key(lease.scope, lease.key_id).await {
        Ok(principal) => principal,
        Err(niu_storage::StoreError::Unauthorized) => {
            state.store.finish_media_query(&lease, false, true).await?;
            return Ok(true);
        }
        Err(error) => {
            state.store.finish_media_query(&lease, true, false).await?;
            return Err(error);
        }
    };
    let (failed, stop) =
        match crate::web::refresh_for_principal(state, &principal, lease.attempt_id).await {
            Ok(value) => {
                let stop = match state
                    .store
                    .media_query_recovery_complete(lease.scope, lease.attempt_id)
                    .await
                {
                    Ok(stop) => stop,
                    Err(error) => {
                        state.store.finish_media_query(&lease, true, false).await?;
                        return Err(error);
                    }
                };
                (value["status"] == "succeeded" && !stop, stop)
            }
            Err(_) => (true, false),
        };
    state.store.finish_media_query(&lease, failed, stop).await?;
    Ok(true)
}
