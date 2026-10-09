import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router';
import { useDashboardContext } from '@/app/dashboard-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import logo from '../../../../../branding/assets/niu-mark.png';

/** Explicit platform administration; never an account-login fallback. */
export default function InstallationRoute() {
  const context = useDashboardContext();
  const navigate = useNavigate();
  useEffect(() => {
    if (context.token && context.session?.kind === 'installation') navigate('/admin/suppliers', { replace: true });
  }, [context.token, context.session?.kind, navigate]);
  return <main className="dashboard-login">
    <section className="dashboard-login-card" aria-label="Installation administration">
      <Link className="dashboard-login-brand" to={import.meta.env.BASE_URL} aria-label="Niu home">
        <img src={logo} alt="" /><span>niu.io</span><span className="dashboard-login-product">Dashboard</span>
      </Link>
      <h1>Installation administration</h1>
      <p className="dashboard-login-intro">Use the administrator credential configured for this installation.</p>
      <form className="dashboard-login-form" onSubmit={context.connect}>
        <Label htmlFor="installation-token">Administrator token</Label>
        <Input id="installation-token" type="password" autoComplete="off" autoFocus required value={context.draftToken} onChange={event => context.setDraftToken(event.target.value)} />
        {context.error && <p className="dashboard-login-error" role="alert">{context.error}</p>}
        {context.token && context.session?.kind === 'operator' && <p className="dashboard-login-error" role="alert">An installation administrator credential is required.</p>}
        <Button type="submit">Continue</Button>
      </form>
    </section>
  </main>;
}
