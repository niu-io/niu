use std::{
    collections::{HashMap, VecDeque},
    time::Duration,
};

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
    Admit(PendingAdmission),
    Shutdown(oneshot::Sender<()>),
}

enum CompletionCommand {
    Complete(GatewayCompletion),
    Shutdown(oneshot::Sender<()>),
}

enum PricedCompletionCommand {
    Complete(PricedGatewayCompletion),
    Shutdown(oneshot::Sender<()>),
}

pub(crate) struct PricedGatewayCompletion {
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

#[derive(Clone, Copy, Debug)]
pub(crate) enum AdmissionError {
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
        scope: niu_storage::TenantScope,
        model: &str,
        upstream_model: &str,
        api_base: Option<&str>,
        task_id: Option<&str>,
        revision: &str,
    ) -> Result<(Uuid, Uuid), AdmissionError> {
        let operation_id = Uuid::new_v4();
        let attempt_id = Uuid::new_v4();
        let record = GatewayAdmission {
            operation_id,
            attempt_id,
            scope,
            key_id: principal.key_id(),
            model: model.to_owned(),
            upstream_model: upstream_model.to_owned(),
            api_base: api_base.map(str::to_owned),
            task_id: task_id.map(str::to_owned),
            revision: revision.to_owned(),
        };
        let (reply, result) = oneshot::channel();
        self.admissions
            .send(AdmissionCommand::Admit(PendingAdmission {
                record,
                batch_candidate: self.inference_in_flight.load(Ordering::Relaxed) > 1,
                reply,
            }))
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
        self.completions
            .send(CompletionCommand::Complete(completion))
            .await
            .map_err(|_| ())
    }

