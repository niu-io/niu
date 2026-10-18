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
    if (context.token && context.session?.kind === 'installation') navigate('/admin/suppliers', { replace: true });
  }, [context.token, context.session?.kind, navigate]);
  return <main className="dashboard-login">
    <section className="dashboard-login-card" aria-label="Installation administration">
      <Link className="dashboard-login-brand" to={import.meta.env.BASE_URL} aria-label="Niu home">
        <img src={logo} alt="" /><span>{t('Niu', 'Niu 牛元')}</span><span className="dashboard-login-product">{t('Dashboard', '控制台')}</span>
      </Link>
      <h1>{t('Installation administration', '实例管理')}</h1>
      <p className="dashboard-login-intro">{t('Use the administrator credential configured for this installation.', '请使用为此实例配置的管理员凭证。')}</p>
      <form className="dashboard-login-form" onSubmit={context.connect}>
        <div className="dashboard-login-field">
          <Label htmlFor="installation-token">{t('Administrator token', '管理员令牌')}</Label>
          <Input id="installation-token" type="password" autoComplete="off" autoFocus required value={context.draftToken} onChange={event => context.setDraftToken(event.target.value)} />
        </div>
        {context.error && <p className="dashboard-login-error" role="alert">{context.error}</p>}
        {context.token && context.session?.kind === 'operator' && <p className="dashboard-login-error" role="alert">{t('An installation administrator credential is required.', '需要提供实例管理员凭证。')}</p>}
        <Button type="submit">{t('Continue', '继续')}</Button>
      </form>
    </section>
  </main>;
}
