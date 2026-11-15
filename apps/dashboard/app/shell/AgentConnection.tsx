import { useState } from 'react';
import { Link, useInRouterContext } from 'react-router';
import { ChevronsUpDown, KeyRound } from 'lucide-react';
import { IconCheck, IconCopy, IconPlugConnected } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import { SidebarMenuButton } from '@/components/ui/sidebar';
import { Textarea } from '@/components/ui/textarea';
import type { DashboardContext } from './dashboard-context';
import { useLocale } from './ui-locale';
import { workspacePathSegment } from './workspace-route';

type TaskPresetId = 'discover' | 'routing' | 'evaluate' | 'events' | 'integrate';

const TASK_PRESETS: Array<{ id: TaskPresetId; doc: string; capabilities: readonly string[]; en: string; zh: string; taskEn: string; taskZh: string }> = [
  {
    id: 'discover',
    doc: '/docs/agents.md',
    capabilities: [],
    en: 'Connect & inspect models',
    zh: '连接并检查可用模型',
    taskEn: 'Read authorized capabilities and list usable workspace models and customer pricing.',
    taskZh: '读取已授权权限与额度边界，并列出工作空间可用模型与客户定价。',
  },
  {
    id: 'routing',
    doc: '/docs/routing.md',
    capabilities: ['pools:read', 'pools:write'],
    en: 'Configure workspace routing',
    zh: '配置工作空间路由策略',
    taskEn: 'Preview and configure a workspace routing policy (pool/<slug>) across eligible models.',
    taskZh: '预览并配置工作空间路由策略（pool/<slug>），对比优先级、价格或 Auto 路由。',
  },
  {
    id: 'evaluate',
    doc: '/docs/evaluations.md',
    capabilities: ['evaluations:read', 'evaluations:write'],
    en: 'Evaluate & compare models',
    zh: '评估与对比候选模型',
    taskEn: 'Define a task evaluation rubric, fingerprint samples, and compare verified runs across models.',
    taskZh: '创建任务评估标准与样本指纹，并在多模型间运行与对比真实评估回执。',
  },
  {
    id: 'events',
    doc: '/docs/events.md',
    capabilities: ['events:read'],
    en: 'Inspect traces & events',
    zh: '排查请求诊断与资源事件',
    taskEn: 'Inspect generation attempt billing/diagnostics and poll workspace events or webhooks.',
    taskZh: '通过 generation attempt_id 排查请求计费与诊断信息，并读取工作空间事件与投递状态。',
  },
  {
    id: 'integrate',
    doc: '/docs/inference.md',
    capabilities: [],
    en: 'Wire inference into my app',
    zh: '将模型推理接入我的应用',
    taskEn: 'Configure app endpoints (/v1/chat/completions, /v1/responses, /v1/messages) and error handling.',
    taskZh: '将 Niu 多协议推理接口（/v1/chat/completions、/v1/responses、/v1/messages）接入应用代码。',
  },
];

