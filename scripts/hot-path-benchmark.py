#!/usr/bin/env python3
"""Measure the gateway inference hot path with PostgreSQL statement tracing.

Starts a disposable PostgreSQL cluster with `log_statement=all`, runs the
ignored `hot_path_readiness_registry_credential` gateway benchmark against it,
and reports request latency percentiles plus the exact server-logged statements
executed between the benchmark's own SQL markers. The fixture is local and
owner-funded: one workspace, one key, one encrypted vendor route and a loopback
upstream. No paid provider call is made.
"""
import argparse
import json
import math
import os
import platform
import re
import secrets
import shlex
import shutil
import socket
import subprocess
import tempfile
from pathlib import Path
from urllib.parse import quote


def percentile(values, fraction):
    if not values:
        return None
    ordered = sorted(values)
    index = max(0, math.ceil(len(ordered) * fraction) - 1)
    return round(ordered[index], 3)


STATEMENT_PREFIX = re.compile(r'LOG:\s+(statement:|execute [^:]*:)')
KEYWORD = re.compile(r'LOG:\s+(?:statement:|execute [^:]*:)\s*([A-Za-z]+)')
MARKERS = ('NIU_HOT_PATH_START', 'NIU_HOT_PATH_END')
# Attribute round trips to the hot-path operation that issued them. These are
# stable SQL fragments, not a replacement for the exact statement count.
HOT_PATH_PATTERNS = {
    'auth_key': 'token_hash',
    'readiness_currency': 'FROM platform_currency',
    'readiness_epay_configuration': 'FROM payment_gateway_configuration',
    'readiness_evidence': 'payment_checkout_verification',
    'readiness_verification': 'payment_verification_evidence',
    'readiness_facts': 'AS callback_digests',
    'registry_generation': 'routing_registry_active',
    'route_and_credential': 'niu_supplier_model_route_available',
    'admission_insert': 'INSERT INTO operations',
    'diagnostic_insert': 'request_payloads',
    'timing_insert': 'request_timings',
}


def hardware():
    info = {
        'platform': platform.platform(),
        'machine': platform.machine(),
        'python': platform.python_version(),
        'logical_cpus': os.cpu_count(),
    }
    for command, key in (
        (['sysctl', '-n', 'machdep.cpu.brand_string'], 'cpu'),
        (['sysctl', '-n', 'hw.memsize'], 'memory_bytes'),
        (['rustc', '--version'], 'rustc'),
        (['cargo', '--version'], 'cargo'),
        (['psql', '--version'], 'psql'),
    ):
        try:
            info[key] = subprocess.run(command, capture_output=True, text=True, check=True).stdout.strip()
        except (OSError, subprocess.CalledProcessError):
            pass
    return info


