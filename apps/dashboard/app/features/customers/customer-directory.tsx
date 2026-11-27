import { authenticatedFetch as fetch } from '@/lib/authenticated-fetch';
import { Empty, EmptyContent, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from '@/components/ui/empty';
import { useLocale as useUILocale } from '@/shell/ui-locale';
import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { IconBuilding, IconChevronDown, IconDots, IconPlus, IconRefresh, IconSearch } from '@tabler/icons-react';
import { usePlatformCurrency } from '@/shell/platform-currency';
import PageHeader from '@/components/PageHeader';
import { TableSkeleton } from '@/components/PageSkeletons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RegistrationRequestsQueue } from '@/features/platform-settings/registration-review';
import { cachedGet, markCachedStale, peekCachedGet, request } from '@/features/providers/api';
import { invalidateQueries } from '@/lib/query-cache';
import { formatRateMoney } from '@/lib/money';
import { NiuAdminClient, type CompanyMetadata, type CustomerBalance, type PlatformRegistrationQueuePage } from '@niu-io/sdk/admin';
import CustomerSetup from './setup';
import { GrantEditor, GrantHistory } from './grants';
import { GiftCorrectionEditor } from './gift-corrections';
import { TopupEditor } from './topups';
import { CompanyBrandedUnitsDialog } from './unit-accounts';
import { CreditEditor, CreditsSummaryCell, customerDisplayName, isPersonalCustomer, type AccountPage, type Company, type Editor } from './customer-shared';

import { CreateCompany } from './create-company';
import { CUSTOMER_ACCOUNTS_PATH } from './customer-shared';

function primaryCustomerAccount(company: Company, platformCurrency: string): CustomerBalance | null {
  return company.accounts.find(acc => acc.currency === platformCurrency) ?? company.accounts[0] ?? null;
}

function shouldIgnoreRowNavigation(event: MouseEvent<HTMLTableRowElement>): boolean {
  if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return true;
  if (typeof window !== 'undefined' && window.getSelection()?.toString()) return true;
  const target = event.target as HTMLElement | null;
  return Boolean(target?.closest('a, button, input, [role="menuitem"], [role="menu"], [data-slot="dropdown-menu-trigger"]'));
}

/**
 * Customer directory for onboarding, pricing, and balance administration.
 * All directory columns come from the single platform customer snapshot endpoint.
 */
export function Customers({
  token,
  canSetup,
  onWorkspaceCreated,
}: {
  token: string;
  canSetup: boolean;
  onWorkspaceCreated: () => void;
}) {
  const { t: uiT, format: uiF } = useUILocale();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') === 'registrations' ? 'registrations' : 'customers';

  function selectTab(nextTab: 'customers' | 'registrations') {
    const next = new URLSearchParams(searchParams);
    if (nextTab === 'registrations') next.set('tab', 'registrations');
    else next.delete('tab');
    setSearchParams(next, { replace: true });
  }

  const { currency: platformCurrency } = usePlatformCurrency();
  const client = useMemo(
    () => new NiuAdminClient({ fetch, adminToken: token, baseURL: new URL('/api/v1', location.origin).href }),
    [token],
  );
  const initialPage = token ? peekCachedGet<AccountPage>(token, CUSTOMER_ACCOUNTS_PATH) : undefined;
  const initialValid = initialPage && Array.isArray(initialPage.data) ? initialPage : undefined;
  const [companies, setCompanies] = useState<Company[]>(() => initialValid?.data ?? []);
  const [cursor, setCursor] = useState<string | null>(() => initialValid?.next_after ?? null);
  const [loading, setLoading] = useState(() => Boolean(token && !initialValid));
  const [error, setError] = useState('');
  const [failedCursor, setFailedCursor] = useState<string>();
  const [notice, setNotice] = useState('');
  const [create, setCreate] = useState(false);
  const [selected, setSelected] = useState<CompanyMetadata | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [query, setQuery] = useState('');
  const [kindFilter, setKindFilter] = useState<'all' | 'personal' | 'organization'>('all');
  const [pendingRegistrations, setPendingRegistrations] = useState(0);
  const [refreshTick, setRefreshTick] = useState(0);
  const active = useRef<AbortController | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const searchTriggerRef = useRef<HTMLButtonElement>(null);
  const filterInitializedRef = useRef(false);

  async function load(
    after?: string,
    force = true,
    searchQuery?: string,
    accountKind?: 'all' | 'personal' | 'organization',
  ) {
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    const trimmedQuery = (searchQuery ?? query).trim();
    const effectiveKind = accountKind ?? kindFilter;
    const hasFilter = Boolean(trimmedQuery) || effectiveKind !== 'all';
    if (after || force || !initialValid || hasFilter) setLoading(true);
    setError('');
    setFailedCursor(undefined);
    const params = new URLSearchParams({ limit: '50' });
    if (after) params.set('after', after);
    if (trimmedQuery) params.set('q', trimmedQuery);
    if (effectiveKind !== 'all') params.set('kind', effectiveKind);
    const path = `/api/v1/admin/customers?${params.toString()}`;
    try {
      const page = after || hasFilter
        ? await request<AccountPage>(token, path, 'GET', undefined, controller.signal)
        : await cachedGet<AccountPage>(token, path, { signal: controller.signal, force });
      if (controller.signal.aborted) return;
      if (!Array.isArray(page.data) || page.next_after === after) {
        throw new Error('Account page did not advance. Refresh accounts.');
      }
      setCompanies(current =>
        after
          ? [...current, ...page.data.filter(row => !current.some(saved => saved.organization_id === row.organization_id))]
          : page.data,
      );
      setCursor(page.next_after);
    } catch (reason) {
      if (!after && !hasFilter) markCachedStale(token, CUSTOMER_ACCOUNTS_PATH);
      if (!controller.signal.aborted) {
        setError(reason instanceof Error ? reason.message : 'Customer balances unavailable.');
        setFailedCursor(after);
      }
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }

  useEffect(() => {
    void load(undefined, false, '', 'all');
    return () => active.current?.abort();
  }, [token]);

  useEffect(() => {
    if (!filterInitializedRef.current) {
      filterInitializedRef.current = true;
      return;
    }
    const delay = query.trim() ? 220 : 0;
    const timer = window.setTimeout(() => {
      void load(undefined, true, query, kindFilter);
    }, delay);
    return () => window.clearTimeout(timer);
  }, [query, kindFilter]);

  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    void request<PlatformRegistrationQueuePage>(
      token,
      '/api/v1/admin/registrations?status=pending&limit=1',
      'GET',
      undefined,
      controller.signal,
    )
      .then(page => {
        if (!controller.signal.aborted) setPendingRegistrations(page.counts.pending);
      })
      .catch(() => {
        // Ignore badge prefetch errors; opening Registrations surfaces failures.
      });
    return () => controller.abort();
  }, [token, refreshTick]);

  const filteredCompanies = useMemo(() => {
    const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    return companies.filter(company => {
      if (kindFilter === 'personal' && !isPersonalCustomer(company)) return false;
      if (kindFilter === 'organization' && isPersonalCustomer(company)) return false;
      if (!terms.length) return true;
      const haystack = [
        customerDisplayName(company, uiT),
        company.organization_name,
        company.owner?.name ?? '',
        company.owner?.email ?? '',
      ]
        .join(' ')
        .toLocaleLowerCase();
      return terms.every(term => haystack.includes(term));
    });
  }, [companies, kindFilter, query, uiT]);

  function refresh() {
    setRefreshTick(value => value + 1);
    void load(undefined, true, query, kindFilter);
  }

  function openSetup(company: Company) {
    setNotice('');
    setSelected({ id: company.organization_id, name: customerDisplayName(company, uiT) });
  }

  function openEditor(next: Editor) {
    setNotice('');
    setEditor(next);
  }

  function companyLabel(company: Company) {
    return customerDisplayName(company, uiT);
  }

  function renderOwnerSubtitle(company: Company) {
    if (company.owner === undefined) return null;
    if (!company.owner) {
      return <p className="mt-0.5 text-xs text-muted-foreground">{uiT("Owner not set")}</p>;
    }
    const label = companyLabel(company);
    const sameName = company.owner.name.trim().toLowerCase() === label.trim().toLowerCase();
    const text = company.owner.email
      ? sameName
        ? company.owner.email
        : `${company.owner.name} · ${company.owner.email}`
      : sameName
        ? ''
        : company.owner.name;
    if (!text) return null;
    return <p className="mt-0.5 text-xs text-muted-foreground [overflow-wrap:anywhere]">{text}</p>;
  }

  function renderBalanceCell(company: Company, account: CustomerBalance | null) {
    if (!account) {
      if (company.credits) {
        return <div className="flex justify-end"><CreditsSummaryCell credits={company.credits} /></div>;
      }
      return <span className="text-sm text-muted-foreground">{uiT("No balance yet", "暂无余额")}</span>;
    }
    const balanceNanos = BigInt(account.balance_nanos);
    const creditNanos = BigInt(account.credit_limit_nanos);
    const unlimited = Boolean(account.unlimited_credit);
    const extraCurrencies = Math.max(0, company.accounts.length - 1);
    return (
      <div className="space-y-0.5">
        <p className={`whitespace-nowrap font-medium tabular-nums ${!unlimited && balanceNanos < 0n ? 'text-destructive' : ''}`}>
          {formatRateMoney(account.balance_nanos, account.currency)}
        </p>
        {unlimited ? (
          <p className="whitespace-nowrap text-xs text-muted-foreground">
            {uiT("Unlimited credit", "无限授信")}
          </p>
        ) : creditNanos > 0n ? (
          <p className="whitespace-nowrap text-xs text-muted-foreground tabular-nums">
            {uiF("Credit {0}", [formatRateMoney(account.credit_limit_nanos, account.currency)])}
          </p>
        ) : null}
        {extraCurrencies > 0 && (
          <p className="whitespace-nowrap text-xs text-muted-foreground">
            {extraCurrencies === 1 ? uiT("+1 currency", "+1 种币种") : uiF("+{0} currencies", [extraCurrencies])}
          </p>
        )}
        {company.credits && (
          <div className="flex justify-end text-xs text-muted-foreground">
            <CreditsSummaryCell credits={company.credits} />
          </div>
        )}
      </div>
    );
  }

  function renderPricingCell(company: Company) {
    const customCount = company.custom_price_count ?? 0;
    if (customCount > 0) {
      return (
        <Badge variant="secondary" className="font-normal">
          {customCount === 1 ? uiT("1 custom price", "1 个专属价") : uiF("{0} custom prices", [customCount])}
        </Badge>
      );
    }
    return <span className="text-sm text-muted-foreground">{uiT("Standard", "标准价")}</span>;
  }

  function renderWorkspacesCell(company: Company) {
    if (company.workspace_count === undefined) {
      return <span className="text-sm text-muted-foreground">—</span>;
    }
    const wsLabel =
      company.workspace_count === 0
        ? uiT("No workspaces")
        : company.workspace_count === 1
          ? uiT("1 workspace")
          : uiF("{0} workspaces", [company.workspace_count]);
    const memberCount = company.member_count ?? 0;
    if (memberCount <= 1) {
      return <span className="text-sm text-muted-foreground">{wsLabel}</span>;
    }
    const memberLabel = uiF("{0} members", [memberCount]);
    return (
      <span className="text-sm text-muted-foreground">
        {wsLabel} · {memberLabel}
      </span>
    );
  }

  function rowActions(company: Company, account: CustomerBalance | null) {
    const detailHref = `/admin/customers/${encodeURIComponent(company.slug || company.organization_id)}`;
    const canTransact = Boolean(platformCurrency && (!account || account.currency === platformCurrency));
    return (
      <div className="inline-flex items-center justify-end gap-1">
        <Button asChild variant="outline" size="sm" className="hidden sm:inline-flex">
          <Link to={detailHref}>{uiT("Manage", "管理")}</Link>
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              disabled={loading || !!error}
              onPointerDown={event => { opener.current = event.currentTarget; }}
              onClick={event => { opener.current = event.currentTarget; }}
              aria-label={uiF("Actions for {0}", [companyLabel(company)])}
            >
              <IconDots size={16} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild className="sm:hidden">
              <Link to={detailHref}>{uiT("Manage", "管理")}</Link>
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!canTransact} onSelect={() => openEditor({ kind: 'topup', company, account })}>
              {uiT("Top up balance")}
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!canTransact} onSelect={() => openEditor({ kind: 'credit', company, account })}>
              {uiT("Set credit")}
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to={`${detailHref}?tab=pricing`}>{uiT("Customer pricing", "专属价格")}</Link>
            </DropdownMenuItem>
            {canSetup && (
              <DropdownMenuItem onSelect={() => openSetup(company)}>
                {uiT("Set up")}
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={!canTransact} onSelect={() => openEditor({ kind: 'grant', company, account })}>
              {uiT("Grant noncash balance")}
            </DropdownMenuItem>
            {account && (
              <DropdownMenuItem onSelect={() => openEditor({ kind: 'history', company, account })}>
                {uiT("Noncash grant history")}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onSelect={() => openEditor({ kind: 'units', company, account })}>
              {uiT("Manage Branded Credits")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  }

  return (
    <section className="empty-region min-w-0 space-y-5" aria-label={uiT("Customers")}>
      <Tabs value={activeTab} onValueChange={value => selectTab(value === 'registrations' ? 'registrations' : 'customers')}>
        <PageHeader
          title={uiT("Customers")}
          tabs={
            <TabsList variant="line" aria-label={uiT("Customer sections", "客户管理分区")}>
              <TabsTrigger value="customers">{uiT("Customers", "客户列表")}</TabsTrigger>
              <TabsTrigger value="registrations" className="gap-1.5">
                <span>{uiT("Registrations", "注册审批")}</span>
                {pendingRegistrations > 0 && (
                  <Badge variant="default" className="px-1.5 py-0 text-[11px]">
                    {pendingRegistrations}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>
          }
          action={
            activeTab === 'customers' ? (
              <>
                {(companies.length > 0 || query.trim().length > 0 || kindFilter !== 'all') && (
                  <>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          aria-label={uiT("Filter customer type", "筛选客户类型")}
                        >
                          <span>
                            {kindFilter === 'personal'
                              ? uiT("Personal", "个人")
                              : kindFilter === 'organization'
                                ? uiT("Organization", "组织")
                                : uiT("All", "全部")}
                          </span>
                          <IconChevronDown size={15} className="text-muted-foreground" aria-hidden="true" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuRadioGroup
                          value={kindFilter}
                          onValueChange={value => setKindFilter(value as 'all' | 'personal' | 'organization')}
                        >
                          <DropdownMenuRadioItem value="all">{uiT("All", "全部")}</DropdownMenuRadioItem>
                          <DropdownMenuRadioItem value="personal">{uiT("Personal", "个人")}</DropdownMenuRadioItem>
                          <DropdownMenuRadioItem value="organization">{uiT("Organization", "组织")}</DropdownMenuRadioItem>
                        </DropdownMenuRadioGroup>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          ref={searchTriggerRef}
                          type="button"
                          variant="ghost"
                          size={query.trim() ? "sm" : "icon"}
                          aria-label={[uiT("Search customers", "搜索客户"), query.trim()].filter(Boolean).join(" · ")}
                          title={query.trim() || uiT("Search customers", "搜索客户")}
                          className={query ? "text-primary bg-accent" : undefined}
                        >
                          <IconSearch size={17} />
                          {query.trim() && <span className="max-w-20 truncate sm:max-w-36">{query.trim()}</span>}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent align="end" className="w-80 max-w-[calc(100vw-2rem)] space-y-2">
                        <Input
                          autoFocus
                          type="search"
                          aria-label={uiT("Search customers", "搜索客户")}
                          placeholder={uiT("Search by company, owner, or email…", "按名称、负责人或邮箱搜索…")}
                          value={query}
                          onChange={event => setQuery(event.target.value)}
                        />
                        {query && (
                          <Button type="button" variant="ghost" size="sm" onClick={() => setQuery('')}>
                            {uiT("Reset search")}
                          </Button>
                        )}
                      </PopoverContent>
                    </Popover>
                  </>
                )}
                <Button variant="ghost" size="icon-sm" disabled={loading} aria-label={uiT("Refresh customers")} title={uiT("Refresh customers")} onClick={refresh}>
                  <IconRefresh size={16} className={loading ? 'animate-spin' : undefined} aria-hidden="true" />
                </Button>
                {canSetup && (
                  <Button aria-label={uiT("New customer")} onClick={event => { opener.current = event.currentTarget; setCreate(true); }}>
                    <IconPlus size={16} />
                    <span className="hidden sm:inline">{uiT("New customer")}</span>
                  </Button>
                )}
              </>
            ) : undefined
          }
        />

        <TabsContent value="customers" className="space-y-4">
          {pendingRegistrations > 0 && (
            <Alert>
              <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
                <span>
                  {uiT("Pending Limited Preview account registrations:", "待审批的有限预览账号申请：")}{" "}
                  <strong>{pendingRegistrations}</strong>
                </span>
                <Button type="button" variant="outline" size="sm" onClick={() => selectTab('registrations')}>
                  {uiT("Review requests", "前往审批")}
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {notice && <p role="status" className="text-sm text-foreground">{uiT(notice)}</p>}

          {error && (
            <Alert variant="destructive">
              <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
                <span>{uiT(error)}</span>
                <Button variant="outline" size="sm" disabled={loading} onClick={() => void load(failedCursor)}>
                  {uiT("Retry")}
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {loading && !companies.length && <TableSkeleton columns={5} rows={5} label={uiT("Loading customer balances…")} />}

          {!loading && !error && !companies.length && !query.trim() && kindFilter === 'all' && (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <IconBuilding size={20} aria-hidden="true" />
                </EmptyMedia>
                <EmptyTitle>{uiT("No customers yet")}</EmptyTitle>
                <EmptyDescription>
                  {uiT("No customers yet. Create a company to start setting up independent customer access.")}
                </EmptyDescription>
              </EmptyHeader>
              {canSetup && (
                <EmptyContent>
                  <Button onClick={event => { opener.current = event.currentTarget; setCreate(true); }}>
                    <IconPlus size={16} aria-hidden="true" />
                    <span>{uiT("New customer")}</span>
                  </Button>
                </EmptyContent>
              )}
            </Empty>
          )}

          {!loading && !error && (companies.length > 0 || query.trim().length > 0 || kindFilter !== 'all') && filteredCompanies.length === 0 && (
            <Empty role="status">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <IconSearch size={20} aria-hidden="true" />
                </EmptyMedia>
                <EmptyTitle>{uiT("No matching customers", "没有匹配的客户")}</EmptyTitle>
              </EmptyHeader>
              <EmptyContent>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setQuery('');
                    setKindFilter('all');
                    searchTriggerRef.current?.focus();
                  }}
                >
                  {kindFilter === "all" ? uiT("Clear search") : uiT("Clear filters")}
                </Button>
              </EmptyContent>
            </Empty>
          )}

          {filteredCompanies.length > 0 && (
            <Table aria-label={uiT("Customer companies")}>
              <TableHeader>
                <TableRow>
                  <TableHead>{uiT("Customer", "客户")}</TableHead>
                  <TableHead className="text-right">{uiT("Balance", "余额")}</TableHead>
                  <TableHead className="hidden sm:table-cell">{uiT("Pricing", "价格方案")}</TableHead>
                  <TableHead className="hidden md:table-cell">{uiT("Workspaces")}</TableHead>
                  <TableHead className="text-right"><span className="sr-only">{uiT("Actions")}</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCompanies.map(company => {
                  const account = primaryCustomerAccount(company, platformCurrency);
                  const detailHref = `/admin/customers/${encodeURIComponent(company.slug || company.organization_id)}`;
                  const personalAccount = isPersonalCustomer(company);
                  return (
                    <TableRow
                      key={company.organization_id}
                      className="cursor-pointer"
                      onClick={event => {
                        if (shouldIgnoreRowNavigation(event)) return;
                        void navigate(detailHref);
                      }}
                    >
                      <TableCell className="whitespace-normal sm:min-w-44">
                        <div className="flex flex-wrap items-center gap-1.5 [overflow-wrap:anywhere]">
                          <Link className="font-medium text-foreground hover:underline underline-offset-4" to={detailHref}>
                            {companyLabel(company)}
                          </Link>
                          <Badge variant="outline" className="px-1.5 py-0 text-[11px] font-normal text-muted-foreground">
                            {personalAccount ? uiT("Personal", "个人") : uiT("Organization", "组织")}
                          </Badge>
                        </div>
                        {renderOwnerSubtitle(company)}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap align-middle">
                        {renderBalanceCell(company, account)}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell whitespace-nowrap align-middle">
                        {renderPricingCell(company)}
                      </TableCell>
                      <TableCell className="hidden md:table-cell whitespace-nowrap align-middle">
                        {renderWorkspacesCell(company)}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap align-middle">
                        {rowActions(company, account)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}

          {cursor && (
            <Button variant="outline" disabled={loading} onClick={() => void load(cursor)}>
              {loading ? uiT("Loading…") : uiT("More companies")}
            </Button>
          )}
        </TabsContent>

        <TabsContent value="registrations" className="pt-2">
          <RegistrationRequestsQueue
            token={token}
            showPolicySection={false}
            onApproved={() => {
              onWorkspaceCreated();
              refresh();
            }}
          />
        </TabsContent>
      </Tabs>

      <CreateCompany
        onRestoreFocus={() => opener.current?.focus()}
        open={create}
        onOpenChange={setCreate}
        client={client}
        token={token}
        existingCompanies={companies}
        onCreated={(company, options) => {
          invalidateQueries(CUSTOMER_ACCOUNTS_PATH);
          if (options?.joinedExisting) {
            void load(undefined, true, query, kindFilter);
            return;
          }
          setCompanies(old => [
            {
              organization_id: company.id,
              organization_name: company.name,
              account_kind: options?.accountKind ?? 'organization',
              owner: options?.ownerEmail ? { name: options.ownerName || company.name, email: options.ownerEmail } : null,
              workspace_count: options?.workspaceCreated ? 1 : 0,
              member_count: options?.ownerEmail ? 1 : 0,
              custom_price_count: 0,
              accounts: [],
              credits: null,
            },
            ...old.filter(row => row.organization_id !== company.id),
          ]);
          if (options?.completedSetup) {
            if (options.workspaceCreated) onWorkspaceCreated();
            void load(undefined, true, query, kindFilter);
            return;
          }
          setCreate(false);
          setSelected(company);
          void load(undefined, true, query, kindFilter);
        }}
      />
      {selected && (
        <CustomerSetup
          onRestoreFocus={() => opener.current?.focus()}
          key={selected.id}
          company={selected}
          token={token}
          client={client}
          onClose={() => {
            setSelected(null);
            setRefreshTick(value => value + 1);
            void load();
          }}
          onWorkspaceCreated={() => {
            onWorkspaceCreated();
            setRefreshTick(value => value + 1);
            void load();
          }}
        />
      )}
      {editor?.kind === 'units' && (
        <CompanyBrandedUnitsDialog
          token={token}
          organizationId={editor.company.organization_id}
          organizationName={companyLabel(editor.company)}
          returnFocusTo={opener.current}
          onClose={() => {
            setEditor(null);
            void load();
          }}
          onChanged={msg => {
            setNotice(msg);
            void load();
          }}
        />
      )}
      {editor?.kind === 'topup' && (
        <TopupEditor
          token={token}
          editor={editor}
          onClose={() => setEditor(null)}
          onSaved={() => {
            setEditor(null);
            setNotice('Customer balance topped up.');
            void load();
          }}
        />
      )}
      {editor?.kind === 'grant' && (
        <GrantEditor
          token={token}
          editor={editor}
          onClose={() => {
            setEditor(null);
            void load();
          }}
          onIssued={() => {
            setNotice('Noncash grant issuance confirmed. This is not a cash receipt.');
            void load();
          }}
        />
      )}
      {editor?.kind === 'history' && (
        <GrantHistory
          token={token}
          editor={editor}
          onClose={() => {
            setEditor(null);
            void load();
          }}
          onOpen={prepared => setEditor({ ...editor, kind: 'grant', prepared })}
          onCorrect={gift => setEditor({ ...editor, kind: 'correction', gift })}
        />
      )}
      {editor?.kind === 'correction' && editor.gift && (
        <GiftCorrectionEditor
          token={token}
          editor={{ ...editor, gift: editor.gift }}
          onClose={() => {
            setEditor({ ...editor, kind: 'history' });
            void load();
          }}
          onCorrected={() => {
            setNotice('Noncash gift correction confirmed. No cash refund was recorded.');
            void load();
          }}
        />
      )}
      {editor?.kind === 'credit' && (
        <CreditEditor
          token={token}
          editor={editor}
          onClose={() => setEditor(null)}
          onSaved={() => {
            setEditor(null);
            setNotice('Credit policy saved.');
            void load();
          }}
        />
      )}
    </section>
  );
}
