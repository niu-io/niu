import { useMemo, useRef } from 'react';
import {
  IconChevronDown,
  IconDownload,
  IconListSearch,
  IconPercentage,
  IconPlus,
  IconRefresh,
  IconShieldOff,
  IconTrash,
} from '@tabler/icons-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia } from '@/components/ui/empty';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { FormSectionSkeleton } from '@/components/PageSkeletons';
import { useLocale as useUILocale } from '@/shell/ui-locale';
import { formatDiscountBadge, formatPer1MShort } from './upstream-pricing';
import { ProviderPolicyDialogs } from './ProviderPolicyDialogs';
import { useProviderModelPolicy } from './useProviderModelPolicy';

export default function ProviderModelPolicySection({
  providerId,
  providerSlug,
}: {
  providerId: string;
  providerSlug: string;
}) {
  const { t: uiT, format: uiF } = useUILocale();
  const state = useProviderModelPolicy(providerId);
  const {
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
  } = state;

  const browserTriggerRef = useRef<HTMLButtonElement>(null);
  const discountTriggerRef = useRef<HTMLButtonElement>(null);
  const pickerTriggerRef = useRef<HTMLButtonElement>(null);

  const modeLabel = {
    all: uiT('All models (default)', '全部模型（默认）'),
    blocklist: uiT('Blocklist (exclude selected)', '黑名单（排除指定模型）'),
    allowlist: uiT('Allowlist (only selected)', '白名单（仅启用指定模型）'),
  }[accessMode];

  const scopedListAliases =
    accessMode === 'blocklist' ? blocklistedModels : accessMode === 'allowlist' ? allowlistedModels : [];

  const pickerCandidates = useMemo(() => {
    const existing = new Set(scopedListAliases);
    const q = pickerQuery.trim().toLowerCase();
    return resolvedRows.filter(row => {
      if (existing.has(row.alias)) return false;
      if (!q) return true;
      return `${row.alias} ${row.primary?.model.upstream_model ?? ''}`.toLowerCase().includes(q);
    });
  }, [resolvedRows, scopedListAliases, pickerQuery]);

  const singleDiscountRow = singleDiscountAlias ? rowByAlias.get(singleDiscountAlias) ?? null : null;

  return (
    <section
      className="space-y-4"
      aria-label={commercialEnabled ? uiT('Models & discounts', '模型与折扣') : uiT('Model access', '模型可用范围')}
    >
      <div className="rounded-[var(--radius-panel)] bg-card p-5 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-[15px] font-semibold">
                {commercialEnabled ? uiT('Models & discounts', '模型与折扣') : uiT('Model access', '模型可用范围')}
              </h2>
              {!loading && counts.total > 0 && (
                <Badge variant={counts.active > 0 ? 'secondary' : 'outline'} className="font-normal tabular-nums">
                  {uiF('{0} active · {1} synced', [counts.active, counts.total])}
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {commercialEnabled
                ? uiT(
                    'All available models are enabled by default with no discount unless you configure a default discount, allowlist, or blocklist.',
                    '默认无折扣启用全部可用模型；仅在需要限制模型范围或设置采购折扣时按需调整。',
                  )
                : uiT(
                    'All imported models are enabled by default unless restricted by an allowlist or blocklist.',
                    '默认启用全部已同步模型；仅在需要限制模型范围时配置白名单或黑名单。',
                  )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {importConnections.length === 1 && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!canManage || loading || busy || importing}
                onClick={() => void handleImportAndSync(importConnections[0])}
              >
                <IconDownload size={15} aria-hidden="true" />
                <span>{importing ? uiT('Importing…') : uiT('Import models')}</span>
              </Button>
            )}
            {importConnections.length > 1 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" size="sm" variant="outline" disabled={!canManage || loading || busy || importing}>
                    <IconDownload size={15} aria-hidden="true" />
                    <span>{importing ? uiT('Importing…') : uiT('Import models')}</span>
                    <IconChevronDown size={15} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem disabled={busy} onSelect={() => void handleImportAndSync()}>
                    {uiT('Sync all enabled keys', '同步全部已启用密钥')}
                  </DropdownMenuItem>
                  {importConnections.map(c => (
                    <DropdownMenuItem key={c.id} disabled={busy} onSelect={() => void handleImportAndSync(c)}>
                      {uiF('Import from {0}', [c.name || uiT('Unnamed API key')])}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <Button
              ref={browserTriggerRef}
              type="button"
              size="sm"
              variant="outline"
              disabled={loading || !connections.length}
              onClick={() => {
                setBrowserInitialFilter('all');
                setActiveModal('browser');
              }}
            >
              <IconListSearch size={15} aria-hidden="true" />
              <span>{counts.total > 0 ? uiF('Browse models ({0})', [counts.total]) : uiT('Browse models', '浏览模型')}</span>
            </Button>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label={uiT('Refresh models', '刷新模型')}
              title={uiT('Refresh models', '刷新模型')}
              disabled={loading || busy}
              onClick={() => setRevision(v => v + 1)}
            >
              <IconRefresh size={15} className={loading ? 'animate-spin' : undefined} aria-hidden="true" />
            </Button>
          </div>
        </div>

        {notice && <p role="status" className="text-sm text-foreground">{uiT(notice)}</p>}
        {error && (
          <Alert variant="destructive">
            <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
              <span>{uiT(error)}</span>
              <Button type="button" variant="outline" size="sm" onClick={() => setRevision(v => v + 1)}>
                {uiT('Retry')}
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {loading && !profile ? (
          <FormSectionSkeleton fields={2} label={uiT('Loading models…')} />
        ) : (
          <>
            <div className={`grid gap-4 ${commercialEnabled ? 'sm:grid-cols-2' : 'sm:max-w-sm'}`}>
              <div className="grid gap-2">
                <Label htmlFor="provider-model-access-mode">{uiT('Model access', '模型可用范围')}</Label>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      id="provider-model-access-mode"
                      type="button"
                      variant="outline"
                      className="w-full justify-between font-normal"
                      disabled={!canManage || busy || !profile}
                    >
                      <span>{modeLabel}</span>
                      <IconChevronDown size={16} aria-hidden="true" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)]">
                    <DropdownMenuRadioGroup value={accessMode} onValueChange={val => void handleModeChange(val)}>
                      <DropdownMenuRadioItem value="all">{uiT('All models (default)', '全部模型（默认）')}</DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="blocklist">{uiT('Blocklist (exclude selected)', '黑名单（排除指定模型）')}</DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="allowlist">{uiT('Allowlist (only selected)', '白名单（仅启用指定模型）')}</DropdownMenuRadioItem>
                    </DropdownMenuRadioGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {commercialEnabled && (
                <div className="grid gap-2">
                  <span className="text-sm font-medium leading-snug">
                    {uiT('Default purchase discount', '默认采购折扣')}
                  </span>
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-input bg-background px-3 min-h-9 py-1.5 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{formatDiscountBadge(defaultDiscountPercent, isZh)}</span>
                      {counts.customOverrideCount > 0 && (
                        <span className="text-xs text-muted-foreground">
                          · {counts.customOverrideCount === 1
                            ? uiT('1 custom model override', '1 个模型单独设价')
                            : uiF('{0} custom model overrides', [counts.customOverrideCount])}
                        </span>
                      )}
                    </div>
                    <Button
                      ref={discountTriggerRef}
                      type="button"
                      variant="ghost"
                      size="xs"
                      disabled={!canManage || busy || !profile}
                      onClick={() => {
                        setDiscountInput(String(defaultDiscountPercent));
                        setDiscountError('');
                        setActiveModal('default-discount');
                      }}
                    >
                      <IconPercentage size={14} aria-hidden="true" />
                      <span>{uiT('Edit discount', '修改折扣')}</span>
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {accessMode === 'all' && (
              <div className="border-t border-border/60 pt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
                <span>
                  {!connections.some(connection => connection.has_credential)
                    ? uiT('API key not configured. Configure an API key above to import and serve models.', 'API 密钥未配置。请先在上方配置 API 密钥，即可导入并启用模型。')
                    : !hasEnabledKey
                      ? uiT('All configured API keys are disabled. Enable an API key above to serve models.', '已配置的 API 密钥处于停用状态，请先在上方启用 API 密钥。')
                      : counts.total === 0
                      ? uiT('No models synced yet. Click "Import models" to discover available models from this Provider.', '尚未同步模型。点击「导入模型」即可拉取并自动启用可用模型。')
                      : commercialEnabled && counts.unactivatedPricedCount > 0
                        ? counts.unactivatedPricedCount === 1
                          ? uiT('1 priced model is ready to activate under your default discount.', '有 1 个具备标准售价的模型可按默认折扣一键启用。')
                          : uiF('{0} priced models are ready to activate under your default discount.', [counts.unactivatedPricedCount])
                        : uiT('Individual models are hidden by default. Use "Browse models" to inspect the catalog, test connectivity, or configure per-model overrides.', '缺省不在此展开完整模型列表。点击「浏览模型」可搜索查看全量模型、测试连通性或单独设置某款模型的折扣与视频费率。')}
                </span>
                {commercialEnabled && hasEnabledKey && counts.unactivatedPricedCount > 0 && (
                  <Button
                    type="button"
                    size="sm"
                    disabled={!canManage || busy}
                    onClick={() => void applyPolicySync('all', defaultDiscountBps, allowlistedModels, blocklistedModels, false)}
                  >
                    {busy
                      ? uiT('Activating…', '正在启用…')
                      : counts.unactivatedPricedCount === 1
                        ? uiT('Activate 1 priced model', '一键启用 1 个已定价模型')
                        : uiF('Activate {0} priced models', [counts.unactivatedPricedCount])}
                  </Button>
                )}
              </div>
            )}

            {(accessMode === 'blocklist' || accessMode === 'allowlist') && (
              <div className="border-t border-border/60 pt-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="space-y-0.5">
                    <h3 className="text-sm font-medium">
                      {accessMode === 'blocklist'
                        ? uiF('Blocked models ({0})', [blocklistedModels.length])
                        : uiF('Allowlisted models ({0})', [allowlistedModels.length])}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      {accessMode === 'blocklist'
                        ? uiT('All other models from this Provider remain enabled.', '除下列被排除的模型外，该供应商其余可用模型均保持启用。')
                        : uiT('Only the models listed below are enabled on this Provider.', '仅下列白名单中的模型会在此供应商上启用。')}
                    </p>
                  </div>
                  <Button
                    ref={pickerTriggerRef}
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={!canManage || busy || counts.total === 0}
                    onClick={() => {
                      setPickerQuery('');
                      setPickerSelected(new Set());
                      setActiveModal('picker');
                    }}
                  >
                    <IconPlus size={15} aria-hidden="true" />
                    <span>{accessMode === 'blocklist' ? uiT('Add blocked models', '添加排除模型') : uiT('Add allowed models', '添加白名单模型')}</span>
                  </Button>
                </div>

                {scopedListAliases.length === 0 ? (
                  <Empty className="py-6">
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <IconShieldOff size={18} aria-hidden="true" />
                      </EmptyMedia>
                      <EmptyDescription>
                        {accessMode === 'blocklist'
                          ? uiT('No blocked models. All available models are currently enabled.', '暂无排除模型，当前全部可用模型均已开启。')
                          : uiT('Allowlist is empty. Add models to enable them on this Provider.', '白名单为空，请添加需要启用的模型。')}
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                ) : (
                  <div className="table-wrap">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{uiT('Model')}</TableHead>
                          {accessMode === 'allowlist' && commercialEnabled && (
                            <TableHead className="whitespace-nowrap">{uiT('Discount & cost', '折扣 / 采购成本')}</TableHead>
                          )}
                          <TableHead className="whitespace-nowrap">{uiT('Status')}</TableHead>
                          <TableHead className="text-right whitespace-nowrap">{uiT('Actions')}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {scopedListAliases.map(alias => {
                          const row = rowByAlias.get(alias);
                          return (
                            <TableRow key={alias}>
                              <TableCell className="font-medium break-all">
                                {alias}
                                {row?.primary && row.primary.model.upstream_model !== alias && (
                                  <span className="ml-2 font-mono text-xs font-normal text-muted-foreground">
                                    ({row.primary.model.upstream_model})
                                  </span>
                                )}
                              </TableCell>
                              {accessMode === 'allowlist' && commercialEnabled && (
                                <TableCell className="whitespace-nowrap text-sm">
                                  {row?.offer && row.offer.rate_kind !== 'media' ? (
                                    <span>
                                      {formatDiscountBadge(row.discountPercent, isZh)} ·{' '}
                                      <span className="text-xs text-muted-foreground tabular-nums">
                                        {formatPer1MShort(row.offer.prompt_rate, row.offer.currency)} /{' '}
                                        {formatPer1MShort(row.offer.completion_rate, row.offer.currency)}
                                      </span>
                                    </span>
                                  ) : (
                                    <span className="text-xs text-muted-foreground">{formatDiscountBadge(defaultDiscountPercent, isZh)}</span>
                                  )}
                                </TableCell>
                              )}
                              <TableCell className="whitespace-nowrap">
                                {accessMode === 'blocklist' ? (
                                  <Badge variant="outline" className="font-normal">{uiT('Blocked', '已排除')}</Badge>
                                ) : row?.isActive ? (
                                  <Badge variant="secondary" className="font-normal">{uiT('Active', '可用')}</Badge>
                                ) : (
                                  <Badge variant="outline" className="font-normal">{uiT('Needs pricing', '待补全价格')}</Badge>
                                )}
                              </TableCell>
                              <TableCell className="text-right whitespace-nowrap">
                                <div className="inline-flex items-center justify-end gap-1">
                                  {accessMode === 'allowlist' && commercialEnabled && row && (
                                    <Button
                                      type="button"
                                      size="xs"
                                      variant="outline"
                                      disabled={!canManage || busy}
                                      onClick={() => {
                                        setDiscountError('');
                                        setSingleDiscountAlias(alias);
                                        setActiveModal('single-discount');
                                      }}
                                    >
                                      {row.isActive ? uiT('Discount', '折扣') : uiT('Set price & enable', '设价并启用')}
                                    </Button>
                                  )}
                                  <Button
                                    type="button"
                                    size="xs"
                                    variant="ghost"
                                    disabled={!canManage || busy}
                                    aria-label={uiF('Remove {0}', [alias])}
                                    onClick={() => void handleRemoveFromList(alias)}
                                  >
                                    <IconTrash size={14} aria-hidden="true" />
                                    <span>{uiT('Remove', '移除')}</span>
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      <ProviderPolicyDialogs
        activeModal={activeModal}
        setActiveModal={setActiveModal}
        busy={busy}
        token={token}
        providerId={providerId}
        providerSlug={providerSlug}
        canManage={canManage}
        commercialEnabled={commercialEnabled}
        platformCurrency={platformCurrency}
        offers={offers}
        offersComplete={offersComplete}
        browserInitialFilter={browserInitialFilter}
        browserTriggerRef={browserTriggerRef}
        discountTriggerRef={discountTriggerRef}
        pickerTriggerRef={pickerTriggerRef}
        accessMode={accessMode}
        defaultDiscountPercent={defaultDiscountPercent}
        discountInput={discountInput}
        setDiscountInput={setDiscountInput}
        discountError={discountError}
        setDiscountError={setDiscountError}
        onSubmitDefaultDiscount={handleDefaultDiscountSubmit}
        pickerQuery={pickerQuery}
        setPickerQuery={setPickerQuery}
        pickerCandidates={pickerCandidates}
        pickerSelected={pickerSelected}
        setPickerSelected={setPickerSelected}
        onSavePicker={handlePickerSave}
        singleDiscountRow={singleDiscountRow}
        setSingleDiscountAlias={setSingleDiscountAlias}
        onSaveSingleDiscount={handleSingleDiscountSave}
        mediaRateModel={mediaRateModel}
        setMediaRateModel={setMediaRateModel}
        revision={revision}
        onRefreshAll={refreshAll}
        onMediaSavedNotice={() => setNotice(uiT('Media rate saved.'))}
      />
    </section>
  );
}
