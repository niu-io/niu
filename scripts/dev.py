#!/usr/bin/env python3
"""Native open-source development stack with frontend hot reload."""
import argparse
import json
import os
from pathlib import Path
import secrets
import shutil
import shlex
import signal
import socket
import subprocess
import sys
import time
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
CORE = ROOT
STATE = Path(f'/tmp/niu-core-dev-{os.getuid()}')
PORTS = {'gateway': 2566, 'console': 2555, 'docs': 4324, 'catalog': 4325}
children = []
logs = []
stopping = False
pg_started = False


def run(args, cwd=ROOT, env=None, **kwargs):
    return subprocess.run([str(x) for x in args], cwd=cwd, env=env or os.environ, check=True, **kwargs)


def load_local_env():
    """Load literal dotenv values without shell execution or interpolation."""
    path = ROOT / '.env'
    if not path.exists():
        return {}
    allowed = {'NIU_DATABASE_URL', 'NIU_ADMIN_TOKENS', 'NIU_VENDOR_ENCRYPTION_KEY'}

    values = {}
    for number, line in enumerate(path.read_text().splitlines(), 1):
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        if line.startswith('export '):
            line = line[7:]
        key, separator, raw = line.partition('=')
        if not separator:
            raise RuntimeError(f'Invalid .env assignment on line {number}')
        key = key.strip()
        if key not in allowed:
            continue
        parts = shlex.split(raw, comments=True)
        if len(parts) != 1 or not parts[0]:
            raise RuntimeError(f'Missing or invalid .env value for {key}')
        values[key] = parts[0]
    return values


def stop(*_):
    global stopping
    stopping = True


def spawn(name, args, cwd, env):
    log = open(STATE / f'{name}.log', 'a')
    logs.append(log)
    child = subprocess.Popen([str(x) for x in args], cwd=cwd, env=env, stdout=log,
                             stderr=subprocess.STDOUT, start_new_session=True)
    children.append((name, child))
    return child


def terminate(child):
    if child.poll() is None:
        os.killpg(child.pid, signal.SIGTERM)
        try:
            child.wait(timeout=12)
        except subprocess.TimeoutExpired:
            os.killpg(child.pid, signal.SIGKILL)
            child.wait()


def source_stamp():
    paths = []
    for repo in (CORE,):
        for folder in ('crates', 'apps/gateway'):
            base = repo / folder
            if base.exists():
                paths.extend((str(p), p.stat().st_mtime_ns) for p in base.rglob('*')
                             if p.is_file() and p.suffix in ('.rs', '.toml', '.sql'))
        for name in ('Cargo.toml', 'Cargo.lock'):
            p = repo / name
            paths.append((str(p), p.stat().st_mtime_ns))
    return sorted(paths)


def build(env):
    print('Building native gateway…', flush=True)
    with open(STATE / 'build.log', 'a') as log:
        for repo, package in ((CORE, 'niu-gateway'),):
            run(['cargo', 'build', '--locked', '-p', package], repo, env, stdout=log, stderr=subprocess.STDOUT)


