import { IconCheck, IconDots } from '@tabler/icons-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import ProviderLogo from '@/components/ProviderLogo';
import { modelIdentity } from '@/lib/providers';
import { useLocale as useUILocale } from '@/shell/ui-locale';
import { modelCapabilityLabels, modelCheckLabel } from '@/features/providers/model-presentation';
import type { ProviderConnection, ProviderModel, ProviderModelCheck } from '@/features/providers/api';
import type { ProviderOffer, RetailPriceRecord } from '@niu-io/sdk/admin';
import { formatDiscountBadge, formatPer1MShort, type UpstreamStandardPrice } from './upstream-pricing';

export type ModelRowEntry = { connection: ProviderConnection; model: ProviderModel };
export type ModelCheckState = { identity: string; sequence: number; pending: boolean; result?: ProviderModelCheck; error?: string };

export type ResolvedModelRow = {
  alias: string;
  routes: ModelRowEntry[];
  primary: ModelRowEntry | undefined;
  offer: ProviderOffer | null;
  retail: RetailPriceRecord | null;
  upstream: UpstreamStandardPrice | null;
  stdInputNanos: string | null;
  stdOutputNanos: string | null;
  stdCachedNanos: string | null;
  stdCacheWriteNanos?: string | null;
  stdReasoningOutputNanos?: string | null;
  stdContextTiers?: NonNullable<ProviderOffer['context_tiers']>;
  discountPercent: number | null;
  isActive: boolean;
  offerActiveButMissingRetail: boolean;
};

export function checkIdentity(connection: ProviderConnection, model: ProviderModel) {
  return JSON.stringify([connection.id, connection.revision, model.alias, model.revision, model.upstream_model, model.enabled]);
}

