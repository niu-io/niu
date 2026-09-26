use std::{env, process::Command};

fn main() {
    println!("cargo:rerun-if-env-changed=NIU_CORE_GIT_COMMIT");
    println!("cargo:rerun-if-env-changed=NIU_CORE_API_VERSION");
    // HEAD usually contains a branch name and does not change when that branch
    // advances. Watch refs too, including loose refs created after packing and
    // the shared refs directory used by linked worktrees.
    for name in ["HEAD", "refs", "packed-refs"] {
        if let Some(path) = git(&["rev-parse", "--git-path", name])
            && std::path::Path::new(&path).exists()
        {
            println!("cargo:rerun-if-changed={path}");
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
