#!/usr/bin/env python3
"""Verify or update the Niu release version and auto-generate release notes & CHANGELOG entries."""

from __future__ import annotations

import argparse
from datetime import date
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
INSTALL_SH = ROOT / "scripts" / "install.sh"
CHANGELOG_MD = ROOT / "CHANGELOG.md"
REPO_URL = "https://github.com/niu-io/niu"

SEMVER_PATTERN = re.compile(r"^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$")
CARGO_WS_VERSION_PATTERN = re.compile(
    r"(\[workspace\.package\]\s*\nversion\s*=\s*\")([^\"]+)(\")"
)
COMPOSE_IMAGE_PATTERN = re.compile(
    r"(image:\s*\$\{NIU_IMAGE:-ghcr\.io/niu-io/niu:v)([^}]+)(\})"
)
INSTALL_SH_VERSION_PATTERN = re.compile(
    r'^(DEFAULT_VERSION="v)([^"]+)(")', re.MULTILINE
)
CONVENTIONAL_COMMIT_PATTERN = re.compile(
    r"^(?P<type>[a-zA-Z]+)(?:\((?P<scope>[^)]+)\))?(?P<breaking>!)?:\s*(?P<subject>.+)$"
)


def parse_version(raw: str) -> str:
    cleaned = raw.strip()
    if cleaned.startswith("v"):
        cleaned = cleaned[1:]
    if not SEMVER_PATTERN.fullmatch(cleaned):
        raise ValueError(f"invalid semantic version: {raw!r} (expected X.Y.Z)")
    return cleaned


CARGO_LOCK = ROOT / "Cargo.lock"
CARGO_LOCK_NIU_PATTERN = re.compile(
    r'(\[\[package\]\]\s*\nname\s*=\s*"niu-[^"]+"\s*\nversion\s*=\s*")([^"]+)(")'
)
CARGO_LOCK_GATEWAY_PATTERN = re.compile(
    r'\[\[package\]\]\s*\nname\s*=\s*"niu-gateway"\s*\nversion\s*=\s*"([^"]+)"'
)


