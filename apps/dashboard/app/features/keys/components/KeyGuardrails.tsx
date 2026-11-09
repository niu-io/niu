import { translateUI } from '@/shell/ui-locale';
import { useLocale as useUILocale } from '@/shell/ui-locale';
import DetectorPreview from '@/features/guardrails/DetectorPreview';
import type { DetectorBinding } from '@/features/guardrails/ExternalDetectors';
import { ListRowsSkeleton } from '@/components/PageSkeletons';
import { cachedGet, peekCachedGet } from '@/lib/api-client';
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
import { request, VendorRequestError } from '@/features/providers/api';

type Access = { mode: 'inherit' | 'allow_all' | 'allow_list' | 'deny_all'; values?: string[] };
type Rule = { pattern?: string; preset?: string; action: string };
type Policy = { name: string; models: Access; providers: Access; input_rules?: Rule[]; input_detectors?: DetectorBinding[]; output?: { mode: string; rules: Rule[] } };
const ruleText = (rule: Rule, observe = false) => `${observe ? translateUI('Observe') : rule.action === 'block' ? translateUI('Block') : translateUI('Redact')} · ${rule.preset === 'email_v1' ? translateUI('Email addresses') : rule.preset === 'api_key_prefix_v1' ? translateUI('API key prefixes') : rule.preset === 'niu_api_key_v1' ? translateUI('Niu API keys') : rule.pattern || translateUI('Unsupported rule')}`;
type AssignmentMode = 'fixed' | 'active';
type Assignment = { assignment_revision: number; policy_revision: number | null; mode: AssignmentMode; policy: Policy | null };
type Version = { revision: number; policy_name: string; active: boolean };
type Page = { data: Version[]; next_cursor: number | null };
const accessText = (access: Access) => access.mode === 'allow_list' ? access.values?.join(', ') || translateUI('Block all') : access.mode === 'deny_all' ? translateUI('Block all') : translateUI('No additional restriction');
const followsWorkspace = (assignment: Assignment | null) => !assignment || assignment.mode === 'active' || assignment.policy_revision === null;
const assignmentChoice = (assignment: Assignment | null) => followsWorkspace(assignment) ? 'follow' : String(assignment?.policy_revision);

