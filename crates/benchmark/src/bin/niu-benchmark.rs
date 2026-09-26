use std::{env, fs, io};

use niu_benchmark::PairedExperiment;

fn main() {
    if let Err(error) = run() {
        eprintln!("niu-benchmark: {error}");
        std::process::exit(2);
    }
}

fn run() -> Result<(), Box<dyn std::error::Error>> {
    let mut args = env::args().skip(1);
    match (args.next().as_deref(), args.next()) {
        (Some("compare"), Some(path)) if args.next().is_none() => {
            let bytes = fs::read(path)?;
            if bytes.len() > 64 * 1024 * 1024 {
                return Err(
                    io::Error::new(io::ErrorKind::InvalidData, "input exceeds 64 MiB").into(),
                );
            }
            let experiment: PairedExperiment = serde_json::from_slice(&bytes)?;
            let report = experiment.evaluate()?;
            println!("{}", serde_json::to_string_pretty(&report)?);
            Ok(())
        }
        _ => Err("usage: niu-benchmark compare <paired-experiment.v1.json>".into()),
    }
}
