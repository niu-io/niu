#!/usr/bin/env python3
"""Verify or update the Niu release version and auto-generate release notes & CHANGELOG entries."""

from __future__ import annotations

import argparse
from datetime import date
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
VERSION_FILE = ROOT / "VERSION"
CARGO_TOML = ROOT / "Cargo.toml"
CARGO_LOCK = ROOT / "Cargo.lock"
PACKAGE_JSON = ROOT / "package.json"
SDK_PACKAGE_RELATIVE_PATHS = (
    Path("sdks/javascript/package.json"),
    Path("sdks/mcp/package.json"),
    Path("sdks/agent-connect/package.json"),
)
SDK_PACKAGE_JSONS = tuple(ROOT / rel for rel in SDK_PACKAGE_RELATIVE_PATHS)
MCP_RPC_TS_RELATIVE_PATH = Path("sdks/mcp/src/rpc.ts")
MCP_RPC_TS = ROOT / MCP_RPC_TS_RELATIVE_PATH
COMPOSE_YAML = ROOT / "compose.yaml"
INSTALL_SH = ROOT / "scripts" / "install.sh"
README_MD = ROOT / "README.md"
SECURITY_MD = ROOT / "SECURITY.md"
ARCHITECTURE_MD = ROOT / "ARCHITECTURE.md"
ENV_EXAMPLE = ROOT / ".env.example"
RENDER_YAML = ROOT / "render.yaml"
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
README_IMAGE_PATTERN = re.compile(
    r"(ghcr\.io/niu-io/niu:v)([0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?)"
)
README_FLAG_VERSION_PATTERN = re.compile(
    r"(--version\s+v)([0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?)"
)
MCP_RPC_VERSION_PATTERN = re.compile(
    r'((?:export\s+const\s+MCP_SERVER_VERSION\s*=\s*"|serverInfo:\s*\{\s*name:\s*"niu",\s*version:\s*"))([^"]+)("(?:;|\s*\}))'
)
CONVENTIONAL_COMMIT_PATTERN = re.compile(
    r"^(?P<type>[a-zA-Z]+)(?:\((?P<scope>[^)]+)\))?(?P<breaking>!)?:\s*(?P<subject>.+)$"
)
CARGO_LOCK_NIU_PATTERN = re.compile(
    r'(\[\[package\]\]\s*\nname\s*=\s*"niu-[^"]+"\s*\nversion\s*=\s*")([^"]+)(")'
)
CARGO_LOCK_GATEWAY_PATTERN = re.compile(
    r'\[\[package\]\]\s*\nname\s*=\s*"niu-gateway"\s*\nversion\s*=\s*"([^"]+)"'
)


def parse_version(raw: str) -> str:
    cleaned = raw.strip()
    if cleaned.startswith("v"):
        cleaned = cleaned[1:]
    if not SEMVER_PATTERN.fullmatch(cleaned):
        raise ValueError(f"invalid semantic version: {raw!r} (expected X.Y.Z)")
    return cleaned


def _resolve_path(root: Path, relative: str | Path) -> Path:
    return root / relative


