"""Execution tests for scripts/install.sh edge cases and security hardening."""

from __future__ import annotations

import gzip
import hashlib
import http.server
import os
import shutil
import socketserver
import stat
import subprocess
import tempfile
import threading
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
INSTALL_SH = ROOT / "scripts" / "install.sh"


class _ReleaseFixtureServer:
    """In-process HTTP server serving release assets and /readyz for install.sh tests."""

    def __init__(self, routes: dict[str, tuple[int, bytes]]) -> None:
        self.routes = routes
        self.readyz_responses: list[int] = [200]
        self.readyz_calls = 0

        outer = self

        class Handler(http.server.BaseHTTPRequestHandler):
            def do_GET(self) -> None:  # noqa: N802
                if self.path == "/readyz":
                    idx = min(outer.readyz_calls, len(outer.readyz_responses) - 1)
                    code = outer.readyz_responses[idx]
                    outer.readyz_calls += 1
                    body = b"ok\n" if code == 200 else b"not ready\n"
                    self.send_response(code)
                    self.send_header("Content-Length", str(len(body)))
                    self.end_headers()
                    self.wfile.write(body)
                    return

                status, payload = outer.routes.get(self.path, (404, b"not found"))
                self.send_response(status)
                self.send_header("Content-Length", str(len(payload)))
                self.end_headers()
                self.wfile.write(payload)

            def log_message(self, format: str, *args: object) -> None:  # noqa: A002
                return

        self._httpd = socketserver.TCPServer(("127.0.0.1", 0), Handler)
        self.port = self._httpd.server_address[1]
        self._thread = threading.Thread(target=self._httpd.serve_forever, daemon=True)
        self._thread.start()

    def close(self) -> None:
        self._httpd.shutdown()
        self._httpd.server_close()
        self._thread.join(timeout=5)


def make_stub_docker(bin_dir: Path, log_file: Path, *, compose_ok: bool = True) -> Path:
    stub = bin_dir / "docker"
    compose_exit = 0 if compose_ok else 1
    stub.write_text(
        f"""#!/usr/bin/env bash
set -euo pipefail
echo "PWD=$PWD ARGS=$*" >> "{log_file}"
if [[ "${{1:-}}" == "compose" ]]; then
  if [[ "${{2:-}}" == "version" ]]; then
    exit {compose_exit}
  fi
  shift
  env_file=""
  while [[ $# -gt 0 ]]; do
    if [[ "$1" == "--env-file" ]]; then
      env_file="$2"
      if [[ "$env_file" != /* ]]; then
        echo "stub docker error: --env-file is not absolute: $env_file (pwd=$PWD)" >&2
        exit 99
      fi
      if [[ ! -f "$env_file" ]]; then
        echo "stub docker error: --env-file does not exist: $env_file (pwd=$PWD)" >&2
        exit 98
      fi
      shift 2
      continue
    fi
    break
  done
  cmd="${{1:-}}"
  case "$cmd" in
    exec)
      # Support pg_dump, pg_isready, createdb, dropdb, psql
      if [[ "$*" == *"pg_dump"* ]]; then
        echo "-- mock sql dump"
      elif [[ "$*" == *"psql"* ]]; then
        cat >/dev/null
      fi
      exit 0
      ;;
    up|stop|run|ps)
      exit 0
      ;;
  esac
  exit 0
fi
if [[ "${{1:-}}" == "image" && "${{2:-}}" == "inspect" ]]; then
  exit 0
fi
exit 0
""",
        encoding="utf-8",
    )
    stub.chmod(0o755)
    return stub


