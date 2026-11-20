import { useState } from 'react';
import { IconChevronDown, IconSearch } from '@tabler/icons-react';
import { useLocale as useUILocale } from '@/shell/ui-locale';
import ProviderLogo from '@/components/ProviderLogo';
import { catalogTitle, modelIdentity } from '@/lib/providers';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

type ModelOption = { id: string; name?: string | null };

export default function ModelPicker({
  id,
  value,
  models,
  disabled,
  placeholder,
  onChange,
}: {
  id: string;
  value: string;
  models: ModelOption[];
  disabled?: boolean;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  const { t: uiT } = useUILocale();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const normalized = query.trim().toLocaleLowerCase();
  const displayName = (model: ModelOption) =>
    model.name?.trim() ? model.name.trim() : catalogTitle(model.id);
  const filtered = normalized
    ? models.filter(model =>
        `${model.id} ${displayName(model)}`.toLocaleLowerCase().includes(normalized),
      )
    : models;
  const custom =
    query.trim() && !models.some(model => model.id === query.trim())
      ? query.trim()
      : '';
  const selectedModel = models.find(item => item.id === value);
  const selectedLabel = value
    ? selectedModel
      ? displayName(selectedModel)
      : catalogTitle(value)
    : '';

  const choose = (next: string) => {
    onChange(next);
    setOpen(false);
    setQuery('');
  };

  return (
    <DropdownMenu
      open={open}
      onOpenChange={next => {
        setOpen(next);
        if (!next) setQuery('');
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          disabled={disabled}
          className="w-full justify-between font-normal"
        >
          <span className="flex min-w-0 items-center gap-2">
            {value && (
              <ProviderLogo
                provider={modelIdentity({
                  id: value,
                  catalog: selectedModel?.name
                    ? { name: selectedModel.name }
                    : undefined,
                })}
                size="small"
              />
            )}
            <span
              className={
                value ? 'truncate' : 'truncate text-muted-foreground'
              }
            >
              {selectedLabel || placeholder}
              {value && selectedLabel !== value && (
                <span className="sr-only"> {value}</span>
              )}
            </span>
          </span>
          <IconChevronDown
            size={14}
            className="shrink-0 opacity-60"
            aria-hidden="true"
          />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        collisionPadding={12}
        className="max-h-80 w-[min(26rem,calc(100vw-2rem))] overflow-y-auto"
      >
        <div className="p-2">
          <Input
            value={query}
            onChange={event => setQuery(event.target.value)}
            aria-label={uiT('Search models')}
            placeholder={uiT('Search models…')}
            onKeyDown={event => {
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault();
                event.stopPropagation();
                const items = event.currentTarget
                  .closest('[role="menu"]')
                  ?.querySelectorAll<HTMLElement>(
                    '[role="menuitemradio"]:not([data-disabled]), [role="menuitem"]:not([data-disabled])',
                  );
                (event.key === 'ArrowDown'
                  ? items?.[0]
                  : items?.[items.length - 1]
                )?.focus();
              } else if (event.key !== 'Escape' && event.key !== 'Tab') {
                event.stopPropagation();
              }
            }}
          />
        </div>
        {filtered.length > 0 ? (
          <DropdownMenuRadioGroup value={value} onValueChange={choose}>
            {filtered.map(model => {
              const title = displayName(model);
              return (
                <DropdownMenuRadioItem key={model.id} value={model.id}>
                  <ProviderLogo
                    provider={modelIdentity({
                      id: model.id,
                      catalog: model.name ? { name: model.name } : undefined,
                    })}
                    size="small"
                  />
                  <span className="min-w-0 flex-1 truncate">{title}</span>
                  {title !== model.id && (
                    <span className="max-w-40 truncate font-mono text-xs text-muted-foreground">
                      {model.id}
                    </span>
                  )}
                </DropdownMenuRadioItem>
              );
            })}
          </DropdownMenuRadioGroup>
        ) : (
          !custom && (
            <p className="px-3 py-2 text-sm text-muted-foreground">
              {uiT('No configured models match. Type an alias to use it.')}
            </p>
          )
        )}
        {(custom || value) && filtered.length > 0 && <DropdownMenuSeparator />}
        {custom && (
          <DropdownMenuItem onSelect={() => choose(custom)}>
            <IconSearch size={14} aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate">
              {uiT('Use exact alias')} <span className="font-mono">{custom}</span>
            </span>
          </DropdownMenuItem>
        )}
        {value && (
          <DropdownMenuItem onSelect={() => choose('')}>
            <span className="text-muted-foreground">{uiT('Clear selection')}</span>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
