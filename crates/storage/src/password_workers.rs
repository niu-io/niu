//! Bounded CPU execution for password credential creation and verification.
use crate::{PasswordLoginCredential, VerifiedPasswordLogin, passwords::PasswordError};
use std::sync::Arc;
use tokio::sync::Semaphore;

#[derive(Clone)]
pub struct PasswordWorkers {
    permits: Arc<Semaphore>,
}

#[derive(Debug, thiserror::Error)]
pub enum PasswordWorkError {
    #[error("password worker limit must be between 1 and 4")]
    InvalidCapacity,
    #[error("password verification capacity is unavailable")]
    Capacity,
    #[error("password credential processing is unavailable")]
    Unavailable,
    #[error(transparent)]
    Credential(#[from] PasswordError),
}

impl PasswordWorkers {
    /// Share one instance across the gateway's handlers. This per-process limit
    /// complements durable login throttling; it does not replace rate limits.
    pub fn new(limit: usize) -> Result<Self, PasswordWorkError> {
        if !(1..=4).contains(&limit) {
            return Err(PasswordWorkError::InvalidCapacity);
        }
        Ok(Self {
            permits: Arc::new(Semaphore::new(limit)),
        })
    }

    async fn execute<T: Send + 'static>(
        &self,
        work: impl FnOnce() -> T + Send + 'static,
    ) -> Result<T, PasswordWorkError> {
        // Reject excess requests immediately rather than retaining an unbounded
        // queue of plaintext passwords while CPU workers are busy.
        let permit = self
            .permits
            .clone()
            .try_acquire_owned()
            .map_err(|_| PasswordWorkError::Capacity)?;
        tokio::task::spawn_blocking(move || {
            // Cancellation of the awaiting request cannot release capacity
            // while its non-cancellable blocking calculation still runs.
            let result = work();
            drop(permit);
            result
        })
        .await
        .map_err(|_| PasswordWorkError::Unavailable)
    }

    pub async fn hash(&self, password: String) -> Result<String, PasswordWorkError> {
        self.execute(move || crate::passwords::hash_password(&password))
            .await?
            .map_err(PasswordWorkError::Credential)
    }

    pub async fn hash_development_seed(
        &self,
        password: String,
    ) -> Result<String, PasswordWorkError> {
        self.execute(move || crate::passwords::hash_development_password(&password))
            .await?
            .map_err(PasswordWorkError::Credential)
    }

    pub async fn verify(
        &self,
        credential: PasswordLoginCredential,
        password: String,
    ) -> Result<Option<VerifiedPasswordLogin>, PasswordWorkError> {
        self.execute(move || credential.verify(&password)).await
    }

    /// Used for the same bounded verification work when an identity is unknown.
    pub async fn verify_encoded(
        &self,
        encoded: String,
        password: String,
    ) -> Result<bool, PasswordWorkError> {
        self.execute(move || crate::passwords::verify_password(&password, &encoded))
            .await
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn cancellation_holds_capacity_until_blocking_work_finishes() {
        let workers = PasswordWorkers::new(1).unwrap();
        let (started_tx, started_rx) = tokio::sync::oneshot::channel();
        let (release_tx, release_rx) = std::sync::mpsc::channel();
        let running = workers.clone();
        let first = tokio::spawn(async move {
            running
                .execute(move || {
                    started_tx.send(()).unwrap();
                    release_rx.recv().unwrap();
                })
                .await
        });
        started_rx.await.unwrap();
        first.abort();
        assert!(matches!(
            workers.execute(|| ()).await,
            Err(PasswordWorkError::Capacity)
        ));
        release_tx.send(()).unwrap();
        // Acquiring the permit proves the cancelled calculation has released it.
        let permit =
            tokio::time::timeout(std::time::Duration::from_secs(5), workers.permits.acquire())
                .await
                .unwrap()
                .unwrap();
        drop(permit);
        assert_eq!(workers.execute(|| 42).await.unwrap(), 42);
    }

    #[tokio::test]
    async fn credential_creation_and_invalid_limits_are_bounded() {
        assert!(matches!(
            PasswordWorkers::new(0),
            Err(PasswordWorkError::InvalidCapacity)
        ));
        assert!(matches!(
            PasswordWorkers::new(5),
            Err(PasswordWorkError::InvalidCapacity)
        ));
        let workers = PasswordWorkers::new(1).unwrap();
        assert!(matches!(
            workers.hash("short".into()).await,
            Err(PasswordWorkError::Credential(
                PasswordError::InvalidPassword
            ))
        ));
        let hash = workers
            .hash("synthetic worker passphrase".into())
            .await
            .unwrap();
        assert!(crate::passwords::verify_password(
            "synthetic worker passphrase",
            &hash
        ));
    }
}
