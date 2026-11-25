import { BankConfiguration } from "../billing/BankDetails";
import { useLocale as useUILocale } from '@/shell/ui-locale';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { MetricStripSkeleton } from '@/components/PageSkeletons';
import { fetchQuery, invalidateQueries, peekQuery } from '@/lib/query-cache';
import { TriangleAlert, FlaskConical, CheckCircle2, CircleDashed, PauseCircle, Settings2 } from 'lucide-react';
import { IconBrandStripe, IconBrandAlipay, IconBrandWechat, IconExternalLink } from '@tabler/icons-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { NavLink } from 'react-router';
import PageHeader from '@/components/PageHeader';
import { useDashboardContext } from '@/shell/dashboard-context';
import { request } from '@/features/providers/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import zhifuxLogo from '@/assets/payment-gateways/zhifux.png';

type Settings = {
  revision: string;
  enabled: boolean;
  merchant_id: string;
  has_key: boolean;
  endpoint: string;
  notify_url: string;
  return_url: string;
  methods: string[];
};
type GatewayVerification = {
  gateway: string;
  checkout_enabled: boolean;
  currency_supported: boolean;
  account_verified: boolean | null;
  callback_verified: boolean;
  ready: boolean;
};
type Configuration = {
  payment_gateways: { name: string; configured: boolean }[];
  verification?: { currency_configured: boolean; gateways: GatewayVerification[] };
};
type StripeCheckFeedback =
  | { kind: 'account_enabled' }
  | { kind: 'account_disabled' }
  | { kind: 'credentials_rejected' }
  | { kind: 'check_unavailable'; detail?: string };

const STRIPE_DASHBOARD_HOME_URL = 'https://dashboard.stripe.com/dashboard';
const STRIPE_ACCOUNT_SETTINGS_URL = 'https://dashboard.stripe.com/settings/account';
const STRIPE_API_KEYS_URL = 'https://dashboard.stripe.com/apikeys';
const STRIPE_WEBHOOKS_URL = 'https://dashboard.stripe.com/webhooks';
const STRIPE_STATUS_URL = 'https://status.stripe.com/';
const PAYMENT_DOCS_URL = `${import.meta.env.BASE_URL}docs/admin/payments/`;

function ExternalActionLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 font-medium text-foreground underline underline-offset-4 hover:text-primary"
    >
      <IconExternalLink size={13} aria-hidden="true" className="shrink-0" />
      <span>{label}</span>
    </a>
  );
}

export default function PlatformConfiguration() {
  const { token } = useDashboardContext();
  return <PaymentConfiguration key={token} token={token} />;
}

