use std::{
    env,
    fs::File,
    io::{self, Read},
};

use niu_benchmark::PairedExperiment;

const MAX_INPUT_BYTES: u64 = 64 * 1024 * 1024;

fn main() {
    if let Err(error) = run() {
        eprintln!("niu-benchmark: {error}");
        std::process::exit(2);
    }
}

fn read_capped(path: &str) -> io::Result<Vec<u8>> {
    let file = File::open(path)?;
    if let Ok(meta) = file.metadata()
        && meta.len() > MAX_INPUT_BYTES
    {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "input exceeds 64 MiB",
        ));
    }
    let mut bytes = Vec::new();
    file.take(MAX_INPUT_BYTES + 1).read_to_end(&mut bytes)?;
    if bytes.len() as u64 > MAX_INPUT_BYTES {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "input exceeds 64 MiB",
        ));
    }
    Ok(bytes)
}

fn run() -> Result<(), Box<dyn std::error::Error>> {
    let mut args = env::args().skip(1);
    match (args.next().as_deref(), args.next()) {
        (Some("compare"), Some(path)) if args.next().is_none() => {
            let bytes = read_capped(&path)?;
            let experiment: PairedExperiment = serde_json::from_slice(&bytes)?;
            let report = experiment.evaluate()?;
            println!("{}", serde_json::to_string_pretty(&report)?);
            Ok(())
        }
        _ => Err("usage: niu-benchmark compare <paired-experiment.v1.json>".into()),
    }
}
