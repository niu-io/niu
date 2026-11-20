import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import {
  IconChevronDown,
  IconRefresh,
  IconUserCheck,
} from '@tabler/icons-react';
import type {
  PlatformRegistrationPolicy,
  PlatformRegistrationQueuePage,
  RegistrationCounts,
  RegistrationMode,
  RegistrationRequestRecord,
  RegistrationStatus,
} from '@niu-io/sdk';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TableSkeleton } from '@/components/PageSkeletons';
import { formatDateTime } from '@/features/operators/api';
import { ApiRequestError, request } from '@/lib/api-client';
import { invalidateQueries } from '@/lib/query-cache';
import { useLocale } from '@/shell/ui-locale';
import { ApproveRegistrationDialog, RejectRegistrationDialog } from './registration-dialogs';

type ReviewDialogState =
  | { kind: 'approve'; record: RegistrationRequestRecord }
  | { kind: 'reject'; record: RegistrationRequestRecord }
  | null;

const REGISTRATION_POLICY_PATH = '/api/v1/platform/registration';
const REGISTRATION_QUEUE_PATH = '/api/v1/platform/registrations';

function useLocalizedMessages() {
  const { t } = useLocale();
  function reviewerLabel(record: RegistrationRequestRecord) {
    if (record.reviewed_by_kind === 'installation') {
      return t('Installation administrator', '实例管理员');
    }
    return record.reviewed_by_label || t('Platform administrator', '平台管理员');
  }
  return { t, reviewerLabel };
}

