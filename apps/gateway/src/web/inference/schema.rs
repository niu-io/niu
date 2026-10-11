//! Bounded offline schema compilation shared by native protocol validators.
use serde_json::Value;

pub(super) fn validator(schema: &Value) -> Result<jsonschema::Validator, ()> {
    // Bound compilation independently of the overall request size. Offline mode
    // also prevents caller-controlled references from reading files or making requests.
    if serde_json::to_vec(schema).map_err(|_| ())?.len() > 65_536 {
        return Err(());
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
    jsonschema::options()
        .offline()
        .with_pattern_options(
            jsonschema::PatternOptions::fancy_regex()
                .backtrack_limit(10_000)
                .size_limit(1_048_576)
                .dfa_size_limit(1_048_576),
        )
        .build(schema)
        .map_err(|_| ())
}