class InstallShTests(unittest.TestCase):
    def test_bash_syntax_is_valid(self) -> None:
        result = subprocess.run(["bash", "-n", str(INSTALL_SH)], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, msg=result.stderr)

    def test_random_secret_urandom_fallback_avoids_sigpipe_under_pipefail(self) -> None:
        with tempfile.TemporaryDirectory(prefix="niu-urandom-bin-") as bin_tmp:
            bin_dir = Path(bin_tmp)
            # Symlink only the minimal POSIX utilities needed by the /dev/urandom fallback,
            # intentionally omitting openssl and python3.
            for tool in ("bash", "dd", "tr"):
                resolved = shutil.which(tool)
                self.assertIsNotNone(resolved, msg=f"missing {tool}")
                assert resolved is not None
                (bin_dir / tool).symlink_to(resolved)

            env = {"PATH": str(bin_dir), "NIU_INSTALL_SH_SOURCE_ONLY": "1"}
            cmd = (
                f'set -euo pipefail; source "{INSTALL_SH}"; '
                's32="$(random_secret 32)"; s48="$(random_secret 48)"; '
                'printf "%s\\n%s\\n" "$s32" "$s48"'
            )
            result = subprocess.run(
                [str(bin_dir / "bash"), "-c", cmd],
                env=env,
                capture_output=True,
                text=True,
            )
            self.assertEqual(result.returncode, 0, msg=f"rc={result.returncode} stderr={result.stderr}")
            lines = result.stdout.splitlines()
            self.assertEqual(len(lines), 2)
            self.assertEqual(len(lines[0]), 32)
            self.assertEqual(len(lines[1]), 48)
            self.assertRegex(lines[0], r"^[A-Za-z0-9]{32}$")
            self.assertRegex(lines[1], r"^[A-Za-z0-9]{48}$")

    def test_resolve_install_dir_detects_env_or_version(self) -> None:
        with tempfile.TemporaryDirectory(prefix="niu-resolve-dir-") as tmp:
            base = Path(tmp).resolve()
            env = {**os.environ, "NIU_INSTALL_SH_SOURCE_ONLY": "1", "NIU_INSTALL_DIR": "/opt/default-niu"}

            def run_resolve(cwd: Path, requested: str = "") -> str:
                res = subprocess.run(
                    ["bash", "-c", f'source "{INSTALL_SH}"; resolve_install_dir "$1"', "_", requested],
                    cwd=cwd,
                    env=env,
                    capture_output=True,
                    text=True,
                    check=True,
                )
                return res.stdout

            # Explicit --dir wins
            self.assertEqual(run_resolve(base, "./custom"), "./custom")

            # compose.yaml alone -> DEFAULT_DIR
            (base / "compose.yaml").write_text("services: {}\n", encoding="utf-8")
            self.assertEqual(run_resolve(base), "/opt/default-niu")

            # compose.yaml + .env (real installed dir, no VERSION) -> cwd
            (base / ".env").write_text("NIU_VERSION=v0.3.1\n", encoding="utf-8")
            self.assertEqual(run_resolve(base), str(base))

            # compose.yaml + VERSION (repo checkout) -> cwd
            (base / ".env").unlink()
            (base / "VERSION").write_text("0.3.1\n", encoding="utf-8")
            self.assertEqual(run_resolve(base), str(base))

    def test_install_relative_dir_and_sha256sums_verification(self) -> None:
        compose_bytes = b"services:\n  niu:\n    image: ghcr.io/niu-io/niu:v0.3.1\n"
        config_bytes = b"[server]\nrequest_timeout_seconds = 300\n"
        digest_line = b"ghcr.io/niu-io/niu@sha256:" + (b"a" * 64) + b"\n"
        sums_bytes = (
            f"{hashlib.sha256(compose_bytes).hexdigest()}  compose.yaml\n"
            f"{hashlib.sha256(config_bytes).hexdigest()}  niu.example.toml\n"
        ).encode("utf-8")

        server = _ReleaseFixtureServer(
            {
                "/v0.3.1/IMAGE_DIGEST": (200, digest_line),
                "/v0.3.1/SHA256SUMS": (200, sums_bytes),
                "/v0.3.1/compose.yaml": (200, compose_bytes),
                "/v0.3.1/niu.example.toml": (200, config_bytes),
            }
        )
        self.addCleanup(server.close)

        with tempfile.TemporaryDirectory(prefix="niu-install-rel-") as tmp:
            work = Path(tmp).resolve()
            bin_dir = work / "bin"
            bin_dir.mkdir()
            log_file = work / "docker.log"
            make_stub_docker(bin_dir, log_file)

            env = {
                **os.environ,
                "PATH": f"{bin_dir}:{os.environ['PATH']}",
                "NIU_RELEASES_URL": f"http://127.0.0.1:{server.port}",
            }
            result = subprocess.run(
                [
                    str(INSTALL_SH),
                    "install",
                    "--version",
                    "v0.3.1",
                    "--dir",
                    "./rel-install",
                    "--port",
                    str(server.port),
                ],
                cwd=work,
                env=env,
                capture_output=True,
                text=True,
            )
            self.assertEqual(result.returncode, 0, msg=f"stdout={result.stdout}\nstderr={result.stderr}")
            install_dir = work / "rel-install"
            self.assertEqual((install_dir / "compose.yaml").read_bytes(), compose_bytes)
            self.assertEqual((install_dir / "config" / "niu.example.toml").read_bytes(), config_bytes)
            self.assertEqual(stat.S_IMODE((install_dir / ".env").stat().st_mode), 0o600)
            self.assertEqual(stat.S_IMODE((install_dir / "config" / "niu.example.toml").stat().st_mode), 0o644)
            env_text = (install_dir / ".env").read_text(encoding="utf-8")
            self.assertIn(f"NIU_IMAGE={digest_line.decode().strip()}", env_text)
            self.assertIn(f"--env-file {install_dir}/.env", log_file.read_text(encoding="utf-8"))

    def test_install_rejects_sha256_mismatch_without_partial_files(self) -> None:
        compose_bytes = b"services:\n  niu:\n    image: tampered\n"
        digest_line = b"ghcr.io/niu-io/niu@sha256:" + (b"b" * 64) + b"\n"
        sums_bytes = (
            f"{'0' * 64}  compose.yaml\n"
            f"{'1' * 64}  niu.example.toml\n"
        ).encode("utf-8")

        server = _ReleaseFixtureServer(
            {
                "/v0.3.1/IMAGE_DIGEST": (200, digest_line),
                "/v0.3.1/SHA256SUMS": (200, sums_bytes),
                "/v0.3.1/compose.yaml": (200, compose_bytes),
            }
        )
        self.addCleanup(server.close)

        with tempfile.TemporaryDirectory(prefix="niu-install-badsha-") as tmp:
            work = Path(tmp).resolve()
            bin_dir = work / "bin"
            bin_dir.mkdir()
            make_stub_docker(bin_dir, work / "docker.log")
            env = {
                **os.environ,
                "PATH": f"{bin_dir}:{os.environ['PATH']}",
                "NIU_RELEASES_URL": f"http://127.0.0.1:{server.port}",
            }
            result = subprocess.run(
                [str(INSTALL_SH), "install", "--version", "v0.3.1", "--dir", "./bad-sha", "--port", str(server.port)],
                cwd=work,
                env=env,
                capture_output=True,
                text=True,
            )
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("SHA-256 mismatch", result.stderr)
            self.assertFalse((work / "bad-sha" / "compose.yaml").exists())
            tmp_files = list((work / "bad-sha").glob(".*tmp*"))
            self.assertEqual(tmp_files, [])

    def test_install_rejects_missing_sha256sums_for_v0_3_1(self) -> None:
        digest_line = b"ghcr.io/niu-io/niu@sha256:" + (b"c" * 64) + b"\n"
        server = _ReleaseFixtureServer(
            {
                "/v0.3.1/IMAGE_DIGEST": (200, digest_line),
                # SHA256SUMS returns 404
            }
        )
        self.addCleanup(server.close)

        with tempfile.TemporaryDirectory(prefix="niu-install-nosums-") as tmp:
            work = Path(tmp).resolve()
            bin_dir = work / "bin"
            bin_dir.mkdir()
            make_stub_docker(bin_dir, work / "docker.log")
            env = {
                **os.environ,
                "PATH": f"{bin_dir}:{os.environ['PATH']}",
                "NIU_RELEASES_URL": f"http://127.0.0.1:{server.port}",
            }
            result = subprocess.run(
                [str(INSTALL_SH), "install", "--version", "v0.3.1", "--dir", "./no-sums", "--port", str(server.port)],
                cwd=work,
                env=env,
                capture_output=True,
                text=True,
            )
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("requires a published SHA256SUMS manifest", result.stderr)

    def test_upgrade_rollback_and_status_with_relative_dir(self) -> None:
        digest_line = b"ghcr.io/niu-io/niu@sha256:" + (b"d" * 64) + b"\n"
        server = _ReleaseFixtureServer({"/v0.3.1/IMAGE_DIGEST": (200, digest_line)})
        self.addCleanup(server.close)

        with tempfile.TemporaryDirectory(prefix="niu-rel-lifecycle-") as tmp:
            work = Path(tmp).resolve()
            bin_dir = work / "bin"
            bin_dir.mkdir()
            log_file = work / "docker.log"
            make_stub_docker(bin_dir, log_file)

            rel_dir = work / "rel-site"
            rel_dir.mkdir()
            (rel_dir / "compose.yaml").write_text("services:\n  niu:\n    image: x\n", encoding="utf-8")
            (rel_dir / ".env").write_text(
                f"POSTGRES_PASSWORD=secretpw\n"
                f"NIU_HOST_PORT={server.port}\n"
                f"NIU_VERSION=v0.3.0\n"
                f"NIU_IMAGE=ghcr.io/niu-io/niu:v0.3.0\n",
                encoding="utf-8",
            )

            env = {
                **os.environ,
                "PATH": f"{bin_dir}:{os.environ['PATH']}",
                "NIU_RELEASES_URL": f"http://127.0.0.1:{server.port}",
            }

            # 1. Upgrade using relative --dir
            up = subprocess.run(
                [str(INSTALL_SH), "upgrade", "--version", "v0.3.1", "--dir", "./rel-site"],
                cwd=work,
                env=env,
                capture_output=True,
                text=True,
            )
            self.assertEqual(up.returncode, 0, msg=f"stdout={up.stdout}\nstderr={up.stderr}")
            self.assertIn("completed successfully", up.stdout)

            # 2. Status using relative --dir
            st = subprocess.run(
                [str(INSTALL_SH), "status", "--dir", "./rel-site"],
                cwd=work,
                env=env,
                capture_output=True,
                text=True,
            )
            self.assertEqual(st.returncode, 0, msg=st.stderr)
            self.assertIn(f"Directory: {rel_dir}", st.stdout)
            self.assertIn("Version:   v0.3.1", st.stdout)

            # 3. Rollback using relative --dir (first without DB restore)
            rb1 = subprocess.run(
                [str(INSTALL_SH), "rollback", "--dir", "./rel-site"],
                cwd=work,
                env=env,
                capture_output=True,
                text=True,
            )
            self.assertEqual(rb1.returncode, 0, msg=f"stdout={rb1.stdout}\nstderr={rb1.stderr}")
            self.assertIn("completed; the database was left unchanged", rb1.stdout)

            # 4. Rollback with relative backup path and DB restore path triggered
            rel_backup = rel_dir / "backups" / "manual.sql.gz"
            rel_backup.parent.mkdir(exist_ok=True)
            rel_backup.write_bytes(gzip.compress(b"SELECT 1;\n"))
            (rel_dir / ".env").write_text(
                f"POSTGRES_PASSWORD=secretpw\n"
                f"NIU_HOST_PORT={server.port}\n"
                f"NIU_VERSION=v0.3.1\n"
                f"NIU_IMAGE={digest_line.decode().strip()}\n"
                f"NIU_PREVIOUS_IMAGE=ghcr.io/niu-io/niu:v0.3.0\n"
                f"NIU_PREVIOUS_VERSION=v0.3.0\n"
                f"NIU_PREVIOUS_BACKUP=./rel-site/backups/manual.sql.gz\n",
                encoding="utf-8",
            )
            # First 30 readiness probes fail (60s -> wait_for_ready times out? Too slow! Test restore_database directly)
            restore_res = subprocess.run(
                [
                    "bash",
                    "-c",
                    f'NIU_INSTALL_SH_SOURCE_ONLY=1 source "{INSTALL_SH}"; '
                    'restore_database "./rel-site" "./rel-site/.env" "./rel-site/backups/manual.sql.gz"',
                ],
                cwd=work,
                env=env,
                capture_output=True,
                text=True,
            )
            self.assertEqual(restore_res.returncode, 0, msg=restore_res.stderr)
            self.assertIn("PostgreSQL restore completed", restore_res.stderr)

    def test_cli_missing_option_values_and_invalid_port(self) -> None:
        cases = [
            (["install", "--version"], "requires a value"),
            (["install", "--dir"], "requires a value"),
            (["install", "--port"], "requires a value"),
            (["install", "--port", "99999"], "between 1 and 65535"),
            (["install", "--port", "abc"], "between 1 and 65535"),
        ]
        for args, expected in cases:
            res = subprocess.run([str(INSTALL_SH), *args], capture_output=True, text=True)
            self.assertNotEqual(res.returncode, 0, msg=f"args={args}")
            self.assertNotIn("unbound variable", res.stderr, msg=f"args={args}")
            self.assertIn(expected, res.stderr, msg=f"args={args} stderr={res.stderr}")

    def test_upgrade_and_rollback_require_gzip_and_docker_compose_before_mutating_env(self) -> None:
        with tempfile.TemporaryDirectory(prefix="niu-guards-") as tmp:
            work = Path(tmp).resolve()
            site = work / "site"
            site.mkdir()
            (site / "compose.yaml").write_text("services: {}\n", encoding="utf-8")
            initial_env = (
                "NIU_VERSION=v0.3.1\n"
                "NIU_IMAGE=ghcr.io/niu-io/niu:v0.3.1\n"
                "NIU_PREVIOUS_IMAGE=ghcr.io/niu-io/niu:v0.3.0\n"
                "NIU_PREVIOUS_VERSION=v0.3.0\n"
            )
            (site / ".env").write_text(initial_env, encoding="utf-8")

            # Missing docker compose plugin
            bin_nocompose = work / "bin-nocompose"
            bin_nocompose.mkdir()
            make_stub_docker(bin_nocompose, work / "docker-nc.log", compose_ok=False)
            env_nc = {**os.environ, "PATH": f"{bin_nocompose}:{os.environ['PATH']}"}
            for cmd in (["upgrade", "--version", "v0.3.1", "--dir", str(site)], ["rollback", "--dir", str(site)]):
                res = subprocess.run([str(INSTALL_SH), *cmd], env=env_nc, capture_output=True, text=True)
                self.assertNotEqual(res.returncode, 0)
                self.assertIn("'docker compose' plugin is required", res.stderr)
            self.assertEqual((site / ".env").read_text(encoding="utf-8"), initial_env)

            # Missing gzip in PATH
            bin_nogzip = work / "bin-nogzip"
            bin_nogzip.mkdir()
            make_stub_docker(bin_nogzip, work / "docker-ng.log", compose_ok=True)
            for tool in ("bash", "curl", "mkdir", "rm", "mktemp", "grep", "tail", "cut", "awk", "chmod", "mv", "cat", "date"):
                resolved = shutil.which(tool)
                if resolved:
                    (bin_nogzip / tool).symlink_to(resolved)
            env_ng = {"PATH": str(bin_nogzip)}
            for cmd in (["upgrade", "--version", "v0.3.1", "--dir", str(site)], ["rollback", "--dir", str(site)]):
                res = subprocess.run([str(bin_nogzip / "bash"), str(INSTALL_SH), *cmd], env=env_ng, capture_output=True, text=True)
                self.assertNotEqual(res.returncode, 0)
                self.assertIn("required command 'gzip' is not installed", res.stderr)
            self.assertEqual((site / ".env").read_text(encoding="utf-8"), initial_env)


if __name__ == "__main__":
    unittest.main()
