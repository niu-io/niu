import { useLocale as useUILocale } from '@/shell/ui-locale';
import { useEffect } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
import {
  IconAdjustmentsHorizontal as Settings2,
  IconChartLine as ChartNoAxesCombined,
  IconCpu as Boxes,
  IconCreditCard as CreditCard,
  IconHistory,
  IconKey as KeyRound,
  IconLayoutDashboard as LayoutDashboard,
  IconPalette,
  IconPlugConnected as RailSuppliers,
  IconPlus as Plus,
  IconRoute,
  IconSelector as ChevronsUpDown,
  IconUsers as Users,
  IconWallet,
} from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';
import { request } from '@/features/providers/api';
import { useCachedQuery } from '@/lib/query-cache';
import { canManagePlatform, type DashboardContext } from './dashboard-context';
import { useLocale } from './ui-locale';
import ProductRailLink from './ProductRailLink';
import { providerPathSegment, resolveProvider, type ProviderIdentity } from './provider-route';

export function ProviderNav({ context }: { context: DashboardContext }) {
  const { t: uiT } = useUILocale();
  const { isZh, t } = useLocale();
  const {
    provider: providerParam,
    supplier: supplierParam,
    providerId: adminProviderParam,
    supplierId: adminSupplierParam,
  } = useParams();
  const provider = providerParam ?? supplierParam;
  const adminProvider = adminProviderParam ?? adminSupplierParam;
  const { isMobile, setOpenMobile } = useSidebar();
  const [search] = useSearchParams();
  const navigate = useNavigate();

  const platformManager = canManagePlatform(context.session);
  const {
    data: fetchedProviders,
    loading,
    error: queryError,
    reload,
  } = useCachedQuery<{ data: ProviderIdentity[] }>(
    context.token,
    platformManager && context.token ? '/api/v1/providers' : null,
    async signal => {
      const result = await request<{ data: ProviderIdentity[] }>(
        context.token,
        '/api/v1/providers',
        'GET',
        undefined,
        signal,
      );
      if (!Array.isArray(result.data)) throw new Error('Invalid provider list');
      return result;
    },
    { enabled: platformManager && Boolean(context.token), persist: true, keepPreviousData: true },
  );

  useEffect(() => {
    const refresh = () => reload();
    window.addEventListener('niu:supplier-profile-updated', refresh);
    window.addEventListener('niu:provider-profile-updated', refresh);
    return () => {
      window.removeEventListener('niu:supplier-profile-updated', refresh);
      window.removeEventListener('niu:provider-profile-updated', refresh);
    };
  }, [reload]);

  const providers = platformManager ? (fetchedProviders?.data ?? []) : (context.session?.provider_memberships ?? []);
  const error = platformManager && queryError ? t('Could not load providers.', '无法加载模型供应商列表。') : '';

  const selected =
    adminProvider ?? provider ?? search.get('provider') ?? search.get('supplier') ?? providers[0]?.id ?? '';
  const membership = resolveProvider(selected, providers);
  const selectedSegment = membership ? providerPathSegment(membership) : selected;

  const location = useLocation();
  const entries = provider
    ? [
        { to: `/providers/${provider}`, label: 'Overview', labelZh: '概览', end: true },
        { to: `/providers/${provider}/models`, label: 'Models', labelZh: '模型', end: false },
        { to: `/providers/${provider}/usage`, label: 'Usage', labelZh: '调用量', end: false },
        { to: `/providers/${provider}/settlements`, label: 'Settlements', labelZh: '结算账单', end: false },
      ]
    : [
        { to: '/admin/providers', label: 'Providers', labelZh: '模型供应商', end: false },
        { to: '/admin/pools', label: 'Model pools', labelZh: '模型池', end: false },
        { to: '/admin/customers', label: 'Customers', labelZh: '客户管理', end: false },
        { to: '/admin/reports', label: 'Financial reports', labelZh: '财务报表', end: false },
        { to: '/admin/balances', label: 'Account balances', labelZh: '账户余额', end: false },
        { to: '/admin/pricing', label: 'Pricing', labelZh: '定价配置', end: false },
        { to: '/admin/payments', label: 'Payment gateways', labelZh: '支付网关', end: false },
        { to: '/admin/branding', label: 'Branding', labelZh: '品牌定制', end: false },
        { to: '/admin/audit', label: 'Audit logs', labelZh: '审计日志', end: false },
        { to: '/admin/settings', label: 'Settings', labelZh: '实例设置', end: false },
      ];
  const visibleEntries = context.session?.operating_mode === 'internal'
    ? entries.filter(item => !['/admin/reports','/admin/balances','/admin/pricing','/admin/payments'].includes(item.to) && !item.to.endsWith('/settlements'))
    : entries;

  return (
    <>
      <SidebarHeader className="sidebar-heading">
        {!provider && <h2 className="sidebar-heading-row">{t('Admin', '管理后台')}</h2>}
        {provider && (
          <div className="workspace-switcher">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="workspace-switcher-trigger"
                  aria-label={uiT("Switch provider")}
                  title={t('Switch provider', '切换供应商')}
                >
                  <span className="workspace-switcher-copy">
                    <strong>
                      {membership?.name ??
                        (loading
                          ? t('Loading provider…', '正在加载供应商…')
                          : error
                            ? t('Provider unavailable', '供应商暂不可用')
                            : t('Choose provider', '选择供应商'))}
                    </strong>
                  </span>
                  <ChevronsUpDown size={16} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="workspace-switcher-menu"
                side="bottom"
                align="start"
                sideOffset={8}
                collisionPadding={12}
              >
                <DropdownMenuLabel className="workspace-switcher-menu-title">
                  {t('Providers', '模型供应商')}
                </DropdownMenuLabel>
                <DropdownMenuRadioGroup
                  value={membership?.id ?? selected}
                  onValueChange={id => {
                    const section = location.pathname.split('/')[adminProvider ? 4 : 3];
                    const nextSearch = new URLSearchParams(location.search);
                    for (const key of ['provider', 'supplier', 'create', 'properties']) nextSearch.delete(key);
                    navigate(
                      `${adminProvider ? '/admin' : ''}/providers/${encodeURIComponent(
                        providerPathSegment(providers.find(item => item.id === id) ?? { id }),
                      )}${section ? '/' + section : ''}${
                        nextSearch.size ? '?' + nextSearch.toString() : ''
                      }${location.hash}`,
                    );
                    if (isMobile) setOpenMobile(false);
                  }}
                >
                  {providers.map(item => (
                    <DropdownMenuRadioItem key={item.id} value={item.id}>
                      <span>{item.name}</span>
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
                {loading && (
                  <DropdownMenuLabel role="status">
                    {t('Loading providers…', '正在加载供应商…')}
                  </DropdownMenuLabel>
                )}
                {!loading && !error && providers.length === 0 && (
                  <DropdownMenuLabel>{t('No providers yet', '暂无供应商')}</DropdownMenuLabel>
                )}
                {error && (
                  <>
                    <div className="workspace-switcher-error" role="alert">
                      {error}
                    </div>
                    <DropdownMenuItem
                      onSelect={event => {
                        event.preventDefault();
                        reload();
                      }}
                    >
                      {t('Retry provider list', '重试加载供应商列表')}
                    </DropdownMenuItem>
                  </>
                )}
                {!adminProvider && platformManager && (
                  <>
                    <DropdownMenuSeparator className="workspace-switcher-separator" />
                    <DropdownMenuItem
                      disabled={!membership || loading || Boolean(error)}
                      onSelect={() =>
                        navigate('/admin/providers/' + encodeURIComponent(selectedSegment) + '/settings')
                      }
                    >
                      <Settings2 size={16} />
                      {t('Provider settings', '供应商设置')}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="workspace-switcher-create"
                      onSelect={() =>
                        navigate(
                          '/admin/providers/overview?create=provider' +
                            (selected ? '&provider=' + encodeURIComponent(selectedSegment) : ''),
                        )
                      }
                    >
                      <Plus size={16} />
                      {t('Add provider', '添加供应商')}
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </SidebarHeader>
      <SidebarContent className="workspace-sidebar-content">
        <nav aria-label={provider ? uiT("Provider navigation") : uiT("Admin navigation")}>
          <SidebarMenu className="workspace-nav-menu">
            {visibleEntries.map(item => {
              const Icon =
                item.label === 'Settings'
                  ? Settings2
                  : item.label === 'API keys'
                    ? KeyRound
                    : item.label === 'Members' || item.label === 'Customers'
                      ? Users
                      : item.label === 'Providers'
                        ? RailSuppliers
                        : item.label === 'Model pools'
                          ? IconRoute
                          : item.label === 'Account balances'
                            ? IconWallet
                            : item.label === 'Payment gateways'
                              ? CreditCard
                              : item.label === 'Branding'
                                ? IconPalette
                                : item.label === 'Audit logs'
                                  ? IconHistory
                                  : item.label === 'Overview'
                                    ? LayoutDashboard
                                    : item.label === 'Models'
                                      ? Boxes
                                      : item.label === 'Settlements'
                                        ? CreditCard
                                        : ChartNoAxesCombined;
              return (
                <SidebarMenuItem key={item.to}>
                  <SidebarMenuButton
                    asChild
                    isActive={
                      location.pathname === item.to ||
                      (!provider && location.pathname.startsWith(item.to + '/'))
                    }
                    className="nav-item provider-zone-item"
                  >
                    <ProductRailLink to={item.to} end={item.end}>
                      <Icon className="nav-icon" aria-hidden="true" />
                      <span>{isZh ? item.labelZh : item.label}</span>
                    </ProductRailLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </nav>
      </SidebarContent>
    </>
  );
}

export { ProviderNav as SupplierNav };