def parse_statements(log_path, samples):
    text = log_path.read_text(errors='replace').splitlines()
    start = end = None
    for index, line in enumerate(text):
        if MARKERS[0] in line and STATEMENT_PREFIX.search(line):
            start = index
        elif MARKERS[1] in line and STATEMENT_PREFIX.search(line) and start is not None:
            end = index
    if start is None or end is None:
        return None
    between = [line for line in text[start + 1:end] if STATEMENT_PREFIX.search(line)]
    categories = {}
    attributed = {}
    total = 0
    for line in between:
        match = KEYWORD.search(line)
        if not match:
            continue
        keyword = match.group(1).upper()
        if keyword in ('BEGIN', 'COMMIT', 'ROLLBACK', 'START'):
            category = keyword.lower()
        elif 'set_config(' in line:
            category = 'set_config'
        elif keyword in ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'WITH', 'CALL'):
            category = keyword.lower()
        else:
            category = keyword.lower()
        categories[category] = categories.get(category, 0) + 1
        for name, fragment in HOT_PATH_PATTERNS.items():
            if fragment in line:
                attributed[name] = attributed.get(name, 0) + 1
        total += 1
    return {
        'hot_path_statements_per_request': {
            name: round(count / samples, 3) if samples else None
            for name, count in sorted(attributed.items())
        },
        'statements': total,
        'statements_per_request': round(total / samples, 3) if samples else None,
        'categories': dict(sorted(categories.items())),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--samples', type=int, default=800,
                        help='measured requests after 50 warmups (100..20000)')
    parser.add_argument('--test', default='hot_path_readiness_registry_credential')
    parser.add_argument('--binary', type=Path,
                        help='prebuilt ignored-test binary; skip the cargo build (shared working trees)')
    parser.add_argument('--keep', action='store_true', help='keep the temporary cluster and log')
    args = parser.parse_args()
    if not 100 <= args.samples <= 20_000:
        parser.error('samples must be 100..20000')
    for executable in ('cargo', 'initdb', 'pg_ctl', 'psql'):
        if shutil.which(executable) is None:
            parser.error(f'{executable} must be installed and available on PATH')

    repo = Path(__file__).resolve().parents[1]
    environment = {name: os.environ[name] for name in ('PATH', 'HOME', 'TMPDIR', 'LANG', 'LC_ALL') if name in os.environ}
    environment['CARGO_INCREMENTAL'] = '0'
    environment['NIU_HOT_PATH_SAMPLES'] = str(args.samples)
    environment['RUST_LOG'] = 'warn'

    root = Path(tempfile.mkdtemp(prefix='niu-hot-path-'))
    root.chmod(0o700)
    cluster = root / 'postgres'
    log_path = root / 'postgres.log'
    with socket.socket() as listener:
        listener.bind(('127.0.0.1', 0))
        port = listener.getsockname()[1]
    password = secrets.token_urlsafe(32)
    password_file = root / 'password'
    password_file.write_text(password)
    password_file.chmod(0o600)
    environment['DATABASE_URL'] = f'postgres://postgres:{quote(password, safe="")}@127.0.0.1:{port}/postgres'

    libtest = ['--ignored', '--nocapture', '--test-threads=1', '--exact',
               f'web::tests::hot_path_benchmark::{args.test}']
    if args.binary:
        command = [str(args.binary.resolve())] + libtest
    else:
        command = ['cargo', 'test', '-p', 'niu-gateway', '--release',
                   '--no-run', '--message-format=json']
    try:
        subprocess.run(['initdb', '-D', str(cluster), '-U', 'postgres',
                        '--auth=scram-sha-256', '--pwfile', str(password_file)],
                       env=environment, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
        subprocess.run(['pg_ctl', '-D', str(cluster), '-l', str(log_path), '-o',
                        f'-h 127.0.0.1 -p {port} -k {shlex.quote(str(root))} '
                        f'-c log_statement=all',
                        '-w', 'start'],
                       env=environment, stdout=subprocess.DEVNULL, check=True)
        if args.binary:
            result = subprocess.run(command, cwd=repo, env=environment,
                                    text=True, stdout=subprocess.PIPE)
        else:
            build = subprocess.run(command, cwd=repo, env=environment,
                                   text=True, stdout=subprocess.PIPE)
            if build.returncode != 0:
                print(build.stdout, end='', flush=True)
                raise SystemExit('Benchmark build failed')
            executable = None
            for line in build.stdout.splitlines():
                try:
                    message = json.loads(line)
                except json.JSONDecodeError:
                    continue
                target = message.get('target', {})
                profile = message.get('profile', {})
                if (
                    message.get('reason') == 'compiler-artifact'
                    and message.get('executable')
                    and target.get('name') == 'niu-gateway'
                    and profile.get('test') is True
                ):
                    executable = message['executable']
            if executable is None:
                raise SystemExit('Benchmark build produced no executable')
            command = [executable] + libtest
            result = subprocess.run(command, cwd=repo, env=environment,
                                    text=True, stdout=subprocess.PIPE)
        print(result.stdout, end='', flush=True)
        if result.returncode != 0:
            raise SystemExit('Benchmark test failed; see output above (log kept under the temporary root while it exists)')
        report = None
        for line in result.stdout.splitlines():
            marker = line.find('[hot-path] ')
            if marker >= 0:
                report = json.loads(line[marker + len('[hot-path] '):])
        if report is None:
            raise SystemExit('Benchmark test did not print a [hot-path] report')
        samples = report.get('samples')
        tracing = parse_statements(log_path, samples)
        if tracing is None:
            raise SystemExit('Could not find the benchmark SQL markers in the PostgreSQL log')
        output = {
            'command': ' '.join(shlex.quote(part) for part in command),
            'binary_sha256': __import__('hashlib').sha256(Path(command[0]).read_bytes()).hexdigest(),
            'dataset': 'disposable PostgreSQL 17 cluster; one organization/workspace/key, one owner-funded encrypted vendor route, one loopback OpenAI-compatible upstream, default-on request diagnostics',
            'log_statement': 'all (server-side statement count between NIU_HOT_PATH_START/END markers)',
            'hardware': hardware(),
            'result': report,
            'database_round_trips': tracing,
        }
        print(json.dumps(output, indent=2, sort_keys=True))
        if args.keep:
            print(f'Cluster kept at {root} (log: {log_path})')
    finally:
        status = subprocess.run(['pg_ctl', '-D', str(cluster), 'status'],
                                env=environment, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if status.returncode == 0:
            subprocess.run(['pg_ctl', '-D', str(cluster), '-m', 'fast', '-w', 'stop'],
                           env=environment, stdout=subprocess.DEVNULL, check=True)
        if not args.keep:
            shutil.rmtree(root, ignore_errors=True)


if __name__ == '__main__':
    raise SystemExit(main())
