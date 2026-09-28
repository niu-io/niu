import '../models.css';
import { useMemo, useState, type ReactNode } from 'react';
import { ArrowUpRight, Boxes, Check, ArrowLeft, ChevronRight, Clipboard, KeyRound, Search, PanelLeft, X } from 'lucide-react';
import { Link, useSearchParams } from 'react-router';
import { Sidebar, SidebarHeader, SidebarContent, SidebarGroup, SidebarGroupLabel, SidebarGroupContent, useSidebar } from '@/components/ui/sidebar';
import ProviderLogo from '@/components/ProviderLogo';
import { modelIdentity } from '@/lib/providers';
import { Dropdown, DropdownOption } from '@/components/ui/dropdown';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { Model } from '@/app/console-context';
import { useConsoleContext } from '@/app/console-context';
import { useModelPopularity } from '@/app/useModelPopularity';

function apiBaseUrl() {
  const base = import.meta.env.BASE_URL.replace(/\/+$/, '');
  return `${window.location.origin}${base}/v1`;
}

function requestExample(baseUrl: string, model: string) {
  const body = JSON.stringify({ model, messages: [{ role: 'user', content: 'Hello' }] });
  return [
    `curl "${baseUrl}/chat/completions"`,
    '  -H "Authorization: Bearer $NIU_API_KEY"',
    '  -H "Content-Type: application/json"',
    `  -d '${body.replaceAll("'", "'\\''")}'`,
  ].join(` ${String.fromCharCode(92)}\n`);
}

