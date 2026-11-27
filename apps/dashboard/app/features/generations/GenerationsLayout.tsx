import { useLocale as useUILocale } from '@/shell/ui-locale';
import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useState, useRef, useCallback, type CSSProperties, type ReactNode, type ComponentProps, type RefObject, type MouseEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { IconDotsVertical, IconLayoutSidebarRight, IconPlus, IconArchive, IconLayoutSidebarLeftCollapse, IconLayoutSidebarLeftExpand, IconHistory, IconPhoto, IconX } from '@tabler/icons-react';
import { useBranding } from '@/shell/branding';
import { Sidebar, SidebarHeader, SidebarContent, SidebarFooter, SidebarProvider, useSidebar } from '@/components/ui/sidebar';
import { WorkspaceLibrary } from '@/features/library/page';
import { workspaceDisplayName, workspacePathSegment } from '@/shell/workspace-route';
import SessionHistory from './SessionHistory';
import GenerationsContextPanel, { GenerationsContextTrigger, OPEN_CONTEXT_EVENT, type GenerationsContextPanelData, type OpenContextEventDetail } from './GenerationsContextPanel';
import './generations.css';

export const OPEN_ASSETS_EVENT = 'niu:generations-assets-open';

export function openGenerationsAssetsPanel() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(OPEN_ASSETS_EVENT));
}

type Content = { title?: string; actions?: ReactNode; onNewSession?: () => void; onArchive?: (event: MouseEvent<HTMLButtonElement>) => void; notice?: ReactNode; history: ComponentProps<typeof SessionHistory>; extra?: ReactNode; trigger: RefObject<HTMLButtonElement | null>; contextPanel?: GenerationsContextPanelData; sessionKey?: string };
const Host = createContext<((content: Content) => void) | null>(null);

function GenerationsSidebar({ content, toggle }: { content: Content | null; toggle: RefObject<HTMLButtonElement | null> }) {
  const { t: uiT } = useUILocale();
  const navigate = useNavigate();
  const { isMobile, setOpen, setOpenMobile } = useSidebar();
  const workspace = content?.history.context.workspace;
  const workspaces = content?.history.context.workspaces ?? (workspace ? [workspace] : []);
  const workspaceSegment = workspace ? (!workspace.slug && !workspace.route_slug && workspace.name.length <= 1 ? workspace.id : workspacePathSegment(workspace, workspaces)) : undefined;
  const workspaceQuery = workspaceSegment ? `&workspace=${encodeURIComponent(workspaceSegment)}` : '';
  const [listTarget, setListTarget] = useState<HTMLDivElement | null>(null);
  const scrollNode = useRef<HTMLDivElement | null>(null);
  const scrollTop = useRef(0);
  const archiveButton = useRef<HTMLButtonElement>(null);
  const returnToArchive = useRef(false);
  const attachList = useCallback((node: HTMLDivElement | null) => {
    if (scrollNode.current) scrollTop.current = scrollNode.current.scrollTop;
    scrollNode.current = node?.parentElement as HTMLDivElement | null;
    setListTarget(node);
  }, []);
  useLayoutEffect(() => { if (scrollNode.current) scrollNode.current.scrollTop = scrollTop.current; }, [listTarget]);
  return <><Sidebar side="left" id="generation-history" className="playground-history generations-history" mobileClassName="generations-history"
    mobileStyle={{ left: 0, right: 'auto', top: 0, bottom: 0, height: '100dvh', width: 'min(320px, calc(100vw - 24px))' }}
    mobileContentProps={{ onOpenAutoFocus: event => {
      if (returnToArchive.current && archiveButton.current) {
        event.preventDefault();
        returnToArchive.current = false;
        archiveButton.current.focus({preventScroll: true});
      }
    }, onCloseAutoFocus: event => { const trigger = toggle.current; if (trigger?.isConnected) { event.preventDefault(); trigger.focus(); } }, onInteractOutside: event => { const target = event.detail.originalEvent.target; if (target instanceof Element && target.closest('.app-rail, .account-menu, [data-slot="dropdown-menu-sub-content"], [data-slot="popover-content"], [data-slot="dropdown-menu-content"], [data-slot="dialog-content"]')) event.preventDefault(); } }} aria-label={uiT("Generation history")}>
    <SidebarHeader className="sidebar-heading generations-history-heading">
      <h2 className="sidebar-heading-row">{uiT("Generations")}</h2>
      {!isMobile && (
        <Button type="button" variant="ghost" size="icon" className="size-7 shrink-0" aria-label={uiT("Close generation history", "关闭历史会话")} onClick={() => { setOpen(false); toggle.current?.focus(); }}>
          <IconX size={15} />
        </Button>
      )}
    </SidebarHeader>
    <SidebarContent className="playground-history-list" aria-label={uiT("Saved sessions")}>
      <div className="playground-history-controls">
        <Button variant="outline" className="generations-new-generation" disabled={content?.history.disabled} onClick={() => { content?.onNewSession?.(); navigate(`/generations?new=1${workspaceQuery}`); if (isMobile) setOpenMobile(false); }}><IconPlus size={16} />{uiT("New generation")}</Button>
      </div>
      {content?.notice}
      <div ref={attachList} style={{ display: 'contents' }} />
      {content?.extra}
    </SidebarContent>
    <SidebarFooter><Button ref={archiveButton} variant="ghost" className="justify-start" onClick={event => { returnToArchive.current = isMobile; if(content?.onArchive)content.onArchive(event); else navigate(`/generations?archived=1${workspaceQuery}`); if(isMobile)setOpenMobile(false); }}><IconArchive size={15} />{uiT("Archived sessions")}</Button></SidebarFooter>
  </Sidebar>
    {content && <SessionHistory {...content.history} focusFallback={toggle} listTarget={listTarget} key={content.history.context.token} />}
  </>;
}

