#!/usr/bin/env python3
"""Run isolated native video configuration/restart/restore acceptance; not container qualification.

Requires PostgreSQL CLI tools and a freshly built target/debug/niu-gateway.
No existing server, database, credential or dev configuration is used.
"""
import importlib.util,json,os,pathlib,secrets,socket,subprocess,tempfile,time,urllib.error,urllib.request,uuid
from urllib.parse import quote
REPO=pathlib.Path(__file__).resolve().parents[1]
def load(name,path):
 spec=importlib.util.spec_from_file_location(name,path);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module
smoke=load('native_package_smoke',REPO/'scripts/package-smoke.py')
cleanup=load('native_cleanup',REPO/'scripts/native_cleanup.py')
root=pathlib.Path(tempfile.mkdtemp(prefix='niu-native-video-'));root.chmod(0o700)
def port():
 with socket.socket() as sock:sock.bind(('127.0.0.1',0));return sock.getsockname()[1]
pgport,gatewayport,providerport=port(),port(),port()
password=secrets.token_urlsafe(30); pwfile=root/'password';pwfile.write_text(password);pwfile.chmod(0o600)
pgdata=root/'pg';gateway=None;provider=None
admin=secrets.token_urlsafe(48);credential=secrets.token_urlsafe(32)
env={name:os.environ[name] for name in ("PATH","HOME","TMPDIR","LANG","LC_ALL") if name in os.environ}
env.update(PGPASSWORD=password,NIU_ADMIN_TOKENS=admin,NIU_VENDOR_ENCRYPTION_KEY=secrets.token_urlsafe(48),PROVIDER_KEY=credential,
 NIU_BIND=f'127.0.0.1:{gatewayport}',NIU_DATABASE_URL=f'postgres://postgres:{quote(password,safe="")}@127.0.0.1:{pgport}/postgres')
config=root/'config.toml';config.write_text(f'[models.fast]\nprovider="openai"\nupstream_model="fixture-model"\napi_key_env="PROVIDER_KEY"\napi_base="http://127.0.0.1:{providerport}/v1"\n');env['NIU_CONFIG_FILE']=str(config)
smoke.BASE_URL=f'http://127.0.0.1:{gatewayport}';smoke.ADMIN_TOKEN=admin
opener=urllib.request.build_opener(urllib.request.ProxyHandler({}))
def sql(statement,database='postgres'):
 return subprocess.check_output(['psql','-h','127.0.0.1','-p',str(pgport),'-U','postgres','-d',database,'-v','ON_ERROR_STOP=1','-At','-c',statement],env=env,text=True,stderr=subprocess.DEVNULL).strip()
smoke.database_value=sql
handles=[]
def start():
 global gateway
 log=open(root/'gateway.log','ab');handles.append(log)
 gateway=subprocess.Popen([str(REPO/'target/debug/niu-gateway')],cwd=REPO,env=env,stdout=log,stderr=log)
 for _ in range(100):
  if gateway.poll() is not None:raise RuntimeError('isolated gateway stopped during startup')
  try:
   if smoke.request('GET','/readyz')[0]==200:return
  except (OSError,urllib.error.URLError):pass
  time.sleep(.1)
 raise RuntimeError('isolated gateway readiness timeout')
def stop():
 global gateway
 if gateway is not None and gateway.poll() is None:
  gateway.terminate()
  try:gateway.wait(timeout=10)
  except subprocess.TimeoutExpired:gateway.kill();gateway.wait(timeout=5)
 gateway=None

def counts():
 request=urllib.request.Request(f'http://127.0.0.1:{providerport}/fixture/video-counts',headers={'Authorization':'Bearer '+credential})
 with opener.open(request,timeout=3) as response:return json.load(response)
