#!/usr/bin/env python3
"""Check pinned upstream import fingerprints and retained MIT attribution."""

import hashlib
import json
import tomllib
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MANIFEST_PATH = ROOT / "vendor/litellm-rust/SOURCE-MANIFEST.json"


def fail(message):
    raise SystemExit(message)


def main():
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    if manifest.get("license") != "MIT":
        fail("LiteLLM import manifest does not declare its MIT license")
    if not manifest.get("source", "").startswith("https://github.com/BerriAI/litellm"):
        fail("LiteLLM import source is not the expected upstream repository")
    if len(manifest.get("commit", "")) != 40:
        fail("LiteLLM import manifest must pin a full source commit")

    vendor_root = ROOT / "vendor/litellm-rust"
    vendor_workspace = tomllib.loads(
        (vendor_root / "Cargo.toml").read_text(encoding="utf-8")
    )
    if vendor_workspace.get("workspace", {}).get("package", {}).get("license") != "MIT":
        fail("LiteLLM imported crates no longer inherit the declared MIT license")
    if "MIT License" not in (vendor_root / "LICENSE").read_text(encoding="utf-8"):
        fail("upstream MIT license text is missing")

    packages = manifest.get("packages", [])
    declared_paths = set()
    for package in packages:
        relative = Path(package["path"])
        if relative.is_absolute() or ".." in relative.parts:
            fail(f"unsafe source manifest path: {relative}")
        directory = ROOT / relative
        if not directory.is_dir() or not (directory / "Cargo.toml").is_file():
            fail(f"missing imported Rust package: {relative}")
        declared_paths.add(directory.resolve())
        crate_manifest = tomllib.loads(
            (directory / "Cargo.toml").read_text(encoding="utf-8")
        )
        if crate_manifest.get("package", {}).get("license") != {"workspace": True}:
            fail(f"{relative} no longer inherits the pinned upstream license")

        files = sorted(path for path in directory.rglob("*") if path.is_file())
        fingerprint = hashlib.sha256()
        for path in files:
            relative_file = path.relative_to(directory).as_posix()
            file_hash = hashlib.sha256(path.read_bytes()).hexdigest()
            fingerprint.update(relative_file.encode("utf-8"))
            fingerprint.update(b"\0")
            fingerprint.update(file_hash.encode("ascii"))
            fingerprint.update(b"\n")
        if len(files) != package["files"]:
            fail(
                f"{package['name']}: expected {package['files']} files, found {len(files)}"
            )
        if fingerprint.hexdigest() != package["sha256"]:
            fail(f"{package['name']}: source fingerprint does not match the pinned manifest")

    actual_paths = {
        path.resolve()
        for path in (vendor_root / "crates").iterdir()
        if path.is_dir() and (path / "Cargo.toml").is_file()
    }
    if actual_paths != declared_paths:
        fail("vendored Rust crate directories do not match the selective import manifest")

    cost_source = ROOT / "crates/cost/src/lib.rs"
    pin_line = (ROOT / "litellm-cost-SOURCE-SHA256.txt").read_text(
        encoding="utf-8"
    ).strip().split()
    if len(pin_line) != 2 or pin_line[1] != "crates/cost/src/lib.rs":
        fail("the standalone cost-engine source pin is malformed")
    if hashlib.sha256(cost_source.read_bytes()).hexdigest() != pin_line[0]:
        fail("the standalone cost-engine source differs from its pinned checksum")

    notices = (ROOT / "THIRD-PARTY-NOTICES.md").read_text(encoding="utf-8")
    if manifest["commit"] not in notices or "SOURCE-MANIFEST.json" not in notices:
        fail("third-party notices do not identify the imported source and manifest")
    print(
        f"Verified {len(packages)} selected LiteLLM crates, their MIT attribution, "
        "and the standalone cost-engine checksum."
    )


if __name__ == "__main__":
    main()
