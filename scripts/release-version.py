#!/usr/bin/env python3
"""Verify or update the Niu release version across VERSION, Cargo.toml, package.json, and compose.yaml."""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
VERSION_FILE = ROOT / "VERSION"
CARGO_TOML = ROOT / "Cargo.toml"
PACKAGE_JSON = ROOT / "package.json"
COMPOSE_YAML = ROOT / "compose.yaml"

SEMVER_PATTERN = re.compile(r"^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$")
CARGO_WS_VERSION_PATTERN = re.compile(
    r"(\[workspace\.package\]\s*\nversion\s*=\s*\")([^\"]+)(\")"
)
COMPOSE_IMAGE_PATTERN = re.compile(
    r"(image:\s*\$\{NIU_IMAGE:-ghcr\.io/niu-io/niu:v)([^}]+)(\})"
)


def parse_version(raw: str) -> str:
    cleaned = raw.strip()
    if cleaned.startswith("v"):
        cleaned = cleaned[1:]
    if not SEMVER_PATTERN.fullmatch(cleaned):
        raise ValueError(f"invalid semantic version: {raw!r} (expected X.Y.Z)")
    return cleaned


def read_versions() -> dict[str, str]:
    version_file = VERSION_FILE.read_text(encoding="utf-8").strip()
    cargo_text = CARGO_TOML.read_text(encoding="utf-8")
    cargo_match = CARGO_WS_VERSION_PATTERN.search(cargo_text)
    if not cargo_match:
        raise RuntimeError("could not find [workspace.package] version in Cargo.toml")
    cargo_version = cargo_match.group(2)

    package_data = json.loads(PACKAGE_JSON.read_text(encoding="utf-8"))
    package_version = str(package_data.get("version", ""))

    compose_text = COMPOSE_YAML.read_text(encoding="utf-8")
    compose_match = COMPOSE_IMAGE_PATTERN.search(compose_text)
    if not compose_match:
        raise RuntimeError("could not find default ghcr.io/niu-io/niu:v<version> image in compose.yaml")
    compose_version = compose_match.group(2)

    return {
        "VERSION": version_file,
        "Cargo.toml": cargo_version,
        "package.json": package_version,
        "compose.yaml": compose_version,
    }


def check_versions(expected_tag: str | None) -> int:
    versions = read_versions()
    canonical = versions["VERSION"]
    parse_version(canonical)

    mismatches = [
        f"{name}={val!r} (expected {canonical!r})"
        for name, val in versions.items()
        if val != canonical
    ]
    if mismatches:
        print("Version mismatch across repository files:\n  " + "\n  ".join(mismatches), file=sys.stderr)
        return 1

    if expected_tag:
        tag_version = parse_version(expected_tag)
        if tag_version != canonical:
            print(
                f"Git tag {expected_tag!r} does not match VERSION {canonical!r}",
                file=sys.stderr,
            )
            return 1

    print(f"Niu version verified: v{canonical}")
    return 0


def set_version(raw_version: str, create_tag: bool) -> int:
    version = parse_version(raw_version)
    VERSION_FILE.write_text(f"{version}\n", encoding="utf-8")

    cargo_text = CARGO_TOML.read_text(encoding="utf-8")
    cargo_updated, count = CARGO_WS_VERSION_PATTERN.subn(rf"\g<1>{version}\g<3>", cargo_text, count=1)
    if count != 1:
        raise RuntimeError("failed to update [workspace.package] version in Cargo.toml")
    CARGO_TOML.write_text(cargo_updated, encoding="utf-8")

    package_data = json.loads(PACKAGE_JSON.read_text(encoding="utf-8"))
    package_data["version"] = version
    PACKAGE_JSON.write_text(json.dumps(package_data, indent=2) + "\n", encoding="utf-8")

    compose_text = COMPOSE_YAML.read_text(encoding="utf-8")
    compose_updated, count = COMPOSE_IMAGE_PATTERN.subn(rf"\g<1>{version}\g<3>", compose_text, count=1)
    if count != 1:
        raise RuntimeError("failed to update default image tag in compose.yaml")
    COMPOSE_YAML.write_text(compose_updated, encoding="utf-8")

    subprocess.run(
        ["cargo", "metadata", "--format-version", "1"],
        cwd=ROOT,
        stdout=subprocess.DEVNULL,
        check=True,
    )

    print(f"Updated VERSION, Cargo.toml, Cargo.lock, package.json, and compose.yaml to v{version}")
    if create_tag:
        tag = f"v{version}"
        subprocess.run(["git", "tag", "-a", tag, "-m", f"Release {tag}"], cwd=ROOT, check=True)
        print(f"Created annotated Git tag {tag}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)

    check_parser = subparsers.add_parser("check", help="verify version consistency")
    check_parser.add_argument("--tag", help="optional Git tag (e.g. v0.2.0) to verify against VERSION")

    set_parser = subparsers.add_parser("set", help="update version across repository files")
    set_parser.add_argument("version", help="new semantic version (e.g. 0.2.0 or v0.2.0)")
    set_parser.add_argument("--tag", action="store_true", help="also create annotated git tag v<version>")

    args = parser.parse_args()
    try:
        if args.command == "check":
            return check_versions(args.tag)
        return set_version(args.version, args.tag)
    except (ValueError, RuntimeError, subprocess.CalledProcessError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
