import { authenticatedFetch as fetch } from '@/lib/authenticated-fetch';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ChevronsUpDown, Check, ChevronDown } from 'lucide-react';
import { useDashboardContext } from '@/shell/dashboard-context';
import { organizationDisplayName, resolveWorkspacePathSegment, workspacePathSegment } from '@/shell/workspace-route';
import { useBranding } from '@/shell/branding';
import { useLocale } from '@/shell/ui-locale';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuCheckboxItem, DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { FormSectionSkeleton } from '@/components/PageSkeletons';
import { catalogTitle } from '@/lib/providers';
import { request } from '@/lib/api-client';

type Grant = { client_name: string; state: string; capabilities?: string[]; task?: string | null };
const ALL_PROTOCOLS = ['chat', 'responses', 'messages', 'content', 'decisions', 'embeddings', 'video'];
class RequestLoadError extends Error {}
type ApprovedSummary = {
  clientName: string;
  workspaceName: string;
  ttlLabel: string;
  invocationAllowed: boolean;
  models: string[];
  protocols: string[];
  capabilities: string[];
};

const TTL_OPTIONS = [
  { seconds: 900, en: '15 minutes', zh: '15 分钟' },
  { seconds: 3600, en: '1 hour', zh: '1 小时' },
  { seconds: 28800, en: '8 hours', zh: '8 小时' },
  { seconds: 86400, en: '24 hours', zh: '24 小时' },
] as const;

