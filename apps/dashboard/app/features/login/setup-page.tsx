import { useLocale as useUILocale } from '@/shell/ui-locale';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { IconChevronDown, IconLanguage } from '@tabler/icons-react';
import { invalidateAuthConfigCache, loadAuthConfig } from '@/lib/auth-config';
import { loadPublicCatalogModels } from '@/features/models/public-catalog';
import { useDashboardContext } from '@/shell/dashboard-context';
import { useLocale, type Locale } from '@/shell/ui-locale';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import NiuBrand from '@/components/NiuBrand';
import { currencySymbol } from '@/lib/money';
import { useBranding } from '@/shell/branding';

type SetupMode = 'loading' | 'initial_setup' | 'token_fallback' | 'redirecting';

const SETUP_CURRENCIES = ['USD', 'CNY', 'EUR', 'GBP', 'HKD', 'JPY', 'SGD'] as const;

function formatSetupCurrencyOption(code: string, locale: Locale): string {
  try {
    const names = new Intl.DisplayNames([locale], { type: 'currency' });
    return `${names.of(code) ?? code} (${code}) · ${currencySymbol(code)}`;
  } catch {
    return `${code} · ${currencySymbol(code)}`;
  }
}

/** First-run platform administrator setup wizard, with direct token fallback only when password sign-in is unconfigured. */
export default function SetupRoute() {
  const { t: uiT, format: uiF } = useUILocale();
  const { locale, setLocale, t } = useLocale();
  const context = useDashboardContext();
  const { settings: branding, logo } = useBranding();
  const navigate = useNavigate();
  const [hasPublicModels, setHasPublicModels] = useState(false);
  const [mode, setMode] = useState<SetupMode>('loading');
  const [setupToken, setSetupToken] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [currency, setCurrency] = useState<string>('USD');
  const [setupError, setSetupError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const requestRef = useRef<AbortController | null>(null);
  const inFlightRef = useRef(false);
  const setupCompletedRef = useRef(false);
  const hasTokenRef = useRef(Boolean(context.token));
  hasTokenRef.current = Boolean(context.token);

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
    if (setupCompletedRef.current) return;
    const controller = new AbortController();
    void loadAuthConfig({ signal: controller.signal, force: true })
      .then(config => {
        if (controller.signal.aborted || setupCompletedRef.current) return;
        if (config.password_login === true) {
          if (config.setup_required === true) {
            setMode('initial_setup');
          } else {
            setMode('redirecting');
            navigate(hasTokenRef.current ? '/workspaces/default/' : '/login', { replace: true });
          }
          return;
        }
        setMode('token_fallback');
      })
      .catch(() => {
        if (!controller.signal.aborted && !setupCompletedRef.current) {
          setMode('token_fallback');
        }
      });
    return () => controller.abort();
  }, [navigate]);

  useEffect(() => {
    if (context.token && context.session?.kind === 'installation') {
      navigate('/admin/providers', { replace: true });
    }
  }, [context.token, context.session?.kind, navigate]);

  useEffect(() => () => requestRef.current?.abort(), []);

  async function submitInitialSetup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlightRef.current) return;
    const trimmedToken = setupToken.trim();
    const trimmedEmail = email.trim();
    const trimmedName = displayName.trim();
    if (!trimmedToken) {
      setSetupError(t('Enter the administrator token from NIU_ADMIN_TOKENS.', '请输入环境变量 NIU_ADMIN_TOKENS 中的管理员令牌。'));
      return;
    }
    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setSetupError(t('Enter a valid email address.', '请输入有效的邮箱地址。'));
      return;
    }
    if ([...password].length < 15) {
      setSetupError(t('Password must be at least 15 characters.', '密码长度至少为 15 位字符。'));
      return;
    }
    if (password !== confirmPassword) {
      setSetupError(t('Passwords do not match.', '两次输入的密码不一致。'));
      return;
    }
    const controller = new AbortController();
    requestRef.current = controller;
    inFlightRef.current = true;
    setSetupError('');
    setSubmitting(true);
    try {
      const response = await fetch('/api/v1/setup', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${trimmedToken}`,
        },
        body: JSON.stringify({
          email: trimmedEmail,
          password,
          ...(currency !== 'USD' ? { currency } : {}),
          ...(trimmedName ? { name: trimmedName } : {}),
        }),
        cache: 'no-store',
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        const errorType = payload?.error?.type;
        if (response.status === 401) {
          setSetupError(t('That administrator token is invalid. Verify NIU_ADMIN_TOKENS and try again.', '管理员令牌无效，请核对环境变量 NIU_ADMIN_TOKENS 后重试。'));
          return;
        }
        if (response.status === 409 && errorType === 'installation_already_initialized') {
          invalidateAuthConfigCache();
          navigate('/login', { replace: true });
          return;
        }
        if (response.status === 409 && errorType === 'registration_email_exists') {
          setSetupError(t('An account already uses this email address. Use a different email.', '该邮箱已被现有账号使用，请更换其他邮箱。'));
          return;
        }
        if (response.status === 429) {
          setSetupError(t('Too many setup attempts. Try again in a minute.', '初始化尝试次数过多，请一分钟后再试。'));
          return;
        }
        if (response.status === 400 && typeof payload?.error?.message === 'string') {
          setSetupError(payload.error.message);
          return;
        }
        setSetupError(t('Could not complete initial setup. Try again.', '无法完成初始化设置，请重试。'));
        return;
      }
      setupCompletedRef.current = true;
      setSetupToken('');
      setPassword('');
      setConfirmPassword('');
      invalidateAuthConfigCache();
      await context.connectWithToken('niu-browser-member-session');
      navigate('/admin', { replace: true });
    } catch {
      if (!controller.signal.aborted) {
        setSetupError(t('Could not reach the setup service. Try again.', '无法连接初始化服务，请重试。'));
      }
    } finally {
      if (requestRef.current === controller) {
        inFlightRef.current = false;
        if (!controller.signal.aborted) setSubmitting(false);
      }
    }
  }

  if (mode === 'redirecting') return null;

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
      {mode === 'loading' ? (
        <section className="dashboard-login-card" aria-label={t('Initial setup', '初始化设置')}>
          <div className="dashboard-login-header">
            <h1>{t('Initial setup', '初始化设置')}</h1>
            <p className="dashboard-login-intro">{t('Checking deployment status…', '正在检查部署状态…')}</p>
          </div>
        </section>
      ) : mode === 'initial_setup' ? (
        <section className="dashboard-login-card" aria-label={t('Initial administrator setup', '初始化管理员账号')}>
          <div className="dashboard-login-header">
            <h1>{t('Set up administrator account', '初始化管理员账号')}</h1>
            <p className="dashboard-login-intro">
              {t('Create the first platform administrator account for this deployment. Afterwards, sign in normally with your email and password and switch between workspaces and Admin anytime.', '为此实例创建第一个平台管理员账号。完成后可直接使用邮箱和密码登录，并随时在工作空间与管理后台之间切换。')}
            </p>
          </div>
          <form className="dashboard-login-form" onSubmit={submitInitialSetup} noValidate>
            <div className="dashboard-login-field">
              <Label htmlFor="installation-setup-token">{t('Setup token (NIU_ADMIN_TOKENS)', '初始化令牌（NIU_ADMIN_TOKENS）')}</Label>
              <Input
                id="installation-setup-token"
                type="password"
                placeholder={t('Paste configured administrator token', '粘贴部署配置的管理员令牌')}
                autoComplete="off"
                autoFocus
                spellCheck={false}
                required
                disabled={submitting}
                value={setupToken}
                onChange={event => setSetupToken(event.target.value)}
                aria-describedby="installation-setup-error"
              />
            </div>
            <div className="dashboard-login-field">
              <Label htmlFor="installation-admin-name">{t('Display name', '显示名称')}</Label>
              <Input
                id="installation-admin-name"
                type="text"
                placeholder={t('Platform Administrator', '平台管理员')}
                autoComplete="name"
                maxLength={100}
                disabled={submitting}
                value={displayName}
                onChange={event => setDisplayName(event.target.value)}
              />
            </div>
            <div className="dashboard-login-field">
              <Label htmlFor="installation-admin-email">{t('Administrator email', '管理员邮箱')}</Label>
              <Input
                id="installation-admin-email"
                type="email"
                placeholder="admin@company.com"
                autoComplete="username"
                required
                disabled={submitting}
                value={email}
                onChange={event => setEmail(event.target.value)}
                aria-describedby="installation-setup-error"
              />
            </div>
            <div className="dashboard-login-field">
              <Label htmlFor="installation-admin-password">{t('Password', '密码')}</Label>
              <Input
                id="installation-admin-password"
                type="password"
                placeholder={t('At least 15 characters', '至少 15 位字符')}
                autoComplete="new-password"
                required
                disabled={submitting}
                value={password}
                onChange={event => setPassword(event.target.value)}
                aria-describedby="installation-setup-error"
              />
            </div>
            <div className="dashboard-login-field">
              <Label htmlFor="installation-admin-password-confirm">{t('Confirm password', '确认密码')}</Label>
              <Input
                id="installation-admin-password-confirm"
                type="password"
                placeholder={t('Re-enter your password', '再次输入密码')}
                autoComplete="new-password"
                required
                disabled={submitting}
                value={confirmPassword}
                onChange={event => setConfirmPassword(event.target.value)}
                aria-describedby="installation-setup-error"
              />
            </div>
            <div className="dashboard-login-field">
              <Label>{t('Billing currency', '平台计费币种')}</Label>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={submitting}
                    className="w-full justify-between font-normal"
                    aria-label={t('Billing currency', '平台计费币种')}
                  >
                    <span>{formatSetupCurrencyOption(currency, locale)}</span>
                    <IconChevronDown size={14} aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)]">
                  <DropdownMenuRadioGroup value={currency} onValueChange={setCurrency}>
                    {SETUP_CURRENCIES.map(code => (
                      <DropdownMenuRadioItem key={code} value={code}>
                        {formatSetupCurrencyOption(code, locale)}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            {setupError && <p id="installation-setup-error" className="dashboard-login-error" role="alert">{t(setupError)}</p>}
            <Button type="submit" className="dashboard-login-submit" disabled={submitting}>
              {submitting ? t('Creating administrator…', '正在创建管理员账号…') : t('Create administrator account', '创建管理员账号')}
            </Button>
          </form>
        </section>
      ) : (
        <section className="dashboard-login-card" aria-label={uiT("Installation administration")}>
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
            {context.error && <p className="dashboard-login-error" role="alert">{t(context.error)}</p>}
            {context.token && context.session?.kind === 'operator' && <p className="dashboard-login-error" role="alert">{t('An installation administrator credential is required.', '需要提供实例管理员凭证。')}</p>}
            <Button type="submit" className="dashboard-login-submit">{t('Continue', '继续')}</Button>
          </form>
          <p className="dashboard-login-hint"><Link className="underline underline-offset-2" to="/login">{t('Account sign-in', '账户登录')}</Link></p>
        </section>
      )}
    </div>
  </main>;
}
