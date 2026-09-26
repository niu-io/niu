# Niu benchmark evaluator

This crate evaluates a versioned, opt-in paired experiment from already-collected `ExecutionRecordV1` observations. It matches candidate results by the same task snapshot, tools, permissions and acceptance-policy hashes; keeps API-equivalent and cash amounts separate; includes evaluator cash in task cost; counts failed attempts in total spend; requires complete trace coverage and settled cost evidence; and reports a Wilson interval for decisive paired outcomes.

Reference diagnostics are explicitly labeled heuristics and link to observed span IDs. They do not establish causation, unnecessary work, or savings. Zero accepted completions have no cost-per-accepted-completion ratio.

Run the deterministic public scenario fixture with:

```sh
cargo run --locked -p niu-benchmark -- compare contracts/fixtures/paired-experiment.v1.json
```

The command analyzes an input file and writes a JSON report to stdout. It does not dispatch work, authenticate imported records, isolate a task runner, enforce a budget reservation, persist report history, or authorize spending. `authorization_ref` and `opt_in` are evidence fields for a caller to validate; they are not security controls. Do not use this analyzer as a paid experiment runner.

The fixture contains three synthetic pairs: an economy candidate wins at lower cost, loses a second case after extra model work raises its total cost, and fails deterministic acceptance on a third case. These fixtures validate accounting and classification behavior only; they are not model-quality evidence.
