import { readLocale as readUILocale } from '@/shell/ui-locale';
import { useLocale as useUILocale } from '@/shell/ui-locale';
import { generationCapability } from '../generation-capabilities';
import '../models.css';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { IconCpu as Boxes } from "@tabler/icons-react";
import { IconArrowLeft as ArrowLeft } from "@tabler/icons-react";
import { IconCheck as Check } from "@tabler/icons-react";
import { IconChevronDown as ChevronDown } from "@tabler/icons-react";
import { IconCopy as Clipboard } from "@tabler/icons-react";
import { IconKey as KeyRound } from "@tabler/icons-react";
import { IconX as X } from "@tabler/icons-react";
import { IconAdjustmentsHorizontal as SlidersHorizontal, IconSearch as Search } from "@tabler/icons-react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { SidebarProvider, Sidebar, SidebarHeader, SidebarContent, SidebarGroup, SidebarGroupContent, useSidebar } from '@/components/ui/sidebar';
import ProviderLogo from '@/components/ProviderLogo';
import { modelIdentity, modelDeveloper, modelProviderName, catalogTitle, disambiguatedCatalogTitle } from '@/lib/providers';
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { capabilityGroups, capabilityValues, emptyCapabilities, matchesCapabilities, modelCapabilityTags, type CapabilityGroup } from '../model-capabilities';
import { Label } from '@/components/ui/label';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from '@/components/ui/empty';
import { QuickKeyDialog, useQuickKeyProvisioner } from '@/features/generations/QuickKeyDialog';
import type { Model } from '@/shell/dashboard-context';

function ModelFilterButton({ activeCount = 0 }: { activeCount?: number }) {
  const { t: uiT } = useUILocale();
  const { isMobile, openMobile, open, toggleSidebar } = useSidebar();
  return (
    <Button
      type="button"
      variant="outline"
      className="shrink-0"
      aria-controls="model-filters"
      aria-expanded={isMobile ? openMobile : open}
      onClick={toggleSidebar}
    >
      <SlidersHorizontal size={15} aria-hidden="true" />
      <span>{uiT("Filters")}</span>
      {activeCount > 0 && <Badge variant="secondary" className="ml-0.5 px-1.5 py-0 text-xs">{activeCount}</Badge>}
    </Button>
  );
}

function ModelFilterCloseButton() {
  const { t: uiT } = useUILocale();
  const { isMobile, toggleSidebar } = useSidebar();
  if (isMobile) return null;
  return (
    <Button type="button" variant="ghost" size="icon-sm" aria-label={uiT("Close filters")} onClick={toggleSidebar}>
      <X size={15} aria-hidden="true" />
    </Button>
  );
}

const MODALITY_LABELS_ZH: Record<string, string> = {
  text: '文本',
  image: '图像',
  file: '文件',
  audio: '音频',
  video: '视频',
  embeddings: '向量嵌入',
};

function formatModalityList(values: string[], isZh: boolean): string {
  return values.map(value => (isZh ? MODALITY_LABELS_ZH[value.toLowerCase()] ?? value : value)).join(isZh ? '、' : ', ');
}
import { useDashboardContext } from '@/shell/dashboard-context';
import { usePlatformCurrency } from '@/shell/platform-currency';
import { useModelPopularity } from '@/shell/useModelPopularity';
import { formatUnitAtoms, money } from '@/lib/money';
import { workspacePathSegment } from '@/shell/workspace-route';



function apiBaseUrl() {
  const base = import.meta.env.BASE_URL.replace(/\/+$/, '');
  return `${window.location.origin}${base}/v1`;
}

function hasChatOutput(model: Model) {
  return generationCapability(model,'chat') === true;
}
function canTryUnverifiedChat(model: Model) {
  return generationCapability(model, 'chat') === null && !isVideoModel(model);
}
function hasGenerationOutput(model: Model) {
  return hasChatOutput(model) || isVideoModel(model);
}
function isVideoModel(model: Model) {
  const cap = generationCapability(model, 'video');
  return cap === true || (cap === null && /(?:^|\/|-)(?:seedance|wan2|kling|veo|sora|vidu|hailuo|luma|runway)(?:$|\/|-|\.)/i.test(model.id));
}
function modelTrialLabels(model: Model, uiT: (en: string, zh?: string) => string) {
  const dual = (hasChatOutput(model) || canTryUnverifiedChat(model)) && isVideoModel(model);
  return {
    chat: dual ? uiT("Try chat") : uiT("Try"),
    video: dual ? uiT("Try video") : uiT("Try"),
  };
}

function requestExample(baseUrl: string, model: Model) {
  const body = isVideoModel(model)
    ? {model:model.id,prompt:'A calm mountain lake at sunrise'}
    : {model:model.id,messages:[{role:'user',content:'Hello'}],max_tokens:64};
  return [
    `curl "${baseUrl}${isVideoModel(model) ? '/video/jobs' : '/chat/completions'}"`,
    '  -H "Authorization: Bearer $NIU_API_KEY"',
    '  -H "Content-Type: application/json"',
    `  -d '${JSON.stringify(body)}'`,
  ].join(` ${String.fromCharCode(92)}\n`);
}

export default function ModelTable(props: { models: Model[]; header?: ReactNode; publicMode?: boolean }) {
  return <SidebarProvider defaultOpen={false} className="min-h-0 min-w-0 w-full"><ModelTableContent {...props} /></SidebarProvider>;
}

function isUncallable(model: Model): boolean {
  return model.callable === false;
}

function readinessIssues(model: Model): string[] {
  return Array.isArray(model.readiness_issues) ? model.readiness_issues : [];
}

function readinessBadgeText(model: Model, uiT: (en: string, zh?: string) => string): string {
  const issues = readinessIssues(model);
  const missingProcurement = issues.includes('procurement_pricing_missing');
  const missingSelling = issues.includes('selling_price_missing');
  if (missingProcurement && missingSelling) return uiT("Purchase rate & selling price missing");
  if (missingSelling) return uiT("Selling price not published");
  if (missingProcurement) return uiT("Purchase rate missing");
  return uiT("Not callable");
}

