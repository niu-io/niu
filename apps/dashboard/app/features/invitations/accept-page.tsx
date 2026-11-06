import { useLocale as useUILocale } from '@/shell/ui-locale';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { IconAlertTriangle, IconCheck, IconClock, IconLink, IconUsers } from '@tabler/icons-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useDashboardContext } from '@/shell/dashboard-context';
import { workspaceDisplayName } from '@/shell/workspace-route';
import {
  AdminRequestError,
  formatDateTime,
  previewMemberInvitation,
  type MemberInvitationPreview,
} from '@/features/operators/api';

type InvitationProblem = { status: number; message: string };

function scopeLabel(invitation: MemberInvitationPreview, uiT: (en: string, zh?: string) => string) {
  if (invitation.project_name) {
    return `${uiT('Workspace', '工作空间')}: ${workspaceDisplayName(invitation.project_name)}`;
  }
  return uiT('All workspaces · organization-wide', '全部工作空间 · 组织级');
}

function roleConsequences(
  invitation: MemberInvitationPreview,
  uiT: (en: string, zh?: string) => string,
) {
  const organizationWide = !invitation.project_id;
  if (invitation.role === 'viewer') {
    return uiT(
      'Can read workspace data. Cannot change settings or manage member access.',
      '可读取工作空间数据，不能修改设置或管理成员访问权限。',
    );
  }
  if (invitation.role === 'admin') {
    return (
      uiT(
        'Can read and change workspace data. Cannot manage member access.',
        '可读取和修改工作空间数据，不能管理成员访问权限。',
      ) +
      (organizationWide
        ? ' ' +
          uiT(
            'This organization-wide role can access organization billing and shared funds.',
            '此组织级角色可以访问组织账单及共享资金。',
          )
        : '')
    );
  }
  return (
    uiT(
      'Can read and change workspace data, add members, and revoke access.',
      '可读取和修改工作空间数据、添加成员并撤销访问权限。',
    ) +
    (organizationWide
      ? ' ' +
        uiT(
          'This organization-wide role can access organization billing and shared funds.',
          '此组织级角色可以访问组织账单及共享资金。',
        )
      : '')
  );
}

function roleLabel(role: MemberInvitationPreview['role'], uiT: (en: string, zh?: string) => string) {
  if (role === 'owner') return uiT('Owner', '所有者');
  if (role === 'admin') return uiT('Admin', '管理员');
  return uiT('Viewer', '查看者');
}

function destinationFor(invitation: MemberInvitationPreview): string {
  return invitation.project_slug
    ? `/workspaces/${encodeURIComponent(invitation.project_slug)}/`
    : '/workspaces/default/';
}

