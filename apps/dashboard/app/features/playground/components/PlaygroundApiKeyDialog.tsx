import { Link } from 'react-router';
import { IconChevronDown as ChevronDown, IconLoader2 as Loader2 } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { translateUI } from '@/shell/ui-locale';

export type PlaygroundApiKeyOption = {
  id: string;
  name: string;
  workspace?: { id: string; name: string } | null;
};

type PlaygroundApiKeyDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCloseRestoreFocus?: () => void;
  workspaceId: string;
  workspaceRoot: string;
  selectedKeyId: string;
  selectedKeyName?: string;
  keyOptions: PlaygroundApiKeyOption[];
  keysLoading: boolean;
  noAvailableKeys: boolean;
  hasApiKey: boolean;
  canWrite: boolean;
  disabled: boolean;
  availableKeysError: string;
  keyLoadError: string;
  selectedKeyAllowsNoModels: boolean;
  billingSummary: string;
  onSelectKey: (value: string) => void;
  onCreateKey: () => void;
};

export default function PlaygroundApiKeyDialog({
  open,
  onOpenChange,
  onCloseRestoreFocus,
  workspaceId,
  workspaceRoot,
  selectedKeyId,
  selectedKeyName,
  keyOptions,
  keysLoading,
  noAvailableKeys,
  hasApiKey,
  canWrite,
  disabled,
  availableKeysError,
  keyLoadError,
  selectedKeyAllowsNoModels,
  billingSummary,
  onSelectKey,
  onCreateKey,
}: PlaygroundApiKeyDialogProps) {
  const uiT = translateUI;
  const loadingWithoutSelection = keysLoading && !selectedKeyName;
  const triggerDisabled = disabled || loadingWithoutSelection || (noAvailableKeys && !keysLoading) || keyOptions.length === 0;
  const triggerLabel = loadingWithoutSelection
    ? uiT("Loading API keys…")
    : selectedKeyName ?? (noAvailableKeys ? uiT("No active API key") : uiT("Select API key"));
  const showCreateAction = noAvailableKeys && !keysLoading && canWrite;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[90dvh] overflow-y-auto sm:max-w-md"
        onCloseAutoFocus={event => {
          if (onCloseRestoreFocus) {
            event.preventDefault();
            onCloseRestoreFocus();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{uiT("API key")}</DialogTitle>
          <DialogDescription>
            {uiT("Select an API key for this generation. Its workspace supplies billing and limits.")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="playground-api-key">{uiT("Key")}</Label>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  id="playground-api-key"
                  aria-label={uiT("API key")}
                  aria-busy={keysLoading || undefined}
                  disabled={triggerDisabled}
                  variant="outline"
                  className="w-full justify-between font-normal"
                >
                  <span className="inline-flex min-w-0 items-center gap-2 truncate">
                    {loadingWithoutSelection && (
                      <Loader2 size={16} className="shrink-0 animate-spin text-muted-foreground" aria-hidden="true" />
                    )}
                    <span className={cn("truncate", (!selectedKeyName || loadingWithoutSelection) && "text-muted-foreground")}>
                      {triggerLabel}
                    </span>
                  </span>
                  {keysLoading && selectedKeyName ? (
                    <Loader2 size={16} className="shrink-0 animate-spin text-muted-foreground" aria-hidden="true" />
                  ) : (
                    <ChevronDown size={16} className="shrink-0 text-muted-foreground" aria-hidden="true" />
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)]">
                <DropdownMenuRadioGroup value={selectedKeyId} onValueChange={onSelectKey}>
                  {keyOptions.map(key => (
                    <DropdownMenuRadioItem key={key.id} value={key.id}>
                      {key.name}
                      {key.workspace && key.workspace.id !== workspaceId ? ` · ${key.workspace.name}` : ''}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {availableKeysError && <p role="alert" className="text-sm text-destructive">{uiT(availableKeysError)}</p>}
          {keyLoadError && <p role="alert" className="text-sm text-destructive">{uiT(keyLoadError)}</p>}
          {selectedKeyAllowsNoModels && (
            <p role="alert" className="text-sm text-destructive">{uiT("This key does not allow any available models.")}</p>
          )}

          <p className="min-h-10 text-xs leading-relaxed text-muted-foreground" role={loadingWithoutSelection ? "status" : undefined}>
            {noAvailableKeys && !keysLoading
              ? canWrite
                ? uiT("Create an API key to start using models in this workspace.")
                : uiT("Ask a workspace administrator to create an API key for you.")
              : keyLoadError || availableKeysError
                ? uiT("Key availability could not be confirmed. Reopen this dialog to retry, or use an existing key secret.")
                : billingSummary}
          </p>
        </div>

        <DialogFooter className="flex-row items-center justify-between gap-3 sm:justify-between">
          <Button asChild variant="ghost">
            <Link to={`${workspaceRoot}/keys`}>{uiT("Manage keys")}</Link>
          </Button>
          {showCreateAction ? (
            <Button type="button" onClick={onCreateKey}>
              {uiT("Create API key")}
            </Button>
          ) : (
            <Button type="button" disabled={!hasApiKey || loadingWithoutSelection} onClick={() => onOpenChange(false)}>
              {uiT("Done")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