export default function ConnectAgent() {
  const context = useDashboardContext();
  const { settings, logo } = useBranding();
  const { t, isZh } = useLocale();
  const [query, setQuery] = useSearchParams();
  const code = (query.get('code') ?? '').replace(/[^0-9A-Za-z]/g, '').toUpperCase();
  const workspaceHint = (query.get('workspace') ?? '').trim();
  const [manualCode, setManualCode] = useState('');
  const [grant, setGrant] = useState<Grant | null>(null);
  const [workspaceId, setWorkspaceId] = useState('');
  const [consent, setConsent] = useState(false);
  const [invocationAllowed, setInvocationAllowed] = useState(false);
  const [invocationProtocols, setInvocationProtocols] = useState<string[]>(ALL_PROTOCOLS);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [ttlSeconds, setTtlSeconds] = useState<number>(3600);
  const [approvedCapabilities, setApprovedCapabilities] = useState<string[]>([]);
  const [approvedSummary, setApprovedSummary] = useState<ApprovedSummary | null>(null);
  const [catalog, setCatalog] = useState<{scope: string; status: 'loading' | 'ready' | 'error'; models: string[]}>({scope: '', status: 'loading', models: []});
  const [modelRetry, setModelRetry] = useState(0);
  const [modelQuery, setModelQuery] = useState('');
  const [pending, setPending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const validCode = /^[0-9A-F]{12}$/.test(code);
  const capabilityLabels: Record<string, string> = {
    'pools:read': t('Read workspace model routing', '读取工作空间模型路由'),
    'pools:write': t('Create and change workspace model routing', '创建和修改工作空间模型路由'),
    'events:read': t('Read workspace event subscriptions and delivery status', '读取工作空间事件订阅与投递状态'),
    'events:write': t('Create and change workspace event subscriptions', '创建和修改工作空间事件订阅'),
    'evaluations:read': t('Read workspace evaluation evidence', '读取工作空间评估证据'),
    'evaluations:write': t('Record workspace evaluation evidence', '记录工作空间评估证据'),
  };
  const unsupported = Boolean(grant?.capabilities?.some(capability => !capabilityLabels[capability]));
  const protocolLabels: Record<string, string> = {
    chat: t('Chat completions', 'Chat 补全'),
    responses: t('Responses', 'Responses'),
    messages: t('Messages', 'Messages'),
    content: t('GenerateContent', 'GenerateContent'),
    decisions: t('Structured decisions', '结构化决策'),
    embeddings: t('Embeddings', 'Embeddings'),
    video: t('Video', '视频'),
  };
  const workspace = context.workspaces.find(item => item.id === workspaceId);
  const modelScope = `${context.token}:${code}:${workspace?.organization_id ?? ''}:${workspaceId}`;
  const invocationReady = !invocationAllowed || (invocationProtocols.length > 0 && catalog.scope === modelScope && catalog.status === 'ready'
    && selectedModels.length > 0 && selectedModels.every(model => catalog.models.includes(model)));
  const headers = { authorization: `Bearer ${context.token}`, 'content-type': 'application/json' };
  useEffect(() => {
    const controller = new AbortController();
    setGrant(null); setError(''); setLoading(true); setConsent(false); setInvocationAllowed(false); setSelectedModels([]); setInvocationProtocols(ALL_PROTOCOLS); setAdvancedOpen(false); setTtlSeconds(3600); setApprovedCapabilities([]); setApprovedSummary(null);
    if (!code) { setLoading(false); return; }
    if (!validCode) { setError(t('Enter the 12-character verification code supplied by your agent.', '请输入 Agent 提供的 12 位验证码。')); setLoading(false); return; }
    void fetch(`/api/v1/auth/agents/${code}`, { headers: { authorization: `Bearer ${context.token}` }, signal: controller.signal })
      .then(async response => { if (!response.ok) throw new RequestLoadError(response.status === 401 ? t('Sign in again to review this connection.', '请重新登录以审核连接。') : response.status === 404 ? t('This request is unavailable or expired. Ask your agent to start again.', '请求不可用或已过期，请让 Agent 重新发起。') : t('Could not load the request. Try again.', '无法加载请求，请重试。')); return response.json(); })
      .then(result => { if (!controller.signal.aborted) { setGrant(result.data); setApprovedCapabilities(result.data.capabilities ?? []); } })
      .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof RequestLoadError ? cause.message : t('Could not load the request. Try again.', '无法加载请求，请重试。')); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [code, validCode, context.token, retry, isZh]);
  useEffect(() => {
    const controller = new AbortController();
    setSelectedModels([]); setConsent(false); setModelQuery('');
    setCatalog({scope: modelScope, status: 'loading', models: []});
    if (!invocationAllowed || !workspace?.id) return () => controller.abort();
    const query = new URLSearchParams({organization_id: workspace.organization_id, project_id: workspace.id});
    void request<{data: {id: string}[]}>(context.token, `/api/v1/models?${query}`, 'GET', undefined, controller.signal)
      .then(result => {
        if (!Array.isArray(result?.data) || result.data.some(model => !model || typeof model.id !== 'string' || !model.id.trim() || model.id === '*')) {
          throw new Error('Invalid model catalog');
        }
        if (!controller.signal.aborted) setCatalog({scope: modelScope, status: 'ready', models: [...new Set(result.data.map(model => model.id))].sort()});
      })
      .catch(() => { if (!controller.signal.aborted) setCatalog({scope: modelScope, status: 'error', models: []}); });
    return () => controller.abort();
  }, [invocationAllowed, modelScope, workspace?.id, workspace?.organization_id, context.token, modelRetry]);
  // A single available workspace is the common case. Preselecting it keeps the
  // ordinary connection review to the paid-invocation decision, while a
  // multi-workspace account still requires an explicit scope choice.
  useEffect(() => {
    if (grant?.state !== 'pending' || workspaceId) return;
    if (workspaceHint) {
      const hinted = resolveWorkspacePathSegment(workspaceHint, context.workspaces);
      if (hinted) {
        setWorkspaceId(hinted.id);
        return;
      }
    }
    if (context.workspaces.length === 1) {
      setWorkspaceId(context.workspaces[0].id);
    }
  }, [grant?.state, workspaceId, workspaceHint, context.workspaces]);
  function submitManualCode(event: FormEvent) {
    event.preventDefault();
    const cleaned = manualCode.replace(/[^0-9A-Za-z]/g, '').toUpperCase();
    if (!cleaned) return;
    setQuery(workspaceHint ? { code: cleaned, workspace: workspaceHint } : { code: cleaned }, { replace: true });
  }
  async function decide(approve: boolean) {
    if (pending || !grant || (approve && (!workspace || !consent || unsupported || !invocationReady))) return;
    setPending(true); setError('');
    try {
      const ttlOption = TTL_OPTIONS.find(item => item.seconds === ttlSeconds) ?? TTL_OPTIONS[1];
      const response = await fetch(`/api/v1/auth/agents/${code}`, { method: 'POST', headers, body: JSON.stringify(approve && workspace ? { approve: true, organization_id: workspace.organization_id, workspace_id: workspace.id, allowed_models: invocationAllowed ? selectedModels : ['*'], ttl_seconds: ttlSeconds, invocation_allowed: invocationAllowed, invocation_protocols: invocationAllowed ? invocationProtocols : ALL_PROTOCOLS, ...(grant.capabilities?.length ? { capabilities: approvedCapabilities } : {}) } : { approve: false }) });
      if (!response.ok) throw new Error(t('The decision was not confirmed. Reload the request before trying again.', '未能确认操作结果，请重新加载请求后再试。'));
      if (approve && workspace) {
        setApprovedSummary({
          clientName: grant.client_name,
          workspaceName: workspace.name,
          ttlLabel: t(ttlOption.en, ttlOption.zh),
          invocationAllowed,
          models: invocationAllowed ? [...selectedModels] : [],
          protocols: invocationAllowed ? [...invocationProtocols] : [],
          capabilities: [...approvedCapabilities],
        });
      }
      setGrant({ ...grant, state: approve ? 'approved' : 'denied' });
    } catch (cause) { setError(cause instanceof Error ? cause.message : t('Could not save your decision.', '无法保存决定。')); }
    finally { setPending(false); }
  }
  const selectedTtlOption = TTL_OPTIONS.find(item => item.seconds === ttlSeconds) ?? TTL_OPTIONS[1];
  const terminal = grant && grant.state !== 'pending';
  const canApprove = context.session?.kind === 'operator' && context.session.permissions.write;
  return <main className="min-h-screen bg-background px-5 py-12 sm:py-20">
    <section className="mx-auto w-full max-w-lg space-y-7" aria-labelledby="connect-title">
      <div className="flex items-center justify-between gap-3">
        <a href={import.meta.env.BASE_URL || '/'} className="inline-flex items-center gap-2 text-lg font-semibold"><img src={logo} alt="" className="size-6 shrink-0" /><span>{settings.display_name}</span></a>
        {context.session && <Button variant="ghost" size="sm" onClick={() => void context.signOut()}>{t('Sign out', '退出登录')}</Button>}
      </div>
      <header className="space-y-3"><h1 id="connect-title" className="text-2xl font-semibold">{t('Connect your agent', '连接你的 Agent')}</h1>
        <p className="text-sm text-muted-foreground">{t('Review the request from your coding agent. Your account password stays in Niu.', '审核 coding agent 的请求。账户密码仅用于登录 Niu。')}</p></header>
      {loading && <FormSectionSkeleton fields={2} label={t('Loading connection request…', '正在加载连接请求…')} />}
      {!loading && !error && !grant && !code && (
        <div className="space-y-4 text-sm">
          <p className="text-muted-foreground">{t('Enter the 12-character verification code shown by your coding agent, or open the verification link it provided.', '请输入编码 Agent 显示的 12 位验证码，或直接打开其提供的验证链接。')}</p>
          <form onSubmit={submitManualCode} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="agent-verification-code">{t('Verification code', '验证码')}</Label>
              <div className="flex flex-wrap gap-2">
                <Input
                  id="agent-verification-code"
                  value={manualCode}
                  onChange={event => setManualCode(event.target.value)}
                  placeholder={t('ABCD-1234-EF56', 'ABCD-1234-EF56')}
                  className="max-w-xs font-mono uppercase"
                  maxLength={20}
                />
                <Button type="submit" disabled={!manualCode.trim()}>
                  {t('Continue', '继续')}
                </Button>
              </div>
            </div>
          </form>
        </div>
      )}
      {error && (
        <div role="alert" className="space-y-4 text-sm">
          <p>{t(error)}</p>
          {!grant && (
            <form onSubmit={submitManualCode} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="agent-verification-code">{t('Verification code', '验证码')}</Label>
                <div className="flex flex-wrap gap-2">
                  <Input
                    id="agent-verification-code"
                    value={manualCode}
                    onChange={event => setManualCode(event.target.value)}
                    placeholder={t('ABCD-1234-EF56', 'ABCD-1234-EF56')}
                    className="max-w-xs font-mono uppercase"
                    maxLength={20}
                  />
                  <Button type="submit" disabled={!manualCode.trim()}>
                    {t('Continue', '继续')}
                  </Button>
                </div>
              </div>
            </form>
          )}
          {validCode && <Button variant="outline" disabled={pending} onClick={() => setRetry(value => value + 1)}>{t('Reload request', '重新加载请求')}</Button>}
        </div>
      )}
      {terminal && <div role="status" className="space-y-4 rounded-lg bg-muted/50 p-4">
        <div className="flex items-start gap-2.5">
          <Check className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <div className="space-y-1">
            <h2 className="font-semibold">{grant.state === 'denied' ? t('Connection declined', '已拒绝连接') : t('Authorization approved', '已批准授权')}</h2>
            <p className="text-sm text-muted-foreground">{grant.state === 'denied' ? t('Your agent has not been granted access.', '尚未向 Agent 授予访问权限。') : t('Return to your agent. It will verify the connection. You can revoke the issued key in the workspace keys page.', '返回 Agent，它将验证连接。你可以在工作空间密钥页面撤销签发的密钥。')}</p>
          </div>
        </div>
        {grant.state === 'approved' && approvedSummary && (
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div><dt className="text-xs text-muted-foreground">{t('Agent client', 'Agent 客户端')}</dt><dd className="font-medium">{approvedSummary.clientName}</dd></div>
            <div><dt className="text-xs text-muted-foreground">{t('Workspace', '工作空间')}</dt><dd className="font-medium">{approvedSummary.workspaceName}</dd></div>
            <div><dt className="text-xs text-muted-foreground">{t('Session duration', '授权有效期')}</dt><dd className="font-medium">{approvedSummary.ttlLabel}</dd></div>
            <div><dt className="text-xs text-muted-foreground">{t('Model calls', '模型调用')}</dt><dd className="font-medium">{approvedSummary.invocationAllowed ? t(`${approvedSummary.models.length} model(s)`, `已允许 ${approvedSummary.models.length} 个模型`) : t('Disabled (discovery only)', '已禁用（仅发现模型与读配置）')}</dd></div>
            {approvedSummary.capabilities.length > 0 && (
              <div className="sm:col-span-2"><dt className="text-xs text-muted-foreground">{t('Approved management access', '已批准的管理权限')}</dt><dd className="font-medium">{approvedSummary.capabilities.map(capability => capabilityLabels[capability] || capability).join(' · ')}</dd></div>
            )}
          </dl>
        )}
        {grant.state === 'approved' && workspace && <div><Button asChild variant="outline" size="sm"><Link to={`/workspaces/${workspacePathSegment(workspace, context.workspaces)}/keys`}>{t('Open API keys', '打开 API 密钥')}</Link></Button></div>}
      </div>}
      {grant && !terminal && <>
        <p className="text-sm text-muted-foreground">{t('Check that this code matches the request in your agent:', '请确认此验证码与你的 Agent 中显示的一致：')} <code className="font-mono font-medium text-foreground">{code.match(/.{1,4}/g)?.join('-')}</code></p>
        <dl className="space-y-4 text-sm"><div><dt className="text-muted-foreground">{t('Client name (reported)', '客户端自报名称')}</dt><dd className="mt-1 font-medium">{grant.client_name}</dd></div><div><dt className="text-muted-foreground">{t('Signed in as', '当前账户')}</dt><dd className="mt-1">{context.session?.profile?.name || t('Your Niu account', '你的 Niu 账户')}</dd></div></dl>
        <div className="space-y-2"><Label>{t('Workspace', '工作空间')}</Label><DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" className="w-full justify-between" disabled={pending || !canApprove}>{workspace?.name || t('Choose a workspace', '选择工作空间')}<ChevronsUpDown size={16} /></Button></DropdownMenuTrigger><DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)]"><DropdownMenuRadioGroup value={workspaceId} onValueChange={value => { setWorkspaceId(value); setConsent(false); setInvocationAllowed(false); }}>{context.workspaces.map(item => <DropdownMenuRadioItem key={item.id} value={item.id}>{item.name}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu></div>
        {workspace?.organization_name && <p className="text-sm text-muted-foreground">{t('Organization', '组织')}: {organizationDisplayName(workspace.organization_name)}</p>}
        {!canApprove && <p role="alert" className="text-sm">{t('Sign in with an account that can manage this workspace. Installation credentials cannot approve a personal agent connection.', '请使用有权管理该工作空间的账户登录。安装凭据不能批准个人 Agent 连接。')}</p>}
        <div className="space-y-2">
          <Label>{t('Session duration', '授权有效期')}</Label>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="w-full justify-between font-normal" disabled={pending || !canApprove} aria-label={t('Session duration', '授权有效期')}>
                <span>{t(selectedTtlOption.en, selectedTtlOption.zh)}</span>
                <ChevronsUpDown size={16} aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-(--radix-dropdown-menu-trigger-width)">
              <DropdownMenuRadioGroup value={String(ttlSeconds)} onValueChange={(value) => { setTtlSeconds(Number(value)); setConsent(false); }}>
                {TTL_OPTIONS.map((option) => (
                  <DropdownMenuRadioItem key={option.seconds} value={String(option.seconds)}>
                    {t(option.en, option.zh)}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="space-y-3 text-sm"><h2 className="font-medium">{t(`Requested access · ${selectedTtlOption.en}`, `请求权限 · ${selectedTtlOption.zh}`)}</h2><p>{t('Discover available workspace models and read request evidence. Model calls require separate approval below.', '发现工作空间可用模型并读取请求证据。模型调用需要在下方单独批准。')}</p><p className="text-muted-foreground">{t('This connection does not grant platform administration or access to other workspaces.', '此连接不授予平台管理权限或其他工作空间的访问权。')}</p></div>
        <div className="space-y-2 text-sm">
          <div className="flex items-start gap-3"><Checkbox id="agent-invocation" checked={invocationAllowed} disabled={pending || !workspace || !canApprove} onCheckedChange={value => { setInvocationAllowed(value === true); setConsent(false); }} /><Label htmlFor="agent-invocation">{t('Allow model calls', '允许调用模型')}</Label></div>
          <p className="text-muted-foreground">{invocationAllowed
            ? t('Only selected models can be called. New models require a new authorization. Calls may incur charges under existing workspace and key limits; this approval does not set a separate trial budget.', '仅允许调用所选模型。新增模型需要重新授权。调用可能产生费用，受现有工作空间和密钥限额约束；本次授权不设置独立试用预算。')
            : t('Model calls are blocked. Your agent can use the discovery and management access approved here.', '模型调用将被禁止。Agent 可以使用本次批准的发现与管理权限。')}</p>
          {invocationAllowed && <div className="space-y-2">
            {catalog.scope !== modelScope || catalog.status === 'loading' ? <p role="status">{t('Loading workspace models…', '正在加载工作空间模型…')}</p>
              : catalog.status === 'error' ? <div role="alert" className="space-y-2"><p>{t('Could not load workspace models. Retry, or turn off model calls to continue with management access.', '无法加载工作空间模型。请重试，或关闭模型调用以继续授予管理权限。')}</p><Button variant="outline" disabled={pending} onClick={() => { setConsent(false); setModelRetry(value => value + 1); }}>{t('Retry model list', '重新加载模型列表')}</Button></div>
              : !catalog.models.length ? <p role="status">{t('No models are available in this workspace. Turn off model calls to continue with management access.', '该工作空间暂无可用模型。关闭模型调用后可继续授予管理权限。')}</p>
              : <>
                <Label>{t('Allowed models', '允许的模型')}</Label>
                <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" className="w-full justify-between" disabled={pending} aria-label={t('Allowed models', '允许的模型')}>{selectedModels.length === 1 ? t('1 model selected', '已选择 1 个模型') : selectedModels.length ? t(`${selectedModels.length} models selected`, `已选择 ${selectedModels.length} 个模型`) : t('Choose models', '选择模型')}<ChevronsUpDown size={16} /></Button></DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="max-h-80 w-[var(--radix-dropdown-menu-trigger-width)] max-w-[calc(100vw-2rem)] overflow-y-auto">
                    <div className="p-2"><Input aria-label={t('Filter models', '筛选模型')} placeholder={t('Filter models', '筛选模型')} value={modelQuery} onChange={event => setModelQuery(event.target.value)} onKeyDown={event => {
                      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                        event.preventDefault(); event.stopPropagation();
                        const items = event.currentTarget.closest('[role="menu"]')?.querySelectorAll<HTMLElement>('[role="menuitemcheckbox"]:not([data-disabled])');
                        (event.key === 'ArrowDown' ? items?.[0] : items?.[items.length - 1])?.focus();
                      } else if (event.key !== 'Escape' && event.key !== 'Tab') event.stopPropagation();
                    }} /></div>
                    <DropdownMenuItem onSelect={event => { event.preventDefault(); setSelectedModels(catalog.models); setConsent(false); }}>{t('Select all current models', '选择当前所有模型')}</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    {catalog.models.filter(model => { const title = catalogTitle(model); const q = modelQuery.trim().toLocaleLowerCase(); return model.toLocaleLowerCase().includes(q) || title.toLocaleLowerCase().includes(q); }).map(model => { const found = context.models?.find(item => item.id === model); const title = found?.catalog?.name?.trim() ? catalogTitle(found) : model; return <DropdownMenuCheckboxItem key={model} checked={selectedModels.includes(model)} onSelect={event => event.preventDefault()} onCheckedChange={checked => { setSelectedModels(current => checked ? [...current, model] : current.filter(value => value !== model)); setConsent(false); }}>{title}{title !== model && <span className="sr-only"> {model}</span>}</DropdownMenuCheckboxItem>; })}
                    {!catalog.models.some(model => { const title = catalogTitle(model); const q = modelQuery.trim().toLocaleLowerCase(); return model.toLocaleLowerCase().includes(q) || title.toLocaleLowerCase().includes(q); }) && <DropdownMenuItem disabled>{t('No matching models', '没有匹配的模型')}</DropdownMenuItem>}
                  </DropdownMenuContent>
                </DropdownMenu>
                {selectedModels.length === 0 && <p className="text-muted-foreground">{t('Select at least one allowed model above, or turn off model calls.', '请在上方至少选择一个允许的模型，或关闭模型调用。')}</p>}
              </>}
          </div>}
        </div>
        <div className="space-y-1 text-sm">
          <h2 className="font-medium">{t('Spending boundary', '费用边界')}</h2>
          <p className="text-muted-foreground">{invocationAllowed
            ? t('Model calls use existing workspace and key spending limits. This connection does not add a separate trial budget or cap owner-funded Provider expense.', '模型调用受现有工作空间和密钥限额约束。本次连接不新增独立试用预算，也不限制由所有者承担的上游费用。')
            : t('No model calls are authorized, so this connection cannot create inference charges.', '未授权模型调用，因此此连接不会产生推理费用。')}</p>
        </div>
        {Boolean(grant.capabilities?.length) && <div className="space-y-1 text-sm"><p className="font-medium">{t('This connection also requests workspace management access:', '此连接还申请工作空间管理权限：')}</p><p className="text-muted-foreground">{approvedCapabilities.length ? approvedCapabilities.map(capability => capabilityLabels[capability] || t('Unrecognized permission — decline this request.', '无法识别的权限，请拒绝此请求。')).join(' · ') : t('All requested management permissions unchecked (discovery only).', '已取消勾选所有申请的管理权限（仅保留模型发现与读取）。')}</p><p className="text-muted-foreground">{t('You can narrow these permissions under Advanced options before authorizing.', '授权前可在高级选项中按需缩减这些权限范围。')}</p></div>}
        <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
          <CollapsibleTrigger asChild>
            <Button type="button" variant="ghost" size="sm" className="-ml-2" aria-expanded={advancedOpen}>
              <ChevronDown size={16} className={advancedOpen ? 'rotate-180 transition-transform' : 'transition-transform'} />
              {advancedOpen ? t('Hide advanced options', '隐藏高级选项') : t('Advanced options', '高级选项')}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-4 rounded-md border bg-muted/30 p-4 text-sm">
            <div className="space-y-1">
              <h2 className="font-medium">{t('Requested task', '请求任务')}</h2>
              <p className="text-muted-foreground">{grant.task || t('No task description was supplied by the client.', '客户端未提供任务说明。')}</p>
            </div>
            {Boolean(grant.capabilities?.length) && <div className="space-y-2">
              <h2 className="font-medium">{t('Additional management access', '额外管理权限')}</h2>
              <div className="space-y-2">{grant.capabilities?.map((capability) => {
                const label = capabilityLabels[capability] || t('Unrecognized permission — decline this request.', '无法识别的权限，请拒绝此请求。');
                const checked = approvedCapabilities.includes(capability);
                const id = `agent-capability-${capability.replace(/[^a-z0-9]/gi, '-')}`;
                return (
                  <div key={capability} className="flex items-center gap-2">
                    <Checkbox
                      id={id}
                      checked={checked}
                      disabled={pending || !canApprove}
                      onCheckedChange={(value) => {
                        setApprovedCapabilities((current) =>
                          value === true
                            ? (grant.capabilities ?? []).filter((item) => item === capability || current.includes(item))
                            : current.filter((item) => item !== capability),
                        );
                        setConsent(false);
                      }}
                    />
                    <Label htmlFor={id} className="font-normal">
                      {label}
                    </Label>
                  </div>
                );
              })}</div>
            </div>}
            {invocationAllowed && <div className="space-y-2">
              <h2 className="font-medium">{t('Model interfaces', '模型接口')}</h2>
              <p className="text-muted-foreground">{t('Unchecked interfaces are denied even when model calls are allowed.', '即使允许模型调用，未勾选的接口也会被拒绝。')}</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {ALL_PROTOCOLS.map(protocol => <div key={protocol} className="flex items-center gap-2">
                  <Checkbox id={`agent-protocol-${protocol}`} checked={invocationProtocols.includes(protocol)} disabled={pending} onCheckedChange={value => { setInvocationProtocols(current => value === true ? [...current, protocol] : current.filter(item => item !== protocol)); setConsent(false); }} />
                  <Label htmlFor={`agent-protocol-${protocol}`} className="font-normal">{protocolLabels[protocol]}</Label>
                </div>)}
              </div>
              {invocationProtocols.length === 0 && <p role="alert">{t('Select at least one interface, or turn off model calls.', '请至少选择一个接口，或关闭模型调用。')}</p>}
            </div>}
            <div className="space-y-1">
              <h2 className="font-medium">{t('Spending basis', '计费基础')}</h2>
              <p className="text-muted-foreground">{t('Customer charges are enforced against existing workspace and key spending limits. Owner-funded upstream Provider expense is not capped by this approval, and no such cap is claimed.', '客户费用受现有工作空间和密钥支出限额约束。本次授权不限制由所有者承担的上游 Provider 费用，也不作此声明。')}</p>
            </div>
            <div className="space-y-1">
              <h2 className="font-medium">{t('Expansion policy', '扩展规则')}</h2>
              <p className="text-muted-foreground">{t('Allowed model names, model interfaces and management operations are fixed at approval. New models, interfaces or operations require a new authorization from a current workspace owner.', '允许的模型名称、模型接口和管理操作在批准时固定。新增模型、接口或操作需要当前工作空间所有者重新授权。')}</p>
            </div>
          </CollapsibleContent>
        </Collapsible>
        {invocationAllowed && invocationProtocols.length === 0 && <p role="alert" className="text-sm">{t('Select at least one model interface under Advanced options, or turn off model calls.', '请在高级选项中至少选择一个模型接口，或关闭模型调用。')}</p>}
        <div className="flex items-start gap-3"><Checkbox id="agent-consent" checked={consent} disabled={pending || !workspace || !canApprove || unsupported || !invocationReady} onCheckedChange={value => setConsent(value === true)} /><Label htmlFor="agent-consent" className="text-sm leading-5">{t('I recognize this request and approve this access.', '我确认此请求由我发起，并批准上述访问。')}</Label></div>
        <div className="flex gap-3"><Button disabled={!canApprove || !workspace || !consent || pending || Boolean(error) || unsupported || !invocationReady} onClick={() => void decide(true)}>{pending ? t('Saving…', '正在保存…') : t('Authorize agent', '授权 Agent')}</Button><Button variant="outline" disabled={!canApprove || pending || Boolean(error)} onClick={() => void decide(false)}>{t('Decline', '拒绝')}</Button></div>
      </>}
    </section>
  </main>;
}
