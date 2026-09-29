import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, Bot, Cable, Check, ChevronDown, Copy, KeyRound, Link2, Shield, X } from 'lucide-react';
import { Link } from 'react-router';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import type { Workspace } from '@/app/console-context';
import {
  issueAiderProjectKey,
  issueCodexProjectKey,
  issueExecutionCollectorKey,
  listExecutionCollectorKeys,
  revokeExecutionCollectorKey,
  type ExecutionCollectorKey,
  type ProjectScope,
} from '../api';

type AgentId = 'codex' | 'aider' | 'claude-code';
type Mode = 'route' | 'collect';
type AgentDefinition = {
  id: AgentId;
  name: string;
  version: string;
  availableMode: Mode;
  billing: string;
  receives: string;
  excluded: string;
  documentation: string;
};

const agents: AgentDefinition[] = [
  {
    id: 'codex',
    name: 'Codex CLI',
    version: 'Uses the Codex CLI installed on this machine',
    availableMode: 'route',
    billing: 'Codex keeps its ChatGPT sign-in. Subscription eligibility and billing through a custom endpoint are not verified.',
    receives: 'Gateway request, attempt, timing, and provider-reported token usage when available.',
    excluded: 'Codex tool calls as a complete task trace, validation, and accepted outcomes.',
    documentation: '',
  },
  {
    id: 'aider',
    name: 'Aider',
    version: 'Aider CLI; version is checked on the client machine',
    availableMode: 'route',
    billing: 'The provider connection configured in Niu. API billing applies; Aider subscription billing is not used.',
    receives: 'Gateway request, attempt, usage, timing, and configured price when known.',
    excluded: 'Aider tool calls, task retries, validation, and accepted outcomes.',
    documentation: 'https://aider.chat/docs/llms/openai-compat.html',
  },
  {
    id: 'claude-code',
    name: 'Claude Code',
    version: 'Claude Code 2.1.211 is verified by this connector',
    availableMode: 'collect',
    billing: 'Claude Code keeps its current sign-in, provider route, and payer. Reported cost is an estimate, not a settled charge.',
    receives: 'Model and usage events, API errors and retry counts, tool timing and status when emitted.',
    excluded: 'Gateway request capture, prompt and response text, tool arguments and output, and acceptance outcomes.',
    documentation: 'https://code.claude.com/docs/en/monitoring-usage',
  },
];

type Props = {
  token: string;
  workspace: Workspace;
  models: string[];
  codexModels: string[];
  canWrite: boolean;
};

