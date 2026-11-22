import type { RefObject } from 'react';
import { Link } from 'react-router';
import { IconChevronDown as ChevronDown, IconKey as KeyIcon, IconLoader2 as Loader2, IconPlus as Plus } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { translateUI } from '@/shell/ui-locale';
import { workspaceDisplayName } from '@/shell/workspace-route';

export type GenerationKeyOption = {
  id: string;
  name: string;
  workspace?: { id: string; name: string } | null;
};

type GenerationKeyPickerProps = {
  triggerRef?: RefObject<HTMLButtonElement | null>;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  ariaLabel: string;
  triggerLabel: string;
  hasSelection: boolean;
  emphasizeMissing?: boolean;
  loading?: boolean;
  disabled?: boolean;
  selectedKeyId: string;
  keyOptions: GenerationKeyOption[];
  currentWorkspaceId?: string | null;
  errorText?: string;
  emptyText?: string;
  manageKeysHref?: string;
  onCreateKey?: () => void;
  onSelectKey: (id: string) => void;
  className?: string;
};

/**
 * Shared Generations toolbar API key selector used across Chat, New Video, and
 * saved Video sessions so key switching, loading states, and recovery links
 * behave identically everywhere.
 */
export default function GenerationKeyPicker({
  triggerRef,
  open,
  onOpenChange,
  ariaLabel,
  triggerLabel,
  hasSelection,
  emphasizeMissing = true,
  loading = false,
  disabled = false,
  selectedKeyId,
  keyOptions,
  currentWorkspaceId,
  errorText,
  emptyText,
  manageKeysHref,
  onCreateKey,
  onSelectKey,
  className,
}: GenerationKeyPickerProps) {
  const uiT = translateUI;
  const loadingWithoutSelection = loading && !hasSelection;
  const hasFooterActions = Boolean(onCreateKey || manageKeysHref);

  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          ref={triggerRef}
          type="button"
          variant={hasSelection || loading || !emphasizeMissing ? 'outline' : 'default'}
          className={cn('playground-key-trigger', className)}
          aria-label={ariaLabel}
          aria-busy={loading || undefined}
          disabled={disabled}
        >
          {loadingWithoutSelection ? (
            <Loader2 size={16} className="shrink-0 animate-spin" aria-hidden="true" />
          ) : (
            <KeyIcon size={16} className="shrink-0" aria-hidden="true" />
          )}
          <span className="truncate">{triggerLabel}</span>
          {loading && hasSelection ? (
            <Loader2 size={14} className="hidden shrink-0 animate-spin opacity-70 sm:block" aria-hidden="true" />
          ) : (
            <ChevronDown size={14} className="hidden shrink-0 opacity-70 sm:block" aria-hidden="true" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56 max-w-80">
        {keyOptions.length > 0 && (
          <DropdownMenuRadioGroup value={selectedKeyId} onValueChange={onSelectKey}>
            {keyOptions.map(key => (
              <DropdownMenuRadioItem key={key.id} value={key.id}>
                <span className="truncate">
                  {key.name}
                  {key.workspace && currentWorkspaceId && key.workspace.id !== currentWorkspaceId
                    ? ` · ${workspaceDisplayName(key.workspace.name)}`
                    : ''}
                </span>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        )}
        {loading && keyOptions.length === 0 && (
          <DropdownMenuLabel className="flex items-center gap-2 font-normal text-muted-foreground">
            <Loader2 size={14} className="shrink-0 animate-spin" aria-hidden="true" />
            <span>{uiT("Loading keys…")}</span>
          </DropdownMenuLabel>
        )}
        {errorText && (
          <DropdownMenuLabel role="alert" className="font-normal text-destructive">
            {errorText}
          </DropdownMenuLabel>
        )}
        {!loading && !errorText && keyOptions.length === 0 && (
          <DropdownMenuLabel className="font-normal text-muted-foreground">
            {emptyText ?? uiT("No active API key")}
          </DropdownMenuLabel>
        )}
        {hasFooterActions && (
          <>
            <DropdownMenuSeparator />
            {onCreateKey && (
              <DropdownMenuItem onSelect={onCreateKey}>
                <Plus size={15} />
                {uiT("Create API key")}
              </DropdownMenuItem>
            )}
            {manageKeysHref && (
              <DropdownMenuItem asChild>
                <Link to={manageKeysHref}>
                  <KeyIcon size={15} />
                  {uiT("Manage keys")}
                </Link>
              </DropdownMenuItem>
            )}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
