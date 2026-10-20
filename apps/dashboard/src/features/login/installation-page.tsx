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
    if (context.token && context.session?.kind === 'installation') navigate('/admin/providers', { replace: true });
  }, [context.token, context.session?.kind, navigate]);
  return <main className="dashboard-login">
    <header className="dashboard-login-topbar">
      <Link className="dashboard-login-brand" to={import.meta.env.BASE_URL} aria-label="Niu home">
        <img src={logo} alt="" /><span>Niu</span><span className="dashboard-login-product">Dashboard</span>
      </Link>
      <nav aria-label="Public resources" className="dashboard-login-nav">
        <Button asChild variant="ghost" size="sm"><a href="/models/">Models</a></Button>
        <Button asChild variant="ghost" size="sm"><a href="/docs/">Documentation</a></Button>
      </nav>
    </header>
    <div className="dashboard-login-stage">
      <section className="dashboard-login-card" aria-label="Installation administration">
        <div className="dashboard-login-header">
          <h1>Installation administration</h1>
          <p className="dashboard-login-intro">Use the administrator credential configured for this installation.</p>
        </div>
        <form className="dashboard-login-form" onSubmit={context.connect}>
          <div className="dashboard-login-field">
            <Label htmlFor="installation-token">Administrator token</Label>
            <Input
              id="installation-token"
              type="password"
              placeholder="Enter administrator token"
              autoComplete="off"
              autoFocus
              required
              value={context.draftToken}
              onChange={event => context.setDraftToken(event.target.value)}
            />
          </div>
          {context.error && <p className="dashboard-login-error" role="alert">{context.error}</p>}
          {context.token && context.session?.kind === 'operator' && <p className="dashboard-login-error" role="alert">An installation administrator credential is required.</p>}
          <Button type="submit" className="dashboard-login-submit">Continue</Button>
        </form>
      </section>
    </div>
  </main>;
}
