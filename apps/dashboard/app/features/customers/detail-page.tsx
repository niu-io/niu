import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { IconArrowLeft, IconBuilding, IconCreditCard, IconDots, IconPlus, IconRefresh, IconSettings, IconUsers } from '@tabler/icons-react';
import { NiuAdminClient, type CustomerBalance, type Workspace } from '@niu-io/sdk/admin';
import PageHeader from '@/components/PageHeader';
import { TableSkeleton } from '@/components/PageSkeletons';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { listOperators, type Operator } from '@/features/operators/api';
import { ProviderRequestError, request } from '@/features/providers/api';
import { authenticatedFetch as fetch } from '@/lib/authenticated-fetch';
import { money } from '@/lib/money';
import { canManagePlatform, useDashboardContext } from '@/shell/dashboard-context';
import { usePlatformCurrency } from '@/shell/platform-currency';
import { translateUI, useLocale as useUILocale } from '@/shell/ui-locale';
import { workspacePathSegment } from '@/shell/workspace-route';
import { CustomerPricingPanel } from './customer-pricing';
import { GiftCorrectionEditor } from './gift-corrections';
import { GrantEditor, GrantHistory } from './grants';
import { CreditEditor, CreditsSummaryCell, type Company, type Editor } from './page';
import CustomerSetup from './setup';
import { TopupEditor } from './topups';
import { CompanyBrandedUnitsDialog } from './unit-accounts';

type DetailTab = 'account' | 'pricing' | 'access';

