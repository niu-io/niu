use std::{collections::HashMap, time::Duration};

use niu_storage::{
    GatewayAdmission, GatewayAdmissionStatus, GatewayCompletion, Principal, Store, TenantScope,
};
use std::sync::{
    Arc,
    atomic::{AtomicUsize, Ordering},
};
use tokio::{
    sync::{mpsc, oneshot},
    task::JoinSet,
};
use uuid::Uuid;

const QUEUE_CAPACITY: usize = 4096;
const MAX_BATCH_SIZE: usize = 64;
const MAX_ADMISSION_BATCH_DELAY: Duration = Duration::from_micros(200);
const MAX_COMPLETION_BATCH_DELAY: Duration = Duration::from_millis(2);
const MAX_IN_FLIGHT_BATCHES: usize = 4;

#[derive(Clone)]
pub(crate) struct GatewayWrites {
    admissions: mpsc::Sender<AdmissionCommand>,
    completions: mpsc::Sender<CompletionCommand>,
    priced_completions: mpsc::Sender<PricedCompletionCommand>,
    inference_in_flight: Arc<AtomicUsize>,
}

enum AdmissionCommand {
    Admit(Box<PendingAdmission>),
    Shutdown(oneshot::Sender<()>),
}

enum CompletionCommand {
    Complete(GatewayCompletion, oneshot::Sender<bool>),
    Shutdown(oneshot::Sender<()>),
}

enum PricedCompletionCommand {
    Complete(PricedGatewayCompletion, oneshot::Sender<bool>),
    Shutdown(oneshot::Sender<()>),
}

pub(crate) struct PricedGatewayCompletion {
    pub(crate) token_categories: Option<niu_storage::RequestTokenCategories>,
    pub(crate) scope: niu_storage::TenantScope,
    pub(crate) attempt_id: Uuid,
    pub(crate) usage: Option<(u64, u64)>,
    pub(crate) provider_model: Option<String>,
}

struct PendingAdmission {
    record: GatewayAdmission,
    batch_candidate: bool,
    reply: oneshot::Sender<Result<GatewayAdmissionStatus, AdmissionError>>,
}

pub(crate) struct UnpricedAdmissionRequest<'a> {
    pub inspected_guardrails: niu_storage::GuardrailSnapshot,
    pub(crate) scope: TenantScope,
    pub(crate) model: &'a str,
    pub(crate) upstream_model: &'a str,
    pub(crate) provider: &'a str,
    pub(crate) api_base: Option<&'a str>,
    pub(crate) task_id: Option<&'a str>,
    pub(crate) revision: &'a str,
}

#[derive(Clone, Copy, Debug)]
pub(crate) enum AdmissionError {
    RequestRateExceeded,
    Unauthorized,
    Conflict,
    AccountUnavailable,
    StorageUnavailable,
}

impl GatewayWrites {
    pub(crate) fn new(store: Store, inference_in_flight: Arc<AtomicUsize>) -> Self {
        let (admission_sender, admission_receiver) = mpsc::channel(QUEUE_CAPACITY);
        let (completion_sender, completion_receiver) = mpsc::channel(QUEUE_CAPACITY);
        let (priced_completion_sender, priced_completion_receiver) = mpsc::channel(QUEUE_CAPACITY);
        tokio::spawn(run_admission_writer(store.clone(), admission_receiver));
        tokio::spawn(run_completion_writer(store.clone(), completion_receiver));
        tokio::spawn(run_priced_completion_writer(
            store,
            priced_completion_receiver,
        ));
        Self {
            admissions: admission_sender,
            completions: completion_sender,
            priced_completions: priced_completion_sender,
            inference_in_flight,
        }
    }

