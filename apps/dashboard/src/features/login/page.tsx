import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useDashboardContext } from '@/app/dashboard-context';
import { safeLoginReturn } from '@/app/login-return';
import { useBranding } from '@/app/branding';

export default function LoginRoute() {
  const {settings:branding,logo} = useBranding();
  const context = useDashboardContext();
  const navigate = useNavigate();
  const location = useLocation();
  const requestedReturn = (location.state as { from?: unknown } | null)?.from;
  const returnTo = safeLoginReturn(requestedReturn)
    ?? safeLoginReturn(new URLSearchParams(location.search).get('returnTo'))
    ?? '/workspaces/default/';
  const [memberLogin, setMemberLogin] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [checking, setChecking] = useState(true);
  const [configurationFailed, setConfigurationFailed] = useState(false);
  const [configurationAttempt, setConfigurationAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    void fetch('/admin/v1/auth/config', { signal: controller.signal, cache: 'no-store' })
      .then(async response => response.ok && (await response.json()).password_login === true)
      .then(enabled => {
        if (controller.signal.aborted) return;
        setMemberLogin(enabled);
        setConfigurationFailed(!enabled);
      })
      .catch(() => { if (!controller.signal.aborted) setConfigurationFailed(true); })
      .finally(() => { if (!controller.signal.aborted) setChecking(false); });
    return () => controller.abort();
  }, [configurationAttempt]);

  useEffect(() => {
    if (context.token) navigate(returnTo, { replace: true });
  }, [context.token, navigate, returnTo]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!memberLogin || checking || configurationFailed) return;
    setLocalError('');
    setSubmitting(true);
    try {
      const response = await fetch('/admin/v1/auth/browser/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: username, password }),
        cache: 'no-store',
      });
      if (!response.ok) {
        setLocalError(response.status === 401
          ? 'That email or password did not match.'
          : response.status === 429 ? 'Too many sign-in attempts. Try again in a minute.' : 'Sign-in failed. Try again.');
        setSubmitting(false);
        return;
      }
      await context.connectWithToken('niu-browser-member-session');
      setPassword('');
    } catch {
      setLocalError('Could not reach the sign-in service. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return <main className="dashboard-login">
    <section className="dashboard-login-card" aria-label="Sign in">
      <Link className="dashboard-login-brand" to={import.meta.env.BASE_URL} aria-label={`${branding.display_name} home`}>
        <img src={logo} alt="" />
        <span>{branding.display_name}</span>
        <span className="dashboard-login-product">Dashboard</span>
      </Link>
      <form className="dashboard-login-form" onSubmit={submit}>
          {(location.state as {passwordChanged?: boolean} | null)?.passwordChanged === true && <p role="status">Password changed. Sign in again.</p>}
          <Label htmlFor="local-username">Email</Label>
          <Input
            id="local-username"
            type="email"
            autoComplete="username"
            autoFocus
            onChange={event => setUsername(event.target.value)}
            value={username}
            required
          />
          <Label htmlFor="local-password">Password</Label>
          <Input
            id="local-password"
            autoComplete="current-password"
            onChange={event => setPassword(event.target.value)}
            type="password"
            value={password}
            required
          />
          {(localError || context.error) && <p className="dashboard-login-error" role="alert">{localError || context.error}</p>}
        {configurationFailed && <>
          <p className="dashboard-login-error" role="alert">Sign-in is temporarily unavailable.</p>
          <Button type="button" variant="outline" disabled={checking} onClick={() => {
            setChecking(true);
            setConfigurationFailed(false);
            setLocalError('');
            setConfigurationAttempt(value => value + 1);
          }}>Try again</Button>
        </>}
        <Button type="submit" disabled={submitting || checking || configurationFailed || !memberLogin}>{submitting ? 'Signing in…' : checking ? 'Loading…' : 'Sign in'}</Button>
      </form>
    </section>
  </main>;
}
