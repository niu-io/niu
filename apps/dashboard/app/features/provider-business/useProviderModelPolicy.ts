import { fetchAllStandardTextPrices, type RetailLookup } from '@/features/retail-pricing/api';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router';
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
} from '@/features/providers/api';
import type { ProviderModelAccessMode, ProviderOffer } from '@niu-io/sdk/admin';
import {
  extractUpstreamStandardPrices,
  formatDiscountBadge,
  parseDiscountPercent,
  supportsAdapterPricing,
  type AdapterPricingResponse,
  type UpstreamStandardPrice,
} from './upstream-pricing';
import {
  activateProviderModel,
  buildResolvedModelRow,
  connectionPoolKey,
  disableProviderModel,
  enableInternalProviderModel,
  hasEnabledPoolKey,
  syncProviderPolicyModels,
} from './provider-model-actions';
import type { ModelRowEntry, ResolvedModelRow } from './ProviderModelsTable';
import type { SingleModelPricingSubmit } from './ModelDiscountDialog';
import type { PolicyModalKind } from './ProviderPolicyDialogs';

export type ProfilePolicy = {
  id: string;
  slug: string;
  name: string;
  description: string;
  website_url: string;
  logo_url: string;
  model_access_mode?: ProviderModelAccessMode;
  default_discount_bps?: number;
  allowlisted_models?: string[];
  blocklisted_models?: string[];
  revision: number;
};

type AdminOffersSummary = {
  offers?: ProviderOffer[];
  offers_has_more?: boolean;
};

