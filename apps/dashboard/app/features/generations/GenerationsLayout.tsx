import { ShellNavigation, ShellAccount } from '@/shell/ShellNavigation';
import { useLocale as useUILocale } from '@/shell/ui-locale';
import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useState, useRef, useCallback, type ReactNode, type ComponentProps, type RefObject, type MouseEvent } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { IconPlus, IconArchive, IconLayoutSidebarLeftCollapse, IconLayoutSidebarLeftExpand } from '@tabler/icons-react';
import logo from '../../../../../branding/assets/niu-mark.png';
import { Sidebar, SidebarHeader, SidebarContent, SidebarFooter, useSidebar } from '@/components/ui/sidebar';
import { workspacePathSegment } from '@/shell/workspace-route';
import SessionHistory from './SessionHistory';
import GenerationsContextPanel, { GenerationsContextTrigger, OPEN_CONTEXT_EVENT, type GenerationsContextPanelData, type OpenContextEventDetail } from './GenerationsContextPanel';
import './generations.css';

type Content = { title?: string; actions?: ReactNode; onNewSession?: () => void; onArchive?: (event: MouseEvent<HTMLButtonElement>) => void; notice?: ReactNode; history: ComponentProps<typeof SessionHistory>; extra?: ReactNode; trigger: RefObject<HTMLButtonElement | null>; contextPanel?: GenerationsContextPanelData; sessionKey?: string };
const Host = createContext<((content: Content) => void) | null>(null);

function GenerationsSidebar({ content, toggle }: { content: Content | null; toggle: RefObject<HTMLButtonElement | null> }) {
  const { t: uiT } = useUILocale();
  const navigate = useNavigate();
  const { isMobile, setOpenMobile } = useSidebar();
  const workspace = content?.history.context.workspace;
  const workspaces = content?.history.context.workspaces ?? (workspace ? [workspace] : []);
  const workspaceSegment = workspace ? (!workspace.slug && !workspace.route_slug && workspace.name.length <= 1 ? workspace.id : workspacePathSegment(workspace, workspaces)) : undefined;
  const workspaceQuery = workspaceSegment ? `&workspace=${encodeURIComponent(workspaceSegment)}` : '';
  const [listTarget, setListTarget] = useState<HTMLDivElement | null>(null);
  const scrollNode = useRef<HTMLDivElement | null>(null);
  const scrollTop = useRef(0);
  const attachList = useCallback((node: HTMLDivElement | null) => {
    if (scrollNode.current) scrollTop.current = scrollNode.current.scrollTop;
    scrollNode.current = node?.parentElement as HTMLDivElement | null;
    setListTarget(node);
  }, []);
  useLayoutEffect(() => { if (scrollNode.current) scrollNode.current.scrollTop = scrollTop.current; }, [listTarget]);
  return <><Sidebar id="generation-history" className="niu-workspace-sidebar playground-history generations-history" mobileClassName="niu-workspace-sidebar-mobile generations-history"
    mobileStyle={{ left: 'var(--rail)', top: 0, bottom: 0, height: '100dvh', width: 'min(var(--context), calc(100vw - var(--rail)))' }}
    mobileContentProps={{ onCloseAutoFocus: event => { const trigger = toggle.current; if (trigger?.isConnected) { event.preventDefault(); trigger.focus(); } }, onInteractOutside: event => { const target = event.detail.originalEvent.target; if (target instanceof Element && target.closest('.app-rail, .account-menu, [data-slot="dropdown-menu-sub-content"], [data-slot="popover-content"], [data-slot="dropdown-menu-content"], [data-slot="dialog-content"]')) event.preventDefault(); } }} aria-label={uiT("Generation history")}>
    <ShellNavigation />
    <SidebarHeader className="sidebar-heading generations-history-heading"><h2 className="sidebar-heading-row">{uiT("Generations")}</h2></SidebarHeader>
    <SidebarContent className="playground-history-list" aria-label={uiT("Saved sessions")}>
      <div className="playground-history-controls"><Button variant="outline" className="generations-new-generation" disabled={content?.history.disabled} onClick={() => { content?.onNewSession?.(); const video = Boolean(content?.history.activeVideoSession); navigate(video ? `/generations?new=video${workspaceQuery}` : '/generations?new=1'); if(isMobile)setOpenMobile(false); }}><IconPlus size={16} />{uiT("New generation")}</Button></div>
      {content?.notice}
      <div ref={attachList} style={{ display: 'contents' }} />
      {content?.extra}
    </SidebarContent>
    <SidebarFooter><Button variant="ghost" className="justify-start" onClick={event => { if(content?.onArchive)content.onArchive(event); else navigate(`/generations?archived=1${workspaceQuery}`); if(isMobile)setOpenMobile(false); }}><IconArchive size={15} />{uiT("Archived sessions")}</Button></SidebarFooter>
  <ShellAccount /></Sidebar>
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
  const { t: uiT } = useUILocale();
  const toggle = useRef<HTMLButtonElement>(null);
  const { toggleSidebar, isMobile, openMobile, open } = useSidebar();
  const [content, setContent] = useState<Content | null>(null);
  const [contextOpen, setContextOpen] = useState(false);
  const [contextTab, setContextTab] = useState<'runs' | 'deliverables'>('runs');
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const publish = useMemo(() => (next: Content) => setContent(next), []);
  useLayoutEffect(() => { if(content)content.trigger.current = toggle.current; }, [content]);
  useEffect(() => {
    const onOpenContext = (event: Event) => {
      const detail = (event as CustomEvent<OpenContextEventDetail>).detail;
      setContextOpen(true);
      if (detail?.tab) setContextTab(detail.tab);
      if (detail?.runId) setSelectedRunId(detail.runId);
    };
    window.addEventListener(OPEN_CONTEXT_EVENT, onOpenContext);
    return () => window.removeEventListener(OPEN_CONTEXT_EVENT, onOpenContext);
  }, []);
  useEffect(() => {
    if (content?.contextPanel?.initialRunId) {
      setSelectedRunId(content.contextPanel.initialRunId);
      setContextTab('runs');
      setContextOpen(true);
    }
  }, [content?.contextPanel?.initialRunId]);
  return <Host.Provider value={publish}><div className="generations-layout"><GenerationsSidebar content={content} toggle={toggle} /><div className="generations-session">
    <header className="generations-toolbar"><div className="playground-header-navigation"><Button ref={toggle} variant="ghost" size="icon" className="sidebar-toggle" onClick={toggleSidebar} aria-label={uiT("Toggle generation history")} aria-controls="generation-history" aria-expanded={isMobile ? openMobile : open}>{(isMobile ? openMobile : open) ? <IconLayoutSidebarLeftCollapse /> : <IconLayoutSidebarLeftExpand />}</Button><a className="mobile-header-brand" href={import.meta.env.BASE_URL} aria-label={uiT("Niu home")}><img src={logo} alt="" /></a></div><h1>{content?.title ?? uiT("New generation")}</h1><div className="generations-toolbar-actions">{content?.actions}{content?.contextPanel && <GenerationsContextTrigger panel={content.contextPanel} open={contextOpen} onToggle={() => setContextOpen(current => !current)} />}</div></header>
    <div className="generations-session-content"><div className="generations-session-primary">{children}</div>{content?.contextPanel && <GenerationsContextPanel sessionKey={content.sessionKey} panel={content.contextPanel} open={contextOpen} onOpenChange={setContextOpen} activeTab={contextTab} onTabChange={setContextTab} selectedRunId={selectedRunId} onSelectRun={setSelectedRunId} />}</div>
  </div></div></Host.Provider>;
}
