import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { RefreshCw, RotateCw, KeyRound, Ban } from "lucide-react";
import { useCallback, useEffect, useState, useRef, type FormEvent } from 'react';

type Named = { id: string; name: string };
type Key = Named & { allowed_models: string[]; expires_at_ms: number; revoked: boolean; expired: boolean };
type Issued = { id: string; token: string };

export default function KeysView({ token, models, canWrite, canCreateOrganization, canCreateProject }: {
  token: string;
  models: string[];
  canWrite: boolean;
  canCreateOrganization: boolean;
  canCreateProject: boolean;
}) {
  const [organizations, setOrganizations] = useState<Named[]>([]);
  const [projects, setProjects] = useState<Named[]>([]);
  const [organization, setOrganization] = useState('');
  const [project, setProject] = useState('');
  const [keys, setKeys] = useState<Key[]>([]);
  const [organizationName, setOrganizationName] = useState('');
  const [projectName, setProjectName] = useState('');
  const [name, setName] = useState('');
  const [grants, setGrants] = useState<string[]>([]);
  const [firstKeyName, setFirstKeyName] = useState('My application');
  const [firstKeyModels, setFirstKeyModels] = useState<string[]>(() => models[0] ? [models[0]] : []);
  const [organizationsLoading, setOrganizationsLoading] = useState(true);
  const [days, setDays] = useState(30);
  const [secret, setSecret] = useState<Issued | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const mutationRevision = useRef(0);

  const request = useCallback(async <T,>(path: string, method = 'GET', body?: unknown, signal?: AbortSignal): Promise<T> => {
    const response = await fetch(path, { method, signal, headers: { authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new Error(payload?.error?.message ?? `Request failed (${response.status})`);
    }
    return response.status === 204 ? undefined as T : await response.json() as T;
  }, [token]);
  const projectPath = `/admin/v1/organizations/${organization}/projects`;
  const keyPath = `${projectPath}/${project}/keys`;

  useEffect(() => {
    const abort = new AbortController();
    const revision = mutationRevision.current;
    request<{ data: Named[] }>('/admin/v1/organizations', 'GET', undefined, abort.signal)
      .then(value => { if (!abort.signal.aborted && revision === mutationRevision.current) setOrganizations(value.data); })
      .catch(e => { if (!abort.signal.aborted && revision === mutationRevision.current) setError(String(e.message)); })
      .finally(() => { if (!abort.signal.aborted && revision === mutationRevision.current) setOrganizationsLoading(false); });
    return () => abort.abort();
  }, [request]);
  useEffect(() => {
    if (!organization) return;
    const abort = new AbortController();
    const revision = mutationRevision.current;
    request<{ data: Named[] }>(projectPath, 'GET', undefined, abort.signal)
      .then(value => { if (!abort.signal.aborted && revision === mutationRevision.current) setProjects(value.data); })
      .catch(e => { if (!abort.signal.aborted && revision === mutationRevision.current) setError(String(e.message)); });
    return () => abort.abort();
  }, [organization, projectPath, request]);
  useEffect(() => {
    if (!project) return;
    const abort = new AbortController();
    const revision = mutationRevision.current;
    request<{ data: Key[] }>(keyPath, 'GET', undefined, abort.signal)
      .then(value => { if (!abort.signal.aborted && revision === mutationRevision.current) setKeys(value.data); })
      .catch(e => { if (!abort.signal.aborted && revision === mutationRevision.current) setError(String(e.message)); });
    return () => abort.abort();
  }, [project, keyPath, request]);

  async function mutate(action: () => Promise<void>) {
    if (busy) return;
    mutationRevision.current += 1;
    setBusy(true); setError('');
    try { await action(); } catch (e) { setError(e instanceof Error ? e.message : 'Request failed'); }
    finally { setBusy(false); }
  }
  function submit(event: FormEvent, action: () => Promise<void>) { event.preventDefault(); void mutate(action); }
  async function reloadKeys() { setKeys((await request<{ data: Key[] }>(keyPath)).data); }

  async function createFirstWorkspace() {
    const createdOrganization = await request<Named>('/admin/v1/organizations', 'POST', { name: 'Personal workspace' });
    setOrganizations(previous => [...previous, createdOrganization]);
    setOrganization(createdOrganization.id);
    mutationRevision.current += 1;

    const createdProject = await request<Named>(
      `/admin/v1/organizations/${createdOrganization.id}/projects`,
      'POST',
      { name: 'Default project' },
    );
    mutationRevision.current += 1;
    setProjects([createdProject]);
    setProject(createdProject.id);

    const firstKeyPath = `/admin/v1/organizations/${createdOrganization.id}/projects/${createdProject.id}/keys`;
    const issued = await request<Issued>(firstKeyPath, 'POST', {
      name: firstKeyName.trim(),
      allowed_models: firstKeyModels,
      ttl_seconds: 30 * 86400,
    });
    mutationRevision.current += 1;
    setSecret(issued);
    setName('');
    const listed = await request<{ data: Key[] }>(firstKeyPath).catch(() => null);
    if (listed) setKeys(listed.data);
  }

  return <>
    <div className="page-heading"><div><p className="eyebrow">ACCESS CONTROL</p><h1>API keys</h1><p className="page-subtitle">Issue project-scoped keys with explicit model permissions and expiry.</p></div></div>
    {error && <p role="alert" className="error-text">{error}</p>}
    {!organizationsLoading && organizations.length === 0 && models.length > 0 && canWrite && canCreateOrganization && <section className="panel first-key-card" aria-labelledby="first-key-title">
      <div className="first-key-heading"><span className="first-key-icon"><KeyRound size={18} /></span><div><p className="eyebrow">FIRST RUN</p><h2 id="first-key-title">Create a workspace and your first key</h2><p>We’ll set up a personal workspace and default project, then issue a scoped key for your app.</p></div></div>
      <form onSubmit={event => submit(event, createFirstWorkspace)}>
        <div className="first-key-fields"><Label>Key name<Input required maxLength={200} value={firstKeyName} onChange={event => setFirstKeyName(event.target.value)} /></Label><div className="first-key-expiry"><span>Expiry</span><strong>30 days</strong><small>Change it later when issuing other keys.</small></div></div>
        <fieldset className="first-key-models"><legend>Allow this key to use</legend>{models.map(model => <Label className="model-grant" key={model} htmlFor={`first-grant-${model}`}><Checkbox id={`first-grant-${model}`} checked={firstKeyModels.includes(model)} onCheckedChange={checked => setFirstKeyModels(previous => checked === true ? [...previous, model] : previous.filter(value => value !== model))} />{model}</Label>)}</fieldset>
        <div className="first-key-actions"><span>Secret shown once · provider credentials stay on the server</span><Button disabled={busy || !firstKeyName.trim() || !firstKeyModels.length} type="submit">{busy ? 'Creating…' : 'Create workspace and key'}</Button></div>
      </form>
    </section>}
    {!organizationsLoading && organizations.length === 0 && models.length > 0 && (!canWrite || !canCreateOrganization) && <section className="panel keys-controls" role="status">
      <h2>No organization is available</h2><p>An installation administrator must create an organization and project before this session can issue API keys.</p>
    </section>}
    {(organizations.length > 0 || models.length === 0) && <section className="panel keys-controls">
      <div className="key-scope-grid">
        <Label htmlFor="organization">Organization<NativeSelect id="organization" disabled={busy} value={organization} onChange={e => { setOrganization(e.target.value); setProject(''); setKeys([]); setSecret(null); }}><NativeSelectOption value="">Select organization</NativeSelectOption>{organizations.map(x => <NativeSelectOption value={x.id} key={x.id}>{x.name}</NativeSelectOption>)}</NativeSelect></Label>
        <Label htmlFor="project">Project<NativeSelect id="project" disabled={busy || !organization} value={project} onChange={e => { setProject(e.target.value); setKeys([]); setSecret(null); }}><NativeSelectOption value="">Select project</NativeSelectOption>{projects.map(x => <NativeSelectOption value={x.id} key={x.id}>{x.name}</NativeSelectOption>)}</NativeSelect></Label>
      </div>
      {(canCreateOrganization || canCreateProject) && <div className="key-scope-grid">
        {canCreateOrganization && <form onSubmit={e => submit(e, async () => {
          const created = await request<Named>('/admin/v1/organizations', 'POST', { name: organizationName });
          setOrganizations(previous => [...previous, created]); setOrganization(created.id); setOrganizationName('');
        })}><Label>New organization<Input required maxLength={200} value={organizationName} onChange={e => setOrganizationName(e.target.value)} /></Label><Button variant="outline" disabled={busy || !organizationName.trim()}>Create organization</Button></form>}
        {canCreateProject && <form onSubmit={e => submit(e, async () => {
          const created = await request<Named>(projectPath, 'POST', { name: projectName });
          setProjects(previous => [...previous, created]); setProject(created.id); setProjectName('');
        })}><Label>New project<Input required maxLength={200} disabled={!organization} value={projectName} onChange={e => setProjectName(e.target.value)} /></Label><Button variant="outline" disabled={busy || !organization || !projectName.trim()}>Create project</Button></form>}
      </div>}
      {!canWrite && <p className="operator-read-only-note">This session can review keys but does not have permission to create or revoke them.</p>}
    </section>}
    {canWrite && project && <>
      <section className="panel keys-controls"><h2>Issue a key</h2><form onSubmit={e => submit(e, async () => {
        const issued = await request<Issued>(keyPath, 'POST', { name, allowed_models: grants, ttl_seconds: days * 86400 });
        setSecret(issued); setName(''); await reloadKeys();
      })}>
        <div className="key-scope-grid"><Label>Key name<Input required maxLength={200} value={name} onChange={e => setName(e.target.value)} /></Label><Label>Expires in days<Input required type="number" min={1} max={365} step={1} value={days} onChange={e => setDays(Number(e.target.value))} /></Label></div>
        <fieldset><legend>Allowed models</legend>{models.map(model => <Label className="model-grant" key={model} htmlFor={'grant-' + model}><Checkbox id={'grant-' + model} checked={grants.includes(model)} onCheckedChange={checked => setGrants(previous => checked === true ? [...previous, model] : previous.filter(x => x !== model))} />{model}</Label>)}</fieldset>
        <Button disabled={busy || !name.trim() || !grants.length}><KeyRound />Issue key</Button>
      </form></section>
      {secret && <section className="panel keys-controls" role="status"><h2>Save your key</h2><p>This secret is shown once and stays only in this tab. Dismiss it after saving.</p><Label>New API key<Input className="mono" readOnly value={secret.token} aria-label="New API key" onFocus={e => e.target.select()} /></Label><Button variant="outline" type="button" onClick={() => setSecret(null)}>Dismiss secret</Button></section>}
    </>}
    {project && <section className="panel"><div className="panel-heading"><div><h2>Project keys</h2><p>Rotation revokes the old key immediately and preserves permissions and expiry.</p></div><Button type="button" variant="outline" disabled={busy} onClick={() => void mutate(reloadKeys)}><RefreshCw />Refresh</Button></div>
      <div className="table-wrap"><Table><TableHeader><TableRow><TableHead>NAME</TableHead><TableHead>MODELS</TableHead><TableHead>EXPIRES</TableHead><TableHead>STATUS</TableHead><TableHead>ACTIONS</TableHead></TableRow></TableHeader><TableBody>{keys.map(key => <TableRow key={key.id}><TableCell>{key.name}</TableCell><TableCell>{key.allowed_models.join(', ')}</TableCell><TableCell>{new Date(key.expires_at_ms).toLocaleString()}</TableCell><TableCell>{key.revoked ? 'Revoked' : key.expired ? 'Expired' : 'Active'}</TableCell><TableCell className="key-actions">{canWrite ? <><Button type="button" variant="ghost" size="sm" disabled={busy || key.revoked || key.expired} onClick={() => void mutate(async () => { setSecret(await request<Issued>(keyPath + '/' + key.id + '/rotate', 'POST')); await reloadKeys(); })}><RotateCw />Rotate</Button><Button type="button" variant="ghost" size="sm" disabled={busy || key.revoked} onClick={() => void mutate(async () => { await request(keyPath + '/' + key.id, 'DELETE'); if (secret?.id === key.id) setSecret(null); await reloadKeys(); })}><Ban />Revoke</Button></> : <span className="operator-read-only-note">Read only</span>}</TableCell></TableRow>)}</TableBody></Table>{keys.length === 0 && <p className="empty-state">No keys in this project.</p>}</div>
    </section>}
  </>;
}
