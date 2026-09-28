import { Plus, RefreshCw, Router } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Vendor } from '../api';

export default function VendorDirectory({ vendors, selectedId, loading, disabled, onSelect, onAdd, onRefresh }: {
  vendors: Vendor[];
  selectedId: string;
  loading: boolean;
  disabled: boolean;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onRefresh: () => void;
}) {
  return <section className="panel vendor-directory" aria-labelledby="vendor-directory-title">
    <div className="vendor-panel-heading">
      <div><h2 id="vendor-directory-title">Connections</h2></div>
      <div className="vendor-heading-actions">
        <span className="vendor-count">{vendors.length}</span>
        <Button type="button" variant="outline" size="xs" disabled={disabled} onClick={onAdd}><Plus />Add provider</Button>
        <Button type="button" variant="ghost" size="icon-sm" aria-label="Refresh providers" disabled={disabled || loading} onClick={onRefresh}><RefreshCw /></Button>
      </div>
    </div>
    {loading
      ? <div className="vendor-loading" role="status">Loading providers…</div>
      : vendors.length === 0
        ? <div className="vendor-empty">
          <span className="vendor-empty-mark"><Router size={17} /></span>
          <strong>No providers connected</strong>
          <p>Add a provider connection to make upstream models available. Use Add provider above to get started.</p>
        </div>
        : <div className="vendor-list">
          {vendors.map(vendor => <button
            type="button"
            key={vendor.id}
            className={'vendor-entry' + (vendor.id === selectedId ? ' is-selected' : '') + (!vendor.enabled ? ' is-disabled' : '')}
            aria-pressed={vendor.id === selectedId}
            disabled={disabled}
            onClick={() => onSelect(vendor.id)}
          >
            <span className="vendor-entry-mark" aria-hidden="true">{vendor.adapter === 'openrouter' ? 'O' : 'A'}</span>
            <span className="vendor-entry-copy"><strong>{vendor.name}</strong><small>{vendor.adapter === 'openrouter' ? 'OpenRouter' : 'OpenAI'}</small></span>
            <span className={'vendor-state' + (vendor.enabled ? ' is-enabled' : '')}>{vendor.enabled ? 'Enabled' : 'Disabled'}</span>
          </button>)}
        </div>}
  </section>;
}