// The route owns the sidebar; session views only publish its data and actions.
export function GenerationSessionBindings(content: Content) {
  const publish = useContext(Host);
  useLayoutEffect(() => { publish?.(content); });
  if(!publish) throw new Error('Generation sessions require the Generations route layout.');
  return null;
}

export default function GenerationsLayout({ children }: { children: ReactNode }) {
  const navigation = useSidebar();
  return <SidebarProvider
    defaultOpen={false}
    className="generations-provider min-h-0 min-w-0 flex-1"
    style={{ '--sidebar-width': '300px', '--sidebar-width-mobile': '300px' } as CSSProperties}
  ><GenerationsCanvas navigation={navigation}>{children}</GenerationsCanvas></SidebarProvider>;
}

function GenerationsCanvas({ children, navigation }: { children: ReactNode; navigation: ReturnType<typeof useSidebar> }) {
  const { t: uiT } = useUILocale();
  const { logo } = useBranding();
  const toggle = useRef<HTMLButtonElement>(null);
  const { isMobile, openMobile, open, setOpen, setOpenMobile } = useSidebar();
  const [content, setContent] = useState<Content | null>(null);
  const [contextOpen, setContextOpen] = useState(false);
  const [assetsOpen, setAssetsOpen] = useState(false);
  const [contextTab, setContextTab] = useState<'runs' | 'deliverables'>('runs');
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const userToggledHistory = useRef(false);
  const autoOpenedForHistory = useRef(false);
  const publish = useMemo(() => (next: Content) => setContent(next), []);
  useLayoutEffect(() => { if(content)content.trigger.current = toggle.current; }, [content]);

  const savedSessionCount = (content?.history.chats?.length ?? 0) + (content?.history.videos?.length ?? 0);
  useEffect(() => {
    if (isMobile || userToggledHistory.current || autoOpenedForHistory.current) return;
    if (savedSessionCount > 0 && typeof window !== 'undefined' && (window.matchMedia?.('(min-width: 1280px)').matches ?? window.innerWidth >= 1280)) {
      autoOpenedForHistory.current = true;
      setOpen(true);
    }
  }, [isMobile, savedSessionCount, setOpen]);

  const closeHistory = useCallback(() => {
    setOpen(false);
    setOpenMobile(false);
  }, [setOpen, setOpenMobile]);

  const handleToggleHistory = useCallback(() => {
    userToggledHistory.current = true;
    const currentlyOpen = isMobile ? openMobile : open;
    if (!currentlyOpen) {
      setContextOpen(false);
      setAssetsOpen(false);
    }
    if (isMobile) setOpenMobile(!currentlyOpen);
    else setOpen(!currentlyOpen);
  }, [isMobile, openMobile, open, setOpen, setOpenMobile]);

  const handleContextOpenChange = useCallback((nextOpen: boolean) => {
    if (nextOpen) {
      closeHistory();
      setAssetsOpen(false);
    }
    setContextOpen(nextOpen);
  }, [closeHistory]);

  const assetsTrigger = useRef<HTMLButtonElement>(null);
  const actionsTrigger = useRef<HTMLButtonElement>(null);
  const handleAssetsOpenChange = useCallback((nextOpen: boolean) => {
    if (nextOpen) {
      closeHistory();
      setContextOpen(false);
    }
    if (!nextOpen) {
      const trigger = assetsTrigger.current?.getClientRects().length ? assetsTrigger.current : actionsTrigger.current;
      trigger?.focus();
    }
    setAssetsOpen(nextOpen);
  }, [closeHistory]);

  useEffect(() => {
    const onOpenContext = (event: Event) => {
      const detail = (event as CustomEvent<OpenContextEventDetail>).detail;
      closeHistory();
      setAssetsOpen(false);
      setContextOpen(true);
      if (detail?.tab) setContextTab(detail.tab);
      if (detail?.runId) setSelectedRunId(detail.runId);
    };
    const onOpenAssets = () => {
      closeHistory();
      setContextOpen(false);
      setAssetsOpen(true);
    };
    window.addEventListener(OPEN_CONTEXT_EVENT, onOpenContext);
    window.addEventListener(OPEN_ASSETS_EVENT, onOpenAssets);
    return () => {
      window.removeEventListener(OPEN_CONTEXT_EVENT, onOpenContext);
      window.removeEventListener(OPEN_ASSETS_EVENT, onOpenAssets);
    };
  }, [closeHistory]);
  useEffect(() => {
    if (content?.contextPanel?.initialRunId) {
      closeHistory();
      setAssetsOpen(false);
      setSelectedRunId(content.contextPanel.initialRunId);
      setContextTab('runs');
      setContextOpen(true);
    }
  }, [content?.contextPanel?.initialRunId, closeHistory]);

  const workspace = content?.history.context.workspace;
  const token = content?.history.context.token ?? '';
  const session = content?.history.context.session;
  const workspaces = content?.history.context.workspaces ?? (workspace ? [workspace] : []);
  const workspaceSlug = workspace ? workspacePathSegment(workspace, workspaces) : '';
  const workspaceHomePath = workspaceSlug ? `/workspaces/${encodeURIComponent(workspaceSlug)}` : '/workspaces/default';

  const hasContextRuns = Boolean(content?.contextPanel && content.contextPanel.runs.length > 0);

  return <Host.Provider value={publish}><div className="generations-layout"><GenerationsSidebar content={content} toggle={toggle} /><div className="generations-session">
    <header className="generations-toolbar"><div className="generations-toolbar-leading">{navigation.isMobile && <div className="playground-header-navigation"><Button variant="ghost" size="icon" className="sidebar-toggle" onClick={navigation.toggleSidebar} aria-label={uiT("Toggle workspace navigation", "切换工作空间导航")} aria-expanded={navigation.openMobile}>{navigation.openMobile ? <IconLayoutSidebarLeftCollapse /> : <IconLayoutSidebarLeftExpand />}</Button><Link className="mobile-header-brand" to={workspaceHomePath} aria-label={uiT("Niu home")}><img src={logo} alt="" /></Link></div>}<Button ref={toggle} variant={(isMobile ? openMobile : open) ? 'secondary' : 'ghost'} size="sm" className="generations-history-trigger gap-1.5 px-2" title={uiT("Sessions")} onClick={handleToggleHistory} aria-label={uiT("Toggle generation history")} aria-controls="generation-history" aria-expanded={isMobile ? openMobile : open}><IconHistory size={16} /><span>{uiT("Sessions", "会话")}</span></Button></div><div className="generations-identity flex min-w-0 flex-col justify-center gap-0 overflow-hidden sm:flex-row sm:items-center sm:justify-start sm:gap-2"><h1 className="truncate max-sm:text-sm max-sm:leading-tight">{content?.title ?? uiT("New generation")}</h1>{workspace && workspaceSlug && <Link to={`/workspaces/${encodeURIComponent(workspaceSlug)}`} className="inline-flex min-w-0 max-w-full sm:max-w-44 shrink-0 items-center text-[11px] leading-tight text-muted-foreground transition-colors hover:text-foreground sm:rounded-md sm:bg-muted/60 sm:px-2 sm:py-0.5 sm:text-xs sm:hover:bg-muted"><span className="truncate">{workspaceDisplayName(workspace.name)}</span></Link>}</div><div className="generations-toolbar-actions">
      {content?.actions}
      {workspace && token && (
        <Button
          type="button"
          ref={assetsTrigger}
          variant={assetsOpen ? 'secondary' : 'ghost'}
          size="sm"
          className="generations-context-trigger generations-secondary-action"
          onClick={() => handleAssetsOpenChange(!assetsOpen)}
          aria-label={uiT("Toggle assets panel", "切换素材库面板")}
          aria-controls="generations-assets-panel"
          aria-expanded={assetsOpen}
        >
          <IconPhoto size={16} aria-hidden="true" />
          <span>{uiT("Assets", "素材库")}</span>
        </Button>
      )}
      {content?.contextPanel && hasContextRuns && <span className="generations-secondary-action"><GenerationsContextTrigger panel={content.contextPanel} open={contextOpen} onToggle={() => handleContextOpenChange(!contextOpen)} /></span>}
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button ref={actionsTrigger} variant="ghost" size="icon" className="generations-more-actions" aria-label={uiT("Generation actions", "生成操作")}><IconDotsVertical /></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end" collisionPadding={12}>
          {workspace && token && <DropdownMenuItem onSelect={() => handleAssetsOpenChange(!assetsOpen)}><IconPhoto />{uiT("Assets", "素材库")}</DropdownMenuItem>}
          {content?.contextPanel && <DropdownMenuItem onSelect={() => handleContextOpenChange(!contextOpen)}><IconLayoutSidebarRight />{uiT("Context", "上下文")}</DropdownMenuItem>}
        </DropdownMenuContent>
      </DropdownMenu>
    </div></header>
    <div className="generations-session-content"><div className="generations-session-primary">{children}</div>{assetsOpen && workspace && token && (
      <aside
        id="generations-assets-panel"
        className="generations-context-panel"
        aria-label={uiT("Workspace assets", "工作空间素材库")}
      >
        <div className="generations-context-header">
          <div className="min-w-0">
            <h2 className="generations-context-title">{uiT("Assets", "素材库")}</h2>
            <Link
              to={`/workspaces/${encodeURIComponent(workspaceSlug)}/assets`}
              className="mt-1 inline-flex items-center text-xs font-medium text-primary hover:underline"
            >
              {uiT("Manage assets & subjects", "管理素材与主体")}
            </Link>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={uiT("Close assets panel", "关闭素材库面板")}
            onClick={() => handleAssetsOpenChange(false)}
          >
            <IconX size={16} />
          </Button>
        </div>
        <div className="generations-context-body">
          <WorkspaceLibrary
            key={`${token}:${workspace.id}:${session?.permissions.write}`}
            token={token}
            scope={{ organizationId: workspace.organization_id, projectId: workspace.id }}
            canWrite={Boolean(session?.permissions.write)}
            workspaceSlug={workspaceSlug}
            compact
          />
        </div>
      </aside>
    )}{content?.contextPanel && <GenerationsContextPanel sessionKey={content.sessionKey} panel={content.contextPanel} open={contextOpen} onOpenChange={handleContextOpenChange} activeTab={contextTab} onTabChange={setContextTab} selectedRunId={selectedRunId} onSelectRun={setSelectedRunId} />}</div>
  </div></div></Host.Provider>;
}
