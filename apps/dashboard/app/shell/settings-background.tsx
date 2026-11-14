import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react';
import { useOutlet, UNSAFE_DataRouterStateContext, UNSAFE_DataRouterDataContext, UNSAFE_DataRouterNavigationContext, UNSAFE_LocationContext } from 'react-router';
import type { DashboardContext } from './dashboard-context';
import type { useRouteMetadata } from './useRouteMetadata';

export const SettingsOriginContext = createContext<{path:string;canGoBack:()=>boolean} | null>(null);

type Metadata = ReturnType<typeof useRouteMetadata>;

/** Keep the originating route mounted beneath global Settings, including its loader data. */
export function useSettingsBackground(meta: Metadata, authority: string, context: DashboardContext, workspacePath: string, canCache: boolean) {
  const outlet = useOutlet(context);
  const locationContext = useContext(UNSAFE_LocationContext);
  const routerState = useContext(UNSAFE_DataRouterStateContext);
  const routerData = useContext(UNSAFE_DataRouterDataContext);
  const routerNavigation = useContext(UNSAFE_DataRouterNavigationContext);
  const identity = JSON.stringify([authority, context.organization?.id, context.workspace?.id]);
  const historyMatches = typeof window !== 'undefined' && (window.history.state?.key ?? 'default') === meta.location.key;
  const historyIndex = historyMatches && typeof window.history.state?.idx === 'number' ? window.history.state.idx as number : null;
  const current = { identity, outlet, locationContext, routerState, routerData, routerNavigation, meta, historyIndex };
  const previous = useRef<typeof current | null>(null);
  useEffect(() => {
    if (previous.current?.identity !== identity) previous.current = null;
    if (canCache && !meta.settingsArea && !meta.loginArea && !meta.inviteArea && authority && historyMatches && routerNavigation?.navigation.state === 'idle') previous.current = current;
    // History can advance before a concurrent route render commits. Do not capture that intermediate pair.
    // Never reuse a route across authority or workspace changes.
  });
  const saved = previous.current?.identity === identity ? previous.current : null;
  const background = meta.settingsArea ? saved : current;
  const shown = background?.meta ?? {
    ...meta, settingsArea: false, activePath: workspacePath, title: context.workspace?.name ?? '',
  };
  const snapshot = background ?? current;
  const renderWith = (route: typeof current, children: ReactNode) => <UNSAFE_LocationContext.Provider value={route.locationContext}>
    <UNSAFE_DataRouterStateContext.Provider value={route.routerState}>
      <UNSAFE_DataRouterDataContext.Provider value={route.routerData}>
        <UNSAFE_DataRouterNavigationContext.Provider value={route.routerNavigation}>{children}</UNSAFE_DataRouterNavigationContext.Provider>
      </UNSAFE_DataRouterDataContext.Provider>
    </UNSAFE_DataRouterStateContext.Provider>
  </UNSAFE_LocationContext.Provider>;
  const wrap = (children: ReactNode) => renderWith(snapshot, children);
  const origin = saved ? {path:saved.meta.location.pathname + saved.meta.location.search + saved.meta.location.hash,canGoBack:()=>saved.historyIndex !== null && window.history.state?.idx === saved.historyIndex + 1} : null;
  const renderModal = (children: ReactNode) => renderWith(current, <SettingsOriginContext.Provider value={origin}>{children}</SettingsOriginContext.Provider>);
  const pendingPath = routerNavigation?.navigation.location?.pathname;
  const openingSettings = !meta.settingsArea && Boolean(pendingPath && (pendingPath === '/settings' || pendingPath.startsWith('/settings/')));
  const pendingSection = openingSettings ? pendingPath?.split('/')[2] : undefined;
  const pendingReturn = meta.settingsArea && !saved && routerNavigation?.navigation.state !== 'idle' && Boolean(routerNavigation?.navigation.location && !routerNavigation.navigation.location.pathname.startsWith('/settings'));
  return { shown, wrap, content: background?.outlet ?? null, hasBackground: Boolean(background), pendingReturn, renderModal, settingsOutlet:outlet, openingSettings, pendingSection };
}
