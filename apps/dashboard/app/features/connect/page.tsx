import { useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router';
import { ChevronsUpDown, Check } from 'lucide-react';
import { useDashboardContext } from '@/shell/dashboard-context';
import { useLocale } from '@/shell/ui-locale';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuCheckboxItem, DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { FormSectionSkeleton } from '@/components/PageSkeletons';
import { request } from '@/lib/api-client';

type Grant = { client_name: string; state: string; capabilities?: string[] };
class RequestLoadError extends Error {}
export default function ConnectAgent() {
  const context = useDashboardContext();
  const { t, isZh } = useLocale();
  const [query, setQuery] = useSearchParams();
  const code = (query.get('code') ?? '').replace(/[^0-9A-Za-z]/g, '').toUpperCase();
  const [manualCode, setManualCode] = useState('');
  const [grant, setGrant] = useState<Grant | null>(null);
  const [workspaceId, setWorkspaceId] = useState('');
  const [consent, setConsent] = useState(false);
  const [invocationAllowed, setInvocationAllowed] = useState(false);
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
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
  const workspace = context.workspaces.find(item => item.id === workspaceId);
  const modelScope = `${context.token}:${code}:${workspace?.organization_id ?? ''}:${workspaceId}`;
  const invocationReady = !invocationAllowed || (catalog.scope === modelScope && catalog.status === 'ready'
    && selectedModels.length > 0 && selectedModels.every(model => catalog.models.includes(model)));
  const headers = { authorization: `Bearer ${context.token}`, 'content-type': 'application/json' };
  useEffect(() => {
    const controller = new AbortController();
    setGrant(null); setError(''); setLoading(true); setConsent(false); setInvocationAllowed(false); setSelectedModels([]);
    if (!validCode) { setError(t('Open the verification link supplied by your agent.', '请打开 Agent 提供的验证链接。')); setLoading(false); return; }
    void fetch(`/api/v1/auth/agents/${code}`, { headers: { authorization: `Bearer ${context.token}` }, signal: controller.signal })
      .then(async response => { if (!response.ok) throw new RequestLoadError(response.status === 401 ? t('Sign in again to review this connection.', '请重新登录以审核连接。') : response.status === 404 ? t('This request is unavailable or expired. Ask your agent to start again.', '请求不可用或已过期，请让 Agent 重新发起。') : t('Could not load the request. Try again.', '无法加载请求，请重试。')); return response.json(); })
      .then(result => { if (!controller.signal.aborted) setGrant(result.data); })
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
  function submitManualCode(event: FormEvent) {
    event.preventDefault();
    const cleaned = manualCode.replace(/[^0-9A-Za-z]/g, '').toUpperCase();
    if (!cleaned) return;
    setQuery({ code: cleaned }, { replace: true });
  }
  async function decide(approve: boolean) {
    if (!workspace || pending || !grant || (approve && (!consent || unsupported || !invocationReady))) return;
    setPending(true); setError('');
    try {
      const response = await fetch(`/api/v1/auth/agents/${code}`, { method: 'POST', headers, body: JSON.stringify({ approve, organization_id: workspace.organization_id, workspace_id: workspace.id, allowed_models: invocationAllowed ? selectedModels : ['*'], ttl_seconds: 3600, invocation_allowed: invocationAllowed }) });
      if (!response.ok) throw new Error(t('The decision was not confirmed. Reload the request before trying again.', '未能确认操作结果，请重新加载请求后再试。'));
      setGrant({ ...grant, state: approve ? 'approved' : 'denied' });
    } catch (cause) { setError(cause instanceof Error ? cause.message : t('Could not save your decision.', '无法保存决定。')); }
    finally { setPending(false); }
  }
  const terminal = grant && grant.state !== 'pending';
  const canApprove = context.session?.kind === 'operator' && context.session.permissions.write;
  return <main className="min-h-screen bg-background px-5 py-12 sm:py-20">
    <section className="mx-auto w-full max-w-lg space-y-7" aria-labelledby="connect-title">
      <a href="/" className="text-xl font-semibold">Niu</a>
      <header className="space-y-3"><h1 id="connect-title" className="text-2xl font-semibold">{t('Connect your agent', '连接你的 Agent')}</h1>
        <p className="text-sm text-muted-foreground">{t('Review the request from your coding agent. Your account password stays in Niu.', '审核 coding agent 的请求。账户密码仅用于登录 Niu。')}</p></header>
      {loading && <FormSectionSkeleton fields={2} label={t('Loading connection request…', '正在加载连接请求…')} />}
      {error && (
        <div role="alert" className="space-y-4 text-sm">
          <p>{error}</p>
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
      {terminal && <div role="status" className="space-y-3"><Check aria-hidden="true" /><h2 className="font-semibold">{grant.state === 'denied' ? t('Connection declined', '已拒绝连接') : t('Authorization approved', '已批准授权')}</h2><p className="text-sm text-muted-foreground">{grant.state === 'denied' ? t('Your agent has not been granted access.', '尚未向 Agent 授予访问权限。') : t('Return to your agent. It will verify the connection. You can revoke the issued key in the workspace API keys page.', '返回 Agent，它将验证连接。你可以在工作空间 API 密钥页面撤销签发的密钥。')}</p></div>}
      {grant && !terminal && <>
        <p className="text-sm text-muted-foreground">{t('Check that this code matches the request in your agent:', '请确认此验证码与你的 Agent 中显示的一致：')} <code className="font-mono font-medium text-foreground">{code.match(/.{1,4}/g)?.join('-')}</code></p>
        <dl className="space-y-4 text-sm"><div><dt className="text-muted-foreground">{t('Client name (reported)', '客户端自报名称')}</dt><dd className="mt-1 font-medium">{grant.client_name}</dd></div><div><dt className="text-muted-foreground">{t('Signed in as', '当前账户')}</dt><dd className="mt-1">{context.session?.profile?.name || t('Your Niu account', '你的 Niu 账户')}</dd></div></dl>
        <div className="space-y-2"><Label>{t('Workspace', '工作空间')}</Label><DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" className="w-full justify-between" disabled={pending || !canApprove}>{workspace?.name || t('Choose a workspace', '选择工作空间')}<ChevronsUpDown size={16} /></Button></DropdownMenuTrigger><DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)]"><DropdownMenuRadioGroup value={workspaceId} onValueChange={value => { setWorkspaceId(value); setConsent(false); setInvocationAllowed(false); }}>{context.workspaces.map(item => <DropdownMenuRadioItem key={item.id} value={item.id}>{item.name}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu></div>
        {workspace?.organization_name && <p className="text-sm text-muted-foreground">{t('Organization', '组织')}: {workspace.organization_name}</p>}
        {!canApprove && <p role="alert" className="text-sm">{t('Sign in with an account that can manage this workspace. Installation credentials cannot approve a personal agent connection.', '请使用有权管理该工作空间的账户登录。安装凭据不能批准个人 Agent 连接。')}</p>}
        <div className="space-y-3 text-sm"><h2 className="font-medium">{t('Requested access · 1 hour', '请求权限 · 1 小时')}</h2><p>{t('Discover available workspace models and read request evidence. Model calls require separate approval below.', '发现工作空间可用模型并读取请求证据。模型调用需要在下方单独批准。')}</p><p className="text-muted-foreground">{t('This connection does not grant platform administration or access to other workspaces.', '此连接不授予平台管理权限或其他工作空间的访问权。')}</p></div>
        <div className="space-y-2 text-sm">
          <div className="flex items-start gap-3"><Checkbox id="agent-invocation" checked={invocationAllowed} disabled={pending || !workspace || !canApprove} onCheckedChange={value => { setInvocationAllowed(value === true); setConsent(false); }} /><Label htmlFor="agent-invocation">{t('Allow model calls', '允许调用模型')}</Label></div>
          <p className="text-muted-foreground">{invocationAllowed
            ? t('Only selected models can be called. New models require a new authorization. Calls may incur charges under existing workspace limits; this approval does not set a separate trial budget.', '仅允许调用所选模型。新增模型需要重新授权。调用可能产生费用，受现有工作空间限额约束；本次授权不设置独立试用预算。')
            : t('Model calls are blocked. Your agent can use the discovery and management access approved here.', '模型调用将被禁止。Agent 可以使用本次批准的发现与管理权限。')}</p>
          {invocationAllowed && <div className="space-y-2">
            {catalog.scope !== modelScope || catalog.status === 'loading' ? <p role="status">{t('Loading workspace models…', '正在加载工作空间模型…')}</p>
              : catalog.status === 'error' ? <div role="alert" className="space-y-2"><p>{t('Could not load workspace models. Retry, or turn off model calls to continue with management access.', '无法加载工作空间模型。请重试，或关闭模型调用以继续授予管理权限。')}</p><Button variant="outline" disabled={pending} onClick={() => { setConsent(false); setModelRetry(value => value + 1); }}>{t('Retry model list', '重新加载模型列表')}</Button></div>
              : !catalog.models.length ? <p role="status">{t('No models are available in this workspace. Turn off model calls to continue with management access.', '该工作空间暂无可用模型。关闭模型调用后可继续授予管理权限。')}</p>
              : <>
                <Label>{t('Allowed models', '允许的模型')}</Label>
                <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" className="w-full justify-between" disabled={pending} aria-label={t('Allowed models', '允许的模型')}>{selectedModels.length === 1 ? t('1 model selected', '已选择 1 个模型') : selectedModels.length ? t(`${selectedModels.length} models selected`, `已选择 ${selectedModels.length} 个模型`) : t('Choose models', '选择模型')}<ChevronsUpDown size={16} /></Button></DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)] max-w-[calc(100vw-2rem)]">
                    <div className="p-2"><Input aria-label={t('Filter models', '筛选模型')} placeholder={t('Filter models', '筛选模型')} value={modelQuery} onChange={event => setModelQuery(event.target.value)} onKeyDown={event => {
                      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                        event.preventDefault(); event.stopPropagation();
                        const items = event.currentTarget.closest('[role="menu"]')?.querySelectorAll<HTMLElement>('[role="menuitemcheckbox"]:not([data-disabled])');
                        (event.key === 'ArrowDown' ? items?.[0] : items?.[items.length - 1])?.focus();
                      } else if (event.key !== 'Escape' && event.key !== 'Tab') event.stopPropagation();
                    }} /></div>
                    <DropdownMenuItem onSelect={event => { event.preventDefault(); setSelectedModels(catalog.models); setConsent(false); }}>{t('Select all current models', '选择当前所有模型')}</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    {catalog.models.filter(model => model.toLocaleLowerCase().includes(modelQuery.trim().toLocaleLowerCase())).map(model => <DropdownMenuCheckboxItem key={model} checked={selectedModels.includes(model)} onSelect={event => event.preventDefault()} onCheckedChange={checked => { setSelectedModels(current => checked ? [...current, model] : current.filter(value => value !== model)); setConsent(false); }}>{model}</DropdownMenuCheckboxItem>)}
                    {!catalog.models.some(model => model.toLocaleLowerCase().includes(modelQuery.trim().toLocaleLowerCase())) && <DropdownMenuItem disabled>{t('No matching models', '没有匹配的模型')}</DropdownMenuItem>}
                  </DropdownMenuContent>
                </DropdownMenu>
                <p className="text-muted-foreground">{t('Custom routing can use only these backing models.', '自定义路由仅可使用这些底层模型。')}</p>
              </>}
          </div>}
        </div>
        {Boolean(grant.capabilities?.length) && <div className="space-y-2 text-sm"><h2 className="font-medium">{t('Additional management access', '额外管理权限')}</h2><ul className="list-disc space-y-1 pl-5">{grant.capabilities?.map(capability => <li key={capability}>{capabilityLabels[capability] || t('Unrecognized permission — decline this request.', '无法识别的权限，请拒绝此请求。')}</li>)}</ul></div>}
        <div className="flex items-start gap-3"><Checkbox id="agent-consent" checked={consent} disabled={pending || !workspace || !canApprove || unsupported || !invocationReady} onCheckedChange={value => setConsent(value === true)} /><Label htmlFor="agent-consent" className="text-sm leading-5">{t('I recognize this request and approve this access.', '我确认此请求由我发起，并批准上述访问。')}</Label></div>
        <div className="flex gap-3"><Button disabled={!canApprove || !workspace || !consent || pending || Boolean(error) || unsupported || !invocationReady} onClick={() => void decide(true)}>{pending ? t('Saving…', '正在保存…') : t('Authorize agent', '授权 Agent')}</Button><Button variant="outline" disabled={!canApprove || !workspace || pending || Boolean(error)} onClick={() => void decide(false)}>{t('Decline', '拒绝')}</Button></div>
      </>}
    </section>
  </main>;
}