export default function KeyGuardrails({ token, endpoint, workspaceEndpoint, root, canWrite, active }: {
  token: string; endpoint: string; workspaceEndpoint: string; root: string; canWrite: boolean; active: boolean;
}) {
  const { t: uiT, format: uiF } = useUILocale();
  const initialKeyGuardrail = peekCachedGet<{ data: Assignment | null }>(token, endpoint);
  const initialWorkspaceGuardrail = peekCachedGet<{ data: { revision: number; policy: Policy } | null }>(token, workspaceEndpoint);
  const [assignment, setAssignment] = useState<Assignment | null>(() => initialKeyGuardrail?.data ?? null);
  const [head, setHead] = useState<{ revision: number; policy: Policy } | null>(() => initialWorkspaceGuardrail?.data ?? null);
  const [loading, setLoading] = useState(() => !(initialKeyGuardrail && initialWorkspaceGuardrail));
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [open, setOpen] = useState(false);
  const [versions, setVersions] = useState<Version[]>([]);
  const [cursor, setCursor] = useState<number | null>(null);
  const [choice, setChoice] = useState(() => assignmentChoice(initialKeyGuardrail?.data ?? null));
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
  const following = followsWorkspace(assignment);

  useEffect(() => {
    const controller = new AbortController();
    const hasCached = reload === 0 && Boolean(
      peekCachedGet(token, endpoint) && peekCachedGet(token, workspaceEndpoint),
    );
    setLoading(!hasCached); setError(''); setNotice('');
    void Promise.all([
      cachedGet<{ data: Assignment | null }>(token, endpoint, { signal: controller.signal, force: reload > 0 }),
      cachedGet<{ data: { revision: number; policy: Policy } | null }>(token, workspaceEndpoint, { signal: controller.signal, force: reload > 0 }),
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
    setChoice(assignmentChoice(assignment));
    void request<Page>(token, `${workspaceEndpoint}/history`, 'GET', undefined, controller.signal)
      .then(page => { if (!controller.signal.aborted) { setVersions(page.data); setCursor(page.next_cursor); } })
      .catch(cause => { if (!controller.signal.aborted) setListError(cause instanceof Error ? cause.message : 'Could not load saved policies.'); })
      .finally(() => { if (!controller.signal.aborted) setListLoading(false); });
    return () => { controller.abort(); listRequest.current?.abort(); };
  }, [open, token, workspaceEndpoint, assignment]);

  useEffect(() => {
    setSelected(null);
    if (!open || choice === 'follow') { setDetailLoading(false); return; }
    const controller = new AbortController(); setDetailLoading(true); setEditError('');
    void request<{ data: { revision: number; policy: Policy } }>(token, `${workspaceEndpoint}/revisions/${choice}`, 'GET', undefined, controller.signal)
      .then(result => { if (controller.signal.aborted) return; if (result.data?.revision !== Number(choice) || !result.data.policy) throw new Error('The selected policy version could not be confirmed.'); setSelected(result.data.policy); })
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
    if (!canWrite || !active || saving || conflict || loading || unchanged) return;
    if (choice !== 'follow' && (!selected || listLoading || detailLoading || !!editError || !!listError)) return;
    setSaving(true); setEditError('');
    const expect = assignment?.assignment_revision ?? 0;
    try {
      const result = choice === 'follow'
        ? await request<{ assignment_revision: number }>(token, endpoint, 'PUT', {
            mode: 'active',
            expected_assignment_revision: expect,
          })
        : await request<{ assignment_revision: number }>(token, endpoint, 'PUT', {
            mode: 'fixed',
            policy_revision: Number(choice),
            expected_assignment_revision: expect,
          });
      setOpen(false);
      setAssignment(choice === 'follow'
        ? { assignment_revision: result.assignment_revision, policy_revision: null, mode: 'active', policy: null }
        : { assignment_revision: result.assignment_revision, policy_revision: Number(choice), mode: 'fixed', policy: selected });
      setNotice(choice === 'follow' ? 'This key now follows the workspace policy.' : 'Saved policy version pinned to this key.');
    } catch (cause) {
      if (cause instanceof VendorRequestError && cause.status === 409) setConflict(true);
      setEditError(cause instanceof VendorRequestError && cause.status === 409 ? 'This assignment or key changed. Reload before trying again.' : cause instanceof Error ? cause.message : 'Could not save the assignment.');
    } finally { setSaving(false); }
  }

  const unchanged = choice === 'follow' ? following : assignment?.mode === 'fixed' && assignment.policy_revision !== null && choice === String(assignment.policy_revision);
  const choiceLabel = choice === 'follow'
    ? head ? uiF("Follow workspace policy · Version {0}", [head.revision]) : uiT("Follow workspace policy")
    : uiF("{0} · Version {1}", [versions.find(version => String(version.revision) === choice)?.policy_name || selected?.name || assignment?.policy?.name || uiT('Saved policy'), choice]);
  const detailBlocked = choice !== 'follow' && (!selected || listLoading || detailLoading || !!editError || !!listError);
  return <Card className="key-guardrails-card">
    <CardHeader><CardTitle>{uiT("Guardrails")}</CardTitle><CardDescription>{uiT("Workspace rules always apply. This key can follow the current workspace policy or pin a saved version that adds fixed restrictions.")}</CardDescription></CardHeader>
    <CardContent className="key-guardrails-content">
      {loading ? <ListRowsSkeleton rows={2} label={uiT("Loading Guardrails…")} /> : error ? <Alert variant="destructive"><AlertDescription>{error} <Button variant="outline" onClick={() => setReload(value => value + 1)}>{uiT("Reload Guardrails")}</Button></AlertDescription></Alert> : <>
        <div className="key-guardrails-row"><div><strong>{uiT("Workspace")}</strong><p>{head ? uiF("{0} · Version {1}", [head.policy.name, head.revision]) : uiT("No workspace policy configured")}</p></div>{(head || canWrite) && <Button asChild variant="outline"><Link to={`${root}/guardrails?tab=policy`}>{head ? uiT("View policy") : uiT("Configure policy")}</Link></Button>}</div>
        <div className="key-guardrails-row"><div><strong>{uiT("API key")}</strong>{assignment?.mode === 'active' ? <p>{head ? uiF("Follows workspace policy · Version {0}", [head.revision]) : uiT("Follows workspace policy")}</p> : assignment?.policy_revision ? <p>{uiF("Pinned to {0} · Version {1}", [assignment.policy?.name || uiT("Saved policy"), assignment.policy_revision])}</p> : <p>{head ? uiF("Follows workspace policy · Version {0}", [head.revision]) : uiT("Follows workspace policy")}</p>}</div><div className="flex flex-wrap items-center gap-1"><KeyGuardrailHistory token={token} endpoint={endpoint} />{canWrite && active && <Button ref={changePolicyButton} variant="outline" onClick={() => setOpen(true)}>{uiT("Change key policy")}</Button>}</div></div>
        {!active && <p className="page-subtitle">{uiT("Assignments cannot be changed for an inactive key.")}</p>}
        {notice && <p role="status">{notice}</p>}
      </>}
      <Dialog open={open} onOpenChange={value => { if (!saving) setOpen(value); }}>
        <DialogContent className="key-guardrails-dialog" onCloseAutoFocus={event => {if (changePolicyButton.current) {event.preventDefault();changePolicyButton.current.focus();}}}><DialogHeader><DialogTitle>{uiT("Key Guardrails")}</DialogTitle><DialogDescription>{uiT("Follow the workspace policy so later edits apply automatically, or pin a saved version for fixed additional restrictions. Workspace rules always apply.")}</DialogDescription></DialogHeader>
          <Label htmlFor="key-policy-choice">{uiT("Key policy")}</Label>
          <DropdownMenu><DropdownMenuTrigger asChild><Button id="key-policy-choice" variant="outline" className="key-guardrails-choice" disabled={saving || listLoading || conflict}>{choiceLabel}<ChevronDown size={16} /></Button></DropdownMenuTrigger><DropdownMenuContent align="start" className="key-guardrails-menu"><DropdownMenuRadioGroup value={choice} onValueChange={setChoice}><DropdownMenuRadioItem value="follow">{uiT("Follow workspace policy")}</DropdownMenuRadioItem>{versions.map(version => <DropdownMenuRadioItem key={version.revision} value={String(version.revision)}>{version.policy_name}{" "}{uiT("· Version")}{" "}{version.revision}{version.active ? " " + uiT("(workspace current)") : ''}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu>
          {choice === 'follow' && <p className="page-subtitle">{head ? uiT("This key uses the workspace's active policy. Later workspace edits apply without re-pinning the key.") : uiT("No workspace policy is active yet. The key will use the first active policy when one is saved.")}</p>}
          {choice !== 'follow' && <p className="page-subtitle">{uiT("Pinned versions add fixed restrictions. Later workspace edits do not update this pin.")}</p>}
          {listLoading && <p role="status">{uiT("Loading saved versions…")}</p>}
          {cursor && <Button variant="outline" disabled={listLoading || saving || conflict} onClick={() => void loadMore()}>{uiT("Load older versions")}</Button>}
          {detailLoading ? <p role="status">{uiT("Loading policy…")}</p> : selected && <dl className="key-guardrails-summary"><div><dt>{uiT("Models")}</dt><dd>{accessText(selected.models)}</dd></div><div><dt>{uiT("Providers")}</dt><dd>{accessText(selected.providers)}</dd></div><div><dt>{uiT("Input rules")}</dt><dd>{selected.input_rules?.length ? selected.input_rules.map((rule, index) => <p key={index}>{ruleText(rule)}</p>) : uiT("None")}</dd></div>{Boolean(selected.input_detectors?.length) && <div><dt>{uiT("External input checks")}</dt><dd><DetectorPreview token={token} endpoint={workspaceEndpoint} bindings={selected.input_detectors!} /></dd></div>}<div><dt>{uiT("Output rules")}</dt><dd>{selected.output ? <><p>{selected.output.mode === "observe_only" ? uiT("Observe only · response unchanged") : selected.output.mode === "buffered_full" ? uiT("Buffered responses required") : uiT("Output mode unavailable")}</p>{selected.output.rules.map((rule, index) => <p key={index}>{ruleText(rule, selected.output?.mode === "observe_only")}</p>)}</> : uiT("None")}</dd></div></dl>}
          {choice !== 'follow' && selected && <Button asChild variant="link"><Link to={`${root}/guardrails?tab=history&revision=${encodeURIComponent(choice)}`}>{uiT("Inspect saved rules in policy history")}</Link></Button>}
          {listError && <Alert variant="destructive"><AlertDescription>{listError} <Button variant="outline" disabled={saving} onClick={() => { setOpen(false); }}>{uiT("Close and retry")}</Button></AlertDescription></Alert>}
          {editError && <Alert variant="destructive"><AlertDescription>{uiT(editError)}</AlertDescription></Alert>}
          <DialogFooter>{conflict ? <Button onClick={() => { setOpen(false); setReload(value => value + 1); }}>{uiT("Reload Guardrails")}</Button> : <><Button variant="outline" disabled={saving} onClick={() => setOpen(false)}>{uiT("Cancel")}</Button><Button disabled={saving || unchanged || listLoading || detailBlocked} onClick={() => void save()}>{saving ? uiT("Saving…") : uiT("Save assignment")}</Button></>}</DialogFooter>
        </DialogContent>
      </Dialog>
    </CardContent>
  </Card>;
}