def read_versions(root: Path = ROOT) -> dict[str, str]:
    version_file = _resolve_path(root, "VERSION").read_text(encoding="utf-8").strip()
    cargo_text = _resolve_path(root, "Cargo.toml").read_text(encoding="utf-8")
    cargo_match = CARGO_WS_VERSION_PATTERN.search(cargo_text)
    if not cargo_match:
        raise RuntimeError("could not find [workspace.package] version in Cargo.toml")
    cargo_version = cargo_match.group(2)

    cargo_lock_text = _resolve_path(root, "Cargo.lock").read_text(encoding="utf-8")
    cargo_lock_match = CARGO_LOCK_GATEWAY_PATTERN.search(cargo_lock_text)
    if not cargo_lock_match:
        raise RuntimeError("could not find niu-gateway package version in Cargo.lock")
    cargo_lock_version = cargo_lock_match.group(1)

    package_data = json.loads(_resolve_path(root, "package.json").read_text(encoding="utf-8"))
    package_version = str(package_data.get("version", ""))

    compose_text = _resolve_path(root, "compose.yaml").read_text(encoding="utf-8")
    compose_match = COMPOSE_IMAGE_PATTERN.search(compose_text)
    if not compose_match:
        raise RuntimeError("could not find default ghcr.io/niu-io/niu:v<version> image in compose.yaml")
    compose_version = compose_match.group(2)

    install_sh_text = _resolve_path(root, "scripts/install.sh").read_text(encoding="utf-8")
    install_sh_match = INSTALL_SH_VERSION_PATTERN.search(install_sh_text)
    if not install_sh_match:
        raise RuntimeError('could not find DEFAULT_VERSION="v<version>" in scripts/install.sh')
    install_sh_version = install_sh_match.group(2)
    if "(default: ${DEFAULT_VERSION})" not in install_sh_text:
        raise RuntimeError("scripts/install.sh usage() must interpolate ${DEFAULT_VERSION}")

    readme_text = _resolve_path(root, "README.md").read_text(encoding="utf-8")
    readme_image_match = README_IMAGE_PATTERN.search(readme_text)
    if not readme_image_match:
        raise RuntimeError("could not find ghcr.io/niu-io/niu:v<version> in README.md")
    readme_flag_versions = set(m.group(2) for m in README_FLAG_VERSION_PATTERN.finditer(readme_text))
    if len(readme_flag_versions) != 1:
        raise RuntimeError(f"inconsistent --version tags in README.md: {sorted(readme_flag_versions)}")

    versions = {
        "VERSION": version_file,
        "Cargo.toml": cargo_version,
        "Cargo.lock": cargo_lock_version,
        "package.json": package_version,
        "compose.yaml": compose_version,
        "scripts/install.sh": install_sh_version,
        "README.md(image)": readme_image_match.group(2),
        "README.md(--version)": next(iter(readme_flag_versions)),
    }

    for rel_path in SDK_PACKAGE_RELATIVE_PATHS:
        sdk_pkg_path = _resolve_path(root, rel_path)
        if not sdk_pkg_path.exists():
            raise RuntimeError(f"missing SDK package manifest: {rel_path.as_posix()}")
        sdk_pkg_data = json.loads(sdk_pkg_path.read_text(encoding="utf-8"))
        versions[rel_path.as_posix()] = str(sdk_pkg_data.get("version", ""))

    mcp_rpc_path = _resolve_path(root, MCP_RPC_TS_RELATIVE_PATH)
    if mcp_rpc_path.exists():
        mcp_rpc_text = mcp_rpc_path.read_text(encoding="utf-8")
        mcp_rpc_match = MCP_RPC_VERSION_PATTERN.search(mcp_rpc_text)
        if mcp_rpc_match:
            versions[MCP_RPC_TS_RELATIVE_PATH.as_posix()] = mcp_rpc_match.group(2)

    return versions


def check_operator_docs_consistency(root: Path = ROOT) -> list[str]:
    errors: list[str] = []
    # Check that server/operator config docs use NIU_ADMIN_TOKENS (not singular NIU_ADMIN_TOKEN)
    # except for explicit shell client Bearer examples ($NIU_ADMIN_TOKEN).
    singular_token_re = re.compile(r"(?<!\$)\bNIU_ADMIN_TOKEN\b")
    doc_paths = (
        _resolve_path(root, "README.md"),
        _resolve_path(root, "SECURITY.md"),
        _resolve_path(root, "ARCHITECTURE.md"),
        _resolve_path(root, ".env.example"),
        _resolve_path(root, "compose.yaml"),
        _resolve_path(root, "render.yaml"),
        _resolve_path(root, "scripts/install.sh"),
    )
    for doc_path in doc_paths:
        text = doc_path.read_text(encoding="utf-8")
        for lineno, line in enumerate(text.splitlines(), 1):
            if singular_token_re.search(line):
                errors.append(
                    f"{doc_path.relative_to(root)}:{lineno}: singular NIU_ADMIN_TOKEN found (expected NIU_ADMIN_TOKENS)"
                )

    arch_text = _resolve_path(root, "ARCHITECTURE.md").read_text(encoding="utf-8")
    if "32 connections per process (`NIU_DATABASE_MAX_CONNECTIONS`" not in arch_text:
        errors.append("ARCHITECTURE.md does not document the 32 default for NIU_DATABASE_MAX_CONNECTIONS")
    if "This remains unimplemented" in arch_text or "bootstrap_route_registry" not in arch_text:
        errors.append("ARCHITECTURE.md unified route publication section contradicts implemented bootstrap_route_registry")
    return errors


def check_versions(expected_tag: str | None, root: Path = ROOT) -> int:
    versions = read_versions(root)
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

    if extract_changelog_section(canonical, root=root) is None:
        print(
            f"CHANGELOG.md is missing a non-empty '## [{canonical}]' section.",
            file=sys.stderr,
        )
        return 1

    doc_errors = check_operator_docs_consistency(root)
    if doc_errors:
        print("Operator documentation consistency errors:\n  " + "\n  ".join(doc_errors), file=sys.stderr)
        return 1

    print(f"Niu version, changelog, and operator documentation verified: v{canonical}")
    return 0


