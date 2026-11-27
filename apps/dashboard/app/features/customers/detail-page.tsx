import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useParams, useSearchParams } from 'react-router';
import { IconArrowLeft, IconBuilding, IconCreditCard, IconDots, IconPlus, IconRefresh, IconSettings } from '@tabler/icons-react';
import { NiuAdminClient, type CustomerBalance } from '@niu-io/sdk/admin';
import PageHeader from '@/components/PageHeader';
import { TableSkeleton } from '@/components/PageSkeletons';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { authenticatedFetch as fetch } from '@/lib/authenticated-fetch';
import { formatRateMoney } from '@/lib/money';
import { canManagePlatform, useDashboardContext } from '@/shell/dashboard-context';
import { usePlatformCurrency } from '@/shell/platform-currency';
import { translateUI, useLocale as useUILocale } from '@/shell/ui-locale';
import { CustomerPricingPanel } from './customer-pricing';
import { GiftCorrectionEditor } from './gift-corrections';
import { GrantEditor, GrantHistory } from './grants';
import {
  CreditEditor,
  CreditsSummaryCell,
  customerDisplayName,
  formatCustomerDateTime,
  formatCustomerShortDate,
  loadCustomerCompany,
  memberRoleLabel,
  transactionKindLabel,
  type Company,
  type CompanyMemberSummary,
  type CompanyWorkspaceSummary,
  type Editor,
} from './customer-shared';
import CustomerSetup from './setup';
import { TopupEditor } from './topups';
import { CompanyBrandedUnitsDialog } from './unit-accounts';

type DetailTab = 'overview' | 'pricing' | 'access';

