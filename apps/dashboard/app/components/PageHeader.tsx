import { useLayoutEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router';

export default function PageHeader({ title, syncRouteTitle, action, className }: {
  title: string;
  syncRouteTitle?: boolean;
  eyebrow?: string;
  action?: ReactNode;
  className?: string;
}) {
  const { pathname } = useLocation();
  const [target, setTarget] = useState<HTMLElement | null>(() =>
    typeof document !== 'undefined' ? document.getElementById('dashboard-page-actions') : null,
  );
  useLayoutEffect(() => { setTarget(document.getElementById('dashboard-page-actions')); }, []);
  useLayoutEffect(() => {
    if (!syncRouteTitle || !title) return;
    const headerTitle = document.querySelector<HTMLElement>('.dashboard-page-header .dashboard-route-title');
    if (!headerTitle) return;
    // ShellHeader keys this node by pathname, so cleanup cannot overwrite the next route.
    const previous = headerTitle.textContent;
    headerTitle.textContent = title;
    return () => { headerTitle.textContent = previous; };
  }, [pathname, syncRouteTitle, title]);
  if (!action) return null;
  const actions = <div className={`page-heading-action${className ? ` ${className}` : ''}`}>{action}</div>;
  return target ? createPortal(actions, target) : <div className="page-heading page-actions">{actions}</div>;
}