export default function AgentConnection({ context, sidebar = false }: { context: DashboardContext; sidebar?: boolean }) {
  const { t } = useLocale();
  const inRouter = useInRouterContext();
  const { workspace, workspaces } = context;
  const [open, setOpen] = useState(false);
  const [preset, setPreset] = useState<TaskPresetId>('discover');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(false);

  const origin = window.location.origin + import.meta.env.BASE_URL.replace(/\/$/, '');
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
  const workspaceSlug = workspace ? workspacePathSegment(workspace, workspaces) : '';
  const workspaceUrl = workspaceSlug ? `${origin}/workspaces/${encodeURIComponent(workspaceSlug)}` : '';
  const selected = TASK_PRESETS.find((item) => item.id === preset) ?? TASK_PRESETS[0];
  const connectParams = workspaceSlug ? `?workspace=${encodeURIComponent(workspaceSlug)}` : '';
  const capabilityJsonHint = selected.capabilities.length > 0 ? JSON.stringify(selected.capabilities) : '';
  const capabilityFlags = selected.capabilities.map((cap) => `--capability ${cap}`).join(' ');
  const postHintEn = capabilityJsonHint ? ` with capabilities ${capabilityJsonHint}` : '';
  const postHintZh = capabilityJsonHint ? `（附带 capabilities ${capabilityJsonHint}）` : '';
  const loginArgs = [workspaceSlug ? `--workspace ${workspaceSlug}` : '', capabilityFlags].filter(Boolean).join(' ');
  const loginHint = loginArgs ? ` ${loginArgs}` : '';

  const prompt = t(
    `Connect to Niu at ${origin}.${workspaceUrl ? ` Workspace: ${workspaceSlug} (${workspaceUrl}).` : ''} First read ${origin}/llms.txt, ${origin}/docs/install.md, and ${origin}${selected.doc}. Goal: ${selected.taskEn} Request browser device authorization via POST ${origin}/api/v1/auth/agents${postHintEn} (or niu-login${loginHint}) and ask me to approve access at ${origin}/connect${connectParams} (pass ?code=<code>${workspaceSlug ? `&workspace=${workspaceSlug}` : ''}). After approval, inspect /v1/key and /v1/models before taking action. Do not send paid model requests without my authorization.`,
    `请连接到位于 ${origin} 的 Niu。${workspaceUrl ? `工作空间：${workspaceSlug}（${workspaceUrl}）。` : ''}请先阅读 ${origin}/llms.txt、${origin}/docs/install.md 与 ${origin}${selected.doc}。本次目标：${selected.taskZh} 请通过 POST ${origin}/api/v1/auth/agents${postHintZh}（或 niu-login${loginHint}）发起浏览器设备授权，并引导我在 ${origin}/connect${connectParams}（附带 ?code=<code>${workspaceSlug ? `&workspace=${workspaceSlug}` : ''}）确认授权。授权后先检查 /v1/key 与 /v1/models。未经我明确授权，不要发送任何付费模型请求。`,
  );

  const keysRoute = workspaceSlug ? `/workspaces/${encodeURIComponent(workspaceSlug)}/keys` : '/workspaces';

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        setCopied(false);
        setError(false);
      }}
    >
      <DialogTrigger asChild>
        {sidebar ? (
          <SidebarMenuButton tooltip={t('Connect your agent', '连接你的 Agent')} aria-label={t('Connect your agent', '连接你的 Agent')}>
            <IconPlugConnected />
            <span>{t('Connect your agent', '连接你的 Agent')}</span>
          </SidebarMenuButton>
        ) : (
          <Button variant="secondary" className="justify-start">
            <IconPlugConnected />
            {t('Connect your agent', '连接你的 Agent')}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t('Connect your agent', '连接你的 Agent')}</DialogTitle>
          <DialogDescription>
            {t(
              'Give this request to Claude Code, Codex, DeepSeek Harness, Cursor, Windsurf, or any coding agent. It negotiates browser approval in /connect without handling your password.',
              '将此接入请求发送给 Claude Code、Codex、DeepSeek Harness、Cursor、Windsurf 或任意编码 Agent。它会通过 /connect 发起受控浏览器授权，无需接触你的登录密码。',
            )}
          </DialogDescription>
        </DialogHeader>

        <ol className="grid gap-1.5 rounded-lg bg-muted/50 px-3 py-2.5 text-xs text-muted-foreground sm:grid-cols-3">
          <li>1. {t('Pick a task goal', '选择任务目标')}</li>
          <li>2. {t('Paste into your coding agent', '粘贴给编码 Agent')}</li>
          <li>3. {t('Approve scope in /connect', '在浏览器中确认权限')}</li>
        </ol>

        <div className="space-y-1.5">
          <Label>{t('Task goal', '任务目标')}</Label>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="w-full justify-between font-normal" aria-label={t('Task goal', '任务目标')}>
                <span className="truncate">{t(selected.en, selected.zh)}</span>
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-60" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-(--radix-dropdown-menu-trigger-width)">
              <DropdownMenuRadioGroup
                value={preset}
                onValueChange={(value) => {
                  setPreset(value as TaskPresetId);
                  setCopied(false);
                  setError(false);
                }}
              >
                {TASK_PRESETS.map((item) => (
                  <DropdownMenuRadioItem key={item.id} value={item.id}>
                    {t(item.en, item.zh)}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="agent-setup-request">{t('Agent setup request', 'Agent 接入请求')}</Label>
          <Textarea id="agent-setup-request" readOnly rows={7} className="resize-none" value={prompt} aria-label={t('Agent setup request', 'Agent 接入请求')} />
        </div>

        {copied && <p role="status" className="text-sm text-foreground">{t('Paste the request into your coding agent to continue.', '将接入请求粘贴到编码 Agent 中继续。')}</p>}
        {error && <p role="alert" className="text-sm text-destructive">{t('Copy failed. Select and copy the request above.', '复制失败，请选中上方请求手动复制。')}</p>}

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <div className="flex flex-wrap items-center gap-3">
            <Button asChild variant="link" className="px-0">
              <a href={`${origin}/docs/agents/`}>{t('Setup guide', '接入指南')}</a>
            </Button>
            {inRouter ? (
              <Button asChild variant="link" className="px-0">
                <Link to={keysRoute} onClick={() => setOpen(false)}>
                  <KeyRound aria-hidden="true" />
                  {t('API keys', 'API 密钥')}
                </Link>
              </Button>
            ) : (
              <Button asChild variant="link" className="px-0">
                <a href={`${basePath}${keysRoute}`}>
                  <KeyRound aria-hidden="true" />
                  {t('API keys', 'API 密钥')}
                </a>
              </Button>
            )}
          </div>
          <Button
            onClick={() => {
              setCopied(false);
              setError(false);
              void Promise.resolve()
                .then(() => navigator.clipboard.writeText(prompt))
                .then(() => setCopied(true))
                .catch(() => setError(true));
            }}
          >
            {copied ? <IconCheck /> : <IconCopy />}
            {copied ? t('Setup request copied', '已复制接入请求') : t('Copy setup request', '复制接入请求')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
