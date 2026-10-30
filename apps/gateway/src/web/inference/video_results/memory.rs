//! One budget for retained result buffers during download and delivery.
use axum::body::Bytes;
use std::sync::{Arc, LazyLock};
use tokio::sync::{OwnedSemaphorePermit, Semaphore};

pub(super) const CHUNK_BYTES: usize = 64 * 1024;
const CAPACITY_CHUNKS: usize = 4096; // 256 MiB of retained buffer capacity.
static BUFFERS: LazyLock<Arc<Semaphore>> =
    LazyLock::new(|| Arc::new(Semaphore::new(CAPACITY_CHUNKS)));

/// Fail before network work instead of queuing already allocated result bytes.
pub(super) fn reserve(maximum_bytes: usize) -> Option<OwnedSemaphorePermit> {
    let chunks = maximum_bytes.div_ceil(CHUNK_BYTES).max(1);
    let chunks = u32::try_from(chunks).ok()?;
    BUFFERS.clone().try_acquire_many_owned(chunks).ok()
}

/// Transport bounds Vec capacity by the reserved maximum. Retain capacity,
/// rather than length, because converting Vec into Bytes retains its allocation.
pub(super) fn retain(permit: &mut OwnedSemaphorePermit, allocated_bytes: usize) {
    let chunks = allocated_bytes.div_ceil(CHUNK_BYTES).max(1);
    let unused = permit.num_permits().saturating_sub(chunks);
    drop(permit.split(unused));
}

struct BufferedResult {
    bytes: Vec<u8>,
    _permit: OwnedSemaphorePermit,
}

impl AsRef<[u8]> for BufferedResult {
    fn as_ref(&self) -> &[u8] {
        &self.bytes
    }
}

/// A response frame can outlive the stream that yielded it. Keep its allocation
/// and reservation under the same owner, including every sliced/cloned frame.
pub(super) fn into_bytes(bytes: Vec<u8>, permit: OwnedSemaphorePermit) -> Bytes {
    Bytes::from_owner(BufferedResult {
        bytes,
        _permit: permit,
    })
}
