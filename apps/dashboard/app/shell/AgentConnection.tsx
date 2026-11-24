import { useState } from 'react';
import { IconCheck, IconCopy } from '@tabler/icons-react';
import McpIcon from '@/components/McpIcon';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { SidebarMenuButton } from '@/components/ui/sidebar';
import { Textarea } from '@/components/ui/textarea';
import { useLocale } from './ui-locale';

const mcpPackage = 'https://github.com/niu-io/niu/releases/download/v0.3.2/niu-io-mcp-0.3.2.tgz';

export default function AgentConnection({ sidebar = false }: { sidebar?: boolean }) {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(false);
  const installPrompt = () => {
    const base = window.location.origin + import.meta.env.BASE_URL.replace(/\/$/, '') + '/v1';
    return t(
      `Install ${mcpPackage} and register niu-mcp as a stdio MCP server in this client with NIU_BASE_URL=${base}.`,
      `请安装 ${mcpPackage}，在当前客户端添加 stdio MCP 服务，启动命令为 niu-mcp，环境变量为 NIU_BASE_URL=${base}。`,
    );
  };
  const entryLabel = t('Install MCP', '安装 MCP');

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
          <SidebarMenuButton tooltip={entryLabel} aria-label={entryLabel}>
            <McpIcon />
            <span className="truncate group-data-[collapsible=icon]:hidden">{entryLabel}</span>
          </SidebarMenuButton>
        ) : (
          <Button variant="secondary" className="justify-start">
            <McpIcon />
            {entryLabel}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="text-left">
          <DialogTitle className="flex items-center gap-2">
            <McpIcon className="size-4 shrink-0" />
            <span>{entryLabel}</span>
          </DialogTitle>
          <DialogDescription>
            {t(
              'Copy the installation instructions and paste them into your coding agent.',
              '复制安装说明，粘贴给你的编程助手。',
            )}
          </DialogDescription>
        </DialogHeader>
        {error && <div className="grid gap-2">
          <p role="alert">{t('Select and copy the instructions below.', '请选择并复制下方安装说明。')}</p>
          <Textarea readOnly aria-label={t('Installation instructions', '安装说明')} value={installPrompt()} />
        </div>}
        <DialogFooter>
          <Button
            onClick={() => {
              setCopied(false);
              setError(false);
              void Promise.resolve()
                .then(() => navigator.clipboard.writeText(installPrompt()))
                .then(() => setCopied(true))
                .catch(() => setError(true));
            }}
          >
            {copied ? <IconCheck /> : <IconCopy />}
            {copied ? t('Copied', '已复制') : t('Copy instructions', '复制安装说明')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