export default function CustomerDetailRoute() {
  const { t: uiT } = useUILocale();
  const context = useDashboardContext();
  const { customerId = '' } = useParams();

  if (!canManagePlatform(context.session)) {
    return (
      <Alert>
        <AlertTitle>{uiT('Platform administrator access required')}</AlertTitle>
        <AlertDescription>
          <p>{uiT('Your account does not have Platform administrator access. Ask an installation administrator to grant it.')}</p>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <CustomerDetail
      key={`${context.token}:${customerId}`}
      token={context.token}
      customerId={customerId}
      onWorkspaceCreated={context.reloadWorkspaces}
    />
  );
}

export function CustomerDetail({
  token,
  customerId,
  onWorkspaceCreated,
}: {
  token: string;
  customerId: string;
  onWorkspaceCreated: () => void;
}) {
  const { locale, t: uiT, format: uiF } = useUILocale();
  const { currency: platformCurrency } = usePlatformCurrency();
  const [search, setSearch] = useSearchParams();
  const routeLocation = useLocation();
  const rawTab = search.get('tab');
  const activeTab: DetailTab = rawTab === 'pricing' || rawTab === 'access' ? rawTab : 'overview';

  function selectTab(nextTab: DetailTab) {
    const next = new URLSearchParams(search);
    if (nextTab === 'overview') next.delete('tab');
    else next.set('tab', nextTab);
    setSearch(next, { replace: true });
  }

  const client = useMemo(
    () => new NiuAdminClient({ fetch, adminToken: token, baseURL: new URL('/api/v1', location.origin).href }),
    [token],
  );

  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [setupOpen, setSetupOpen] = useState(false);
  const [editor, setEditor] = useState<Editor | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError('');
    try {
      const found = await loadCustomerCompany(token, customerId, controller.signal);
      if (controller.signal.aborted) return;
      setCompany(found);
    } catch (failure) {
      if (!controller.signal.aborted) {
        setError(failure instanceof Error ? failure.message : translateUI('Could not load customer details.'));
      }
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [customerId, token]);

  useEffect(() => {
    void load();
    return () => abortRef.current?.abort();
  }, [load]);

  if (loading && !company) {
    return (
      <section className="empty-region min-w-0 space-y-5" aria-label={uiT('Customer details', '客户详情')}>
        <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit">
          <Link to="/admin/customers">
            <IconArrowLeft size={15} aria-hidden="true" />
            <span>{uiT('Customers')}</span>
          </Link>
        </Button>
        <TableSkeleton columns={4} rows={4} label={uiT('Loading customer details…', '正在加载客户详情…')} />
      </section>
    );
  }

  if (!loading && !company) {
    return (
      <section className="empty-region min-w-0 space-y-5" aria-label={uiT('Customer details', '客户详情')}>
        <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit">
          <Link to="/admin/customers">
            <IconArrowLeft size={15} aria-hidden="true" />
            <span>{uiT('Customers')}</span>
          </Link>
        </Button>
        {error ? (
          <Alert variant="destructive">
            <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
              <span>{error}</span>
              <Button type="button" variant="outline" size="sm" onClick={() => void load()}>{uiT('Retry')}</Button>
            </AlertDescription>
          </Alert>
        ) : (
          <Empty className="min-h-48">
            <EmptyHeader>
              <EmptyMedia variant="icon"><IconBuilding size={20} aria-hidden="true" /></EmptyMedia>
              <EmptyTitle>{uiT('Customer not found', '未找到该客户')}</EmptyTitle>
              <EmptyDescription>{uiT('This customer account could not be found in the current directory.', '当前客户列表中未找到该客户账号。')}</EmptyDescription>
            </EmptyHeader>
            <Button asChild variant="outline" size="sm">
              <Link to="/admin/customers">{uiT('Back to Customers', '返回客户管理')}</Link>
            </Button>
          </Empty>
        )}
      </section>
    );
  }

  if (!company) return null;
  if (company.slug && company.slug !== customerId) {
    return <Navigate replace to={`/admin/customers/${encodeURIComponent(company.slug)}${routeLocation.search}${routeLocation.hash}`} />;
  }
  const currentCompany: Company = company;

  const companyName = customerDisplayName(currentCompany, uiT);
  const primaryAccount: CustomerBalance | null =
    currentCompany.accounts.find(acc => acc.currency === platformCurrency) ?? currentCompany.accounts[0] ?? null;
  const canTransactPrimary = Boolean(platformCurrency && (!primaryAccount || primaryAccount.currency === platformCurrency));
  const workspaces: CompanyWorkspaceSummary[] = currentCompany.workspaces ?? [];
  const members: CompanyMemberSummary[] = currentCompany.members ?? [];
  const transactions = currentCompany.recent_transactions ?? [];
  const customPriceCount = currentCompany.custom_price_count ?? 0;
  const memberCount = currentCompany.member_count ?? members.length;
  const workspaceNameById = new Map(workspaces.map(ws => [ws.id, ws.name]));
  const outstandingNanos =
    primaryAccount && primaryAccount.outstanding_nanos !== null && primaryAccount.outstanding_nanos !== undefined
      ? BigInt(primaryAccount.outstanding_nanos)
      : 0n;
  const balanceNanos = primaryAccount ? BigInt(primaryAccount.balance_nanos) : 0n;

  function openEditorFrom(kind: Editor['kind'], account: CustomerBalance | null, target: HTMLElement | null) {
    openerRef.current = target;
    setNotice('');
    setEditor({ kind, company: currentCompany, account });
  }

  return (
    <section className="empty-region min-w-0 space-y-5" aria-label={companyName}>
      <PageHeader
        title={companyName}
        syncRouteTitle
        routeTitleKey={currentCompany.organization_id}
        action={
          <>
            <Button
              type="button"
              size="sm"
              disabled={!canTransactPrimary}
              onClick={event => openEditorFrom('topup', primaryAccount, event.currentTarget)}
            >
              <IconPlus size={15} aria-hidden="true" />
              <span>{uiT('Top up', '充值')}</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="hidden sm:inline-flex"
              disabled={!canTransactPrimary}
              onClick={event => openEditorFrom('credit', primaryAccount, event.currentTarget)}
            >
              <IconCreditCard size={15} aria-hidden="true" />
              <span>{uiT('Credit limit', '信用额度')}</span>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label={uiT('More actions')}
                  onPointerDown={event => { openerRef.current = event.currentTarget; }}
                  onClick={event => { openerRef.current = event.currentTarget; }}
                >
                  <IconDots size={16} aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {primaryAccount && (
                  <DropdownMenuItem onSelect={() => openEditorFrom('history', primaryAccount, openerRef.current)}>
                    {uiT('Noncash grant history')}
                  </DropdownMenuItem>
                )}
                {primaryAccount && <DropdownMenuSeparator />}
                <DropdownMenuItem
                  className="sm:hidden"
                  disabled={!canTransactPrimary}
                  onSelect={() => openEditorFrom('credit', primaryAccount, openerRef.current)}
                >
                  {uiT('Credit limit', '信用额度')}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => {
                    setNotice('');
                    setSetupOpen(true);
                  }}
                >
                  {uiT('Set up access', '配置工作空间与账号')}
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={!canTransactPrimary}
                  onSelect={() => openEditorFrom('grant', primaryAccount, openerRef.current)}
                >
                  {uiT('Grant noncash balance')}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => openEditorFrom('units', primaryAccount, openerRef.current)}>
                  {uiT('Manage Branded Credits')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="hidden sm:inline-flex"
              disabled={loading}
              aria-label={uiT('Refresh')}
              title={uiT('Refresh')}
              onClick={() => void load()}
            >
              <IconRefresh size={15} aria-hidden="true" />
            </Button>
          </>
        }
      />

      {notice && <p role="status" className="text-sm text-foreground">{uiT(notice)}</p>}
      {error && (
        <Alert variant="destructive">
          <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
            <span>{error}</span>
            <Button type="button" variant="outline" size="sm" onClick={() => void load()}>{uiT('Retry')}</Button>
          </AlertDescription>
        </Alert>
      )}

      <Tabs value={activeTab} onValueChange={v => selectTab(v as DetailTab)}>
        <div className="max-w-full overflow-x-auto overflow-y-hidden">
          <TabsList variant="line" aria-label={uiT('Customer detail sections', '客户管理标签页')}>
            <TabsTrigger value="overview">{uiT('Overview', '概览')}</TabsTrigger>
            <TabsTrigger value="pricing" className="gap-1.5">
              <span>{uiT('Pricing', '专属价格')}</span>
              {customPriceCount > 0 && (
                <Badge variant="secondary" className="px-1.5 py-0 text-[11px] font-normal">
                  {customPriceCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="access">{uiT('Workspaces & members', '工作空间与成员')}</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="overview" className="space-y-6 pt-2">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-muted/45 p-4 space-y-1">
              <p className="text-xs text-muted-foreground">{uiT('Balance', '账户余额')}</p>
              <p className={`text-xl font-semibold tabular-nums ${!primaryAccount?.unlimited_credit && balanceNanos < 0n ? 'text-destructive' : ''}`}>
                {primaryAccount ? formatRateMoney(primaryAccount.balance_nanos, primaryAccount.currency) : uiT('No balance yet', '暂无余额')}
              </p>
              <p className="text-xs text-muted-foreground">
                {primaryAccount
                  ? outstandingNanos > 0n
                    ? uiF('Pending settlement: {0}', [formatRateMoney(primaryAccount.outstanding_nanos ?? '0', primaryAccount.currency)])
                    : primaryAccount.currency
                  : uiT('Top up or set credit to initialize', '充值或设置信用额度后自动开户')}
              </p>
            </div>

            <div className="rounded-xl bg-muted/45 p-4 space-y-1">
              <p className="text-xs text-muted-foreground">{uiT('Credit limit', '信用额度')}</p>
              <p className="text-xl font-semibold tabular-nums">
                {primaryAccount
                  ? primaryAccount.unlimited_credit
                    ? uiT('Unlimited', '无限授信')
                    : formatRateMoney(primaryAccount.credit_limit_nanos, primaryAccount.currency)
                  : formatRateMoney('0', platformCurrency || 'USD')}
              </p>
              <p className="text-xs text-muted-foreground tabular-nums">
                {primaryAccount
                  ? primaryAccount.unlimited_credit
                    ? uiT('Continuous arrears allowed', '允许持续欠费记账')
                    : uiF('Available to spend: {0}', [formatRateMoney(primaryAccount.available_nanos, primaryAccount.currency)])
                  : uiT('Prepaid only', '仅预付费')}
              </p>
            </div>

            <div className="rounded-xl bg-muted/45 p-4 space-y-1">
              <p className="text-xs text-muted-foreground">{uiT('Pricing', '价格方案')}</p>
              <p className="text-xl font-semibold">
                {customPriceCount > 0
                  ? customPriceCount === 1
                    ? uiT('1 custom price', '1 个专属价')
                    : uiF('{0} custom prices', [customPriceCount])
                  : uiT('Standard pricing', '标准售价')}
              </p>
              <Button
                type="button"
                variant="link"
                size="sm"
                className="h-auto p-0 text-xs"
                onClick={() => selectTab('pricing')}
              >
                {uiT('Manage pricing', '管理专属价格')} →
              </Button>
            </div>
          </div>

          <div className="rounded-xl bg-muted/45 p-4 space-y-4">
            <h2 className="text-sm font-medium">{uiT('Customer details', '客户信息')}</h2>
            <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1">
                <dt className="text-xs text-muted-foreground">{uiT('Owner', '负责人')}</dt>
                <dd className="min-w-0">
                  {currentCompany.owner ? (
                    <div className="space-y-0.5">
                      <p className="font-medium [overflow-wrap:anywhere]">{currentCompany.owner.name}</p>
                      {currentCompany.owner.email && (
                        <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">{currentCompany.owner.email}</p>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-muted-foreground">{uiT('Owner not set')}</span>
                      <Button
                        type="button"
                        variant="link"
                        size="sm"
                        className="h-auto p-0 text-xs"
                        onClick={event => {
                          openerRef.current = event.currentTarget;
                          setSetupOpen(true);
                        }}
                      >
                        {uiT('Set up')}
                      </Button>
                    </div>
                  )}
                </dd>
              </div>

              <div className="space-y-1">
                <dt className="text-xs text-muted-foreground">{uiT('Workspaces')}</dt>
                <dd className="min-w-0">
                  {workspaces.length > 0 ? (
                    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                      {workspaces.slice(0, 2).map((ws, idx) => (
                        <span key={ws.id} className="inline-flex items-center gap-1.5">
                          {idx > 0 && <span className="text-muted-foreground" aria-hidden="true">·</span>}
                          <Link
                            className="font-medium underline-offset-4 hover:underline"
                            to={`/workspaces/${encodeURIComponent(ws.slug || ws.id)}`}
                          >
                            {ws.name}
                          </Link>
                        </span>
                      ))}
                      {workspaces.length > 2 && (
                        <Button
                          type="button"
                          variant="link"
                          size="sm"
                          className="h-auto p-0 text-xs"
                          onClick={() => selectTab('access')}
                        >
                          {uiF('+{0} more', [workspaces.length - 2])}
                        </Button>
                      )}
                    </div>
                  ) : (
                    <span className="text-muted-foreground">{uiT('No workspaces')}</span>
                  )}
                </dd>
              </div>

              <div className="space-y-1">
                <dt className="text-xs text-muted-foreground">{uiT('Members', '成员')}</dt>
                <dd>
                  {memberCount > 0 ? (
                    <Button
                      type="button"
                      variant="link"
                      size="sm"
                      className="h-auto p-0 text-sm font-medium text-foreground"
                      onClick={() => selectTab('access')}
                    >
                      {memberCount === 1 ? uiT('1 member', '1 位成员') : uiF('{0} members', [memberCount])}
                    </Button>
                  ) : (
                    <span className="text-muted-foreground">0</span>
                  )}
                </dd>
              </div>

              <div className="space-y-1">
                <dt className="text-xs text-muted-foreground">{uiT('Created', '创建时间')}</dt>
                <dd className="font-medium tabular-nums">{formatCustomerShortDate(currentCompany.created_at, locale)}</dd>
              </div>
            </dl>

            {currentCompany.credits && (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-3">
                <div className="space-y-0.5">
                  <p className="text-xs text-muted-foreground">{uiT('Credits')}</p>
                  <CreditsSummaryCell credits={currentCompany.credits} />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={event => openEditorFrom('units', primaryAccount, event.currentTarget)}
                >
                  {uiT('Manage Branded Credits')}
                </Button>
              </div>
            )}
          </div>

          {currentCompany.accounts.length > 1 && (
            <div className="space-y-2">
              <h2 className="text-sm font-medium">{uiT('All currency accounts', '全部币种账户')}</h2>
              <Table aria-label={uiT('Customer currency accounts', '客户币种账户')}>
                <TableHeader>
                  <TableRow>
                    <TableHead>{uiT('Currency')}</TableHead>
                    <TableHead className="text-right">{uiT('Balance', '余额')}</TableHead>
                    <TableHead className="text-right">{uiT('Credit limit', '信用额度')}</TableHead>
                    <TableHead className="text-right">{uiT('Available to spend', '可用额度')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {currentCompany.accounts.map(acc => (
                    <TableRow key={acc.currency}>
                      <TableCell>{acc.currency}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatRateMoney(acc.balance_nanos, acc.currency)}</TableCell>
                      <TableCell className="text-right tabular-nums">{acc.unlimited_credit ? uiT('Unlimited', '无限授信') : formatRateMoney(acc.credit_limit_nanos, acc.currency)}</TableCell>
                      <TableCell className="text-right tabular-nums">{acc.unlimited_credit ? uiT('Unlimited', '无限额度') : formatRateMoney(acc.available_nanos, acc.currency)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          <div className="space-y-3">
            <h2 className="text-sm font-medium">{uiT('Recent billing activity', '近期资金流水')}</h2>
            {transactions.length > 0 ? (
              <Table aria-label={uiT('Recent billing activity', '近期资金流水')}>
                <TableHeader>
                  <TableRow>
                    <TableHead>{uiT('Date', '时间')}</TableHead>
                    <TableHead>{uiT('Type', '类型')}</TableHead>
                    <TableHead className="text-right">{uiT('Amount', '金额')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.map(tx => {
                    const amount = BigInt(tx.amount_nanos);
                    const formatted =
                      amount > 0n
                        ? `+${formatRateMoney(tx.amount_nanos, tx.currency)}`
                        : formatRateMoney(tx.amount_nanos, tx.currency);
                    return (
                      <TableRow key={tx.id}>
                        <TableCell className="whitespace-nowrap text-muted-foreground tabular-nums">
                          {formatCustomerDateTime(tx.created_at, locale)}
                        </TableCell>
                        <TableCell>
                          <Badge variant={amount > 0n ? 'secondary' : 'outline'} className="font-normal">
                            {transactionKindLabel(tx.kind, uiT)}
                          </Badge>
                        </TableCell>
                        <TableCell
                          className={`text-right whitespace-nowrap font-medium tabular-nums ${
                            amount > 0n ? 'text-emerald-600 dark:text-emerald-400' : ''
                          }`}
                        >
                          {formatted}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            ) : (
              <div className="rounded-xl bg-muted/45 px-4 py-6 text-sm text-muted-foreground">
                {uiT('No billing activity yet. Top-ups and usage charges will appear here.', '暂无资金流水，充值与调用扣费记录将显示在此处。')}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="pricing" className="space-y-4 pt-2">
          <p className="text-sm text-muted-foreground">
            {uiT(
              'Set customer-specific prices off platform standard prices. Unchanged models use the platform standard price.',
              '为该客户设置专属模型价格；未单独设置的模型自动按平台标准售价计费。',
            )}
          </p>
          <CustomerPricingPanel
            token={token}
            organizationId={currentCompany.organization_id}
            showRefresh={false}
            onChanged={() => void load()}
          />
        </TabsContent>

        <TabsContent value="access" className="space-y-6 pt-2">
          <div className="flex justify-end">
            <Button
              type="button"
              size="sm"
              onClick={event => {
                openerRef.current = event.currentTarget;
                setSetupOpen(true);
              }}
            >
              <IconSettings size={15} aria-hidden="true" />
              <span>{uiT('Set up access', '配置工作空间与账号')}</span>
            </Button>
          </div>

          <div className="space-y-2.5">
            <h2 className="text-sm font-medium">{uiT('Workspaces')}</h2>
            {workspaces.length > 0 ? (
              <Table aria-label={uiT('Customer workspaces', '客户工作空间')}>
                <TableHeader>
                  <TableRow>
                    <TableHead>{uiT('Workspace')}</TableHead>
                    <TableHead>{uiT('URL slug', '路径标识')}</TableHead>
                    <TableHead className="text-right">{uiT('Created', '创建时间')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {workspaces.map(ws => (
                    <TableRow key={ws.id}>
                      <TableCell className="font-medium">
                        <Link
                          className="underline-offset-4 hover:underline"
                          to={`/workspaces/${encodeURIComponent(ws.slug || ws.id)}`}
                        >
                          {ws.name}
                        </Link>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {ws.slug ? `/${ws.slug}` : '—'}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground tabular-nums">
                        {formatCustomerShortDate(ws.created_at, locale)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="rounded-xl bg-muted/45 px-4 py-5 text-sm text-muted-foreground">
                {uiT('No workspaces yet.')}
              </div>
            )}
          </div>

          <div className="space-y-2.5">
            <h2 className="text-sm font-medium">{uiT('Members', '成员')}</h2>
            {members.length > 0 ? (
              <Table aria-label={uiT('Customer members', '客户成员')}>
                <TableHeader>
                  <TableRow>
                    <TableHead>{uiT('Member', '成员')}</TableHead>
                    <TableHead>{uiT('Email', '邮箱')}</TableHead>
                    <TableHead>{uiT('Role')}</TableHead>
                    <TableHead className="hidden sm:table-cell">{uiT('Scope', '范围')}</TableHead>
                    <TableHead className="hidden md:table-cell text-right">{uiT('Joined', '加入时间')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.map(member => (
                    <TableRow key={member.id}>
                      <TableCell className="font-medium [overflow-wrap:anywhere]">{member.name}</TableCell>
                      <TableCell className="text-muted-foreground [overflow-wrap:anywhere]">{member.email ?? '—'}</TableCell>
                      <TableCell>
                        <Badge variant={member.role === 'owner' && !member.project_id ? 'default' : 'outline'}>
                          {memberRoleLabel(member.role, uiT)}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-muted-foreground">
                        {member.project_id
                          ? workspaceNameById.get(member.project_id) ?? uiT('Workspace')
                          : uiT('All workspaces')}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-right text-muted-foreground tabular-nums">
                        {formatCustomerShortDate(member.created_at, locale)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="rounded-xl bg-muted/45 px-4 py-5 text-sm text-muted-foreground">
                {uiT('No members yet.', '暂无成员。')}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {setupOpen && (
        <CustomerSetup
          onRestoreFocus={() => openerRef.current?.focus()}
          company={{ id: currentCompany.organization_id, name: companyName }}
          token={token}
          client={client}
          onClose={() => {
            setSetupOpen(false);
            void load();
          }}
          onWorkspaceCreated={() => {
            onWorkspaceCreated();
            void load();
          }}
        />
      )}
      {editor?.kind === 'units' && (
        <CompanyBrandedUnitsDialog
          token={token}
          organizationId={currentCompany.organization_id}
          organizationName={companyName}
          returnFocusTo={openerRef.current}
          onClose={() => { setEditor(null); void load(); }}
          onChanged={msg => { setNotice(msg); void load(); }}
        />
      )}
      {editor?.kind === 'topup' && (
        <TopupEditor
          token={token}
          editor={editor}
          onClose={() => setEditor(null)}
          onSaved={() => { setEditor(null); setNotice('Customer balance topped up.'); void load(); }}
        />
      )}
      {editor?.kind === 'grant' && (
        <GrantEditor
          token={token}
          editor={editor}
          onClose={() => { setEditor(null); void load(); }}
          onIssued={() => { setNotice('Noncash grant issuance confirmed. This is not a cash receipt.'); void load(); }}
        />
      )}
      {editor?.kind === 'history' && (
        <GrantHistory
          token={token}
          editor={editor}
          onClose={() => { setEditor(null); void load(); }}
          onOpen={prepared => setEditor({ ...editor, kind: 'grant', prepared })}
          onCorrect={gift => setEditor({ ...editor, kind: 'correction', gift })}
        />
      )}
      {editor?.kind === 'correction' && editor.gift && (
        <GiftCorrectionEditor
          token={token}
          editor={{ ...editor, gift: editor.gift }}
          onClose={() => { setEditor({ ...editor, kind: 'history' }); void load(); }}
          onCorrected={() => { setNotice('Noncash gift correction confirmed. No cash refund was recorded.'); void load(); }}
        />
      )}
      {editor?.kind === 'credit' && (
        <CreditEditor
          token={token}
          editor={editor}
          onClose={() => setEditor(null)}
          onSaved={() => { setEditor(null); setNotice('Credit policy saved.'); void load(); }}
        />
      )}
    </section>
  );
}
