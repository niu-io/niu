import '../models.css';
import { useMemo, useState, type ReactNode } from 'react';
import { ArrowUpRight, Boxes, Check, ChevronDown, Clipboard, KeyRound, Search, X } from 'lucide-react';
import { Link, useParams, useLocation } from 'react-router';
import { Sidebar, SidebarHeader, SidebarContent, SidebarGroup, SidebarGroupContent, useSidebar } from '@/components/ui/sidebar';
import ProviderLogo from '@/components/ProviderLogo';
import { modelIdentity } from '@/lib/providers';
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
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
  const { isMobile, setOpenMobile } = useSidebar();
  function chooseAuthor(value: string) { setAuthorsSelected(current => current.includes(value) ? current.filter(id => id !== value) : [...current, value]); setLimit(20); }
  const { token, workspace } = useConsoleContext();
  const ranked = useModelPopularity(models, token, workspace?.organization_id, workspace?.id);
  const popularModels = ranked.models;
  const [query, setQuery] = useState('');
  const [authorsSelected, setAuthorsSelected] = useState<string[]>([]);
  const [providersSelected, setProvidersSelected] = useState<string[]>([]);
  const providers = [...new Set(models.map(model => model.provider).filter((provider): provider is string => Boolean(provider)))].sort();
  const [allAuthors, setAllAuthors] = useState(false);
  const [sort, setSort] = useState('recommended');
  const authors = useMemo(() => [...new Map(models.map(model => { const identity = modelIdentity(model); return [identity.id, identity]; })).values()].sort((a, b) => a.name.localeCompare(b.name)), [models]);
  const [limit, setLimit] = useState(20);
  const params = useParams();
  const location = useLocation();
  const selectedId = params['*'] || null;
  const catalogPath = location.pathname.split('/models')[0] + '/models';
  const workspacePath = catalogPath.slice(0, -7);
  const [copyError, setCopyError] = useState('');
  const [copied, setCopied] = useState(false);

  const filtered = useMemo(() => {
    const value = query.trim().toLowerCase();
    const matches = popularModels.filter(model => (!authorsSelected.length || authorsSelected.includes(modelIdentity(model).id)) && (!providersSelected.length || providersSelected.includes(model.provider ?? '')) && (!value || `${model.id} ${model.catalog?.name ?? ''} ${model.catalog?.description ?? ''} ${model.provider ?? ''} ${model.upstream_model ?? ''} ${modelIdentity(model).name}`.toLowerCase().includes(value)));
    return sort === 'name' ? [...matches].sort((a, b) => a.id.localeCompare(b.id)) : matches;
  }, [popularModels, query, authorsSelected, providersSelected, sort]);
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
    {selectedId ? null : <div className="models-browse">
      <Sidebar id="model-filters" className="niu-workspace-sidebar models-sidebar" mobileClassName="niu-workspace-sidebar-mobile models-sidebar-mobile" mobileStyle={{ left: 'var(--rail)', top: 0, bottom: 0, height: '100dvh', width: 'min(var(--context), calc(100vw - var(--rail)))' }}>
        <SidebarHeader className="models-sidebar-header"><h2>Filters</h2>{isMobile && <Button variant="ghost" size="icon" aria-label="Close model filters" onClick={() => setOpenMobile(false)}><X size={16} /></Button>}</SidebarHeader>
        <SidebarContent><SidebarGroup><SidebarGroupContent>
          <details className="models-filter-group" open><summary>Model developer<ChevronDown size={15} /></summary>
          <div className="models-filter-options">
            {(allAuthors ? authors : authors.slice(0, 10)).map(identity => <label key={identity.id}><Checkbox checked={authorsSelected.includes(identity.id)} onCheckedChange={() => chooseAuthor(identity.id)} />{identity.name}<span>{models.filter(model => modelIdentity(model).id === identity.id).length}</span></label>)}
          </div>
          {authors.length > 10 && <Button variant="ghost" size="sm" onClick={() => setAllAuthors(value => !value)}>{allAuthors ? 'Show fewer' : 'Show all developers'}</Button>}
          </details>
          <details className="models-filter-group" open><summary>Provider<ChevronDown size={15} /></summary><div className="models-filter-options">
            {providers.map(provider => <label key={provider}><Checkbox checked={providersSelected.includes(provider)} onCheckedChange={() => { setProvidersSelected(current => current.includes(provider) ? current.filter(id => id !== provider) : [...current, provider]); setLimit(20); }} />{provider}<span>{models.filter(model => model.provider === provider).length}</span></label>)}
          </div></details>
        </SidebarGroupContent></SidebarGroup></SidebarContent>
      </Sidebar>
      <section className="models-results" aria-label="Model catalog">
        {header}
        <div className="models-toolbar">
          <label className="models-search"><Search size={17} /><span className="sr-only">Search model routes</span><Input value={query} onChange={event => { setQuery(event.target.value); setLimit(20); }} placeholder="Search models…" /></label>
          <div className="models-sort-menu"><DropdownMenu><DropdownMenuTrigger asChild><Button aria-label="Sort models" type="button" variant="outline" className="w-full justify-between font-normal">{sort === 'name' ? 'Name: A–Z' : 'Default order'}<ChevronDown size={16} aria-hidden="true" /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[var(--radix-dropdown-menu-trigger-width)]"><DropdownMenuRadioGroup value={sort} onValueChange={setSort}>
              <DropdownMenuRadioItem value="recommended">Default order</DropdownMenuRadioItem><DropdownMenuRadioItem value="name">Name: A–Z</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup></DropdownMenuContent>
          </DropdownMenu></div>
        </div>

        <div className="models-results-heading"><span aria-live="polite">{filtered.length.toLocaleString()} models</span>{(authorsSelected.length > 0 || providersSelected.length > 0 || query) && <Button variant="ghost" size="sm" onClick={() => { setAuthorsSelected([]); setProvidersSelected([]); setQuery(''); setLimit(20); }}>Clear filters</Button>}</div>
        {filtered.length === 0 ? <div className="directory-empty"><Search size={22} /><strong>No matching models</strong><p>Try a different name or developer.</p></div> : <div className="models-cards">
          {visible.map(model => <article className="models-card" key={model.id}>
            <div className="models-card-heading"><ProviderLogo provider={modelIdentity(model)} size="small" /><Link to={`${catalogPath}/${model.id.split('/').map(encodeURIComponent).join('/')}`}>{model.catalog?.name || model.id}</Link></div>
            {model.catalog?.description && <p className="models-description">{model.catalog.description}</p>}
            <div className="models-card-meta"><span>by {modelIdentity(model).name}</span>{model.catalog?.context_length != null && <span>{new Intl.NumberFormat('en', { notation: 'compact' }).format(model.catalog.context_length)} context</span>}{model.catalog?.input_price != null && <span>${Number(model.catalog.input_price) * 1e6}/M input tokens</span>}{model.catalog?.output_price != null && <span>${Number(model.catalog.output_price) * 1e6}/M output tokens</span>}{model.provider && <span>via {model.provider}</span>}<span>{model.public_catalog ? 'Public catalog' : 'Workspace route'}</span><Link to={`${workspacePath}/playground?model=${encodeURIComponent(model.id)}`}>Try in Chat<ArrowUpRight size={13} /></Link></div>
          </article>)}
        </div>}
        {visible.length < filtered.length && <div className="models-load-more"><Button variant="outline" onClick={() => setLimit(value => value + 20)}>Show more models</Button><span>{visible.length} of {filtered.length}</span></div>}
      </section>
    </div>}
    {selected ? <aside className="model-route-detail" aria-label={`${selected.id} route details`}>
      <div className="model-route-detail-heading"><ProviderLogo provider={modelIdentity(selected)} size="small" /><div className="model-route-title"><h1>{selected.catalog?.name || selected.id}</h1>{selected.catalog?.name && selected.catalog.name !== selected.id && <p className="model-developer-label">{selected.id}</p>}</div></div>
      {selected.catalog?.description && <p>{selected.catalog.description}</p>}
      <dl className="model-route-facts">
        {selected.catalog?.input_price != null && <div><dt>Input price</dt><dd>${Number(selected.catalog.input_price) * 1e6} /M tokens</dd></div>}
        {selected.catalog?.output_price != null && <div><dt>Output price</dt><dd>${Number(selected.catalog.output_price) * 1e6} /M tokens</dd></div>}
        {selected.catalog?.context_length != null && <div><dt>Context length</dt><dd>{selected.catalog.context_length.toLocaleString()} tokens</dd></div>}
        {selected.catalog?.max_completion_tokens != null && <div><dt>Maximum output</dt><dd>{selected.catalog.max_completion_tokens.toLocaleString()} tokens</dd></div>}
        {!!selected.catalog?.input_modalities?.length && <div><dt>Input modalities</dt><dd>{selected.catalog.input_modalities.join(', ')}</dd></div>}
        {!!selected.catalog?.output_modalities?.length && <div><dt>Output modalities</dt><dd>{selected.catalog.output_modalities.join(', ')}</dd></div>}

        {selected.provider && <div><dt>Provider</dt><dd>{selected.provider}</dd></div>}
        {selected.upstream_model && selected.upstream_model !== selected.id && <div><dt>Upstream model</dt><dd>{selected.upstream_model}</dd></div>}
      </dl>
      <div className="model-route-cta">
        <Button asChild><Link to={`${workspacePath}/playground?model=${encodeURIComponent(selected.id)}`}>Try in Chat<ArrowUpRight size={15} /></Link></Button>
        <Button asChild variant="outline"><Link to={`${workspacePath}/keys?model=${encodeURIComponent(selected.id)}`}>Create an API key<KeyRound size={15} /></Link></Button>
      </div>
      <div className="model-route-example-heading"><strong>Make your first request</strong><Button type="button" variant="ghost" size="sm" onClick={() => void copyExample()}><Clipboard size={14} />{copied ? <><Check size={14} />Copied</> : 'Copy'}</Button></div>
      {copyError && <p role="alert" className="error-text">{copyError}</p>}
      <pre className="model-route-example"><code>{requestExample(baseUrl, selected.id)}</code></pre>
      <p className="model-route-example-note">Create a workspace API key and set <code>NIU_API_KEY</code> before running this command.</p>
      <Link className="model-activity-link" to={`${workspacePath}/executions?modelAlias=${encodeURIComponent(selected.id)}`}>View requests for this model<ArrowUpRight size={14} /></Link>
    </aside> : selectedId ? <p role="status">This model is no longer available. Return to the catalog to choose another.</p> : null}
  </div>;
}