export function RegistrationPolicySection({
  token,
  onPolicySaved,
}: {
  token: string;
  onPolicySaved?: (policy: PlatformRegistrationPolicy) => void;
}) {
  const { t } = useLocalizedMessages();
  const [policy, setPolicy] = useState<PlatformRegistrationPolicy | null>(null);
  const [draftMode, setDraftMode] = useState<RegistrationMode>('approval_required');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saveErrorKind, setSaveErrorKind] = useState<'conflict' | 'failed' | ''>('');
  const [savedNotice, setSavedNotice] = useState(false);
  const activePolicy = useRef<AbortController | null>(null);
  const editButtonRef = useRef<HTMLButtonElement>(null);

  const loadPolicy = useCallback(async () => {
    activePolicy.current?.abort();
    const controller = new AbortController();
    activePolicy.current = controller;
    setLoading(true);
    setLoadFailed(false);
    try {
      const result = await request<{ data: PlatformRegistrationPolicy }>(
        token,
        REGISTRATION_POLICY_PATH,
        'GET',
        undefined,
        controller.signal,
      );
      if (controller.signal.aborted) return;
      setPolicy(result.data);
      setDraftMode(result.data.mode);
    } catch {
      if (!controller.signal.aborted) {
        setLoadFailed(true);
      }
    } finally {
      if (activePolicy.current === controller && !controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [token]);

  useEffect(() => {
    void loadPolicy();
    return () => activePolicy.current?.abort();
  }, [loadPolicy]);

  async function save() {
    if (!policy || saving || draftMode === policy.mode) return;
    setSaving(true);
    setSaveErrorKind('');
    setSavedNotice(false);
    try {
      const result = await request<{ data: PlatformRegistrationPolicy }>(
        token,
        REGISTRATION_POLICY_PATH,
        'PUT',
        {
          mode: draftMode,
          expected_revision: policy.revision,
        },
      );
      setPolicy(result.data);
      setDraftMode(result.data.mode);
      setDialogOpen(false);
      setSavedNotice(true);
      invalidateQueries(key => key.startsWith('public::/api/v1/auth/config'));
      onPolicySaved?.(result.data);
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 409) {
        setSaveErrorKind('conflict');
        void loadPolicy();
      } else {
        setSaveErrorKind('failed');
      }
    } finally {
      setSaving(false);
    }
  }

  const currentModeLabel =
    policy?.mode === 'approval_required'
      ? t('Limited Preview · Administrator approval required', '有限预览 · 注册需管理员审批')
      : t('Closed · Invitation or administrator setup only', '关闭注册 · 仅限邀请或管理员开通');
  const draftModeLabel =
    draftMode === 'approval_required'
      ? t('Limited Preview · Administrator approval required', '有限预览 · 注册需管理员审批')
      : t('Closed · Invitation or administrator setup only', '关闭注册 · 仅限邀请或管理员开通');

  return (
    <section className="space-y-4" aria-label={t('Registration policy', '注册策略')}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{t('Limited Preview & registration access', '有限预览与注册准入')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t(
              'Control whether visitors can submit registration requests on /register for administrator approval, or restrict onboarding to invitations and manual setup.',
              '控制访客是否可通过 /register 提交有限预览注册申请并由管理员审批，或仅限邀请与管理员手工创建。',
            )}
          </p>
        </div>
        {policy && (
          <Button
            ref={editButtonRef}
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setDraftMode(policy.mode);
              setSaveErrorKind('');
              setSavedNotice(false);
              setDialogOpen(true);
            }}
          >
            {t('Edit policy', '编辑策略')}
          </Button>
        )}
      </div>

      {loading && !policy ? (
        <p className="text-sm text-muted-foreground">{t('Loading registration policy…', '正在加载注册策略…')}</p>
      ) : loadFailed && !policy ? (
        <Alert variant="destructive">
          <AlertDescription className="flex flex-wrap items-center gap-3">
            <span>{t('Could not load registration policy.', '无法加载注册策略。')}</span>
            <Button type="button" variant="outline" size="sm" onClick={() => void loadPolicy()}>
              {t('Retry', '重试')}
            </Button>
          </AlertDescription>
        </Alert>
      ) : policy ? (
        <div className="space-y-4">
          {!policy.password_login_configured && (
            <Alert>
              <AlertTitle>{t('Password sign-in origin required', '需要配置密码登录来源')}</AlertTitle>
              <AlertDescription>
                {t(
                  'NIU_AUTH_PUBLIC_ORIGIN is not configured on this gateway, so public password sign-in and self-registration are inactive until deployed with a public HTTPS origin.',
                  '此网关尚未配置 NIU_AUTH_PUBLIC_ORIGIN，在配置公开 HTTPS 来源前，访客无法使用密码登录或提交注册申请。',
                )}
              </AlertDescription>
            </Alert>
          )}
          <dl className="rounded-[var(--radius-panel)] bg-card p-5 text-sm">
            <dt className="text-xs text-muted-foreground">{t('Registration mode', '注册模式')}</dt>
            <dd className="mt-1 font-medium">{currentModeLabel}</dd>
          </dl>
          {savedNotice && (
            <p role="status" className="text-sm text-foreground">
              {t('Registration policy saved.', '注册策略已保存。')}
            </p>
          )}
        </div>
      ) : null}

      <Dialog
        open={dialogOpen && Boolean(policy)}
        onOpenChange={open => {
          if (!saving) {
            setDialogOpen(open);
            if (!open && policy) {
              setDraftMode(policy.mode);
              setSaveErrorKind('');
            }
          }
        }}
      >
        <DialogContent
          className="max-h-[90dvh] overflow-y-auto"
          onCloseAutoFocus={event => {
            if (editButtonRef.current?.isConnected) {
              event.preventDefault();
              editButtonRef.current.focus();
            }
          }}
        >
          {policy && (
            <>
              <DialogHeader>
                <DialogTitle>{t('Edit registration policy', '编辑注册策略')}</DialogTitle>
                <DialogDescription>
                  {t(
                    'Choose whether visitors can submit registration requests on /register or limit onboarding to invitations and administrator creation.',
                    '选择是否允许访客通过 /register 提交注册申请，或仅限邀请与管理员开通。',
                  )}
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4">
                <div className="grid min-w-0 gap-2">
                  <Label htmlFor="platform-registration-mode">{t('Registration mode', '注册模式')}</Label>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        id="platform-registration-mode"
                        type="button"
                        variant="outline"
                        disabled={saving}
                        className="w-full justify-between gap-4"
                        aria-label={t('Registration mode', '注册模式')}
                      >
                        <span className="truncate">{draftModeLabel}</span>
                        <IconChevronDown size={16} aria-hidden="true" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)] max-w-[calc(100vw-2rem)]">
                      <DropdownMenuRadioGroup
                        value={draftMode}
                        onValueChange={value => {
                          setDraftMode(value as RegistrationMode);
                          setSaveErrorKind('');
                          setSavedNotice(false);
                        }}
                      >
                        <DropdownMenuRadioItem value="approval_required">
                          {t('Limited Preview · Administrator approval required', '有限预览 · 注册需管理员审批')}
                        </DropdownMenuRadioItem>
                        <DropdownMenuRadioItem value="disabled">
                          {t('Closed · Invitation or administrator setup only', '关闭注册 · 仅限邀请或管理员开通')}
                        </DropdownMenuRadioItem>
                      </DropdownMenuRadioGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                {saveErrorKind && (
                  <Alert variant="destructive">
                    <AlertDescription>
                      {saveErrorKind === 'conflict'
                        ? t(
                            'Registration policy changed before saving. Reloaded the latest revision.',
                            '保存前注册策略已被修改，正在重新加载最新版本。',
                          )
                        : t('Could not save registration policy. Try again.', '无法保存注册策略，请重试。')}
                    </AlertDescription>
                  </Alert>
                )}
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  disabled={saving}
                  onClick={() => {
                    setDialogOpen(false);
                    setDraftMode(policy.mode);
                    setSaveErrorKind('');
                  }}
                >
                  {t('Cancel', '取消')}
                </Button>
                <Button type="button" disabled={saving || draftMode === policy.mode} onClick={() => void save()}>
                  {saving ? t('Saving…', '保存中…') : t('Save policy', '保存策略')}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}

