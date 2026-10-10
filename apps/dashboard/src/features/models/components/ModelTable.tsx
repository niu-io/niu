import '../models.css';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { IconArrowUpRight as ArrowUpRight } from "@tabler/icons-react";
import { IconCpu as Boxes } from "@tabler/icons-react";
import { IconCheck as Check } from "@tabler/icons-react";
import { IconChevronDown as ChevronDown } from "@tabler/icons-react";
import { IconCopy as Clipboard } from "@tabler/icons-react";
import { IconKey as KeyRound } from "@tabler/icons-react";
import { IconX as X } from "@tabler/icons-react";
import { IconFilter as Search } from "@tabler/icons-react";
import { Link, useParams } from 'react-router';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Sidebar, SidebarHeader, SidebarContent, SidebarGroup, SidebarGroupContent } from '@/components/ui/sidebar';
import ProviderLogo from '@/components/ProviderLogo';
import { modelIdentity } from '@/lib/providers';
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from '@/components/ui/empty';
import type { Model } from '@/app/dashboard-context';
import { useDashboardContext } from '@/app/dashboard-context';
import { useModelPopularity } from '@/app/useModelPopularity';
import { money } from '@/lib/money';
import { workspacePathSegment } from '@/app/workspace-route';



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
  function chooseAuthor(value: string) { setAuthorsSelected(current => current.includes(value) ? current.filter(id => id !== value) : [...current, value]); setLimit(20); }
  const { token, workspace, workspaces, session } = useDashboardContext();
  const workspacePath = workspace ? `/workspaces/${workspacePathSegment(workspace, workspaces)}` : '/workspaces/default';
  const ranked = useModelPopularity(models, token, workspace?.organization_id, workspace?.id);
  const popularModels = ranked.models;
  const [query, setQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [authorsSelected, setAuthorsSelected] = useState<string[]>([]);
  const [providersSelected, setProvidersSelected] = useState<string[]>([]);
  const providers = [...new Set(models.map(model => model.provider).filter((provider): provider is string => Boolean(provider)))].sort();
  const [allAuthors, setAllAuthors] = useState(false);
  const [sort, setSort] = useState('recommended');
  const authors = useMemo(() => [...new Map(models.map(model => { const identity = modelIdentity(model); return [identity.id, identity]; })).values()].sort((a, b) => a.name.localeCompare(b.name)), [models]);
  const [limit, setLimit] = useState(20);
  const params = useParams();
  const selectedId = params['*'] || null;
  const catalogPath = '/models';
  const catalogSearch = `?workspace=${encodeURIComponent(workspacePath.split('/').pop() ?? 'default')}`;
  const chatSearch = new URLSearchParams({ new: '1' });
  if (workspace) chatSearch.set('workspace', workspace.id);
  const [copyFeedback, setCopyFeedback] = useState<{model:string; error:string; copied:boolean} | null>(null);
  const copyRevision = useRef(0);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    copyRevision.current += 1;
    setCopyFeedback(null);
    return () => {copyRevision.current += 1;if (copyTimer.current) clearTimeout(copyTimer.current);};
  }, [selectedId]);
  const copyError = copyFeedback?.model === selectedId ? copyFeedback.error : '';
  const copied = copyFeedback?.model === selectedId && copyFeedback.copied;

  const filtered = useMemo(() => {
    const value = query.trim().toLowerCase();
    const matches = popularModels.filter(model => (!authorsSelected.length || authorsSelected.includes(modelIdentity(model).id)) && (!providersSelected.length || providersSelected.includes(model.provider ?? '')) && (!value || `${model.id} ${model.catalog?.name ?? ''} ${model.catalog?.description ?? ''} ${model.provider ?? ''} ${model.upstream_model ?? ''} ${modelIdentity(model).name}`.toLowerCase().includes(value)));
    return sort === 'name' ? [...matches].sort((a, b) => (a.catalog?.name || a.id).localeCompare(b.catalog?.name || b.id, 'en', {numeric:true,sensitivity:'base'}) || a.id.localeCompare(b.id)) : matches;
  }, [popularModels, query, authorsSelected, providersSelected, sort]);
  const visible = filtered.slice(0, limit);
  const selected = models.find(model => model.id === selectedId) ?? null;
  const descriptionRef = useRef<HTMLDivElement>(null);
  const descriptionTriggerRef = useRef<HTMLButtonElement>(null);
  const previousDescription = useRef<{model:string|null; open:boolean}>({model:null,open:false});
  const [expandedDescription, setExpandedDescription] = useState<string | null>(null);
  const [descriptionOverflow, setDescriptionOverflow] = useState<{model:string; value:boolean} | null>(null);
  const descriptionOpen = expandedDescription === selectedId;
  useLayoutEffect(() => {
    if (previousDescription.current.model === selectedId && previousDescription.current.open && !descriptionOpen) {
      descriptionTriggerRef.current?.scrollIntoView?.({block:'nearest'});
    }
    previousDescription.current = {model:selectedId,open:descriptionOpen};
  }, [descriptionOpen, selectedId]);
  useEffect(() => {
    const element = descriptionRef.current;
    if (!element || !selectedId) return;
    const measure = () => {
      const lineHeight = Number.parseFloat(getComputedStyle(element).lineHeight);
      setDescriptionOverflow({model:selectedId, value:Number.isFinite(lineHeight) && element.scrollHeight > lineHeight * 2 + 1});
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [selectedId, selected?.catalog?.description]);
  const baseUrl = apiBaseUrl();

  async function copyExample() {
    if (!selected) return;
    const revision=++copyRevision.current;
    if (copyTimer.current) clearTimeout(copyTimer.current);
    setCopyFeedback(null);
    try {
      await navigator.clipboard.writeText(requestExample(baseUrl, selected.id));
      if (copyRevision.current !== revision) return;
      setCopyFeedback({model:selected.id,error:'',copied:true});
      copyTimer.current=window.setTimeout(() => {
        if (copyRevision.current===revision) setCopyFeedback(null);
      }, 1600);
    } catch {
      if (copyRevision.current !== revision) return;
      setCopyFeedback({model:selected.id,error:'Select and copy the example below; clipboard access is unavailable.',copied:false});
    }
  }

  if (models.length === 0) return <>{header}<div className="empty-state">
    <div className="empty-icon"><Boxes size={18} /></div>
    <strong>No model routes yet</strong>
    {Boolean((session?.kind === 'installation' || session?.permissions?.platform_admin) && session?.permissions?.manage_operators)
      ? <><span>Connect a supplier and add a model route to the catalog.</span><Button asChild><Link to="/admin/suppliers">Connect a supplier</Link></Button></>
      : <span>Ask a platform administrator to connect a provider and add a model route to the catalog.</span>}
  </div></>;

  return <div className="models-catalog">
    {selectedId ? null : <div className="models-browse">
      <Sidebar id="model-filters" className="niu-workspace-sidebar models-sidebar" mobileClassName="niu-workspace-sidebar-mobile models-sidebar-mobile" mobileContentProps={{ onCloseAutoFocus: event => {
        const toggle = document.querySelector<HTMLButtonElement>('button[aria-controls="model-filters"]');
        if (!toggle) return;
        const focused = document.activeElement;
        if (focused instanceof Element && focused !== document.body && !focused.closest('[data-sidebar="sidebar"]')) return;
        event.preventDefault();
        toggle.focus();
      }, onInteractOutside: event => { const target = event.detail.originalEvent.target; if (target instanceof Element && target.closest('.app-rail, .account-menu, [data-slot="dropdown-menu-sub-content"]')) event.preventDefault(); } }} mobileStyle={{ left: 'var(--rail)', top: 0, bottom: 0, height: '100dvh', width: 'min(var(--context), calc(100vw - var(--rail)))' }}>
        <SidebarHeader className="sidebar-heading"><h2 className="sidebar-heading-row">Filters</h2></SidebarHeader>
        <SidebarContent><SidebarGroup><SidebarGroupContent>
          <Collapsible className="models-filter-group" defaultOpen><CollapsibleTrigger asChild><Button variant="ghost" className="models-filter-trigger">Model developer<ChevronDown size={15} aria-hidden="true" /></Button></CollapsibleTrigger><CollapsibleContent className="models-filter-content">
          <div className="models-filter-options">
            {(allAuthors ? authors : authors.slice(0, 10)).map(identity => <Label key={identity.id}><Checkbox aria-label={identity.name} checked={authorsSelected.includes(identity.id)} onCheckedChange={() => chooseAuthor(identity.id)} />{identity.name}<span>{models.filter(model => modelIdentity(model).id === identity.id).length}</span></Label>)}
          </div>
          {authors.length > 10 && <Button variant="ghost" size="sm" onClick={() => setAllAuthors(value => !value)}>{allAuthors ? 'Show fewer' : 'Show all developers'}</Button>}
          </CollapsibleContent></Collapsible>
          {providers.length > 0 && <Collapsible className="models-filter-group" defaultOpen><CollapsibleTrigger asChild><Button variant="ghost" className="models-filter-trigger">Provider<ChevronDown size={15} aria-hidden="true" /></Button></CollapsibleTrigger><CollapsibleContent className="models-filter-content"><div className="models-filter-options">
            {providers.map(provider => <Label key={provider}><Checkbox aria-label={provider} checked={providersSelected.includes(provider)} onCheckedChange={() => { setProvidersSelected(current => current.includes(provider) ? current.filter(id => id !== provider) : [...current, provider]); setLimit(20); }} />{provider}<span>{models.filter(model => model.provider === provider).length}</span></Label>)}
          </div></CollapsibleContent></Collapsible>}
        </SidebarGroupContent></SidebarGroup></SidebarContent>
      </Sidebar>
      <section className="models-results" aria-label="Model catalog">
        {header}
        <div className="models-toolbar">
          <div className="flex min-w-0 w-full max-w-sm items-center gap-2"><Search size={17} className="shrink-0"/><Input aria-label="Filter model routes" ref={searchInputRef} value={query} onChange={event => { setQuery(event.target.value); setLimit(20); }} placeholder="Filter by model name…" /></div>
          <div className="models-sort-menu"><DropdownMenu><DropdownMenuTrigger asChild><Button aria-label="Sort models" type="button" variant="outline" className="w-full justify-between font-normal">{sort === 'name' ? 'Name: A–Z' : 'Default order'}<ChevronDown size={16} aria-hidden="true" /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[var(--radix-dropdown-menu-trigger-width)]"><DropdownMenuRadioGroup value={sort} onValueChange={setSort}>
              <DropdownMenuRadioItem value="recommended">Default order</DropdownMenuRadioItem><DropdownMenuRadioItem value="name">Name: A–Z</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup></DropdownMenuContent>
          </DropdownMenu></div>
        </div>

        {(authorsSelected.length > 0 || providersSelected.length > 0) && <div className="flex flex-wrap gap-2 px-5" aria-label="Active model filters">
          {authors.filter(author => authorsSelected.includes(author.id)).map(author => <Button key={author.id} variant="secondary" size="sm" aria-label={`Remove ${author.name} developer filter`} onClick={() => chooseAuthor(author.id)}>{author.name}<X size={12} aria-hidden="true" /></Button>)}
          {providersSelected.map(provider => <Button key={provider} variant="secondary" size="sm" aria-label={`Remove ${provider} provider filter`} onClick={() => { setProvidersSelected(current => current.filter(value => value !== provider)); setLimit(20); }}>{provider}<X size={12} aria-hidden="true" /></Button>)}
        </div>}
        <div className="models-results-heading"><span aria-live="polite">{filtered.length.toLocaleString()} {filtered.length === 1 ? 'model' : 'models'}</span>{(authorsSelected.length > 0 || providersSelected.length > 0 || query) && <Button variant="ghost" size="sm" onClick={() => { setAuthorsSelected([]); setProvidersSelected([]); setQuery(''); setLimit(20); searchInputRef.current?.focus(); }}>Clear filters</Button>}</div>
        {filtered.length === 0 ? <Empty className="models-empty"><EmptyHeader><EmptyMedia variant="icon"><Search aria-hidden="true"/></EmptyMedia><EmptyTitle>No matching models</EmptyTitle><EmptyDescription>Try a different name or developer.</EmptyDescription></EmptyHeader></Empty> : <div className="models-cards">
          {visible.map(model => <article className="models-card" key={model.id}>
            <div className="models-card-heading"><ProviderLogo provider={modelIdentity(model)} size="small" /><Link to={`${catalogPath}/${model.id.split('/').map(encodeURIComponent).join('/')}${catalogSearch}`}>{model.catalog?.name || model.id}</Link></div>
            {model.catalog?.description && <p className="models-description">{model.catalog.description}</p>}
            <div className="models-card-meta"><span>by {modelIdentity(model).name}</span>{model.catalog?.context_length != null && <span>{new Intl.NumberFormat('en', { notation: 'compact' }).format(model.catalog.context_length)} context</span>}{model.customer_pricing != null && <span>{money(model.customer_pricing.prompt_rate, model.customer_pricing.currency)}/M input tokens</span>}{model.customer_pricing != null && <span>{money(model.customer_pricing.completion_rate, model.customer_pricing.currency)}/M output tokens</span>}{model.provider && <span>via {model.provider}</span>}<Link to={`/generations?${chatSearch.toString()}${chatSearch.size ? '&' : ''}model=${encodeURIComponent(model.id)}`}>Try in Chat<ArrowUpRight size={13} /></Link></div>
          </article>)}
        </div>}
        {visible.length < filtered.length && <div className="models-load-more"><Button variant="outline" onClick={() => setLimit(value => value + 20)}>Show more models</Button><span>{visible.length} of {filtered.length}</span></div>}
      </section>
    </div>}
    {selected ? <aside className="model-route-detail" aria-label={`${selected.id} route details`}>
      <div className="model-route-detail-heading"><ProviderLogo provider={modelIdentity(selected)} size="small" /><div className="model-route-title"><h2>{selected.catalog?.name || selected.id}</h2>{selected.catalog?.name && selected.catalog.name !== selected.id && <p className="model-developer-label">{selected.id}</p>}</div></div>
      {selected.catalog?.description && <Collapsible open={descriptionOpen} onOpenChange={open => setExpandedDescription(open ? selectedId : null)} className="space-y-2">
        <div ref={descriptionRef} id="model-description" className={`break-words leading-6 [&_p+p]:mt-3 [&_a]:underline [&_a]:underline-offset-2${descriptionOpen ? '' : ' line-clamp-2'}`}><ReactMarkdown remarkPlugins={[remarkGfm]} components={{a:({children,href}) => <a href={href} tabIndex={descriptionOpen ? undefined : -1} target="_blank" rel="noopener noreferrer">{children}</a>}}>{selected.catalog.description}</ReactMarkdown></div>
        {descriptionOverflow?.model === selectedId && descriptionOverflow.value && <CollapsibleTrigger asChild aria-controls="model-description"><Button ref={descriptionTriggerRef} variant="ghost" size="sm" className="px-0 scroll-mt-24">{descriptionOpen ? 'Show less' : 'Show more'}<ChevronDown className={descriptionOpen ? 'rotate-180' : ''} size={14} aria-hidden="true" /></Button></CollapsibleTrigger>}
      </Collapsible>}
      <dl className="model-route-facts">
        <div><dt>Input price</dt><dd>{selected.customer_pricing != null ? `${money(selected.customer_pricing.prompt_rate, selected.customer_pricing.currency)} /M tokens` : 'Not published'}</dd></div>
        <div><dt>Output price</dt><dd>{selected.customer_pricing != null ? `${money(selected.customer_pricing.completion_rate, selected.customer_pricing.currency)} /M tokens` : 'Not published'}</dd></div>
        {selected.catalog?.context_length != null && <div><dt>Context length</dt><dd>{selected.catalog.context_length.toLocaleString()} tokens</dd></div>}
        {selected.catalog?.max_completion_tokens != null && <div><dt>Maximum output</dt><dd>{selected.catalog.max_completion_tokens.toLocaleString()} tokens</dd></div>}
        {!!selected.catalog?.input_modalities?.length && <div><dt>Input modalities</dt><dd>{selected.catalog.input_modalities.join(', ')}</dd></div>}
        {!!selected.catalog?.output_modalities?.length && <div><dt>Output modalities</dt><dd>{selected.catalog.output_modalities.join(', ')}</dd></div>}

        {selected.provider && <div><dt>Provider</dt><dd>{selected.provider}</dd></div>}
        {selected.upstream_model && selected.upstream_model !== selected.id && <div><dt>Upstream model</dt><dd>{selected.upstream_model}</dd></div>}
      </dl>
      <div className="model-route-cta">
        <Button asChild><Link to={`/generations?${chatSearch.toString()}${chatSearch.size ? '&' : ''}model=${encodeURIComponent(selected.id)}`}>Try in Chat<ArrowUpRight size={15} /></Link></Button>
        <Button asChild variant="outline"><Link to={`${workspacePath}/keys/new`}>Create an API key<KeyRound size={15} /></Link></Button>
      </div>
      <div className="model-route-example-heading"><strong>Make your first request</strong><Button type="button" variant="ghost" size="sm" onClick={() => void copyExample()}><Clipboard size={14} />{copied ? <><Check size={14} />Copied</> : 'Copy'}</Button></div>
      {copyError && <p role="alert" className="error-text">{copyError}</p>}
      <pre className="model-route-example"><code>{requestExample(baseUrl, selected.id)}</code></pre>
      <p className="model-route-example-note">Create a workspace API key and set <code>NIU_API_KEY</code> before running this command.</p>
      <Link className="model-activity-link" to={`${workspacePath}/executions?modelAlias=${encodeURIComponent(selected.id)}`}>View requests for this model<ArrowUpRight size={14} /></Link>
    </aside> : selectedId ? <Empty className="models-empty"><EmptyHeader><EmptyMedia variant="icon"><Boxes aria-hidden="true"/></EmptyMedia><EmptyTitle>Model unavailable</EmptyTitle><EmptyDescription>This model is no longer in the catalog.</EmptyDescription></EmptyHeader><EmptyContent><Button asChild variant="outline"><Link to={catalogPath + catalogSearch}>Browse models</Link></Button></EmptyContent></Empty> : null}
  </div>;
}
