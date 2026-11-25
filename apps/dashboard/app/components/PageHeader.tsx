import { createContext, useContext, useLayoutEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export const PageHeaderActionsTargetContext = createContext('dashboard-page-actions');
export const PageHeaderTabsTargetContext = createContext('dashboard-page-tabs');

export default function PageHeader({ title, syncRouteTitle, routeTitleKey, tabs, action, className }: {
  title: string;
  syncRouteTitle?: boolean;
  routeTitleKey?: string;
  eyebrow?: string;
  tabs?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const actionsTargetId = useContext(PageHeaderActionsTargetContext);
  const tabsTargetId = useContext(PageHeaderTabsTargetContext);
  // Resolve portal hosts only after hydration so the server and first client render
  // agree on the inline fallback; layout effects move controls into the shell before paint.
  const [actionsTarget, setActionsTarget] = useState<HTMLElement | null>(null);
  const [tabsTarget, setTabsTarget] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    setActionsTarget(actionsTargetId ? document.getElementById(actionsTargetId) : null);
    setTabsTarget(tabsTargetId ? document.getElementById(tabsTargetId) : null);
  }, [actionsTargetId, tabsTargetId]);
  useLayoutEffect(() => {
    if (!syncRouteTitle || !title) return;
    const headerTitle = document.querySelector<HTMLElement>('.dashboard-page-header .dashboard-route-title');
    if (!headerTitle) return;
    // ShellHeader keys this node by pathname, so cleanup cannot overwrite the next route.
    const previous = headerTitle.textContent;
    headerTitle.textContent = title;
    return () => { headerTitle.textContent = previous; };
  }, [routeTitleKey, syncRouteTitle, title]);

  const renderedTabs = tabs
    ? tabsTarget
      ? createPortal(<div className="dashboard-header-tabs-slot">{tabs}</div>, tabsTarget)
      : <div className="max-w-full overflow-x-auto overflow-y-hidden">{tabs}</div>
    : null;

  const renderedActions = action
    ? (() => {
        const actions = <div className={`page-heading-action${className ? ` ${className}` : ''}`}>{action}</div>;
        return actionsTarget ? createPortal(actions, actionsTarget) : <div className="page-heading page-actions">{actions}</div>;
      })()
    : null;

  if (!renderedTabs && !renderedActions) return null;
  return (
    <>
      {renderedTabs}
      {renderedActions}
    </>
  );
}