export function RegistrationRequestsQueue({
  token,
  showPolicySection = true,
  onApproved,
  onCountsChange,
}: {
  token: string;
  showPolicySection?: boolean;
  onApproved?: () => void;
  onCountsChange?: (counts: RegistrationCounts) => void;
}) {
  const { t, reviewerLabel } = useLocalizedMessages();
  const [statusFilter, setStatusFilter] = useState<RegistrationStatus>('pending');
  const [records, setRecords] = useState<RegistrationRequestRecord[]>([]);
  const [counts, setCounts] = useState<RegistrationCounts>({ pending: 0, approved: 0, rejected: 0 });
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [noticeKind, setNoticeKind] = useState<'approved' | 'rejected' | ''>('');
  const [dialog, setDialog] = useState<ReviewDialogState>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const activeFetch = useRef<AbortController | null>(null);
  const onCountsRef = useRef(onCountsChange);
  onCountsRef.current = onCountsChange;

  const loadQueue = useCallback(
    async (filter: RegistrationStatus, cursor?: string) => {
      activeFetch.current?.abort();
      const controller = new AbortController();
      activeFetch.current = controller;
      if (cursor) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }
      setLoadFailed(false);
      try {
        const params = new URLSearchParams({ status: filter, limit: '50' });
        if (cursor) params.set('cursor', cursor);
        const page = await request<PlatformRegistrationQueuePage>(
          token,
          `${REGISTRATION_QUEUE_PATH}?${params.toString()}`,
          'GET',
          undefined,
          controller.signal,
        );
        if (controller.signal.aborted) return;
        setRecords(current =>
          cursor
            ? [...current, ...page.data.filter(item => !current.some(existing => existing.id === item.id))]
            : page.data,
        );
        setNextCursor(page.next_cursor);
        setCounts(page.counts);
        onCountsRef.current?.(page.counts);
      } catch {
        if (!controller.signal.aborted) {
          setLoadFailed(true);
        }
      } finally {
        if (activeFetch.current === controller && !controller.signal.aborted) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [token],
  );

  useEffect(() => {
    void loadQueue(statusFilter);
    return () => activeFetch.current?.abort();
  }, [loadQueue, statusFilter]);

  function handleReviewed(updated: RegistrationRequestRecord) {
    setDialog(null);
    invalidateQueries('/api/v1/platform/customer-accounts');
    invalidateQueries('/api/v1/workspaces');
    invalidateQueries('/api/v1/operators');
    if (updated.status === 'approved') {
      setNoticeKind('approved');
      onApproved?.();
    } else {
      setNoticeKind('rejected');
    }
    window.dispatchEvent(new Event('niu:registrations-updated'));
    void loadQueue(statusFilter);
  }

  return (
    <div className="space-y-8">
      {showPolicySection && <RegistrationPolicySection token={token} />}

      <section className="space-y-4" aria-label={t('Registration requests', '注册审批队列')}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Tabs
            value={statusFilter}
            onValueChange={value => {
              setNoticeKind('');
              setStatusFilter(value as RegistrationStatus);
            }}
          >
            <TabsList variant="line" aria-label={t('Registration status', '注册状态筛选')}>
              <TabsTrigger value="pending" className="gap-2">
                <span>{t('Pending', '待审批')}</span>
                <Badge variant={counts.pending > 0 ? 'default' : 'secondary'}>{counts.pending}</Badge>
              </TabsTrigger>
              <TabsTrigger value="approved" className="gap-2">
                <span>{t('Approved', '已批准')}</span>
                <Badge variant="secondary">{counts.approved}</Badge>
              </TabsTrigger>
              <TabsTrigger value="rejected" className="gap-2">
                <span>{t('Rejected', '已拒绝')}</span>
                <Badge variant="secondary">{counts.rejected}</Badge>
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={loading}
            aria-label={t('Refresh registration requests', '刷新注册申请')}
            onClick={() => {
              setNoticeKind('');
              void loadQueue(statusFilter);
            }}
          >
            <IconRefresh size={16} aria-hidden="true" />
            <span>{t('Refresh', '刷新')}</span>
          </Button>
        </div>

        {noticeKind && (
          <Alert>
            <AlertDescription>
              {noticeKind === 'approved'
                ? t(
                    'Registration approved and account provisioned. The user can now sign in with their registered email and password.',
                    '已批准注册申请并完成账号开通，用户现可使用注册邮箱与密码登录。',
                  )
                : t('Registration request rejected.', '已拒绝该注册申请。')}
            </AlertDescription>
          </Alert>
        )}

        {loadFailed && (
          <Alert variant="destructive">
            <AlertDescription className="flex flex-wrap items-center gap-3">
              <span>{t('Could not load registration requests.', '无法加载注册申请列表。')}</span>
              <Button type="button" variant="outline" size="sm" onClick={() => void loadQueue(statusFilter)}>
                {t('Retry', '重试')}
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {loading && !records.length ? (
          <TableSkeleton columns={6} rows={4} label={t('Loading registration requests…', '正在加载注册申请…')} />
        ) : !loading && !loadFailed && !records.length ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <IconUserCheck size={20} aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>
                {statusFilter === 'pending'
                  ? t('No pending registration requests', '暂无待审批的注册申请')
                  : statusFilter === 'approved'
                    ? t('No approved registrations yet', '暂无已批准的注册记录')
                    : t('No rejected registrations', '暂无已拒绝的注册记录')}
              </EmptyTitle>
              <EmptyDescription>
                {statusFilter === 'pending'
                  ? t(
                      'New Limited Preview applicants from /register will appear here for administrator approval.',
                      '来自 /register 的新有限预览申请将显示在此处等待审批。',
                    )
                  : t(
                      'Reviewed requests remain recorded here for audit traceability.',
                      '已审批或已拒绝的记录会保留在此处以便追溯。',
                    )}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : records.length > 0 ? (
          <Table className="min-w-[820px]" aria-label={t('Registration requests table', '注册申请列表')}>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[20%]">{t('Applicant', '申请人')}</TableHead>
                <TableHead className="w-[20%]">{t('Organization & workspace', '组织与工作空间')}</TableHead>
                <TableHead className="w-[18%]">{t('Use case & review note', '用途与审批备注')}</TableHead>
                <TableHead className="w-[14%]">{t('Submitted / reviewed', '提交与审批时间')}</TableHead>
                <TableHead className="w-[12%] whitespace-nowrap">{t('Status', '状态')}</TableHead>
                <TableHead className="w-[16%] whitespace-nowrap text-right">{t('Actions', '操作')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.map(record => (
                <TableRow key={record.id}>
                  <TableCell className="whitespace-normal align-top">
                    <p className="font-medium [overflow-wrap:anywhere]">{record.applicant_name}</p>
                    <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">{record.email}</p>
                  </TableCell>
                  <TableCell className="whitespace-normal align-top">
                    <p className="[overflow-wrap:anywhere]">{record.organization_name}</p>
                    <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">{record.workspace_name}</p>
                    {record.status === 'approved' && record.approved_workspace_slug && (
                      <p className="mt-1 text-xs">
                        <Link
                          className="text-primary underline underline-offset-2"
                          to={`/workspaces/${encodeURIComponent(record.approved_workspace_slug)}/`}
                        >
                          {record.approved_workspace_slug}
                        </Link>
                      </p>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-normal align-top">
                    <p className="text-sm [overflow-wrap:anywhere]">
                      {record.note || <span className="text-muted-foreground">—</span>}
                    </p>
                    {record.decision_note && (
                      <p className="mt-1 text-xs text-muted-foreground [overflow-wrap:anywhere]">
                        {t('Note:', '备注：')} {record.decision_note}
                      </p>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-normal align-top text-xs text-muted-foreground">
                    <p>{formatDateTime(record.created_at)}</p>
                    {record.reviewed_at && (
                      <p className="mt-1">
                        {formatDateTime(record.reviewed_at)} · {reviewerLabel(record)}
                      </p>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap align-top">
                    <Badge
                      variant={
                        record.status === 'approved'
                          ? 'default'
                          : record.status === 'pending'
                            ? 'secondary'
                            : 'outline'
                      }
                    >
                      {record.status === 'pending'
                        ? t('Pending review', '待审批')
                        : record.status === 'approved'
                          ? t('Approved', '已批准')
                          : t('Rejected', '已拒绝')}
                    </Badge>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right align-top">
                    {record.status === 'pending' ? (
                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          size="sm"
                          onClick={event => {
                            openerRef.current = event.currentTarget;
                            setDialog({ kind: 'approve', record });
                          }}
                        >
                          {t('Approve', '批准')}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={event => {
                            openerRef.current = event.currentTarget;
                            setDialog({ kind: 'reject', record });
                          }}
                        >
                          {t('Reject', '拒绝')}
                        </Button>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : null}

        {nextCursor && (
          <Button
            type="button"
            variant="outline"
            disabled={loadingMore}
            onClick={() => void loadQueue(statusFilter, nextCursor)}
          >
            {loadingMore ? t('Loading…', '加载中…') : t('Load more', '加载更多')}
          </Button>
        )}
      </section>

      {dialog?.kind === 'approve' && (
        <ApproveRegistrationDialog
          token={token}
          record={dialog.record}
          opener={openerRef.current}
          onClose={() => setDialog(null)}
          onApproved={handleReviewed}
        />
      )}

      {dialog?.kind === 'reject' && (
        <RejectRegistrationDialog
          token={token}
          record={dialog.record}
          opener={openerRef.current}
          onClose={() => setDialog(null)}
          onRejected={handleReviewed}
        />
      )}
    </div>
  );
}
