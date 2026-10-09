#!/usr/bin/env python3
"""Isolated native listing/lookup SQL, restart and restore acceptance.

Requires a freshly built target/debug/niu-gateway and PostgreSQL CLI tools.
Synthetic saved responses only; no Supplier request or container qualification.
"""
import importlib.util
import os
from pathlib import Path
import secrets
import socket
import subprocess
import tempfile
import time
import urllib.error
from urllib.parse import quote

REPO = Path(__file__).resolve().parents[1]


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def free_port():
    with socket.socket() as listener:
        listener.bind(('127.0.0.1', 0))
        return listener.getsockname()[1]


def main():
    smoke = load('native_asset_package', REPO / 'scripts/package-smoke.py')
    cleanup = load('native_asset_cleanup', REPO / 'scripts/native_cleanup.py')
    updates = load('native_asset_updates', REPO / 'scripts/package_asset_updates.py')
    with tempfile.TemporaryDirectory(prefix='niu-native-assets-') as directory:
        root = Path(directory)
        root.chmod(0o700)
        pgdata = root / 'postgres'
        pgport, gatewayport = free_port(), free_port()
        password, admin, master = [secrets.token_urlsafe(48) for _ in range(3)]
        password_file = root / 'password'
        password_file.write_text(password)
        password_file.chmod(0o600)
        environment = {key: os.environ[key] for key in ('PATH', 'HOME', 'TMPDIR', 'LANG', 'LC_ALL') if key in os.environ}
        environment.update(PGPASSWORD=password, NIU_ADMIN_TOKENS=admin,
            NIU_VENDOR_ENCRYPTION_KEY=master, NIU_BIND=f'127.0.0.1:{gatewayport}',
            NIU_DATABASE_URL=f'postgres://postgres:{quote(password, safe="")}@127.0.0.1:{pgport}/postgres')
        config = root / 'config.toml'
        config.write_text('[models.fixture]\nprovider="openai"\nupstream_model="fixture"\napi_key_env="FIXTURE_KEY"\napi_base="http://127.0.0.1:1/v1"\n')
        environment.update(NIU_CONFIG_FILE=str(config), FIXTURE_KEY=secrets.token_urlsafe(32))
        smoke.BASE_URL, smoke.ADMIN_TOKEN = f'http://127.0.0.1:{gatewayport}', admin
        database, gateway, handles = 'postgres', None, []

        def sql(statement):
            return subprocess.check_output(['psql', '-h', '127.0.0.1', '-p', str(pgport),
                '-U', 'postgres', '-d', database, '-v', 'ON_ERROR_STOP=1', '-At', '-c', statement],
                env=environment, text=True, stderr=subprocess.DEVNULL).strip()

        def start():
            nonlocal gateway
            log = open(root / 'gateway.log', 'ab')
            handles.append(log)
            gateway = subprocess.Popen([str(REPO / 'target/debug/niu-gateway')],
                cwd=REPO, env=environment, stdout=log, stderr=log)
            for _ in range(100):
                if gateway.poll() is not None:
                    raise RuntimeError('isolated gateway stopped during startup')
                try:
                    if smoke.request('GET', '/readyz')[0] == 200:
                        return
                except (OSError, urllib.error.URLError):
                    pass
                time.sleep(.1)
            raise RuntimeError('isolated gateway readiness timeout')

        def stop():
            nonlocal gateway
            cleanup.stop_process(gateway)
            gateway = None

        try:
            subprocess.run(['initdb', '-D', str(pgdata), '-U', 'postgres', '--auth=scram-sha-256',
                '--pwfile', str(password_file)], env=environment, stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL, check=True)
            subprocess.run(['pg_ctl', '-D', str(pgdata), '-l', str(root / 'postgres.log'), '-o',
                f'-h 127.0.0.1 -p {pgport} -k {root}', '-w', 'start'],
                env=environment, stdout=subprocess.DEVNULL, check=True)
            start()
            organization = smoke.request('POST', '/admin/v1/organizations', admin=True,
                payload={'name': 'Native asset recovery'})[1]['id']
            workspace = smoke.request('POST', f'/admin/v1/organizations/{organization}/projects',
                admin=True, payload={'name': 'Recovery'})[1]['id']
            prepared = smoke.PACKAGE_ASSETS.prepare_asset_upgrade(smoke.asset_request, sql, organization, workspace)
            saved = smoke.PACKAGE_LISTINGS.prepare_listing_fixture(smoke.asset_request, sql,
                prepared, master, include_lookups=True)
            smoke.PACKAGE_LISTINGS.assert_listing_fixture(smoke.asset_request, sql, saved)
            update = updates.prepare_update_fixture(smoke.asset_request, sql, saved)
            updates.assert_update_fixture(smoke.asset_request, sql, update)
            recovered = updates.prepare_reconciliation_fixture(smoke.asset_request, sql, saved, master,
                smoke.PACKAGE_LISTINGS.encrypted_page)
            print('native SQL setup and encrypted listing/lookup recovery passed', flush=True)
            stop()
            start()
            smoke.PACKAGE_LISTINGS.assert_listing_fixture(smoke.asset_request, sql, saved)
            updates.assert_update_fixture(smoke.asset_request, sql, update)
            updates.reconcile_saved_fixture(smoke.asset_request, sql, recovered)
            updates.dispatch_update_fixture(smoke.asset_request, sql, update)
            stop()
            start()
            updates.assert_update_fixture(smoke.asset_request, sql, update)
            updates.assert_reconciliation_fixture(smoke.asset_request, sql, recovered)
            updates.assert_update_replay_denied(smoke.asset_request, update)
            print('native process restart and unresolved audit preservation passed', flush=True)
            stop()
            backup = root / 'backup.sql'
            with backup.open('wb') as output:
                subprocess.run(['pg_dump', '-h', '127.0.0.1', '-p', str(pgport), '-U', 'postgres',
                    '-d', database, '--no-owner', '--no-privileges'], env=environment,
                    stdout=output, stderr=subprocess.DEVNULL, check=True)
            sql('CREATE DATABASE restored_assets')
            database = 'restored_assets'
            subprocess.run(['psql', '-h', '127.0.0.1', '-p', str(pgport), '-U', 'postgres',
                '-d', database, '-v', 'ON_ERROR_STOP=1', '-f', str(backup)], env=environment,
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
            environment['NIU_DATABASE_URL'] = environment['NIU_DATABASE_URL'].removesuffix('/postgres') + '/restored_assets'
            start()
            smoke.PACKAGE_LISTINGS.assert_listing_fixture(smoke.asset_request, sql, saved)
            updates.assert_update_fixture(smoke.asset_request, sql, update)
            updates.assert_reconciliation_fixture(smoke.asset_request, sql, recovered)
            updates.assert_update_replay_denied(smoke.asset_request, update)
            print('native backup/restore and encrypted lookup/audit preservation passed', flush=True)
            financial_rows = sql("SELECT (SELECT count(*) FROM customer_balance_entries WHERE organization_id='" + organization + "')+(SELECT count(*) FROM customer_balance_reservations WHERE organization_id='" + organization + "')+(SELECT count(*) FROM customer_charges WHERE organization_id='" + organization + "')")
            assert financial_rows == '0', 'asset management created customer financial records'
            print('native acknowledged reconciliation from retained read after restart and restore passed', flush=True)
            print('native patch decryption after restart, uncertain hold and replay denial after restore passed', flush=True)
        except urllib.error.HTTPError as error:
            raise RuntimeError(f'isolated asset recovery API rejected a request ({error.code})') from None
        finally:
            try:
                stop()
            finally:
                try:
                    cleanup.stop_postgres(pgdata)
                finally:
                    for handle in handles:
                        handle.close()


if __name__ == '__main__':
    main()