export default function ModelTable({ models, header }: { models: Model[]; header?: ReactNode }) {
  const { isMobile, open, openMobile, setOpenMobile, toggleSidebar } = useSidebar();
  function chooseAuthor(value: string) { setAuthor(value); setLimit(20); if (isMobile) setOpenMobile(false); }
  const { token, workspace } = useConsoleContext();
  const ranked = useModelPopularity(models, token, workspace?.organization_id, workspace?.id);
  const popularModels = ranked.models;
  const [query, setQuery] = useState('');
  const [author, setAuthor] = useState('all');
  const [allAuthors, setAllAuthors] = useState(false);
  const [sort, setSort] = useState('recommended');
  const authors = useMemo(() => [...new Map(models.map(model => { const identity = modelIdentity(model); return [identity.id, identity]; })).values()].sort((a, b) => a.name.localeCompare(b.name)), [models]);
  const [limit, setLimit] = useState(20);
  const [params, setParams] = useSearchParams();
  const selectedId = params.get('model');
  function selectModel(id: string | null) {
    setCopied(false); setCopyError('');
    setParams(current => { const next = new URLSearchParams(current); if (id) next.set('model', id); else next.delete('model'); return next; });
  }
  const [copyError, setCopyError] = useState('');
  const [copied, setCopied] = useState(false);

  const filtered = useMemo(() => {
    const value = query.trim().toLowerCase();
    const matches = popularModels.filter(model => (author === 'all' || modelIdentity(model).id === author) && (!value || `${model.id} ${model.provider ?? ''} ${model.upstream_model ?? ''} ${modelIdentity(model).name}`.toLowerCase().includes(value)));
    return sort === 'name' ? [...matches].sort((a, b) => a.id.localeCompare(b.id)) : matches;
  }, [popularModels, query, author, sort]);
  const visible = filtered.slice(0, limit);
  const selected = models.find(model => model.id === selectedId) ?? null;
  const baseUrl = apiBaseUrl();

  async function copyExample() {
    if (!selected) return;
    try {
      setCopyError('');
      await navigator.clipboard.writeText(requestExample(baseUrl, selected.id));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopyError('Select and copy the example below; clipboard access is unavailable.');
      setCopied(false);
    }
  }

  if (models.length === 0) return <>{header}<div className="empty-state">
    <div className="empty-icon"><Boxes size={18} /></div>
    <strong>No model routes yet</strong>
    <span>Your administrator can enable model access for this workspace.</span>
  </div></>;

  return <div className="models-catalog">
    {selectedId ? <>{header}<Button variant="ghost" className="models-back" onClick={() => selectModel(null)}><ArrowLeft size={16} />Back to models</Button></> : <div className="models-browse">
      <Sidebar id="model-filters" className="niu-workspace-sidebar models-sidebar" mobileClassName="niu-workspace-sidebar-mobile models-sidebar-mobile" mobileStyle={{ left: 'var(--rail)', top: 0, bottom: 0, height: '100dvh', width: 'min(var(--context), calc(100vw - var(--rail)))' }}>
        <SidebarHeader className="models-sidebar-header"><h2>Filters</h2>{isMobile && <Button variant="ghost" size="icon" aria-label="Close model filters" onClick={() => setOpenMobile(false)}><X size={16} /></Button>}</SidebarHeader>
        <SidebarContent><SidebarGroup><SidebarGroupLabel>Model developer</SidebarGroupLabel><SidebarGroupContent>
          <div className="models-filter-options">
            <label><input type="radio" name="developer" checked={author === 'all'} onChange={() => chooseAuthor('all')} />All developers<span>{models.length}</span></label>
            {(allAuthors ? authors : authors.slice(0, 10)).map(identity => <label key={identity.id}><input type="radio" name="developer" checked={author === identity.id} onChange={() => chooseAuthor(identity.id)} />{identity.name}<span>{models.filter(model => modelIdentity(model).id === identity.id).length}</span></label>)}
          </div>
          {authors.length > 10 && <Button variant="ghost" size="sm" onClick={() => setAllAuthors(value => !value)}>{allAuthors ? 'Show fewer' : 'Show all developers'}</Button>}
        </SidebarGroupContent></SidebarGroup></SidebarContent>
      </Sidebar>
      <section className="models-results" aria-label="Model catalog">
        <Button variant="ghost" size="sm" className="models-filter-toggle" aria-label="Toggle model filters" aria-controls="model-filters" aria-expanded={isMobile ? openMobile : open} onClick={toggleSidebar}><PanelLeft size={16} />Filters</Button>
        {header}
        <div className="models-toolbar">
          <label className="models-search"><Search size={17} /><span className="sr-only">Search model routes</span><Input value={query} onChange={event => { setQuery(event.target.value); setLimit(20); }} placeholder="Search models…" /></label>
          <Dropdown aria-label="Sort models" value={sort} onChange={event => setSort(event.target.value)}>
            <DropdownOption value="recommended">Default order</DropdownOption><DropdownOption value="name">Name: A–Z</DropdownOption>
          </Dropdown>
        </div>

        <div className="models-results-heading"><span aria-live="polite">{filtered.length.toLocaleString()} models</span>{(author !== 'all' || query) && <Button variant="ghost" size="sm" onClick={() => { setAuthor('all'); setQuery(''); setLimit(20); }}>Clear filters</Button>}</div>
        {filtered.length === 0 ? <div className="directory-empty"><Search size={22} /><strong>No matching models</strong><p>Try a different name or developer.</p></div> : <div className="models-cards">
          {visible.map(model => <article className="models-card" key={model.id}>
            <div className="models-card-heading"><ProviderLogo provider={modelIdentity(model)} size="small" /><button onClick={() => selectModel(model.id)}>{model.id}</button><ChevronRight size={16} aria-hidden="true" /></div>
            <p>{model.upstream_model && model.upstream_model !== model.id ? <>Routes to <span>{model.upstream_model}</span>{model.provider ? ` through ${model.provider}.` : '.'}</> : <>Available through {model.provider ?? 'your workspace gateway'}.</>}</p>
            <div className="models-card-meta"><span>by {modelIdentity(model).name}</span>{model.provider && <span>via {model.provider}</span>}<span>{model.public_catalog ? 'Public catalog' : 'Workspace route'}</span><Link to={`../playground?model=${encodeURIComponent(model.id)}`}>Try in Chat<ArrowUpRight size={13} /></Link></div>
          </article>)}
        </div>}
        {visible.length < filtered.length && <div className="models-load-more"><Button variant="outline" onClick={() => setLimit(value => value + 20)}>Show more models</Button><span>{visible.length} of {filtered.length}</span></div>}
      </section>
    </div>}
    {selected ? <aside className="model-route-detail" aria-label={`${selected.id} route details`}>
      <div className="model-route-detail-heading"><ProviderLogo provider={modelIdentity(selected)} size="large" /><Badge variant="outline"><span className="status-dot" />Configured</Badge></div>
      <div className="model-route-title"><p className="model-developer-label">{modelIdentity(selected).name}</p><h3>{selected.id}</h3></div>
      <dl className="model-route-facts">
        <div><dt>Provider</dt><dd>{selected.provider ?? 'Restricted'}</dd></div>
        <div><dt>Upstream model</dt><dd>{selected.upstream_model ?? 'Restricted'}</dd></div>
        <div><dt>API endpoint</dt><dd className="mono">/v1/chat/completions</dd></div>
        <div><dt>Availability</dt><dd>{selected.public_catalog ? 'Listed in the model catalog' : 'Available by exact model name'}</dd></div>
      </dl>
      <div className="model-route-cta">
        <Button asChild><Link to={`../playground?model=${encodeURIComponent(selected.id)}`}>Try in Chat<ArrowUpRight size={15} /></Link></Button>
        <Button asChild variant="outline"><Link to={`../keys?model=${encodeURIComponent(selected.id)}`}>Create an API key<KeyRound size={15} /></Link></Button>
      </div>
      <div className="model-route-example-heading"><strong>Make your first request</strong><Button type="button" variant="ghost" size="sm" onClick={() => void copyExample()}><Clipboard size={14} />{copied ? <><Check size={14} />Copied</> : 'Copy'}</Button></div>
      {copyError && <p role="alert" className="error-text">{copyError}</p>}
      <pre className="model-route-example"><code>{requestExample(baseUrl, selected.id)}</code></pre>
      <p className="model-route-example-note">Create a workspace API key and set <code>NIU_API_KEY</code> before running this command.</p>
      <Link className="model-activity-link" to={`../executions?modelAlias=${encodeURIComponent(selected.id)}`}>View requests for this model<ArrowUpRight size={14} /></Link>
    </aside> : selectedId ? <p role="status">This model is no longer available. Return to the catalog to choose another.</p> : null}
  </div>;
}
