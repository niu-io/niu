import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useConsoleContext } from '@/app/console-context';
import logo from '../../../../branding/assets/niu-mark.png';

export default function LoginRoute() {
  const context = useConsoleContext();
  const navigate = useNavigate();

  useEffect(() => {
    if (context.token) navigate('/workspaces/default/', { replace: true });
  }, [context.token, navigate]);

  return <main className="console-login">
    <section className="console-login-card" aria-labelledby="console-login-title">
      <Link className="console-login-brand" to={import.meta.env.BASE_URL} aria-label="Niu home">
        <img src={logo} alt="" />
        <span>niu.io</span>
        <span className="console-login-product">Console</span>
      </Link>
      <h1 id="console-login-title">Sign in to Niu</h1>
      <p className="console-login-intro">Use your installation administrator token.</p>
      <form className="console-login-form" onSubmit={context.connect}>
        <Label htmlFor="installation-token">Administrator token</Label>
        <Input
          id="installation-token"
          autoComplete="current-password"
          autoFocus
          onChange={event => context.setDraftToken(event.target.value)}
          type="password"
          value={context.draftToken}
          required
        />
        {context.error && <p className="console-login-error" role="alert">{context.error}</p>}
        <Button type="submit">Sign in</Button>
      </form>
    </section>
  </main>;
}
