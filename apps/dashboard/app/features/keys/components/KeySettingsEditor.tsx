import { readLocale as readUILocale } from '@/shell/ui-locale';
import { useLocale as useUILocale } from '@/shell/ui-locale';
import { useEffect, useRef, useState } from 'react';
import { IconChevronDown } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuCheckboxItem, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { usePlatformCurrency } from '@/shell/platform-currency';
import { amountFromNanos, amountToNanos, formatUnitAtoms, money, unitAmountFromAtoms, unitAmountToAtoms } from '@/lib/money';
import { keyRequest, KeyRequestError, type ProjectKey } from '../api';

type IpMode = 'all' | 'listed' | 'blocked';
type GuardrailVersion = { revision: number; policy_name: string; active: boolean };
type GuardrailPage = { data: GuardrailVersion[]; next_cursor: number | null };
type GuardrailAssignment = { assignment_revision: number; policy_revision: number | null; mode?: 'fixed' | 'active'; policy: { name: string } | null };
const modeNames: Record<IpMode, string> = { all: 'Allow all sources', listed: 'Allow listed sources', blocked: 'Block all sources' };
const getRpm = (key: ProjectKey) => key.request_rate_limit?.requests_per_minute ?? key.requests_per_minute ?? null;
const getConcurrent = (key: ProjectKey) => key.concurrency_limit?.max_concurrent_requests ?? key.max_concurrent_requests ?? null;
const getTpm = (key: ProjectKey) => key.token_rate_limit?.tokens_per_minute ?? key.tokens_per_minute ?? null;
const getCidrs = (key: ProjectKey) => key.ip_policy ? key.ip_policy.allowed_cidrs : key.allowed_cidrs ?? null;
function wholeNumber(draft: string, maximum: number) {
  if (!draft.trim()) return { value: null as number | null, invalid: false };
  if (!/^\d+$/.test(draft.trim())) return { value: null, invalid: true };
  const value = Number(draft.trim());
  return { value, invalid: !Number.isSafeInteger(value) || value < 0 || value > maximum };
}
function spendingAmount(draft: string): string | null {
  if (!draft.trim()) return null;
  return /^0+(?:\.0{1,9})?$/.test(draft.trim()) ? '0' : amountToNanos(draft);
}
function unitAmount(draft: string): string | null {
  if (!draft.trim()) return null;
  return /^0+(?:\.0{1,9})?$/.test(draft.trim()) ? '0' : unitAmountToAtoms(draft);
}
function assignmentOf(value: unknown): GuardrailAssignment | null {
  if (value === null) return null;
  if (!value || typeof value !== 'object') throw new Error('The key Guardrails assignment could not be read.');
  const assignment = value as Record<string, unknown>;
  if (!Number.isSafeInteger(assignment.assignment_revision) || (assignment.assignment_revision as number) < 0
    || (assignment.mode !== undefined && assignment.mode !== 'fixed' && assignment.mode !== 'active')
    || (assignment.policy_revision !== null && (!Number.isSafeInteger(assignment.policy_revision) || (assignment.policy_revision as number) < 1))) {
    throw new Error('The key Guardrails assignment could not be read.');
  }
  return assignment as unknown as GuardrailAssignment;
}
function guardrailChoice(assignment: GuardrailAssignment | null) {
  if (!assignment || assignment.mode === 'active') return 'follow';
  return assignment.policy_revision ? String(assignment.policy_revision) : 'follow';
}
function versionsOf(page: GuardrailPage) {
  if (!page || !Array.isArray(page.data) || page.data.some(version => !Number.isSafeInteger(version.revision) || version.revision < 1 || typeof version.policy_name !== 'string')
    || (page.next_cursor !== null && (!Number.isSafeInteger(page.next_cursor) || page.next_cursor < 1))) {
    throw new Error('The saved policy versions could not be read.');
  }
  return page;
}
export default function KeySettingsEditor({ token, projectKey, models, canWrite, canConfigureSpending, metadataPath, guardrailPath, workspaceGuardrailsPath, unitLimitPath, onKeyChanged, onSaved, onCancel, onReload }: {
  token: string;
  projectKey: ProjectKey;
  models: string[];
  canWrite: boolean;
  canConfigureSpending: boolean;
  metadataPath: string;
  guardrailPath: string;
  workspaceGuardrailsPath: string;
  unitLimitPath: string;
  onKeyChanged: (key: ProjectKey) => void;
  onSaved: (key: ProjectKey, guardrailChanged: boolean) => void;
  onCancel: () => void;
  onReload: () => void;
}) {
  const { t: uiT, format: uiF } = useUILocale();
  const { currency: platformCurrency, unit: platformUnit } = usePlatformCurrency();
  const [name, setName] = useState(() => projectKey.name);
  const [selectedModels, setSelectedModels] = useState<string[]>(() => [...projectKey.allowed_models]);
  const [rpm, setRpm] = useState(() => { const value = getRpm(projectKey); return value === null ? '' : String(value); });
  const [concurrent, setConcurrent] = useState(() => { const value = getConcurrent(projectKey); return value === null ? '' : String(value); });
  const [tpm, setTpm] = useState(() => { const value = getTpm(projectKey); return value === null ? '' : String(value); });
  const currentCidrs = getCidrs(projectKey) ?? null;
  const [ipMode, setIpMode] = useState<IpMode>(() => currentCidrs === null ? 'all' : currentCidrs.length ? 'listed' : 'blocked');
  const [cidrs, setCidrs] = useState(() => currentCidrs?.join('\n') ?? '');
  const spendingRow = platformCurrency ? projectKey.spending_limits?.find(row => row.currency === platformCurrency) : undefined;
  const unitAccount = projectKey.unit_spending_limit ?? null;
  const unitName = unitAccount?.unit?.name ?? platformUnit?.name ?? uiT("Credits");
  const unitPrecision = unitAccount?.unit?.display_precision ?? platformUnit?.display_precision ?? 2;
  const [spending, setSpending] = useState(() => spendingRow?.limit_nanos === null || spendingRow?.limit_nanos === undefined ? '' : amountFromNanos(spendingRow.limit_nanos));
  const [unitLimit, setUnitLimit] = useState(() => unitAccount?.limit_atoms === null || unitAccount?.limit_atoms === undefined ? '' : unitAmountFromAtoms(unitAccount.limit_atoms, unitPrecision));

  const [assignment, setAssignment] = useState<GuardrailAssignment | null>(null);
  const [versions, setVersions] = useState<GuardrailVersion[]>([]);
  const [versionCursor, setVersionCursor] = useState<number | null>(null);
  const [choice, setChoice] = useState('follow');
  const [guardrailLoaded, setGuardrailLoaded] = useState(false);
  const [guardrailLoading, setGuardrailLoading] = useState(true);
  const [guardrailError, setGuardrailError] = useState('');
  const [guardrailReload, setGuardrailReload] = useState(0);
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setGuardrailLoading(true); setGuardrailError('');
    void Promise.all([
      keyRequest<{ data: unknown }>(token, guardrailPath, 'GET', undefined, controller.signal),
      keyRequest<GuardrailPage>(token, `${workspaceGuardrailsPath}/history`, 'GET', undefined, controller.signal),
    ]).then(([assignmentResult, page]) => {
      if (controller.signal.aborted) return;
      const nextAssignment = assignmentOf(assignmentResult.data);
      const verified = versionsOf(page);
      setAssignment(nextAssignment);
      setVersions(verified.data);
      setVersionCursor(verified.next_cursor);
      setChoice(guardrailChoice(nextAssignment));
      setGuardrailLoaded(true);
    }).catch(cause => {
      if (!controller.signal.aborted) setGuardrailError(cause instanceof Error ? cause.message : 'Could not load Guardrails.');
    }).finally(() => { if (!controller.signal.aborted) setGuardrailLoading(false); });
    return () => controller.abort();
  }, [token, guardrailPath, workspaceGuardrailsPath, guardrailReload]);

  useEffect(() => () => pending.current?.abort(), []);

  async function loadOlderVersions() {
    if (versionCursor === null || guardrailLoading) return;
    const controller = new AbortController(); setGuardrailLoading(true); setGuardrailError('');
    try {
      const page = versionsOf(await keyRequest<GuardrailPage>(token, `${workspaceGuardrailsPath}/history?before_revision=${versionCursor}`, 'GET', undefined, controller.signal));
      if (controller.signal.aborted) return;
      setVersions(current => [...current, ...page.data]);
      setVersionCursor(page.next_cursor);
    } catch (cause) {
      if (!controller.signal.aborted) setGuardrailError(cause instanceof Error ? cause.message : 'Could not load older versions.');
    } finally { if (!controller.signal.aborted) setGuardrailLoading(false); }
  }

  const rpmState = wholeNumber(rpm, 1_000_000);
  const concurrentState = wholeNumber(concurrent, 10_000);
  const tpmState = wholeNumber(tpm, 1_000_000_000_000);
  const entries = cidrs.split('\n').map(value => value.trim()).filter(Boolean);
  const cidrsInvalid = ipMode === 'listed' && (!entries.length || entries.length > 64 || entries.some(value => value.length > 64));
  const nextCidrs = ipMode === 'all' ? null : ipMode === 'blocked' ? [] : entries;
  const cidrsChanged = JSON.stringify(nextCidrs) !== JSON.stringify(currentCidrs);
  let nextSpending: string | null = null;
  let spendingError = '';
  if (canConfigureSpending && spendingRow) {
    try {
      nextSpending = spendingAmount(spending);
      if (nextSpending !== null && BigInt(nextSpending) < BigInt(spendingRow.committed_nanos)) spendingError = 'The limit must cover current charges and reserved requests.';
    } catch (cause) {
      spendingError = cause instanceof Error ? cause.message : 'Enter a valid amount.';
    }
  }
  const spendingChanged = canConfigureSpending && Boolean(spendingRow) && nextSpending !== (spendingRow?.limit_nanos ?? null);
  let nextUnitLimit: string | null = null;
  let unitError = '';
  if (canConfigureSpending && unitAccount?.unit) {
    try {
      nextUnitLimit = unitAmount(unitLimit);
      if (nextUnitLimit !== null && BigInt(nextUnitLimit) < BigInt(unitAccount.committed_atoms)) unitError = 'The limit must cover current committed Credits charges and reserved requests.';
    } catch (cause) {
      unitError = cause instanceof Error ? cause.message : `Enter a valid ${unitName} amount.`;
    }
  }
  const unitChanged = canConfigureSpending && Boolean(unitAccount?.unit) && nextUnitLimit !== (unitAccount?.limit_atoms ?? null);
  const nameChanged = name.trim() !== projectKey.name;
  const modelsChanged = JSON.stringify([...selectedModels].sort()) !== JSON.stringify([...projectKey.allowed_models].sort());
  const metadataChanged = nameChanged || modelsChanged;
  const rpmChanged = rpm.trim() !== (getRpm(projectKey) === null ? '' : String(getRpm(projectKey)));
  const concurrentChanged = concurrent.trim() !== (getConcurrent(projectKey) === null ? '' : String(getConcurrent(projectKey)));
  const tpmChanged = tpm.trim() !== (getTpm(projectKey) === null ? '' : String(getTpm(projectKey)));
  const policiesChanged = canConfigureSpending && (rpmChanged || concurrentChanged || tpmChanged || cidrsChanged || spendingChanged || unitChanged);
  const changed = metadataChanged || policiesChanged || (guardrailLoaded && choice !== guardrailChoice(assignment));
  const invalid = rpmState.invalid || concurrentState.invalid || tpmState.invalid || cidrsInvalid || Boolean(spendingError) || Boolean(unitError);
  const workspaceVersion = versions.find(version => version.active)?.revision;
  const guardrailLabel = choice === 'follow'
    ? workspaceVersion ? uiF("Follow workspace policy · Version {0}", [workspaceVersion]) : uiT("Follow workspace policy")
    : uiF("{0} · Version {1}", [versions.find(version => String(version.revision) === choice)?.policy_name || assignment?.policy?.name || uiT("Saved policy"), choice]);

  async function save() {
    if (!canWrite || saving || conflict || invalid || !name.trim() || !selectedModels.length) return;
    const body: Record<string, unknown> = {};
    if (metadataChanged) {
      body.name = name.trim();
      body.allowed_models = selectedModels;
      body.expected_revision = projectKey.revision ?? 0;
    }
    if (canConfigureSpending) {
      if (rpmChanged) body.request_rate_limit = { requests_per_minute: rpmState.value, expected_revision: projectKey.request_rate_limit?.revision ?? '0' };
      if (concurrentChanged) body.concurrency_limit = { max_concurrent_requests: concurrentState.value, expected_revision: projectKey.concurrency_limit?.revision ?? '0' };
      if (tpmChanged) body.token_rate_limit = { tokens_per_minute: tpmState.value, expected_revision: projectKey.token_rate_limit?.revision ?? '0' };
      if (cidrsChanged) body.ip_policy = { allowed_cidrs: nextCidrs, expected_revision: projectKey.ip_policy?.revision ?? '0' };
      if (spendingChanged && spendingRow) body.spending_limit = { currency: spendingRow.currency, limit_nanos: nextSpending, expected_revision: spendingRow.revision ?? '0' };
    }
    const configChanged = Object.keys(body).length > 0;
    const guardrailChanged = guardrailLoaded && choice !== guardrailChoice(assignment);
    if (!configChanged && !guardrailChanged && !unitChanged) return;
    const controller = new AbortController(); pending.current = controller;
    setSaving(true); setError('');
    let updated = projectKey;
    try {
      if (configChanged) {
        const result = await keyRequest<ProjectKey>(token, metadataPath, 'PATCH', body, controller.signal);
        updated = { ...projectKey, ...result, name: name.trim(), allowed_models: selectedModels };
      }
      if (guardrailChanged) {
        await keyRequest(token, guardrailPath, 'PUT', choice === 'follow'
          ? { mode: 'active', expected_assignment_revision: assignment?.assignment_revision ?? 0 }
          : { mode: 'fixed', policy_revision: Number(choice), expected_assignment_revision: assignment?.assignment_revision ?? 0 }, controller.signal);
      }
      if (unitChanged) {
        await keyRequest(token, unitLimitPath, 'PUT', {
          limit_atoms: nextUnitLimit,
          expected_revision: unitAccount?.revision ?? '0',
          idempotency_key: crypto.randomUUID(),
        }, controller.signal);
      }
      if (controller.signal.aborted) return;
      onSaved(updated, guardrailChanged);
    } catch (cause) {
      if (controller.signal.aborted) return;
      if (updated !== projectKey) {
        onKeyChanged(updated);
        setConflict(true);
        setError('Some changes were saved. Reload the key to review the remaining changes.');
        return;
      }
      const status = cause instanceof KeyRequestError ? cause.status : 0;
      const stale = status === 409 || status === 402;
      setConflict(stale);
      setError(stale
        ? status === 402
          ? 'Committed spending changed. Reload the key before editing again.'
          : 'This key changed. Reload it before editing again.'
        : cause instanceof Error ? cause.message : 'Could not update this key.');
    } finally { if (!controller.signal.aborted) setSaving(false); }
  }

  return <form className="grid gap-4 py-1" onSubmit={event => { event.preventDefault(); void save(); }}>
    <section className="grid gap-4 rounded-xl bg-muted/45 p-4" aria-label={uiT("API key details")}>
      <h3 className="text-sm font-medium">{uiT("API key details")}</h3>
      <div className="grid gap-2 sm:grid-cols-[1fr_20rem] sm:items-center"><Label htmlFor="key-edit-name">{uiT("Name")}</Label><Input id="key-edit-name" value={name} maxLength={200} disabled={saving || conflict} onChange={event => setName(event.target.value)} autoFocus /></div>
      <div className="grid gap-2 sm:grid-cols-[1fr_20rem] sm:items-center"><Label htmlFor="key-edit-models">{uiT("Model access")}</Label><DropdownMenu><DropdownMenuTrigger asChild><Button id="key-edit-models" type="button" variant="outline" className="justify-between" disabled={saving || conflict} aria-label={uiT("Model access")}>{selectedModels.includes('*') ? uiT("All configured models") : uiF("{0} model{1} selected", [selectedModels.length, selectedModels.length === 1 ? '' : 's'])}<IconChevronDown size={16} /></Button></DropdownMenuTrigger><DropdownMenuContent className="max-h-72 max-w-[calc(100vw-2rem)] overflow-y-auto" align="start"><DropdownMenuCheckboxItem checked={selectedModels.includes('*')} onSelect={event => event.preventDefault()} onCheckedChange={checked => setSelectedModels(checked ? ['*'] : [])}>{uiT("All configured models")}</DropdownMenuCheckboxItem><DropdownMenuSeparator />{[...new Set([...models, ...selectedModels.filter(model => model !== '*')])].sort().map(model => <DropdownMenuCheckboxItem key={model} checked={selectedModels.includes(model)} onSelect={event => event.preventDefault()} onCheckedChange={checked => setSelectedModels(current => checked ? [...current.filter(value => value !== '*'), model] : current.filter(value => value !== model))}>{model}</DropdownMenuCheckboxItem>)}</DropdownMenuContent></DropdownMenu></div>
    </section>

    <section className="grid gap-4 rounded-xl bg-muted/45 p-4" aria-label={uiT("Limits")}>
      <div><h3 className="text-sm font-medium">{uiT("Limits")}</h3><p className="mt-1 text-sm text-muted-foreground">{uiT("Throughput limits for this API key.")}</p></div>
      {!canConfigureSpending && <p className="text-sm text-muted-foreground">{uiT("Only workspace owners can change key limits and policies.")}</p>}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="grid gap-2"><Label htmlFor="key-edit-rpm">{uiT("Requests per minute")}</Label><Input id="key-edit-rpm" inputMode="numeric" placeholder={uiT("Unlimited")} value={rpm} disabled={saving || conflict || !canConfigureSpending} onChange={event => setRpm(event.target.value)} />{rpmState.invalid && <p role="alert" className="text-sm text-destructive">{uiT("Enter a whole number from 0 to")}{" "}{(1_000_000).toLocaleString(readUILocale())}{uiT(", or leave blank.")}</p>}</div>
        <div className="grid gap-2"><Label htmlFor="key-edit-concurrent">{uiT("Concurrent requests")}</Label><Input id="key-edit-concurrent" inputMode="numeric" placeholder={uiT("Unlimited")} value={concurrent} disabled={saving || conflict || !canConfigureSpending} onChange={event => setConcurrent(event.target.value)} />{concurrentState.invalid && <p role="alert" className="text-sm text-destructive">{uiT("Enter a whole number from 0 to")}{" "}{(10_000).toLocaleString(readUILocale())}{uiT(", or leave blank.")}</p>}</div>
        <div className="grid gap-2"><Label htmlFor="key-edit-tpm">{uiT("Tokens per minute")}</Label><Input id="key-edit-tpm" inputMode="numeric" placeholder={uiT("Unlimited")} value={tpm} disabled={saving || conflict || !canConfigureSpending} onChange={event => setTpm(event.target.value)} />{tpmState.invalid && <p role="alert" className="text-sm text-destructive">{uiT("Enter a whole number from 0 to")}{" "}{(1_000_000_000_000).toLocaleString(readUILocale())}{uiT(", or leave blank.")}</p>}</div>
      </div>
      <p className="text-xs text-muted-foreground">{uiT("Counts dispatched requests in a rolling 60-second window, including failed requests.")}</p>
      <p className="text-xs text-muted-foreground">{uiT("Counts unresolved dispatched requests. Disconnecting does not release an unresolved request.")}</p>
      <p className="text-xs text-muted-foreground">{uiT("Counts known usage and unresolved estimates. A finite limit requires supported text requests with an explicit output-token maximum; video requests are blocked.")}</p>
      <p className="text-xs text-muted-foreground">{uiT("Leave blank for unlimited. Zero blocks new requests.")}</p>
    </section>

    <section className="grid gap-4 rounded-xl bg-muted/45 p-4" aria-label={uiT("Source IP access")}>
      <div><h3 className="text-sm font-medium">{uiT("Source IP access")}</h3><p className="mt-1 text-sm text-muted-foreground">{uiT("Control which IP addresses can use this API key.")}</p></div>
      <div className="grid gap-2 sm:grid-cols-[1fr_20rem] sm:items-center"><Label htmlFor="key-edit-ip-mode">{uiT("Access")}</Label><DropdownMenu><DropdownMenuTrigger asChild><Button id="key-edit-ip-mode" type="button" variant="outline" className="justify-between" aria-label={uiT("Source IP access mode")} disabled={saving || conflict || !canConfigureSpending}>{uiT(modeNames[ipMode])}<IconChevronDown size={16} /></Button></DropdownMenuTrigger><DropdownMenuContent align="start" className="max-w-[calc(100vw-2rem)]"><DropdownMenuRadioGroup value={ipMode} onValueChange={value => setIpMode(value as IpMode)}><DropdownMenuRadioItem value="all">{uiT("Allow all sources")}</DropdownMenuRadioItem><DropdownMenuRadioItem value="listed">{uiT("Allow listed sources")}</DropdownMenuRadioItem><DropdownMenuRadioItem value="blocked">{uiT("Block all sources")}</DropdownMenuRadioItem></DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu></div>
      {ipMode === 'listed' && <div className="grid gap-2"><Label htmlFor="key-edit-cidrs">{uiT("Allowed addresses or CIDRs")}</Label><Textarea id="key-edit-cidrs" value={cidrs} rows={4} disabled={saving || conflict || !canConfigureSpending} onChange={event => setCidrs(event.target.value)} className="font-mono text-xs" /><p className="text-sm text-muted-foreground">{uiT("One IPv4 or IPv6 address or CIDR per line. Up to 64 entries, each up to 64 characters.")}</p>{cidrsInvalid && <p role="alert" className="text-sm text-destructive">{uiT("Enter between 1 and 64 addresses or CIDRs, each up to 64 characters.")}</p>}</div>}
      {ipMode === 'blocked' && <p className="text-sm text-destructive">{uiT("All new requests using this key will be rejected.")}</p>}
      <p className="text-sm text-muted-foreground">{uiT("When restricted, requests from unlisted addresses are rejected. Existing requests are not cancelled.")}</p>
    </section>

    <section className="grid gap-4 rounded-xl bg-muted/45 p-4" aria-label={uiT("Spending limits")}>
      <div><h3 className="text-sm font-medium">{uiT("Spending limits")}</h3><p className="mt-1 text-sm text-muted-foreground">{uiT("Lifetime customer spending allowances. Account and workspace limits still apply.")}</p></div>
      {!platformCurrency && !unitAccount && <p className="text-sm text-muted-foreground">{uiT("Spending limits will be available after the platform currency is configured in Admin.")}</p>}
      {spendingRow && <div className="grid gap-2"><Label htmlFor="key-edit-spending">{uiT("Lifetime limit (")}{spendingRow.currency})</Label><Input id="key-edit-spending" inputMode="decimal" autoComplete="off" value={spending} disabled={saving || conflict || !canConfigureSpending} onChange={event => setSpending(event.target.value)} aria-describedby="key-edit-spending-help" /><p id="key-edit-spending-help" className="text-sm text-muted-foreground">{uiT("Leave blank for unlimited. Zero blocks new paid requests in this currency. No periodic reset.")}</p><p className="text-sm text-muted-foreground">{uiT("Committed at last refresh:")}{" "}{money(spendingRow.committed_nanos, spendingRow.currency)}{uiT(". The limit must cover this amount.")}</p>{spendingError && <p role="alert" className="text-sm text-destructive">{spendingError}</p>}</div>}
      {unitAccount?.unit && <div className="grid gap-2"><Label htmlFor="key-edit-unit-spending">{uiT("Lifetime limit (")}{unitName})</Label><Input id="key-edit-unit-spending" inputMode="decimal" autoComplete="off" value={unitLimit} disabled={saving || conflict || !canConfigureSpending} onChange={event => setUnitLimit(event.target.value)} aria-describedby="key-edit-unit-spending-help" /><p id="key-edit-unit-spending-help" className="text-sm text-muted-foreground">{uiT("Leave blank for unlimited. Zero blocks new paid requests in")}{" "}{unitName}{uiT(". No periodic reset.")}</p><p className="text-sm text-muted-foreground">{uiT("Committed at last refresh:")}{" "}{formatUnitAtoms(unitAccount.committed_atoms, unitName, unitPrecision)}{uiT(". The limit must cover this amount.")}</p>{unitError && <p role="alert" className="text-sm text-destructive">{unitError}</p>}</div>}
      <p className="text-xs text-muted-foreground">{uiT("This limit covers Niu customer charges and reserved requests. It does not cover charges paid directly to a Provider using your own API key. Manage those costs with the Provider.")}</p>
    </section>

    <section className="grid gap-4 rounded-xl bg-muted/45 p-4" aria-label={uiT("Guardrails")}>
      <div><h3 className="text-sm font-medium">{uiT("Guardrails")}</h3><p className="mt-1 text-sm text-muted-foreground">{uiT("Workspace rules always apply. This key can follow the current workspace policy or pin a saved version that adds fixed restrictions.")}</p></div>
      <Label htmlFor="key-edit-guardrail">{uiT("Key policy")}</Label>
      <DropdownMenu><DropdownMenuTrigger asChild><Button id="key-edit-guardrail" type="button" variant="outline" className="justify-between" disabled={saving || conflict || guardrailLoading || !guardrailLoaded} aria-label={uiT("Key Guardrails")}>{guardrailLoaded ? guardrailLabel : uiT("Loading saved versions…")}<IconChevronDown size={16} /></Button></DropdownMenuTrigger><DropdownMenuContent align="start" className="max-h-72 max-w-[calc(100vw-2rem)] overflow-y-auto"><DropdownMenuRadioGroup value={choice} onValueChange={setChoice}><DropdownMenuRadioItem value="follow">{uiT("Follow workspace policy")}</DropdownMenuRadioItem>{versions.map(version => <DropdownMenuRadioItem key={version.revision} value={String(version.revision)}>{version.policy_name}{" "}{uiT("· Version")}{" "}{version.revision}{version.active ? " " + uiT("(workspace current)") : ''}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu>
      {guardrailLoading && <p role="status" className="text-sm text-muted-foreground">{uiT("Loading saved versions…")}</p>}
      {guardrailError && <div className="grid justify-items-start gap-2"><p role="alert" className="text-sm text-destructive">{guardrailError}</p><Button type="button" variant="outline" onClick={() => setGuardrailReload(value => value + 1)}>{uiT("Retry")}</Button></div>}
      {choice === 'follow' && <p className="text-sm text-muted-foreground">{workspaceVersion ? uiT("This key uses the workspace's active policy. Later workspace edits apply without re-pinning the key.") : uiT("No workspace policy is active yet. The key will use the first active policy when one is saved.")}</p>}
      {choice !== 'follow' && <p className="text-sm text-muted-foreground">{uiT("Pinned versions add fixed restrictions. Later workspace edits do not update this pin.")}</p>}
      {versionCursor !== null && <Button type="button" variant="outline" size="sm" disabled={guardrailLoading || saving || conflict} onClick={() => void loadOlderVersions()}>{uiT("Load older versions")}</Button>}
    </section>

    {error && <p role="alert" className="text-sm text-destructive">{uiT(error)}</p>}
    <div className="flex flex-wrap justify-end gap-2">
      {conflict ? <Button type="button" onClick={onReload}>{uiT("Reload key")}</Button> : <>
        <Button type="button" variant="ghost" disabled={saving} onClick={onCancel}>{uiT("Cancel")}</Button>
        <Button type="submit" disabled={saving || conflict || invalid || !changed || !name.trim() || !selectedModels.length}>{saving ? uiT("Saving…") : uiT("Save changes")}</Button>
      </>}
    </div>
  </form>;
}
