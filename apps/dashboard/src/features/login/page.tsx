import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { IconKey, IconMail, IconSparkles } from '@tabler/icons-react';
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
  const [tokenLogin, setTokenLogin] = useState(false);
  const [demoLogin, setDemoLogin] = useState(false);
  const demoAttempted = useRef(false);
  const directDemo = new URLSearchParams(location.search).get('demo') === '1';
  const [mode, setMode] = useState<'password'|'token'>('password');
  const [accessToken, setAccessToken] = useState('');
  const request = useRef<AbortController|null>(null);
  const inFlight = useRef(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [checking, setChecking] = useState(true);
  const [configurationFailed, setConfigurationFailed] = useState(false);
  const [configurationAttempt, setConfigurationAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/v1/auth/config', { signal: controller.signal, cache: 'no-store' })
      .then(async response => {
        if(!response.ok)throw new Error('Sign-in configuration unavailable');
        const value=await response.json();
        if(controller.signal.aborted)return;
        const passwordEnabled=value.password_login===true;
        const tokenEnabled=value.browser_token_login===true;
        setMemberLogin(passwordEnabled);
        setTokenLogin(tokenEnabled);
        setDemoLogin(value.demo_login === true);
        setConfigurationFailed(!passwordEnabled&&!tokenEnabled);
        if(!passwordEnabled&&tokenEnabled)setMode('token');
      })
      .catch(() => { if (!controller.signal.aborted) setConfigurationFailed(true); })
      .finally(() => { if (!controller.signal.aborted) setChecking(false); });
    return () => controller.abort();
  }, [configurationAttempt]);

  useEffect(() => {
    if (context.token) {
      // Public pages are served as static artifacts; leave the dashboard router after login.
      const destination = new URL(returnTo, window.location.origin);
      const publicPath = destination.pathname;
      const publicModels = /^\/models\/?$/.test(publicPath) && !destination.searchParams.get('workspace');
      if (publicModels || publicPath === '/' || /^\/(?:docs|blog|compare)(?:\/|$)/.test(publicPath)) window.location.replace(returnTo);
      else navigate(returnTo, { replace: true });
    }
  }, [context.token, navigate, returnTo]);

  useEffect(()=>()=>request.current?.abort(),[]);

  const signIn = useCallback(async (kind: 'password'|'token'|'demo') => {
    if(inFlight.current || checking || configurationFailed || !(kind==='demo'?demoLogin:kind==='token'?tokenLogin:memberLogin))return;
    const controller=new AbortController();request.current=controller;inFlight.current=true;
    setLocalError('');setSubmitting(true);
    try {
      const response=await fetch(kind==='demo'?'/api/v1/auth/browser/demo':kind==='token'?'/api/v1/auth/browser/token':'/api/v1/auth/browser/login',{
        method:'POST',headers:{'content-type':'application/json'},
        body:JSON.stringify(kind==='demo'?{}:kind==='token'?{token:accessToken.trim()}:{email:username,password}),
        cache:'no-store',signal:controller.signal,
      });
      if(controller.signal.aborted)return;
      if(!response.ok){
        setLocalError(response.status===401
          ? kind==='demo'?'Demo sign-in is unavailable. Try again later.':kind==='token'?'That access token is invalid, expired or revoked.':'That email or password did not match.'
          : response.status===429?'Too many sign-in attempts. Try again in a minute.':'Sign-in failed. Try again.');
        return;
      }
      // The original durable session is held only in the HttpOnly cookie.
      // Browser state stores the disposable sentinel, never the supplied token.
      setAccessToken('');setPassword('');
      await context.connectWithToken('niu-browser-member-session');
    }catch{
      if(!controller.signal.aborted)setLocalError('Could not reach the sign-in service. Try again.');
    }finally{
      if(request.current===controller){inFlight.current=false;if(!controller.signal.aborted)setSubmitting(false);}
    }
  }, [checking, configurationFailed, demoLogin, tokenLogin, memberLogin, accessToken, username, password, context.connectWithToken]);

  useEffect(() => {
    if (!directDemo || !context.sessionChecked || checking || configurationFailed || context.token || demoAttempted.current) return;
    demoAttempted.current = true;
    if (demoLogin) void signIn('demo');
    else setLocalError('Demo sign-in is not available on this installation.');
  }, [directDemo, context.sessionChecked, checking, configurationFailed, context.token, demoLogin, signIn]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void signIn(mode);
  };

  function changeMode(next:'password'|'token'){
    if(inFlight.current)return;
    setLocalError('');setAccessToken('');setPassword('');setMode(next);
  }

  const showModeSwitch = (mode === 'password' && tokenLogin) || (mode === 'token' && memberLogin);

  return <main className="dashboard-login">
    <header className="dashboard-login-topbar">
      <Link className="dashboard-login-brand" to={import.meta.env.BASE_URL} aria-label={`${branding.display_name} home`}>
        <img src={logo} alt="" />
        <span>{branding.display_name}</span>
      </Link>
      <nav aria-label="Public resources" className="dashboard-login-nav">
        <Button asChild variant="ghost" size="sm"><a href="/models/">Models</a></Button>
        <Button asChild variant="ghost" size="sm"><a href="/docs/">Documentation</a></Button>
      </nav>
    </header>
    <div className="dashboard-login-stage">
      <section className="dashboard-login-card" aria-label="Sign in">
        <div className="dashboard-login-header">
          <h1>Sign in</h1>
          <p className="dashboard-login-intro">Sign in to manage workspaces, API keys, model routes, and billing.</p>
        </div>
        <form className="dashboard-login-form" onSubmit={submit}>
          {(location.state as {passwordChanged?: boolean} | null)?.passwordChanged === true && (
            <p className="dashboard-login-status" role="status">Password changed. Sign in again.</p>
          )}
          {mode === 'token' ? (
            <div className="dashboard-login-field">
              <Label htmlFor="local-access-token">User access token</Label>
              <Input
                key="access-token"
                id="local-access-token"
                type="password"
                placeholder="Paste your access token"
                autoComplete="off"
                autoFocus
                spellCheck={false}
                value={accessToken}
                onChange={event => setAccessToken(event.target.value)}
                disabled={submitting}
                required
                maxLength={256}
              />
              <p className="dashboard-login-hint">Use the temporary access token your workspace owner shared with you.</p>
            </div>
          ) : (
            <>
              <div className="dashboard-login-field">
                <Label htmlFor="local-username">Email</Label>
                <Input
                  key="email"
                  id="local-username"
                  type="email"
                  placeholder="name@company.com"
                  autoComplete="username"
                  disabled={submitting}
                  autoFocus
                  onChange={event => setUsername(event.target.value)}
                  value={username}
                  required
                />
              </div>
              <div className="dashboard-login-field">
                <Label htmlFor="local-password">Password</Label>
                <Input
                  id="local-password"
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  disabled={submitting}
                  onChange={event => setPassword(event.target.value)}
                  type="password"
                  value={password}
                  required
                />
              </div>
            </>
          )}
          {(localError || context.error) && (
            <p className="dashboard-login-error" role="alert">{localError || context.error}</p>
          )}
          {configurationFailed && (
            <div className="dashboard-login-unavailable">
              <p className="dashboard-login-error" role="alert">Sign-in is temporarily unavailable.</p>
              <Button
                type="button"
                variant="outline"
                disabled={checking}
                onClick={() => {
                  setChecking(true);
                  setConfigurationFailed(false);
                  setLocalError('');
                  setConfigurationAttempt(value => value + 1);
                }}
              >
                Try again
              </Button>
            </div>
          )}
          <Button
            type="submit"
            className="dashboard-login-submit"
            disabled={submitting || checking || configurationFailed || !(mode === 'token' ? tokenLogin : memberLogin)}
          >
            {submitting ? 'Signing in…' : checking ? 'Loading…' : 'Sign in'}
          </Button>
        </form>
        {(showModeSwitch || demoLogin) && (
          <div className="dashboard-login-secondary">
            {mode === 'password' && tokenLogin && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="dashboard-login-switch"
                disabled={submitting || checking}
                onClick={() => changeMode('token')}
              >
                <IconKey size={15} aria-hidden="true" />
                <span>Use an access token</span>
              </Button>
            )}
            {mode === 'token' && memberLogin && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="dashboard-login-switch"
                disabled={submitting || checking}
                onClick={() => changeMode('password')}
              >
                <IconMail size={15} aria-hidden="true" />
                <span>Use email and password</span>
              </Button>
            )}
            {demoLogin && (
              <div className="dashboard-login-demo">
                <Button
                  type="button"
                  variant="outline"
                  className="dashboard-login-demo-button"
                  disabled={submitting || checking}
                  onClick={() => void signIn('demo')}
                >
                  <IconSparkles size={15} aria-hidden="true" />
                  <span>Try the demo</span>
                </Button>
                <p className="dashboard-login-demo-caption">Explore Niu in a shared demo workspace.</p>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  </main>;
}
