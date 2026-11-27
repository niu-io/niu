import ThemeMenu from '@/shell/ThemeMenu';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { IconCheck, IconChevronDown, IconClock, IconEye, IconEyeOff, IconLanguage } from '@tabler/icons-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import NiuBrand from '@/components/NiuBrand';
import { loadAuthConfig } from '@/lib/auth-config';
import { loadPublicCatalogModels } from '@/features/models/public-catalog';
import { useBranding } from '@/shell/branding';
import { useDashboardContext } from '@/shell/dashboard-context';
import { safeLoginReturn } from '@/shell/login-return';
import { useLocale, useLocale as useUILocale, type Locale } from '@/shell/ui-locale';

const UTF8 = new TextEncoder();

export default function RegisterRoute() {
  const { t: uiT, format: uiF } = useUILocale();
  const { locale, setLocale, t } = useLocale();
  const { settings: branding, logo } = useBranding();
  const context = useDashboardContext();
  const navigate = useNavigate();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const requestedReturn = (location.state as { from?: unknown } | null)?.from;
  const returnTo = safeLoginReturn(requestedReturn)
    ?? safeLoginReturn(searchParams.get('returnTo'))
    ?? '/workspaces/default/';

  const [checking, setChecking] = useState(true);
  const [registrationEnabled, setRegistrationEnabled] = useState(false);
  const [configFailed, setConfigFailed] = useState(false);
  const [configAttempt, setConfigAttempt] = useState(0);
  const [hasPublicModels, setHasPublicModels] = useState(false);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [organizationName, setOrganizationName] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [invalidField, setInvalidField] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [submittedEmail, setSubmittedEmail] = useState('');
  const activeRequest = useRef<AbortController | null>(null);

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
    void loadAuthConfig({ signal: controller.signal, force: configAttempt > 0 })
      .then(config => {
        if (controller.signal.aborted) return;
        const enabled =
          config.password_login === true && config.registration_mode === 'approval_required';
        setRegistrationEnabled(enabled);
        setConfigFailed(false);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setRegistrationEnabled(false);
          setConfigFailed(true);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setChecking(false);
      });
    return () => controller.abort();
  }, [configAttempt]);

  useEffect(() => {
    if (context.token) {
      const destination = new URL(returnTo, window.location.origin);
      const publicPath = destination.pathname;
      if (publicPath === '/' || /^\/(?:docs|blog|compare)(?:\/|$)/.test(publicPath)) {
        window.location.replace(returnTo);
      } else {
        navigate(returnTo, { replace: true });
      }
    }
  }, [context.token, navigate, returnTo]);

  useEffect(() => () => activeRequest.current?.abort(), []);

  function fieldError(id: string) {
    return invalidField === id && errorMessage
      ? <p className="dashboard-login-error" id="register-error" role="alert">{errorMessage}</p>
      : null;
  }

  function clearFieldError(id: string) {
    if (invalidField && invalidField !== id) return;
    setInvalidField('');
    setErrorMessage('');
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || checking || !registrationEnabled) return;
    const trimmedName = name.trim();
    const normalizedEmail = email.trim();
    const trimmedOrg = organizationName.trim();
    const trimmedNote = note.trim();
    const form = event.currentTarget;
    function rejectField(id: string, message: string) {
      setInvalidField(id);
      setErrorMessage(message);
      form.querySelector<HTMLElement>(`#${id}`)?.focus();
    }
    if (!trimmedName || [...trimmedName].length > 120) {
      rejectField('register-name',
        t('Enter your full name (up to 120 characters).', '请输入您的姓名（最多 120 个字符）。'),
      );
      return;
    }
    if (
      !normalizedEmail ||
      UTF8.encode(normalizedEmail).length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)
    ) {
      rejectField('register-email', t('Enter a valid email address.', '请输入有效的邮箱地址。'));
      return;
    }
    if ([...password].length < 8 || UTF8.encode(password).length > 1024) {
      rejectField('register-password',
        t(
          'Choose a password with at least 8 characters and at most 1024 bytes.',
          '密码需至少包含 8 个字符，且不超过 1024 字节。',
        ),
      );
      return;
    }
    if ([...trimmedOrg].length > 120) {
      rejectField('register-organization',
        t(
          'Organization or team name must be 120 characters or fewer.',
          '组织或团队名称最多 120 个字符。',
        ),
      );
      return;
    }
    if ([...trimmedNote].length > 500) {
      rejectField('register-note',
        t('Use case note must be 500 characters or fewer.', '用途说明最多 500 个字符。'),
      );
      return;
    }

    setInvalidField('');
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    setSubmitting(true);
    setErrorMessage('');

    try {
      const payload: Record<string, string> = {
        name: trimmedName,
        email: normalizedEmail,
        password,
      };
      if (trimmedOrg) payload.organization_name = trimmedOrg;
      if (trimmedNote) payload.note = trimmedNote;
      const response = await fetch('/api/v1/auth/registrations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        cache: 'no-store',
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        const kind = body?.error?.type;
        if (response.status === 403 && kind === 'registration_disabled') {
          setRegistrationEnabled(false);
          setErrorMessage(
            t(
              'Limited Preview registration has been closed by an administrator.',
              '管理员已关闭有限预览注册。',
            ),
          );
          return;
        }
        if (response.status === 429) {
          setErrorMessage(
            t(
              'Too many registration requests. Please try again in a few minutes.',
              '注册请求过于频繁，请几分钟后再试。',
            ),
          );
          return;
        }
        if (response.status === 400) {
          setErrorMessage(
            t(
              'Check your name, email, and password (minimum 8 characters) and try again.',
              '请检查您的姓名、邮箱和密码（至少 8 个字符）后重试。',
            ),
          );
          return;
        }
        setErrorMessage(
          t('Could not submit registration request. Please try again.', '提交注册申请失败，请重试。'),
        );
        return;
      }
      setPassword('');
      setSubmittedEmail(normalizedEmail.toLowerCase());
    } catch {
      if (!controller.signal.aborted) {
        setErrorMessage(
          t('Could not reach the registration service. Try again.', '无法连接注册服务，请重试。'),
        );
      }
    } finally {
      if (activeRequest.current === controller && !controller.signal.aborted) {
        setSubmitting(false);
      }
    }
  }

  const loginParams = new URLSearchParams();
  if (submittedEmail) loginParams.set('email', submittedEmail);
  if (returnTo !== '/workspaces/default/') loginParams.set('returnTo', returnTo);
  const loginHref = `/login${loginParams.size ? `?${loginParams.toString()}` : ''}`;

  return (
    <main className="dashboard-login">
      <header className="dashboard-login-topbar">
        <Link className="dashboard-login-brand" to="/" aria-label={uiF('{0} home', [branding.display_name])}>
          {branding.display_name === 'Niu' && !branding.logo_data_url ? (
            <NiuBrand locale={locale} />
          ) : (
            <>
              <img src={logo} alt="" />
              <span>{branding.display_name === 'Niu' ? t('Niu', 'Niu') : branding.display_name}</span>
            </>
          )}
        </Link>
        <nav aria-label={uiT('Public resources')} className="dashboard-login-nav">
          {hasPublicModels && (
            <Button asChild variant="ghost" size="sm">
              <Link to="/models">{t('Models', '模型')}</Link>
            </Button>
          )}
          <Button asChild variant="ghost" size="sm">
            <a href="/docs/">{t('Docs', '文档')}</a>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" size="sm" aria-label={uiT('Language')}>
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
          <TooltipProvider><ThemeMenu context={context} side="bottom" /></TooltipProvider>
      </nav>
      </header>
      <div className="dashboard-login-stage">
        <section className="dashboard-login-card sm:w-[400px]" aria-label={uiT('Request Limited Preview access', '申请有限预览权限')}>
          <div className="dashboard-login-header space-y-2">
            <Badge variant="secondary">{t('Limited Preview', '有限预览')}</Badge>
            <h1>{t('Request an account', '申请注册账号')}</h1>
            <p className="dashboard-login-intro">
              {t(
                'An administrator reviews each Limited Preview request before activating workspace access.',
                '有限预览期间，所有注册申请均需经管理员审批后方可启用工作空间权限。',
              )}
            </p>
          </div>

          {checking ? (
            <p className="dashboard-login-status" role="status">
              {t('Checking registration availability…', '正在检查注册状态…')}
            </p>
          ) : configFailed ? (
            <div className="dashboard-login-unavailable">
              <p className="dashboard-login-error" role="alert">
                {t('Registration availability could not be verified.', '暂时无法获取注册状态。')}
              </p>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setChecking(true);
                  setConfigFailed(false);
                  setConfigAttempt(value => value + 1);
                }}
              >
                {t('Try again', '重试')}
              </Button>
            </div>
          ) : submittedEmail ? (
            <div className="space-y-4">
              <div className="dashboard-login-status space-y-2" role="status">
                <p className="flex items-center gap-2 font-medium text-foreground">
                  <IconClock size={16} aria-hidden="true" />
                  <span>{t('Request submitted for review', '注册申请已提交，等待审批')}</span>
                </p>
                <p className="break-all font-medium text-foreground">{submittedEmail}</p>
                <p>
                  {t(
                    'Once an administrator approves your request, sign in directly with this email address and the password you just set.',
                    '管理员审批通过后，您可以直接使用此邮箱和刚才设置的密码登录，无需等待确认邮件。',
                  )}
                </p>
              </div>
              <Button asChild className="dashboard-login-submit w-full">
                <Link to={loginHref}>
                  <IconCheck size={16} aria-hidden="true" />
                  <span>{t('Go to sign in', '前往登录')}</span>
                </Link>
              </Button>
            </div>
          ) : !registrationEnabled ? (
            <div className="space-y-4">
              <p className="dashboard-login-status" role="status">
                {t(
                  'Self-service registration is currently closed on this deployment. Ask your organization owner for an invitation link or contact an administrator.',
                  '当前部署已关闭自助注册。请向组织所有者索取邀请链接，或联系管理员开通账号。',
                )}
              </p>
              <Button asChild variant="outline" className="w-full">
                <Link to={loginHref}>{t('Back to sign in', '返回登录')}</Link>
              </Button>
            </div>
          ) : (
            <form className="dashboard-login-form" onSubmit={submit} noValidate>
              <div className="dashboard-login-field">
                <Label htmlFor="register-name">{t('Full name', '姓名')}</Label>
                <Input
                  id="register-name"
                  aria-invalid={invalidField === 'register-name' || undefined}
                  aria-describedby={invalidField === 'register-name' ? 'register-error' : undefined}
                  type="text"
                  autoComplete="name"
                  autoFocus
                  maxLength={120}
                  required
                  disabled={submitting}
                  placeholder={t('Ada Lovelace', '张三')}
                  value={name}
                  onChange={event => {
                    setName(event.target.value);
                    clearFieldError(event.currentTarget.id);
                  }}
                />
                {fieldError('register-name')}
              </div>

              <div className="dashboard-login-field">
                <Label htmlFor="register-email">{t('Work email', '工作邮箱')}</Label>
                <Input
                  id="register-email"
                  aria-invalid={invalidField === 'register-email' || undefined}
                  aria-describedby={invalidField === 'register-email' ? 'register-error' : undefined}
                  type="email"
                  autoComplete="email"
                  maxLength={254}
                  required
                  disabled={submitting}
                  placeholder="name@company.com"
                  value={email}
                  onChange={event => {
                    setEmail(event.target.value);
                    clearFieldError(event.currentTarget.id);
                  }}
                />
                {fieldError('register-email')}
              </div>

              <div className="dashboard-login-field">
                <Label htmlFor="register-organization">{t('Organization or team', '组织或团队名称')}</Label>
                <Input
                  id="register-organization"
                  aria-invalid={invalidField === 'register-organization' || undefined}
                  aria-describedby={invalidField === 'register-organization' ? 'register-error' : undefined}
                  type="text"
                  autoComplete="organization"
                  maxLength={120}
                  disabled={submitting}
                  placeholder={t('Optional · defaults to your name', '选填 · 留空则默认使用您的姓名')}
                  value={organizationName}
                  onChange={event => {
                    setOrganizationName(event.target.value);
                    clearFieldError(event.currentTarget.id);
                  }}
                />
                {fieldError('register-organization')}
              </div>

              <div className="dashboard-login-field">
                <Label htmlFor="register-password">{t('Password', '登录密码')}</Label>
                <div className="relative">
                  <Input
                    id="register-password"
                    aria-invalid={invalidField === 'register-password' || undefined}
                    aria-describedby={invalidField === 'register-password' ? 'register-error' : undefined}
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    required
                    maxLength={1024}
                    disabled={submitting}
                    className="pr-10"
                    value={password}
                    onChange={event => {
                      setPassword(event.target.value);
                      clearFieldError(event.currentTarget.id);
                    }}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label={showPassword ? t('Hide password', '隐藏密码') : t('Show password', '显示密码')}
                    onClick={() => setShowPassword(value => !value)}
                  >
                    {showPassword ? <IconEyeOff size={16} aria-hidden="true" /> : <IconEye size={16} aria-hidden="true" />}
                  </Button>
                </div>
                {invalidField !== 'register-password' && <p className="dashboard-login-hint">
                  {t(
                    'At least 8 characters. You will use this exact password to sign in once approved.',
                    '至少 8 个字符。审批通过后将直接使用此密码登录。',
                  )}
                </p>}
                {fieldError('register-password')}
              </div>

              <div className="dashboard-login-field">
                <Label htmlFor="register-note">{t('Intended use (optional)', '用途说明（选填）')}</Label>
                <Textarea
                  id="register-note"
                  aria-invalid={invalidField === 'register-note' || undefined}
                  aria-describedby={invalidField === 'register-note' ? 'register-error' : undefined}
                  rows={3}
                  maxLength={500}
                  disabled={submitting}
                  className="min-h-[76px] resize-y rounded-[10px] bg-card px-3 py-2 text-sm shadow-none"
                  placeholder={t(
                    'Briefly describe your coding agent or team workload…',
                    '简要说明您的 Coding Agent 或团队使用场景…',
                  )}
                  value={note}
                  onChange={event => {
                    setNote(event.target.value);
                    clearFieldError(event.currentTarget.id);
                  }}
                />
                {fieldError('register-note')}
              </div>

              {!invalidField && errorMessage && (
                <p className="dashboard-login-error" id="register-error" role="alert">
                  {errorMessage}
                </p>
              )}

              <Button type="submit" className="dashboard-login-submit" disabled={submitting}>
                {submitting ? t('Submitting request…', '正在提交申请…') : t('Submit registration request', '提交注册申请')}
              </Button>
            </form>
          )}

          <p className="dashboard-login-hint dashboard-login-access-help">
            {t('Already have an approved account?', '已有已批准的账号？')}{' '}
            <Link className="underline underline-offset-2" to={loginHref}>
              {t('Sign in', '立即登录')}
            </Link>
          </p>
        </section>
      </div>
    </main>
  );
}