function readinessDetailText(model: Model, isPlatformAdmin: boolean, uiT: (en: string, zh?: string) => string): string {
  const issues = readinessIssues(model);
  const missingProcurement = issues.includes('procurement_pricing_missing');
  const missingSelling = issues.includes('selling_price_missing');
  if (missingProcurement && missingSelling) {
    return isPlatformAdmin
      ? uiT("This commercial model cannot be invoked yet. Configure the Provider purchase rate and publish a customer selling price before customers can send requests.")
      : uiT("This commercial model cannot be invoked yet because its purchase rate and customer selling price have not been published. Contact your platform administrator.");
  }
  if (missingSelling) {
    return isPlatformAdmin
      ? uiT("This commercial model cannot be invoked yet. Publish a customer selling price in Pricing before customers can send requests.")
      : uiT("This commercial model cannot be invoked yet because its customer selling price has not been published. Contact your platform administrator.");
  }
  if (missingProcurement) {
    return isPlatformAdmin
      ? uiT("This commercial model cannot be invoked yet. Configure an active Provider purchase rate before customers can send requests.")
      : uiT("This commercial model cannot be invoked yet because its Provider purchase rate is not configured. Contact your platform administrator.");
  }
  return isPlatformAdmin
    ? uiT("This commercial model cannot be invoked yet. Complete its Provider and customer pricing setup before sending requests.")
    : uiT("This commercial model cannot be invoked yet. Contact your platform administrator to complete its pricing setup.");
}

function pricingSetupHref(model: Model): string {
  const publish = isVideoModel(model) && !hasChatOutput(model) ? 'media' : 'text';
  return `/admin/pricing?model=${encodeURIComponent(model.id)}&publish=${publish}`;
}

function catalogTier(model: Model): number {
  if (isUncallable(model)) return 4;
  const documented =
    model.public_catalog !== false ||
    model.customer_pricing != null ||
    model.customer_unit_pricing != null ||
    model.catalog != null;
  return documented ? 0 : 1;
}

