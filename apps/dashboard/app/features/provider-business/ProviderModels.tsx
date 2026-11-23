import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { IconChevronDown, IconDownload, IconPercentage, IconPlus, IconRefresh, IconSearch } from '@tabler/icons-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia } from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { TableSkeleton } from '@/components/PageSkeletons';
import { useLocale as useUILocale } from '@/shell/ui-locale';
import { useDashboardContext } from '@/shell/dashboard-context';
import { usePlatformCurrency } from '@/shell/platform-currency';
import { invalidateQueries } from '@/lib/query-cache';
import {
  cachedGet,
  peekCachedGet,
  request,
  writeMayHaveCommitted,
  type ProviderConnection,
  type ProviderModel,
  type ProviderModelCheck,
  type ModelWrite,
} from '@/features/providers/api';
import type { ProviderOffer, RetailPriceRecord } from '@niu-io/sdk/admin';
import {
  applyDiscountNanos,
  extractUpstreamStandardPrices,
  formatDiscountBadge,
  type AdapterPricingResponse,
  type UpstreamStandardPrice,
} from './upstream-pricing';
import { BatchDiscountDialog, ModelDiscountDialog, type SingleModelPricingSubmit } from './ModelDiscountDialog';
import {
  ProviderModelsTable,
  checkIdentity,
  type ModelCheckState,
  type ModelRowEntry,
  type ResolvedModelRow,
} from './ProviderModelsTable';
import { ProviderModelEditorDialog, type ModelEditorTarget } from './ProviderModelEditorDialog';
import {
  activateProviderModel,
  buildResolvedModelRow,
  connectionPoolKey,
  disableProviderModel,
  enableInternalProviderModel,
  hasEnabledPoolKey,
} from './provider-model-actions';

type StatusFilter = 'all' | 'active' | 'inactive';
type RetailLookup = Map<string, RetailPriceRecord>;

const SUPPORTED_ADAPTER_PRICING = new Set(['openrouter', 'fastrouter', 'babelark', 'qiniu', 'deepseek']);
const SUPPORTED_ADAPTER_PRICING_HOSTS = ['openrouter.ai', 'fastrouter', 'babelark.ai', 'qiniu', 'deepseek.com'];

function supportsAdapterPricing(connections: ProviderConnection[]): boolean {
  return connections.some(c => {
    const adapter = c.adapter.toLowerCase();
    if (SUPPORTED_ADAPTER_PRICING.has(adapter)) return true;
    const base = c.api_base.toLowerCase();
    return SUPPORTED_ADAPTER_PRICING_HOSTS.some(host => base.includes(host));
  });
}

async function fetchAllStandardTextPrices(token: string, signal: AbortSignal): Promise<RetailLookup> {
  const nextRetail: RetailLookup = new Map();
  let after: string | null = null;
  for (let page = 0; page < 20; page += 1) {
    if (signal.aborted) break;
    const path: string = '/api/v1/admin/pricing/standard-prices?limit=100' + (after ? `&after=${encodeURIComponent(after)}` : '');
    const res: { data: RetailPriceRecord[]; next_after?: string | null } = await request(token, path, 'GET', undefined, signal);
    if (!Array.isArray(res?.data)) break;
    for (const row of res.data) {
      if (row?.schedule?.kind === 'text' && typeof row.model_alias === 'string') {
        nextRetail.set(row.model_alias, row);
      }
    }
    const nextCursor: string | null = res.next_after ?? null;
    if (!nextCursor || nextCursor === after) break;
    after = nextCursor;
  }
  return nextRetail;
}

function peekScopedModels(token: string, providerId: string): { connections: ProviderConnection[]; entries: ModelRowEntry[] } | null {
  if (!token || !providerId) return null;
  const vendors = peekCachedGet<{ data: ProviderConnection[] }>(token, `/api/v1/admin/providers/connections?supplier=${encodeURIComponent(providerId)}`)?.data;
  if (!vendors) return null;
  const scoped = vendors.filter(item => (item.provider ?? item.supplier)?.id === providerId);
  const entries: ModelRowEntry[] = [];
  for (const connection of scoped) {
    const models = peekCachedGet<{ data: ProviderModel[] }>(token, `/api/v1/admin/providers/connections/${encodeURIComponent(connection.id)}/models`)?.data;
    if (!models) return null;
    for (const model of models) entries.push({ connection, model });
  }
  return { connections: scoped, entries };
}