export default function AgentConnectView({ token, workspace, models, codexModels, canWrite }: Props) {
  const [agentId, setAgentId] = useState<AgentId>('codex');
  const [selectedModel, setSelectedModel] = useState(models[0] ?? '');
  const [collectorKeys, setCollectorKeys] = useState<ExecutionCollectorKey[]>([]);
  const [routeSecret, setRouteSecret] = useState<{ id: string; token: string } | null>(null);
  const [routeKeyModel, setRouteKeyModel] = useState<string | null>(null);
  const [collectorSecret, setCollectorSecret] = useState<{ id: string; token: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [copyNotice, setCopyNotice] = useState('');
  const agent = agents.find(item => item.id === agentId)!;
  const agentModels = agentId === 'codex' ? codexModels : models;
  const scope: ProjectScope = { organizationId: workspace.organization_id, projectId: workspace.id };
  const productBase = import.meta.env.BASE_URL.replace(/\/+$/, '');
  const gatewayBaseURL = `${window.location.origin}${productBase}/v1`;
  const selectedAlias = agentModels.includes(selectedModel) ? selectedModel : agentModels[0] ?? '';
  const routeAlias = routeKeyModel ?? selectedAlias;
  const routeExample = useMemo(() => [
    'pnpm --filter @niu-io/agent-connect build',
    `node sdks/agent-connect/bin/niu-agent-connect.mjs ${agentId === 'codex' ? 'codex' : 'aider'} route --gateway ${shellQuote(gatewayBaseURL)} --model ${shellQuote(routeAlias)}`,
  ].join('\n'), [agentId, gatewayBaseURL, routeAlias]);
  const collectExample = useMemo(() => [
    'pnpm --filter @niu-io/agent-connect build',
    `node sdks/agent-connect/bin/niu-agent-connect.mjs claude collect --gateway ${shellQuote(gatewayBaseURL)} --organization ${shellQuote(workspace.organization_id)} --workspace ${shellQuote(workspace.id)} -- claude`,
  ].join('\n'), [gatewayBaseURL, workspace.id, workspace.organization_id]);

  const reloadCollectorKeys = useCallback(async (signal?: AbortSignal) => {
    const value = await listExecutionCollectorKeys(token, scope, signal);
    if (!signal?.aborted) setCollectorKeys(value);
  }, [token, workspace.id, workspace.organization_id]);

  useEffect(() => {
    const controller = new AbortController();
    void reloadCollectorKeys(controller.signal).catch(reason => {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Could not load collector keys.');
    });
    return () => controller.abort();
  }, [reloadCollectorKeys]);

  useEffect(() => {
    if (!agentModels.includes(selectedModel)) setSelectedModel(agentModels[0] ?? '');
  }, [agentModels, selectedModel]);

  async function copyValue(label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopyNotice(`${label} copied.`);
    } catch {
      setCopyNotice('Clipboard unavailable. Select the value and copy it.');
    }
  }

  async function mutate(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try { await action(); } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The request failed.');
    } finally { setBusy(false); }
  }

  function selectAgent(next: AgentId) {
    setAgentId(next);
    setRouteSecret(null);
    setRouteKeyModel(null);
    setCollectorSecret(null);
    setError('');
    setNotice('');
    setCopyNotice('');
  }

  const activeCollectorKeys = collectorKeys.filter(key => !key.revoked && !key.expired);

  return <div className="agent-connect-page">
    <div className="page-heading">
      <div><h1>Agent Connect</h1></div>
    </div>
    <div className="agent-connect-scope"><span>Workspace</span><strong>{workspace.name}</strong><span className="agent-scope-project">Workspace-scoped credentials</span></div>
    {error && <p className="error-text" role="alert">{error}</p>}
    {notice && <p className="agent-connect-notice" role="status">{notice}</p>}

    <div className="agent-connect-layout">
      <nav className="agent-connect-list" aria-label="Coding agents">
        {agents.map(item => <Button
          type="button"
          key={item.id}
          className={`agent-connect-option${agent.id === item.id ? ' selected' : ''}`}
          aria-current={agent.id === item.id ? 'true' : undefined}
          onClick={() => selectAgent(item.id)}
        >
          <Bot size={19} aria-hidden="true" />
          <span className="agent-connect-option-copy"><strong>{item.name}</strong><small>{item.availableMode === 'route' ? 'Route through Niu' : 'Collect activity'}</small></span>
          <Badge variant="outline">{item.id === 'codex' ? 'Prototype' : 'Preview'}</Badge>
        </Button>)}
      </nav>

      <section className="agent-connect-detail" aria-labelledby="agent-connect-detail-title">
        <div className="agent-connect-detail-heading">
          <div><h2 id="agent-connect-detail-title">{agent.name}</h2><p>{agent.version}</p></div>
          {agent.documentation && <a href={agent.documentation} target="_blank" rel="noreferrer">Agent docs <Link2 size={14} /></a>}
        </div>
        <div className="agent-mode-switch" role="group" aria-label="Connection mode">
          <Button type="button" disabled={agent.availableMode !== 'route'} aria-pressed={agent.availableMode === 'route'}>
            <Cable size={16} />Route through Niu
          </Button>
          <Button type="button" disabled={agent.availableMode !== 'collect'} aria-pressed={agent.availableMode === 'collect'}>
            <Activity size={16} />Collect activity
          </Button>
        </div>
        <p className="agent-mode-availability" role="status">{agent.id === 'codex'
          ? 'Codex sends Responses requests through Niu; its current ChatGPT sign-in stays local.'
          : agent.id === 'aider'
            ? 'Aider log collection is not supported by this connector.'
            : 'Routing Claude Code through Niu is not qualified. Collection leaves its provider route unchanged.'}</p>

        <dl className="agent-connect-evidence">
          <div><dt>{agent.availableMode === 'route' ? 'Request path' : 'Provider route'}</dt><dd>{agent.availableMode === 'route' ? 'Agent → Niu → configured provider' : 'Unchanged from Claude Code'}</dd></div>
          <div><dt>Who pays</dt><dd>{agent.billing}</dd></div>
          <div><dt>Niu receives</dt><dd>{agent.receives}</dd></div>
          <div><dt>Not captured</dt><dd>{agent.excluded}</dd></div>
        </dl>

        {agent.availableMode === 'route' ? <section className="agent-connect-setup" aria-labelledby="route-setup-title">
          <div className="agent-connect-setup-title"><div><h3 id="route-setup-title">Connect {agent.name}</h3><p>The key grants access to one model alias in this workspace.</p></div><Badge variant="outline">{agent.id === 'codex' ? 'Uses Codex sign-in' : 'API billing'}</Badge></div>
          {!canWrite && <p className="operator-read-only-note">This session can view setup but cannot issue a workspace key.</p>}
          {agentModels.length === 0 ? <div className="agent-connect-empty"><p>{agent.id === 'codex' ? 'Add a Codex ChatGPT route and model alias first.' : 'Connect a provider and publish a model alias first.'}</p><Button asChild variant="outline"><Link to="../vendors">Connect a provider</Link></Button></div> : <>
            <Label htmlFor="agent-model-alias">Model alias
              <DropdownMenu><DropdownMenuTrigger asChild><Button id="agent-model-alias" aria-label="Model alias" disabled={busy || routeKeyModel !== null} variant="outline" className="w-full justify-between font-normal">{routeAlias}<ChevronDown size={16} /></Button></DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)]"><DropdownMenuRadioGroup value={routeAlias} onValueChange={setSelectedModel}>{agentModels.map(model => <DropdownMenuRadioItem key={model} value={model}>{model}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuContent>
              </DropdownMenu>
            </Label>
            {canWrite && routeKeyModel === null && <Button disabled={busy || !selectedAlias} onClick={() => void mutate(async () => {
              const issued = agent.id === 'codex'
                ? await issueCodexProjectKey(token, scope, selectedAlias)
                : await issueAiderProjectKey(token, scope, selectedAlias);
              setRouteKeyModel(selectedAlias);
              setRouteSecret({ id: issued.id, token: issued.token });
              setNotice('Workspace key created. Copy it now; Niu will not show it again.');
              setCopyNotice('');
            })}><KeyRound size={16} />Create {agent.id === 'codex' ? 'Codex' : 'Aider'} key</Button>}
            {routeSecret && <div className="agent-connect-secret">
              <Label id="route-key-label" htmlFor="route-workspace-key">Workspace key · shown once</Label>
              <div><Input id="route-workspace-key" className="mono" readOnly value={routeSecret.token} onFocus={event => event.target.select()} /><Button type="button" variant="outline" onClick={() => void copyValue('Workspace key', routeSecret.token)}><Copy size={15} />Copy key</Button><Button type="button" variant="ghost" aria-label="Dismiss workspace key" onClick={() => setRouteSecret(null)}><X size={16} /></Button></div>
            </div>}
            <div className="agent-connect-copy-field">
              <Label htmlFor="agent-gateway-url">Niu base URL</Label>
              <div><Input id="agent-gateway-url" className="mono" readOnly value={gatewayBaseURL} onFocus={event => event.target.select()} /><Button type="button" variant="outline" aria-label="Copy Niu base URL" onClick={() => void copyValue('Niu base URL', gatewayBaseURL)}><Copy size={15} /></Button></div>
            </div>
            <div className="agent-connect-copy-field">
              <Label htmlFor="agent-model-value">Model alias</Label>
              <div><Input id="agent-model-value" className="mono" readOnly value={selectedAlias} onFocus={event => event.target.select()} /><Button type="button" variant="outline" aria-label="Copy model alias" onClick={() => void copyValue('Model alias', selectedAlias)}><Copy size={15} /></Button></div>
            </div>
            <div className="agent-connect-code-heading"><strong>{agent.name} setup</strong><Button type="button" variant="outline" size="sm" onClick={() => void copyValue(`${agent.name} setup`, routeExample)}><Copy size={15} />Copy setup</Button></div>
            <pre className="agent-connect-code"><code>{routeExample}</code></pre>
            <p className="agent-connect-security"><Shield size={15} />Paste the key at the hidden prompt. It is passed only to this process. {agent.id === 'codex' ? 'Codex manages and refreshes its ChatGPT sign-in; Niu does not store that token.' : 'Niu pins the route and ignores Aider project configuration and .env files.'}</p>
            {routeKeyModel !== null && <p className="agent-connect-key-management">This key is scoped to <code>{routeKeyModel}</code>. <Link to="../keys">Manage or revoke it in Workspace keys</Link></p>}
          </>}
        </section> : <section className="agent-connect-setup" aria-labelledby="claude-setup-title">
          <div className="agent-connect-setup-title"><div><h3 id="claude-setup-title">Collect Claude Code activity</h3><p>Only the wrapped Claude Code process sends telemetry to Niu.</p></div><Badge variant="outline">Keeps current sign-in</Badge></div>
          {!canWrite && <p className="operator-read-only-note">This session can view setup but cannot issue or revoke a collector key.</p>}
          {canWrite && <Button disabled={busy} onClick={() => void mutate(async () => {
            const issued = await issueExecutionCollectorKey(token, scope);
            setCollectorSecret(issued);
            await reloadCollectorKeys();
            setNotice('Activity key created. Copy it now; Niu will not show it again.');
            setCopyNotice('');
          })}><KeyRound size={16} />Create activity key</Button>}
          {collectorSecret && <div className="agent-connect-secret">
            <Label htmlFor="claude-collector-key">Activity key · shown once</Label>
            <div><Input id="claude-collector-key" className="mono" readOnly value={collectorSecret.token} onFocus={event => event.target.select()} /><Button type="button" variant="outline" onClick={() => void copyValue('Activity key', collectorSecret.token)}><Copy size={15} />Copy key</Button><Button type="button" variant="ghost" aria-label="Dismiss activity key" onClick={() => setCollectorSecret(null)}><X size={16} /></Button></div>
          </div>}
          <div className="agent-connect-code-heading"><strong>Run from a Niu source checkout</strong><Button type="button" variant="outline" size="sm" onClick={() => void copyValue('Claude Code setup', collectExample)}><Copy size={15} />Copy setup</Button></div>
          <pre className="agent-connect-code"><code>{collectExample}</code></pre>
          <p className="agent-connect-package-note">The preview CLI is not published yet. Build it from the Niu source checkout before running this command.</p>
          <div className="agent-connect-collection-note"><Check size={15} /><span>Prompts and tool content stay off. Activity is external, partial evidence; it does not appear as a Niu Gateway request or prove task acceptance.</span></div>
          <div className="agent-collector-key-list"><div className="agent-collector-key-heading"><strong>Activity keys</strong><span>{activeCollectorKeys.length}</span></div>
            {activeCollectorKeys.length === 0 ? <p className="empty-state">No active Claude Code activity keys.</p> : <ul>{activeCollectorKeys.map(key => <li key={key.id}>
              <span><strong>{key.name}</strong><small>Expires {new Date(key.expires_at_ms).toLocaleDateString()}</small></span>
              {canWrite && <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => void mutate(async () => {
                await revokeExecutionCollectorKey(token, scope, key.id);
                await reloadCollectorKeys();
                if (collectorSecret?.id === key.id) setCollectorSecret(null);
                setNotice('Activity key revoked.');
              })}>Revoke</Button>}
            </li>)}</ul>}
          </div>
        </section>}
        {copyNotice && <p className="agent-connect-copy-status" role="status">{copyNotice}</p>}
      </section>
    </div>
  </div>;
}

function shellQuote(value: string) {
  return `'${value.replace(/'/g, "'\\''")}'`;
}
