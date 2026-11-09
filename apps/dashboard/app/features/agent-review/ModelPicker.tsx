import { useState } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import { useLocale as useUILocale } from '@/shell/ui-locale';
import ProviderLogo from '@/components/ProviderLogo';
import { modelIdentity } from '@/lib/providers';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';

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
  const filtered = normalized
    ? models.filter(model => `${model.id} ${model.name ?? ''}`.toLocaleLowerCase().includes(normalized))
    : models;
  const custom = query.trim() && !models.some(model => model.id === query.trim()) ? query.trim() : '';

  const choose = (next: string) => {
    onChange(next);
    setOpen(false);
    setQuery('');
  };

  return <Popover open={open} onOpenChange={next => { setOpen(next); if (!next) setQuery(''); }}>
    <PopoverTrigger asChild>
      <Button
        id={id}
        type="button"
        variant="outline"
        role="combobox"
        aria-expanded={open}
        aria-label={value ? `${uiT("Model alias")}: ${value}` : uiT("Choose model")}
        disabled={disabled}
        className="w-full justify-between font-normal"
      >
        <span className="flex min-w-0 items-center gap-2">
          {value && <ProviderLogo provider={modelIdentity({ id: value, catalog: models.find(item => item.id === value)?.name ? { name: models.find(item => item.id === value)?.name } : undefined })} size="small" />}
          <span className={value ? 'truncate' : 'truncate text-muted-foreground'}>{value || placeholder}</span>
        </span>
        <ChevronDown size={14} className="shrink-0 opacity-60" aria-hidden="true" />
      </Button>
    </PopoverTrigger>
    <PopoverContent align="start" collisionPadding={12} className="w-[min(26rem,calc(100vw-2rem))] p-0">
      <Command shouldFilter={false}>
        <CommandInput value={query} onValueChange={setQuery} placeholder={uiT("Search models…")} />
        <CommandList>
          <CommandEmpty>{uiT("No configured models match. Type an alias to use it.")}</CommandEmpty>
          <CommandGroup>
            {filtered.map(model => <CommandItem key={model.id} value={model.id} onSelect={() => choose(model.id)}>
              <ProviderLogo provider={modelIdentity({ id: model.id, catalog: model.name ? { name: model.name } : undefined })} size="small" />
              <span className="min-w-0 flex-1 truncate">{model.id}</span>
              {model.name && model.name !== model.id && <span className="max-w-40 truncate text-xs text-muted-foreground">{model.name}</span>}
              <Check size={14} className={model.id === value ? 'opacity-100' : 'opacity-0'} aria-hidden="true" />
            </CommandItem>)}
            {custom && <CommandItem value={`__custom__:${custom}`} onSelect={() => choose(custom)}>
              <Search size={14} aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate">{uiT("Use exact alias")} <span className="font-mono">{custom}</span></span>
            </CommandItem>}
            {value && <CommandItem value="__clear__" onSelect={() => choose('')}>
              <span className="text-muted-foreground">{uiT("Clear selection")}</span>
            </CommandItem>}
          </CommandGroup>
        </CommandList>
      </Command>
    </PopoverContent>
  </Popover>;
}