function ModelTableContent({ models, header, publicMode = false }: { models: Model[]; header?: ReactNode; publicMode?: boolean }) {
  const { t: uiT, format: uiF, isZh } = useUILocale();
  function chooseAuthor(value: string) {
    setAuthorsSelected(current => {
      const nextAuthors = current.includes(value) ? current.filter(id => id !== value) : [...current, value];
      syncCatalogUrl({ authors: nextAuthors });
      return nextAuthors;
    });
    setLimit(20);
  }
  const { token, workspace, workspaces, session, rememberChatKey, reloadWorkspaces } = useDashboardContext();
  const isPlatformAdmin = Boolean(session?.permissions?.platform_admin || (session?.kind === 'installation' && session?.permissions?.manage_operators !== false));
  const canWrite = session?.permissions?.write !== false;
  const needsApiKey = !publicMode && workspace?.active_key_count === 0;
  const navigate = useNavigate();
  const quickKey = useQuickKeyProvisioner();
  const [pendingTry, setPendingTry] = useState<{ model: Model; kind: 'chat' | 'video' } | null>(null);
  const pendingTryTriggerRef = useRef<HTMLElement | null>(null);
  const { billingMode } = usePlatformCurrency();
  const showUnitPricing = (model: Model) => model.customer_unit_pricing != null && (billingMode === 'credits' || model.customer_pricing == null);
  const params = useParams();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const workspaceSegment = workspace
    ? workspacePathSegment(workspace, workspaces ?? [workspace])
    : params.workspace;
  const workspacePath = workspaceSegment ? `/workspaces/${encodeURIComponent(workspaceSegment)}` : '/workspaces/default';
  const ranked = useModelPopularity(models, publicMode ? '' : token, workspace?.organization_id, workspace?.id);
  const popularModels = ranked.models;
  const [query, setQuery] = useState(() => searchParams.get('q') ?? '');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [authorsSelected, setAuthorsSelected] = useState<string[]>(() => searchParams.getAll('dev').filter(Boolean));
  const [providersSelected, setProvidersSelected] = useState<string[]>(() => searchParams.getAll('provider').filter(Boolean));
  const [capabilities, setCapabilities] = useState<Record<CapabilityGroup, string[]>>(() => ({
    input: searchParams.getAll('input').filter(Boolean),
    output: searchParams.getAll('output').filter(Boolean),
    features: searchParams.getAll('cap').filter(Boolean),
  }));
  const hasCapabilities = Object.values(capabilities).some(values => values.length > 0);
  const activeFilterCount =
    authorsSelected.length +
    providersSelected.length +
    Object.values(capabilities).reduce((sum, list) => sum + list.length, 0);
  const [allAuthors, setAllAuthors] = useState(false);
  const [sort, setSort] = useState<'recommended' | 'name' | 'context'>(() => {
    const initial = searchParams.get('sort');
    return initial === 'name' || initial === 'context' ? initial : 'recommended';
  });
  function syncCatalogUrl(overrides: {
    query?: string;
    sort?: string;
    authors?: string[];
    providers?: string[];
    capabilities?: Record<CapabilityGroup, string[]>;
  } = {}) {
    const nextQuery = overrides.query ?? query;
    const nextSort = overrides.sort ?? sort;
    const nextAuthors = overrides.authors ?? authorsSelected;
    const nextProviders = overrides.providers ?? providersSelected;
    const nextCapabilities = overrides.capabilities ?? capabilities;
    const next = new URLSearchParams(location.search);
    next.delete('workspace');
    if (nextQuery.trim()) next.set('q', nextQuery);
    else next.delete('q');
    if (nextSort && nextSort !== 'recommended') next.set('sort', nextSort);
    else next.delete('sort');
    next.delete('input');
    for (const item of nextCapabilities.input) next.append('input', item);
    next.delete('output');
    for (const item of nextCapabilities.output) next.append('output', item);
    next.delete('cap');
    for (const item of nextCapabilities.features) next.append('cap', item);
    next.delete('dev');
    for (const item of nextAuthors) next.append('dev', item);
    next.delete('provider');
    for (const item of nextProviders) next.append('provider', item);
    next.delete('source');
    if (next.toString() !== new URLSearchParams(location.search).toString()) {
      setSearchParams(next, { replace: true });
    }
  }
  function toggleCapability(group: CapabilityGroup, value: string) {
    setCapabilities(current => {
      const nextCapabilities = {
        ...current,
        [group]: current[group].includes(value)
          ? current[group].filter(item => item !== value)
          : [...current[group], value],
      };
      syncCatalogUrl({ capabilities: nextCapabilities });
      return nextCapabilities;
    });
    setLimit(20);
  }
  function clearAllFilters() {
    const cleared = emptyCapabilities();
    setAuthorsSelected([]);
    setProvidersSelected([]);
    setCapabilities(cleared);
    setQuery('');
    setLimit(20);
    syncCatalogUrl({ query: '', authors: [], providers: [], capabilities: cleared });
    searchInputRef.current?.focus();
  }
  const availableCapabilities = capabilityGroups.map(group => ({ ...group, options: group.options.filter(([value]) => models.some(model => capabilityValues(model, group.id).includes(value))) }));
  const providers = [...new Set(models.map(modelProviderName).filter((provider): provider is string => Boolean(provider)))].sort();
  const authors = useMemo(() => [...new Map(models.flatMap(model => { const identity = modelDeveloper(model); return identity ? [[identity.id, identity] as const] : []; })).values()].sort((a, b) => a.name.localeCompare(b.name)), [models]);
  const [limit, setLimit] = useState(20);
  const requestedId = params['*'] || null;
  const selectedId = requestedId && !models.some(model => model.id === requestedId)
    ? requestedId.replace(/\/+$/, '') || requestedId : requestedId;
  const catalogPath = publicMode
    ? '/models'
    : workspaceSegment
      ? `/workspaces/${encodeURIComponent(workspaceSegment)}/models`
      : '/models';
  const catalogSearch = useMemo(() => {
    const sp = new URLSearchParams();
    if (query.trim()) sp.set('q', query);
    if (sort !== 'recommended') sp.set('sort', sort);
    for (const item of capabilities.input) sp.append('input', item);
    for (const item of capabilities.output) sp.append('output', item);
    for (const item of capabilities.features) sp.append('cap', item);
    for (const item of authorsSelected) sp.append('dev', item);
    for (const item of providersSelected) sp.append('provider', item);
    const serialized = sp.toString();
    return serialized ? `?${serialized}` : '';
  }, [query, sort, capabilities, authorsSelected, providersSelected]);
  function generationHref(model: Model, kind: 'chat' | 'video', keyRef?: string) {
    const query = new URLSearchParams({new: kind === 'video' ? 'video' : '1', model: model.id});
    if (!publicMode && workspace) query.set('workspace', workspacePathSegment(workspace, workspaces ?? [workspace]));
    if (keyRef) query.set('key', keyRef);
    const target = `/generations?${query}`;
    return publicMode ? `/login?returnTo=${encodeURIComponent(target)}` : target;
  }
  async function handleQuickCreateAndTry() {
    if (!pendingTry || !token || !workspace) return;
    const created = await quickKey.run({
      token,
      organizationId: workspace.organization_id,
      workspaceId: workspace.id,
      rememberChatKey,
      reloadWorkspaces,
    });
    if (!created) return;
    const target = generationHref(pendingTry.model, pendingTry.kind, created.slug || created.id);
    setPendingTry(null);
    navigate(target);
  }
  const [copyFeedback, setCopyFeedback] = useState<{model:string; error:string; copied:boolean} | null>(null);
  const [modelIdFeedback, setModelIdFeedback] = useState<{model:string; copied:boolean} | null>(null);
  const modelIdCopyRevision = useRef(0);
  const modelIdCopyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copyRevision = useRef(0);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    copyRevision.current += 1;
    modelIdCopyRevision.current += 1;
    setCopyFeedback(null);
    setModelIdFeedback(null);
    return () => {copyRevision.current += 1;modelIdCopyRevision.current += 1;if (copyTimer.current) clearTimeout(copyTimer.current);if (modelIdCopyTimer.current) clearTimeout(modelIdCopyTimer.current);};
  }, [selectedId]);
  const copyError = copyFeedback?.model === selectedId ? copyFeedback.error : '';
  const copied = copyFeedback?.model === selectedId && copyFeedback.copied;

  const filtered = useMemo(() => {
    const value = query.trim().toLowerCase();
    const matches = popularModels.filter(
      model =>
        matchesCapabilities(model, capabilities) &&
        (!authorsSelected.length || authorsSelected.includes(modelDeveloper(model)?.id ?? '')) &&
        (!providersSelected.length || providersSelected.includes(modelProviderName(model) ?? '')) &&
        (!value ||
          `${model.id} ${model.catalog?.name ?? ''} ${model.catalog?.description ?? ''} ${model.provider ?? ''} ${model.upstream_model ?? ''} ${modelIdentity(model).name}`
            .toLowerCase()
            .includes(value)),
    );
    if (sort === 'name') {
      return [...matches].sort((a, b) => (a.catalog?.name || a.id).localeCompare(b.catalog?.name || b.id, 'en', {numeric:true,sensitivity:'base'}) || a.id.localeCompare(b.id));
    }
    if (sort === 'context') {
      return [...matches].sort((a, b) => (b.catalog?.context_length ?? -1) - (a.catalog?.context_length ?? -1) || (a.catalog?.name || a.id).localeCompare(b.catalog?.name || b.id, 'en', {numeric:true,sensitivity:'base'}));
    }
    return [...matches].sort((a, b) => catalogTier(a) - catalogTier(b));
  }, [popularModels, query, authorsSelected, providersSelected, capabilities, sort]);
  const visible = filtered.slice(0, limit);
  const selected = models.find(model => model.id === selectedId) ?? null;
  const showOriginalDescription = Boolean(selected?.catalog?.description) && (isZh ? !/\p{Script=Han}/u.test(selected?.catalog?.description ?? '') : /\p{Script=Han}/u.test(selected?.catalog?.description ?? ''));
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
  }, [selectedId, selected?.catalog?.description, showOriginalDescription]);
  const baseUrl = apiBaseUrl();

  async function copyExample() {
    if (!selected) return;
    const revision=++copyRevision.current;
    if (copyTimer.current) clearTimeout(copyTimer.current);
    setCopyFeedback(null);
    try {
      await navigator.clipboard.writeText(requestExample(baseUrl, selected));
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

  async function copyModelId() {
    if (!selected) return;
    const revision = ++modelIdCopyRevision.current;
    if (modelIdCopyTimer.current) clearTimeout(modelIdCopyTimer.current);
    setModelIdFeedback(null);
    try {
      await navigator.clipboard.writeText(selected.id);
      if (modelIdCopyRevision.current !== revision) return;
      setModelIdFeedback({model:selected.id,copied:true});
      modelIdCopyTimer.current = window.setTimeout(() => {
        if (modelIdCopyRevision.current === revision) setModelIdFeedback(null);
      }, 1600);
    } catch {
      if (modelIdCopyRevision.current !== revision) return;
      setModelIdFeedback({model:selected.id,copied:false});
    }
  }

  if (models.length === 0) return <>{header}<Empty className="models-empty"><EmptyHeader><EmptyMedia variant="icon"><Boxes size={20} /></EmptyMedia><EmptyTitle>{uiT("No model routes yet")}</EmptyTitle><EmptyDescription>{Boolean(session?.permissions?.platform_admin || (session?.kind === 'installation' && session?.permissions?.manage_operators !== false)) ? uiT("Connect a Provider with your API key to import its models.") : workspace ? uiT("No models are enabled for this workspace yet. Ask an administrator to connect a Provider or grant model access to this workspace.") : uiT("Ask a platform administrator to connect a Provider and import its models.")}</EmptyDescription></EmptyHeader>{Boolean(session?.permissions?.platform_admin || (session?.kind === 'installation' && session?.permissions?.manage_operators !== false)) && <EmptyContent><Button asChild><Link to="/admin/providers">{uiT("Connect a provider")}</Link></Button></EmptyContent>}</Empty></>;

  return <div className="models-catalog w-full">
    {selectedId ? null : <div className="models-browse">
      <Sidebar side="right" id="model-filters" className="models-sidebar" mobileClassName="models-sidebar-mobile" mobileContentProps={{ onCloseAutoFocus: event => {
        const toggle = document.querySelector<HTMLButtonElement>('button[aria-controls="model-filters"]');
        if (!toggle) return;
        const focused = document.activeElement;
        if (focused instanceof Element && focused !== document.body && !focused.closest('[data-sidebar="sidebar"]')) return;
        event.preventDefault();
        toggle.focus();
      }, onInteractOutside: event => { const target = event.detail.originalEvent.target; if (target instanceof Element && target.closest('.app-rail, .account-menu, [data-slot="dropdown-menu-sub-content"]')) event.preventDefault(); } }} mobileStyle={{ right: 0, top: 0, bottom: 0, height: '100dvh', width: 'min(288px, 90vw)' }}>
    <SidebarHeader className="sidebar-heading"><div className="sidebar-heading-row"><h2>{uiT("Filters")}</h2><ModelFilterCloseButton /></div></SidebarHeader>
        <SidebarContent><SidebarGroup><SidebarGroupContent>
          <p className="px-3 pt-1 pb-2 text-xs text-muted-foreground">{publicMode ? uiT("Counts reflect models in this public catalog with published metadata.", "计数反映公开目录中带有已发布元数据的模型。") : uiT("Counts reflect all models in this workspace with published metadata.")}</p>
          {availableCapabilities.filter(group => group.options.length > 0).map(group => <Collapsible key={group.id} className="models-filter-group" defaultOpen>
            <CollapsibleTrigger asChild><Button variant="ghost" className="models-filter-trigger">{uiT(group.label)}<ChevronDown size={15} aria-hidden="true" /></Button></CollapsibleTrigger>
            <CollapsibleContent className="models-filter-content" role="region" aria-label={uiF("{0} filters", [uiT(group.label)])}>
              {group.id === 'features' && <p className="text-xs text-muted-foreground mt-2">{uiT("Match all selected capabilities")}</p>}
              <div className="models-filter-options">{group.options.map(([value, label]) => <Label key={value}>
                <Checkbox aria-label={uiT(label)} checked={capabilities[group.id].includes(value)} onCheckedChange={() => toggleCapability(group.id, value)} />
                {uiT(label)}<span>{models.filter(model => capabilityValues(model, group.id).includes(value)).length}</span>
              </Label>)}</div>
            </CollapsibleContent>
          </Collapsible>)}
          <Collapsible className="models-filter-group pt-2 mt-1" defaultOpen><CollapsibleTrigger asChild><Button variant="ghost" className="models-filter-trigger">{uiT("Developer")}<ChevronDown size={15} aria-hidden="true" /></Button></CollapsibleTrigger><CollapsibleContent className="models-filter-content" role="region" aria-label={uiT("Inferred developer filters")}>
          <p className="text-xs text-muted-foreground">{uiT("Inferred from model identifiers; not verified.")}</p><div className="models-filter-options">
            {(allAuthors ? authors : authors.slice(0, 10)).map(identity => <Label key={identity.id}><Checkbox aria-label={identity.name} checked={authorsSelected.includes(identity.id)} onCheckedChange={() => chooseAuthor(identity.id)} />{identity.name}<span>{models.filter(model => modelDeveloper(model)?.id === identity.id).length}</span></Label>)}
          </div>
          {authors.length > 10 && <Button variant="ghost" size="sm" onClick={() => setAllAuthors(value => !value)}>{allAuthors ? uiT("Show fewer") : uiT("Show all developers")}</Button>}
          </CollapsibleContent></Collapsible>
          {providers.length > 0 && <Collapsible className="models-filter-group" defaultOpen><CollapsibleTrigger asChild><Button variant="ghost" className="models-filter-trigger">{uiT("Providers")}<ChevronDown size={15} aria-hidden="true" /></Button></CollapsibleTrigger><CollapsibleContent className="models-filter-content" role="region" aria-label={uiT("Provider filters")}><div className="models-filter-options">
            {providers.map(provider => <Label key={provider}><Checkbox aria-label={provider} checked={providersSelected.includes(provider)} onCheckedChange={() => { setProvidersSelected(current => { const nextProviders = current.includes(provider) ? current.filter(id => id !== provider) : [...current, provider]; syncCatalogUrl({ providers: nextProviders }); return nextProviders; }); setLimit(20); }} />{provider}<span>{models.filter(model => modelProviderName(model) === provider).length}</span></Label>)}
          </div></CollapsibleContent></Collapsible>}
        </SidebarGroupContent></SidebarGroup></SidebarContent>
      </Sidebar>
      <section className="models-results" aria-label={uiT("Model catalog")}>
        {header}
        <div className="models-toolbar">
          <div className="models-search">
            <Search size={16} aria-hidden="true" />
            <Input
              aria-label={uiT("Search models by name or ID")}
              ref={searchInputRef}
              value={query}
              onChange={event => {
                const nextQuery = event.target.value;
                setQuery(nextQuery);
                setLimit(20);
                syncCatalogUrl({ query: nextQuery });
              }}
              placeholder={uiT("Search models by name or ID…")}
            />
          </div>
          <div className="models-toolbar-controls">
            <ModelFilterButton activeCount={activeFilterCount} />
            <div className="models-sort-menu"><DropdownMenu><DropdownMenuTrigger asChild><Button aria-label={uiT("Sort models")} type="button" variant="outline" className="w-full justify-between font-normal">{sort === 'name' ? uiT("Name: A–Z") : sort === 'context' ? uiT("Context length") : uiT("Default order")}<ChevronDown size={16} aria-hidden="true" /></Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[var(--radix-dropdown-menu-trigger-width)]"><DropdownMenuRadioGroup value={sort} onValueChange={nextSort => { const validSort = nextSort === 'name' || nextSort === 'context' ? nextSort : 'recommended'; setSort(validSort); syncCatalogUrl({ sort: validSort }); }}>
                <DropdownMenuRadioItem value="recommended">{uiT("Default order")}</DropdownMenuRadioItem><DropdownMenuRadioItem value="name">{uiT("Name: A–Z")}</DropdownMenuRadioItem><DropdownMenuRadioItem value="context">{uiT("Context length")}</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup></DropdownMenuContent>
            </DropdownMenu></div>
          </div>
        </div>

        {(authorsSelected.length > 0 || providersSelected.length > 0 || hasCapabilities) && <div className="flex flex-wrap gap-2 pt-3" aria-label={uiT("Active model filters")}>
          {capabilityGroups.flatMap(group => group.options.filter(([value]) => capabilities[group.id].includes(value)).map(([value, label]) => <Button key={`${group.id}-${value}`} variant="secondary" size="sm" aria-label={isZh ? uiF("Remove {0} {1} filter", [uiT(label), group.id === 'input' ? '输入' : group.id === 'output' ? '输出' : '能力']) : uiF("Remove {0} {1} filter", [label, group.id])} onClick={() => toggleCapability(group.id, value)}>{group.id === 'features' ? uiT(label) : `${uiT(group.id === 'input' ? 'Input' : 'Output')}: ${uiT(label)}`}<X size={12} aria-hidden="true" /></Button>))}
          {authors.filter(author => authorsSelected.includes(author.id)).map(author => <Button key={author.id} variant="secondary" size="sm" aria-label={uiF("Remove {0} developer filter", [author.name])} onClick={() => chooseAuthor(author.id)}>{uiT("Developer:")}{" "}{author.name}<X size={12} aria-hidden="true" /></Button>)}
          {providersSelected.map(provider => <Button key={provider} variant="secondary" size="sm" aria-label={uiF("Remove {0} provider filter", [provider])} onClick={() => { setProvidersSelected(current => { const nextProviders = current.filter(value => value !== provider); syncCatalogUrl({ providers: nextProviders }); return nextProviders; }); setLimit(20); }}>{uiT("Provider:")}{" "}{provider}<X size={12} aria-hidden="true" /></Button>)}
        </div>}
        <div className="models-results-heading"><span aria-live="polite">{filtered.length.toLocaleString(readUILocale())} {filtered.length === 1 ? uiT("model") : uiT("models")}</span>{filtered.length > 0 && (authorsSelected.length > 0 || providersSelected.length > 0 || hasCapabilities || query) && <Button variant="ghost" size="sm" onClick={clearAllFilters}>{uiT("Clear filters")}</Button>}</div>
        {filtered.length === 0 ? <Empty className="models-empty"><EmptyHeader><EmptyMedia variant="icon"><Search aria-hidden="true"/></EmptyMedia><EmptyTitle>{uiT("No matching models")}</EmptyTitle><EmptyDescription>{uiT("Try another search or remove a filter.")}</EmptyDescription></EmptyHeader>{(authorsSelected.length > 0 || providersSelected.length > 0 || hasCapabilities || query) && <EmptyContent><Button variant="outline" onClick={clearAllFilters}>{uiT("Clear filters")}</Button></EmptyContent>}</Empty> : <div className="models-cards">
          {visible.map(model => {
            const cardTitle = disambiguatedCatalogTitle(model, models);
            const rawDesc = model.catalog?.description;
            const hasHanDesc = /\p{Script=Han}/u.test(rawDesc ?? '');
            const showDesc = Boolean(rawDesc && (isZh ? hasHanDesc : !hasHanDesc));
            const isFreeUnit = showUnitPricing(model) && model.customer_unit_pricing?.prompt_rate === '0' && model.customer_unit_pricing?.completion_rate === '0';
            const isFreeCurrency = !showUnitPricing(model) && model.customer_pricing != null && model.customer_pricing.prompt_rate === '0' && model.customer_pricing.completion_rate === '0';
            const contextText = model.catalog?.context_length != null
              ? `${new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(model.catalog.context_length)} ${uiT("context")}`
              : null;
            const tags = modelCapabilityTags(model);
            const uncallable = isUncallable(model);
            const issues = readinessIssues(model);
            const missingProcurement = issues.includes('procurement_pricing_missing');
            const missingSelling = issues.includes('selling_price_missing');
            const detailHref = `${catalogPath}/${model.id.split('/').map(encodeURIComponent).join('/')}${catalogSearch}`;
            return <article key={model.id} className="models-card">
              <div className="models-card-header">
                <ProviderLogo provider={modelIdentity(model)} size="default" />
                <div className="models-card-identity">
                  <div className="models-card-title-row">
                    <Link className="models-card-title text-foreground hover:underline" title={cardTitle} to={detailHref}>{cardTitle}</Link>
                    {(isFreeUnit || isFreeCurrency) && !uncallable && <Badge variant="secondary" className="models-card-tag shrink-0 font-normal">{uiT("Free")}</Badge>}
                  </div>
                  {tags.length > 0 ? (
                    <div className="models-card-tags" aria-label={uiT("Model capabilities")}>
                      {tags.map(tag => <Badge key={tag} variant="secondary" className="models-card-tag font-normal">{uiT(tag)}</Badge>)}
                    </div>
                  ) : cardTitle !== model.id ? (
                    <span className="models-card-id" title={model.id}>{model.id}</span>
                  ) : null}
                </div>
              </div>

              <div className="models-card-body">
                {showDesc ? (
                  <p className="models-description">{rawDesc}</p>
                ) : tags.length > 0 && cardTitle !== model.id ? (
                  <span className="models-card-id" title={model.id}>{model.id}</span>
                ) : null}
              </div>

              <div className="models-card-footer">
                <div className="models-card-rates">
                  {uncallable ? <span className="text-muted-foreground">{readinessBadgeText(model, uiT)}</span> : model.billing_source === 'own_api_key' ? <span>{uiT("No Niu charge")}</span> : isFreeUnit || isFreeCurrency ? <span>{uiT("Free")}</span> : showUnitPricing(model) ? <><span>{formatUnitAtoms(model.customer_unit_pricing?.prompt_rate ?? '0', model.customer_unit_pricing?.unit_name ?? uiT('credits'), model.customer_unit_pricing?.display_precision ?? 2)}{uiT("/M input tokens")}</span><span>{formatUnitAtoms(model.customer_unit_pricing?.completion_rate ?? '0', model.customer_unit_pricing?.unit_name ?? uiT('credits'), model.customer_unit_pricing?.display_precision ?? 2)}{uiT("/M output tokens")}</span></> : model.customer_pricing != null ? <><span>{money(model.customer_pricing.prompt_rate, model.customer_pricing.currency)}{uiT("/M input tokens")}</span><span>{money(model.customer_pricing.completion_rate, model.customer_pricing.currency)}{uiT("/M output tokens")}</span></> : null}
                  {contextText && <span>{contextText}</span>}
                </div>

                <div className="models-card-meta">
                  {uncallable ? <>
                    <span className="text-muted-foreground">{uiT("Not published")}</span>
                    <div className="models-card-actions">
                      {isPlatformAdmin && missingProcurement && <Link className="text-foreground underline underline-offset-2" to="/admin/providers">{uiT("Complete Provider rate")}</Link>}
                      {isPlatformAdmin && (missingSelling || !missingProcurement) && <Link className="text-foreground underline underline-offset-2" to={pricingSetupHref(model)}>{uiT("Publish selling price")}</Link>}
                    </div>
                  </> : <>
                    {!hasGenerationOutput(model) && !canTryUnverifiedChat(model) ? (
                      <span className="text-muted-foreground">{uiT("Preview not supported")}</span>
                    ) : showDesc && cardTitle !== model.id ? (
                      <span className="models-card-id-inline" title={model.id}>{model.id}</span>
                    ) : <span />}
                    <div className="models-card-actions">
                      {(() => {
                        const trial = modelTrialLabels(model, uiT);
                        return <>
                          {(hasChatOutput(model) || canTryUnverifiedChat(model)) && (needsApiKey
                            ? <Button type="button" variant="link" className="h-auto p-0 text-xs font-medium text-foreground" onClick={event => { pendingTryTriggerRef.current = event.currentTarget; quickKey.setError(''); setPendingTry({ model, kind: 'chat' }); }}>{trial.chat}</Button>
                            : <Link className="text-foreground hover:underline" to={generationHref(model, 'chat')}>{trial.chat}</Link>)}
                          {isVideoModel(model) && (needsApiKey
                            ? <Button type="button" variant="link" className="h-auto p-0 text-xs font-medium text-foreground" onClick={event => { pendingTryTriggerRef.current = event.currentTarget; quickKey.setError(''); setPendingTry({ model, kind: 'video' }); }}>{trial.video}</Button>
                            : <Link className="text-foreground hover:underline" to={generationHref(model, 'video')}>{trial.video}</Link>)}
                        </>;
                      })()}
                    </div>
                  </>}
                </div>
              </div>
            </article>;
          })}
        </div>}
        {visible.length < filtered.length && <div className="models-load-more"><Button variant="outline" onClick={() => setLimit(value => value + 20)}>{uiT("Show more models")}</Button><span>{isZh ? `已显示 ${visible.length} / 共 ${filtered.length} 个` : `${visible.length} ${uiT("of")} ${filtered.length}`}</span></div>}
      </section>
    </div>}
    {selected ? <aside className="model-route-detail" aria-label={uiF("{0} route details", [selected.id])}>
      <Button asChild variant="ghost" size="sm" className="w-fit px-0"><Link to={catalogPath + catalogSearch}><ArrowLeft size={15} />{uiT("All models")}</Link></Button>
      <div className="model-route-detail-heading"><ProviderLogo provider={modelIdentity(selected)} size="small" /><h2 className="min-w-0 break-words text-lg font-semibold">{catalogTitle(selected)}</h2></div>
      <div className="flex min-w-0 flex-wrap items-center gap-2"><code className="min-w-0 break-all text-sm text-muted-foreground">{selected.id}</code><Button type="button" variant="ghost" size="sm" aria-label={uiT("Copy model ID", "复制模型 ID")} onClick={() => void copyModelId()}><Clipboard size={14} aria-hidden="true" />{modelIdFeedback?.model === selected.id && modelIdFeedback.copied ? uiT("Copied") : uiT("Copy")}</Button></div>
      {modelIdFeedback?.model === selected.id && !modelIdFeedback.copied && <p role="alert" className="error-text">{uiT("Clipboard access is unavailable. Select and copy the model ID instead.", "无法访问剪贴板，请选择并复制模型 ID。")}</p>}
      {selected.catalog?.description && (showOriginalDescription ? <Collapsible open={descriptionOpen} onOpenChange={open => setExpandedDescription(open ? selectedId : null)} className="space-y-2">
        <CollapsibleTrigger asChild aria-controls="model-description"><Button ref={descriptionTriggerRef} variant="ghost" size="sm" className="px-0 scroll-mt-24">{descriptionOpen ? uiT('Hide original description', '收起原始说明') : uiT('Show original description', '查看原始说明')}<ChevronDown className={descriptionOpen ? 'rotate-180' : ''} size={14} aria-hidden="true" /></Button></CollapsibleTrigger>
        <CollapsibleContent id="model-description" className="break-words leading-6 [&_p+p]:mt-3 [&_a]:underline [&_a]:underline-offset-2"><ReactMarkdown remarkPlugins={[remarkGfm]} components={{a:({children,href}) => <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>}}>{selected.catalog.description}</ReactMarkdown></CollapsibleContent>
      </Collapsible> : <Collapsible open={descriptionOpen} onOpenChange={open => setExpandedDescription(open ? selectedId : null)} className="space-y-2">
        <div ref={descriptionRef} id="model-description" className={`break-words leading-6 [&_p+p]:mt-3 [&_a]:underline [&_a]:underline-offset-2${descriptionOpen ? '' : ' line-clamp-2'}`}><ReactMarkdown remarkPlugins={[remarkGfm]} components={{a:({children,href}) => <a href={href} tabIndex={descriptionOpen ? undefined : -1} target="_blank" rel="noopener noreferrer">{children}</a>}}>{selected.catalog.description}</ReactMarkdown></div>
        {descriptionOverflow?.model === selectedId && descriptionOverflow.value && <CollapsibleTrigger asChild aria-controls="model-description"><Button ref={descriptionTriggerRef} variant="ghost" size="sm" className="px-0 scroll-mt-24">{descriptionOpen ? uiT("Show less") : uiT("Show more")}<ChevronDown className={descriptionOpen ? 'rotate-180' : ''} size={14} aria-hidden="true" /></Button></CollapsibleTrigger>}
      </Collapsible>)}
      {isUncallable(selected) ? (
        <Alert role="status">
          <AlertDescription className="space-y-1">
            <p className="font-medium text-foreground">{readinessBadgeText(selected, uiT)}</p>
            <p>{readinessDetailText(selected, isPlatformAdmin, uiT)}</p>
          </AlertDescription>
        </Alert>
      ) : (
        <p className="text-sm text-muted-foreground">{selected.billing_source === 'own_api_key'
          ? uiT("No Niu charge")
          : selected.billing_source === 'niu_credits'
            ? isVideoModel(selected) && !hasChatOutput(selected)
              ? uiT("Niu charges, when applicable, use workspace credits. Video cost depends on request settings. Open Video to estimate the cost before submitting; a valid estimate is required to generate.", "适用时，Niu 费用使用工作空间额度结算。视频费用取决于请求设置，请在提交前打开视频估算费用；生成需要有效估算。")
              : uiT("Niu charges, when applicable, use workspace credits. Published prices do not guarantee model access or available supply; these are checked when you submit a request.", "适用时，Niu 费用使用工作空间额度结算。已发布价格不保证模型访问权限或供给可用，提交请求时会检查。")
            : uiT("Billing information is unavailable. Refresh the catalog or ask your administrator to confirm how usage is billed before sending a request.")}</p>
      )}
      <dl className="model-route-facts">
        {selected.billing_source !== 'own_api_key' && (!isVideoModel(selected) || hasChatOutput(selected)) && <><div><dt>{uiT("Input price")}</dt><dd>{showUnitPricing(selected) ? uiF("{0} /M tokens", [formatUnitAtoms(selected.customer_unit_pricing!.prompt_rate, selected.customer_unit_pricing!.unit_name, selected.customer_unit_pricing!.display_precision)]) : selected.customer_pricing != null ? uiF("{0} /M tokens", [money(selected.customer_pricing.prompt_rate, selected.customer_pricing.currency)]) : uiT("Not published")}</dd></div>
        {showUnitPricing(selected) && selected.customer_unit_pricing?.cached_prompt_rate != null ? <div><dt>{uiT("Cache read price")}</dt><dd>{formatUnitAtoms(selected.customer_unit_pricing.cached_prompt_rate, selected.customer_unit_pricing.unit_name, selected.customer_unit_pricing.display_precision)}{" "}{uiT("/M tokens")}</dd></div> : selected.customer_pricing?.cached_prompt_rate != null ? <div><dt>{uiT("Cache read price")}</dt><dd>{money(selected.customer_pricing.cached_prompt_rate, selected.customer_pricing.currency)}{" "}{uiT("/M tokens")}</dd></div> : null}
        <div><dt>{uiT("Output price")}</dt><dd>{showUnitPricing(selected) ? uiF("{0} /M tokens", [formatUnitAtoms(selected.customer_unit_pricing!.completion_rate, selected.customer_unit_pricing!.unit_name, selected.customer_unit_pricing!.display_precision)]) : selected.customer_pricing != null ? uiF("{0} /M tokens", [money(selected.customer_pricing.completion_rate, selected.customer_pricing.currency)]) : uiT("Not published")}</dd></div></>}
        {selected.catalog?.context_length != null && <div><dt>{uiT("Context length")}</dt><dd>{selected.catalog.context_length.toLocaleString(readUILocale())}{" "}{uiT("tokens")}</dd></div>}
        {selected.catalog?.max_completion_tokens != null && <div><dt>{uiT("Maximum output")}</dt><dd>{selected.catalog.max_completion_tokens.toLocaleString(readUILocale())}{" "}{uiT("tokens")}</dd></div>}
        {!!selected.catalog?.input_modalities?.length && <div><dt>{uiT("Input modalities")}</dt><dd>{formatModalityList(selected.catalog.input_modalities, isZh)}</dd></div>}
        {!!capabilityValues(selected,'output').length && <div><dt>{uiT("Output modalities")}</dt><dd>{formatModalityList(capabilityValues(selected,'output'), isZh)}</dd></div>}

        {modelDeveloper(selected) && <div><dt>{uiT("Developer")}</dt><dd>{modelDeveloper(selected)!.name}</dd></div>}
        {modelProviderName(selected) && <div><dt>{uiT("Provider")}</dt><dd>{modelProviderName(selected)}</dd></div>}
        {selected.upstream_model && selected.upstream_model !== selected.id && <div><dt>{uiT("Upstream model")}</dt><dd>{selected.upstream_model}</dd></div>}
      </dl>
      {isUncallable(selected) ? (
        isPlatformAdmin ? <div className="model-route-cta">
          {readinessIssues(selected).includes('procurement_pricing_missing') && <Button asChild variant={readinessIssues(selected).includes('selling_price_missing') ? 'outline' : 'default'}><Link to="/admin/providers">{uiT("Complete Provider rate")}</Link></Button>}
          {(readinessIssues(selected).includes('selling_price_missing') || !readinessIssues(selected).includes('procurement_pricing_missing')) && <Button asChild><Link to={pricingSetupHref(selected)}>{uiT("Publish selling price")}</Link></Button>}
        </div> : null
      ) : <>
        {canTryUnverifiedChat(selected) && Boolean(selected.catalog?.output_modalities?.length) && <p className="text-sm text-muted-foreground">{uiT("Support unverified")}</p>}
        {!hasGenerationOutput(selected) && <p className="text-sm text-muted-foreground">{selected.catalog?.output_modalities?.length ? uiT("This model is not configured for a supported generation preview.") : uiT("Upstream did not declare input or output modalities for this model.", "上游未提供此模型的输入/输出模态说明。")}</p>}
        {needsApiKey && (
          <p className="text-sm text-muted-foreground" role="status">
            {canWrite
              ? uiT("No active API key in this workspace yet. Trying a model lets you auto-create a default Playground key in one click.", "当前工作空间暂无可用 API 密钥，点击试用时可一键自动创建默认「Playground」密钥。")
              : uiT("No active API key in this workspace yet. Ask a workspace administrator to create one before trying models.", "当前工作空间暂无可用 API 密钥，请联系工作空间管理员创建后再试用模型。")}
          </p>
        )}
        <div className="model-route-cta">
          {(() => {
            const trial = modelTrialLabels(selected, uiT);
            return <>
              {(hasChatOutput(selected) || canTryUnverifiedChat(selected)) && (needsApiKey
                ? <Button type="button" onClick={event => { pendingTryTriggerRef.current = event.currentTarget; quickKey.setError(''); setPendingTry({ model: selected, kind: 'chat' }); }}>{trial.chat}</Button>
                : <Button asChild><Link to={generationHref(selected, 'chat')}>{trial.chat}</Link></Button>)}
              {!hasGenerationOutput(selected) && <Button asChild variant={canTryUnverifiedChat(selected) ? 'outline' : 'default'}><a href={`${import.meta.env.BASE_URL}docs/api/explorer/`}>{uiT("View API reference")}</a></Button>}
              {isVideoModel(selected) && (needsApiKey
                ? <Button type="button" variant={hasChatOutput(selected) ? 'outline' : 'default'} onClick={event => { pendingTryTriggerRef.current = event.currentTarget; quickKey.setError(''); setPendingTry({ model: selected, kind: 'video' }); }}>{trial.video}</Button>
                : <Button asChild variant={hasChatOutput(selected) ? 'outline' : 'default'}><Link to={generationHref(selected, 'video')}>{trial.video}</Link></Button>)}
            </>;
          })()}
          {publicMode ? (
            <Button asChild variant="outline"><Link to="/login?returnTo=%2Fworkspaces%2Fdefault%2Fkeys%2Fnew">{uiT("Sign in to get an API key", "登录获取 API 密钥")}<KeyRound size={15} /></Link></Button>
          ) : (
            <Button asChild variant="outline"><Link to={`${workspacePath}/keys/new`}>{uiT("Create an API key")}<KeyRound size={15} /></Link></Button>
          )}
        </div>
        {hasGenerationOutput(selected) && <><div className="model-route-example-heading"><strong>{isVideoModel(selected) ? uiT("Generate a video with this model") : uiT("Run a chat completion with this model")}</strong><Button type="button" variant="ghost" size="sm" onClick={() => void copyExample()}><Clipboard size={14} />{copied ? <><Check size={14} />{uiT("Copied")}</> : uiT("Copy")}</Button></div>
        {copyError && <p role="alert" className="error-text">{uiT(copyError)}</p>}
        <pre className="model-route-example"><code>{requestExample(baseUrl, selected)}</code></pre>
        <p className="model-route-example-note">{uiT("Set")}{" "}<code>NIU_API_KEY</code>{" "}{uiT("and run this request. The selected model ID is already filled in; a successful call generates output and may incur charges.")}</p></>}
      </>}
      {!publicMode && <Link className="model-activity-link" to={`${workspacePath}/executions?modelAlias=${encodeURIComponent(selected.id)}`}>{uiT("View requests for this model")}</Link>}
    </aside> : selectedId ? <Empty className="models-empty"><EmptyHeader><EmptyMedia variant="icon"><Boxes aria-hidden="true"/></EmptyMedia><EmptyTitle>{uiT("Model unavailable")}</EmptyTitle><EmptyDescription>{uiT("This model is no longer in the catalog.")}</EmptyDescription></EmptyHeader><EmptyContent><Button asChild variant="outline"><Link to={catalogPath + catalogSearch}>{uiT("Browse models")}</Link></Button></EmptyContent></Empty> : null}
    <QuickKeyDialog
      open={Boolean(pendingTry)}
      onOpenChange={open => { if (!open) setPendingTry(null); }}
      mode="try"
      canWrite={canWrite}
      workspaceRoot={workspacePath}
      returnTo={pendingTry ? generationHref(pendingTry.model, pendingTry.kind) : undefined}
      busy={quickKey.busy}
      error={quickKey.error}
      onQuickCreate={() => void handleQuickCreateAndTry()}
      triggerRef={pendingTryTriggerRef}
    />
  </div>;
}