    /// Queue provider-reported usage and settlement after the durable budget
    /// hold and dispatch intent. A full queue applies backpressure; it never
    /// discards priced completion evidence.
    pub(crate) async fn complete_priced(
        &self,
        completion: PricedGatewayCompletion,
    ) -> Result<(), ()> {
        self.priced_completions
            .send(PricedCompletionCommand::Complete(completion))
            .await
            .map_err(|_| ())
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
                batch.push(first);
                if !batch[0].batch_candidate {
                    while batch.len() < MAX_BATCH_SIZE {
                        match receiver.try_recv() {
                            Ok(AdmissionCommand::Admit(admission)) => batch.push(admission),
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
                                Some(AdmissionCommand::Admit(admission)) => batch.push(admission),
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
    let mut in_flight = JoinSet::new();
    loop {
        if in_flight.len() >= MAX_IN_FLIGHT_BATCHES {
            join_one(&mut in_flight, "gateway completion").await;
        }
        let command = match deferred.take() {
            Some(command) => Some(command),
            None => receiver.recv().await,
        };
        match command {
            Some(CompletionCommand::Complete(first)) => {
                let mut batch = Vec::with_capacity(MAX_BATCH_SIZE);
                batch.push(first);
                let deadline = tokio::time::sleep(MAX_COMPLETION_BATCH_DELAY);
                tokio::pin!(deadline);
                while batch.len() < MAX_BATCH_SIZE {
                    tokio::select! {
                        _ = &mut deadline => break,
                        next = receiver.recv() => match next {
                            Some(CompletionCommand::Complete(completion)) => batch.push(completion),
                            Some(other) => {
                                deferred = Some(other);
                                break;
                            }
                            None => break,
                        }
                    }
                }
                let store = store.clone();
                in_flight.spawn(async move { persist_completion_batch(&store, batch).await });
            }
            Some(CompletionCommand::Shutdown(reply)) => {
                drain(&mut in_flight, "gateway completion").await;
                let _ = reply.send(());
                return;
            }
            None => {
                drain(&mut in_flight, "gateway completion").await;
                return;
            }
        }
    }
}

async fn run_priced_completion_writer(
    store: Store,
    mut receiver: mpsc::Receiver<PricedCompletionCommand>,
) {
    let mut deferred = None;
    let mut in_flight = JoinSet::new();
    let mut pending: VecDeque<(TenantScope, Vec<GatewayCompletion>)> = VecDeque::new();
    loop {
        while in_flight.len() < MAX_IN_FLIGHT_BATCHES {
            let Some((scope, completions)) = pending.pop_front() else {
                break;
            };
            let store = store.clone();
            in_flight.spawn(async move {
                if let Err(error) = store
                    .complete_and_settle_gateway_batch(scope, completions.clone())
                    .await
                {
                    tracing::warn!(
                        count = completions.len(),
                        error = %error,
                        "priced gateway completion batch could not be settled; durable reservations remain available for recovery"
                    );
                    if matches!(
                        error,
                        niu_storage::StoreError::Conflict
                            | niu_storage::StoreError::AggregateOverflow
                            | niu_storage::StoreError::InvalidGatewayAdmissionBatch
                    ) {
                        for completion in completions {
                            let result = store
                                .complete_and_settle_with_provider_model(
                                    completion.scope,
                                    completion.attempt_id,
                                    completion.usage,
                                    completion.provider_model.as_deref(),
                                )
                                .await;
                            match result {
                                Ok(()) => {}
                                Err(niu_storage::StoreError::Conflict)
                                    if completion.usage.is_some() =>
                                {
                                    if let Err(error) = store
                                        .settle_cost(
                                            completion.scope,
                                            completion.attempt_id,
                                        )
                                        .await
                                    {
                                        tracing::warn!(
                                            error = %error,
                                            attempt_id = %completion.attempt_id,
                                            "priced gateway completion fallback could not be settled"
                                        );
                                    }
                                }
                                Err(niu_storage::StoreError::Conflict) => {}
                                Err(error) => {
                                    tracing::warn!(
                                        error = %error,
                                        attempt_id = %completion.attempt_id,
                                        "priced gateway completion fallback could not be persisted"
                                    );
                                }
                            }
                        }
                    }
                }
            });
        }
        if in_flight.len() >= MAX_IN_FLIGHT_BATCHES {
            join_one(&mut in_flight, "priced gateway completion").await;
            continue;
        }
        if !pending.is_empty() {
            continue;
        }
        let command = match deferred.take() {
            Some(command) => Some(command),
            None => receiver.recv().await,
        };
        match command {
            Some(PricedCompletionCommand::Complete(completion)) => {
                let mut batch = Vec::with_capacity(MAX_BATCH_SIZE);
                batch.push(completion);
                let deadline = tokio::time::sleep(MAX_COMPLETION_BATCH_DELAY);
                tokio::pin!(deadline);
                while batch.len() < MAX_BATCH_SIZE {
                    tokio::select! {
                        _ = &mut deadline => break,
                        next = receiver.recv() => match next {
                            Some(PricedCompletionCommand::Complete(completion)) => batch.push(completion),
                            Some(other) => {
                                deferred = Some(other);
                                break;
                            }
                            None => break,
                        }
                    }
                }
                let mut grouped = HashMap::new();
                for completion in batch {
                    let scope = completion.scope;
                    grouped
                        .entry((scope.organization_id, scope.project_id))
                        .or_insert_with(|| (scope, Vec::new()))
                        .1
                        .push(GatewayCompletion {
                            scope,
                            attempt_id: completion.attempt_id,
                            usage: completion.usage,
                            provider_model: completion.provider_model,
                        });
                }
                pending.extend(grouped.into_values());
            }
            Some(PricedCompletionCommand::Shutdown(reply)) => {
                drain(&mut in_flight, "priced gateway completion").await;
                let _ = reply.send(());
                return;
            }
            None => {
                drain(&mut in_flight, "priced gateway completion").await;
                return;
            }
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
    match store.admit_unpriced_gateway_batch(records).await {
        Ok(statuses) => {
            for (reply, status) in replies.into_iter().zip(statuses) {
                let _ = reply.send(Ok(status));
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

async fn persist_completion_batch(store: &Store, batch: Vec<GatewayCompletion>) {
    let count = batch.len();
    if let Err(error) = store.complete_gateway_batch(batch.clone()).await {
        tracing::warn!(error = %error, count, "gateway completion batch failed; attempts remain unresolved");
        if matches!(
            error,
            niu_storage::StoreError::Conflict
                | niu_storage::StoreError::InvalidGatewayAdmissionBatch
        ) {
            for completion in batch {
                if let Err(error) = store
                    .complete_with_provider_model(
                        completion.scope,
                        completion.attempt_id,
                        completion.usage,
                        completion.provider_model.as_deref(),
                    )
                    .await
                {
                    if !matches!(error, niu_storage::StoreError::Conflict) {
                        tracing::warn!(
                            error = %error,
                            attempt_id = %completion.attempt_id,
                            "gateway completion fallback could not be persisted"
                        );
                    }
                }
            }
        }
    }
}
