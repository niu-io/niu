#!/usr/bin/env python3
"""Run PostgreSQL-backed release tests in a disposable local cluster.

Requires cargo, initdb and pg_ctl on PATH. Existing development databases and
runtime credentials are never loaded. This verifies controlled fixtures, not
live Supplier entitlement or production/container deployment.
"""
import argparse
import os
import re
from pathlib import Path
import secrets
import shlex
import shutil
import socket
import subprocess
import tempfile
from urllib.parse import quote


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('test_filter', help='Cargo test name or substring')
    parser.add_argument('--package', choices=['niu-gateway', 'niu-storage'], default='niu-gateway')
    parser.add_argument('--test', help='Optional Cargo integration-test target')
    args = parser.parse_args()
    for executable in ('cargo', 'initdb', 'pg_ctl'):
        if shutil.which(executable) is None:
            parser.error(f'{executable} must be installed and available on PATH')
    repo = Path(__file__).resolve().parents[1]
    # Deliberately exclude DATABASE_URL, NIU_* and supplier/payment credentials.
    environment = {name: os.environ[name] for name in ('PATH', 'HOME', 'TMPDIR', 'LANG', 'LC_ALL') if name in os.environ}
    environment['CARGO_INCREMENTAL'] = '0'
    command = ['cargo', 'test', '-p', args.package]
    if args.test:
        command += ['--test', args.test]
    command += [args.test_filter, '--', '--ignored']
    with tempfile.TemporaryDirectory(prefix='niu-postgres-tests-') as directory:
        root = Path(directory)
        root.chmod(0o700)
        with socket.socket() as listener:
            listener.bind(('127.0.0.1', 0))
            port = listener.getsockname()[1]
        password = secrets.token_urlsafe(32)
        password_file = root / 'password'
        password_file.write_text(password)
        password_file.chmod(0o600)
        environment['DATABASE_URL'] = f'postgres://postgres:{quote(password, safe="")}@127.0.0.1:{port}/postgres'
        environment['NIU_IMAGE_STORAGE_TEST_KEY'] = secrets.token_urlsafe(32)
        # Keep discovery and execution build environments identical. Discovery
        # still precedes initdb, so an empty filter creates no database.
        listing = subprocess.run(command + ['--list'], cwd=repo, env=environment,
                                 text=True, stdout=subprocess.PIPE, check=True)
        if not any(line.endswith(': test') for line in listing.stdout.splitlines()):
            parser.error('No ignored tests match the requested filter')
        cluster = root / 'postgres'
        subprocess.run(['initdb', '-D', str(cluster), '-U', 'postgres', '--auth=scram-sha-256', '--pwfile', str(password_file)],
                       env=environment, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
        try:
            subprocess.run(['pg_ctl', '-D', str(cluster), '-l', str(root / 'postgres.log'), '-o',
                            f'-h 127.0.0.1 -p {port} -k {shlex.quote(str(root))}', '-w', 'start'],
                           env=environment, stdout=subprocess.DEVNULL, check=True)
            result = subprocess.run(command, cwd=repo, env=environment,
                                    text=True, stdout=subprocess.PIPE)
            print(result.stdout, end='', flush=True)
            if result.returncode == 0 and not any(
                int(passed) > 0 for passed in re.findall(
                    r'^test result: ok\. (\d+) passed;', result.stdout, re.MULTILINE
                )
            ):
                parser.error('No PostgreSQL tests executed; discovery alone is not acceptance evidence')
            return result.returncode
        finally:
            # Startup can launch PostgreSQL and still fail its readiness wait.
            # Probe only this disposable cluster before removing its files.
            status = subprocess.run(['pg_ctl', '-D', str(cluster), 'status'],
                                    env=environment, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            if status.returncode == 0:
                subprocess.run(['pg_ctl', '-D', str(cluster), '-m', 'fast', '-w', 'stop'],
                               env=environment, stdout=subprocess.DEVNULL, check=True)


if __name__ == '__main__':
    raise SystemExit(main())
