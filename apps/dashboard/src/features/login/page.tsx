import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { IconChevronDown, IconLanguage } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useDashboardContext } from '@/app/dashboard-context';
import { safeLoginReturn } from '@/app/login-return';
import { useBranding } from '@/app/branding';
import { useLocale, type Locale } from '@/app/locale';

export default function LoginRoute() {
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

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if(inFlight.current || checking || configurationFailed || !(mode==='token'?tokenLogin:memberLogin))return;
    const controller=new AbortController();request.current=controller;inFlight.current=true;
    setLocalError('');setSubmitting(true);
    try {
      const response=await fetch(mode==='token'?'/api/v1/auth/browser/token':'/api/v1/auth/browser/login',{
        method:'POST',headers:{'content-type':'application/json'},
        body:JSON.stringify(mode==='token'?{token:accessToken.trim()}:{email:username,password}),
        cache:'no-store',signal:controller.signal,
      });
      if(controller.signal.aborted)return;
      if(!response.ok){
        setLocalError(response.status===401
          ? mode==='token'?t('That access token is invalid, expired or revoked.', '该访问令牌无效、已过期或已吊销。'):t('That email or password did not match.', '邮箱或密码不匹配。')
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
  };

  function changeMode(next:'password'|'token'){
    if(inFlight.current)return;
    setLocalError('');setAccessToken('');setPassword('');setMode(next);
  }

  return <main className="dashboard-login">
    <section className="dashboard-login-card" aria-label="Sign in">
      <Link className="dashboard-login-brand" to={import.meta.env.BASE_URL} aria-label={`${branding.display_name} home`}>
        <img src={logo} alt="" />
        <span>{branding.display_name === 'Niu' ? t('Niu', 'Niu 牛元') : branding.display_name}</span>
      </Link>
      <nav aria-label="Public resources" className="mb-6 flex flex-wrap items-center justify-center gap-2">
        <Button asChild variant="ghost" size="sm"><a href="/models/">{t('Models', '模型目录')}</a></Button>
        <Button asChild variant="ghost" size="sm"><a href="/docs/">{t('Documentation', '文档')}</a></Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="sm" aria-label="Language">
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
      <form className="dashboard-login-form" onSubmit={submit}>
          {(location.state as {passwordChanged?: boolean} | null)?.passwordChanged === true && <p role="status">{t('Password changed. Sign in again.', '密码已修改，请重新登录。')}</p>}
          {mode==='token'?<div className="dashboard-login-field">
            <Label htmlFor="local-access-token">{t('User access token', '用户访问令牌')}</Label>
            <Input key="access-token" id="local-access-token" type="password" autoComplete="off" autoFocus spellCheck={false}
              value={accessToken} onChange={event=>setAccessToken(event.target.value)}
              disabled={submitting} required maxLength={256}/>
            <p className="text-sm text-muted-foreground">{t('Use the temporary access token your workspace owner shared with you.', '请使用工作空间所有者分享给您的临时访问令牌。')}</p>
          </div>:<>
          <div className="dashboard-login-field"><Label htmlFor="local-username">{t('Email', '邮箱')}</Label>
          <Input
            key="email"
            id="local-username"
            type="email"
            autoComplete="username"
            disabled={submitting}
            autoFocus
            onChange={event => setUsername(event.target.value)}
            value={username}
            required
          />
          </div><div className="dashboard-login-field"><Label htmlFor="local-password">{t('Password', '密码')}</Label>
          <Input
            id="local-password"
            autoComplete="current-password"
            disabled={submitting}
            onChange={event => setPassword(event.target.value)}
            type="password"
            value={password}
            required
          />
          </div></>}
          {(localError || context.error) && <p className="dashboard-login-error" role="alert">{localError || context.error}</p>}
        {configurationFailed && <>
          <p className="dashboard-login-error" role="alert">{t('Sign-in is temporarily unavailable.', '登录服务暂不可用。')}</p>
          <Button type="button" variant="outline" disabled={checking} onClick={() => {
            setChecking(true);
            setConfigurationFailed(false);
            setLocalError('');
            setConfigurationAttempt(value => value + 1);
          }}>{t('Try again', '重试')}</Button>
        </>}
        <Button type="submit" disabled={submitting || checking || configurationFailed || !(mode==='token'?tokenLogin:memberLogin)}>{submitting ? t('Signing in…', '正在登录…') : checking ? t('Loading…', '加载中…') : t('Sign in', '登录')}</Button>
        {mode==='password'&&tokenLogin&&<Button type="button" variant="ghost" disabled={submitting||checking} onClick={()=>changeMode('token')}>{t('Use an access token', '使用访问令牌')}</Button>}
        {mode==='token'&&memberLogin&&<Button type="button" variant="ghost" disabled={submitting||checking} onClick={()=>changeMode('password')}>{t('Use email and password', '使用邮箱和密码')}</Button>}
      </form>
    </section>
  </main>;
}
