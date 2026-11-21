import { useLocale as useUILocale } from '@/shell/ui-locale';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { IconChevronDown, IconKey, IconLanguage, IconMail, IconSparkles, IconUserPlus } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { loadAuthConfig } from '@/lib/auth-config';
import { loadPublicCatalogModels } from '@/features/models/public-catalog';
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
  const searchParams = new URLSearchParams(location.search);
  const registrationIntent =
    location.pathname.replace(/\/+$/, '') === '/register' || searchParams.get('intent') === 'register';
  const requestedReturn = (location.state as { from?: unknown } | null)?.from;
  const returnTo = safeLoginReturn(requestedReturn)
    ?? safeLoginReturn(searchParams.get('returnTo'))
    ?? '/workspaces/default/';
  const [memberLogin, setMemberLogin] = useState(false);
  const [tokenLogin, setTokenLogin] = useState(false);
  const [demoLogin, setDemoLogin] = useState(false);
  const [registrationOpen, setRegistrationOpen] = useState(false);
  const demoAttempted = useRef(false);
  const directDemo = new URLSearchParams(location.search).get('demo') === '1';
  const [mode, setMode] = useState<'password'|'token'>('password');
  const [accessToken, setAccessToken] = useState('');
  const request = useRef<AbortController|null>(null);
  const inFlight = useRef(false);
  const [username, setUsername] = useState(() => searchParams.get('email') ?? '');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState('');
  const [tokenAuthFailed, setTokenAuthFailed] = useState(false);
  const [pendingApprovalNotice, setPendingApprovalNotice] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [checking, setChecking] = useState(true);
  const [configurationFailed, setConfigurationFailed] = useState(false);
  const [signInNotConfigured, setSignInNotConfigured] = useState(false);
  const [configurationAttempt, setConfigurationAttempt] = useState(0);
  const [hasPublicModels, setHasPublicModels] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void loadPublicCatalogModels({ signal: controller.signal })
      .then(result => {
        if (!controller.signal.aborted) {
          setHasPublicModels(result.models.length > 0);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setHasPublicModels(false);
        }
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadAuthConfig({ signal: controller.signal, force: configurationAttempt > 0 })
      .then(value => {
        if(controller.signal.aborted)return;
        const passwordEnabled=value.password_login===true;
        const tokenEnabled=value.browser_token_login===true;
        setMemberLogin(passwordEnabled);
        setTokenLogin(tokenEnabled);
        setDemoLogin(value.demo_login === true);
        setRegistrationOpen(passwordEnabled && value.registration_mode === 'approval_required');
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
    setLocalError('');setTokenAuthFailed(false);setPendingApprovalNotice(false);setSubmitting(true);
    try {
      const response=await fetch(kind==='demo'?'/api/v1/auth/browser/demo':kind==='token'?'/api/v1/auth/browser/token':'/api/v1/auth/browser/login',{
        method:'POST',headers:{'content-type':'application/json'},
        body:JSON.stringify(kind==='demo'?{}:kind==='token'?{token:accessToken.trim()}:{email:username,password}),
        cache:'no-store',signal:controller.signal,
      });
      if(controller.signal.aborted)return;
      if(!response.ok){
        const payload = await response.json().catch(() => null);
        if (response.status === 403 && payload?.error?.type === 'registration_pending_approval') {
          setPendingApprovalNotice(true);
          return;
        }
        if (response.status === 401 && kind === 'token') {
          setTokenAuthFailed(true);
        }
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
    setPendingApprovalNotice(false);
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
    setLocalError('');setTokenAuthFailed(false);setPendingApprovalNotice(false);setAccessToken('');setPassword('');setMode(next);
  }

  const registerHref = returnTo !== '/workspaces/default/'
    ? `/register?returnTo=${encodeURIComponent(returnTo)}`
    : '/register';

  const showModeSwitch = (mode === 'password' && tokenLogin) || (mode === 'token' && memberLogin);

  return <main className="dashboard-login">
    <header className="dashboard-login-topbar">
      <Link className="dashboard-login-brand" to="/" aria-label={uiF("{0} home", [branding.display_name])}>
        {branding.display_name === 'Niu' && !branding.logo_data_url ? <NiuBrand locale={locale} /> : <><img src={logo} alt="" /><span>{branding.display_name === 'Niu' ? t('Niu', 'Niu') : branding.display_name}</span></>}
      </Link>
      <nav aria-label={uiT("Public resources")} className="dashboard-login-nav">
        {hasPublicModels && <Button asChild variant="ghost" size="sm"><Link to="/models">{t('Models', '模型')}</Link></Button>}
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
          {registrationIntent && !checking && !registrationOpen && (
            <p className="dashboard-login-status" role="status">
              {t('Self-registration is not enabled on this deployment. Ask your organization owner for an invitation link or contact your installation administrator for an account, then sign in below.', '此部署未开放自助注册。请向组织所有者索取邀请链接，或联系实例管理员开通账号后再登录。')}
            </p>
          )}
          {pendingApprovalNotice && (
            <p className="dashboard-login-status" role="status">
              {t('Your Limited Preview registration is awaiting administrator approval. Sign in again once an administrator approves your account.', '您的有限预览注册申请正在等待管理员审批。管理员批准后即可使用此邮箱和密码登录。')}
            </p>
          )}
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
                onChange={event => { setAccessToken(event.target.value); setTokenAuthFailed(false); }}
                disabled={submitting}
                required
                maxLength={256}
                aria-describedby="login-error"
              />
              <p className="dashboard-login-hint">
                {t('Use the member access token your workspace owner shared with you. For NIU_ADMIN_TOKENS, use', '请使用工作空间所有者分享给您的成员访问令牌；环境变量 NIU_ADMIN_TOKENS 请前往')}{locale === 'zh-CN' ? '' : ' '}
                <Link className="underline underline-offset-2" to="/installation">
                  {t('Installation administration', '实例管理')}
                </Link>
                {t('.', '登录。')}
              </p>
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
                  onChange={event => { setUsername(event.target.value); setPendingApprovalNotice(false); }}
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
                  onChange={event => { setPassword(event.target.value); setPendingApprovalNotice(false); }}
                  type="password"
                  value={password}
                  required
                  aria-describedby="login-error"
                />
              </div>
            </>
          ))}
          {(localError || context.error) && (
            <div id="login-error" className="space-y-1.5" role="alert">
              <p className="dashboard-login-error">{t(localError || context.error)}</p>
              {mode === 'token' && tokenAuthFailed && (
                <p className="dashboard-login-hint">
                  {t('Using an administrator token from NIU_ADMIN_TOKENS?', '如果您使用的是环境变量 NIU_ADMIN_TOKENS 中的管理员令牌，')}{locale === 'zh-CN' ? '' : ' '}
                  <Link className="underline underline-offset-2" to="/installation">
                    {t('Sign in via Installation administration', '请前往实例管理登录')}
                  </Link>
                  {t('.', '。')}
                </p>
              )}
            </div>
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
        {!configurationFailed && !signInNotConfigured && !registrationOpen && (
          <p className="dashboard-login-hint dashboard-login-access-help">
            {t('Need an account or forgot your password? Ask your organization owner for an invitation or contact your installation administrator.', '需要账号、邀请或忘记密码？请联系组织所有者获取邀请，或联系实例管理员协助恢复。')}{' '}
            <Link className="underline underline-offset-2" to="/installation">
              {t('Administrator token sign-in', '管理员令牌登录')}
            </Link>
          </p>
        )}
        {!configurationFailed && !signInNotConfigured && registrationOpen && (
          <p className="dashboard-login-hint dashboard-login-access-help">
            {t('Installation administrator?', '实例管理员？')}{' '}
            <Link className="underline underline-offset-2" to="/installation">
              {t('Administrator token sign-in', '管理员令牌登录')}
            </Link>
          </p>
        )}
        {(showModeSwitch || demoLogin || registrationOpen) && (
          <div className="dashboard-login-secondary">
            {registrationOpen && (
              <Button
                asChild
                variant="outline"
                size="sm"
                className="dashboard-login-switch"
              >
                <Link to={registerHref}>
                  <IconUserPlus size={15} aria-hidden="true" />
                  <span>{t('Limited Preview · Request account', '有限预览 · 申请注册账号')}</span>
                </Link>
              </Button>
            )}
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