    pub(crate) async fn admit_unpriced(
        &self,
        principal: &Principal,
        request: UnpricedAdmissionRequest<'_>,
    ) -> Result<(Uuid, Uuid), AdmissionError> {
        let operation_id = Uuid::new_v4();
        let attempt_id = Uuid::new_v4();
        let record = GatewayAdmission {
            inspected_guardrails: Some(request.inspected_guardrails),
            operation_id,
            attempt_id,
            scope: request.scope,
            key_id: principal.key_id(),
            model: request.model.to_owned(),
            upstream_model: request.upstream_model.to_owned(),
            dispatch_provider: request.provider.to_owned(),
            api_base: request.api_base.map(str::to_owned),
            task_id: request.task_id.map(str::to_owned),
            revision: request.revision.to_owned(),
        };
        let (reply, result) = oneshot::channel();
        self.admissions
            .send(AdmissionCommand::Admit(Box::new(PendingAdmission {
                record,
                batch_candidate: self.inference_in_flight.load(Ordering::Relaxed) > 1,
                reply,
            })))
            .await
            .map_err(|_| AdmissionError::StorageUnavailable)?;
        match result
            .await
            .map_err(|_| AdmissionError::StorageUnavailable)??
        {
            GatewayAdmissionStatus::Admitted => Ok((operation_id, attempt_id)),
            GatewayAdmissionStatus::Unauthorized => Err(AdmissionError::Unauthorized),
            GatewayAdmissionStatus::Conflict => Err(AdmissionError::Conflict),
            GatewayAdmissionStatus::AccountUnavailable => Err(AdmissionError::AccountUnavailable),
        }
    }

    /// Queue nonfinancial completion evidence after the durable dispatch intent
    /// has already been recorded. A full bounded buffer applies backpressure
    /// instead of dropping the outcome; a process stop still leaves the attempt
    /// explicitly unresolved rather than appearing unused.
    pub(crate) async fn complete_unpriced(&self, completion: GatewayCompletion) -> Result<(), ()> {
        let (reply, result) = oneshot::channel();
        self.completions
            .send(CompletionCommand::Complete(completion, reply))
            .await
            .map_err(|_| ())?;
        if result.await.map_err(|_| ())? {
            Ok(())
        } else {
            Err(())
        }
    }

    /// Queue provider-reported usage and settlement after the durable budget
    /// hold and dispatch intent. A full queue applies backpressure; it never
    /// discards priced completion evidence.
    pub(crate) async fn complete_priced(
        &self,
        completion: PricedGatewayCompletion,
    ) -> Result<(), ()> {
        let (reply, result) = oneshot::channel();
        self.priced_completions
            .send(PricedCompletionCommand::Complete(completion, reply))
            .await
            .map_err(|_| ())?;
        if result.await.map_err(|_| ())? {
            Ok(())
        } else {
            Err(())
        }
    }

    /// Drain both bounded buffers before stopping the writer tasks.
    pub(crate) async fn shutdown(&self) {
        let (admissions_stopped, admissions_result) = oneshot::channel();
        let (completions_stopped, completions_result) = oneshot::channel();
        let (priced_completions_stopped, priced_completions_result) = oneshot::channel();
        let admission_sent = self
            .admissions
            .send(AdmissionCommand::Shutdown(admissions_stopped))
            .await
            .is_ok();
        let completion_sent = self
            .completions
            .send(CompletionCommand::Shutdown(completions_stopped))
            .await
            .is_ok();
        let priced_completion_sent = self
            .priced_completions
            .send(PricedCompletionCommand::Shutdown(
                priced_completions_stopped,
            ))
            .await
            .is_ok();
        if admission_sent {
            let _ = admissions_result.await;
        }
        if completion_sent {
            let _ = completions_result.await;
        }
        if priced_completion_sent {
            let _ = priced_completions_result.await;
        }
    }
}

async fn run_admission_writer(store: Store, mut receiver: mpsc::Receiver<AdmissionCommand>) {
    let mut deferred = None;
    let mut in_flight = JoinSet::new();
    loop {
        if in_flight.len() >= MAX_IN_FLIGHT_BATCHES {
            join_one(&mut in_flight, "gateway admission").await;
        }
        let command = match deferred.take() {
            Some(command) => Some(command),
            None => receiver.recv().await,
        };
        match command {
            Some(AdmissionCommand::Admit(first)) => {
                let mut batch = Vec::with_capacity(MAX_BATCH_SIZE);
                batch.push(*first);
                if !batch[0].batch_candidate {
                    while batch.len() < MAX_BATCH_SIZE {
                        match receiver.try_recv() {
                            Ok(AdmissionCommand::Admit(admission)) => batch.push(*admission),
                            Ok(other) => {
                                deferred = Some(other);
                                break;
                            }
                            Err(_) => break,
                        }
                    }
                } else {
                    let deadline = tokio::time::sleep(MAX_ADMISSION_BATCH_DELAY);
                    tokio::pin!(deadline);
                    while batch.len() < MAX_BATCH_SIZE {
                        tokio::select! {
                            _ = &mut deadline => break,
                            next = receiver.recv() => match next {
                                Some(AdmissionCommand::Admit(admission)) => batch.push(*admission),
                                Some(other) => {
                                    deferred = Some(other);
                                    break;
                                }
                                None => break,
                            }
                        }
                    }
                }
                let store = store.clone();
                in_flight.spawn(async move { persist_admission_batch(&store, batch).await });
            }
            Some(AdmissionCommand::Shutdown(reply)) => {
                drain(&mut in_flight, "gateway admission").await;
                let _ = reply.send(());
                return;
            }
            None => {
                drain(&mut in_flight, "gateway admission").await;
                return;
            }
        }
    }
}