export function ProviderModelsTable({
  rows,
  commercialEnabled,
  platformCurrency,
  canManage,
  busy,
  rowBusy,
  hasEnabledKey,
  hasConnections,
  selectedAliases,
  allVisibleSelected,
  checks,
  onToggleAll,
  onToggleRow,
  onEnable,
  onDisable,
  onOpenDiscount,
  onCheck,
  onEditRoute,
  onAddRoute,
  onMediaRates,
}: {
  rows: ResolvedModelRow[];
  commercialEnabled: boolean;
  platformCurrency: string;
  canManage: boolean;
  busy: boolean;
  rowBusy: string;
  hasEnabledKey: boolean;
  hasConnections: boolean;
  selectedAliases: Set<string>;
  allVisibleSelected: boolean;
  checks: Record<string, ModelCheckState>;
  onToggleAll: () => void;
  onToggleRow: (alias: string) => void;
  onEnable: (alias: string) => void;
  onDisable: (alias: string) => void;
  onOpenDiscount: (alias: string, enabling: boolean) => void;
  onCheck: (connection: ProviderConnection, model: ProviderModel) => void;
  onEditRoute: (connection: ProviderConnection, model: ProviderModel) => void;
  onAddRoute: (alias: string) => void;
  onMediaRates: (alias: string) => void;
}) {
  const { t: uiT, format: uiF, locale } = useUILocale();
  const isZh = locale === 'zh-CN';

  return (
    <div className="table-wrap">
      <Table>
        <TableHeader>
          <TableRow>
            {commercialEnabled && (
              <TableHead className="w-9">
                <Checkbox
                  aria-label={uiT('Select all visible models', '全选当前列表模型')}
                  checked={allVisibleSelected}
                  onCheckedChange={onToggleAll}
                />
              </TableHead>
            )}
            <TableHead className="whitespace-nowrap">{uiT('Model')}</TableHead>
            {commercialEnabled && <TableHead className="whitespace-nowrap">{uiT('Upstream standard price', '上游标准价 (输入/输出 1M)')}</TableHead>}
            {commercialEnabled && <TableHead className="whitespace-nowrap">{uiT('Discount & cost', '折扣 / 采购成本')}</TableHead>}
            <TableHead className="whitespace-nowrap">{uiT('Status')}</TableHead>
            <TableHead className="sticky right-0 bg-background whitespace-nowrap text-right">{uiT('Actions')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(info => {
            const { alias, primary } = info;
            const isRowBusy = rowBusy === alias;
            const media = info.offer?.rate_kind === 'media' || info.routes.some(r => !!r.model.capabilities.video_schema);
            const check = primary ? checks[`${primary.connection.id}:${primary.model.alias}`] : undefined;
            const currentCheck = primary && check?.identity === checkIdentity(primary.connection, primary.model) ? check : undefined;
            const capabilities = primary ? modelCapabilityLabels(primary.model.capabilities) : [];

            return (
              <TableRow key={alias}>
                {commercialEnabled && (
                  <TableCell className="align-middle">
                    <Checkbox
                      aria-label={uiF('Select {0}', [alias])}
                      checked={selectedAliases.has(alias)}
                      onCheckedChange={() => onToggleRow(alias)}
                    />
                  </TableCell>
                )}

                <TableCell className="align-middle">
                  <div className="flex items-center gap-2">
                    <ProviderLogo
                      provider={modelIdentity({
                        id: alias,
                        upstream_model: primary?.model.upstream_model,
                        catalog: primary?.model.capabilities?.catalog,
                      })}
                      size="small"
                    />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-medium break-all">{alias}</span>
                        {capabilities.slice(0, 2).map(label => (
                          <Badge key={label} variant="secondary" className="px-1.5 py-0 text-[11px] font-normal">
                            {label}
                          </Badge>
                        ))}
                      </div>
                      {primary && primary.model.upstream_model !== alias && (
                        <p className="font-mono text-xs text-muted-foreground break-all">{primary.model.upstream_model}</p>
                      )}
                      {currentCheck?.error ? (
                        <p className="text-xs text-destructive" role="alert">{uiT(currentCheck.error)}</p>
                      ) : currentCheck?.result && primary ? (
                        <p className="text-xs text-muted-foreground" aria-live="polite">
                          {modelCheckLabel(currentCheck.result, primary.model.capabilities)}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </TableCell>

                {commercialEnabled && (
                  <TableCell className="align-middle whitespace-nowrap tabular-nums text-sm">
                    {info.stdInputNanos && info.stdOutputNanos && platformCurrency ? (
                      <span>
                        {formatPer1MShort(info.stdInputNanos, platformCurrency)} / {formatPer1MShort(info.stdOutputNanos, platformCurrency)}
                      </span>
                    ) : info.upstream ? (
                      <span className="text-xs text-muted-foreground">
                        {formatPer1MShort(info.upstream.inputPer1MNanos, info.upstream.currency)} / {formatPer1MShort(info.upstream.outputPer1MNanos, info.upstream.currency)}{' '}
                        ({info.upstream.currency})
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">{uiT('Enter on enable', '启用时填写')}</span>
                    )}
                  </TableCell>
                )}

                {commercialEnabled && (
                  <TableCell className="align-middle whitespace-nowrap text-sm">
                    {info.offer && info.offer.rate_kind !== 'media' ? (
                      <div className="space-y-0.5">
                        <Badge variant={info.discountPercent != null && Math.abs(info.discountPercent - 100) >= 0.05 ? 'secondary' : 'outline'} className="font-normal">
                          {formatDiscountBadge(info.discountPercent, isZh)}
                        </Badge>
                        <p className="text-xs text-muted-foreground tabular-nums">
                          {formatPer1MShort(info.offer.prompt_rate, info.offer.currency)} / {formatPer1MShort(info.offer.completion_rate, info.offer.currency)}
                        </p>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">{uiT('No discount (default)', '默认无折扣')}</span>
                    )}
                  </TableCell>
                )}

                <TableCell className="align-middle whitespace-nowrap">
                  {info.isActive ? (
                    <Badge variant="secondary" className="gap-1 font-normal">
                      <IconCheck size={12} aria-hidden="true" />
                      <span>{uiT('Active', '可用')}</span>
                    </Badge>
                  ) : info.offerActiveButMissingRetail ? (
                    <Badge variant="outline" className="font-normal">{uiT('Needs selling price', '待补全售价')}</Badge>
                  ) : (
                    <Badge variant="outline" className="font-normal text-muted-foreground">{uiT('Inactive', '未启用')}</Badge>
                  )}
                </TableCell>

                <TableCell className="sticky right-0 bg-background align-middle whitespace-nowrap text-right">
                  <div className="inline-flex items-center justify-end gap-1.5">
                    {!info.isActive ? (
                      <Button
                        type="button"
                        size="xs"
                        variant="outline"
                        disabled={!canManage || busy || isRowBusy || !hasEnabledKey}
                        onClick={() => onEnable(alias)}
                      >
                        {isRowBusy ? uiT('Enabling…', '启用中…') : uiT('Enable', '启用')}
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        size="xs"
                        variant="outline"
                        disabled={!canManage || busy || isRowBusy}
                        onClick={() => onDisable(alias)}
                      >
                        {isRowBusy ? uiT('Disabling…', '停用中…') : uiT('Disable', '停用')}
                      </Button>
                    )}
                    {commercialEnabled && !media && (
                      <Button
                        type="button"
                        size="xs"
                        variant="outline"
                        disabled={!canManage || busy || isRowBusy || !hasEnabledKey}
                        onClick={() => onOpenDiscount(alias, !info.isActive)}
                      >
                        {uiT('Discount', '设置折扣')}
                      </Button>
                    )}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button type="button" size="icon-xs" variant="ghost" aria-label={uiF('More actions for {0}', [alias])}>
                          <IconDots size={15} />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {primary && (
                          <DropdownMenuItem disabled={!canManage || currentCheck?.pending} onSelect={() => onCheck(primary.connection, primary.model)}>
                            {currentCheck?.pending ? uiT('Checking…') : uiT('Check connection', '测试连通')}
                          </DropdownMenuItem>
                        )}
                        {primary ? (
                          <DropdownMenuItem disabled={!canManage} onSelect={() => onEditRoute(primary.connection, primary.model)}>
                            {uiT('Edit model')}
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem disabled={!canManage || !hasConnections} onSelect={() => onAddRoute(alias)}>
                            {uiT('Add model connection')}
                          </DropdownMenuItem>
                        )}
                        {commercialEnabled && media && (
                          <DropdownMenuItem onSelect={() => onMediaRates(alias)}>
                            {uiT('Media rates', '媒体费率')}
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
