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
from urllib.parse import urlsplit, unquote

ROOT = Path(__file__).resolve().parents[1]
CORE = ROOT
def development_state(home, legacy):
    """New databases use durable private state; never silently abandon a legacy cluster."""
    durable = home / '.local' / 'state' / 'niu' / 'dev'
    return durable if durable.exists() or not legacy.exists() else legacy


STATE = development_state(Path.home(), Path(f'/tmp/niu-core-dev-{os.getuid()}'))
PORTS = {'gateway': 2567, 'dashboard': 2566}
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
    allowed = {
        'NIU_DATABASE_URL', 'NIU_ADMIN_TOKENS', 'NIU_VENDOR_ENCRYPTION_KEY',
        'NIU_DEV_USERNAME', 'NIU_DEV_PASSWORD',
        'NIU_ZHIFUX_CONFIG_FILE',
    }

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


def load_runtime_secrets(local_config):
    """Preserve existing database and encryption identities after temp-file loss."""
    path = STATE / 'secrets.json'
    pgdata = STATE / 'postgres'
    if pgdata.exists() and any(pgdata.iterdir()) and not (pgdata / 'PG_VERSION').exists():
        raise RuntimeError('Existing PostgreSQL directory is incomplete; restore its cluster files before starting. Database data was preserved.')
    if path.exists():
        return json.loads(path.read_text())
    if (STATE / 'postgres' / 'PG_VERSION').exists():
        database = urlsplit(local_config.get('NIU_DATABASE_URL', ''))
        password_path = STATE / 'postgres.password'
        if (database.scheme not in {'postgres', 'postgresql'}
                or database.hostname != '127.0.0.1' or database.port != 55433
                or database.username != 'niu_dev_core' or database.path != '/niu_dev_core'
                or not database.password or not password_path.exists()
                or not local_config.get('NIU_ADMIN_TOKENS')
                or not local_config.get('NIU_VENDOR_ENCRYPTION_KEY')):
            raise RuntimeError('Existing development database credentials are missing; restore the private runtime credentials before starting. Database data was preserved.')
        values = {
            'postgres': password_path.read_text().strip(),
            'core': unquote(database.password),
            'admin': local_config['NIU_ADMIN_TOKENS'],
            'encryption': local_config['NIU_VENDOR_ENCRYPTION_KEY'],
        }
        if not values['postgres']:
            raise RuntimeError('Existing PostgreSQL password is missing; database data was preserved.')
    else:
        values = {key: secrets.token_hex(32) for key in ('postgres', 'core', 'admin', 'encryption')}
    # Exclusive creation prevents replacing another process's recovered credentials.
    with path.open('x') as output:
        path.chmod(0o600)
        json.dump(values, output)
    return values


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