async fn run_completion_writer(store: Store, mut receiver: mpsc::Receiver<CompletionCommand>) {
    let mut deferred = None;
    loop {
        let command = match deferred.take() {
            Some(command) => Some(command),
            None => receiver.recv().await,
        };
        match command {
            Some(CompletionCommand::Complete(first, first_reply)) => {
                let mut batch = Vec::with_capacity(MAX_BATCH_SIZE);
                batch.push((first, first_reply));
                let deadline = tokio::time::sleep(MAX_COMPLETION_BATCH_DELAY);
                tokio::pin!(deadline);
                while batch.len() < MAX_BATCH_SIZE {
                    tokio::select! {
                        _ = &mut deadline => break,
                        next = receiver.recv() => match next {
                            Some(CompletionCommand::Complete(completion, reply)) => batch.push((completion, reply)),
                            Some(other) => {
                                deferred = Some(other);
                                break;
                            }
                            None => break,
                        }
                    }
                }
                let (completions, replies): (Vec<_>, Vec<_>) = batch.into_iter().unzip();
                let persisted = persist_completion_batch(&store, completions).await;
                for (reply, persisted) in replies.into_iter().zip(persisted) {
                    let _ = reply.send(persisted);
                }
            }
            Some(CompletionCommand::Shutdown(reply)) => {
                let _ = reply.send(());
                return;
            }
            None => return,
        }
    }
}

async fn run_priced_completion_writer(
    store: Store,
    mut receiver: mpsc::Receiver<PricedCompletionCommand>,
) {
    let mut deferred = None;
    loop {
        let command = match deferred.take() {
            Some(command) => Some(command),
            None => receiver.recv().await,
        };
        match command {
            Some(PricedCompletionCommand::Complete(completion, first_reply)) => {
                let mut batch = Vec::with_capacity(MAX_BATCH_SIZE);
                batch.push((completion, first_reply));
                let deadline = tokio::time::sleep(MAX_COMPLETION_BATCH_DELAY);
                tokio::pin!(deadline);
                while batch.len() < MAX_BATCH_SIZE {
                    tokio::select! {
                        _ = &mut deadline => break,
                        next = receiver.recv() => match next {
                            Some(PricedCompletionCommand::Complete(completion, reply)) => batch.push((completion, reply)),
                            Some(other) => {
                                deferred = Some(other);
                                break;
                            }
                            None => break,
                        }
                    }
                }
                let mut grouped = HashMap::new();
                for (completion, reply) in batch {
                    let scope = completion.scope;
                    grouped
                        .entry((scope.organization_id, scope.project_id))
                        .or_insert_with(|| (scope, Vec::new()))
                        .1
                        .push((
                            GatewayCompletion {
                                token_categories: completion.token_categories,
                                scope,
                                attempt_id: completion.attempt_id,
                                usage: completion.usage,
                                provider_model: completion.provider_model,
                            },
                            reply,
                        ));
                }
                for (_, (scope, grouped_batch)) in grouped {
                    let (records, replies): (Vec<_>, Vec<_>) = grouped_batch.into_iter().unzip();
                    let persisted = persist_priced_completion_batch(&store, scope, records).await;
                    for (reply, persisted) in replies.into_iter().zip(persisted) {
                        let _ = reply.send(persisted);
                    }
                }
            }
            Some(PricedCompletionCommand::Shutdown(reply)) => {
                let _ = reply.send(());
                return;
            }
            None => return,
        }
    }
}