function PaymentConfiguration({ token }: { token: string }) {
  const { t: uiT, format: uiF } = useUILocale();
  const scope = token || 'public';
  const mutation = useRef<AbortController | null>(null);
  useEffect(() => () => mutation.current?.abort(), []);
  const initialConfig = peekQuery<{ data: Configuration }>(scope, '/api/v1/admin/configuration')?.data ?? null;
  const initialPayment = peekQuery<{ data: Settings }>(scope, '/api/v1/admin/payments/epay')?.data ?? null;
  const initialMock = peekQuery<{ data: { available: boolean; enabled: boolean; readiness?: string } }>(scope, '/api/v1/admin/payments/mock')?.data ?? null;
  const [mock, setMock] = useState<{ available: boolean; enabled: boolean; readiness?: string } | null>(() => initialMock);
  const [mockOpen, setMockOpen] = useState(false);
  const [mockEnabled, setMockEnabled] = useState(false);
  const [mockBusy, setMockBusy] = useState(false);
  const [mockError, setMockError] = useState('');
  const [configuration, setConfiguration] = useState<Configuration | null>(() => initialConfig);
  const [settings, setSettings] = useState<Settings | null>(() => initialPayment);
  const [savedSettings, setSavedSettings] = useState<Settings | null>(() => initialPayment);
  const [key, setKey] = useState('');
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(() => !initialConfig || !initialPayment);
  const stripeCheck = useRef<AbortController | null>(null);
  const [stripeBusy, setStripeBusy] = useState(false);
  const [stripeFeedback, setStripeFeedback] = useState<StripeCheckFeedback | null>(null);
  const verificationRequest = useRef<AbortController | null>(null);
  const [verificationBusy, setVerificationBusy] = useState(false);
  const [verificationError, setVerificationError] = useState('');

  useEffect(() => () => verificationRequest.current?.abort(), []);

  async function refreshVerification() {
    if (verificationRequest.current) return;
    const controller = new AbortController();
    verificationRequest.current = controller;
    setVerificationBusy(true);
    setVerificationError('');
    try {
      const result = await request<{ data: Configuration }>(token, '/api/v1/admin/configuration', 'GET', undefined, controller.signal);
      if (!controller.signal.aborted) setConfiguration(result.data);
    } catch {
      if (!controller.signal.aborted) {
        setVerificationError('Verification status could not be refreshed. The last known status is still shown. Try again.');
      }
    } finally {
      if (verificationRequest.current === controller) {
        verificationRequest.current = null;
        if (!controller.signal.aborted) setVerificationBusy(false);
      }
    }
  }

  useEffect(() => {
    if (!configuration || open || mockOpen || stripeBusy) return;
    const refresh = () => void refreshVerification();
    const timer = window.setInterval(refresh, 30000);
    window.addEventListener('focus', refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', refresh);
    };
  }, [Boolean(configuration), open, mockOpen, stripeBusy, token]);

  useEffect(() => () => stripeCheck.current?.abort(), []);

  useEffect(() => {
    const controller = new AbortController();
    setError('');
    setKey('');
    const cachedCfg = peekQuery<{ data: Configuration }>(scope, '/api/v1/admin/configuration')?.data;
    const cachedPay = peekQuery<{ data: Settings }>(scope, '/api/v1/admin/payments/epay')?.data;
    const cachedMock = peekQuery<{ data: { available: boolean; enabled: boolean; readiness?: string } }>(scope, '/api/v1/admin/payments/mock')?.data;
    if (cachedCfg && cachedPay) {
      setConfiguration(cachedCfg);
      setSettings(cachedPay);
      setSavedSettings(cachedPay);
      setLoading(false);
    } else if (!configuration) {
      setLoading(true);
    }
    if (cachedMock) setMock(cachedMock);
    const force = revision > 0;
    void Promise.all([
      fetchQuery(scope, '/api/v1/admin/configuration', signal => request<{ data: Configuration }>(token, '/api/v1/admin/configuration', 'GET', undefined, signal), { signal: controller.signal, force, awaitRevalidate: true }),
      fetchQuery(scope, '/api/v1/admin/payments/epay', signal => request<{ data: Settings }>(token, '/api/v1/admin/payments/epay', 'GET', undefined, signal), { signal: controller.signal, force, awaitRevalidate: true }),
    ])
      .then(([status, payment]) => {
        if (!controller.signal.aborted) {
          setConfiguration(status.data);
          setSettings(payment.data);
          setSavedSettings(payment.data);
          setKey('');
        }
      })
      .catch(reason => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Payment gateways could not be loaded.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    void fetchQuery(scope, '/api/v1/admin/payments/mock', signal => request<{ data: { available: boolean; enabled: boolean; readiness?: string } }>(token, '/api/v1/admin/payments/mock', 'GET', undefined, signal), { signal: controller.signal, force, awaitRevalidate: true })
      .then(result => {
        if (!controller.signal.aborted) setMock(result.data);
      })
      .catch(() => {
        if (!controller.signal.aborted) setMockError('Mock gateway status could not be loaded.');
      });
    return () => controller.abort();
  }, [scope, token, revision]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!settings || busy) return;
    const controller = new AbortController();
    mutation.current = controller;
    setBusy(true);
    setError('');
    const { revision: expected_revision, has_key: _hasKey, ...input } = settings;
    try {
      const result = await request<{ data: Settings }>(token, '/api/v1/admin/payments/epay', 'PUT', { ...input, key, expected_revision }, controller.signal);
      if (controller.signal.aborted) return;
      invalidateQueries('/api/v1/admin/');
      setSettings(result.data);
      setSavedSettings(result.data);
      setKey('');
      setOpen(false);
      setRevision(value => value + 1);
    } catch (reason) {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Payment configuration could not be saved.');
    } finally {
      if (mutation.current === controller) {
        mutation.current = null;
        if (!controller.signal.aborted) setBusy(false);
      }
    }
  }

  async function saveMock() {
    setMockBusy(true);
    setMockError('');
    const controller = new AbortController();
    mutation.current = controller;
    try {
      const result = await request<{ data: { available: boolean; enabled: boolean; readiness?: string } }>(token, '/api/v1/admin/payments/mock', 'PUT', { enabled: mockEnabled }, controller.signal);
      if (controller.signal.aborted) return;
      invalidateQueries('/api/v1/admin/');
      setMock(result.data);
      setMockOpen(false);
      setRevision(value => value + 1);
      window.dispatchEvent(new Event('niu:payment-mode'));
    } catch (reason) {
      if (!controller.signal.aborted) setMockError(reason instanceof Error ? reason.message : 'Mock gateway could not be saved.');
    } finally {
      if (!controller.signal.aborted) setMockBusy(false);
    }
  }

  async function checkStripeAccount() {
    if (stripeCheck.current) return;
    const controller = new AbortController();
    stripeCheck.current = controller;
    setStripeBusy(true);
    setStripeFeedback(null);
    try {
      const response = await request<{ data: { result: 'account_enabled' | 'account_disabled' | 'credentials_rejected' | 'check_unavailable' } }>(
        token,
        '/api/v1/admin/payments/stripe/verification',
        'POST',
        undefined,
        controller.signal,
      );
      if (controller.signal.aborted) return;
      setStripeFeedback({ kind: response.data.result });
      await refreshVerification();
      if (!controller.signal.aborted) window.dispatchEvent(new Event('niu:payment-mode'));
    } catch (reason) {
      if (!controller.signal.aborted) {
        setStripeFeedback({
          kind: 'check_unavailable',
          detail: reason instanceof Error ? reason.message : undefined,
        });
        await refreshVerification();
      }
    } finally {
      if (stripeCheck.current === controller) {
        stripeCheck.current = null;
        if (!controller.signal.aborted) setStripeBusy(false);
      }
    }
  }

  function renderStripeFeedback(proof: GatewayVerification | undefined) {
    if (!stripeFeedback) return null;

    if (stripeFeedback.kind === 'account_enabled') {
      return (
        <div role="status" className="space-y-2 rounded-lg bg-muted/55 p-3 text-foreground">
          <p>{uiT('Stripe reports that this account can accept charges. This check does not test checkout or payment notifications.')}</p>
          {!proof?.callback_verified && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
              <ExternalActionLink href={STRIPE_WEBHOOKS_URL} label={uiT('Open Stripe webhooks', '前往 Stripe Webhook 设置')} />
              <ExternalActionLink href={PAYMENT_DOCS_URL} label={uiT('Payment setup guide', '查看收款配置文档')} />
            </div>
          )}
        </div>
      );
    }

    if (stripeFeedback.kind === 'account_disabled') {
      return (
        <Alert variant="destructive">
          <AlertDescription className="space-y-2.5">
            <p>{uiT('Stripe has not enabled charges for this account. Complete the account requirements in Stripe, then check again.')}</p>
            <div className="flex flex-wrap items-center gap-2">
              <Button asChild variant="outline" size="sm">
                <a href={STRIPE_ACCOUNT_SETTINGS_URL} target="_blank" rel="noopener noreferrer">
                  <IconExternalLink size={14} aria-hidden="true" />
                  <span>{uiT('Complete setup in Stripe', '前往 Stripe 完成账户激活')}</span>
                </a>
              </Button>
              <Button asChild variant="ghost" size="sm">
                <a href={STRIPE_API_KEYS_URL} target="_blank" rel="noopener noreferrer">
                  <IconExternalLink size={14} aria-hidden="true" />
                  <span>{uiT('Manage Stripe API keys', '管理 Stripe API 密钥')}</span>
                </a>
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      );
    }

    if (stripeFeedback.kind === 'credentials_rejected') {
      return (
        <Alert variant="destructive">
          <AlertDescription className="space-y-2.5">
            <p>{uiT('Stripe rejected the configured credentials. Check your API keys in Stripe and ask your server administrator to update them, then check again.')}</p>
            <div className="flex flex-wrap items-center gap-2">
              <Button asChild variant="outline" size="sm">
                <a href={STRIPE_API_KEYS_URL} target="_blank" rel="noopener noreferrer">
                  <IconExternalLink size={14} aria-hidden="true" />
                  <span>{uiT('Open Stripe API keys', '前往 Stripe API 密钥')}</span>
                </a>
              </Button>
              <Button asChild variant="ghost" size="sm">
                <a href={PAYMENT_DOCS_URL} target="_blank" rel="noopener noreferrer">
                  <IconExternalLink size={14} aria-hidden="true" />
                  <span>{uiT('Payment setup guide', '查看收款配置文档')}</span>
                </a>
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      );
    }

    return (
      <Alert variant="destructive">
        <AlertDescription className="space-y-2.5">
          <p>
            {stripeFeedback.detail
              ? uiT(stripeFeedback.detail)
              : uiT('The account could not be checked. Ask your server administrator to check the Stripe credentials and connection, then retry.')}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <a href={STRIPE_STATUS_URL} target="_blank" rel="noopener noreferrer">
                <IconExternalLink size={14} aria-hidden="true" />
                  <span>{uiT('Check Stripe status', '查看 Stripe 服务状态')}</span>
              </a>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <a href={STRIPE_API_KEYS_URL} target="_blank" rel="noopener noreferrer">
                <IconExternalLink size={14} aria-hidden="true" />
                  <span>{uiT('Open Stripe API keys', '前往 Stripe API 密钥')}</span>
              </a>
            </Button>
          </div>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <section className="@container space-y-6">
      <PageHeader title={uiT("Payments", "收款配置")} />

      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <h2 className="text-base font-semibold">{uiT("Payment gateways", "支付网关")}</h2>
            <p className="text-sm text-muted-foreground">{uiT("Verify payment setup before offering a gateway to customers.")}</p>
          </div>
          {configuration && (
            <Button variant="outline" size="sm" disabled={verificationBusy} onClick={() => void refreshVerification()}>
              {verificationBusy ? uiT("Refreshing status…") : uiT("Refresh verification")}
            </Button>
          )}
        </div>
        {verificationError && <p role="alert" className="text-sm text-destructive">{uiT(verificationError)}</p>}

          {mockError && !mockOpen && (
            <p role="alert">
              {uiT(mockError)}
              <Button variant="ghost" onClick={() => { setMockError(''); setRevision(value => value + 1); }}>{uiT("Retry mock gateway")}</Button>
            </p>
          )}
          {error && !open && (
            <p role="alert">
              {uiT(error)}
              <Button variant="ghost" onClick={() => setRevision(value => value + 1)}>{uiT("Retry")}</Button>
            </p>
          )}
          {loading && !configuration ? (
            <MetricStripSkeleton count={2} label={uiT("Loading payment gateways…")} />
          ) : configuration ? (
            <div className="grid grid-cols-1 gap-4 @min-[42rem]:grid-cols-2" aria-label={uiT("Supported payment gateways")}>
              {configuration.payment_gateways.map(gateway => {
                const epay = gateway.name === 'EPay';
                const isStripe = gateway.name === 'Stripe';
                const configured = gateway.configured && !(isStripe && mock?.available);
                const enabled = configured && epay && savedSettings?.enabled === true;
                const proof = configuration.verification?.gateways.find(item => item.gateway === gateway.name.toLowerCase());
                const isVerified = configured && (!epay || enabled) && Boolean(proof?.ready);
                const status = !configured
                  ? uiT("Not configured")
                  : epay && !enabled
                    ? uiT("Disabled")
                    : isVerified
                      ? uiT("Verified")
                      : proof
                        ? uiT("Needs attention")
                        : uiT("Configured");
                const StatusIcon = !configured ? CircleDashed : isVerified ? CheckCircle2 : PauseCircle;
                return (
                  <Card key={gateway.name} className="gap-5 shadow-none" role="article" aria-label={gateway.name === 'Zhifux' ? uiT("ZhifuX") : gateway.name}>
                    <CardHeader>
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <div className={`flex h-12 items-center gap-2 rounded-xl px-3 ${gateway.name === 'Zhifux' ? 'bg-[#4f26c3]' : 'bg-muted'}`} aria-hidden="true">
                          {epay ? (
                            <>
                              <IconBrandAlipay className="size-7 text-[#1677ff]" />
                              <IconBrandWechat className="size-7 text-[#07a940]" />
                            </>
                          ) : isStripe ? (
                            <IconBrandStripe className="size-8 text-[#635bff]" />
                          ) : (
                            <img src={zhifuxLogo} alt="" width={89} height={24} className="h-6 w-auto" />
                          )}
                        </div>
                        <Badge variant="secondary" className={`gap-1.5 font-normal ${isVerified ? 'text-[var(--success)]' : ''}`}>
                          <StatusIcon className="size-3.5" />
                          {status}
                        </Badge>
                      </div>
                      <CardTitle className="text-base leading-6">{gateway.name === 'Zhifux' ? uiT("ZhifuX") : gateway.name}</CardTitle>
                      <CardDescription>
                        {epay
                          ? uiT("Alipay and WeChat Pay through an EPay-compatible merchant.")
                          : isStripe
                            ? uiT("Hosted checkout with your Stripe merchant account.")
                            : uiT("Account top-ups through the ZhifuX native API.")}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="flex-1 space-y-3 text-sm text-muted-foreground">
                      {(!configured || !proof || (epay && !enabled)) && (
                        <p>
                          {epay
                            ? configured
                              ? enabled
                                ? uiT("Enabled for checkout. Verify a payment before offering it to customers.")
                                : uiT("Enable EPay to accept payments.")
                              : uiT("Add your merchant details and choose payment methods to get started.")
                            : configured
                              ? uiT("Managed by your deployment. Verify checkout and payment notifications before use.")
                              : uiT("Merchant credentials must be configured in your deployment before checkout is available.")}
                        </p>
                      )}
                      {configured && (proof ? (
                        <>
                          <dl className="space-y-2" aria-label={uiF("{0} verification", [gateway.name])}>
                                {isStripe && (
                                  <div className="flex flex-wrap justify-between gap-x-4 gap-y-1">
                                    <dt>{uiT("Stripe account")}</dt>
                                    <dd className="font-medium text-foreground">
                                      {proof.account_verified === true ? uiT("Verified") : uiT("Check required")}
                                    </dd>
                                  </div>
                                )}
                                <div className="flex flex-wrap justify-between gap-x-4 gap-y-1">
                                  <dt>{uiT("Payment notifications")}</dt>
                                  <dd className="font-medium text-foreground">
                                    {proof.callback_verified ? uiT("Verified") : uiT("Not verified")}
                                  </dd>
                                </div>
                              </dl>
                              {!configuration.verification?.currency_configured ? (
                                <p>
                                  {uiT("Set the platform currency in")}{" "}
                                  <NavLink className="font-medium text-foreground underline underline-offset-4" to="/admin/settings">
                                    {uiT("Admin Settings")}
                                  </NavLink>.
                                </p>
                              ) : !proof.currency_supported ? (
                                <div className="space-y-1.5">
                                  <p>{uiT("The checkout currency does not match the platform currency. Update this gateway’s checkout configuration.")}</p>
                                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                                    <NavLink className="font-medium text-foreground underline underline-offset-4" to="/admin/settings">
                                      {uiT("Admin Settings")}
                                    </NavLink>
                                    <ExternalActionLink href={PAYMENT_DOCS_URL} label={uiT("Payment setup guide", "查看收款配置文档")} />
                                  </div>
                                </div>
                              ) : !proof.checkout_enabled ? (
                                <div className="space-y-1.5">
                                  <p>{uiT("Complete checkout configuration and enable a payment method.")}</p>
                                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                                    {isStripe && (
                                      <ExternalActionLink href={STRIPE_ACCOUNT_SETTINGS_URL} label={uiT("Open Stripe account settings", "前往 Stripe 账户设置")} />
                                    )}
                                    <ExternalActionLink href={PAYMENT_DOCS_URL} label={uiT("Payment setup guide", "查看收款配置文档")} />
                                  </div>
                                </div>
                              ) : !proof.callback_verified ? (
                                <div className="space-y-1.5">
                                  <p>{uiT("Payment notifications are not verified yet. Confirm this gateway can reach Niu's callback URL, then complete a test top-up and refresh this status. Payment notifications must settle before checkout is offered to customers.")}</p>
                                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                                    {isStripe && (
                                      <ExternalActionLink href={STRIPE_WEBHOOKS_URL} label={uiT("Open Stripe webhooks", "前往 Stripe Webhook 设置")} />
                                    )}
                                    <ExternalActionLink href={PAYMENT_DOCS_URL} label={uiT("Payment setup guide", "查看收款配置文档")} />
                                  </div>
                                </div>
                              ) : (
                                <p>{uiT("Payment delivery is verified for the current configuration.")}</p>
                              )}
                        </>
                      ) : (
                        <p>{uiT("Verification status is unavailable. Refresh verification before relying on this gateway.")}</p>
                      ))}
                      {isStripe && configured && (
                        <>
                          {!proof?.account_verified && (
                            <p>{uiT("Check whether Stripe allows this account to accept charges. No payment is created.")}</p>
                          )}
                          {renderStripeFeedback(proof)}
                        </>
                      )}
                    </CardContent>
                    <CardFooter className="flex flex-wrap items-center gap-2">
                      {epay ? (
                        <Button variant="outline" size="sm" disabled={!savedSettings} onClick={() => { setSettings(savedSettings); setKey(''); setError(''); setOpen(true); }}>
                          <Settings2 aria-hidden="true" />
                          {uiT("Configure")}
                        </Button>
                      ) : isStripe && configured ? (
                        <>
                          <Button variant="outline" size="sm" disabled={stripeBusy} onClick={() => void checkStripeAccount()}>
                            {stripeBusy ? uiT("Checking account…") : uiT("Check Stripe account")}
                          </Button>
                          <Button asChild variant="ghost" size="sm">
                            <a href={STRIPE_DASHBOARD_HOME_URL} target="_blank" rel="noopener noreferrer">
                              <IconExternalLink size={14} aria-hidden="true" />
                  <span>{uiT("Open Stripe Dashboard", "打开 Stripe 后台")}</span>
                            </a>
                          </Button>
                        </>
                      ) : (
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          <span>{uiT("Configured by your server administrator")}</span>
                          {isStripe && (
                            <ExternalActionLink href={STRIPE_API_KEYS_URL} label={uiT("Open Stripe API keys", "前往 Stripe API 密钥")} />
                          )}
                          <ExternalActionLink href={PAYMENT_DOCS_URL} label={uiT("Payment setup guide", "查看收款配置文档")} />
                        </div>
                      )}
                    </CardFooter>
                  </Card>
                );
              })}
              {mock?.available && (
                <Card className="gap-5 shadow-none" role="article" aria-label={uiT("Mock payments")}>
                  <CardHeader>
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div className="flex size-12 items-center justify-center rounded-xl bg-muted text-primary">
                        <FlaskConical className="size-7" aria-hidden="true" />
                      </div>
                      <Badge variant="secondary" className={`gap-1.5 font-normal ${mock.enabled ? 'text-[var(--warning)]' : ''}`}>
                        {mock.enabled ? <CheckCircle2 className="size-3.5" /> : <PauseCircle className="size-3.5" />}
                        {mock.enabled ? uiT("Enabled") : uiT("Disabled")}
                      </Badge>
                    </div>
                    <CardTitle className="text-base leading-6">{uiT("Mock payments")}</CardTitle>
                    <CardDescription>{uiT("Simulated top-ups, checkout and payment notifications.")}</CardDescription>
                  </CardHeader>
                  <CardContent className="flex-1 space-y-3 text-sm text-muted-foreground">
                    <p>{uiT("Test payment outcomes without a real merchant or moving money.")}</p>
                    <div className="mock-payment-warning rounded-lg border p-3">
                      <p className="flex items-center gap-2 font-medium">
                        <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
                        {uiT("Real model costs still apply")}
                      </p>
                      <p className="mt-1 text-xs leading-5">{uiT("LLM calls incur upstream charges. Simulated funds do not pay for upstream usage.")}</p>
                    </div>
                  </CardContent>
                  <CardFooter>
                    <Button variant="outline" size="sm" aria-label={uiT("Configure mock payments")} onClick={() => { setMockEnabled(mock.enabled); setMockError(''); setMockOpen(true); }}>
                      <Settings2 aria-hidden="true" />
                      {uiT("Configure")}
                    </Button>
                  </CardFooter>
                </Card>
              )}
            </div>
          ) : null}
      </div>

      <div id="bank-transfer" className="rounded-[var(--radius-panel)] bg-card p-5">
        <BankConfiguration token={token} />
      </div>

      <Dialog open={mockOpen} onOpenChange={value => { if (!mockBusy) setMockOpen(value); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{uiT("Configure mock payments")}</DialogTitle>
            <DialogDescription>{uiT("Test checkout, notifications and account funding without a real payment merchant. Saved changes apply immediately and persist across restarts.")}</DialogDescription>
          </DialogHeader>
          <Alert className="mock-payment-warning">
            <TriangleAlert aria-hidden="true" />
            <AlertTitle className="line-clamp-none">{uiT("LLM calls still cost real money")}</AlertTitle>
            <AlertDescription>{uiT("Only payments are simulated. LLM requests still incur upstream Provider charges. Simulated funds do not pay for upstream usage.")}</AlertDescription>
          </Alert>
          <div className="flex items-center gap-2">
            <Checkbox id="mock-enabled" checked={mockEnabled} disabled={mockBusy} onCheckedChange={value => setMockEnabled(value === true)} />
            <Label htmlFor="mock-enabled">{uiT("Enable mock payments")}</Label>
          </div>
          <p className="text-sm text-muted-foreground">{uiT("Disable other payment gateways before enabling. Turning this off stops new mock checkouts; notifications for existing test orders continue.")}</p>
          {mockError && <p role="alert" className="text-destructive">{uiT(mockError)}</p>}
          <DialogFooter>
            <Button variant="outline" disabled={mockBusy} onClick={() => setMockOpen(false)}>{uiT("Cancel")}</Button>
            <Button disabled={mockBusy} onClick={() => void saveMock()}>{mockBusy ? uiT("Saving…") : uiT("Save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={open} onOpenChange={value => { if (!busy) { setOpen(value); setKey(''); } }}>
        <DialogContent className="niu-modal">
          <DialogHeader>
            <DialogTitle>{uiT("Configure EPay")}</DialogTitle>
            <DialogDescription>{uiT("Connect your domestic payment gateway to organization balance top-ups.")}</DialogDescription>
          </DialogHeader>
          {settings && (
            <form className="space-y-4" onSubmit={event => void save(event)}>
              <div className="flex items-center gap-2">
                <Checkbox id="epay-enabled" checked={settings.enabled} disabled={busy} onCheckedChange={value => setSettings({ ...settings, enabled: value === true })} />
                <Label htmlFor="epay-enabled">{uiT("Enable EPay")}</Label>
              </div>
              {([['merchant_id', 'Merchant ID'], ['endpoint', 'Gateway URL'], ['notify_url', 'Notification URL'], ['return_url', 'Return URL']] as const).map(([field, label]) => (
                <div className="space-y-2" key={field}>
                  <Label htmlFor={`epay-${field}`}>{uiT(label)}</Label>
                  <Input id={`epay-${field}`} type={field === 'merchant_id' ? 'text' : 'url'} maxLength={2048} required={settings.enabled} disabled={busy} value={settings[field]} onChange={event => setSettings({ ...settings, [field]: event.target.value })} />
                  {field === 'notify_url' && <p className="text-sm text-muted-foreground">{uiT("Use the public HTTPS URL that reaches this installation's /payments/epay/notify handler, including any deployment API base. Signed notifications must arrive before funds are recognized; a browser return alone never grants balance.")}</p>}
                  {field === 'return_url' && <p className="text-sm text-muted-foreground">{uiT("Public HTTPS page where the browser returns after checkout. A return does not grant balance; settlement is confirmed by the notification.")}</p>}
                </div>
              ))}
              <div className="space-y-2">
                <Label htmlFor="epay-key">{uiT("Merchant key")}</Label>
                <Input id="epay-key" type="password" autoComplete="new-password" maxLength={512} required={settings.enabled && !settings.has_key} disabled={busy} value={key} placeholder={settings.has_key ? uiT("Leave blank to keep the saved key") : ''} onChange={event => setKey(event.target.value)} />
              </div>
              <fieldset className="space-y-3">
                <legend className="mb-2 text-sm font-medium">{uiT("Enabled payment methods")}</legend>
                {[['alipay', 'Alipay'], ['wxpay', 'WeChat Pay']].map(([method, label]) => (
                  <div className="flex items-center gap-2" key={method}>
                    <Checkbox id={`epay-${method}`} checked={settings.methods.includes(method)} disabled={busy} onCheckedChange={checked => setSettings({ ...settings, methods: checked === true ? [...settings.methods, method] : settings.methods.filter(value => value !== method) })} />
                    <Label htmlFor={`epay-${method}`}>{uiT(label)}</Label>
                  </div>
                ))}
              </fieldset>
              {error && <p role="alert" className="text-destructive">{uiT(error)}</p>}
              <DialogFooter>
                <Button type="button" variant="outline" disabled={busy} onClick={() => { setOpen(false); setRevision(value => value + 1); }}>{uiT("Cancel")}</Button>
                <Button disabled={busy}>{busy ? uiT("Saving…") : uiT("Save")}</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