def main():
    global pg_started
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--stop', action='store_true', help='Stop the running native development stack')
    parser.add_argument('--no-watch', action='store_true', help='Disable Rust rebuilds; frontend HMR remains enabled')
    args = parser.parse_args()
    if args.stop:
        pidfile = STATE / 'launcher.pid'
        if not pidfile.exists():
            print('No running launcher recorded.')
            return
        pid = int(pidfile.read_text())
        # Confirm process identity before signaling a potentially reused PID.
        command = subprocess.run(['ps', '-p', str(pid), '-o', 'command='], capture_output=True, text=True).stdout
        if 'scripts/dev.py' not in command:
            raise RuntimeError('Recorded PID is not the development launcher; refusing to signal it')
        os.kill(pid, signal.SIGTERM)
        print('Shutdown requested. Database data is retained.')
        return
    os.umask(0o077)
    if STATE.is_symlink():
        raise RuntimeError('Runtime directory must not be a symlink')
    STATE.mkdir(mode=0o700, exist_ok=True)
    if STATE.stat().st_uid != os.getuid():
        raise RuntimeError('Runtime directory is owned by another user')
    os.chmod(STATE, 0o700)
    import fcntl
    lock = open(STATE / 'launcher.lock', 'w')
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    (STATE / 'launcher.pid').write_text(str(os.getpid()))
    env = os.environ.copy()
    # Do not inherit a deployment's runtime configuration into this isolated stack.
    for name in list(env):
        if name.startswith('NIU_') or name == 'PORT':
            env.pop(name)
    if not shutil.which('cargo'):
        candidates = sorted((Path.home() / '.rustup/toolchains').glob('1.98.0-*/bin'))
        if not candidates:
            raise RuntimeError('Install Rust 1.98.0 or newer, or put cargo on PATH')
        env['PATH'] = str(candidates[0]) + os.pathsep + env['PATH']
    for tool in ('pnpm', 'initdb', 'pg_ctl', 'psql'):
        if not shutil.which(tool):
            raise RuntimeError(f'{tool} is required on PATH')
    for name, port in PORTS.items():
        with socket.socket() as check:
            try:
                check.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
                check.bind(('127.0.0.1', port))
            except OSError:
                raise RuntimeError(f'{name} port {port} is in use; stop its existing process first') from None
    secret_path = STATE / 'secrets.json'
    if not secret_path.exists():
        secret_path.write_text(json.dumps({key: secrets.token_hex(32) for key in ('postgres', 'core', 'admin', 'encryption')}))
    secret = json.loads(secret_path.read_text())
    pwfile = STATE / 'postgres.password'
    pwfile.write_text(secret['postgres'])
    pgdata = STATE / 'postgres'
    if not (pgdata / 'PG_VERSION').exists():
        run(['initdb', '-D', pgdata, '-U', 'postgres', '--auth=scram-sha-256', '--pwfile', pwfile], stdout=subprocess.DEVNULL)
    status = subprocess.run(['pg_ctl', '-D', str(pgdata), 'status'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    if status.returncode != 0:
        run(['pg_ctl', '-D', pgdata, '-l', STATE / 'postgres.log', '-o', f'-h 127.0.0.1 -p 55433 -k {STATE}', '-w', 'start'])
        pg_started = True
    pg_env = env | {'PGPASSWORD': secret['postgres']}
    psql = ['psql', '-h', '127.0.0.1', '-p', '55433', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1']
    # Dedicated development database and unprivileged application role.
    for name, key in (('niu_dev_core', 'core'),):
        exists = run(psql + ['-Atc', f"SELECT 1 FROM pg_roles WHERE rolname='{name}'"], env=pg_env, capture_output=True, text=True).stdout.strip()
        if not exists:
            run(psql, env=pg_env, input=f"CREATE ROLE {name} LOGIN PASSWORD '{secret[key]}';\nCREATE DATABASE {name} OWNER {name};\n", text=True, stdout=subprocess.DEVNULL)
    (STATE / 'niu.toml').write_text('[models]\n')
    env.update({
        'NIU_DATABASE_URL': f"postgres://niu_dev_core:{secret['core']}@127.0.0.1:55433/niu_dev_core",
        'NIU_ADMIN_TOKENS': secret['admin'], 'NIU_VENDOR_ENCRYPTION_KEY': secret['encryption'],
        'NIU_CONFIG_FILE': str(STATE / 'niu.toml'),
        'NIU_BIND': '127.0.0.1:2566',
        'NIU_CONSOLE_DIR': str(CORE / 'apps/console/dist'),
        'NIU_DOCS_DIR': str(CORE / 'apps/docs/dist'), 'NIU_CATALOG_DIR': str(CORE / 'apps/catalog/dist'),
        'RUST_LOG': 'info',
    })
    print(f'Private runtime files and logs: {STATE}', flush=True)
    for key, value in load_local_env().items():
        if key.endswith('DATABASE_URL') and value != env.get(key):
            raise RuntimeError(f'{key} in .env must match the managed development database')
        env[key] = value
    for repo in (CORE,):
        run(['pnpm', 'install', '--frozen-lockfile'], repo, env, stdout=subprocess.DEVNULL)
    build(env)
    # Static fallbacks for gateway routes; edit via the HMR URLs below.
    for task in ('build:console', 'build:docs', 'build:catalog'):
        run(['pnpm', task], CORE, env, stdout=subprocess.DEVNULL)
    supervisor = spawn('runtime', [ROOT / 'target/debug/niu-gateway'], ROOT, env)
    # Only the loopback console proxy receives the admin credential; never browser code.
    ui_env = os.environ.copy()
    ui_env['NIU_DEV_GATEWAY_URL'] = 'http://127.0.0.1:2566'
    for name, folder, command in (
        ('console', CORE / 'apps/console', 'vite'),
        ('docs', CORE / 'apps/docs', 'astro'),
        ('catalog', CORE / 'apps/catalog', 'astro'),
    ):
        frontend_env = dict(ui_env)
        if name == 'console':
            frontend_env['NIU_ADMIN_TOKENS'] = env['NIU_ADMIN_TOKENS']
        spawn(name, ['pnpm', 'exec', command, 'dev' if command == 'astro' else '--strictPort', *(['--ignore-lock'] if command == 'astro' else []), '--host', '127.0.0.1', '--port', str(PORTS[name])], folder, frontend_env)
    deadline = time.time() + 90
    while time.time() < deadline and not stopping:
        failed = [name for name, proc in children if proc.poll() is not None]
        if failed:
            raise RuntimeError(f"Service exited: {', '.join(failed)}; inspect its log")
        try:
            for name, port in PORTS.items():
                suffix = '/readyz' if name == 'gateway' else '/docs/' if name == 'docs' else '/models/' if name == 'catalog' else '/'
                urllib.request.urlopen(f'http://127.0.0.1:{port}{suffix}', timeout=2).close()
            for port in (2555, 4325):
                urllib.request.urlopen(f'http://127.0.0.1:{port}/catalog/v1/models', timeout=2).close()
            break
        except Exception:
            time.sleep(1)
    else:
        raise RuntimeError('Startup did not complete; inspect runtime logs')
    print('\nDevelopment stack ready:', flush=True)
    print('  console: http://127.0.0.1:2555/workspaces/default/ (single browser entry; hot reload; local sign-in enabled)', flush=True)
    print('  Gateway API is proxied through the console.', flush=True)
    print('  docs: http://127.0.0.1:4324/docs/', flush=True)
    print('  catalog: http://127.0.0.1:4325/models/', flush=True)
    print('Local admin sign-in is automatic; no token needs to be pasted.', flush=True)
    print('Ctrl-C stops this stack; database data is retained.', flush=True)
    stamp = source_stamp()
    while not stopping:
        time.sleep(2)
        failed = [name for name, proc in children if proc.poll() is not None]
        if failed:
            raise RuntimeError(f"Service exited: {', '.join(failed)}; inspect its log")
        updated = source_stamp()
        if not args.no_watch and updated != stamp:
            stamp = updated
            try:
                build(env)
            except subprocess.CalledProcessError:
                print('Rust build failed; previous runtime remains active. See build.log.', flush=True)
                continue
            terminate(supervisor)
            children[:] = [(name, proc) for name, proc in children if proc is not supervisor]
            supervisor = spawn('runtime', [ROOT / 'target/debug/niu-gateway'], ROOT, env)
            print('Native runtime restarted.', flush=True)


if __name__ == '__main__':
    signal.signal(signal.SIGINT, stop)
    signal.signal(signal.SIGTERM, stop)
    try:
        main()
    except Exception as exc:
        print(f'Development stack failed: {exc}', file=sys.stderr)
        sys.exitcode = 1
    finally:
        for _, child in reversed(children):
            terminate(child)
        for log in logs:
            log.close()
        pidfile = STATE / 'launcher.pid'
        if pidfile.exists() and pidfile.read_text() == str(os.getpid()):
            pidfile.unlink()
        if pg_started:
            subprocess.run(['pg_ctl', '-D', str(STATE / 'postgres'), '-m', 'fast', '-w', 'stop'], stdout=subprocess.DEVNULL)
    sys.exit(getattr(sys, 'exitcode', 0))
