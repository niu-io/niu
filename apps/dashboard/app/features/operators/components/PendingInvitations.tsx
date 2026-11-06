import { useLocale as useUILocale } from '@/shell/ui-locale';
import { workspaceDisplayName } from '@/shell/workspace-route';
import { useState } from 'react';
import { IconDots as MoreHorizontal } from '@tabler/icons-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ListRowsSkeleton } from '@/components/PageSkeletons';
import { formatDateTime, type MemberInvitation } from '../api';

function roleLabel(role: MemberInvitation['role'], uiT: (en: string, zh?: string) => string) {
  if (role === 'owner') return uiT('Owner', '所有者');
  if (role === 'admin') return uiT('Admin', '管理员');
  return uiT('Viewer', '查看者');
}

export default function PendingInvitations({
  invitations,
  loading,
  busy,
  onCancel,
  onReplace,
}: {
  invitations: MemberInvitation[];
  loading: boolean;
  busy: boolean;
  onCancel: (invitation: MemberInvitation) => void;
  onReplace: (invitation: MemberInvitation) => void;
}) {
  const { t: uiT, format: uiF } = useUILocale();
  const [confirm, setConfirm] = useState<MemberInvitation | null>(null);
  if (!loading && invitations.length === 0) return null;

  return (
    <section className="operator-invitations" aria-label={uiT('Pending invitations', '待接受的邀请')}>
      <div className="operator-invitations-heading">
        <div>
          <h3>{uiT('Pending invitations', '待接受的邀请')}</h3>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {uiT(
              'These people can join after they sign in with the invited email and accept. One-time links are shown only when created.',
              '受邀者使用被邀请的邮箱登录并确认后即可加入。一次性链接仅在创建时显示。',
            )}
          </p>
        </div>
        <Badge variant="outline" className="lifecycle-badge" data-tone="pending">
          <span className="status-dot" aria-hidden="true" />
          {uiF('{0} pending', [invitations.length])}
        </Badge>
      </div>
      {loading ? (
        <ListRowsSkeleton rows={2} label={uiT('Loading invitations…', '正在加载邀请…')} />
      ) : (
        <div className="table-wrap">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{uiT('Recipient', '收件人')}</TableHead>
                <TableHead>{uiT('Scope', '范围')}</TableHead>
                <TableHead>{uiT('Role', '角色')}</TableHead>
                <TableHead className="hidden sm:table-cell">{uiT('Expires', '过期时间')}</TableHead>
                <TableHead className="hidden md:table-cell">{uiT('Invited by', '邀请人')}</TableHead>
                <TableHead className="w-12">
                  <span className="sr-only">{uiT('Actions', '操作')}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invitations.map(invitation => (
                <TableRow key={invitation.id}>
                  <TableCell className="whitespace-normal">
                    <span className="operator-invitation-recipient">
                      {invitation.recipient_name || invitation.recipient_email}
                    </span>
                    {invitation.recipient_name && (
                      <p className="text-xs text-muted-foreground">{invitation.recipient_email}</p>
                    )}
                    <p className="text-xs text-muted-foreground sm:hidden">
                      {uiT('Expires', '过期时间')} {formatDateTime(invitation.expires_at)}
                    </p>
                  </TableCell>
                  <TableCell className="whitespace-normal">
                    {invitation.project_name
                      ? workspaceDisplayName(invitation.project_name)
                      : uiT('All workspaces', '全部工作空间')}
                  </TableCell>
                  <TableCell>{roleLabel(invitation.role, uiT)}</TableCell>
                  <TableCell className="hidden sm:table-cell">
                    {formatDateTime(invitation.expires_at)}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {invitation.invited_by || uiT('Installation administrator', '实例管理员')}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={uiF('Actions for {0}', [invitation.recipient_email])}
                          disabled={busy}
                        >
                          <MoreHorizontal size={16} />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => onReplace(invitation)}>
                          {uiT('Create new link', '创建新链接')}
                        </DropdownMenuItem>
                        <DropdownMenuItem variant="destructive" onSelect={() => setConfirm(invitation)}>
                          {uiT('Cancel invitation', '取消邀请')}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <Dialog open={Boolean(confirm)} onOpenChange={open => { if (!open && !busy) setConfirm(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {uiT('Cancel invitation for', '取消此邀请：')}{' '}
              {confirm?.recipient_email}?
            </DialogTitle>
            <DialogDescription>
              {uiT(
                'The one-time link will stop working immediately. The person can still be invited again later.',
                '一次性链接将立即失效。之后仍可重新邀请此人。',
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" disabled={busy} onClick={() => setConfirm(null)}>
              {uiT('Keep invitation', '保留邀请')}
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() => {
                if (confirm) onCancel(confirm);
                setConfirm(null);
              }}
            >
              {uiT('Cancel invitation', '取消邀请')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
