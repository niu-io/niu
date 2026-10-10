import { useEffect, useRef, useState } from 'react';
import { IconChevronDown as ChevronDown } from '@tabler/icons-react';
import { IconBan as Ban } from "@tabler/icons-react";
import { IconCheck as Check } from "@tabler/icons-react";
import { IconKey as KeyRound } from "@tabler/icons-react";
import { Link, useLocation, useParams } from 'react-router';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuCheckboxItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { keyRequest, KeyRequestError, keyStatus, keyLastUsed, projectKeyPath, workspacePath, type ProjectKey } from '../api';
import GatewayActivity from '@/features/executions/components/GatewayActivity';
import KeyGuardrails from './KeyGuardrails';
import KeyLimits from './KeyLimits';
import KeySourceAccess from './KeySourceAccess';
import KeySpendingLimits from './KeySpendingLimits';

type Scope = { organizationId: string; projectId: string };

export default function KeyDetailView({ token, models, canWrite, initialScope }: {
  token: string;
  models: string[];
  canWrite: boolean;
  initialScope: Scope | null;
}) {
  const { keyId = '' } = useParams();
  const location = useLocation();
  const root = workspacePath(location.pathname);
  const [keys, setKeys] = useState<ProjectKey[]>([]);
  const [loadedScope, setLoadedScope] = useState('');
  const revokeController = useRef<AbortController | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [loadFailed, setLoadFailed] = useState(false);
  const [revision, setRevision] = useState(0);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState(false);
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const restoreEditFocus = useRef(false);
  useEffect(() => {
    if (!editing && restoreEditFocus.current) {
      restoreEditFocus.current = false;
      editButtonRef.current?.focus();
    }
  }, [editing]);
  const [draftName, setDraftName] = useState('');
  const [draftModels, setDraftModels] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState(false);
  const saveController = useRef<AbortController | null>(null);
  const collectionPath = initialScope ? projectKeyPath(initialScope.organizationId, initialScope.projectId) : '';

  const scopeIdentity = JSON.stringify([token, collectionPath]);

  useEffect(() => {
    setConfirmRevoke(false);setNotice('');setRevoking(false);
    setEditing(false);setSaving(false);setConflict(false);
    return () => { revokeController.current?.abort();saveController.current?.abort(); };
  }, [token, collectionPath, keyId]);

  useEffect(() => {
    if (!collectionPath) { setLoading(false); return; }
    const controller = new AbortController();
    setLoading(true);
    setLoadFailed(false);
    setError('');
    void keyRequest<{ data: ProjectKey[] }>(token, collectionPath, 'GET', undefined, controller.signal)
      .then(result => { if (!controller.signal.aborted) {setKeys(result.data);setLoadedScope(scopeIdentity);} })
      .catch(cause => { if (!controller.signal.aborted) {setLoadFailed(true);setError(cause instanceof Error ? cause.message : 'Could not load this key.');} })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [collectionPath, keyId, token, revision]);

  const key = !loading && !loadFailed && loadedScope === scopeIdentity ? keys.find(item => item.id === keyId) : undefined;

  function startEdit() {
    if (!key) return;
    setDraftName(key.name);setDraftModels(key.allowed_models);setEditing(true);setConflict(false);setError('');setNotice('');
  }

  const changed = key && (draftName.trim() !== key.name || JSON.stringify([...draftModels].sort()) !== JSON.stringify([...key.allowed_models].sort()));
  async function saveMetadata() {
    if (!key?.revision || !canWrite || !changed || saving || conflict || !draftName.trim() || !draftModels.length) return;
    const controller = new AbortController(); saveController.current = controller;
    setSaving(true);setError('');
    try {
      const result = await keyRequest<{revision:number}>(token, `${collectionPath}/${encodeURIComponent(key.id)}`, 'PATCH', {name:draftName.trim(), allowed_models:draftModels, expected_revision:key.revision}, controller.signal);
      if (controller.signal.aborted) return;
      setKeys(current => current.map(item => item.id === key.id ? {...item, name:draftName.trim(), allowed_models:draftModels, revision:result.revision} : item));
      setEditing(false);setNotice('API key updated.');
    } catch (cause) {
      if (!controller.signal.aborted) {
        const stale = cause instanceof KeyRequestError && cause.status === 409;
        setConflict(stale);setError(stale ? 'This key changed. Reload it before editing again.' : cause instanceof Error ? cause.message : 'Could not update this key.');
      }
    } finally { if (!controller.signal.aborted) setSaving(false); }
  }

  async function revoke() {
    if (!canWrite || !collectionPath || !key || revoking) return;
    const controller = new AbortController();
    revokeController.current = controller;
    setRevoking(true);
    setError('');
    try {
      await keyRequest<void>(token, `${collectionPath}/${encodeURIComponent(key.id)}`, 'DELETE', undefined, controller.signal);
      if (controller.signal.aborted) return;
      setKeys(current => current.map(item => item.id === key.id ? { ...item, revoked: true } : item));
      setConfirmRevoke(false);
      setNotice('Key revoked. Requests using it will be rejected.');
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Could not revoke this key.');
    } finally {
      if (!controller.signal.aborted) setRevoking(false);
    }
  }

  return <>
    {error && <div className="grid justify-items-start gap-2"><p role="alert" className="key-page-error">{error}</p>{loadFailed && <Button variant="outline" disabled={loading} onClick={() => setRevision(value => value + 1)}>Retry API key</Button>}</div>}
    {notice && <p role="status" className="key-revoke-notice"><Check size={15} />{notice}</p>}
    {loading && <section className="panel key-detail-card" role="status">Loading key…</section>}
    {!loading && !loadFailed && loadedScope === scopeIdentity && !key && <section className="panel key-detail-card key-not-found"><KeyRound size={20} /><strong>This key is not in the selected workspace.</strong><Link to={`${root}/keys`}>Return to API keys</Link></section>}
    {key && <>
      <section className="panel key-detail-card" aria-label="API key details">
        <div className="key-detail-heading"><div><span className="key-detail-icon"><KeyRound size={18} /></span><div><h2>{key.name}</h2></div></div><Badge variant={key.revoked || key.expired ? 'secondary' : 'outline'}>{keyStatus(key)}</Badge></div>
        {editing && <form className="grid gap-4 py-4" onSubmit={event => {event.preventDefault();void saveMetadata();}}>
          <div className="grid gap-2 sm:grid-cols-[1fr_20rem] sm:items-center"><Label htmlFor="key-edit-name">Name</Label><Input id="key-edit-name" value={draftName} maxLength={200} disabled={saving || conflict} onChange={event => setDraftName(event.target.value)} autoFocus /></div>
          <div className="grid gap-2 sm:grid-cols-[1fr_20rem] sm:items-center"><Label>Model access</Label><DropdownMenu><DropdownMenuTrigger asChild><Button type="button" variant="outline" className="justify-between" disabled={saving || conflict} aria-label="Model access">{draftModels.includes('*') ? 'All configured models' : `${draftModels.length} model${draftModels.length === 1 ? '' : 's'} selected`}<ChevronDown size={16} /></Button></DropdownMenuTrigger><DropdownMenuContent className="max-h-72 max-w-[calc(100vw-2rem)] overflow-y-auto" align="start"><DropdownMenuCheckboxItem checked={draftModels.includes('*')} onSelect={event => event.preventDefault()} onCheckedChange={checked => setDraftModels(checked ? ['*'] : [])}>All configured models</DropdownMenuCheckboxItem><DropdownMenuSeparator />{[...new Set([...models, ...draftModels.filter(model => model !== '*')])].sort().map(model => <DropdownMenuCheckboxItem key={model} checked={draftModels.includes(model)} onSelect={event => event.preventDefault()} onCheckedChange={checked => setDraftModels(current => checked ? [...current.filter(value => value !== '*'), model] : current.filter(value => value !== model))}>{model}</DropdownMenuCheckboxItem>)}</DropdownMenuContent></DropdownMenu></div>
          <div className="flex flex-wrap justify-end gap-2">{conflict ? <Button type="button" onClick={() => {setEditing(false);setConflict(false);setRevision(value => value+1);}}>Reload key</Button> : <Button type="submit" disabled={saving || !changed || !draftName.trim() || !draftModels.length}>{saving ? 'Saving…' : 'Save changes'}</Button>}<Button type="button" variant="ghost" disabled={saving} onClick={() => {restoreEditFocus.current=true;setEditing(false);setConflict(false);setError('');}}>Cancel</Button></div>
        </form>}
        <dl className="key-detail-facts"><div><dt>Allowed models</dt><dd>{key.allowed_models.includes('*') ? 'All configured models' : key.allowed_models.length ? key.allowed_models.join(', ') : 'None'}</dd></div><div><dt>Expires</dt><dd>{new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(key.expires_at_ms))}</dd></div><div><dt>Last used</dt><dd>{keyLastUsed(key)}</dd></div></dl>
        {canWrite && !key.revoked && !editing && <div className="key-revoke-actions">
          {!editing && !key.expired && key.revision && <Button ref={editButtonRef} type="button" variant="outline" onClick={startEdit}>Edit key</Button>}
          {!confirmRevoke
            ? <Button type="button" variant="outline" onClick={() => setConfirmRevoke(true)}><Ban size={15} />Revoke key</Button>
            : <div role="group" aria-label="Confirm API key revocation"><span>Revoke this key now?</span><Button type="button" variant="destructive" disabled={revoking} onClick={() => void revoke()}>{revoking ? 'Revoking…' : 'Confirm revoke'}</Button><Button type="button" variant="outline" disabled={revoking} onClick={() => setConfirmRevoke(false)}>Keep key</Button></div>}
        </div>}
      </section>
      {initialScope && <KeyGuardrails
        key={`${token}:${key.id}:guardrails`}
        token={token}
        endpoint={`${collectionPath}/${encodeURIComponent(key.id)}/guardrail`}
        workspaceEndpoint={`${collectionPath.replace(/\/keys$/, '')}/guardrails`}
        root={root}
        canWrite={canWrite}
        active={!key.revoked && !key.expired}
      />}
      {initialScope && <KeyLimits token={token} endpoint={`${collectionPath}/${encodeURIComponent(key.id)}`} canWrite={canWrite} active={!key.revoked && !key.expired} />}
      {initialScope && <KeySourceAccess key={`${token}:${key.id}:source`} token={token} endpoint={`${collectionPath}/${encodeURIComponent(key.id)}/ip-policy`} canWrite={canWrite} active={!key.revoked && !key.expired} />}
      {initialScope && <KeySpendingLimits token={token} endpoint={`${collectionPath}/${encodeURIComponent(key.id)}/spending-limit`} canWrite={canWrite} active={!key.revoked && !key.expired} />}
      {initialScope && <GatewayActivity
        key={`${token}:${key.id}`}
        compact
        token={token}
        models={models}
        initialScope={initialScope}
        preferredKeyId={key.id}
      />}
    </>}
  </>;
}