def list_semver_tags(root: Path = ROOT) -> list[str]:
    result = subprocess.run(
        ["git", "tag", "--list", "v*.*.*", "--sort=version:refname"],
        cwd=root,
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


def resolve_previous_tag(target_tag: str, root: Path = ROOT) -> str | None:
    tags = list_semver_tags(root)
    if target_tag in tags:
        idx = tags.index(target_tag)
        return tags[idx - 1] if idx > 0 else None
    return tags[-1] if tags else None


def collect_commits(rev_range: str, root: Path = ROOT) -> list[tuple[str, str]]:
    result = subprocess.run(
        ["git", "log", "--no-merges", "--pretty=format:%h%x09%s", rev_range],
        cwd=root,
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


def extract_changelog_section(version: str, root: Path = ROOT) -> str | None:
    changelog_md = _resolve_path(root, "CHANGELOG.md")
    if not changelog_md.exists():
        return None
    text = changelog_md.read_text(encoding="utf-8")
    pattern = re.compile(
        rf"^## \[{re.escape(version)}\](?: - [^\n]+)?\n(?P<body>.*?)(?=^## \[|^\[Unreleased\]:|\Z)",
        re.MULTILINE | re.DOTALL,
    )
    match = pattern.search(text)
    if not match:
        return None
    body = match.group("body").strip()
    return body if body else None


def extract_changelog_date(version: str, root: Path = ROOT) -> str | None:
    changelog_md = _resolve_path(root, "CHANGELOG.md")
    if not changelog_md.exists():
        return None
    text = changelog_md.read_text(encoding="utf-8")
    pattern = re.compile(
        rf"^## \[{re.escape(version)}\] - (?P<date>\d{{4}}-\d{{2}}-\d{{2}})\s*$",
        re.MULTILINE,
    )
    match = pattern.search(text)
    if not match:
        return None
    return match.group("date")


def update_changelog_for_version(version: str, root: Path = ROOT) -> bool:
    changelog_md = _resolve_path(root, "CHANGELOG.md")
    if not changelog_md.exists():
        return False
    if extract_changelog_section(version, root=root) is not None:
        return False

    text = changelog_md.read_text(encoding="utf-8")
    unreleased_pattern = re.compile(
        r"(^## \[Unreleased\]\n)(?P<unreleased>.*?)(?=^## \[)",
        re.MULTILINE | re.DOTALL,
    )
    match = unreleased_pattern.search(text)
    if not match:
        return False

    unreleased_body = match.group("unreleased").strip()
    target_tag = f"v{version}"
    prev_tag = resolve_previous_tag(target_tag, root=root)
    if not unreleased_body:
        rev_range = f"{prev_tag}..HEAD" if prev_tag else "HEAD"
        commits = collect_commits(rev_range, root=root)
        unreleased_body = (
            format_categorized_markdown(commits, include_sha=False)
            or "### Changed\n- Maintenance and stability updates."
        )

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

    changelog_md.write_text(updated, encoding="utf-8")
    return True


def build_release_notes(raw_tag: str | None, root: Path = ROOT) -> str:
    versions = read_versions(root)
    version = parse_version(raw_tag) if raw_tag else versions["VERSION"]
    tag = f"v{version}"
    prev_tag = resolve_previous_tag(tag, root=root)

    tag_exists = tag in list_semver_tags(root)
    end_ref = tag if tag_exists else "HEAD"
    rev_range = f"{prev_tag}..{end_ref}" if prev_tag else end_ref
    commits = collect_commits(rev_range, root=root)

    changelog_body = extract_changelog_section(version, root=root)
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
curl -fsSL {REPO_URL}/releases/download/{tag}/install.sh -o install.sh
chmod +x install.sh
./install.sh upgrade --version {tag} --dir /opt/niu
```"""
    parts.append(install_section)

    if prev_tag:
        parts.append(f"**Full Changelog**: {REPO_URL}/compare/{prev_tag}...{tag}")
    else:
        parts.append(f"**Release Tag**: {REPO_URL}/releases/tag/{tag}")

    return "\n\n---\n\n".join(parts) + "\n"


def _update_json_package_version(path: Path, version: str) -> None:
    package_data = json.loads(path.read_text(encoding="utf-8"))
    package_data["version"] = version
    path.write_text(json.dumps(package_data, indent=2) + "\n", encoding="utf-8")


def set_version(raw_version: str, create_tag: bool, update_changelog: bool, root: Path = ROOT) -> int:
    version = parse_version(raw_version)
    _resolve_path(root, "VERSION").write_text(f"{version}\n", encoding="utf-8")

    cargo_toml = _resolve_path(root, "Cargo.toml")
    cargo_text = cargo_toml.read_text(encoding="utf-8")
    cargo_updated, count = CARGO_WS_VERSION_PATTERN.subn(rf"\g<1>{version}\g<3>", cargo_text, count=1)
    if count != 1:
        raise RuntimeError("failed to update [workspace.package] version in Cargo.toml")
    cargo_toml.write_text(cargo_updated, encoding="utf-8")

    _update_json_package_version(_resolve_path(root, "package.json"), version)
    for rel_path in SDK_PACKAGE_RELATIVE_PATHS:
        sdk_pkg_path = _resolve_path(root, rel_path)
        if not sdk_pkg_path.exists():
            raise RuntimeError(f"missing SDK package manifest: {rel_path.as_posix()}")
        _update_json_package_version(sdk_pkg_path, version)

    mcp_rpc_path = _resolve_path(root, MCP_RPC_TS_RELATIVE_PATH)
    if mcp_rpc_path.exists():
        mcp_rpc_text = mcp_rpc_path.read_text(encoding="utf-8")
        mcp_rpc_updated, rpc_count = MCP_RPC_VERSION_PATTERN.subn(
            rf"\g<1>{version}\g<3>", mcp_rpc_text, count=1
        )
        if rpc_count == 1:
            mcp_rpc_path.write_text(mcp_rpc_updated, encoding="utf-8")

    compose_yaml = _resolve_path(root, "compose.yaml")
    compose_text = compose_yaml.read_text(encoding="utf-8")
    compose_updated, count = COMPOSE_IMAGE_PATTERN.subn(rf"\g<1>{version}\g<3>", compose_text, count=1)
    if count != 1:
        raise RuntimeError("failed to update default image tag in compose.yaml")
    compose_yaml.write_text(compose_updated, encoding="utf-8")

    install_sh = _resolve_path(root, "scripts/install.sh")
    install_sh_text = install_sh.read_text(encoding="utf-8")
    install_sh_updated, count = INSTALL_SH_VERSION_PATTERN.subn(rf"\g<1>{version}\g<3>", install_sh_text, count=1)
    if count != 1:
        raise RuntimeError("failed to update DEFAULT_VERSION in scripts/install.sh")
    install_sh.write_text(install_sh_updated, encoding="utf-8")

    readme_md = _resolve_path(root, "README.md")
    readme_text = readme_md.read_text(encoding="utf-8")
    readme_updated, img_count = README_IMAGE_PATTERN.subn(rf"\g<1>{version}", readme_text)
    readme_updated, flag_count = README_FLAG_VERSION_PATTERN.subn(rf"\g<1>{version}", readme_updated)
    if img_count == 0 or flag_count == 0:
        raise RuntimeError("failed to update version references in README.md")
    readme_md.write_text(readme_updated, encoding="utf-8")

    cargo_lock = _resolve_path(root, "Cargo.lock")
    cargo_lock_text = cargo_lock.read_text(encoding="utf-8")
    cargo_lock_updated, lock_count = CARGO_LOCK_NIU_PATTERN.subn(
        rf"\g<1>{version}\g<3>", cargo_lock_text
    )
    if lock_count == 0:
        raise RuntimeError("failed to update workspace package versions in Cargo.lock")
    cargo_lock.write_text(cargo_lock_updated, encoding="utf-8")

    cargo_bin = (
        shutil.which("cargo")
        or shutil.which("cargo", path=f"/opt/homebrew/bin:{Path.home() / '.cargo' / 'bin'}")
    )
    if cargo_bin and (root / "crates").is_dir():
        subprocess.run(
            [cargo_bin, "metadata", "--format-version", "1"],
            cwd=root,
            stdout=subprocess.DEVNULL,
            check=True,
        )

    if update_changelog and update_changelog_for_version(version, root=root):
        print(f"Updated CHANGELOG.md with section [{version}]")

    print(
        "Updated VERSION, Cargo.toml, Cargo.lock, package.json, "
        "sdks/{javascript,mcp,agent-connect}/package.json, compose.yaml, "
        f"README.md, and scripts/install.sh to v{version}"
    )
    if create_tag:
        tag = f"v{version}"
        subprocess.run(["git", "tag", "-a", tag, "-m", f"Release {tag}"], cwd=root, check=True)
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

    date_parser = subparsers.add_parser("date", help="print the YYYY-MM-DD release date from CHANGELOG.md")
    date_parser.add_argument("--tag", help="version or Git tag (defaults to VERSION)")

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
        if args.command == "date":
            version = parse_version(args.tag) if args.tag else VERSION_FILE.read_text(encoding="utf-8").strip()
            release_date = extract_changelog_date(version)
            if not release_date:
                print(
                    f"error: CHANGELOG.md has no dated '## [{version}] - YYYY-MM-DD' heading",
                    file=sys.stderr,
                )
                return 1
            print(release_date)
            return 0
        return set_version(args.version, args.tag, not args.no_changelog)
    except (ValueError, RuntimeError, subprocess.CalledProcessError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
