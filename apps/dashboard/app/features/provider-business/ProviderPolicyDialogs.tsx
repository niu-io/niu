import { type FormEvent } from 'react';
import { IconSearch } from '@tabler/icons-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useLocale as useUILocale } from '@/shell/ui-locale';
import type { ProviderModelAccessMode, ProviderOffer } from '@niu-io/sdk/admin';
import { formatDiscountBadge, parseDiscountPercent } from './upstream-pricing';
import type { ResolvedModelRow } from './ProviderModelsTable';
import ProviderModels from './ProviderModels';
import { ModelDiscountDialog, type SingleModelPricingSubmit } from './ModelDiscountDialog';
import MediaRatePublisher from './MediaRatePublisher';
import MediaRateHistory from './MediaRateHistory';

const DISCOUNT_PRESETS = [100, 90, 80, 70, 50] as const;

export type PolicyModalKind =
  | 'browser'
  | 'picker'
  | 'default-discount'
  | 'single-discount'
  | 'media-rates'
  | 'media-history'
  | null;

export function ProviderPolicyDialogs({
  activeModal,
  setActiveModal,
  busy,
  token,
  providerId,
  providerSlug,
  canManage,
  commercialEnabled,
  platformCurrency,
  offers,
  offersComplete,
  browserInitialFilter,
  browserTriggerRef,
  discountTriggerRef,
  pickerTriggerRef,
  accessMode,
  defaultDiscountPercent,
  discountInput,
  setDiscountInput,
  discountError,
  setDiscountError,
  onSubmitDefaultDiscount,
  pickerQuery,
  setPickerQuery,
  pickerCandidates,
  pickerSelected,
  setPickerSelected,
  onSavePicker,
  singleDiscountRow,
  setSingleDiscountAlias,
  onSaveSingleDiscount,
  mediaRateModel,
  setMediaRateModel,
  revision,
  onRefreshAll,
  onMediaSavedNotice,
}: {
  activeModal: PolicyModalKind;
  setActiveModal: (value: PolicyModalKind) => void;
  busy: boolean;
  token: string;
  providerId: string;
  providerSlug: string;
  canManage: boolean;
  commercialEnabled: boolean;
  platformCurrency: string;
  offers: ProviderOffer[];
  offersComplete: boolean;
  browserInitialFilter: 'all' | 'active' | 'inactive';
  browserTriggerRef: React.RefObject<HTMLButtonElement | null>;
  discountTriggerRef: React.RefObject<HTMLButtonElement | null>;
  pickerTriggerRef: React.RefObject<HTMLButtonElement | null>;
  accessMode: ProviderModelAccessMode;
  defaultDiscountPercent: number;
  discountInput: string;
  setDiscountInput: (value: string) => void;
  discountError: string;
  setDiscountError: (value: string) => void;
  onSubmitDefaultDiscount: (event: FormEvent) => Promise<void>;
  pickerQuery: string;
  setPickerQuery: (value: string) => void;
  pickerCandidates: ResolvedModelRow[];
  pickerSelected: Set<string>;
  setPickerSelected: React.Dispatch<React.SetStateAction<Set<string>>>;
  onSavePicker: () => Promise<void>;
  singleDiscountRow: ResolvedModelRow | null;
  setSingleDiscountAlias: (value: string | null) => void;
  onSaveSingleDiscount: (payload: SingleModelPricingSubmit) => Promise<void>;
  mediaRateModel: string | null;
  setMediaRateModel: (value: string | null) => void;
  revision: number;
  onRefreshAll: () => void;
  onMediaSavedNotice: () => void;
}) {
  const { t: uiT, format: uiF, locale } = useUILocale();
  const isZh = locale === 'zh-CN';

  return (
    <>
      <Dialog
        open={activeModal === 'browser'}
        onOpenChange={open => {
          if (!open && !busy) setActiveModal(null);
        }}
      >
        <DialogContent
          className="sm:max-w-5xl [&:has([data-dialog-back])>[data-slot=dialog-footer]]:hidden"
          onEscapeKeyDown={event => {
            const back = (event.currentTarget as HTMLElement).querySelector<HTMLButtonElement>('[data-dialog-back]');
            if (back) {
              event.preventDefault();
              if (!back.disabled) back.click();
            }
          }}
          onCloseAutoFocus={event => {
            if (browserTriggerRef.current?.isConnected) {
              event.preventDefault();
              browserTriggerRef.current.focus();
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>{uiT('Browse Provider models', '浏览供应商模型')}</DialogTitle>
            <DialogDescription>
              {uiT(
                'Inspect synced models, test upstream connectivity, add custom mappings, or configure per-model pricing overrides.',
                '搜索查看已同步模型、检测上游连通性、手动添加映射，或单独覆盖某款模型的折扣与视频费率。',
              )}
            </DialogDescription>
          </DialogHeader>
          <ProviderModels
            withinDialog
            initialStatusFilter={browserInitialFilter}
            token={token}
            providerId={providerId}
            providerSlug={providerSlug}
            canManage={canManage}
            offers={commercialEnabled ? offers : []}
            offersComplete={offersComplete}
            commercialEnabled={commercialEnabled}
            onEnableOffer={() => {}}
            onOffer={(alias, media) => {
              if (media) {
                setMediaRateModel(alias);
                setActiveModal('media-rates');
              }
            }}
            onSaved={onRefreshAll}
          />
          <DialogFooter>
            {commercialEnabled && (
              <Button type="button" variant="outline" onClick={() => setActiveModal('media-history')}>
                {uiT('Media rate history', '视频与媒体费率历史')}
              </Button>
            )}
            <Button type="button" variant="outline" onClick={() => setActiveModal(null)}>
              {uiT('Done')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={activeModal === 'default-discount'}
        onOpenChange={open => {
          if (!open && !busy) setActiveModal(null);
        }}
      >
        <DialogContent
          className="sm:max-w-md"
          onCloseAutoFocus={event => {
            if (discountTriggerRef.current?.isConnected) {
              event.preventDefault();
              discountTriggerRef.current.focus();
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>{uiT('Default purchase discount', '设置供应商默认折扣')}</DialogTitle>
            <DialogDescription>
              {uiT(
                'Set the default percentage of upstream standard price paid to this Provider (100 = no discount). Applies to newly synced models and updates active models.',
                '设置向此供应商结算占上游标准价的默认百分比（100 = 默认无折扣，80 = 8 折）。保存后将同步应用到可用模型。',
              )}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={event => void onSubmitDefaultDiscount(event)} className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="provider-default-discount-input">
                {uiT('Discount (%)', '折扣百分比（%，100 = 无折扣）')}
              </Label>
              <Input
                id="provider-default-discount-input"
                inputMode="decimal"
                required
                disabled={busy}
                value={discountInput}
                onChange={e => {
                  setDiscountInput(e.target.value);
                  setDiscountError('');
                }}
              />
              <div className="flex flex-wrap gap-1.5">
                {DISCOUNT_PRESETS.map(preset => (
                  <Button
                    key={preset}
                    type="button"
                    size="xs"
                    variant={parseDiscountPercent(discountInput) === preset ? 'default' : 'outline'}
                    disabled={busy}
                    onClick={() => {
                      setDiscountInput(String(preset));
                      setDiscountError('');
                    }}
                  >
                    {formatDiscountBadge(preset, isZh)}
                  </Button>
                ))}
              </div>
            </div>
            {discountError && (
              <Alert variant="destructive">
                <AlertDescription>{uiT(discountError)}</AlertDescription>
              </Alert>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" disabled={busy} onClick={() => setActiveModal(null)}>
                {uiT('Cancel')}
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? uiT('Saving…') : uiT('Save & apply', '保存并生效')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={activeModal === 'picker'}
        onOpenChange={open => {
          if (!open && !busy) setActiveModal(null);
        }}
      >
        <DialogContent
          className="sm:max-w-lg"
          onCloseAutoFocus={event => {
            if (pickerTriggerRef.current?.isConnected) {
              event.preventDefault();
              pickerTriggerRef.current.focus();
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {accessMode === 'blocklist'
                ? uiT('Add blocked models', '添加排除模型')
                : uiT('Add allowed models', '添加白名单模型')}
            </DialogTitle>
            <DialogDescription>
              {accessMode === 'blocklist'
                ? uiT('Selected models will be disabled on this Provider.', '选中的模型将在此供应商上停用，其余模型保持可用。')
                : uiT('Selected models will be enabled on this Provider.', '选中的模型将加入白名单并在此供应商上启用。')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="relative">
              <IconSearch size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input
                className="pl-9"
                placeholder={uiT('Filter by model…', '搜索模型…')}
                aria-label={uiT('Filter by model…', '搜索模型…')}
                value={pickerQuery}
                onChange={e => setPickerQuery(e.target.value)}
              />
            </div>
            <div className="max-h-72 overflow-y-auto rounded-md border border-border divide-y divide-border">
              {pickerCandidates.length === 0 ? (
                <p className="p-4 text-center text-sm text-muted-foreground">
                  {uiT('No matching models available.', '没有可添加的匹配模型。')}
                </p>
              ) : (
                pickerCandidates.slice(0, 100).map(candidate => {
                  const checked = pickerSelected.has(candidate.alias);
                  return (
                    <label
                      key={candidate.alias}
                      className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-muted/50"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => {
                          setPickerSelected(prev => {
                            const next = new Set(prev);
                            if (next.has(candidate.alias)) next.delete(candidate.alias);
                            else next.add(candidate.alias);
                            return next;
                          });
                        }}
                      />
                      <span className="min-w-0 flex-1 break-all font-medium">{candidate.alias}</span>
                    </label>
                  );
                })
              )}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={busy} onClick={() => setActiveModal(null)}>
              {uiT('Cancel')}
            </Button>
            <Button type="button" disabled={busy || pickerSelected.size === 0} onClick={() => void onSavePicker()}>
              {busy ? uiT('Saving…') : uiF('Add ({0})', [pickerSelected.size])}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {activeModal === 'single-discount' && singleDiscountRow && (
        <ModelDiscountDialog
          open
          alias={singleDiscountRow.alias}
          upstreamModel={singleDiscountRow.primary?.model.upstream_model}
          currency={platformCurrency}
          upstreamHint={singleDiscountRow.upstream}
          initialStandardInputNanos={singleDiscountRow.stdInputNanos}
          initialStandardOutputNanos={singleDiscountRow.stdOutputNanos}
          initialStandardCachedNanos={singleDiscountRow.stdCachedNanos}
          initialDiscountPercent={singleDiscountRow.discountPercent ?? defaultDiscountPercent}
          hasExistingCustomerPrice={Boolean(singleDiscountRow.retail)}
          enabling={!singleDiscountRow.isActive}
          busy={busy}
          error={discountError}
          onClose={() => {
            if (!busy) {
              setActiveModal(null);
              setSingleDiscountAlias(null);
            }
          }}
          onSubmit={onSaveSingleDiscount}
        />
      )}

      {activeModal === 'media-rates' && mediaRateModel !== null && (
        <MediaRatePublisher
          key={`${providerId}:${mediaRateModel}`}
          token={token}
          supplier={providerId}
          initialModel={mediaRateModel}
          onClose={() => {
            setMediaRateModel(null);
            setActiveModal('browser');
          }}
          onSaved={() => {
            setMediaRateModel(null);
            onMediaSavedNotice();
            onRefreshAll();
            setActiveModal('browser');
          }}
        />
      )}

      <Dialog
        open={activeModal === 'media-history'}
        onOpenChange={open => {
          if (!open) setActiveModal('browser');
        }}
      >
        <DialogContent className="sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>{uiT('Media rate history', '视频与媒体费率历史')}</DialogTitle>
            <DialogDescription>{uiT('Published media purchase rates for this Provider.')}</DialogDescription>
          </DialogHeader>
          <MediaRateHistory token={token} supplier={providerId} showConfiguredModels refreshSignal={revision} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setActiveModal('browser')}>
              ← {uiT('Back to models', '返回模型浏览')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