try:
 subprocess.run(['initdb','-D',str(pgdata),'-U','postgres','--auth=scram-sha-256','--pwfile',str(pwfile)],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,check=True)
 subprocess.run(['pg_ctl','-D',str(pgdata),'-l',str(root/'postgres.log'),'-o',f'-h 127.0.0.1 -p {pgport} -k {root}','-w','start'],stdout=subprocess.DEVNULL,check=True)
 log=open(root/'provider.log','ab');handles.append(log)
 provider=subprocess.Popen(['python3',str(REPO/'tests/fixtures/mock-openai-compatible.py')],env=dict(env,MOCK_PROVIDER_PORT=str(providerport)),stdout=log,stderr=log)
 start()
 organization=smoke.request('POST','/admin/v1/organizations',admin=True,payload={'name':'Isolated native package video'})[1]['id']
 smoke.initialize_prepaid_account(organization)
 print('funding initialized',flush=True)
 configuration=smoke.PACKAGE_VIDEO.configure_video(smoke.request,organization,f'http://127.0.0.1:{providerport}',credential,
  lambda supplier:sql(f"SELECT id FROM provider_offers WHERE provider_id='{str(uuid.UUID(supplier))}' AND model_alias='package-video'"))
 print('real management configuration passed',flush=True)
 video=smoke.PACKAGE_VIDEO.create_video(smoke.request,organization,
  after_submit=lambda:smoke.PACKAGE_VIDEO.replace_fixture_customer_rate(smoke.request,organization,configuration))
 smoke.PACKAGE_VIDEO.assert_replacement_rate_effective(smoke.request,video)
 smoke.PACKAGE_VIDEO.create_video_reader(smoke.request,organization,video)
 smoke.PACKAGE_VIDEO.assert_video_activity_reconciled(smoke.request,video)
 uncertain=smoke.PACKAGE_VIDEO.create_uncertain_video(smoke.request,configuration,lambda organization:smoke.initialize_prepaid_account(organization,"package-uncertain-settled"))
 before_unknown=counts();smoke.PACKAGE_VIDEO.assert_uncertain_video_retained(smoke.request,uncertain);assert counts()==before_unknown
 smoke.assert_prepaid_reconciled(organization,[video['id']]);first_counts=counts();assert first_counts['creates']==2 and first_counts['queries']>=3
 print('video submission and customer reconciliation passed',flush=True)
 stop();start()
 smoke.PACKAGE_VIDEO.assert_video_recovered(smoke.request,video);smoke.PACKAGE_VIDEO.assert_video_activity_reconciled(smoke.request,video);smoke.PACKAGE_VIDEO.assert_replacement_rate_effective(smoke.request,video);smoke.assert_prepaid_reconciled(organization,[video['id']]);restart_counts=counts();assert restart_counts['creates']==2 and restart_counts['queries']==first_counts['queries']+1
 before_unknown=counts();smoke.PACKAGE_VIDEO.assert_uncertain_video_retained(smoke.request,uncertain);assert counts()==before_unknown
 print('native gateway restart and uncertain liability retention passed',flush=True)
 stop()
 backup=root/'backup.sql'
 with backup.open('wb') as output:subprocess.run(['pg_dump','-h','127.0.0.1','-p',str(pgport),'-U','postgres','-d','postgres','--no-owner','--no-privileges'],env=env,stdout=output,stderr=subprocess.DEVNULL,check=True)
 sql('CREATE DATABASE restored_video')
 subprocess.run(['psql','-h','127.0.0.1','-p',str(pgport),'-U','postgres','-d','restored_video','-v','ON_ERROR_STOP=1','-f',str(backup)],env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,check=True)
 env['NIU_DATABASE_URL']=env['NIU_DATABASE_URL'].removesuffix('/postgres')+'/restored_video'
 smoke.database_value=lambda statement:sql(statement,'restored_video')
 start();smoke.PACKAGE_VIDEO.assert_video_recovered(smoke.request,video);smoke.PACKAGE_VIDEO.assert_video_activity_reconciled(smoke.request,video);smoke.PACKAGE_VIDEO.assert_replacement_rate_effective(smoke.request,video);smoke.assert_prepaid_reconciled(organization,[video['id']]);restored_counts=counts();assert restored_counts['creates']==2 and restored_counts['queries']==restart_counts['queries']+1
 before_unknown=counts();smoke.PACKAGE_VIDEO.assert_uncertain_video_retained(smoke.request,uncertain);assert counts()==before_unknown
 print('native backup/restore, exactly-once charge and uncertain liability retention passed',flush=True)
 smoke.PACKAGE_VIDEO.assert_video_result_state(smoke.request,video)
 smoke.PACKAGE_VIDEO.delete_video_results(smoke.request,video)
 smoke.PACKAGE_VIDEO.assert_video_result_state(smoke.request,video,'unavailable')
 smoke.PACKAGE_VIDEO.assert_video_recovered(smoke.request,video)
 smoke.PACKAGE_VIDEO.assert_video_result_state(smoke.request,video,'unavailable')
 stop();start()
 smoke.PACKAGE_VIDEO.assert_video_result_state(smoke.request,video,'unavailable')
 smoke.assert_prepaid_reconciled(organization,[video['id']])
 print('restored result metadata and permanent deletion survived refresh and restart',flush=True)
 smoke.PACKAGE_VIDEO.rotate_fixture_credential(smoke.request,configuration,secrets.token_urlsafe(32))
 before_rotation=counts()
 smoke.PACKAGE_VIDEO.assert_rotated_recovery_blocked(smoke.request,video)
 smoke.PACKAGE_VIDEO.assert_video_activity_reconciled(smoke.request,video)
 smoke.PACKAGE_VIDEO.assert_uncertain_video_retained(smoke.request,uncertain)
 assert counts()==before_rotation, 'rotated recovery contacted upstream'
 smoke.assert_prepaid_reconciled(organization,[video['id']])
 print('credential rotation fail-closed recovery and preserved billing passed',flush=True)
 smoke.PACKAGE_VIDEO.revoke_video_reader(smoke.request,video)
 smoke.PACKAGE_VIDEO.assert_revoked_video_reader_denied(smoke.request,video)
 stop();start()
 smoke.PACKAGE_VIDEO.assert_revoked_video_reader_denied(smoke.request,video)
 smoke.PACKAGE_VIDEO.assert_uncertain_video_retained(smoke.request,uncertain)
 smoke.assert_prepaid_reconciled(organization,[video['id']])
 assert counts()==before_rotation, 'revoked reader checks contacted upstream'
 print('reader revocation persisted across restart without changing liability or billing',flush=True)
 smoke.PACKAGE_VIDEO.revoke_video_key(smoke.request,video)
 smoke.PACKAGE_VIDEO.assert_revoked_video_key_denied(smoke.request,video)
 stop();start()
 smoke.PACKAGE_VIDEO.assert_revoked_video_key_denied(smoke.request,video)
 smoke.PACKAGE_VIDEO.assert_uncertain_video_retained(smoke.request,uncertain)
 smoke.assert_prepaid_reconciled(organization,[video['id']])
 assert counts()==before_rotation, 'revoked video key contacted upstream'
 print('video API key revocation persisted across restart without changing liability or billing',flush=True)

except urllib.error.HTTPError as error:
 print('API failure status:',error.code,flush=True)
 # Error detail stays in the private diagnostic directory, never direct tool output.
 (root/'api-error.json').write_bytes(error.read())
 raise RuntimeError('native package video API rejected a setup or lifecycle request') from None
finally:
 try:
  stop()
 finally:
  try:
   cleanup.stop_process(provider)
  finally:
   try:
    cleanup.stop_postgres(pgdata)
   finally:
    for handle in handles:handle.close()
    print('private diagnostics:',root,flush=True)
