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
import { Textarea } from '@/components/ui/textarea';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuCheckboxItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { keyRequest, KeyRequestError, keyStatus, keyLastUsed, projectKeyPath, workspaceKeyPath, workspacePath, type ProjectKey } from '../api';
import GatewayActivity from '@/features/executions/components/GatewayActivity';
import KeyGuardrails from './KeyGuardrails';
import KeyLimits from './KeyLimits';
import KeySourceAccess from './KeySourceAccess';
import KeySpendingLimits from './KeySpendingLimits';

type Scope = { organizationId: string; projectId: string };

export default function KeyDetailView({ token, models, canWrite, canConfigureSpending, initialScope }: {
  token: string;
  models: string[];
  canWrite: boolean;
  canConfigureSpending: boolean;
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
  const [draftRpm, setDraftRpm] = useState('');
  const [draftConcurrent, setDraftConcurrent] = useState('');
  const [draftTpm, setDraftTpm] = useState('');
  const [draftCidrs, setDraftCidrs] = useState('');
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState(false);
  const saveController = useRef<AbortController | null>(null);
  const collectionPath = initialScope ? workspaceKeyPath(initialScope.projectId) : '';
  const adminCollectionPath = initialScope ? projectKeyPath(initialScope.organizationId, initialScope.projectId) : '';

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

  const getKeyRpm = (item?: ProjectKey) => item?.request_rate_limit?.requests_per_minute ?? item?.requests_per_minute ?? null;
  const getKeyConc = (item?: ProjectKey) => item?.concurrency_limit?.max_concurrent_requests ?? item?.max_concurrent_requests ?? null;
  const getKeyTpm = (item?: ProjectKey) => item?.token_rate_limit?.tokens_per_minute ?? item?.tokens_per_minute ?? null;
  const getKeyCidrs = (item?: ProjectKey) => (item?.ip_policy ? item.ip_policy.allowed_cidrs : item?.allowed_cidrs) ?? null;

  function startEdit() {
    if (!key) return;
    const rpm = getKeyRpm(key);
    const conc = getKeyConc(key);
    const tpm = getKeyTpm(key);
    const cidrs = getKeyCidrs(key);
    setDraftName(key.name);
    setDraftModels(key.allowed_models);
    setDraftRpm(rpm !== null ? String(rpm) : '');
    setDraftConcurrent(conc !== null ? String(conc) : '');
    setDraftTpm(tpm !== null ? String(tpm) : '');
    setDraftCidrs(cidrs?.join('\n') ?? '');
    setEditing(true);
    setConflict(false);
    setError('');
    setNotice('');
  }

  const initialRpm = getKeyRpm(key) !== null ? String(getKeyRpm(key)) : '';
  const initialConcurrent = getKeyConc(key) !== null ? String(getKeyConc(key)) : '';
  const initialTpm = getKeyTpm(key) !== null ? String(getKeyTpm(key)) : '';
  const initialCidrs = getKeyCidrs(key)?.join('\n') ?? '';
  const rpmChanged = draftRpm.trim() !== initialRpm;
  const concurrentChanged = draftConcurrent.trim() !== initialConcurrent;
  const tpmChanged = draftTpm.trim() !== initialTpm;
  const cidrsChanged = draftCidrs.trim() !== initialCidrs.trim();
  const changed = key && (
    draftName.trim() !== key.name
    || JSON.stringify([...draftModels].sort()) !== JSON.stringify([...key.allowed_models].sort())
    || rpmChanged
    || concurrentChanged
    || tpmChanged
    || cidrsChanged
  );

  async function saveMetadata() {
    if (!key?.revision || !canWrite || !changed || saving || conflict || !draftName.trim() || !draftModels.length) return;
    const body: Record<string, unknown> = {
      name: draftName.trim(),
      allowed_models: draftModels,
      expected_revision: key.revision,
    };
    if (rpmChanged) {
      if (draftRpm.trim() && !/^\d+$/.test(draftRpm.trim())) {
        setError('Requests per minute must be a whole number.');
        return;
      }
      body.request_rate_limit = { requests_per_minute: draftRpm.trim() ? Number(draftRpm.trim()) : null };
    }
    if (concurrentChanged) {
      if (draftConcurrent.trim() && !/^\d+$/.test(draftConcurrent.trim())) {
        setError('Concurrent requests must be a whole number.');
        return;
      }
      body.concurrency_limit = { max_concurrent_requests: draftConcurrent.trim() ? Number(draftConcurrent.trim()) : null };
    }
    if (tpmChanged) {
      if (draftTpm.trim() && !/^\d+$/.test(draftTpm.trim())) {
        setError('Tokens per minute must be a whole number.');
        return;
      }
      body.token_rate_limit = { tokens_per_minute: draftTpm.trim() ? Number(draftTpm.trim()) : null };
    }
    if (cidrsChanged) {
      const entries = draftCidrs.split('\n').map(value => value.trim()).filter(Boolean);
      body.ip_policy = { allowed_cidrs: entries.length ? entries : null };
    }

    const controller = new AbortController(); saveController.current = controller;
    setSaving(true);setError('');
    try {
      const result = await keyRequest<ProjectKey & {revision:number}>(token, `${collectionPath}/${encodeURIComponent(key.id)}`, 'PATCH', body, controller.signal);
      if (controller.signal.aborted) return;
      setKeys(current => current.map(item => item.id === key.id ? {
        ...item,
        ...result,
        name: draftName.trim(),
        allowed_models: draftModels,
        revision: result.revision ?? (key.revision ? key.revision + 1 : 1),
      } : item));
      setEditing(false);setNotice('API key updated.');
      if (rpmChanged || concurrentChanged || tpmChanged || cidrsChanged) {
        setRevision(value => value + 1);
      }
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
          <div className="grid gap-2 sm:grid-cols-[1fr_20rem] sm:items-center"><Label htmlFor="key-edit-rpm">Requests per minute</Label><Input id="key-edit-rpm" inputMode="numeric" placeholder="Unlimited" value={draftRpm} disabled={saving || conflict} onChange={event => setDraftRpm(event.target.value)} /></div>
          <div className="grid gap-2 sm:grid-cols-[1fr_20rem] sm:items-center"><Label htmlFor="key-edit-concurrent">Concurrent requests</Label><Input id="key-edit-concurrent" inputMode="numeric" placeholder="Unlimited" value={draftConcurrent} disabled={saving || conflict} onChange={event => setDraftConcurrent(event.target.value)} /></div>
          <div className="grid gap-2 sm:grid-cols-[1fr_20rem] sm:items-center"><Label htmlFor="key-edit-tpm">Tokens per minute</Label><Input id="key-edit-tpm" inputMode="numeric" placeholder="Unlimited" value={draftTpm} disabled={saving || conflict} onChange={event => setDraftTpm(event.target.value)} /></div>
          <div className="grid gap-2 sm:grid-cols-[1fr_20rem] sm:items-start"><Label htmlFor="key-edit-cidrs" className="pt-2">Allowed IPs or CIDRs</Label><Textarea id="key-edit-cidrs" rows={2} placeholder="Unlimited (one IP or CIDR per line)" className="font-mono text-xs" value={draftCidrs} disabled={saving || conflict} onChange={event => setDraftCidrs(event.target.value)} /></div>
          <div className="flex flex-wrap justify-end gap-2">{conflict ? <Button type="button" onClick={() => {setEditing(false);setConflict(false);setRevision(value => value+1);}}>Reload key</Button> : <Button type="submit" disabled={saving || !changed || !draftName.trim() || !draftModels.length}>{saving ? 'Saving…' : 'Save changes'}</Button>}<Button type="button" variant="ghost" disabled={saving} onClick={() => {restoreEditFocus.current=true;setEditing(false);setConflict(false);setError('');}}>Cancel</Button></div>
        </form>}
        <dl className="key-detail-facts"><div><dt>Allowed models</dt><dd>{key.allowed_models.includes('*') ? 'All configured models' : key.allowed_models.length ? key.allowed_models.join(', ') : 'None'}</dd></div><div><dt>Expires</dt><dd>{key.expires_at_ms === null ? 'Never' : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(key.expires_at_ms))}</dd></div><div><dt>Last used</dt><dd>{keyLastUsed(key)}</dd></div></dl>
        {canWrite && !key.revoked && !editing && <div className="key-revoke-actions">
          {!editing && !key.expired && key.revision && <Button ref={editButtonRef} type="button" variant="outline" onClick={startEdit}>Edit key</Button>}
          {!confirmRevoke
            ? <Button type="button" variant="outline" onClick={() => setConfirmRevoke(true)}><Ban size={15} />Revoke key</Button>
            : <div role="group" aria-label="Confirm API key revocation"><span>Revoke this key now?</span><Button type="button" variant="destructive" disabled={revoking} onClick={() => void revoke()}>{revoking ? 'Revoking…' : 'Confirm revoke'}</Button><Button type="button" variant="outline" disabled={revoking} onClick={() => setConfirmRevoke(false)}>Keep key</Button></div>}
        </div>}
      </section>
      {initialScope && <KeyGuardrails
        key={`${token}:${key.id}:${revision}:guardrails`}
        token={token}
        endpoint={`${adminCollectionPath}/${encodeURIComponent(key.id)}/guardrail`}
        workspaceEndpoint={`${adminCollectionPath.replace(/\/keys$/, '')}/guardrails`}
        root={root}
        canWrite={canWrite}
        active={!key.revoked && !key.expired}
      />}
      {initialScope && <KeyLimits key={`${token}:${key.id}:${revision}:limits`} token={token} endpoint={`${adminCollectionPath}/${encodeURIComponent(key.id)}`} canWrite={canWrite} active={!key.revoked && !key.expired} onUpdated={() => setRevision(value => value + 1)} />}
      {initialScope && <KeySourceAccess key={`${token}:${key.id}:${revision}:source`} token={token} endpoint={`${adminCollectionPath}/${encodeURIComponent(key.id)}/ip-policy`} canWrite={canWrite} active={!key.revoked && !key.expired} onUpdated={() => setRevision(value => value + 1)} />}
      {initialScope && <KeySpendingLimits key={`${token}:${key.id}:${revision}:spending`} token={token} endpoint={`${adminCollectionPath}/${encodeURIComponent(key.id)}/spending-limit`} canWrite={canConfigureSpending} active={!key.revoked && !key.expired} />}
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