def read_versions() -> dict[str, str]:
    version_file = VERSION_FILE.read_text(encoding="utf-8").strip()
    cargo_text = CARGO_TOML.read_text(encoding="utf-8")
    cargo_match = CARGO_WS_VERSION_PATTERN.search(cargo_text)
    if not cargo_match:
        raise RuntimeError("could not find [workspace.package] version in Cargo.toml")
    cargo_version = cargo_match.group(2)

    cargo_lock_text = CARGO_LOCK.read_text(encoding="utf-8")
    cargo_lock_match = CARGO_LOCK_GATEWAY_PATTERN.search(cargo_lock_text)
    if not cargo_lock_match:
        raise RuntimeError("could not find niu-gateway package version in Cargo.lock")
    cargo_lock_version = cargo_lock_match.group(1)

    package_data = json.loads(PACKAGE_JSON.read_text(encoding="utf-8"))
    package_version = str(package_data.get("version", ""))

    compose_text = COMPOSE_YAML.read_text(encoding="utf-8")
    compose_match = COMPOSE_IMAGE_PATTERN.search(compose_text)
    if not compose_match:
        raise RuntimeError("could not find default ghcr.io/niu-io/niu:v<version> image in compose.yaml")
    compose_version = compose_match.group(2)

    install_sh_text = INSTALL_SH.read_text(encoding="utf-8")
    install_sh_match = INSTALL_SH_VERSION_PATTERN.search(install_sh_text)
    if not install_sh_match:
        raise RuntimeError('could not find DEFAULT_VERSION="v<version>" in scripts/install.sh')
    install_sh_version = install_sh_match.group(2)

    return {
        "VERSION": version_file,
        "Cargo.toml": cargo_version,
        "Cargo.lock": cargo_lock_version,
        "package.json": package_version,
        "compose.yaml": compose_version,
        "scripts/install.sh": install_sh_version,
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


def list_semver_tags() -> list[str]:
    result = subprocess.run(
        ["git", "tag", "--list", "v*.*.*", "--sort=version:refname"],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=True,
    )
    tags: list[str] = []
    for line in result.stdout.splitlines():
        candidate = line.strip()
        if not candidate:
            continue
        try:
            parse_version(candidate)
            tags.append(candidate)
        except ValueError:
            continue
    return tags


def resolve_previous_tag(target_tag: str) -> str | None:
    tags = list_semver_tags()
    if target_tag in tags:
        idx = tags.index(target_tag)
        return tags[idx - 1] if idx > 0 else None
    return tags[-1] if tags else None


def collect_commits(rev_range: str) -> list[tuple[str, str]]:
    result = subprocess.run(
        ["git", "log", "--no-merges", "--pretty=format:%h%x09%s", rev_range],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=True,
    )
    commits: list[tuple[str, str]] = []
    for line in result.stdout.splitlines():
        if "\t" not in line:
            continue
        sha, subject = line.split("\t", 1)
        commits.append((sha.strip(), subject.strip()))
    return commits


def categorize_commits(commits: list[tuple[str, str]]) -> dict[str, list[tuple[str, str, str | None]]]:
    groups: dict[str, list[tuple[str, str, str | None]]] = {
        "Added": [],
        "Changed": [],
        "Fixed": [],
        "Documentation & Governance": [],
    }
    for sha, subject in commits:
        match = CONVENTIONAL_COMMIT_PATTERN.match(subject)
        if match:
            ctype = match.group("type").lower()
            scope = match.group("scope")
            clean_subject = match.group("subject").strip()
            if ctype in ("feat", "add"):
                groups["Added"].append((sha, clean_subject, scope))
            elif ctype in ("fix", "bugfix", "hotfix", "security"):
                groups["Fixed"].append((sha, clean_subject, scope))
            elif ctype in ("docs", "doc"):
                groups["Documentation & Governance"].append((sha, clean_subject, scope))
            else:
                groups["Changed"].append((sha, clean_subject, scope))
        else:
            lower = subject.lower()
            if lower.startswith(("add ", "introduce ", "implement ", "create ")):
                groups["Added"].append((sha, subject, None))
            elif lower.startswith(("fix ", "resolve ", "repair ")):
                groups["Fixed"].append((sha, subject, None))
            elif lower.startswith(("doc", "readme", "changelog", "contributing")):
                groups["Documentation & Governance"].append((sha, subject, None))
            else:
                groups["Changed"].append((sha, subject, None))
    return groups


def format_categorized_markdown(commits: list[tuple[str, str]], include_sha: bool = True) -> str:
    groups = categorize_commits(commits)
    sections: list[str] = []
    for heading, items in groups.items():
        if not items:
            continue
        lines = [f"### {heading}"]
        for sha, text, scope in items:
            prefix = f"**{scope}**: " if scope else ""
            suffix = f" (`{sha}`)" if include_sha else ""
            lines.append(f"- {prefix}{text}{suffix}")
        sections.append("\n".join(lines))
    return "\n\n".join(sections)


def extract_changelog_section(version: str) -> str | None:
    if not CHANGELOG_MD.exists():
        return None
    text = CHANGELOG_MD.read_text(encoding="utf-8")
    pattern = re.compile(
        rf"^## \[{re.escape(version)}\](?: - [^\n]+)?\n(?P<body>.*?)(?=^## \[|^\[Unreleased\]:|\Z)",
        re.MULTILINE | re.DOTALL,
    )
    match = pattern.search(text)
    if not match:
        return None
    body = match.group("body").strip()
    return body if body else None


def update_changelog_for_version(version: str) -> bool:
    if not CHANGELOG_MD.exists():
        return False
    if extract_changelog_section(version) is not None:
        return False

    text = CHANGELOG_MD.read_text(encoding="utf-8")
    unreleased_pattern = re.compile(
        r"(^## \[Unreleased\]\n)(?P<unreleased>.*?)(?=^## \[)",
        re.MULTILINE | re.DOTALL,
    )
    match = unreleased_pattern.search(text)
    if not match:
        return False

    unreleased_body = match.group("unreleased").strip()
    target_tag = f"v{version}"
    prev_tag = resolve_previous_tag(target_tag)
    if not unreleased_body:
        rev_range = f"{prev_tag}..HEAD" if prev_tag else "HEAD"
        commits = collect_commits(rev_range)
        unreleased_body = format_categorized_markdown(commits, include_sha=False) or "### Changed\n- Maintenance and stability updates."

    today = date.today().isoformat()
    new_section = f"## [Unreleased]\n\n## [{version}] - {today}\n\n{unreleased_body}\n\n"
    updated = text[: match.start()] + new_section + text[match.end() :]

    # Update bottom reference links if present
    unreleased_link_pattern = re.compile(r"^\[Unreleased\]:\s*.+$", re.MULTILINE)
    if unreleased_link_pattern.search(updated):
        new_links = f"[Unreleased]: {REPO_URL}/compare/v{version}...HEAD"
        if prev_tag and f"[{version}]:" not in updated:
            new_links += f"\n[{version}]: {REPO_URL}/compare/{prev_tag}...v{version}"
        updated = unreleased_link_pattern.sub(new_links, updated, count=1)

    CHANGELOG_MD.write_text(updated, encoding="utf-8")
    return True


def build_release_notes(raw_tag: str | None) -> str:
    versions = read_versions()
    version = parse_version(raw_tag) if raw_tag else versions["VERSION"]
    tag = f"v{version}"
    prev_tag = resolve_previous_tag(tag)

    tag_exists = tag in list_semver_tags()
    end_ref = tag if tag_exists else "HEAD"
    rev_range = f"{prev_tag}..{end_ref}" if prev_tag else end_ref
    commits = collect_commits(rev_range)

    changelog_body = extract_changelog_section(version)
    auto_commits_body = format_categorized_markdown(commits, include_sha=True)

    parts: list[str] = []
    if changelog_body:
        parts.append("## Highlights\n\n" + changelog_body)
        if commits:
            commit_lines = [f"- `{sha}` {subj}" for sha, subj in commits]
            parts.append("## Commits in this Release\n\n" + "\n".join(commit_lines))
    elif auto_commits_body:
        parts.append("## What's Changed\n\n" + auto_commits_body)
    else:
        parts.append(f"## Niu {tag}\n\nRelease `{tag}` of the Niu open-source AI model gateway.")

    install_section = f"""## Self-Hosted Installation & Upgrade

### Fresh Installation (Docker Compose)

```sh
curl -fsSL {REPO_URL}/releases/download/{tag}/install.sh -o install.sh
chmod +x install.sh
./install.sh install --version {tag} --dir /opt/niu
```

### Upgrade an Existing Installation

The upgrade command automatically backs up PostgreSQL (`pg_dump`), verifies `NIU_VENDOR_ENCRYPTION_KEY` compatibility (`niu-gateway --check-encryption`), and rolls back on failure:

```sh
./scripts/install.sh upgrade --version {tag} --dir /opt/niu
```"""
    parts.append(install_section)

    if prev_tag:
        parts.append(f"**Full Changelog**: {REPO_URL}/compare/{prev_tag}...{tag}")
    else:
        parts.append(f"**Release Tag**: {REPO_URL}/releases/tag/{tag}")

    return "\n\n---\n\n".join(parts) + "\n"


def set_version(raw_version: str, create_tag: bool, update_changelog: bool) -> int:
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

    install_sh_text = INSTALL_SH.read_text(encoding="utf-8")
    install_sh_updated, count = INSTALL_SH_VERSION_PATTERN.subn(rf"\g<1>{version}\g<3>", install_sh_text, count=1)
    if count != 1:
        raise RuntimeError("failed to update DEFAULT_VERSION in scripts/install.sh")
    INSTALL_SH.write_text(install_sh_updated, encoding="utf-8")

    cargo_lock_text = CARGO_LOCK.read_text(encoding="utf-8")
    cargo_lock_updated, lock_count = CARGO_LOCK_NIU_PATTERN.subn(
        rf"\g<1>{version}\g<3>", cargo_lock_text
    )
    if lock_count == 0:
        raise RuntimeError("failed to update workspace package versions in Cargo.lock")
    CARGO_LOCK.write_text(cargo_lock_updated, encoding="utf-8")

    import shutil
    cargo_bin = (
        shutil.which("cargo")
        or shutil.which("cargo", path=f"/opt/homebrew/bin:{Path.home() / '.cargo' / 'bin'}")
    )
    if cargo_bin:
        subprocess.run(
            [cargo_bin, "metadata", "--format-version", "1"],
            cwd=ROOT,
            stdout=subprocess.DEVNULL,
            check=True,
        )

    if update_changelog and update_changelog_for_version(version):
        print(f"Updated CHANGELOG.md with section [{version}]")

    print(f"Updated VERSION, Cargo.toml, Cargo.lock, package.json, compose.yaml, and scripts/install.sh to v{version}")
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

    set_parser = subparsers.add_parser("set", help="update version across repository files and CHANGELOG.md")
    set_parser.add_argument("version", help="new semantic version (e.g. 0.2.0 or v0.2.0)")
    set_parser.add_argument("--tag", action="store_true", help="also create annotated git tag v<version>")
    set_parser.add_argument(
        "--no-changelog",
        action="store_true",
        help="skip automatic CHANGELOG.md section generation",
    )

    notes_parser = subparsers.add_parser("notes", help="generate Markdown release notes for a version/tag")
    notes_parser.add_argument("--tag", help="version or Git tag (defaults to VERSION)")
    notes_parser.add_argument("--output", type=Path, help="write release notes to file instead of stdout")

    args = parser.parse_args()
    try:
        if args.command == "check":
            return check_versions(args.tag)
        if args.command == "notes":
            notes = build_release_notes(args.tag)
            if args.output:
                args.output.write_text(notes, encoding="utf-8")
                print(f"Wrote release notes to {args.output}")
            else:
                sys.stdout.write(notes)
            return 0
        return set_version(args.version, args.tag, not args.no_changelog)
    except (ValueError, RuntimeError, subprocess.CalledProcessError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
