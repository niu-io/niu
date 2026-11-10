import { SidebarMenuButton } from '@/components/ui/sidebar';
import { useState } from 'react';
import { IconPlugConnected, IconCopy, IconCheck } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from '@/components/ui/dialog';
import { useLocale } from './ui-locale';
import type { DashboardContext } from './dashboard-context';
import { workspacePathSegment } from './workspace-route';

export default function AgentConnection({ context, sidebar = false }: { context: DashboardContext; sidebar?: boolean }) {
  const { t } = useLocale();
  const { workspace, workspaces } = context;
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(false);
  const origin = window.location.origin + import.meta.env.BASE_URL.replace(/\/$/, '');
  const scope = workspace ? ` Workspace: ${origin}/workspaces/${encodeURIComponent(workspacePathSegment(workspace, workspaces))}.` : '';
  const prompt = `Connect to Niu at ${origin}.${scope} Read ${origin}/docs/install.md and ${origin}/docs/agents.md. Discover supported integration and authorization methods. Ask me to approve the required scope and spending limits, then verify connection, permissions, and model availability. Do not send paid model requests without my authorization.`;
  return <Dialog onOpenChange={() => { setCopied(false); setError(false); }}>
    <DialogTrigger asChild>{sidebar ? <SidebarMenuButton tooltip={t('Connect your agent', '连接你的 Agent')} aria-label={t('Connect your agent', '连接你的 Agent')}><IconPlugConnected /><span>{t('Connect your agent', '连接你的 Agent')}</span></SidebarMenuButton> : <Button variant="secondary" className="justify-start"><IconPlugConnected />{t('Connect your agent', '连接你的 Agent')}</Button>}</DialogTrigger>
    <DialogContent className="sm:max-w-xl"><DialogHeader><DialogTitle>{t('Connect your agent', '连接你的 Agent')}</DialogTitle><DialogDescription>{t('Give this setup request to your coding agent. It discovers the supported connection and asks you to authorize access.', '将此接入请求交给编码 Agent。它会检查支持的连接方式，并请你授权访问。')}</DialogDescription></DialogHeader>
      <Textarea readOnly rows={7} value={prompt} aria-label={t('Agent setup request', 'Agent 接入请求')} />
      {copied && <p role="status">{t('Paste the request into your coding agent to continue.', '将接入请求粘贴到编码 Agent 中继续。')}</p>}
      {error && <p role="alert">{t('Copy failed. Select and copy the request above.', '复制失败，请选中上方请求手动复制。')}</p>}
      <div className="flex flex-wrap items-center justify-between gap-2"><Button asChild variant="link" className="px-0"><a href={`${origin}/docs/agents/`}>{t('Setup guide', '接入指南')}</a></Button><Button onClick={() => { setCopied(false); setError(false); void Promise.resolve().then(() => navigator.clipboard.writeText(prompt)).then(() => setCopied(true)).catch(() => setError(true)); }}>{copied ? <IconCheck /> : <IconCopy />}{copied ? t('Setup request copied', '已复制接入请求') : t('Copy setup request', '复制接入请求')}</Button></div>
    </DialogContent>
  </Dialog>;
}
