"""Unit tests for scripts/release-version.py and workflow release invariants."""

from __future__ import annotations

import importlib.util
import io
import json
import re
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCRIPT_PATH = ROOT / "scripts" / "release-version.py"


def load_release_version_module():
    spec = importlib.util.spec_from_file_location("release_version", SCRIPT_PATH)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def create_fixture_repo(
    root: Path,
    version: str = "0.3.1",
    *,
    sdk_version: str | None = None,
    mcp_rpc_dynamic: bool = False,
    changelog_body: str | None = "### Fixed\n- Curated release entry.",
    changelog_date: str = "2026-11-20",
) -> None:
    sdk_ver = sdk_version if sdk_version is not None else version
    (root / "VERSION").write_text(f"{version}\n", encoding="utf-8")
    (root / "Cargo.toml").write_text(
        f'[workspace.package]\nversion = "{version}"\n',
        encoding="utf-8",
    )
    (root / "Cargo.lock").write_text(
        f'[[package]]\nname = "niu-gateway"\nversion = "{version}"\n'
        f'\n[[package]]\nname = "niu-storage"\nversion = "{version}"\n',
        encoding="utf-8",
    )
    (root / "package.json").write_text(
        json.dumps({"name": "@niu-io/workspace", "version": version}, indent=2) + "\n",
        encoding="utf-8",
    )
    for rel, pkg_name in (
        ("sdks/javascript/package.json", "@niu-io/sdk"),
        ("sdks/mcp/package.json", "@niu-io/mcp"),
        ("sdks/agent-connect/package.json", "@niu-io/agent-connect"),
    ):
        path = root / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(
            json.dumps({"name": pkg_name, "version": sdk_ver}, indent=2) + "\n",
            encoding="utf-8",
        )
    rpc_path = root / "sdks/mcp/src/rpc.ts"
    rpc_path.parent.mkdir(parents=True, exist_ok=True)
    if mcp_rpc_dynamic:
        rpc_path.write_text(
            'export const info = { serverInfo: { name: "niu", version: PACKAGE_VERSION } };\n',
            encoding="utf-8",
        )
    else:
        rpc_path.write_text(
            f'export const info = {{ serverInfo: {{ name: "niu", version: "{sdk_ver}" }} }};\n',
            encoding="utf-8",
        )
    (root / "compose.yaml").write_text(
        "services:\n"
        "  niu:\n"
        f"    image: ${{NIU_IMAGE:-ghcr.io/niu-io/niu:v{version}}}\n"
        "    environment:\n"
        "      NIU_ADMIN_TOKENS: ${NIU_ADMIN_TOKENS:?set}\n",
        encoding="utf-8",
    )
    scripts_dir = root / "scripts"
    scripts_dir.mkdir(parents=True, exist_ok=True)
    (scripts_dir / "install.sh").write_text(
        f'#!/usr/bin/env bash\nDEFAULT_VERSION="v{version}"\n# (default: ${{DEFAULT_VERSION}})\n'
        "NIU_ADMIN_TOKENS=x\n",
        encoding="utf-8",
    )
    (root / "README.md").write_text(
        f"docker pull ghcr.io/niu-io/niu:v{version}\n"
        f"./install.sh install --version v{version}\n"
        "NIU_ADMIN_TOKENS=token\n",
        encoding="utf-8",
    )
    (root / "SECURITY.md").write_text("NIU_ADMIN_TOKENS\n", encoding="utf-8")
    (root / "ARCHITECTURE.md").write_text(
        "32 connections per process (`NIU_DATABASE_MAX_CONNECTIONS`)\n"
        "bootstrap_route_registry\n"
        "NIU_ADMIN_TOKENS\n",
        encoding="utf-8",
    )
    (root / ".env.example").write_text("NIU_ADMIN_TOKENS=replace\n", encoding="utf-8")
    (root / "render.yaml").write_text("NIU_ADMIN_TOKENS\n", encoding="utf-8")

    changelog_lines = ["# Changelog", "", "## [Unreleased]", ""]
    if changelog_body is not None:
        changelog_lines.append(f"## [{version}] - {changelog_date}")
        if changelog_body:
            changelog_lines.extend(["", changelog_body])
        changelog_lines.append("")
    changelog_lines.extend(
        [
            "## [0.3.0] - 2026-11-02",
            "",
            "### Added",
            "- Previous release.",
            "",
            f"[Unreleased]: https://github.com/niu-io/niu/compare/v{version}...HEAD",
            "[0.3.0]: https://github.com/niu-io/niu/compare/v0.2.31...v0.3.0",
            "",
        ]
    )
    (root / "CHANGELOG.md").write_text("\n".join(changelog_lines), encoding="utf-8")


class ReleaseVersionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.rv = load_release_version_module()

    def test_check_passes_when_versions_sdks_and_changelog_match(self) -> None:
        with tempfile.TemporaryDirectory(prefix="niu-rv-ok-") as tmp:
            repo = Path(tmp)
            create_fixture_repo(repo, "0.3.1")
            out, err = io.StringIO(), io.StringIO()
            with redirect_stdout(out), redirect_stderr(err):
                code = self.rv.check_versions("v0.3.1", root=repo)
            self.assertEqual(code, 0, msg=err.getvalue())
            self.assertIn("v0.3.1", out.getvalue())

    def test_check_fails_when_changelog_section_is_missing(self) -> None:
        with tempfile.TemporaryDirectory(prefix="niu-rv-nochangelog-") as tmp:
            repo = Path(tmp)
            create_fixture_repo(repo, "0.3.1", changelog_body=None)
            for tag in ("v0.3.1", None):
                err = io.StringIO()
                with redirect_stderr(err):
                    code = self.rv.check_versions(tag, root=repo)
                self.assertEqual(code, 1)
                self.assertIn("CHANGELOG.md is missing", err.getvalue())

    def test_check_fails_when_changelog_section_is_empty(self) -> None:
        with tempfile.TemporaryDirectory(prefix="niu-rv-emptychangelog-") as tmp:
            repo = Path(tmp)
            create_fixture_repo(repo, "0.3.1", changelog_body="")
            err = io.StringIO()
            with redirect_stderr(err):
                code = self.rv.check_versions("v0.3.1", root=repo)
            self.assertEqual(code, 1)
            self.assertIn("CHANGELOG.md is missing", err.getvalue())

    def test_check_fails_when_sdk_or_mcp_versions_mismatch(self) -> None:
        with tempfile.TemporaryDirectory(prefix="niu-rv-sdkmismatch-") as tmp:
            repo = Path(tmp)
            create_fixture_repo(repo, "0.3.1", sdk_version="0.1.0")
            err = io.StringIO()
            with redirect_stderr(err):
                code = self.rv.check_versions("v0.3.1", root=repo)
            self.assertEqual(code, 1)
            stderr_text = err.getvalue()
            self.assertIn("sdks/javascript/package.json='0.1.0'", stderr_text)
            self.assertIn("sdks/mcp/package.json='0.1.0'", stderr_text)
            self.assertIn("sdks/agent-connect/package.json='0.1.0'", stderr_text)
            self.assertIn("sdks/mcp/src/rpc.ts='0.1.0'", stderr_text)

    def test_check_allows_dynamic_mcp_rpc_version(self) -> None:
        with tempfile.TemporaryDirectory(prefix="niu-rv-dynamicrpc-") as tmp:
            repo = Path(tmp)
            create_fixture_repo(repo, "0.3.1", mcp_rpc_dynamic=True)
            out, err = io.StringIO(), io.StringIO()
            with redirect_stdout(out), redirect_stderr(err):
                code = self.rv.check_versions("v0.3.1", root=repo)
            self.assertEqual(code, 0, msg=err.getvalue())

    def test_set_version_updates_sdk_and_mcp_manifests_and_rpc(self) -> None:
        with tempfile.TemporaryDirectory(prefix="niu-rv-set-") as tmp:
            repo = Path(tmp)
            create_fixture_repo(repo, "0.3.1", sdk_version="0.1.0")
            out = io.StringIO()
            with redirect_stdout(out):
                code = self.rv.set_version("0.3.2", create_tag=False, update_changelog=False, root=repo)
            self.assertEqual(code, 0)
            for rel in (
                "package.json",
                "sdks/javascript/package.json",
                "sdks/mcp/package.json",
                "sdks/agent-connect/package.json",
            ):
                data = json.loads((repo / rel).read_text(encoding="utf-8"))
                self.assertEqual(data["version"], "0.3.2", msg=rel)
            self.assertIn('version: "0.3.2"', (repo / "sdks/mcp/src/rpc.ts").read_text(encoding="utf-8"))

            # Still fails check until 0.3.2 changelog entry exists
            err = io.StringIO()
            with redirect_stderr(err):
                self.assertEqual(self.rv.check_versions("v0.3.2", root=repo), 1)
            self.assertIn("CHANGELOG.md is missing", err.getvalue())

            # Adding 0.3.2 changelog section makes check pass
            changelog = (repo / "CHANGELOG.md").read_text(encoding="utf-8")
            changelog = changelog.replace(
                "## [Unreleased]\n",
                "## [Unreleased]\n\n## [0.3.2] - 2026-11-21\n\n### Fixed\n- Patch fix.\n",
                1,
            )
            (repo / "CHANGELOG.md").write_text(changelog, encoding="utf-8")
            with redirect_stdout(io.StringIO()):
                self.assertEqual(self.rv.check_versions("v0.3.2", root=repo), 0)

    def test_real_repo_changelog_has_curated_0_3_1_entry_and_date(self) -> None:
        section = self.rv.extract_changelog_section("0.3.1", root=ROOT)
        self.assertIsNotNone(section)
        assert section is not None
        self.assertIn("### Added", section)
        self.assertIn("### Fixed", section)
        release_date = self.rv.extract_changelog_date("0.3.1", root=ROOT)
        self.assertIsNotNone(release_date)
        assert release_date is not None
        self.assertRegex(release_date, r"^\d{4}-\d{2}-\d{2}$")

    def test_workflows_pin_actions_and_gate_release_correctly(self) -> None:
        workflows_dir = ROOT / ".github" / "workflows"
        uses_re = re.compile(r"^\s*-?\s*uses:\s*([^\s#]+)")
        sha_pin_re = re.compile(r"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+(?:/[A-Za-z0-9_.-]+)*@[0-9a-f]{40}$")

        for wf in sorted(workflows_dir.glob("*.yml")):
            text = wf.read_text(encoding="utf-8")
            for lineno, line in enumerate(text.splitlines(), 1):
                match = uses_re.match(line)
                if not match:
                    continue
                target = match.group(1)
                if target.startswith("./"):
                    continue
                self.assertRegex(
                    target,
                    sha_pin_re,
                    msg=f"{wf.name}:{lineno} uses unpinned action {target!r}",
                )

        for name in ("ci.yml", "backend.yml", "contracts.yml", "docs.yml", "sdk.yml", "publish-collector.yml"):
            text = (workflows_dir / name).read_text(encoding="utf-8")
            self.assertIn("release/*", text, msg=f"{name} must trigger on release/* branches")

        release_text = (workflows_dir / "release.yml").read_text(encoding="utf-8")
        boundary_pos = release_text.index("check-public-boundary.py")
        imports_pos = release_text.index("verify-imports.py")
        migration_pos = release_text.index("check-migration-history.py")
        sdk_pack_pos = release_text.index("pnpm --dir \"$package\" pack")
        agent_pkg_pos = release_text.index("build-agent-marketplace.py")
        docker_push_pos = release_text.index("docker/build-push-action@")
        for label, pos in (
            ("check-public-boundary", boundary_pos),
            ("verify-imports", imports_pos),
            ("check-migration-history", migration_pos),
            ("sdk pack", sdk_pack_pos),
            ("agent plugin build", agent_pkg_pos),
        ):
            self.assertLess(pos, docker_push_pos, msg=f"{label} must run before docker/build-push-action")
        self.assertIn("VITE_NIU_RELEASE_DATE=", release_text)


if __name__ == "__main__":
    unittest.main()
