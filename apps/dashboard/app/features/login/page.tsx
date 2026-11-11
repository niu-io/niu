import { useLocale as useUILocale } from '@/shell/ui-locale';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { IconChevronDown, IconKey, IconLanguage, IconMail, IconSparkles } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useDashboardContext } from '@/shell/dashboard-context';
import { safeLoginReturn } from '@/shell/login-return';
import { useBranding } from '@/shell/branding';
import NiuBrand from '@/components/NiuBrand';
import { useLocale, type Locale } from '@/shell/ui-locale';

export default function LoginRoute() {
  const { t: uiT, format: uiF } = useUILocale();
  const { locale, setLocale, t } = useLocale();
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
  const [signInNotConfigured, setSignInNotConfigured] = useState(false);
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
        setSignInNotConfigured(value.password_login === false && value.browser_token_login === false);
        setConfigurationFailed(!passwordEnabled&&!tokenEnabled);
        if(!passwordEnabled&&tokenEnabled)setMode('token');
      })
      .catch(() => { if (!controller.signal.aborted) { setSignInNotConfigured(false); setConfigurationFailed(true); } })
      .finally(() => { if (!controller.signal.aborted) setChecking(false); });
    return () => controller.abort();
  }, [configurationAttempt]);

  useEffect(() => {
    if (context.token) {
      // Public pages are served as static artifacts; leave the dashboard router after login.
      const destination = new URL(returnTo, window.location.origin);
      const publicPath = destination.pathname;
      if (publicPath === '/' || /^\/(?:docs|blog|compare)(?:\/|$)/.test(publicPath)) window.location.replace(returnTo);
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
          ? kind==='demo'?t('Demo sign-in is unavailable. Try again later.', '演示登录暂不可用，请稍后再试。'):kind==='token'?t('That access token is invalid, expired or revoked.', '该访问令牌无效、已过期或已吊销。'):t('That email or password did not match.', '邮箱或密码不匹配。')
          : response.status===429?t('Too many sign-in attempts. Try again in a minute.', '登录尝试次数过多，请一分钟后再试。'):t('Sign-in failed. Try again.', '登录失败，请重试。'));
        return;
      }
      // The original durable session is held only in the HttpOnly cookie.
      // Browser state stores the disposable sentinel, never the supplied token.
      setAccessToken('');setPassword('');
      await context.connectWithToken('niu-browser-member-session');
    }catch{
      if(!controller.signal.aborted)setLocalError(t('Could not reach the sign-in service. Try again.', '无法连接登录服务，请重试。'));
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
    if (mode === 'token') {
      if (!accessToken.trim()) { setLocalError(t('Enter an access token.', '请输入访问令牌。')); return; }
    } else {
      const email = username.trim();
      if (!email) { setLocalError(t('Enter your email address.', '请输入邮箱地址。')); return; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setLocalError(t('Enter a valid email address.', '请输入有效的邮箱地址。')); return; }
      if (!password) { setLocalError(t('Enter your password.', '请输入密码。')); return; }
    }
    void signIn(mode);
  };

  function changeMode(next:'password'|'token'){
    if(inFlight.current)return;
    setLocalError('');setAccessToken('');setPassword('');setMode(next);
  }

  const showModeSwitch = (mode === 'password' && tokenLogin) || (mode === 'token' && memberLogin);

  return <main className="dashboard-login">
    <header className="dashboard-login-topbar">
      <Link className="dashboard-login-brand" to="/" aria-label={uiF("{0} home", [branding.display_name])}>
        {branding.display_name === 'Niu' && !branding.logo_data_url ? <NiuBrand locale={locale} /> : <><img src={logo} alt="" /><span>{branding.display_name === 'Niu' ? t('Niu', 'Niu') : branding.display_name}</span></>}
      </Link>
      <nav aria-label={uiT("Public resources")} className="dashboard-login-nav">
        <Button asChild variant="ghost" size="sm"><a href="/docs/">{t('Docs', '文档')}</a></Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="sm" aria-label={uiT("Language")}>
              <IconLanguage size={16} aria-hidden="true" />
              <span>{locale === 'zh-CN' ? '简体中文' : 'English'}</span>
              <IconChevronDown size={14} aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuRadioGroup value={locale} onValueChange={value => setLocale(value as Locale)}>
              <DropdownMenuRadioItem value="en">English</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="zh-CN">简体中文</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </nav>
    </header>
    <div className="dashboard-login-stage">
      <section className="dashboard-login-card" aria-label={uiT("Sign in")}>
        <div className="dashboard-login-header">
          <h1>{t('Sign in', '登录')}</h1>
          <p className="dashboard-login-intro">{t('Sign in to connect your agent and manage your workspaces.', '登录后即可连接 Agent 并管理工作空间。')}</p>
        </div>
        <form className="dashboard-login-form" onSubmit={submit} noValidate>
          {returnTo.startsWith('/connect') && (
            <p className="dashboard-login-status" role="status">
              {t('Sign in to review and authorize your coding agent connection.', '请先登录以审核并授权您的 Coding Agent 连接。')}
            </p>
          )}
          {returnTo.startsWith('/invite/') && (
            <p className="dashboard-login-status" role="status">
              {t('Sign in with the email this invitation was issued to. You will review the organization, workspace scope and role before accepting.', '请使用收到邀请的邮箱登录。接受前您将查看组织、工作空间范围与角色。')}
            </p>
          )}
          {(returnTo === '/models' || returnTo.startsWith('/models?') || returnTo.startsWith('/models/') || /^\/workspaces\/[^/]+\/models([/?#]|$)/.test(returnTo)) && (
            <p className="dashboard-login-status" role="status">
              {t('Model availability and pricing depend on your workspace. Sign in to browse your workspace model catalog.', '可用模型与价格取决于所属工作空间，请登录后查看对应工作空间的模型目录。')}
            </p>
          )}
          {(location.state as {passwordChanged?: boolean} | null)?.passwordChanged === true && (
            <p className="dashboard-login-status" role="status">{t('Password changed. Sign in again.', '密码已修改，请重新登录。')}</p>
          )}
          {!signInNotConfigured && (mode === 'token' ? (
            <div className="dashboard-login-field">
              <Label htmlFor="local-access-token">{t('User access token', '用户访问令牌')}</Label>
              <Input
                key="access-token"
                id="local-access-token"
                type="password"
                placeholder={t('Paste your access token', '粘贴您的访问令牌')}
                autoComplete="off"
                autoFocus
                spellCheck={false}
                value={accessToken}
                onChange={event => setAccessToken(event.target.value)}
                disabled={submitting}
                required
                maxLength={256}
                aria-describedby="login-error"
              />
              <p className="dashboard-login-hint">{t('Use the temporary access token your workspace owner shared with you.', '请使用工作空间所有者分享给您的临时访问令牌。')}</p>
            </div>
          ) : (
            <>
              <div className="dashboard-login-field">
                <Label htmlFor="local-username">{t('Email', '邮箱')}</Label>
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
                  aria-describedby="login-error"
                />
              </div>
              <div className="dashboard-login-field">
                <Label htmlFor="local-password">{t('Password', '密码')}</Label>
                <Input
                  id="local-password"
                  placeholder={t('Enter your password', '输入密码')}
                  autoComplete="current-password"
                  disabled={submitting}
                  onChange={event => setPassword(event.target.value)}
                  type="password"
                  value={password}
                  required
                  aria-describedby="login-error"
                />
              </div>
            </>
          ))}
          {(localError || context.error) && (
            <p id="login-error" className="dashboard-login-error" role="alert">{t(localError || context.error)}</p>
          )}
          {configurationFailed && (
            <div className="dashboard-login-unavailable">
              <p className="dashboard-login-error" role="alert">{signInNotConfigured ? t('Account sign-in is not configured. Contact your installation administrator.', '此实例尚未配置账户登录，请联系实例管理员。') : t('Sign-in is temporarily unavailable.', '登录服务暂不可用。')}</p>
              {signInNotConfigured && <p className="dashboard-login-hint">{t('Installation administrators can sign in with their administrator token.', '实例管理员可使用管理员令牌登录。')} <Link className="underline underline-offset-2" to="/installation">{t('Open installation administration', '打开实例管理')}</Link></p>}
              <Button
                type="button"
                variant="outline"
                disabled={checking}
                onClick={() => {
                  setChecking(true);
                  setConfigurationFailed(false);
                  setSignInNotConfigured(false);
                  setLocalError('');
                  setConfigurationAttempt(value => value + 1);
                }}
              >
                {t('Try again', '重试')}
              </Button>
            </div>
          )}
          {!signInNotConfigured && <Button
            type="submit"
            className="dashboard-login-submit"
            disabled={submitting || checking || configurationFailed || !(mode === 'token' ? tokenLogin : memberLogin)}
          >
            {submitting ? t('Signing in…', '正在登录…') : checking ? t('Loading…', '加载中…') : t('Sign in', '登录')}
          </Button>}
        </form>
        {memberLogin && mode === 'password' && !configurationFailed && <p className="dashboard-login-hint dashboard-login-access-help">{t('Need an account or forgot your password? Ask your organization owner or installation administrator for help.', '需要账号或忘记密码？请联系组织所有者或实例管理员获取帮助。')}</p>}
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
                <span>{t('Use an access token', '使用访问令牌')}</span>
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
                <span>{t('Use email and password', '使用邮箱和密码')}</span>
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
                  <span>{t('Try the demo', '体验演示环境')}</span>
                </Button>
                <p className="dashboard-login-demo-caption">{t('Explore Niu in a shared demo workspace.', '在共享演示工作空间中探索 Niu。')}</p>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  </main>;
}
