import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router';
import { useDashboardContext } from '@/app/dashboard-context';
import { useLocale } from '@/app/locale';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import logo from '../../../../../branding/assets/niu-mark.png';

/** Explicit platform administration; never an account-login fallback. */
export default function InstallationRoute() {
  const { t } = useLocale();
  const context = useDashboardContext();
  const navigate = useNavigate();
  useEffect(() => {
    if (context.token && context.session?.kind === 'installation') navigate('/admin/providers', { replace: true });
  }, [context.token, context.session?.kind, navigate]);
  return <main className="dashboard-login">
    <header className="dashboard-login-topbar">
      <Link className="dashboard-login-brand" to={import.meta.env.BASE_URL} aria-label="Niu home">
        <img src={logo} alt="" /><span>{t('Niu', 'Niu 牛元')}</span><span className="dashboard-login-product">{t('Dashboard', '控制台')}</span>
      </Link>
      <nav aria-label="Public resources" className="dashboard-login-nav">
        <Button asChild variant="ghost" size="sm"><a href="/models/">{t('Models', '模型目录')}</a></Button>
        <Button asChild variant="ghost" size="sm"><a href="/docs/">{t('Documentation', '文档')}</a></Button>
      </nav>
    </header>
    <div className="dashboard-login-stage">
      <section className="dashboard-login-card" aria-label="Installation administration">
        <div className="dashboard-login-header">
          <h1>{t('Installation administration', '实例管理')}</h1>
          <p className="dashboard-login-intro">{t('Use the administrator credential configured for this installation.', '请使用为此实例配置的管理员凭证。')}</p>
        </div>
        <form className="dashboard-login-form" onSubmit={context.connect}>
          <div className="dashboard-login-field">
            <Label htmlFor="installation-token">{t('Administrator token', '管理员令牌')}</Label>
            <Input
              id="installation-token"
              type="password"
              placeholder={t('Enter administrator token', '输入管理员令牌')}
              autoComplete="off"
              autoFocus
              required
              value={context.draftToken}
              onChange={event => context.setDraftToken(event.target.value)}
            />
          </div>
          {context.error && <p className="dashboard-login-error" role="alert">{context.error}</p>}
          {context.token && context.session?.kind === 'operator' && <p className="dashboard-login-error" role="alert">{t('An installation administrator credential is required.', '需要提供实例管理员凭证。')}</p>}
          <Button type="submit" className="dashboard-login-submit">{t('Continue', '继续')}</Button>
        </form>
      </section>
    </div>
  </main>;
}
