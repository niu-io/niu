import { Fragment } from 'react';
import { IconSelector as ChevronsUpDown } from "@tabler/icons-react";
import { IconRefresh as RefreshCw } from "@tabler/icons-react";
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import type { Vendor } from '../api';

export default function SupplierDirectory({ vendors, selectedId, loading, disabled, onSelect, onRefresh }: {
  vendors: Vendor[];
  selectedId: string;
  loading: boolean;
  disabled: boolean;
  onSelect: (id: string) => void;
  onRefresh: () => void;
}) {
  const selected = vendors.find(vendor => vendor.id === selectedId);
  const groups = new Map<string, { name: string; keys: Vendor[] }>();
  for (const vendor of vendors) {
    const groupId = vendor.supplier?.id ?? 'unassigned';
    const group = groups.get(groupId) ?? { name: vendor.supplier?.name ?? 'Unassigned API keys', keys: [] };
    group.keys.push(vendor);
    groups.set(groupId, group);
  }
  return <section className="supplier-key-picker" aria-label="Supplier API keys">
    <h2 className="sr-only">API keys</h2>
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" className="supplier-key-trigger" aria-label="Select Supplier API key" disabled={disabled || loading || vendors.length === 0}>
          <span>{loading ? 'Loading API keys…' : selected ? `${selected.supplier?.name && selected.supplier.name !== selected.name ? selected.supplier.name + ' / ' : ''}${selected.name}` : 'Select Supplier API key'}</span>
          <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" collisionPadding={12} className="max-w-[calc(100vw-24px)] min-w-[min(320px,calc(100vw-24px))]">
        <DropdownMenuRadioGroup value={selectedId} onValueChange={onSelect}>
          {[...groups.entries()].map(([groupId, group], index) => <Fragment key={groupId}>
            {index > 0 && <DropdownMenuSeparator />}
            <DropdownMenuLabel>{group.name}</DropdownMenuLabel>
            {group.keys.map(vendor => <DropdownMenuRadioItem key={vendor.id} value={vendor.id}>
              <span className="min-w-0 break-words">{vendor.name + (!vendor.enabled ? ' · Disabled' : '')}</span>
            </DropdownMenuRadioItem>)}
          </Fragment>)}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
    <Button type="button" variant="ghost" size="icon-sm" aria-label="Refresh API keys" disabled={disabled || loading} onClick={onRefresh}><RefreshCw /></Button>
  </section>;
}
