import { useEffect, useRef, useState } from 'react';
import { IconChevronDown } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import ModelMappingForm from '@/features/providers/components/ModelMappingForm';
import {
  integrationLabels,
  request,
  type ModelWrite,
  type ProviderCatalogModel,
  type ProviderConnection,
  type ProviderDiscoveryEvidence,
  type ProviderModel,
} from '@/features/providers/api';
import { useLocale as useUILocale } from '@/shell/ui-locale';

export type ModelEditorTarget = {
  connectionId: string;
  model: ProviderModel | null;
  initialAlias?: string;
};

export function ProviderModelEditorDialog({
  token,
  canManage,
  busy,
  connections,
  editor,
  openerRef,
  onChangeConnection,
  onClose,
  onSave,
}: {
  token: string;
  canManage: boolean;
  busy: boolean;
  connections: ProviderConnection[];
  editor: ModelEditorTarget | null;
  openerRef: React.RefObject<HTMLElement | null>;
  onChangeConnection: (connectionId: string) => void;
  onClose: () => void;
  onSave: (input: ModelWrite) => Promise<void>;
}) {
  const { t: uiT, format: uiF } = useUILocale();
  const [videoSubViewOpen, setVideoSubViewOpen] = useState(false);
  const [catalog, setCatalog] = useState<ProviderCatalogModel[]>([]);
  const [discovery, setDiscovery] = useState<ProviderDiscoveryEvidence | null>(null);
  const [catalogError, setCatalogError] = useState('');
  const [catalogLoading, setCatalogLoading] = useState(false);
  const catalogRequest = useRef<AbortController | null>(null);

  useEffect(() => {
    catalogRequest.current?.abort();
    setCatalog([]);
    setDiscovery(null);
    setCatalogError('');
    setCatalogLoading(false);
    setVideoSubViewOpen(false);
    return () => catalogRequest.current?.abort();
  }, [editor?.connectionId, editor?.model?.alias]);

  const selectedConnection = connections.find(connection => connection.id === editor?.connectionId);

  async function loadCatalog() {
    if (!editor || !canManage || catalogLoading) return;
    const controller = new AbortController();
    catalogRequest.current?.abort();
    catalogRequest.current = controller;
    setCatalogLoading(true);
    setCatalogError('');
    try {
      const result = await request<{ data: ProviderCatalogModel[]; discovery?: ProviderDiscoveryEvidence }>(
        token,
        `/api/v1/admin/providers/connections/${encodeURIComponent(editor.connectionId)}/catalog`,
        'GET',
        undefined,
        controller.signal,
      );
      if (!controller.signal.aborted) {
        setCatalog(result.data);
        setDiscovery(result.discovery ?? null);
      }
    } catch {
      if (!controller.signal.aborted) {
        setCatalogError('Catalog unavailable.');
        setDiscovery(null);
      }
    } finally {
      if (!controller.signal.aborted) setCatalogLoading(false);
    }
  }

  return (
    <Dialog open={!!editor} onOpenChange={open => { if (!open && !busy) { setVideoSubViewOpen(false); onClose(); } }}>
      <DialogContent
        onEscapeKeyDown={event => {
          const back = (event.currentTarget as HTMLElement).querySelector<HTMLButtonElement>('[data-dialog-back]');
          if (back) { event.preventDefault(); if (!back.disabled) back.click(); }
        }}
        onCloseAutoFocus={event => { event.preventDefault(); openerRef.current?.focus(); }}
        className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl"
      >
        <DialogHeader className={videoSubViewOpen ? 'sr-only' : undefined}>
          <DialogTitle>{editor?.model ? uiF('Edit {0}', [editor.model.alias]) : uiT('Add model')}</DialogTitle>
          <DialogDescription>{uiT('Choose a saved API key and configure the model it connects to.')}</DialogDescription>
        </DialogHeader>
        {editor && selectedConnection && (
          <>
            <div hidden={videoSubViewOpen} className={videoSubViewOpen ? 'hidden' : 'space-y-4'}>
              <div className="space-y-2">
                <Label>{uiT('Provider API key')}</Label>
                {editor.model ? (
                  <p className="text-sm">{selectedConnection.name}</p>
                ) : (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" disabled={busy}>
                        {selectedConnection.name || uiT('Unnamed API key')}
                        <IconChevronDown size={16} />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuRadioGroup value={selectedConnection.id} onValueChange={onChangeConnection}>
                        {connections.map(connection => (
                          <DropdownMenuRadioItem key={connection.id} value={connection.id}>
                            {connection.name || uiT('Unnamed API key')}
                            {!connection.enabled ? uiT('· Disabled') : ''}
                          </DropdownMenuRadioItem>
                        ))}
                      </DropdownMenuRadioGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
              {discovery && !catalogLoading && !catalogError && (
                <p className="text-xs text-muted-foreground" role="status">
                  {integrationLabels[discovery.integration.effective_type]} · {discovery.inventory_scope === 'credential_filtered' ? uiT('Credential-filtered inventory') : uiT('Instance-reported inventory')}
                </p>
              )}
            </div>
            <ModelMappingForm
              key={`${selectedConnection.id}:${editor.model?.alias ?? 'new'}`}
              withinModal
              onSubViewChange={setVideoSubViewOpen}
              initialAlias={editor.initialAlias}
              adapter={selectedConnection.adapter}
              ownerFunded={selectedConnection.owner_funded}
              accessScope={selectedConnection.access_scope}
              model={editor.model}
              catalog={catalog}
              catalogLoading={catalogLoading}
              catalogError={catalogError}
              onRetryCatalog={() => void loadCatalog()}
              disabled={busy}
              onCancel={() => { setVideoSubViewOpen(false); onClose(); }}
              onSave={onSave}
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
