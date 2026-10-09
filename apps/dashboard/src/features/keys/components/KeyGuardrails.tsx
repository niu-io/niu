import { useEffect, useRef, useState } from 'react';
import KeyGuardrailHistory from './KeyGuardrailHistory';
import { Link } from 'react-router';
import { IconChevronDown as ChevronDown } from "@tabler/icons-react";
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem } from '@/components/ui/dropdown-menu';
import { request, VendorRequestError } from '@/features/vendors/api';

type Access = { mode: 'inherit' | 'allow_all' | 'allow_list' | 'deny_all'; values?: string[] };
type Rule = { pattern?: string; preset?: string; action: string };
type Policy = { name: string; models: Access; providers: Access; input_rules?: Rule[]; input_detectors?: unknown[]; output?: { mode: string; rules: Rule[] } };
const ruleText = (rule: Rule, observe = false) => `${observe ? 'Observe' : rule.action === 'block' ? 'Block' : 'Redact'} · ${rule.preset === 'email_v1' ? 'Email addresses' : rule.preset === 'api_key_prefix_v1' ? 'API key prefixes' : rule.preset === 'niu_api_key_v1' ? 'Niu API keys' : rule.pattern || 'Unsupported rule'}`;
type Assignment = { assignment_revision: number; policy_revision: number | null; policy: Policy | null };
type Version = { revision: number; policy_name: string; active: boolean };
type Page = { data: Version[]; next_cursor: number | null };
const accessText = (access: Access) => access.mode === 'allow_list' ? access.values?.join(', ') || 'Block all' : access.mode === 'deny_all' ? 'Block all' : 'No additional restriction';