def dashboard_source_stamp():
    paths = []
    dashboard = CORE / 'apps/dashboard'
    for base in (dashboard / 'src',):
        paths.extend((str(p), p.stat().st_mtime_ns) for p in base.rglob('*')
                     if p.is_file() and p.suffix in ('.ts', '.tsx', '.css', '.html'))
    for name in ('index.html', 'vite.config.ts', 'package.json'):
        path = dashboard / name
        if path.exists():
            paths.append((str(path), path.stat().st_mtime_ns))
    mark = ROOT / 'branding/assets/niu-mark.png'
    if mark.exists():
        paths.append((str(mark), mark.stat().st_mtime_ns))
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
    parser.add_argument('--no-watch', action='store_true', help='Disable Rust rebuilds; packaged dashboard rebuilds remain enabled')
    parser.add_argument('--hmr', action='store_true', help='Compatibility flag; frontend hot reload is the default')
    parser.add_argument('--packaged', action='store_true', help='Serve the built package directly on port 2566 for package verification')
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
    local_config = load_local_env()
    dev_username = os.environ.get('NIU_DEV_USERNAME') or local_config.get('NIU_DEV_USERNAME') or 'demo@niu.io'
    dev_password_override = os.environ.get('NIU_DEV_PASSWORD') or local_config.get('NIU_DEV_PASSWORD')
    if not dev_username.strip():
        raise RuntimeError('The local dashboard username cannot be empty')
    if STATE.is_symlink():
        raise RuntimeError('Runtime directory must not be a symlink')
    STATE.mkdir(mode=0o700, exist_ok=True)
    if STATE.stat().st_uid != os.getuid():
        raise RuntimeError('Runtime directory is owned by another user')
    os.chmod(STATE, 0o700)
    dev_password_path = STATE / 'dev-password'
    if dev_password_override is None:
        if not dev_password_path.exists():
            dev_password_path.write_text(secrets.token_hex(18))
            dev_password_path.chmod(0o600)
        dev_password = dev_password_path.read_text().strip()
        if len(dev_password) < 32:
            raise RuntimeError('The local dashboard password must contain at least 32 characters')
    else:
        dev_password = dev_password_override
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
    active_ports = {'gateway': 2566} if args.packaged else PORTS
    for name, port in active_ports.items():
        with socket.socket() as check:
            try:
                check.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
                check.bind(('127.0.0.1', port))
            except OSError:
                raise RuntimeError(f'{name} port {port} is in use; stop its existing process first') from None
    secret = load_runtime_secrets(local_config)
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
        'NIU_BIND': f"127.0.0.1:{active_ports['gateway']}",
        'NIU_DEV_PRESERVE_ASSETS': '1',
        'NIU_DASHBOARD_DIR': str(CORE / 'apps/dashboard/dist'),
        'NIU_DOCS_DIR': str(CORE / 'apps/docs/dist'), 'NIU_CATALOG_DIR': str(CORE / 'apps/catalog/dist'),
        'RUST_LOG': 'info',
        'NIU_DEV_USERNAME': dev_username,
        'NIU_DEV_MEMBER_ORIGIN': f"http://localhost:{PORTS['dashboard']}",
        'NIU_DEV_PASSWORD': dev_password,
    })
    print(f'Private runtime files and logs: {STATE}', flush=True)
    for key, value in local_config.items():
        if key in {'NIU_DEV_USERNAME', 'NIU_DEV_PASSWORD'}:
            continue
        if key.endswith('DATABASE_URL') and value != env.get(key):
            raise RuntimeError(f'{key} in .env must match the managed development database')
        env[key] = value
    for repo in (CORE,):
        run(['pnpm', 'install', '--frozen-lockfile'], repo, env, stdout=subprocess.DEVNULL)
    build(env)
    # Static fallbacks for gateway routes; edit via the HMR URLs below.
    for task in ('build:dashboard', 'build:docs', 'build:catalog'):
        run(['pnpm', task], CORE, env, stdout=subprocess.DEVNULL)
    supervisor = spawn('runtime', [ROOT / 'target/debug/niu-gateway'], ROOT, env)
    if not args.packaged:
        frontend_env = dict(env)
        frontend_env['NIU_DEV_GATEWAY_URL'] = 'http://127.0.0.1:2567'
        frontend_env['NIU_DEV_GATEWAY_LOGIN'] = '1'
        frontend_env['VITE_NIU_GATEWAY_LOGIN'] = '1'
        frontend_env['NIU_DEV_BASE'] = '/'
        spawn('dashboard', ['pnpm', 'exec', 'vite', '--strictPort', '--host', '127.0.0.1', '--port', '2566'], CORE / 'apps/dashboard', frontend_env)
    deadline = time.time() + 90
    while time.time() < deadline and not stopping:
        failed = [name for name, proc in children if proc.poll() is not None]
        if failed:
            raise RuntimeError(f"Service exited: {', '.join(failed)}; inspect its log")
        try:
            for name, port in active_ports.items():
                suffix = '/readyz' if name == 'gateway' else '/'
                urllib.request.urlopen(f'http://127.0.0.1:{port}{suffix}', timeout=2).close()
            urllib.request.urlopen('http://127.0.0.1:2566/workspaces/default/', timeout=2).close()
            break
        except Exception:
            time.sleep(1)
    else:
        raise RuntimeError('Startup did not complete; inspect runtime logs')
    print('\nDevelopment stack ready:', flush=True)
    print('  app: http://127.0.0.1:2566/ (dashboard, API, docs and catalog)', flush=True)
    print('  dashboard: packaged verification' if args.packaged else '  dashboard: live source with hot reload; backend is loopback-only on 2567', flush=True)
    if dev_password_override is None:
        print(f'Dashboard login username: {dev_username} (private password file: {dev_password_path})', flush=True)
    else:
        print(f'Dashboard login username: {dev_username} (password supplied through local configuration)', flush=True)
    print('Ctrl-C stops this stack; database data is retained.', flush=True)
    stamp = source_stamp()
    dashboard_stamp = dashboard_source_stamp()
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
        updated_dashboard = dashboard_source_stamp()
        if args.packaged and updated_dashboard != dashboard_stamp:
            dashboard_stamp = updated_dashboard
            try:
                with open(STATE / 'build.log', 'a') as log:
                    run(['pnpm', 'build:dashboard'], CORE, env, stdout=log, stderr=subprocess.STDOUT)
                print('Packaged dashboard rebuilt; refresh port 2566 to see the changes.', flush=True)
            except subprocess.CalledProcessError:
                print('Dashboard build failed; previous package remains available. See build.log.', flush=True)


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
