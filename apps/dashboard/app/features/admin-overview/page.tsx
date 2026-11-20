import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import {
  IconArrowRight,
  IconCheck,
  IconCircleDashed,
  IconRefresh,
  IconUserCheck,
} from '@tabler/icons-react';
import type { PlatformRegistrationQueuePage } from '@niu-io/sdk';
import PageHeader from '@/components/PageHeader';
import { TableSkeleton } from '@/components/PageSkeletons';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { request } from '@/features/providers/api';
import type { ProviderSetup } from '@/features/providers/provider-setup';
import { useDashboardContext } from '@/shell/dashboard-context';
import { usePlatformCurrency } from '@/shell/platform-currency';
import { providerPathSegment } from '@/shell/provider-route';
import { useLocale } from '@/shell/ui-locale';
import { workspacePathSegment } from '@/shell/workspace-route';

type ProviderSummary = ProviderSetup & {
  id: string;
  slug?: string;
  name: string;
};

type GatewayVerification = {
  gateway: string;
  ready: boolean;
};

type PlatformConfigResponse = {
  data: {
    payment_gateways: { name: string; configured: boolean }[];
    verification?: {
      currency_configured: boolean;
      gateways: GatewayVerification[];
    };
  };
};

type BankConfigResponse = {
  data: {
    details: { beneficiary: string; bank: string; account: string; currency: string } | null;
  };
};

type OverviewSnapshot = {
  providers: ProviderSummary[] | null;
  providersError: boolean;
  standardPricesCount: number | null;
  standardPricesMore: boolean;
  standardPricesError: boolean;
  unitTariffsCount: number | null;
  unitTariffsError: boolean;
  verifiedGateways: number | null;
  configuredGateways: number | null;
  bankConfigured: boolean | null;
  paymentsError: boolean;
  pendingRegistrations: number | null;
  registrationsError: boolean;
  routePoolsCount: number | null;
  routePoolsMore: boolean;
  routePoolsError: boolean;
  customersCount: number | null;
  customersMore: boolean;
  customersError: boolean;
};

type StepStatus = 'ready' | 'action' | 'optional' | 'unavailable';

type ChecklistStep = {
  id: string;
  step: string;
  summary: string;
  status: StepStatus;
  statusLabel: string;
  actionLabel: string;
  to: string;
};