export function useProviderModelPolicy(providerId: string) {
  const { t: uiT, format: uiF, locale } = useUILocale();
  const isZh = locale === 'zh-CN';
  const { token, session, refreshModels } = useDashboardContext();
  const { currency: platformCurrency } = usePlatformCurrency();
  const commercialEnabled = session?.operating_mode !== 'internal';
  const canManage = Boolean(session?.kind === 'installation' || session?.permissions?.platform_admin);
  const [search, setSearch] = useSearchParams();

  const profilePath = `/api/v1/admin/providers/${encodeURIComponent(providerId)}`;
  const connectionsPath = `/api/v1/admin/providers/connections?supplier=${encodeURIComponent(providerId)}`;
  const adminPath = `/api/v1/admin/providers/${encodeURIComponent(providerId)}/administration?days=90`;

  const [profile, setProfile] = useState<ProfilePolicy | null>(() => {
    const cached = token ? peekCachedGet<{ data?: ProfilePolicy }>(token, profilePath)?.data : null;
    return cached && typeof cached === 'object' && !Array.isArray(cached) ? cached : null;
  });
  const [connections, setConnections] = useState<ProviderConnection[]>([]);
  const [entries, setEntries] = useState<ModelRowEntry[]>([]);
  const [offers, setOffers] = useState<ProviderOffer[]>([]);
  const [offersComplete, setOffersComplete] = useState(true);
  const [upstreamPrices, setUpstreamPrices] = useState<Map<string, UpstreamStandardPrice>>(() => new Map());
  const [retailPrices, setRetailPrices] = useState<RetailLookup>(() => new Map());

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const [revision, setRevision] = useState(0);
  const lastRevision = useRef(0);

  const [activeModal, setActiveModal] = useState<PolicyModalKind>(null);
  const [browserInitialFilter, setBrowserInitialFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [pickerQuery, setPickerQuery] = useState('');
  const [pickerSelected, setPickerSelected] = useState<Set<string>>(() => new Set());
  const [discountInput, setDiscountInput] = useState('100');
  const [discountError, setDiscountError] = useState('');
  const [singleDiscountAlias, setSingleDiscountAlias] = useState<string | null>(null);
  const [mediaRateModel, setMediaRateModel] = useState<string | null>(null);
  const autoSyncedRef = useRef(false);

  useEffect(() => {
    const bump = () => setRevision(v => v + 1);
    window.addEventListener('niu:provider-connections-updated', bump);
    window.addEventListener('niu:provider-profile-updated', bump);
    return () => {
      window.removeEventListener('niu:provider-connections-updated', bump);
      window.removeEventListener('niu:provider-profile-updated', bump);
    };
  }, []);

  useEffect(() => {
    if (!token || !providerId) return;
    const controller = new AbortController();
    const force = lastRevision.current !== revision;
    lastRevision.current = revision;
    setError('');

    void (async () => {
      const [profileRes, connectionsRes, adminRes] = await Promise.all([
        cachedGet<{ data: ProfilePolicy }>(token, profilePath, { signal: controller.signal, force }),
        cachedGet<{ data: ProviderConnection[] }>(token, connectionsPath, { signal: controller.signal, force }),
        commercialEnabled
          ? cachedGet<{ data: AdminOffersSummary }>(token, adminPath, { signal: controller.signal, force })
          : Promise.resolve(null),
      ]);

      const rawConnections = Array.isArray(connectionsRes?.data) ? connectionsRes.data : [];
      const scoped = rawConnections.filter(c => (c.provider ?? c.supplier)?.id === providerId);
      const modelLists = await Promise.all(
        scoped.map(async connection => {
          const res = await cachedGet<{ data: ProviderModel[] }>(
            token,
            `/api/v1/admin/providers/connections/${encodeURIComponent(connection.id)}/models`,
            { signal: controller.signal, force },
          );
          const list = Array.isArray(res?.data) ? res.data : [];
          return list.map(model => ({ connection, model }));
        }),
      );

      let loadedOffers = Array.isArray(adminRes?.data?.offers) ? [...adminRes.data.offers] : [];
      let hasMore = Boolean(adminRes?.data?.offers_has_more);
      const seen = new Set<string>();
      while (commercialEnabled && hasMore) {
        const after = loadedOffers.at(-1)?.model_alias;
        if (!after || seen.has(after)) break;
        seen.add(after);
        const page = await request<{ data: ProviderOffer[]; next_after: string | null }>(
          token,
          `/api/v1/admin/providers/${encodeURIComponent(providerId)}/offers?limit=100&after=${encodeURIComponent(after)}`,
          'GET',
          undefined,
          controller.signal,
        );
        const nextItems = Array.isArray(page?.data) ? page.data : [];
        loadedOffers = [...loadedOffers, ...nextItems.filter(item => !loadedOffers.some(old => old.id === item.id))];
        hasMore = page.next_after !== null;
      }

      if (controller.signal.aborted) return;
      if (profileRes?.data && typeof profileRes.data === 'object' && !Array.isArray(profileRes.data)) {
        setProfile(profileRes.data);
      }
      setConnections(scoped);
      setEntries(modelLists.flat());
      setOffers(loadedOffers);
      setOffersComplete(!hasMore);

      if (commercialEnabled && canManage) {
        const [retailRes, adapterRes] = await Promise.allSettled([
          fetchAllStandardTextPrices(token, controller.signal),
          supportsAdapterPricing(scoped)
            ? request<AdapterPricingResponse>(
                token,
                `/api/v1/admin/providers/${encodeURIComponent(providerId)}/pricing`,
                'GET',
                undefined,
                controller.signal,
              )
            : Promise.resolve(null),
        ]);
        if (controller.signal.aborted) return;
        if (retailRes.status === 'fulfilled') setRetailPrices(retailRes.value);
        if (adapterRes.status === 'fulfilled' && adapterRes.value) {
          setUpstreamPrices(extractUpstreamStandardPrices(adapterRes.value));
        }
      }
    })()
      .catch(reason => {
        if (!controller.signal.aborted) {
          setError(reason instanceof Error ? reason.message : 'Could not load Provider model settings.');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [token, providerId, profilePath, connectionsPath, adminPath, commercialEnabled, canManage, revision]);

  const accessMode: ProviderModelAccessMode = profile?.model_access_mode ?? 'all';
  const defaultDiscountBps = profile?.default_discount_bps ?? 10000;
  const defaultDiscountPercent = defaultDiscountBps / 100;
  const allowlistedModels = profile?.allowlisted_models ?? [];
  const blocklistedModels = profile?.blocklisted_models ?? [];

  const enabledConnections = useMemo(() => connections.filter(c => c.enabled && c.has_credential), [connections]);
  const importConnections = useMemo(() => {
    const seen = new Set<string>();
    const unique: ProviderConnection[] = [];
    for (const c of enabledConnections) {
      const key = connectionPoolKey(c);
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(c);
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

  const allAliases = useMemo(
    () => [...new Set([...entries.map(e => e.model.alias), ...offers.map(o => o.model_alias)])].sort((a, b) => a.localeCompare(b)),
    [entries, offers],
  );

  const resolvedRows = useMemo(
    () =>
      allAliases.map(alias =>
        buildResolvedModelRow({
          alias,
          entriesByAlias,
          offerByAlias,
          retailPrices,
          upstreamPrices,
          commercialEnabled,
          platformCurrency,
          connections,
        }),
      ),
    [allAliases, entriesByAlias, offerByAlias, retailPrices, upstreamPrices, commercialEnabled, platformCurrency, connections],
  );

  const rowByAlias = useMemo(() => {
    const map = new Map<string, ResolvedModelRow>();
    for (const row of resolvedRows) map.set(row.alias, row);
    return map;
  }, [resolvedRows]);

  const counts = useMemo(() => {
    const activeCount = resolvedRows.filter(r => r.isActive).length;
    const unactivatedPricedCount = commercialEnabled
      ? resolvedRows.filter(r => {
          const isMedia = r.offer?.rate_kind === 'media' || r.routes.some(x => Boolean(x.model.capabilities?.video_schema));
          if (r.isActive || isMedia) return false;
          const allowed =
            accessMode === 'all'
              ? true
              : accessMode === 'blocklist'
                ? !blocklistedModels.includes(r.alias)
                : allowlistedModels.includes(r.alias);
          return (
            allowed &&
            r.stdInputNanos !== null &&
            r.stdOutputNanos !== null &&
            (BigInt(r.stdInputNanos) > 0n || BigInt(r.stdOutputNanos) > 0n)
          );
        }).length
      : 0;
    const customOverrideCount = commercialEnabled
      ? resolvedRows.filter(
          r => r.isActive && r.discountPercent !== null && Math.abs(r.discountPercent - defaultDiscountPercent) >= 0.05,
        ).length
      : 0;
    return { total: resolvedRows.length, active: activeCount, unactivatedPricedCount, customOverrideCount };
  }, [resolvedRows, commercialEnabled, accessMode, blocklistedModels, allowlistedModels, defaultDiscountPercent]);

  function refreshAll() {
    invalidateQueries('/api/v1/admin/providers');
    invalidateQueries('/api/v1/admin/pricing/standard-prices');
    invalidateQueries('/api/v1/models');
    void refreshModels?.();
    setRevision(v => v + 1);
  }

  async function persistPolicyUpdate(patch: {
    model_access_mode?: ProviderModelAccessMode;
    default_discount_bps?: number;
    allowlisted_models?: string[];
    blocklisted_models?: string[];
  }): Promise<ProfilePolicy> {
    if (!profile) throw new Error('Provider profile is not loaded yet.');
    const res = await request<{ data: ProfilePolicy }>(token, profilePath, 'PATCH', {
      name: profile.name,
      expected_revision: profile.revision,
      ...patch,
    });
    setProfile(res.data);
    return res.data;
  }

  async function applyPolicySync(
    mode: ProviderModelAccessMode,
    discountBps: number,
    allowlist: string[],
    blocklist: string[],
    updateExistingDiscounts: boolean,
  ) {
    if (!canManage || busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await syncProviderPolicyModels({
        token,
        providerId,
        mode,
        defaultDiscountBps: discountBps,
        allowlistedModels: allowlist,
        blocklistedModels: blocklist,
        commercialEnabled,
        platformCurrency,
        connections,
        rows: resolvedRows,
        updateExistingDiscounts,
      });
      if (result.failures.length > 0) setError(result.failures[0]);
      else if (result.activated > 0 || result.disabled > 0) {
        setNotice(uiF('Updated model access ({0} enabled, {1} disabled).', [result.activated, result.disabled]));
      } else setNotice(uiT('Model access policy saved.', '模型可用策略已保存。'));
      refreshAll();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not update model policy.');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (search.get('autosync') !== '1' || loading || !profile || !hasEnabledKey || autoSyncedRef.current) return;
    if (commercialEnabled && !platformCurrency) return;
    autoSyncedRef.current = true;
    setSearch(prev => {
      const next = new URLSearchParams(prev);
      next.delete('autosync');
      return next;
    }, { replace: true });
    if (counts.unactivatedPricedCount > 0 || (!commercialEnabled && counts.active < counts.total)) {
      void applyPolicySync(accessMode, defaultDiscountBps, allowlistedModels, blocklistedModels, false);
    }
  }, [search, loading, profile, hasEnabledKey, commercialEnabled, platformCurrency, counts.unactivatedPricedCount]);

  async function handleModeChange(nextValue: string) {
    const nextMode = (nextValue === 'allowlist' || nextValue === 'blocklist' ? nextValue : 'all') as ProviderModelAccessMode;
    if (!profile || nextMode === accessMode || busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const updated = await persistPolicyUpdate({ model_access_mode: nextMode });
      const result = await syncProviderPolicyModels({
        token,
        providerId,
        mode: nextMode,
        defaultDiscountBps: updated.default_discount_bps ?? 10000,
        allowlistedModels: updated.allowlisted_models ?? [],
        blocklistedModels: updated.blocklisted_models ?? [],
        commercialEnabled,
        platformCurrency,
        connections,
        rows: resolvedRows,
        updateExistingDiscounts: false,
      });
      if (result.failures.length > 0) setError(result.failures[0]);
      else setNotice(uiT('Model access policy updated.', '模型可用范围已更新。'));
      refreshAll();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not update model access policy.');
    } finally {
      setBusy(false);
    }
  }

  async function handleDefaultDiscountSubmit(event: FormEvent) {
    event.preventDefault();
    if (!profile || busy) return;
    const parsed = parseDiscountPercent(discountInput);
    if (parsed === null) {
      setDiscountError(
        uiT('Enter a discount percentage between 0.1 and 1000 (100 = no discount).', '请填写有效折扣百分比（100 表示无折扣，70 表示 7 折）。'),
      );
      return;
    }
    const nextBps = Math.round(parsed * 100);
    setBusy(true);
    setDiscountError('');
    setError('');
    setNotice('');
    try {
      const updated = await persistPolicyUpdate({ default_discount_bps: nextBps });
      const result = await syncProviderPolicyModels({
        token,
        providerId,
        mode: updated.model_access_mode ?? 'all',
        defaultDiscountBps: nextBps,
        allowlistedModels: updated.allowlisted_models ?? [],
        blocklistedModels: updated.blocklisted_models ?? [],
        commercialEnabled,
        platformCurrency,
        connections,
        rows: resolvedRows,
        updateExistingDiscounts: true,
      });
      if (result.failures.length > 0) setDiscountError(result.failures[0]);
      else {
        setActiveModal(null);
        setNotice(uiF('Default discount set to {0}.', [formatDiscountBadge(parsed, isZh)]));
      }
      refreshAll();
    } catch (reason) {
      setDiscountError(reason instanceof Error ? reason.message : 'Could not save default discount.');
    } finally {
      setBusy(false);
    }
  }

  async function handleImportAndSync(targetConnection?: ProviderConnection) {
    if (!canManage || busy || importing) return;
    const targets = targetConnection ? [targetConnection] : importConnections;
    if (!targets.length) return;
    setImporting(true);
    setBusy(true);
    setError('');
    setNotice('');
    try {
      let totalImported = 0;
      let totalDiscovered = 0;
      for (const conn of targets) {
        const res = await request<{ data: { imported: number; discovered: number } }>(
          token,
          `/api/v1/admin/providers/connections/${encodeURIComponent(conn.id)}/import`,
          'POST',
          {},
        );
        totalImported += res.data.imported;
        totalDiscovered += res.data.discovered;
      }

      const modelLists = await Promise.all(
        connections.map(async connection => {
          const res = await request<{ data: ProviderModel[] }>(
            token,
            `/api/v1/admin/providers/connections/${encodeURIComponent(connection.id)}/models`,
          );
          return (Array.isArray(res?.data) ? res.data : []).map(model => ({ connection, model }));
        }),
      );
      const freshEntries = modelLists.flat();
      const freshByAlias = new Map<string, ModelRowEntry[]>();
      for (const entry of freshEntries) {
        const list = freshByAlias.get(entry.model.alias) ?? [];
        list.push(entry);
        freshByAlias.set(entry.model.alias, list);
      }
      const freshAliases = [...new Set([...freshEntries.map(e => e.model.alias), ...offers.map(o => o.model_alias)])].sort();
      const freshRows = freshAliases.map(alias =>
        buildResolvedModelRow({
          alias,
          entriesByAlias: freshByAlias,
          offerByAlias,
          retailPrices,
          upstreamPrices,
          commercialEnabled,
          platformCurrency,
          connections,
        }),
      );

      const syncRes = await syncProviderPolicyModels({
        token,
        providerId,
        mode: accessMode,
        defaultDiscountBps,
        allowlistedModels,
        blocklistedModels,
        commercialEnabled,
        platformCurrency,
        connections,
        rows: freshRows,
        updateExistingDiscounts: false,
      });

      setNotice(
        syncRes.activated > 0
          ? uiF('Synced {0} discovered models ({1} newly added, {2} activated).', [totalDiscovered, totalImported, syncRes.activated])
          : uiF('Imported {0} of {1} discovered models.', [totalImported, totalDiscovered]),
      );
      refreshAll();
    } catch (reason) {
      if (writeMayHaveCommitted(reason)) {
        setNotice(uiT('The import could not be confirmed. Review the refreshed models before importing again.'));
        refreshAll();
      } else setError(reason instanceof Error ? reason.message : 'Could not import models.');
    } finally {
      setImporting(false);
      setBusy(false);
    }
  }

  async function handlePickerSave() {
    if (!profile || busy || pickerSelected.size === 0) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const additions = [...pickerSelected];
      if (accessMode === 'blocklist') {
        const nextList = [...new Set([...blocklistedModels, ...additions])].sort();
        await persistPolicyUpdate({ blocklisted_models: nextList });
        for (const alias of additions) {
          const row = rowByAlias.get(alias);
          if (row && (row.isActive || row.routes.some(r => r.model.enabled))) {
            await disableProviderModel({ token, providerId, info: row });
          }
        }
        setNotice(uiF('Added {0} models to blocklist.', [additions.length]));
      } else if (accessMode === 'allowlist') {
        const nextList = [...new Set([...allowlistedModels, ...additions])].sort();
        await persistPolicyUpdate({ allowlisted_models: nextList });
        await syncProviderPolicyModels({
          token,
          providerId,
          mode: 'allowlist',
          defaultDiscountBps,
          allowlistedModels: nextList,
          blocklistedModels,
          commercialEnabled,
          platformCurrency,
          connections,
          rows: resolvedRows.filter(r => additions.includes(r.alias)),
          updateExistingDiscounts: false,
        });
        setNotice(uiF('Added {0} models to allowlist.', [additions.length]));
      }
      setActiveModal(null);
      setPickerSelected(new Set());
      refreshAll();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not update model list.');
    } finally {
      setBusy(false);
    }
  }

  async function handleRemoveFromList(alias: string) {
    if (!profile || busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const row = rowByAlias.get(alias);
      if (accessMode === 'blocklist') {
        const nextList = blocklistedModels.filter(item => item !== alias);
        await persistPolicyUpdate({ blocklisted_models: nextList });
        if (row && hasEnabledKey) {
          if (!commercialEnabled) {
            const target = row.routes.find(r => hasEnabledPoolKey(r.connection, connections)) ?? row.primary;
            if (target) await enableInternalProviderModel(token, target);
          } else if (row.stdInputNanos && row.stdOutputNanos && platformCurrency) {
            await syncProviderPolicyModels({
              token,
              providerId,
              mode: 'blocklist',
              defaultDiscountBps,
              allowlistedModels,
              blocklistedModels: nextList,
              commercialEnabled,
              platformCurrency,
              connections,
              rows: [row],
              updateExistingDiscounts: false,
            });
          }
        }
        setNotice(uiF('Removed {0} from blocklist.', [alias]));
      } else if (accessMode === 'allowlist') {
        const nextList = allowlistedModels.filter(item => item !== alias);
        await persistPolicyUpdate({ allowlisted_models: nextList });
        if (row) await disableProviderModel({ token, providerId, info: row });
        setNotice(uiF('Removed {0} from allowlist.', [alias]));
      }
      refreshAll();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not update model list.');
    } finally {
      setBusy(false);
    }
  }

  async function handleSingleDiscountSave(payload: SingleModelPricingSubmit) {
    if (!singleDiscountAlias) return;
    const row = rowByAlias.get(singleDiscountAlias);
    if (!row) return;
    setBusy(true);
    setDiscountError('');
    try {
      await activateProviderModel({
        token,
        providerId,
        commercialEnabled,
        platformCurrency,
        info: row,
        pricing: payload,
        connections,
      });
      setActiveModal(null);
      setSingleDiscountAlias(null);
      setNotice(uiF('{0} saved and active ({1}).', [row.alias, formatDiscountBadge(payload.discountPercent, isZh)]));
      refreshAll();
    } catch (reason) {
      setDiscountError(reason instanceof Error ? reason.message : 'Could not save discount.');
    } finally {
      setBusy(false);
    }
  }

  return {
    token,
    isZh,
    commercialEnabled,
    canManage,
    platformCurrency,
    profile,
    connections,
    importConnections,
    hasEnabledKey,
    offers,
    offersComplete,
    resolvedRows,
    rowByAlias,
    counts,
    accessMode,
    defaultDiscountBps,
    defaultDiscountPercent,
    allowlistedModels,
    blocklistedModels,
    loading,
    error,
    notice,
    busy,
    importing,
    revision,
    setRevision,
    setNotice,
    activeModal,
    setActiveModal,
    browserInitialFilter,
    setBrowserInitialFilter,
    pickerQuery,
    setPickerQuery,
    pickerSelected,
    setPickerSelected,
    discountInput,
    setDiscountInput,
    discountError,
    setDiscountError,
    singleDiscountAlias,
    setSingleDiscountAlias,
    mediaRateModel,
    setMediaRateModel,
    refreshAll,
    applyPolicySync,
    handleModeChange,
    handleDefaultDiscountSubmit,
    handleImportAndSync,
    handlePickerSave,
    handleRemoveFromList,
    handleSingleDiscountSave,
  };
}
