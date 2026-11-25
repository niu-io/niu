import { Button } from '@/components/ui/button';
import { useLocale as useUILocale } from '@/shell/ui-locale';
import type { ModelWrite, ProviderConnection } from '@/features/providers/api';
import {
  BatchDiscountDialog,
  ModelDiscountDialog,
  type SingleModelPricingSubmit,
} from './ModelDiscountDialog';
import { ProviderModelEditorDialog, type ModelEditorTarget } from './ProviderModelEditorDialog';
import type { ResolvedModelRow } from './ProviderModelsTable';

export function ProviderModelsInlineView({
  token,
  busy,
  canManage,
  connections,
  currency,
  dialogError,
  discountDialog,
  discountTarget,
  batchDiscountOpen,
  eligibleCount,
  skippedCount,
  editor,
  openerRef,
  onBack,
  onCloseDiscount,
  onSubmitSingleDiscount,
  onCloseBatch,
  onSubmitBatchDiscount,
  onChangeConnection,
  onCloseEditor,
  onSaveManualModel,
}: {
  token: string;
  busy: boolean;
  canManage: boolean;
  connections: ProviderConnection[];
  currency: string;
  dialogError: string;
  discountDialog: { alias: string; enabling: boolean } | null;
  discountTarget: ResolvedModelRow | null;
  batchDiscountOpen: boolean;
  eligibleCount: number;
  skippedCount: number;
  editor: ModelEditorTarget | null;
  openerRef: React.RefObject<HTMLElement | null>;
  onBack: () => void;
  onCloseDiscount: () => void;
  onSubmitSingleDiscount: (payload: SingleModelPricingSubmit) => Promise<void>;
  onCloseBatch: () => void;
  onSubmitBatchDiscount: (discountPercent: number) => Promise<void>;
  onChangeConnection: (connectionId: string) => void;
  onCloseEditor: () => void;
  onSaveManualModel: (input: ModelWrite) => Promise<void>;
}) {
  const { t: uiT } = useUILocale();
  return (
    <div className="space-y-4 py-1">
      <div>
        <Button type="button" variant="ghost" size="sm" data-dialog-back disabled={busy} onClick={onBack}>
          ← {uiT('Back to models', '返回模型列表')}
        </Button>
      </div>
      {discountDialog && discountTarget && (
        <ModelDiscountDialog
          inline
          key={`${discountDialog.alias}:${discountTarget.offer?.revision ?? 'new'}`}
          open
          alias={discountDialog.alias}
          upstreamModel={discountTarget.primary?.model.upstream_model}
          currency={currency}
          upstreamHint={discountTarget.upstream}
          initialStandardInputNanos={discountTarget.stdInputNanos}
          initialStandardOutputNanos={discountTarget.stdOutputNanos}
          initialStandardCachedNanos={discountTarget.stdCachedNanos}
          initialDiscountPercent={discountTarget.discountPercent}
          hasExistingCustomerPrice={Boolean(discountTarget.retail)}
          enabling={discountDialog.enabling}
          busy={busy}
          error={dialogError}
          onClose={onCloseDiscount}
          onSubmit={onSubmitSingleDiscount}
        />
      )}
      {batchDiscountOpen && (
        <BatchDiscountDialog
          inline
          open={batchDiscountOpen}
          currency={currency}
          eligibleCount={eligibleCount}
          skippedCount={skippedCount}
          busy={busy}
          error={dialogError}
          onClose={onCloseBatch}
          onSubmit={onSubmitBatchDiscount}
        />
      )}
      {editor && (
        <ProviderModelEditorDialog
          inline
          token={token}
          canManage={canManage}
          busy={busy}
          connections={connections}
          editor={editor}
          openerRef={openerRef}
          onChangeConnection={onChangeConnection}
          onClose={onCloseEditor}
          onSave={onSaveManualModel}
        />
      )}
    </div>
  );
}