export default function AdminOverviewPage() {
  const { token, session, workspace, workspaces } = useDashboardContext();
  const { currency, billingMode, ready: currencyReady, failed: currencyFailed, reload: reloadCurrency } = usePlatformCurrency();
  const { t, format } = useLocale();
  const isInternal = session?.operating_mode === 'internal';
  const [snapshot, setSnapshot] = useState<OverviewSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);

  const loadOverview = useCallback(async (signal: AbortSignal) => {
    setLoading(true);
    const [
      providersRes,
      poolsRes,
      pricesRes,
      unitsRes,
      paymentCfgRes,
      bankRes,
      registrationsRes,
      customersRes,
    ] = await Promise.allSettled([
      request<{ data: ProviderSummary[] }>(token, '/api/v1/providers', 'GET', undefined, signal),
      request<{ data: unknown[]; has_more?: boolean }>(token, '/api/v1/routing/index?limit=50', 'GET', undefined, signal),
      isInternal
        ? Promise.resolve(null)
        : request<{ data: unknown[]; next_after: string | null }>(token, '/api/v1/pricing/standard-prices?limit=50', 'GET', undefined, signal),
      isInternal
        ? Promise.resolve(null)
        : request<{ data?: { text_tariffs?: unknown[]; media_tariffs?: unknown[] } }>(token, '/api/v1/platform/units/tariffs', 'GET', undefined, signal),
      isInternal
        ? Promise.resolve(null)
        : request<PlatformConfigResponse>(token, '/api/v1/platform/configuration', 'GET', undefined, signal),
      isInternal
        ? Promise.resolve(null)
        : request<BankConfigResponse>(token, '/api/v1/platform/payments/bank', 'GET', undefined, signal),
      isInternal
        ? Promise.resolve(null)
        : request<PlatformRegistrationQueuePage>(token, '/api/v1/platform/registrations?status=pending&limit=1', 'GET', undefined, signal),
      isInternal
        ? Promise.resolve(null)
        : request<{ data: unknown[]; next_after: string | null }>(token, '/api/v1/platform/customer-accounts?limit=50', 'GET', undefined, signal),
    ]);

    if (signal.aborted) return;

    const providers = providersRes.status === 'fulfilled' && Array.isArray(providersRes.value?.data)
      ? providersRes.value.data
      : null;

    const pools = poolsRes.status === 'fulfilled' && Array.isArray(poolsRes.value?.data) ? poolsRes.value : null;
    const prices = pricesRes.status === 'fulfilled' && pricesRes.value && Array.isArray(pricesRes.value.data)
      ? pricesRes.value
      : null;
    const unitTariffsPayload = unitsRes.status === 'fulfilled' ? unitsRes.value?.data : null;
    const unitTariffsCount = unitTariffsPayload
      ? (Array.isArray(unitTariffsPayload.text_tariffs) ? unitTariffsPayload.text_tariffs.length : 0)
        + (Array.isArray(unitTariffsPayload.media_tariffs) ? unitTariffsPayload.media_tariffs.length : 0)
      : null;

    const paymentCfg = paymentCfgRes.status === 'fulfilled' ? paymentCfgRes.value?.data ?? null : null;
    const bankCfg = bankRes.status === 'fulfilled' ? bankRes.value?.data ?? null : null;
    const registrations = registrationsRes.status === 'fulfilled' ? registrationsRes.value : null;
    const customers = customersRes.status === 'fulfilled' && customersRes.value && Array.isArray(customersRes.value.data)
      ? customersRes.value
      : null;

    setSnapshot({
      providers,
      providersError: providersRes.status === 'rejected',
      standardPricesCount: prices ? prices.data.length : null,
      standardPricesMore: Boolean(prices?.next_after),
      standardPricesError: !isInternal && pricesRes.status === 'rejected',
      unitTariffsCount,
      unitTariffsError: !isInternal && unitsRes.status === 'rejected',
      verifiedGateways: paymentCfg?.verification?.gateways
        ? paymentCfg.verification.gateways.filter(item => item.ready).length
        : paymentCfg
          ? 0
          : null,
      configuredGateways: paymentCfg?.payment_gateways
        ? paymentCfg.payment_gateways.filter(item => item.configured).length
        : null,
      bankConfigured: bankCfg ? Boolean(bankCfg.details) : null,
      paymentsError: !isInternal && paymentCfgRes.status === 'rejected' && bankRes.status === 'rejected',
      pendingRegistrations: registrations ? registrations.counts.pending : null,
      registrationsError: !isInternal && registrationsRes.status === 'rejected',
      routePoolsCount: pools ? pools.data.length : null,
      routePoolsMore: Boolean(pools?.has_more),
      routePoolsError: poolsRes.status === 'rejected',
      customersCount: customers ? customers.data.length : null,
      customersMore: Boolean(customers?.next_after),
      customersError: !isInternal && customersRes.status === 'rejected',
    });
    setLoading(false);
  }, [token, isInternal]);

  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    void loadOverview(controller.signal);
    return () => controller.abort();
  }, [token, revision, loadOverview]);

  const workspaceHref = workspace
    ? `/workspaces/${encodeURIComponent(workspacePathSegment(workspace, workspaces))}`
    : '/workspaces';

  const providers = snapshot?.providers ?? [];
  const enabledKeys = providers.reduce((sum, item) => sum + (item.enabled_api_keys ?? 0), 0);
  const savedKeys = providers.reduce((sum, item) => sum + (item.api_keys ?? 0), 0);
  const enabledRoutes = providers.reduce((sum, item) => sum + (item.enabled_model_routes ?? 0), 0);
  const savedRoutes = providers.reduce((sum, item) => sum + (item.models ?? 0), 0);
  const readyOffers = providers.reduce((sum, item) => sum + (item.ready_offers ?? 0), 0);
  const totalOffers = providers.reduce((sum, item) => sum + (item.offers ?? 0), 0);
  const firstOfferAttentionProvider = providers.find(item => (item.ready_offers ?? 0) === 0 && (item.enabled_model_routes ?? 0) > 0)
    ?? providers[0];

  const steps: ChecklistStep[] = [];

  if (isInternal) {
    steps.push({
      id: 'providers',
      step: t('1. Connect Providers & import models', '1. 接入模型供应商并导入模型'),
      summary: snapshot?.providersError
        ? t('Provider status could not be loaded.', '无法读取供应商状态。')
        : providers.length === 0
          ? t('Choose a Provider preset and enter its API key to import models for internal workspaces.', '选择供应商预设并填入上游 API 密钥，即可为内部工作空间导入模型。')
          : format(
              '{0} Providers · {1} enabled connections ({2} saved) · {3} enabled model routes ({4} saved)',
              [providers.length, enabledKeys, savedKeys, enabledRoutes, savedRoutes],
            ),
      status: snapshot?.providersError
        ? 'unavailable'
        : enabledKeys > 0 && enabledRoutes > 0
          ? 'ready'
          : 'action',
      statusLabel: snapshot?.providersError
        ? t('Unavailable', '暂不可用')
        : enabledKeys > 0 && enabledRoutes > 0
          ? t('Configured', '已配置')
          : t('Action needed', '待配置'),
      actionLabel: providers.length === 0 ? t('Connect Provider', '接入供应商') : t('Manage Providers', '管理供应商'),
      to: '/admin/providers',
    });

    steps.push({
      id: 'custom-models',
      step: t('2. Custom models & routing (optional)', '2. 自定义模型与多路路由（可选）'),
      summary: snapshot?.routePoolsError
        ? t('Custom model status could not be loaded.', '无法读取自定义模型状态。')
        : snapshot?.routePoolsCount
          ? format('{0}{1} custom models configured for failover or conditional routing.', [
              snapshot.routePoolsCount,
              snapshot.routePoolsMore ? '+' : '',
            ])
          : t('Optional. Direct Provider models work without custom models; use this only to combine multiple routes under one alias.', '可选项。直连模型无需配置此项；仅在需要将多路模型聚合成同一别名、容灾或分流时使用。'),
      status: snapshot?.routePoolsError ? 'unavailable' : snapshot?.routePoolsCount ? 'ready' : 'optional',
      statusLabel: snapshot?.routePoolsError
        ? t('Unavailable', '暂不可用')
        : snapshot?.routePoolsCount
          ? t('Configured', '已配置')
          : t('Optional', '可选'),
      actionLabel: t('Open Custom models', '管理自定义模型'),
      to: '/admin/routing',
    });

    steps.push({
      id: 'workspace',
      step: t('3. Create API keys & call models in your workspace', '3. 返回工作空间创建密钥并调用模型'),
      summary: t('Issue workspace API keys, connect your coding agent, or test directly in Generations.', '在工作空间内创建 API 密钥、连接编码 Agent，或直接在多模态生成页测试调用。'),
      status: enabledRoutes > 0 ? 'ready' : 'optional',
      statusLabel: enabledRoutes > 0 ? t('Ready to try', '可开始使用') : t('Waiting on models', '等待模型接入'),
      actionLabel: t('Open workspace', '前往工作空间'),
      to: workspaceHref,
    });
  } else {
    const modeLabel = billingMode === 'credits'
      ? t('Branded Credits', '品牌积分（Branded Credits）')
      : t('Settlement Currency', '结算币种');

    steps.push({
      id: 'currency',
      step: t('1. Configure platform currency & billing mode', '1. 配置平台币种与计费模式'),
      summary: currencyFailed && !currency
        ? t('Platform currency could not be loaded.', '无法读取平台币种。')
        : currency
          ? format('Currency: {0} · Active billing mode: {1}. Required before pricing, customers, and payment verification.', [currency, modeLabel])
          : t('Set the platform currency once before publishing prices, onboarding customers, or verifying payments.', '在发布价格、创建客户或验证支付网关前，需先完成一次性的平台币种设置。'),
      status: currencyFailed && !currency
        ? 'unavailable'
        : currency
          ? 'ready'
          : 'action',
      statusLabel: currencyFailed && !currency
        ? t('Unavailable', '暂不可用')
        : currency
          ? t('Configured', '已配置')
          : t('Required first', '需优先配置'),
      actionLabel: currency ? t('Review settings', '查看设置') : t('Set currency', '设置币种'),
      to: '/admin/settings',
    });

    steps.push({
      id: 'supply',
      step: t('2. Connect Providers & enable model routes', '2. 接入供应商连接并启用模型路由'),
      summary: snapshot?.providersError
        ? t('Provider status could not be loaded.', '无法读取供应商状态。')
        : providers.length === 0
          ? t('Connect at least one Provider API key and enable the models you plan to resell.', '至少接入一个供应商连接，并启用计划对外提供的模型路由。')
          : format('{0} Providers · {1} enabled connections ({2} saved) · {3} enabled routes ({4} saved)', [
              providers.length,
              enabledKeys,
              savedKeys,
              enabledRoutes,
              savedRoutes,
            ]),
      status: snapshot?.providersError
        ? 'unavailable'
        : enabledKeys > 0 && enabledRoutes > 0
          ? 'ready'
          : 'action',
      statusLabel: snapshot?.providersError
        ? t('Unavailable', '暂不可用')
        : enabledKeys > 0 && enabledRoutes > 0
          ? t('Configured', '已配置')
          : t('Action needed', '待配置'),
      actionLabel: providers.length === 0 ? t('Connect Provider', '接入供应商') : t('Manage Providers', '管理供应商'),
      to: '/admin/providers',
    });

    steps.push({
      id: 'offers',
      step: t('3. Approve commercial purchase offers', '3. 配置并启用采购报价（Commercial offers）'),
      summary: snapshot?.providersError
        ? t('Offer readiness could not be loaded.', '无法读取采购报价就绪状态。')
        : readyOffers > 0
          ? format('{0} of {1} commercial offers are ready to supply. Customer selling prices remain separate.', [readyOffers, totalOffers])
          : t('In Resale mode, an enabled model route still requires an approved, active purchase offer before it can be sold.', '转售模式下，仅启用模型路由尚不能售卖，必须为对应模型配置并启用采购报价授权。'),
      status: snapshot?.providersError
        ? 'unavailable'
        : readyOffers > 0
          ? 'ready'
          : 'action',
      statusLabel: snapshot?.providersError
        ? t('Unavailable', '暂不可用')
        : readyOffers > 0
          ? t('Ready to supply', '供给就绪')
          : t('Action needed', '待授权'),
      actionLabel: firstOfferAttentionProvider ? t('Review offers', '配置采购报价') : t('Open Providers', '前往供应商'),
      to: firstOfferAttentionProvider
        ? `/admin/providers/${encodeURIComponent(providerPathSegment(firstOfferAttentionProvider))}/models`
        : '/admin/providers',
    });

    const isCreditsMode = billingMode === 'credits';
    const priceCount = isCreditsMode ? snapshot?.unitTariffsCount : snapshot?.standardPricesCount;
    const priceError = isCreditsMode ? snapshot?.unitTariffsError : snapshot?.standardPricesError;
    steps.push({
      id: 'pricing',
      step: t('4. Publish customer selling prices', '4. 发布对外客户售价'),
      summary: priceError
        ? t('Customer pricing status could not be loaded.', '无法读取客户定价状态。')
        : priceCount && priceCount > 0
          ? isCreditsMode
            ? format('{0} Branded Credits tariffs published.', [priceCount])
            : format('{0}{1} standard currency prices published.', [priceCount, snapshot?.standardPricesMore ? '+' : ''])
          : t('Publish customer selling prices for your ready models in the active billing mode.', '在当前生效的计费模式下，为已就绪的模型发布客户售价。'),
      status: priceError
        ? 'unavailable'
        : priceCount && priceCount > 0
          ? 'ready'
          : 'action',
      statusLabel: priceError
        ? t('Unavailable', '暂不可用')
        : priceCount && priceCount > 0
          ? t('Published', '已发布')
          : t('Action needed', '待定价'),
      actionLabel: t('Manage pricing', '配置定价'),
      to: isCreditsMode ? '/admin/pricing?tab=credits' : '/admin/pricing',
    });

    const hasVerifiedPayment = Boolean((snapshot?.verifiedGateways ?? 0) > 0 || snapshot?.bankConfigured);
    steps.push({
      id: 'payments',
      step: t('5. Configure & verify payment collection', '5. 配置并验证收款渠道'),
      summary: snapshot?.paymentsError
        ? t('Payment configuration status could not be loaded.', '无法读取收款配置状态。')
        : hasVerifiedPayment
          ? format('{0} verified online gateways · Bank transfer {1}.', [
              snapshot?.verifiedGateways ?? 0,
              snapshot?.bankConfigured ? t('configured', '已配置') : t('not configured', '未配置'),
            ])
          : (snapshot?.configuredGateways ?? 0) > 0
            ? format('{0} payment gateways configured, awaiting callback verification. You can also configure bank transfer or fund customers manually.', [snapshot?.configuredGateways ?? 0])
            : t('Verify an online payment gateway or configure bank transfer details so customers can top up balances.', '验证在线支付网关或配置对公转账资料，以便客户自助充值（也可在客户管理中手工授信/发放赠金）。'),
      status: snapshot?.paymentsError
        ? 'unavailable'
        : hasVerifiedPayment
          ? 'ready'
          : 'optional',
      statusLabel: snapshot?.paymentsError
        ? t('Unavailable', '暂不可用')
        : hasVerifiedPayment
          ? t('Verified', '已就绪')
          : t('Not verified', '未验证'),
      actionLabel: t('Open Payments', '管理收款'),
      to: '/admin/payments',
    });

    steps.push({
      id: 'customers',
      step: t('6. Onboard customers & review registrations', '6. 客户开户与注册审批'),
      summary: snapshot?.customersError
        ? t('Customer directory status could not be loaded.', '无法读取客户目录状态。')
        : format('{0}{1} customer companies · {2} pending registration requests.', [
            snapshot?.customersCount ?? 0,
            snapshot?.customersMore ? '+' : '',
            snapshot?.pendingRegistrations ?? 0,
          ]),
      status: snapshot?.customersError
        ? 'unavailable'
        : (snapshot?.pendingRegistrations ?? 0) > 0
          ? 'action'
          : (snapshot?.customersCount ?? 0) > 0
            ? 'ready'
            : 'optional',
      statusLabel: snapshot?.customersError
        ? t('Unavailable', '暂不可用')
        : (snapshot?.pendingRegistrations ?? 0) > 0
          ? format('{0} pending', [snapshot?.pendingRegistrations ?? 0])
          : (snapshot?.customersCount ?? 0) > 0
            ? t('Active', '已开通')
            : t('Ready', '可开户'),
      actionLabel: (snapshot?.pendingRegistrations ?? 0) > 0 ? t('Review registrations', '审批注册') : t('Manage customers', '管理客户'),
      to: (snapshot?.pendingRegistrations ?? 0) > 0 ? '/admin/registrations' : '/admin/customers',
    });
  }

  return (
    <div className="w-full min-w-0 space-y-6">
      <PageHeader
        title={t('Admin overview', '管理总览')}
        action={
          <Button
            variant="outline"
            size="sm"
            disabled={loading}
            onClick={() => {
              reloadCurrency();
              setRevision(value => value + 1);
            }}
          >
            <IconRefresh size={16} aria-hidden="true" />
            <span>{t('Refresh', '刷新')}</span>
          </Button>
        }
      />

      <div className="flex flex-col gap-3 rounded-[var(--radius-panel)] bg-card px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold">
              {isInternal ? t('Internal use mode', '自用模式（Internal use）') : t('Resale mode', '转售模式（Resale）')}
            </h2>
            <Badge variant="secondary">{isInternal ? t('Direct Provider billing', '直连上游付款') : t('Commercial billing', '商业转售计费')}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {isInternal
              ? t(
                  'Connect Providers and import models for your internal workspaces. No customer pricing, collection, or commercial offer approval is required.',
                  '接入供应商并导入模型即可供内部工作空间直接调用，无需配置客户定价、收款网关或采购报价授权。',
                )
              : t(
                  'Follow the setup steps below in order: set currency, connect Providers and approve purchase offers, publish customer prices, then verify payments and onboard customers.',
                  '请按下方依赖顺序完成上线配置：先设平台币种 → 接供应商与模型路由 → 授权采购报价 → 发布客户售价 → 验证收款与客户开户。',
                )}
          </p>
        </div>
        <Button asChild variant="outline" size="sm" className="shrink-0 self-start sm:self-center">
          <Link to="/admin/providers">
            <span>{t('Providers', '模型供应商')}</span>
            <IconArrowRight size={15} aria-hidden="true" />
          </Link>
        </Button>
      </div>

      {!isInternal && (snapshot?.pendingRegistrations ?? 0) > 0 && (
        <Alert>
          <IconUserCheck className="size-4" aria-hidden="true" />
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span>
              {format('{0} registration requests awaiting approval.', [snapshot?.pendingRegistrations ?? 0])}
            </span>
            <Button asChild variant="outline" size="sm">
              <Link to="/admin/registrations">{t('Review requests', '前往审批')}</Link>
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <section aria-labelledby="admin-setup-checklist-heading" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="admin-setup-checklist-heading" className="text-[15px] font-semibold">
            {t('Setup checklist', '上线配置清单')}
          </h2>
          <p className="text-xs text-muted-foreground">
            {t('Saved configuration never implies verified upstream access or live model execution.', '已保存配置仅反映当前平台状态，不代表已验证上游连通性或真实推理权限。')}
          </p>
        </div>

        {loading && !snapshot && currencyReady === false ? (
          <TableSkeleton columns={3} rows={isInternal ? 3 : 6} label={t('Loading setup status…', '正在加载配置进度…')} />
        ) : (
          <div className="rounded-[var(--radius-panel)] bg-card">
            <Table className="block sm:table" aria-label={t('Setup checklist', '上线配置清单')}>
              <TableHeader className="hidden sm:table-header-group">
                <TableRow>
                  <TableHead className="w-[52%]">{t('Step', '步骤')}</TableHead>
                  <TableHead>{t('Status', '当前状态')}</TableHead>
                  <TableHead className="text-right">{t('Next action', '下一步')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="block divide-y divide-border/50 sm:table-row-group sm:divide-y-0">
                {steps.map(item => (
                  <TableRow key={item.id} className="flex flex-col gap-2.5 p-4 sm:table-row sm:p-0">
                    <TableCell className="block p-0 align-top whitespace-normal sm:table-cell sm:px-5 sm:py-4">
                      <p className="font-medium text-foreground">{item.step}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{item.summary}</p>
                    </TableCell>
                    <TableCell className="block p-0 align-top whitespace-nowrap sm:table-cell sm:px-5 sm:py-4">
                      <Badge
                        variant={item.status === 'ready' ? 'secondary' : 'outline'}
                        className="gap-1.5 font-normal"
                      >
                        {item.status === 'ready' ? (
                          <IconCheck className="size-3.5 text-[var(--success)]" aria-hidden="true" />
                        ) : (
                          <IconCircleDashed className="size-3.5 text-muted-foreground" aria-hidden="true" />
                        )}
                        <span>{item.statusLabel}</span>
                      </Badge>
                    </TableCell>
                    <TableCell className="block p-0 align-top whitespace-nowrap sm:table-cell sm:px-5 sm:py-4 sm:text-right">
                      <Button asChild variant={item.status === 'action' ? 'default' : 'outline'} size="sm">
                        <Link to={item.to}>{item.actionLabel}</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  );
}
