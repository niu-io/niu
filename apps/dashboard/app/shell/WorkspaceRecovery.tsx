import { IconAlertTriangle as AlertTriangle } from "@tabler/icons-react";
import { IconArrowRight as ArrowRight } from "@tabler/icons-react";
import { IconRefresh as RefreshCw } from "@tabler/icons-react";
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { useLocale } from './locale';
import type { WorkspaceProblem } from './dashboard-context';

export default function WorkspaceRecovery({ problem, onRetry }: {
  problem: WorkspaceProblem;
  onRetry: () => void;
}) {
  const { t } = useLocale();
  if (problem.kind === 'missing') return <section className="workspace-recovery" role="alert" aria-labelledby="workspace-recovery-title">
    <div className="workspace-recovery-icon"><AlertTriangle aria-hidden="true" size={22} /></div>
    <div className="workspace-recovery-copy">
      <p className="workspace-recovery-label">{t('Workspace unavailable', '工作空间不可用')}</p>
      <h2 id="workspace-recovery-title">{t('This workspace link can’t be opened', '无法打开此工作空间链接')}</h2>
      <p>{t('This workspace is not available to your account. Choose another workspace to continue.', '您的账户无权访问此工作空间，请选择其他工作空间继续。')}</p>
      <div className="workspace-recovery-actions">
        <Button asChild><Link to="/workspaces/default/">{t('Open an available workspace', '打开可用工作空间')}<ArrowRight aria-hidden="true" size={16} /></Link></Button>
        <Button type="button" variant="ghost" onClick={onRetry}><RefreshCw aria-hidden="true" size={16} />{t('Check again', '重新检查')}</Button>
      </div>
    </div>
  </section>;

  const versionMismatch = problem.kind === 'api' && problem.status === 404;
  const unauthorized = problem.kind === 'api' && problem.status === 401;
  const forbidden = problem.kind === 'api' && problem.status === 403;
  const heading = versionMismatch
    ? t('This dashboard and gateway are out of sync', '控制台与网关版本不一致')
    : unauthorized
      ? t('Your session has expired', '您的会话已过期')
      : forbidden
        ? t('You don’t have access to this workspace', '您没有此工作空间的访问权限')
        : t('Workspace data isn’t available', '工作空间数据暂不可用');
  const description = versionMismatch
    ? t('The gateway is responding, but it does not recognize the workspace API used by this dashboard. Update or restart the gateway so both are on the same release.', '网关正在响应，但未识别当前控制台使用的工作空间 API。请更新或重启网关以保持版本一致。')
    : unauthorized
      ? t('Sign in again to access your workspaces.', '请重新登录以访问您的工作空间。')
      : forbidden
        ? t('Ask your organization administrator for workspace access.', '请联系您的组织管理员获取工作空间访问权限。')
        : problem.kind === 'network'
          ? t('The dashboard could not reach the workspace management API. Check the gateway process, then retry.', '控制台无法连接到工作空间管理 API，请检查网关进程后重试。')
          : t('The gateway returned a response the dashboard could not use. Check the gateway version and retry.', '网关返回了控制台无法识别的响应，请检查网关版本后重试。');

  return <section className="workspace-recovery" role="alert" aria-labelledby="workspace-recovery-title">
    <div className={`workspace-recovery-icon${versionMismatch || unauthorized || forbidden ? ' is-warning' : ''}`}><AlertTriangle aria-hidden="true" size={22} /></div>
    <div className="workspace-recovery-copy">
      <p className="workspace-recovery-label">{t('Workspace access', '工作空间访问')}</p>
      <h2 id="workspace-recovery-title">{heading}</h2>
      <p>{description}</p>
      {problem.kind === 'api' && <div className="workspace-recovery-request">
        <span>{t('Request', '请求')}</span>
        <code>GET {problem.endpoint}</code>
        <strong>HTTP {problem.status}</strong>
      </div>}
      <div className="workspace-recovery-actions">
        <Button type="button" onClick={onRetry}><RefreshCw aria-hidden="true" size={16} />{t('Retry workspace access', '重试工作空间访问')}</Button>
        {versionMismatch && <span>{t('Restarting the gateway keeps its database data in place.', '重启网关不会影响已有数据库数据。')}</span>}
      </div>
    </div>
  </section>;
}
