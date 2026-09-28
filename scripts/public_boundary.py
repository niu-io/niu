"""Small, dependency-free checks for public source and release artifacts."""

from __future__ import annotations

import re
import subprocess
from hashlib import sha256
from pathlib import Path


CONTENT_RULES = (
    (
        "private Enterprise issue link",
        re.compile(r"github\.com/niu-io/enterprise/(?:issues|pull)/\d+", re.IGNORECASE),
    ),
    (
        "local Niu source path",
        re.compile(r"/Users/[A-Za-z0-9._-]+/Niu/(?:enterprise|niu|litellm)(?:/|\b)"),
    ),
    (
        "OpenAI-style API credential",
        re.compile(r"\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}\b"),
    ),
    (
        "GitHub access token",
        re.compile(r"\bgh[pousr]_[A-Za-z0-9]{30,}\b"),
    ),
    (
        "AWS access key identifier",
        re.compile(r"\bAKIA[0-9A-Z]{16}\b"),
    ),
    (
        "private key material",
        re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
    ),
    (
        "AWS secret access key assignment",
        re.compile(
            r"(?im)aws_secret_access_key\s*[:=]\s*[A-Za-z0-9/+=]{40}\b"
        ),
    ),
)

REQUIRED_DOCKER_IGNORES = {
    ".git",
    ".env",
    ".env.*",
    "node_modules",
    "target",
    "enterprise",
    "internal",
}

# These exact pinned upstream files contain intentionally fake credentials in
# redaction tests. A content change removes the exception automatically; the
# selective-import CI check also verifies their upstream fingerprints.
SAFE_FIXTURE_DIGESTS = {
    "vendor/litellm-rust/crates/secrets-hashicorp/tests/secret_manager/support.rs": (
        "4d90adb3f92ee0f5225d493cb7a7a45d910c2abcb0dba5cd5501fbc105cf46d4"
    ),
    "vendor/litellm-rust/crates/tracing/src/redaction.rs": (
        "c179e167e6ca442505dba898a05043c927a3a4aa3047ba8f2f995ca6a7970cf2"
    ),
}

SKIP_DIRECTORY_NAMES = {".git", "node_modules", "target", "__pycache__"}


def tracked_tree_files(root: Path) -> list[Path]:
    """Return tracked plus non-ignored working-tree files without reading Git history."""
    result = subprocess.run(
        [
            "git",
            "ls-files",
            "--cached",
            "--others",
            "--exclude-standard",
            "-z",
        ],
        cwd=root,
        check=True,
        stdout=subprocess.PIPE,
    )
    files = []
    for raw_path in result.stdout.split(b"\0"):
        if not raw_path:
            continue
        path = root / raw_path.decode("utf-8", errors="surrogateescape")
        if path.is_file() and not path.is_symlink():
            files.append(path)
    return files


def explicit_path_files(paths: list[Path]) -> list[Path]:
    files: list[Path] = []
    for path in paths:
        if path.is_file() and not path.is_symlink():
            files.append(path)
            continue
        if not path.is_dir():
            raise ValueError(f"scan path does not exist: {path}")
        for candidate in path.rglob("*"):
            if any(part in SKIP_DIRECTORY_NAMES for part in candidate.parts):
                continue
            if candidate.is_file() and not candidate.is_symlink():
                files.append(candidate)
    return files


def scan_files(files: list[Path], root: Path | None = None) -> list[tuple[str, Path]]:
    findings: list[tuple[str, Path]] = []
    seen: set[Path] = set()
    for path in files:
        resolved = path.resolve()
        if resolved in seen:
            continue
        seen.add(resolved)
        raw = path.read_bytes()
        if root is not None:
            try:
                relative = path.resolve().relative_to(root.resolve()).as_posix()
            except ValueError:
                relative = ""
            if SAFE_FIXTURE_DIGESTS.get(relative) == sha256(raw).hexdigest():
                continue
        content = raw.decode("latin-1")
        for label, pattern in CONTENT_RULES:
            if pattern.search(content):
                findings.append((label, path))
    return findings


def build_input_errors(root: Path) -> list[str]:
    errors: list[str] = []
    ignore_path = root / ".dockerignore"
    dockerfile_path = root / "Dockerfile"
    if not ignore_path.is_file():
        return ["missing .dockerignore"]
    if not dockerfile_path.is_file():
        return ["missing Dockerfile"]

    ignore_entries = {
        line.strip()
        for line in ignore_path.read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    }
    missing = sorted(REQUIRED_DOCKER_IGNORES - ignore_entries)
    if missing:
        errors.append(".dockerignore is missing required exclusions: " + ", ".join(missing))

    for line_number, line in enumerate(
        dockerfile_path.read_text(encoding="utf-8").splitlines(), start=1
    ):
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        instruction, _, arguments = stripped.partition(" ")
        if instruction.upper() != "COPY":
            continue
        parts = arguments.split()
        if any(part.startswith("--from=") for part in parts):
            continue
        local_parts = [part for part in parts if not part.startswith("--")]
        if len(local_parts) < 2:
            errors.append(f"Dockerfile:{line_number} has an incomplete COPY instruction")
            continue
        sources = local_parts[:-1]
        if any(source in {".", "./", "..", "../"} for source in sources):
            errors.append(
                f"Dockerfile:{line_number} copies the whole build context; use explicit inputs"
            )
        if any("*" in source or "?" in source for source in sources):
            errors.append(
                f"Dockerfile:{line_number} uses a wildcard build input; use explicit inputs"
            )
        if any(source.startswith("../") or source.startswith("/") for source in sources):
            errors.append(f"Dockerfile:{line_number} copies from outside the build context")

    return errors