async fn persist_priced_completion_batch(
    store: &Store,
    scope: TenantScope,
    completions: Vec<GatewayCompletion>,
) -> Vec<bool> {
    let count = completions.len();
    match store
        .complete_and_settle_gateway_batch(scope, completions.clone())
        .await
    {
        Ok(()) => vec![true; count],
        Err(error) => {
            tracing::warn!(
                error = %error,
                count,
                "priced gateway completion batch failed; retrying records individually"
            );
            let mut persisted = Vec::with_capacity(count);
            for completion in completions {
                let result = store
                    .complete_and_settle_with_provider_model(
                        completion.scope,
                        completion.attempt_id,
                        completion.usage,
                        completion.provider_model.as_deref(),
                    )
                    .await;
                let completed = match result {
                    Ok(()) => true,
                    Err(niu_storage::StoreError::Conflict) if completion.usage.is_some() => store
                        .settle_cost(completion.scope, completion.attempt_id)
                        .await
                        .is_ok(),
                    Err(error) => {
                        tracing::warn!(
                            error = %error,
                            attempt_id = %completion.attempt_id,
                            "priced gateway completion fallback could not be persisted"
                        );
                        false
                    }
                };
                persisted.push(completed);
            }
            persisted
        }
    }
}

async fn join_one(in_flight: &mut JoinSet<()>, task_name: &'static str) {
    if let Some(Err(error)) = in_flight.join_next().await {
        tracing::error!(error = %error, task_name, "gateway write task failed");
    }
}

async fn drain(in_flight: &mut JoinSet<()>, task_name: &'static str) {
    while !in_flight.is_empty() {
        join_one(in_flight, task_name).await;
    }
}

async fn persist_admission_batch(store: &Store, batch: Vec<PendingAdmission>) {
    let count = batch.len();
    let mut records = Vec::with_capacity(count);
    let mut replies = Vec::with_capacity(count);
    for admission in batch {
        records.push(admission.record);
        replies.push(admission.reply);
    }
    match store.admit_unpriced_gateway_batch(records.clone()).await {
        Ok(statuses) => {
            for (reply, status) in replies.into_iter().zip(statuses) {
                let _ = reply.send(Ok(status));
            }
        }
        Err(niu_storage::StoreError::KeyRequestRateExceeded) => {
            // P0020 proves the whole transaction rolled back before dispatch.
            // Isolate limited keys without replaying ambiguous database failures.
            for (record, reply) in records.into_iter().zip(replies) {
                let result = match store.admit_unpriced_gateway_batch(vec![record]).await {
                    Ok(mut statuses) if statuses.len() == 1 => Ok(statuses.remove(0)),
                    Err(niu_storage::StoreError::KeyRequestRateExceeded) => {
                        Err(AdmissionError::RequestRateExceeded)
                    }
                    Err(niu_storage::StoreError::Unauthorized) => Err(AdmissionError::Unauthorized),
                    Err(niu_storage::StoreError::Conflict) => Err(AdmissionError::Conflict),
                    Err(niu_storage::StoreError::AccountUnavailable) => {
                        Err(AdmissionError::AccountUnavailable)
                    }
                    _ => Err(AdmissionError::StorageUnavailable),
                };
                let _ = reply.send(result);
            }
        }
        Err(error) => {
            tracing::warn!(error = %error, count, "gateway admission batch failed");
            for reply in replies {
                let _ = reply.send(Err(AdmissionError::StorageUnavailable));
            }
        }
    }
}

async fn persist_completion_batch(store: &Store, batch: Vec<GatewayCompletion>) -> Vec<bool> {
    let count = batch.len();
    match store.complete_and_accrue_gateway_batch(batch.clone()).await {
        Ok(()) => vec![true; count],
        Err(error) => {
            tracing::warn!(error = %error, count, "gateway completion batch failed; retrying records individually");
            if matches!(
                error,
                niu_storage::StoreError::Conflict
                    | niu_storage::StoreError::InvalidGatewayAdmissionBatch
            ) {
                let mut persisted = Vec::with_capacity(count);
                for completion in batch {
                    let result = store
                        .complete_and_settle_with_provider_model(
                            completion.scope,
                            completion.attempt_id,
                            completion.usage,
                            completion.provider_model.as_deref(),
                        )
                        .await;
                    match result {
                        Ok(()) | Err(niu_storage::StoreError::Conflict) => persisted.push(true),
                        Err(error) => {
                            tracing::warn!(
                                error = %error,
                                attempt_id = %completion.attempt_id,
                                "gateway completion fallback could not be persisted"
                            );
                            persisted.push(false);
                        }
                    }
                }
                persisted
            } else {
                vec![false; count]
            }
        }
    }
}
