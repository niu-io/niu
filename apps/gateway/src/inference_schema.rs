//! Bounded offline schema compilation shared by native protocol validators.
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::sync::{Arc, LazyLock, Mutex};

struct ByteCounter {
    len: usize,
    limit: Option<usize>,
}

impl std::io::Write for ByteCounter {
    fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
        let next = self
            .len
            .checked_add(buf.len())
            .ok_or_else(|| std::io::Error::new(std::io::ErrorKind::InvalidInput, "overflow"))?;
        if let Some(limit) = self.limit
            && next > limit
        {
            return Err(std::io::Error::new(
                std::io::ErrorKind::InvalidInput,
                "limit exceeded",
            ));
        }
        self.len = next;
        Ok(buf.len())
    }

    fn flush(&mut self) -> std::io::Result<()> {
        Ok(())
    }
}

pub(crate) fn json_serialized_len<T: serde::Serialize + ?Sized>(
    value: &T,
) -> Result<usize, serde_json::Error> {
    let mut counter = ByteCounter {
        len: 0,
        limit: None,
    };
    serde_json::to_writer(&mut counter, value)?;
    Ok(counter.len)
}

pub(crate) fn json_serialized_len_within<T: serde::Serialize + ?Sized>(
    value: &T,
    max_bytes: usize,
) -> Result<usize, ()> {
    let mut counter = ByteCounter {
        len: 0,
        limit: Some(max_bytes),
    };
    serde_json::to_writer(&mut counter, value).map_err(|_| ())?;
    Ok(counter.len)
}

struct BoundedDigestWriter {
    len: usize,
    limit: usize,
    hasher: Sha256,
}

impl std::io::Write for BoundedDigestWriter {
    fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
        let next = self
            .len
            .checked_add(buf.len())
            .ok_or_else(|| std::io::Error::new(std::io::ErrorKind::InvalidInput, "overflow"))?;
        if next > self.limit {
            return Err(std::io::Error::new(
                std::io::ErrorKind::InvalidInput,
                "limit exceeded",
            ));
        }
        self.len = next;
        self.hasher.update(buf);
        Ok(buf.len())
    }

    fn flush(&mut self) -> std::io::Result<()> {
        Ok(())
    }
}

pub(crate) fn validator(schema: &Value) -> Result<Arc<jsonschema::Validator>, ()> {
    // Bound compilation independently of the overall request size. Offline mode
    // also prevents caller-controlled references from reading files or making requests.
    let mut writer = BoundedDigestWriter {
        len: 0,
        limit: 65_536,
        hasher: Sha256::new(),
    };
    serde_json::to_writer(&mut writer, schema).map_err(|_| ())?;
    let cache_key: [u8; 32] = writer.hasher.finalize().into();

    static VALIDATOR_CACHE: LazyLock<Mutex<HashMap<[u8; 32], Arc<jsonschema::Validator>>>> =
        LazyLock::new(|| Mutex::new(HashMap::new()));
    if let Ok(cache) = VALIDATOR_CACHE.lock()
        && let Some(compiled) = cache.get(&cache_key)
    {
        return Ok(compiled.clone());
    }

    let mut pending = vec![(schema, 0usize)];
    let mut nodes = 0usize;
    while let Some((value, depth)) = pending.pop() {
        nodes += 1;
        if nodes > 4096 || depth > 32 {
            return Err(());
        }
        match value {
            Value::Object(object) => pending.extend(object.values().map(|v| (v, depth + 1))),
            Value::Array(array) => pending.extend(array.iter().map(|v| (v, depth + 1))),
            _ => {}
        }
    }
    let compiled = Arc::new(
        jsonschema::options()
            .offline()
            .with_pattern_options(
                jsonschema::PatternOptions::fancy_regex()
                    .backtrack_limit(10_000)
                    .size_limit(1_048_576)
                    .dfa_size_limit(1_048_576),
            )
            .build(schema)
            .map_err(|_| ())?,
    );
    if let Ok(mut cache) = VALIDATOR_CACHE.lock() {
        if cache.len() >= 512
            && let Some(evict) = cache.keys().next().copied()
        {
            cache.remove(&evict);
        }
        cache.insert(cache_key, compiled.clone());
    }
    Ok(compiled)
}