type Props = {
  token: string;
  providerId: string;
  providerSlug: string;
  canManage: boolean;
  offers: ProviderOffer[];
  offersComplete: boolean;
  commercialEnabled?: boolean;
  onOffer: (alias: string, media: boolean) => void;
  onEnableOffer: (id: string) => void;
  onSaved: () => void;
};

/** Streamlined 3-step Provider model management: choose active models and set optional discount off upstream standard price. */
export default function ProviderModels(props: Props) {
  return <ScopedModels key={`${props.token}:${props.providerId}:${props.canManage}`} {...props} />;
}

function ScopedModels({
  token,
  providerId,
  providerSlug,
  canManage,
  offers,
  commercialEnabled = true,
  onOffer,
  onSaved,
}: Props) {
  const { t: uiT, format: uiF, locale } = useUILocale();
  const isZh = locale === 'zh-CN';
  const dashboardContext = useDashboardContext();
  const { currency: platformCurrency } = usePlatformCurrency();
  const initial = peekScopedModels(token, providerId);

  const [connections, setConnections] = useState<ProviderConnection[]>(() => initial?.connections ?? []);
  const [entries, setEntries] = useState<ModelRowEntry[]>(() => initial?.entries ?? []);
  const [upstreamPrices, setUpstreamPrices] = useState<Map<string, UpstreamStandardPrice>>(() => new Map());
  const [retailPrices, setRetailPrices] = useState<RetailLookup>(() => new Map());
  const [loading, setLoading] = useState(() => !initial);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [actionError, setActionError] = useState('');
  const [revision, setRevision] = useState(0);
  const lastRevision = useRef(0);

  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [limit, setLimit] = useState(40);
  const [selectedAliases, setSelectedAliases] = useState<Set<string>>(() => new Set());
  const [rowBusy, setRowBusy] = useState('');
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState('');

  const [discountDialog, setDiscountDialog] = useState<{ alias: string; enabling: boolean } | null>(null);
  const [batchDiscountOpen, setBatchDiscountOpen] = useState(false);
  const [dialogError, setDialogError] = useState('');

  const opener = useRef<HTMLElement | null>(null);
  const [editor, setEditor] = useState<ModelEditorTarget | null>(null);

  const write = useRef<AbortController | null>(null);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      write.current?.abort();
    };
  }, []);

  const checkSequence = useRef(0);
  const [checks, setChecks] = useState<Record<string, ModelCheckState>>({});

  useEffect(() => {
    const controller = new AbortController();
    const force = lastRevision.current !== revision;
    lastRevision.current = revision;
    const cached = peekScopedModels(token, providerId);
    if (cached && !force) {
      setConnections(cached.connections);
      setEntries(cached.entries);
      setLoading(false);
    } else if (!cached) {
      setLoading(true);
      setEntries([]);
      setConnections([]);
    }
    setError('');

    void (async () => {
      const result = await cachedGet<{ data: ProviderConnection[] }>(
        token,
        `/api/v1/admin/providers/connections?supplier=${encodeURIComponent(providerId)}`,
        { signal: controller.signal, force },
      );
      const scoped = result.data.filter(item => (item.provider ?? item.supplier)?.id === providerId);
      const models = await Promise.all(
        scoped.map(async connection => {
          const response = await cachedGet<{ data: ProviderModel[] }>(
            token,
            `/api/v1/admin/providers/connections/${encodeURIComponent(connection.id)}/models`,
            { signal: controller.signal, force },
          );
          return response.data.map(model => ({ connection, model }));
        }),
      );

      if (controller.signal.aborted) return;
      setConnections(scoped);
      setEntries(models.flat());

      if (commercialEnabled && canManage) {
        void (async () => {
          const [retailRes, adapterRes] = await Promise.allSettled([
            fetchAllStandardTextPrices(token, controller.signal),
            supportsAdapterPricing(scoped)
              ? request<AdapterPricingResponse>(token, `/api/v1/admin/providers/${encodeURIComponent(providerId)}/pricing`, 'GET', undefined, controller.signal)
              : Promise.resolve(null),
          ]);
          if (controller.signal.aborted) return;
          if (retailRes.status === 'fulfilled') {
            setRetailPrices(retailRes.value);
          }
          if (adapterRes.status === 'fulfilled' && adapterRes.value) {
            setUpstreamPrices(extractUpstreamStandardPrices(adapterRes.value));
          }
        })();
      }
    })()
      .catch(reason => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Models could not be loaded.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [token, providerId, revision, commercialEnabled, canManage]);

  const keysHref = `/admin/providers/${encodeURIComponent(providerSlug)}/keys`;
  const enabledConnections = useMemo(() => connections.filter(c => c.enabled && c.has_credential), [connections]);
  const importConnections = useMemo(() => {
    const seen = new Set<string>();
    const unique: ProviderConnection[] = [];
    for (const connection of enabledConnections) {
      const key = connectionPoolKey(connection);
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(connection);
    }
    return unique;
  }, [enabledConnections]);
  const hasEnabledKey = enabledConnections.length > 0;

  const offerByAlias = useMemo(() => {
    const map = new Map<string, ProviderOffer>();
    for (const offer of offers) map.set(offer.model_alias, offer);
    return map;
  }, [offers]);

  const entriesByAlias = useMemo(() => {
    const map = new Map<string, ModelRowEntry[]>();
    for (const entry of entries) {
      const list = map.get(entry.model.alias) ?? [];
      list.push(entry);
      map.set(entry.model.alias, list);
    }
    return map;
  }, [entries]);

  function resolveModelRow(alias: string): ResolvedModelRow {
    return buildResolvedModelRow({
      alias,
      entriesByAlias,
      offerByAlias,
      retailPrices,
      upstreamPrices,
      commercialEnabled,
      platformCurrency,
      connections,
    });
  }

  const allAliases = useMemo(() => {
    return [...new Set([...entries.map(e => e.model.alias), ...offers.map(o => o.model_alias)])].sort((a, b) => a.localeCompare(b));
  }, [entries, offers]);

  const resolvedRows = useMemo(() => allAliases.map(resolveModelRow), [
    allAliases,
    entriesByAlias,
    offerByAlias,
    retailPrices,
    upstreamPrices,
    commercialEnabled,
    platformCurrency,
    connections,
  ]);

  const counts = useMemo(() => {
    const activeCount = resolvedRows.filter(r => r.isActive).length;
    return { total: resolvedRows.length, active: activeCount, inactive: resolvedRows.length - activeCount };
  }, [resolvedRows]);

  const visibleRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return resolvedRows.filter(info => {
      if (statusFilter === 'active' && !info.isActive) return false;
      if (statusFilter === 'inactive' && info.isActive) return false;
      if (!q) return true;
      const details = info.routes.map(r => `${r.model.upstream_model} ${r.connection.name}`).join(' ');
      return `${info.alias} ${details}`.toLowerCase().includes(q);
    });
  }, [resolvedRows, query, statusFilter]);

  function refreshAll() {
    invalidateQueries('/api/v1/admin/providers');
    invalidateQueries('/api/v1/admin/pricing/standard-prices');
    invalidateQueries('/api/v1/models');
    void dashboardContext?.refreshModels?.();
    setRevision(v => v + 1);
    onSaved();
  }

  async function activateModelWithPricing(alias: string, pricing: SingleModelPricingSubmit) {
    await activateProviderModel({
      token,
      providerId,
      commercialEnabled,
      platformCurrency,
      info: resolveModelRow(alias),
      pricing,
      connections,
    });
  }

  async function handleEnableClick(alias: string) {
    if (!canManage || busy || rowBusy) return;
    setNotice('');
    setActionError('');
    if (!hasEnabledKey) {
      setActionError(uiT('Enable an API key for this Provider before enabling models.', '请先为此供应商启用 API 密钥，再启用模型。'));
      return;
    }
    const info = resolveModelRow(alias);
    if (!commercialEnabled) {
      const targetRoute =
        info.routes.find(r => hasEnabledPoolKey(r.connection, connections)) ?? info.primary;
      if (!targetRoute) return;
      setRowBusy(alias);
      try {
        await enableInternalProviderModel(token, targetRoute);
        setNotice(uiF('{0} enabled.', [alias]));
        refreshAll();
      } catch (reason) {
        setActionError(reason instanceof Error ? reason.message : 'Could not enable model.');
      } finally {
        setRowBusy('');
      }
      return;
    }

    const stdIn = info.stdInputNanos;
    const stdOut = info.stdOutputNanos;
    const hasPositiveStd = stdIn !== null && stdOut !== null && (BigInt(stdIn) > 0n || BigInt(stdOut) > 0n);

    if (!platformCurrency || !hasPositiveStd || stdIn === null || stdOut === null) {
      setDialogError('');
      setDiscountDialog({ alias, enabling: true });
      return;
    }

    const effectiveDiscount = info.discountPercent ?? 100;
    setRowBusy(alias);
    try {
      await activateModelWithPricing(alias, {
        standardInputNanos: stdIn,
        standardOutputNanos: stdOut,
        standardCachedInputNanos: info.stdCachedNanos,
        discountPercent: effectiveDiscount,
        purchaseInputNanos: applyDiscountNanos(stdIn, effectiveDiscount),
        purchaseOutputNanos: applyDiscountNanos(stdOut, effectiveDiscount),
        purchaseCachedInputNanos: info.stdCachedNanos ? applyDiscountNanos(info.stdCachedNanos, effectiveDiscount) : null,
        updateCustomerPrice: !info.retail,
      });
      setNotice(uiF('{0} is now active.', [alias]));
      refreshAll();
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : 'Could not enable model.');
    } finally {
      setRowBusy('');
    }
  }

  async function handleDisableClick(alias: string) {
    if (!canManage || busy || rowBusy) return;
    setNotice('');
    setActionError('');
    setRowBusy(alias);
    try {
      await disableProviderModel({ token, providerId, info: resolveModelRow(alias) });
      setNotice(uiF('{0} disabled.', [alias]));
      refreshAll();
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : 'Could not disable model.');
    } finally {
      setRowBusy('');
    }
  }

  async function handleSingleDiscountSubmit(payload: SingleModelPricingSubmit) {
    if (!discountDialog) return;
    setBusy(true);
    setDialogError('');
    try {
      await activateModelWithPricing(discountDialog.alias, payload);
      const savedAlias = discountDialog.alias;
      setDiscountDialog(null);
      setNotice(uiF('{0} saved and active ({1}).', [savedAlias, formatDiscountBadge(payload.discountPercent, isZh)]));
      refreshAll();
    } catch (reason) {
      setDialogError(reason instanceof Error ? reason.message : 'Could not save discount.');
    } finally {
      setBusy(false);
    }
  }

  const batchSummary = useMemo(() => {
    const eligible: ResolvedModelRow[] = [];
    const skipped: string[] = [];
    for (const alias of selectedAliases) {
      const info = resolveModelRow(alias);
      const hasPositiveStd =
        info.stdInputNanos !== null &&
        info.stdOutputNanos !== null &&
        (BigInt(info.stdInputNanos) > 0n || BigInt(info.stdOutputNanos) > 0n);
      if (hasPositiveStd && info.routes.some(r => hasEnabledPoolKey(r.connection, connections))) {
        eligible.push(info);
      } else {
        skipped.push(alias);
      }
    }
    return { eligible, skipped };
  }, [selectedAliases, entriesByAlias, offerByAlias, retailPrices, upstreamPrices, platformCurrency, connections]);

  async function handleBatchDiscountSubmit(discountPercent: number) {
    if (!batchSummary.eligible.length) return;
    setBusy(true);
    setDialogError('');
    let succeeded = 0;
    const failures: string[] = [];
    try {
      for (const info of batchSummary.eligible) {
        if (!info.stdInputNanos || !info.stdOutputNanos) continue;
        try {
          await activateModelWithPricing(info.alias, {
            standardInputNanos: info.stdInputNanos,
            standardOutputNanos: info.stdOutputNanos,
            standardCachedInputNanos: info.stdCachedNanos,
            discountPercent,
            purchaseInputNanos: applyDiscountNanos(info.stdInputNanos, discountPercent),
            purchaseOutputNanos: applyDiscountNanos(info.stdOutputNanos, discountPercent),
            purchaseCachedInputNanos: info.stdCachedNanos ? applyDiscountNanos(info.stdCachedNanos, discountPercent) : null,
            updateCustomerPrice: !info.retail,
          });
          succeeded += 1;
        } catch (reason) {
          failures.push(`${info.alias}: ${reason instanceof Error ? reason.message : 'failed'}`);
        }
      }
      if (failures.length > 0) {
        setDialogError(`${succeeded}/${batchSummary.eligible.length} updated. ${failures[0]}`);
      } else {
        setBatchDiscountOpen(false);
        setSelectedAliases(new Set());
        setNotice(uiF('Applied {0} to {1} models.', [formatDiscountBadge(discountPercent, isZh), succeeded]));
      }
      refreshAll();
    } finally {
      setBusy(false);
    }
  }

  function openEditor(value: ModelEditorTarget) {
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setEditor(value);
  }

  const selectedConnection = connections.find(connection => connection.id === editor?.connectionId);

  async function checkModel(connection: ProviderConnection, model: ProviderModel) {
    if (!canManage) return;
    const key = `${connection.id}:${model.alias}`;
    const identity = checkIdentity(connection, model);
    const sequence = ++checkSequence.current;
    setChecks(current => ({ ...current, [key]: { identity, sequence, pending: true } }));
    try {
      const result = await request<{ data: ProviderModelCheck }>(
        token,
        `/api/v1/admin/providers/connections/${encodeURIComponent(connection.id)}/check`,
        'POST',
        { alias: model.alias },
      );
      if (!active.current) return;
      setChecks(current => (current[key]?.sequence === sequence ? { ...current, [key]: { identity, sequence, pending: false, result: result.data } } : current));
    } catch (reason) {
      if (!active.current) return;
      setChecks(current => (current[key]?.sequence === sequence ? { ...current, [key]: { identity, sequence, pending: false, error: reason instanceof Error ? reason.message : 'Check failed.' } } : current));
    }
  }

  async function saveManualModel(input: ModelWrite) {
    if (!canManage || !editor || !selectedConnection || write.current) return;
    const controller = new AbortController();
    write.current = controller;
    setBusy(true);
    setNotice('');
    setActionError('');
    try {
      await request(token, `/api/v1/admin/providers/connections/${encodeURIComponent(selectedConnection.id)}/models`, 'POST', input, controller.signal);
      if (!active.current || controller.signal.aborted) return;
      setEditor(null);
      setNotice('Model saved.');
      refreshAll();
    } catch (reason) {
      if (!active.current || controller.signal.aborted) return;
      if (writeMayHaveCommitted(reason)) {
        setEditor(null);
        setNotice('The save could not be confirmed. Review the refreshed list before trying again.');
        refreshAll();
      } else {
        throw reason;
      }
    } finally {
      if (active.current) {
        setBusy(false);
        write.current = null;
      }
    }
  }

  async function importModels(connection: ProviderConnection) {
    if (!canManage || write.current || loading || error) return;
    const controller = new AbortController();
    write.current = controller;
    setBusy(true);
    setImporting(connection.id);
    setNotice('');
    setActionError('');
    try {
      const result = await request<{ data: { imported: number; discovered: number } }>(
        token,
        `/api/v1/admin/providers/connections/${encodeURIComponent(connection.id)}/import`,
        'POST',
        {},
        controller.signal,
      );
      if (!active.current || controller.signal.aborted) return;
      setNotice(uiF('Imported {0} of {1} discovered models.', [result.data.imported, result.data.discovered]));
      refreshAll();
    } catch (reason) {
      if (!active.current || controller.signal.aborted) return;
      if (writeMayHaveCommitted(reason)) {
        setNotice('The import could not be confirmed. Review the refreshed models before importing again.');
        refreshAll();
      } else {
        setActionError(reason instanceof Error ? reason.message : 'Could not import models.');
      }
    } finally {
      if (active.current) {
        setBusy(false);
        setImporting('');
        write.current = null;
      }
    }
  }

  const displayedRows = visibleRows.slice(0, limit);
  const allVisibleSelected = displayedRows.length > 0 && displayedRows.every(r => selectedAliases.has(r.alias));

  function toggleSelectAllVisible() {
    setSelectedAliases(prev => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        for (const r of displayedRows) next.delete(r.alias);
      } else {
        for (const r of displayedRows) next.add(r.alias);
      }
      return next;
    });
  }

  function toggleRowSelected(alias: string) {
    setSelectedAliases(prev => {
      const next = new Set(prev);
      if (next.has(alias)) next.delete(alias);
      else next.add(alias);
      return next;
    });
  }

  const discountTarget = discountDialog ? resolveModelRow(discountDialog.alias) : null;

  return (
    <div className="empty-region space-y-4 py-1">
      {!loading && !error && !hasEnabledKey && (
        <Alert>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span>
              {connections.length === 0
                ? uiT('Step 1: connect a Provider API key before selecting models.', '第一步：请先连接供应商 API 密钥，再选择可用模型。')
                : uiT('All API keys for this Provider are currently disabled. Enable an API key first.', '此供应商的 API 密钥当前均已停用，请先启用 API 密钥。')}
            </span>
            <Button asChild size="sm">
              <Link to={keysHref}>{connections.length === 0 ? uiT('Connect API key') : uiT('Enable API key')}</Link>
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        {counts.total > 0 && <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center min-w-0">
          <div className="relative w-full sm:w-64">
            <IconSearch size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              className="pl-9"
              aria-label={uiT('Filter configured models')}
              placeholder={uiT('Filter by model…', '搜索模型…')}
              value={query}
              onChange={event => {
                setQuery(event.target.value);
                setLimit(40);
              }}
            />
          </div>
          <div className="inline-flex flex-wrap items-center gap-1" role="group" aria-label={uiT('Filter by status', '按状态筛选')}>
            {([
              ['all', uiF('All ({0})', [counts.total])],
              ['active', uiF('Active ({0})', [counts.active])],
              ['inactive', uiF('Inactive ({0})', [counts.inactive])],
            ] as const).map(([key, label]) => (
              <Button
                key={key}
                type="button"
                size="sm"
                variant={statusFilter === key ? 'secondary' : 'ghost'}
                onClick={() => {
                  setStatusFilter(key);
                  setLimit(40);
                }}
              >
                {label}
              </Button>
            ))}
          </div>
        </div>}

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {commercialEnabled && selectedAliases.size > 0 && (
            <Button
              type="button"
              size="sm"
              disabled={!canManage || busy || !hasEnabledKey}
              onClick={() => {
                setDialogError('');
                setBatchDiscountOpen(true);
              }}
            >
              <IconPercentage size={15} aria-hidden="true" />
              <span>{uiF('Set discount ({0})', [selectedAliases.size])}</span>
            </Button>
          )}
          {importConnections.length === 1 && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!canManage || loading || !!error || busy}
              onClick={() => void importModels(importConnections[0])}
            >
              <IconDownload size={15} aria-hidden="true" />
              <span>{importing ? uiT('Importing…') : uiT('Import models')}</span>
            </Button>
          )}
          {importConnections.length > 1 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" size="sm" variant="outline" disabled={!canManage || loading || !!error || busy}>
                  <IconDownload size={15} aria-hidden="true" />
                  <span>{importing ? uiT('Importing…') : uiT('Import models')}</span>
                  <IconChevronDown size={15} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {importConnections.map(connection => (
                  <DropdownMenuItem key={connection.id} disabled={busy} onSelect={() => void importModels(connection)}>
                    {uiF('Import from {0}', [connection.name || uiT('Unnamed API key')])}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!canManage || loading || !!error || !connections.length}
            onClick={() => openEditor({ connectionId: (enabledConnections[0] ?? connections[0]).id, model: null })}
          >
            <IconPlus size={15} aria-hidden="true" />
            <span>{uiT('Add model')}</span>
          </Button>
          <Button type="button" size="sm" variant="ghost" disabled={loading} aria-label={uiT('Refresh')} onClick={() => setRevision(v => v + 1)}>
            <IconRefresh size={15} aria-hidden="true" />
          </Button>
        </div>
      </div>

      {notice && <p role="status" className="text-sm text-foreground">{uiT(notice)}</p>}
      {actionError && (
        <Alert variant="destructive">
          <AlertDescription>{uiT(actionError)}</AlertDescription>
        </Alert>
      )}

      {loading ? (
        <TableSkeleton columns={commercialEnabled ? 6 : 4} rows={5} label={uiT('Loading models…')} />
      ) : error ? (
        <Alert variant="destructive">
          <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
            <span>{uiT(error)}</span>
            <Button variant="outline" size="sm" onClick={() => setRevision(v => v + 1)}>{uiT('Retry loading models')}</Button>
          </AlertDescription>
        </Alert>
      ) : !displayedRows.length ? (
        <Empty className="min-h-48">
          <EmptyHeader>
            <EmptyMedia variant="icon"><IconSearch size={18} aria-hidden="true" /></EmptyMedia>
            <EmptyDescription>
              {query || statusFilter !== 'all'
                ? uiT('No models match this filter.')
                : hasEnabledKey
                  ? uiT('No models imported yet. Click "Import models" to discover available models.', '尚未导入模型，点击「导入模型」即可同步上游可用模型。')
                  : uiT('No models configured yet.')}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ProviderModelsTable
          rows={displayedRows}
          commercialEnabled={commercialEnabled}
          platformCurrency={platformCurrency}
          canManage={canManage}
          busy={busy}
          rowBusy={rowBusy}
          hasEnabledKey={hasEnabledKey}
          hasConnections={connections.length > 0}
          selectedAliases={selectedAliases}
          allVisibleSelected={allVisibleSelected}
          checks={checks}
          onToggleAll={toggleSelectAllVisible}
          onToggleRow={toggleRowSelected}
          onEnable={alias => void handleEnableClick(alias)}
          onDisable={alias => void handleDisableClick(alias)}
          onOpenDiscount={(alias, enabling) => {
            setDialogError('');
            setDiscountDialog({ alias, enabling });
          }}
          onCheck={(connection, model) => void checkModel(connection, model)}
          onEditRoute={(connection, model) => openEditor({ connectionId: connection.id, model })}
          onAddRoute={alias => openEditor({ connectionId: (enabledConnections[0] ?? connections[0]).id, model: null, initialAlias: alias })}
          onMediaRates={alias => onOffer(alias, true)}
        />
      )}

      {visibleRows.length > limit && (
        <Button type="button" variant="outline" onClick={() => setLimit(v => v + 40)}>
          {uiF('Show more models ({0} remaining)', [visibleRows.length - limit])}
        </Button>
      )}

      {discountDialog && discountTarget && (
        <ModelDiscountDialog
          key={`${discountDialog.alias}:${discountTarget.offer?.revision ?? 'new'}`}
          open
          alias={discountDialog.alias}
          upstreamModel={discountTarget.primary?.model.upstream_model}
          currency={platformCurrency}
          upstreamHint={discountTarget.upstream}
          initialStandardInputNanos={discountTarget.stdInputNanos}
          initialStandardOutputNanos={discountTarget.stdOutputNanos}
          initialStandardCachedNanos={discountTarget.stdCachedNanos}
          initialDiscountPercent={discountTarget.discountPercent}
          hasExistingCustomerPrice={Boolean(discountTarget.retail)}
          enabling={discountDialog.enabling}
          busy={busy}
          error={dialogError}
          onClose={() => { if (!busy) setDiscountDialog(null); }}
          onSubmit={handleSingleDiscountSubmit}
        />
      )}

      <BatchDiscountDialog
        open={batchDiscountOpen}
        currency={platformCurrency}
        eligibleCount={batchSummary.eligible.length}
        skippedCount={batchSummary.skipped.length}
        busy={busy}
        error={dialogError}
        onClose={() => { if (!busy) setBatchDiscountOpen(false); }}
        onSubmit={handleBatchDiscountSubmit}
      />

      <ProviderModelEditorDialog
        token={token}
        canManage={canManage}
        busy={busy}
        connections={connections}
        editor={editor}
        openerRef={opener}
        onChangeConnection={connectionId => setEditor(current => (current ? { ...current, connectionId, model: null } : current))}
        onClose={() => setEditor(null)}
        onSave={input => saveManualModel(input)}
      />
    </div>
  );
}
