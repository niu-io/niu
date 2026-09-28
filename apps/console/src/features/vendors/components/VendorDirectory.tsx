import { useState } from 'react';
import ProviderLogo from '@/components/ProviderLogo';
import { connectionIdentity } from '@/lib/providers';
import { Input } from '@/components/ui/input';
import { RefreshCw, Router, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Vendor } from '../api';

export default function VendorDirectory({ vendors, selectedId, loading, disabled, onSelect, onRefresh }: {
  vendors: Vendor[];
  selectedId: string;
  loading: boolean;
  disabled: boolean;
  onSelect: (id: string) => void;
  onRefresh: () => void;
}) {
  const [query, setQuery] = useState('');
  const filtered = vendors.filter(vendor => `${vendor.name} ${connectionIdentity(vendor).name} ${vendor.api_base}`.toLowerCase().includes(query.trim().toLowerCase()));
  return <section className="panel vendor-directory" aria-labelledby="vendor-directory-title">
    <div className="vendor-panel-heading">
      <div><h2 id="vendor-directory-title">Providers</h2></div>
      <div className="vendor-heading-actions">
        <span className="vendor-count">{vendors.length}</span>
        <Button type="button" variant="ghost" size="icon-sm" aria-label="Refresh providers" disabled={disabled || loading} onClick={onRefresh}><RefreshCw /></Button>
      </div>
    </div>
    {vendors.length > 0 && <div className="provider-directory-search"><label className="model-search"><Search size={16} /><span className="sr-only">Search providers</span><Input placeholder="Search providers…" value={query} onChange={event => setQuery(event.target.value)} /></label></div>}
    {loading
      ? <div className="vendor-loading" role="status">Loading providers…</div>
      : vendors.length === 0
        ? <div className="vendor-empty">
          <span className="vendor-empty-mark"><Router size={17} /></span>
          <strong>No providers connected</strong>
        </div>
        : <div className="vendor-list">
          {filtered.length === 0 && <div className="directory-empty"><strong>No matching providers</strong><Button variant="ghost" size="sm" onClick={() => setQuery('')}>Clear search</Button></div>}
          {filtered.map(vendor => <button
            type="button"
            key={vendor.id}
            className={'vendor-entry' + (vendor.id === selectedId ? ' is-selected' : '') + (!vendor.enabled ? ' is-disabled' : '')}
            aria-pressed={vendor.id === selectedId}
            disabled={disabled}
            onClick={() => onSelect(vendor.id)}
          >
            <ProviderLogo provider={connectionIdentity(vendor)} />
            <span className="vendor-entry-copy"><strong>{vendor.name}</strong><small>{connectionIdentity(vendor).name}</small></span>
            <span className={'vendor-state' + (vendor.enabled ? ' is-enabled' : '')}>{vendor.enabled ? 'Enabled' : 'Disabled'}</span>
          </button>)}
        </div>}
  </section>;
}