export default function AcceptInvitationPage() {
  const { t: uiT } = useUILocale();
  const { token: invitationToken } = useParams();
  const context = useDashboardContext();
  const navigate = useNavigate();
  const [preview, setPreview] = useState<MemberInvitationPreview | null>(null);
  const [problem, setProblem] = useState<InvitationProblem | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState('');
  const refreshWorkspaceRef = useRef(context.refreshWorkspace);
  refreshWorkspaceRef.current = context.refreshWorkspace;

  const load = useCallback(
    async (signal: AbortSignal) => {
      if (!invitationToken) {
        setProblem({ status: 404, message: 'This invitation link is incomplete.' });
        setLoading(false);
        return;
      }
      try {
        const result = await previewMemberInvitation(context.token, invitationToken, signal);
        if (signal.aborted) return;
        setPreview(result.data);
        setProblem(null);
      } catch (reason) {
        if (signal.aborted) return;
        const message = reason instanceof Error ? reason.message : 'Could not load this invitation.';
        const status = reason instanceof AdminRequestError ? reason.status : 0;
        setProblem({ status, message });
        if (status === 401) void refreshWorkspaceRef.current?.();
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    },
    [context.token, invitationToken],
  );

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setPreview(null);
    setProblem(null);
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  async function accept() {
    if (!invitationToken || !context.acceptInvitation || accepting) return;
    setAccepting(true);
    setAcceptError('');
    try {
      await context.acceptInvitation(invitationToken);
    } catch (reason) {
      setAcceptError(reason instanceof Error ? reason.message : 'The invitation could not be accepted.');
      setAccepting(false);
      // A consumed or expired invitation must show its current state.
      if (reason instanceof AdminRequestError && [404, 403, 409].includes(reason.status)) {
        const controller = new AbortController();
        void load(controller.signal);
      }
    }
  }

  if (loading) {
    return (
      <main className="dashboard-login">
        <div className="dashboard-login-stage">
          <section className="dashboard-login-card invitation-card" aria-busy="true">
            <p className="text-sm text-muted-foreground" role="status">
              {uiT('Loading invitation…', '正在加载邀请…')}
            </p>
          </section>
        </div>
      </main>
    );
  }

  if (!preview) {
    const unavailable = problem?.status === 404;
    return (
      <main className="dashboard-login">
        <div className="dashboard-login-stage">
          <section className="dashboard-login-card invitation-card" aria-label={uiT('Invitation unavailable', '邀请不可用')}>
            <span className="invitation-avatar" aria-hidden="true">
              <IconLink size={22} />
            </span>
            <h1>{unavailable ? uiT('This invitation is no longer available', '此邀请已不可用') : uiT('Could not open this invitation', '无法打开此邀请')}</h1>
            <p className="text-sm text-muted-foreground">
              {unavailable
                ? uiT(
                    'It may have expired, been canceled, already been used, or the link is incorrect. Ask the organization owner for a new invitation.',
                    '邀请可能已过期、被取消、已被使用，或链接有误。请联系组织所有者获取新邀请。',
                  )
                : problem?.message || uiT('Try again later or ask the organization owner for help.', '请稍后重试，或联系组织所有者获取帮助。')}
            </p>
            <div className="flex flex-wrap gap-2">
              {problem?.status === 401 ? (
                <Button asChild>
                  <Link to="/login" state={{ from: invitationToken ? `/invite/${invitationToken}` : '/workspaces/default/' }}>
                    {uiT('Sign in again', '重新登录')}
                  </Link>
                </Button>
              ) : null}
              <Button asChild variant="outline">
                <Link to="/workspaces/default/">{uiT('Return to workspace', '返回工作空间')}</Link>
              </Button>
            </div>
          </section>
        </div>
      </main>
    );
  }

  const status = preview.status;
  const destination = destinationFor(preview);
  const alreadyJoined = status === 'accepted' && preview.already_accepted_by_caller;

  return (
    <main className="dashboard-login">
      <div className="dashboard-login-stage">
        <section className="dashboard-login-card invitation-card" aria-label={uiT('Organization invitation', '组织邀请')}>
          <div className="invitation-org">
            <span className="invitation-avatar" aria-hidden="true">
              {preview.organization_name.trim().charAt(0).toUpperCase() || <IconUsers size={22} />}
            </span>
            <div className="min-w-0">
              <p className="eyebrow">{uiT('INVITATION', '邀请')}</p>
              <h1 className="break-words">{preview.organization_name}</h1>
              <p className="text-sm text-muted-foreground">{scopeLabel(preview, uiT)}</p>
            </div>
            <Badge variant="outline" className="lifecycle-badge ml-auto" data-tone={status === 'pending' ? 'active' : 'inactive'}>
              <span className="status-dot" aria-hidden="true" />
              {status === 'pending'
                ? uiT('Pending', '待接受')
                : status === 'accepted'
                  ? uiT('Accepted', '已接受')
                  : status === 'expired'
                    ? uiT('Expired', '已过期')
                    : uiT('Canceled', '已取消')}
            </Badge>
          </div>

          {status === 'pending' && (
            <>
              <p className="invitation-lead">
                {uiT('You have been invited to join as', '您受邀以以下角色加入：')}{' '}
                <strong>{roleLabel(preview.role, uiT)}</strong>.
              </p>
              <p className="text-sm text-muted-foreground">{roleConsequences(preview, uiT)}</p>
              <dl className="invitation-facts">
                <div>
                  <dt>{uiT('Intended email', '指定邮箱')}</dt>
                  <dd>{preview.recipient_email}</dd>
                </div>
                <div>
                  <dt>{uiT('Expires', '过期时间')}</dt>
                  <dd>
                    <IconClock size={14} aria-hidden="true" /> {formatDateTime(preview.expires_at)}
                  </dd>
                </div>
                {preview.invited_by && (
                  <div>
                    <dt>{uiT('Invited by', '邀请人')}</dt>
                    <dd>{preview.invited_by}</dd>
                  </div>
                )}
              </dl>
              {preview.email_matches ? (
                <>
                  <p className="text-sm text-muted-foreground">
                    {uiT(
                      'Accepting adds exactly this role and scope to your account. It does not approve model calls, agent grants, or broader organization access.',
                      '接受后只会为您账户添加上述角色与范围，不会批准模型调用、Agent 授权或更广泛的组织访问权限。',
                    )}
                  </p>
                  {acceptError && (
                    <p className="dashboard-login-error" role="alert">
                      {uiT(acceptError)}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" disabled={accepting} onClick={() => void accept()}>
                      <IconCheck size={16} aria-hidden="true" />
                      {accepting ? uiT('Accepting…', '正在接受…') : uiT('Accept invitation', '接受邀请')}
                    </Button>
                    <Button asChild variant="outline">
                      <Link to="/workspaces/default/">{uiT('Not now', '暂不加入')}</Link>
                    </Button>
                  </div>
                </>
              ) : (
                <Alert variant="destructive">
                  <IconAlertTriangle aria-hidden="true" />
                  <AlertTitle>{uiT('This invitation is for another email', '此邀请面向其他邮箱')}</AlertTitle>
                  <AlertDescription>
                    <p>
                      {uiT('You are signed in as', '您当前登录的账号是')}{' '}
                      <strong>{preview.caller_email || uiT('an account without email sign-in', '未使用邮箱登录的账户')}</strong>
                      {uiT('. Sign out and sign in with', '。请退出并使用以下邮箱重新登录：')}{' '}
                      <strong>{preview.recipient_email}</strong>.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button type="button" variant="outline" disabled={!context.signOut} onClick={() => void context.signOut()}>
                        {uiT('Sign out', '退出登录')}
                      </Button>
                      <Button asChild variant="ghost">
                        <Link to="/workspaces/default/">{uiT('Return to workspace', '返回工作空间')}</Link>
                      </Button>
                    </div>
                  </AlertDescription>
                </Alert>
              )}
            </>
          )}

          {alreadyJoined && (
            <>
              <p className="invitation-lead">
                {uiT('You have already joined this organization.', '您已加入此组织。')}
              </p>
              <p className="text-sm text-muted-foreground">
                {uiT(
                  'Your saved role and scope apply. No additional membership was created.',
                  '已保存的角色与范围已生效，未重复创建成员身份。',
                )}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" onClick={() => navigate(destination, { replace: true })}>
                  {uiT('Open workspace', '打开工作空间')}
                </Button>
                <Button asChild variant="outline">
                  <Link to="/workspaces/default/">{uiT('Return to workspace', '返回工作空间')}</Link>
                </Button>
              </div>
            </>
          )}

          {status === 'accepted' && !alreadyJoined && (
            <p className="text-sm text-muted-foreground">
              {uiT(
                'This invitation was accepted by another account. Ask the organization owner to review the member list or create a new invitation.',
                '此邀请已由其他账户接受。请联系组织所有者查看成员列表或创建新邀请。',
              )}
            </p>
          )}

          {status === 'expired' && (
            <p className="text-sm text-muted-foreground">
              {uiT(
                'This invitation expired. Ask the organization owner to create a new invitation link.',
                '此邀请已过期。请联系组织所有者重新创建邀请链接。',
              )}
            </p>
          )}

          {status === 'canceled' && (
            <p className="text-sm text-muted-foreground">
              {uiT(
                'This invitation was canceled or replaced. Ask the organization owner for a new invitation link.',
                '此邀请已被取消或替换。请联系组织所有者获取新的邀请链接。',
              )}
            </p>
          )}

          <p className="invitation-footnote">
            {uiT(
              'Invitation links are one-time. Niu never asks you to share a password or access token here.',
              '邀请链接仅可使用一次。Niu 不会在此要求您分享密码或访问令牌。',
            )}
          </p>
        </section>
      </div>
    </main>
  );
}