export default function KeyGuardrails({ token, endpoint, workspaceEndpoint, root, canWrite, active }: {
  token: string; endpoint: string; workspaceEndpoint: string; root: string; canWrite: boolean; active: boolean;
}) {
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [head, setHead] = useState<{ revision: number; policy: Policy } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [open, setOpen] = useState(false);
  const [versions, setVersions] = useState<Version[]>([]);
  const [cursor, setCursor] = useState<number | null>(null);
  const [choice, setChoice] = useState('none');
  const [selected, setSelected] = useState<Policy | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const [editError, setEditError] = useState('');
  const [listError, setListError] = useState('');
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [notice, setNotice] = useState('');
  const listRequest = useRef<AbortController | null>(null);
  const changePolicyButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(''); setNotice('');
    void Promise.all([
      request<{ data: Assignment | null }>(token, endpoint, 'GET', undefined, controller.signal),
      request<{ data: { revision: number; policy: Policy } | null }>(token, workspaceEndpoint, 'GET', undefined, controller.signal),
    ]).then(([key, workspace]) => {
      if (!controller.signal.aborted) { setAssignment(key.data); setHead(workspace.data); }
    }).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Could not load Guardrails.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [token, endpoint, workspaceEndpoint, reload]);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController(); listRequest.current = controller;
    setVersions([]); setCursor(null); setListLoading(true); setEditError(''); setListError(''); setConflict(false);
    setChoice(assignment?.policy_revision ? String(assignment.policy_revision) : 'none');
    void request<Page>(token, `${workspaceEndpoint}/history`, 'GET', undefined, controller.signal)
      .then(page => { if (!controller.signal.aborted) { setVersions(page.data); setCursor(page.next_cursor); } })
      .catch(cause => { if (!controller.signal.aborted) setListError(cause instanceof Error ? cause.message : 'Could not load saved policies.'); })
      .finally(() => { if (!controller.signal.aborted) setListLoading(false); });
    return () => { controller.abort(); listRequest.current?.abort(); };
  }, [open, token, workspaceEndpoint, assignment]);

  useEffect(() => {
    setSelected(null);
    if (!open || choice === 'none') { setDetailLoading(false); return; }
    const controller = new AbortController(); setDetailLoading(true); setEditError('');
    void request<{ data: { revision: number; policy: Policy } }>(token, `${workspaceEndpoint}/revisions/${choice}`, 'GET', undefined, controller.signal)
      .then(result => { if (!controller.signal.aborted) setSelected(result.data.policy); })
      .catch(cause => { if (!controller.signal.aborted) setEditError(cause instanceof Error ? cause.message : 'Could not load this policy version.'); })
      .finally(() => { if (!controller.signal.aborted) setDetailLoading(false); });
    return () => controller.abort();
  }, [open, choice, token, workspaceEndpoint]);

  async function loadMore() {
    if (!cursor || listLoading) return;
    const controller = new AbortController(); listRequest.current = controller;
    setListLoading(true); setListError('');
    try {
      const page = await request<Page>(token, `${workspaceEndpoint}/history?before_revision=${cursor}`, 'GET', undefined, controller.signal);
      if (!controller.signal.aborted) { setVersions(current => [...current, ...page.data]); setCursor(page.next_cursor); }
    } catch (cause) { if (!controller.signal.aborted) setListError(cause instanceof Error ? cause.message : 'Could not load older versions.'); }
    finally { if (!controller.signal.aborted) setListLoading(false); }
  }

  async function save() {
    if (!canWrite || !active || saving || conflict || loading || detailLoading || (choice !== 'none' && !selected)) return;
    setSaving(true); setEditError('');
    try {
      const result = await request<{ assignment_revision: number }>(token, endpoint, 'PUT', {
        policy_revision: choice === 'none' ? null : Number(choice),
        expected_assignment_revision: assignment?.assignment_revision ?? 0,
      });
      setOpen(false);
      setAssignment({ assignment_revision: result.assignment_revision, policy_revision: choice === 'none' ? null : Number(choice), policy: selected });
      setNotice(choice === 'none' ? 'Key assignment removed. Workspace Guardrails still apply.' : 'Saved policy version assigned to this key.');
    } catch (cause) {
      if (cause instanceof VendorRequestError && cause.status === 409) setConflict(true);
      setEditError(cause instanceof VendorRequestError && cause.status === 409 ? 'This assignment or key changed. Reload before trying again.' : cause instanceof Error ? cause.message : 'Could not save the assignment.');
    } finally { setSaving(false); }
  }

  const unchanged = choice === (assignment?.policy_revision ? String(assignment.policy_revision) : 'none');
  const choiceLabel = choice === 'none' ? 'No additional key policy' : `${versions.find(version => String(version.revision) === choice)?.policy_name || selected?.name || assignment?.policy?.name || 'Saved policy'} · Version ${choice}`;
  return <Card className="key-guardrails-card">
    <CardHeader><CardTitle>Guardrails</CardTitle><CardDescription>Workspace rules always apply. A saved policy version can add restrictions for this key.</CardDescription></CardHeader>
    <CardContent className="key-guardrails-content">
      {loading ? <p role="status">Loading Guardrails…</p> : error ? <Alert variant="destructive"><AlertDescription>{error} <Button variant="outline" onClick={() => setReload(value => value + 1)}>Reload Guardrails</Button></AlertDescription></Alert> : <>
        <div className="key-guardrails-row"><div><strong>Workspace</strong><p>{head ? `${head.policy.name} · Version ${head.revision}` : 'No workspace policy configured'}</p></div><Button asChild variant="outline"><Link to={`${root}/guardrails/policy`}>View policy</Link></Button></div>
        <div className="key-guardrails-row"><div><strong>API key</strong><p>{assignment?.policy_revision ? `${assignment.policy?.name || 'Saved policy'} · Version ${assignment.policy_revision}` : 'No additional key policy'}</p></div>{canWrite && active && <Button ref={changePolicyButton} variant="outline" onClick={() => setOpen(true)}>Change key policy</Button>}</div>
        <KeyGuardrailHistory token={token} endpoint={endpoint} />
        {!active && <p className="page-subtitle">Assignments cannot be changed for an inactive key.</p>}
        {notice && <p role="status">{notice}</p>}
      </>}
      <Dialog open={open} onOpenChange={value => { if (!saving) setOpen(value); }}>
        <DialogContent className="key-guardrails-dialog" onCloseAutoFocus={event => {if (changePolicyButton.current) {event.preventDefault();changePolicyButton.current.focus();}}}><DialogHeader><DialogTitle>Key Guardrails</DialogTitle><DialogDescription>Assign a saved version. Later workspace policy edits do not update this key assignment. Mandatory workspace rules continue to apply.</DialogDescription></DialogHeader>
          <Label htmlFor="key-policy-choice">Saved policy version</Label>
          <DropdownMenu><DropdownMenuTrigger asChild><Button id="key-policy-choice" variant="outline" className="key-guardrails-choice" disabled={saving || listLoading || conflict}>{choiceLabel}<ChevronDown size={16} /></Button></DropdownMenuTrigger><DropdownMenuContent align="start" className="key-guardrails-menu"><DropdownMenuRadioGroup value={choice} onValueChange={setChoice}><DropdownMenuRadioItem value="none">No additional key policy</DropdownMenuRadioItem>{versions.map(version => <DropdownMenuRadioItem key={version.revision} value={String(version.revision)}>{version.policy_name} · Version {version.revision}{version.active ? ' (workspace current)' : ''}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu>
          {listLoading && <p role="status">Loading saved versions…</p>}
          {cursor && <Button variant="outline" disabled={listLoading || saving || conflict} onClick={() => void loadMore()}>Load older versions</Button>}
          {detailLoading ? <p role="status">Loading policy…</p> : selected && <dl className="key-guardrails-summary"><div><dt>Models</dt><dd>{accessText(selected.models)}</dd></div><div><dt>Providers</dt><dd>{accessText(selected.providers)}</dd></div><div><dt>Input rules</dt><dd>{selected.input_rules?.length ? selected.input_rules.map((rule, index) => <p key={index}>{ruleText(rule)}</p>) : 'None'}</dd></div>{Boolean(selected.input_detectors?.length) && <div><dt>External input checks</dt><dd>{selected.input_detectors?.length} required {selected.input_detectors?.length === 1 ? "check" : "checks"} · matches and unavailable services block requests</dd></div>}<div><dt>Output rules</dt><dd>{selected.output ? <><p>{selected.output.mode === "observe_only" ? "Observe only · response unchanged" : selected.output.mode === "buffered_full" ? "Buffered responses required" : "Output mode unavailable"}</p>{selected.output.rules.map((rule, index) => <p key={index}>{ruleText(rule, selected.output?.mode === "observe_only")}</p>)}</> : 'None'}</dd></div></dl>}
          {choice !== 'none' && selected && <Button asChild variant="link"><Link to={`${root}/guardrails/history`}>Inspect saved rules in policy history</Link></Button>}
          {listError && <Alert variant="destructive"><AlertDescription>{listError} <Button variant="outline" disabled={saving} onClick={() => { setOpen(false); }}>Close and retry</Button></AlertDescription></Alert>}
          {editError && <Alert variant="destructive"><AlertDescription>{editError}</AlertDescription></Alert>}
          <DialogFooter>{conflict ? <Button onClick={() => { setOpen(false); setReload(value => value + 1); }}>Reload Guardrails</Button> : <><Button variant="outline" disabled={saving} onClick={() => setOpen(false)}>Cancel</Button><Button disabled={saving || unchanged || listLoading || detailLoading || !!editError || !!listError || (choice !== 'none' && !selected)} onClick={() => void save()}>{saving ? 'Saving…' : 'Save assignment'}</Button></>}</DialogFooter>
        </DialogContent>
      </Dialog>
    </CardContent>
  </Card>;
}