async function loadCustomerCompany(token: string, customerId: string, signal?: AbortSignal): Promise<Company | null> {
  try {
    const response = await request<{ data: Company }>(
      token,
      `/api/v1/admin/customers/${encodeURIComponent(customerId)}`,
      'GET',
      undefined,
      signal,
    );
    return response.data ?? null;
  } catch (failure) {
    if (failure instanceof ProviderRequestError && failure.status === 404) {
      return null;
    }
    throw failure;
  }
}

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
  const { t: uiT } = useUILocale();
  const { currency: platformCurrency } = usePlatformCurrency();
  const [search, setSearch] = useSearchParams();
  const rawTab = search.get('tab');
  const activeTab: DetailTab = rawTab === 'pricing' || rawTab === 'access' ? rawTab : 'account';

  function selectTab(nextTab: DetailTab) {
    const next = new URLSearchParams(search);
    if (nextTab === 'account') next.delete('tab');
    else next.set('tab', nextTab);
    setSearch(next, { replace: true });
  }

  const client = useMemo(
    () => new NiuAdminClient({ fetch, adminToken: token, baseURL: new URL('/api/v1', location.origin).href }),
    [token],
  );

  const [company, setCompany] = useState<Company | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [operators, setOperators] = useState<Operator[]>([]);
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
      const [found, workspaceResult, operatorResult] = await Promise.all([
        loadCustomerCompany(token, customerId, controller.signal),
        client.listWorkspaces({ signal: controller.signal }).catch(() => ({ data: [] as Workspace[] })),
        listOperators(token, customerId, controller.signal).catch(() => ({ data: [] as Operator[] })),
      ]);
      if (controller.signal.aborted) return;
      setCompany(found);
      setWorkspaces(workspaceResult.data.filter(ws => ws.organization_id === customerId));
      setOperators(operatorResult.data.filter(op => !op.revoked));
    } catch (failure) {
      if (!controller.signal.aborted) {
        setError(failure instanceof Error ? failure.message : translateUI('Could not load customer details.'));
      }
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [client, customerId, token]);

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
  const currentCompany: Company = company;

  const companyName = currentCompany.organization_name || uiT('Unnamed company');
  const primaryAccount: CustomerBalance | null =
    currentCompany.accounts.find(acc => acc.currency === platformCurrency) ?? currentCompany.accounts[0] ?? null;
  const canTransactPrimary = Boolean(platformCurrency && (!primaryAccount || primaryAccount.currency === platformCurrency));
  const owners = operators.filter(op => op.role === 'owner' && op.project_id === null);

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
          <Button type="button" variant="outline" size="sm" disabled={loading} onClick={() => void load()}>
            <IconRefresh size={15} aria-hidden="true" />
            <span>{uiT('Refresh')}</span>
          </Button>
        }
      />

      {notice && <p role="status" className="text-sm text-foreground">{notice}</p>}
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
            <TabsTrigger value="account">{uiT('Account & balance', '账户与额度')}</TabsTrigger>
            <TabsTrigger value="pricing">{uiT('Pricing & discounts', '专属折扣')}</TabsTrigger>
            <TabsTrigger value="access">{uiT('Workspaces & access', '工作空间与成员')}</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="account" className="space-y-5 pt-2">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              disabled={!canTransactPrimary}
              onClick={event => openEditorFrom('topup', primaryAccount, event.currentTarget)}
            >
              <IconPlus size={15} aria-hidden="true" />
              <span>{uiT('Top up balance')}</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!canTransactPrimary}
              onClick={event => openEditorFrom('credit', primaryAccount, event.currentTarget)}
            >
              <IconCreditCard size={15} aria-hidden="true" />
              <span>{uiT('Set credit')}</span>
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
              <DropdownMenuContent align="start">
                <DropdownMenuItem
                  disabled={!canTransactPrimary}
                  onSelect={() => openEditorFrom('grant', primaryAccount, openerRef.current)}
                >
                  {uiT('Grant noncash balance')}
                </DropdownMenuItem>
                {primaryAccount && (
                  <DropdownMenuItem onSelect={() => openEditorFrom('history', primaryAccount, openerRef.current)}>
                    {uiT('Noncash grants')}
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => openEditorFrom('units', primaryAccount, openerRef.current)}>
                  {uiT('Manage Branded Credits')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {primaryAccount ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl bg-muted/45 p-4 space-y-1">
                <p className="text-xs text-muted-foreground">{uiT('Posted balance')}</p>
                <p className="text-xl font-semibold tabular-nums">{money(primaryAccount.balance_nanos, primaryAccount.currency)}</p>
              </div>
              <div className="rounded-xl bg-muted/45 p-4 space-y-1">
                <p className="text-xs text-muted-foreground">{uiT('Approved credit')}</p>
                <p className="text-xl font-semibold tabular-nums">{money(primaryAccount.credit_limit_nanos, primaryAccount.currency)}</p>
              </div>
              <div className="rounded-xl bg-muted/45 p-4 space-y-1">
                <p className="text-xs text-muted-foreground">{uiT('Outstanding liability')}</p>
                <p className="text-xl font-semibold tabular-nums">
                  {primaryAccount.outstanding_nanos === null || primaryAccount.outstanding_nanos === undefined
                    ? uiT('Unavailable')
                    : money(primaryAccount.outstanding_nanos, primaryAccount.currency)}
                </p>
              </div>
              <div className="rounded-xl bg-muted/45 p-4 space-y-1">
                <p className="text-xs text-muted-foreground">{uiT('Available capacity')}</p>
                <p className="text-xl font-semibold tabular-nums">{money(primaryAccount.available_nanos, primaryAccount.currency)}</p>
              </div>
            </div>
          ) : (
            <div className="rounded-xl bg-muted/45 p-4 text-sm text-muted-foreground">
              {uiT('No currency account yet. Top up balance or set approved credit to initialize the account.', '暂无币种账户。充值或设置信用额度后将自动初始化账户。')}
            </div>
          )}

          {currentCompany.credits && (
            <div className="rounded-xl bg-muted/45 p-4 flex flex-wrap items-center justify-between gap-3">
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

          {currentCompany.accounts.length > 1 && (
            <div className="space-y-2">
              <h2 className="text-sm font-medium">{uiT('All currency accounts', '全部币种账户')}</h2>
              <Table aria-label={uiT('Customer currency accounts', '客户币种账户')}>
                <TableHeader>
                  <TableRow>
                    <TableHead>{uiT('Currency')}</TableHead>
                    <TableHead className="text-right">{uiT('Posted balance')}</TableHead>
                    <TableHead className="text-right">{uiT('Approved credit')}</TableHead>
                    <TableHead className="text-right">{uiT('Available capacity')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {currentCompany.accounts.map(acc => (
                    <TableRow key={acc.currency}>
                      <TableCell>{acc.currency}</TableCell>
                      <TableCell className="text-right tabular-nums">{money(acc.balance_nanos, acc.currency)}</TableCell>
                      <TableCell className="text-right tabular-nums">{money(acc.credit_limit_nanos, acc.currency)}</TableCell>
                      <TableCell className="text-right tabular-nums">{money(acc.available_nanos, acc.currency)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="pricing" className="space-y-4 pt-2">
          <p className="text-sm text-muted-foreground">
            {uiT(
              'Set customer-specific discounts off platform standard prices. Undiscounted models automatically use the platform standard price.',
              '基于平台标准售价为该客户设置专属折扣；未单独设置的模型自动按平台标准售价计费。',
            )}
          </p>
          <CustomerPricingPanel token={token} organizationId={currentCompany.organization_id} showRefresh={false} />
        </TabsContent>

        <TabsContent value="access" className="space-y-5 pt-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {uiT('Workspaces within this company share its funds. Manage workspaces, company owners, and sign-in passwords.', '该公司下的所有工作空间共享同一资金账户。管理工作空间、公司负责人及登录密码。')}
            </p>
            <Button
              type="button"
              onClick={event => {
                openerRef.current = event.currentTarget;
                setSetupOpen(true);
              }}
            >
              <IconSettings size={15} aria-hidden="true" />
              <span>{uiT('Set up access', '配置工作空间与账号')}</span>
            </Button>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl bg-muted/45 p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-medium">{uiT('Workspaces')}</h2>
                <Badge variant="secondary">{workspaces.length}</Badge>
              </div>
              {workspaces.length ? (
                <ul className="space-y-2 text-sm">
                  {workspaces.map(ws => (
                    <li key={ws.id} className="flex items-center justify-between gap-2">
                      <Link className="font-medium underline underline-offset-4" to={`/workspaces/${workspacePathSegment(ws, workspaces)}`}>
                        {ws.name}
                      </Link>
                      {ws.slug && <span className="text-xs font-mono text-muted-foreground">/{ws.slug}</span>}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">{uiT('No workspaces yet.')}</p>
              )}
            </div>

            <div className="rounded-xl bg-muted/45 p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-medium flex items-center gap-1.5">
                  <IconUsers size={15} aria-hidden="true" />
                  <span>{uiT('Members & owners', '成员与负责人')}</span>
                </h2>
                <Badge variant="secondary">{operators.length}</Badge>
              </div>
              {operators.length ? (
                <ul className="space-y-2 text-sm">
                  {operators.map(op => (
                    <li key={op.id} className="flex items-center justify-between gap-2">
                      <span className="font-medium [overflow-wrap:anywhere]">{op.name}</span>
                      <Badge variant={owners.some(o => o.id === op.id) ? 'default' : 'outline'}>
                        {op.role === 'owner' ? uiT('Owner', '所有者') : op.role === 'admin' ? uiT('Administrator', '管理员') : uiT('Viewer', '只读成员')}
                      </Badge>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">{uiT('Owner not set')}</p>
              )}
            </div>
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
