use std::{path::PathBuf, process::Command};

#[test]
fn compare_command_prints_a_machine_readable_paired_report() {
    let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let fixture = manifest.join("../../contracts/fixtures/paired-experiment.v1.json");
    let output = Command::new(env!("CARGO_BIN_EXE_niu-benchmark"))
        .arg("compare")
        .arg(fixture)
        .output()
        .expect("run niu-benchmark CLI");

    assert!(
        output.status.success(),
        "stderr: {}",
        String::from_utf8_lossy(&output.stderr)
    );
    let report: serde_json::Value = serde_json::from_slice(&output.stdout).unwrap();
    assert_eq!(report["evidence_kind"], "paired_experiment");
    assert_eq!(report["total_cash_nanos"], "630");
    assert_eq!(report["candidates"][0]["qualified_completions"], 3);
    assert_eq!(report["candidates"][1]["qualified_completions"], 2);
    assert_eq!(report["pairs"].as_array().unwrap().len(), 3);
}
