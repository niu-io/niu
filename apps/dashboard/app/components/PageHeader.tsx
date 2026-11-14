import { createContext, useContext, useLayoutEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export const PageHeaderActionsTargetContext = createContext('dashboard-page-actions');

export default function PageHeader({ title, syncRouteTitle, routeTitleKey, action, className }: {
  title: string;
  syncRouteTitle?: boolean;
  routeTitleKey?: string;
  eyebrow?: string;
  action?: ReactNode;
  className?: string;
}) {
  const targetId = useContext(PageHeaderActionsTargetContext);
  const [target, setTarget] = useState<HTMLElement | null>(() =>
    typeof document !== 'undefined' ? document.getElementById(targetId) : null,
  );
  useLayoutEffect(() => { setTarget(document.getElementById(targetId)); }, [targetId]);
  useLayoutEffect(() => {
    if (!syncRouteTitle || !title) return;
    const headerTitle = document.querySelector<HTMLElement>('.dashboard-page-header .dashboard-route-title');
    if (!headerTitle) return;
    // ShellHeader keys this node by pathname, so cleanup cannot overwrite the next route.
    const previous = headerTitle.textContent;
    headerTitle.textContent = title;
    return () => { headerTitle.textContent = previous; };
  }, [routeTitleKey, syncRouteTitle, title]);
  if (!action) return null;
  const actions = <div className={`page-heading-action${className ? ` ${className}` : ''}`}>{action}</div>;
  return target ? createPortal(actions, target) : <div className="page-heading page-actions">{actions}</div>;
}
