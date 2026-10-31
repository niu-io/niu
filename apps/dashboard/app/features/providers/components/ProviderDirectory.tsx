import { Fragment } from 'react';
import { IconSelector as ChevronsUpDown } from "@tabler/icons-react";
import { IconRefresh as RefreshCw } from "@tabler/icons-react";
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import type { ProviderConnection } from '../api';

export default function ProviderDirectory({ connections, vendors, selectedId, loading, disabled, onSelect, onRefresh }: {
  connections?: ProviderConnection[];
  vendors?: ProviderConnection[];
  selectedId: string;
  loading: boolean;
  disabled: boolean;
  onSelect: (id: string) => void;
  onRefresh: () => void;
}) {
  const items = connections ?? vendors ?? [];
  const selected = items.find(connection => connection.id === selectedId);
  const selectedOwner = selected?.provider ?? selected?.supplier;
  const groups = new Map<string, { name: string; keys: ProviderConnection[] }>();
  for (const connection of items) {
    const owner = connection.provider ?? connection.supplier;
    const groupId = owner?.id ?? 'unassigned';
    const group = groups.get(groupId) ?? { name: owner?.name ?? 'Unassigned API keys', keys: [] };
    group.keys.push(connection);
    groups.set(groupId, group);
  }
  return <section className="supplier-key-picker" aria-label="Provider API keys">
    <h2 className="sr-only">API keys</h2>
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" className="supplier-key-trigger" aria-label="Select Provider API key" disabled={disabled || loading || items.length === 0}>
          <span>{loading ? 'Loading API keys…' : selected ? `${selectedOwner?.name && selectedOwner.name !== selected.name ? selectedOwner.name + ' / ' : ''}${selected.name}` : 'Select Provider API key'}</span>
          <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" collisionPadding={12} className="max-w-[calc(100vw-24px)] min-w-[min(320px,calc(100vw-24px))]">
        <DropdownMenuRadioGroup value={selectedId} onValueChange={onSelect}>
          {[...groups.entries()].map(([groupId, group], index) => <Fragment key={groupId}>
            {index > 0 && <DropdownMenuSeparator />}
            <DropdownMenuLabel>{group.name}</DropdownMenuLabel>
            {group.keys.map(connection => <DropdownMenuRadioItem key={connection.id} value={connection.id}>
              <span className="min-w-0 break-words">{connection.name + (!connection.enabled ? ' · Disabled' : '')}</span>
            </DropdownMenuRadioItem>)}
          </Fragment>)}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
    <Button type="button" variant="ghost" size="icon-sm" aria-label="Refresh API keys" disabled={disabled || loading} onClick={onRefresh}><RefreshCw /></Button>
  </section>;
}
