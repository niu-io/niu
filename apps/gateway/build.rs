use std::{env, process::Command};

fn main() {
    println!("cargo:rerun-if-env-changed=NIU_CORE_GIT_COMMIT");
    println!("cargo:rerun-if-env-changed=NIU_CORE_API_VERSION");
    // Watch version provenance, not unrelated refs (for example tool snapshots).
    for name in ["HEAD", "packed-refs"] {
        if let Some(path) = git(&["rev-parse", "--git-path", name])
            && std::path::Path::new(&path).exists()
        {
            println!("cargo:rerun-if-changed={path}");
        }
    }
    if let Some(reference) = git(&["symbolic-ref", "--quiet", "HEAD"])
        && let Some(path) = git(&["rev-parse", "--git-path", &reference])
    {
        // A packed branch may acquire a new loose ref on its next commit.
        // Watch its nearest existing parent until that exact ref exists.
        let mut watch = std::path::Path::new(&path);
        while !watch.exists() {
            let Some(parent) = watch.parent() else { break };
            watch = parent;
        }
        if watch.exists() {
            println!("cargo:rerun-if-changed={}", watch.display());
        }
    }

    let commit = env::var("NIU_CORE_GIT_COMMIT")
        .ok()
        .or_else(|| git(&["rev-parse", "HEAD"]));

    if let Some(commit) = commit.filter(|commit| {
        commit.len() == 40
            && commit
                .bytes()
                .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    }) {
        println!("cargo:rustc-env=NIU_CORE_GIT_COMMIT={commit}");
    } else {
        println!(
            "cargo:warning=NIU_CORE_GIT_COMMIT is unavailable; Enterprise manifests will be rejected until the build is pinned to a full Git commit"
        );
    }

    let api_version = env::var("NIU_CORE_API_VERSION")
        .unwrap_or_else(|_| env::var("CARGO_PKG_VERSION").expect("Cargo sets the package version"));
    println!("cargo:rustc-env=NIU_CORE_API_VERSION={api_version}");
}

fn git(args: &[&str]) -> Option<String> {
    Command::new("git")
        .args(args)
        .output()
        .ok()
        .filter(|output| output.status.success())
        .and_then(|output| String::from_utf8(output.stdout).ok())
        .map(|value| value.trim().to_owned())
}
